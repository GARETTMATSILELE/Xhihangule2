import { Request, Response } from 'express';
import { AppError } from '../middleware/errorHandler';
import { hasRole } from '../utils/access';
import { User } from '../models/User';
import { runDatabaseBackup, listBackups } from '../services/backupService';
import { reconcileDuplicates } from '../services/reconciliationService';
import { runPropertyLedgerMaintenance } from '../services/propertyAccountService';
import DatabaseSyncService from '../services/databaseSyncService';
import AdminAuditLog from '../models/AdminAuditLog';
import { Company } from '../models/Company';
import { Subscription } from '../models/Subscription';
import { SubscriptionService } from '../services/subscriptionService';
import { Voucher } from '../models/Voucher';
import { BillingPayment } from '../models/BillingPayment';
import { PLAN_CONFIG, Plan } from '../types/plan';
import crypto from 'crypto';
import mongoose from 'mongoose';

function requireSystemAdmin(req: Request) {
  const roles: string[] = Array.isArray((req.user as any)?.roles) ? (req.user as any).roles : ((req.user as any)?.role ? [(req.user as any).role] : []);
  if (!roles.includes('system_admin')) {
    throw new AppError('System admin required', 403);
  }
}

async function startAudit(req: Request, action: string, payload?: any) {
  try {
    const actorId = String((req.user as any)?.userId || '');
    const actorEmail = String((req.user as any)?.email || '');
    const doc = await AdminAuditLog.create({
      actorId,
      actorEmail,
      action,
      payload,
      success: false,
      startedAt: new Date()
    } as any);
    return doc;
  } catch {
    return null;
  }
}

async function finishAudit(doc: any, success: boolean, result?: any, error?: string) {
  if (!doc) return;
  try {
    const completedAt = new Date();
    const durationMs = doc.startedAt ? (completedAt.getTime() - new Date(doc.startedAt).getTime()) : undefined;
    await AdminAuditLog.updateOne({ _id: doc._id }, { $set: { success, result, error, completedAt, durationMs } });
  } catch {}
}

export const getStatus = async (req: Request, res: Response) => {
  requireSystemAdmin(req);
  res.json({ status: 'ok', time: new Date().toISOString(), user: (req.user as any)?.email || null });
};

export const listSystemAdmins = async (req: Request, res: Response) => {
  requireSystemAdmin(req);
  const docs = await User.find({ $or: [{ role: 'system_admin' }, { roles: 'system_admin' }] }).select('_id email firstName lastName role roles isActive companyId').lean();
  res.json({ data: docs });
};

export const addSystemAdmin = async (req: Request, res: Response) => {
  requireSystemAdmin(req);
  const { email, userId } = req.body || {};
  if (!email && !userId) throw new AppError('email or userId required', 400);
  const audit = await startAudit(req, 'system_admin:add', { email, userId });
  try {
    const query: any = email ? { email } : { _id: userId };
    const user = await User.findOne(query);
    if (!user) throw new AppError('User not found', 404);
    const roles: string[] = Array.isArray((user as any).roles) ? (user as any).roles! : [user.role];
    const newRoles = Array.from(new Set([...(roles || []), 'system_admin']));
    user.roles = newRoles as any;
    if (user.role !== 'admin') {
      user.role = 'admin' as any; // keep admin as primary role for compatibility
    }
    await user.save();
    await finishAudit(audit, true, { userId: user._id });
    res.json({ message: 'User promoted to system_admin', userId: user._id });
  } catch (e: any) {
    await finishAudit(audit, false, undefined, e?.message || String(e));
    throw e;
  }
};

export const removeSystemAdmin = async (req: Request, res: Response) => {
  requireSystemAdmin(req);
  const { id } = req.params;
  const audit = await startAudit(req, 'system_admin:remove', { id });
  try {
    const user = await User.findById(id);
    if (!user) throw new AppError('User not found', 404);
    const roles: string[] = Array.isArray((user as any).roles) ? (user as any).roles! : [user.role];
    const newRoles = roles.filter(r => r !== 'system_admin');
    (user as any).roles = newRoles as any;
    await user.save();
    await finishAudit(audit, true, { userId: user._id });
    res.json({ message: 'system_admin role removed', userId: user._id });
  } catch (e: any) {
    await finishAudit(audit, false, undefined, e?.message || String(e));
    throw e;
  }
};

export const runBackup = async (req: Request, res: Response) => {
  requireSystemAdmin(req);
  const audit = await startAudit(req, 'backup:run', {});
  try {
    const result = await runDatabaseBackup();
    await finishAudit(audit, true, result);
    res.json({ message: 'Backup completed', data: result });
  } catch (e: any) {
    await finishAudit(audit, false, undefined, e?.message || String(e));
    throw new AppError(e?.message || 'Backup failed', 500);
  }
};

export const getBackups = async (req: Request, res: Response) => {
  requireSystemAdmin(req);
  const items = await listBackups(50);
  res.json({ data: items });
};

export const reconcile = async (req: Request, res: Response) => {
  requireSystemAdmin(req);
  const { dryRun } = req.body || {};
  const audit = await startAudit(req, 'maintenance:reconcile', { dryRun: Boolean(dryRun) });
  try {
    const result = await reconcileDuplicates(Boolean(dryRun));
    await finishAudit(audit, true, result);
    res.json({ message: 'Reconcile completed', data: result });
  } catch (e: any) {
    await finishAudit(audit, false, undefined, e?.message || String(e));
    throw new AppError(e?.message || 'Reconcile failed', 500);
  }
};

export const ledgerMaintenance = async (req: Request, res: Response) => {
  requireSystemAdmin(req);
  const { companyId, dryRun } = req.body || {};
  const audit = await startAudit(req, 'maintenance:ledger', { companyId, dryRun: Boolean(dryRun) });
  try {
    const result = await runPropertyLedgerMaintenance({ companyId, dryRun: Boolean(dryRun) });
    await finishAudit(audit, true, result);
    res.json({ message: 'Ledger maintenance completed', data: result });
  } catch (e: any) {
    await finishAudit(audit, false, undefined, e?.message || String(e));
    throw new AppError(e?.message || 'Ledger maintenance failed', 500);
  }
};

export const fullSync = async (req: Request, res: Response) => {
  requireSystemAdmin(req);
  const audit = await startAudit(req, 'sync:full', {});
  try {
    const svc = DatabaseSyncService.getInstance();
    const stats = await svc.performFullSync();
    await finishAudit(audit, true, stats);
    res.json({ message: 'Full sync completed', data: stats });
  } catch (e: any) {
    await finishAudit(audit, false, undefined, e?.message || String(e));
    throw new AppError(e?.message || 'Full sync failed', 500);
  }
};

export const listCompanySubscriptions = async (req: Request, res: Response) => {
  requireSystemAdmin(req);
  // List all companies with their subscription details
  const companies = await Company.find({}).select('_id name email plan subscriptionStatus subscriptionEndDate').lean();
  const subs = await Subscription.find({}).select('companyId plan cycle status currentPeriodEnd nextPaymentAt trialEndDate').lean();
  const subMap = new Map<string, any>();
  for (const s of subs) {
    subMap.set(String(s.companyId), s);
  }
  const data = companies.map((c) => {
    const s = subMap.get(String(c._id));
    return {
      companyId: String(c._id),
      name: c.name,
      email: c.email,
      plan: c.plan,
      subscriptionStatus: c.subscriptionStatus,
      subscriptionEndDate: c.subscriptionEndDate,
      subscription: s ? {
        plan: s.plan,
        cycle: s.cycle,
        status: s.status,
        currentPeriodEnd: s.currentPeriodEnd || s.trialEndDate,
        nextPaymentAt: s.nextPaymentAt
      } : null
    };
  });
  res.json({ data });
};

export const manualRenewSubscription = async (req: Request, res: Response) => {
  requireSystemAdmin(req);
  const { companyId, cycle } = req.body || {};
  if (!companyId) {
    throw new AppError('companyId is required', 400);
  }
  const audit = await startAudit(req, 'subscription:manualRenew', { companyId, cycle });
  try {
    const company = await Company.findById(companyId);
    if (!company) throw new AppError('Company not found', 404);
    const sub = await Subscription.findOne({ companyId });
    if (!sub) throw new AppError('Subscription not found for company', 404);

    const effectiveCycle: 'monthly' | 'yearly' = cycle && (cycle === 'monthly' || cycle === 'yearly') ? cycle : sub.cycle || 'monthly';

    const now = new Date();
    const startingPoint = sub.currentPeriodEnd && sub.currentPeriodEnd > now ? new Date(sub.currentPeriodEnd) : now;
    const newEnd = new Date(startingPoint);
    if (effectiveCycle === 'monthly') {
      newEnd.setMonth(newEnd.getMonth() + 1);
    } else {
      newEnd.setFullYear(newEnd.getFullYear() + 1);
    }

    sub.status = 'active';
    sub.cycle = effectiveCycle;
    sub.currentPeriodStart = startingPoint;
    sub.currentPeriodEnd = newEnd;
    sub.nextPaymentAt = newEnd;
    await sub.save();

    // update company fields for convenience
    company.subscriptionStatus = 'active';
    company.subscriptionEndDate = newEnd;
    await company.save();

    await finishAudit(audit, true, { companyId, newEnd, cycle: effectiveCycle });
    res.json({ message: 'Subscription renewed', data: { companyId, newEnd, cycle: effectiveCycle } });
  } catch (e: any) {
    await finishAudit(audit, false, undefined, e?.message || String(e));
    throw e;
  }
};

/**
 * Create a cash voucher (code + PIN) for a company's subscription payment.
 * Records a BillingPayment (provider=cash, method=voucher, status=paid) and returns the code and PIN.
 */
export const createCashVoucher = async (req: Request, res: Response) => {
  requireSystemAdmin(req);
  const { companyId, plan, cycle, amount, validUntil }: {
    companyId?: string;
    plan?: Plan;
    cycle?: 'monthly' | 'yearly';
    amount?: number;
    validUntil?: string | Date;
  } = req.body || {};

  if (!companyId) throw new AppError('companyId is required', 400);
  if (!plan || !['INDIVIDUAL','SME','ENTERPRISE'].includes(plan)) throw new AppError('Invalid plan', 400);
  if (!cycle || !['monthly','yearly'].includes(cycle)) throw new AppError('Invalid cycle', 400);

  const cfg = PLAN_CONFIG[plan];
  const computedAmount = typeof amount === 'number' ? amount :
    (cfg.pricingUSD ? (cycle === 'monthly' ? cfg.pricingUSD.monthly : cfg.pricingUSD.yearly) : 0);
  if (!computedAmount || computedAmount <= 0) {
    throw new AppError('Plan pricing not configured', 400);
  }

  const code = [
    'CASH',
    Math.random().toString(36).slice(2, 6).toUpperCase(),
    Date.now().toString(36).slice(-4).toUpperCase()
  ].join('-');
  const pin = String(Math.floor(100000 + Math.random() * 900000)); // 6-digit PIN
  const pinHash = crypto.createHash('sha256').update(pin).digest('hex');
  const now = new Date();

  const voucher = await Voucher.create({
    code,
    pinHash,
    plan,
    cycle,
    amount: computedAmount,
    validFrom: now,
    validUntil: validUntil ? new Date(validUntil) : undefined,
    maxRedemptions: 1,
    metadata: { intendedCompanyId: companyId, pin }
  });

  const payment = await BillingPayment.create({
    companyId: new mongoose.Types.ObjectId(companyId),
    plan,
    cycle,
    amount: computedAmount,
    currency: 'USD',
    method: 'voucher',
    provider: 'cash',
    providerRef: code,
    status: 'paid'
  });

  const receiptNumber = `SUBR-${payment._id.toString().slice(-6).toUpperCase()}`;
  res.json({
    message: 'Cash voucher created',
    data: {
      voucherId: voucher._id,
      paymentId: payment._id,
      code,
      pin,
      plan,
      cycle,
      amount: computedAmount,
      receiptNumber
    }
  });
};

/**
 * List cash vouchers (optionally filtered by company).
 */
export const listCashVouchers = async (req: Request, res: Response) => {
  requireSystemAdmin(req);
  const { companyId, limit } = (req.query || {}) as any;
  const q: any = {};
  if (companyId) {
    q.$or = [
      { 'metadata.intendedCompanyId': companyId },
      { redeemedBy: new mongoose.Types.ObjectId(String(companyId)) }
    ];
  }
  const items = await Voucher.find(q).sort({ createdAt: -1 }).limit(Number(limit) || 200).lean();
  res.json({ data: items });
};

/**
 * List subscription billing payments (cash vouchers and others).
 */
export const listSubscriptionBillingPayments = async (req: Request, res: Response) => {
  requireSystemAdmin(req);
  const { companyId, limit, method, provider } = (req.query || {}) as any;
  const q: any = {};
  if (companyId) q.companyId = new mongoose.Types.ObjectId(String(companyId));
  if (method) q.method = String(method);
  if (provider) q.provider = String(provider);
  const items = await BillingPayment.find(q).sort({ createdAt: -1 }).limit(Number(limit) || 200).lean();
  res.json({ data: items });
};

/**
 * Get a simple JSON receipt for a subscription billing payment.
 */
export const getSubscriptionPaymentReceipt = async (req: Request, res: Response) => {
  requireSystemAdmin(req);
  const { id } = req.params;
  const payment = await BillingPayment.findById(id);
  if (!payment) throw new AppError('Payment not found', 404);
  const company = await Company.findById(payment.companyId).select('name email address phone tinNumber registrationNumber');
  const receiptNumber = `SUBR-${payment._id.toString().slice(-6).toUpperCase()}`;
  res.json({
    data: {
      receiptNumber,
      createdAt: payment.createdAt,
      company: {
        id: String(company?._id || ''),
        name: company?.name || '',
        email: company?.email || '',
        address: company?.address || '',
        phone: company?.phone || '',
        registrationNumber: (company as any)?.registrationNumber || '',
        tinNumber: (company as any)?.tinNumber || ''
      },
      plan: payment.plan,
      cycle: payment.cycle,
      amount: payment.amount,
      currency: payment.currency,
      method: payment.method,
      provider: payment.provider,
      reference: payment.providerRef || '',
      subscriptionId: payment.subscriptionId ? String(payment.subscriptionId) : undefined,
      status: payment.status
    }
  });
};


