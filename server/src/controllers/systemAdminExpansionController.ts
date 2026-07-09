import { Request, Response } from 'express';
import mongoose from 'mongoose';
import os from 'os';
import puppeteer from 'puppeteer';
import { AppError } from '../middleware/errorHandler';
import { Company } from '../models/Company';
import { Subscription } from '../models/Subscription';
import { BillingPayment } from '../models/BillingPayment';
import { PaymentSession } from '../models/PaymentSession';
import { Voucher } from '../models/Voucher';
import { AuditLog } from '../models/AuditLog';
import { User } from '../models/User';
import { Property } from '../models/Property';
import { Tenant } from '../models/Tenant';
import { Lease } from '../models/Lease';
import { MaintenanceRequest } from '../models/MaintenanceRequest';
import { Plan } from '../models/Plan';
import { PlatformInvoice } from '../models/PlatformInvoice';
import { CashPayment, CashPaymentMethod } from '../models/CashPayment';
import { SupportTicket } from '../models/SupportTicket';
import { PLAN_CONFIG, Plan as PlanCode } from '../types/plan';
import { activateSubscriptionFromPayment } from '../services/billingActivationService';
import { getEmailConfigStatus, sendMail, verifySmtpConnection } from '../services/emailService';
import { getPlanConfig, seedDefaultPlans } from '../services/systemPlanService';

const PLAN_CODES: PlanCode[] = ['INDIVIDUAL', 'SME', 'ENTERPRISE'];
const CASH_METHODS: CashPaymentMethod[] = ['Cash', 'EcoCash', 'ZIPIT', 'Bank Transfer', 'Innbucks', 'Mukuru'];

function requireSystemAdmin(req: Request) {
  const roles: string[] = Array.isArray((req.user as any)?.roles) ? (req.user as any).roles : ((req.user as any)?.role ? [(req.user as any).role] : []);
  if (!roles.includes('system_admin')) {
    throw new AppError('System admin required', 403);
  }
}

function actorId(req: Request): mongoose.Types.ObjectId | undefined {
  const id = (req.user as any)?.userId;
  return id && mongoose.Types.ObjectId.isValid(String(id)) ? new mongoose.Types.ObjectId(String(id)) : undefined;
}

function asObjectId(id: unknown, label = 'id') {
  if (!mongoose.Types.ObjectId.isValid(String(id || ''))) {
    throw new AppError(`Invalid ${label}`, 400);
  }
  return new mongoose.Types.ObjectId(String(id));
}

function pagination(req: Request) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 25));
  return { page, limit, skip: (page - 1) * limit };
}

function daysFromNow(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function money(value: unknown) {
  return Number(value || 0);
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function audit(req: Request, action: string, entityType: string, entityId?: any, companyId?: any, metadata?: Record<string, any>, status: 'success' | 'failure' = 'success') {
  try {
    await AuditLog.create({
      userId: actorId(req),
      companyId: companyId && mongoose.Types.ObjectId.isValid(String(companyId)) ? new mongoose.Types.ObjectId(String(companyId)) : undefined,
      action,
      entityType,
      entityId: entityId ? String(entityId) : undefined,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      status,
      metadata
    });
  } catch (err) {
    console.warn('[system-admin] audit write failed:', (err as Error)?.message || err);
  }
}

async function companyUsage(companyId: mongoose.Types.ObjectId) {
  const [properties, tenants, leases, users, maintenance] = await Promise.all([
    Property.countDocuments({ companyId }),
    Tenant.countDocuments({ companyId }),
    Lease.countDocuments({ companyId }),
    User.countDocuments({ companyId }),
    MaintenanceRequest.countDocuments({ companyId })
  ]);
  return { properties, tenants, leases, users, maintenance };
}

async function buildInvoicePdfBuffer(invoice: any, company: any): Promise<Buffer> {
  const html = `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(invoice.invoiceNumber)}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 28px; color: #0f172a; }
        .brand { font-size: 24px; font-weight: 700; color: #235347; }
        .muted { color: #64748b; font-size: 12px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 24px 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 24px; }
        th, td { border-bottom: 1px solid #e2e8f0; padding: 10px 6px; text-align: left; }
        .total { text-align: right; margin-top: 20px; font-size: 18px; font-weight: 700; }
      </style>
    </head>
    <body>
      <div class="brand">Mantis Platform Invoice</div>
      <div class="muted">Invoice ${escapeHtml(invoice.invoiceNumber)}</div>
      <div class="grid">
        <div>
          <h3>Bill To</h3>
          <div>${escapeHtml(company?.name || 'Company')}</div>
          <div>${escapeHtml(company?.email || '')}</div>
          <div>${escapeHtml(company?.address || '')}</div>
        </div>
        <div>
          <h3>Invoice Details</h3>
          <div>Status: ${escapeHtml(invoice.status)}</div>
          <div>Issue Date: ${new Date(invoice.issueDate).toLocaleDateString()}</div>
          <div>Due Date: ${new Date(invoice.dueDate).toLocaleDateString()}</div>
        </div>
      </div>
      <table>
        <thead><tr><th>Plan</th><th>Billing Cycle</th><th>Amount</th></tr></thead>
        <tbody>
          <tr>
            <td>${escapeHtml(invoice.plan)}</td>
            <td>${escapeHtml(invoice.billingCycle || '-')}</td>
            <td>${escapeHtml(invoice.currency)} ${Number(invoice.amount || 0).toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
      <div class="total">Total: ${escapeHtml(invoice.currency)} ${Number(invoice.amount || 0).toFixed(2)}</div>
      ${invoice.notes ? `<p>${escapeHtml(invoice.notes)}</p>` : ''}
    </body>
  </html>`;

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '16mm', right: '12mm', bottom: '16mm', left: '12mm' } });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

export const getEnhancedStatus = async (req: Request, res: Response) => {
  requireSystemAdmin(req);
  const email = getEmailConfigStatus();
  const smtp = await verifySmtpConnection();
  const dbState = mongoose.connection.readyState;
  const heap = process.memoryUsage();
  res.json({
    status: dbState === 1 ? 'ok' : 'degraded',
    time: new Date().toISOString(),
    user: (req.user as any)?.email || null,
    version: process.env.npm_package_version || process.env.APP_VERSION || '1.0.0',
    application: {
      frontend: { status: 'ok' },
      backend: { status: 'ok' },
      database: { status: dbState === 1 ? 'ok' : 'degraded', readyState: dbState }
    },
    services: {
      email: { status: email.anyProviderConfigured ? (smtp.verified || !email.smtpConfigured ? 'ok' : 'degraded') : 'degraded', configured: email.anyProviderConfigured },
      storage: { status: process.env.AWS_ACCESS_KEY_ID || process.env.S3_BUCKET ? 'ok' : 'degraded' },
      payment: { status: process.env.PAYNOW_INTEGRATION_ID || process.env.PAYPAL_CLIENT_ID ? 'ok' : 'degraded' },
      backup: { status: 'ok' }
    },
    performance: {
      memoryUsage: heap,
      cpuUsage: process.cpuUsage(),
      databaseConnections: dbState === 1 ? 1 : 0,
      averageResponseTimeMs: null
    },
    uptime: {
      systemUptimeSeconds: os.uptime(),
      processUptimeSeconds: process.uptime(),
      lastDeployment: process.env.LAST_DEPLOYMENT || null,
      version: process.env.npm_package_version || process.env.APP_VERSION || '1.0.0'
    }
  });
};

export const getSystemAdminDashboard = async (req: Request, res: Response) => {
  requireSystemAdmin(req);
  await seedDefaultPlans();
  const now = new Date();
  const monthStart = startOfMonth();
  const in7 = daysFromNow(7);
  const in30 = daysFromNow(30);

  const [
    totalCompanies,
    activeCompanies,
    trialCompanies,
    suspendedCompanies,
    totalProperties,
    totalTenants,
    totalLeases,
    totalMaintenance,
    expiring7,
    expiring30,
    overdue,
    trialEndingSoon,
    cashRevenue,
    onlineRevenue,
    planRows,
    statusRows,
    recentCompanies,
    recentPayments,
    recentTickets,
    openTickets,
    criticalTickets,
    activeSubscriptions
  ] = await Promise.all([
    Company.countDocuments({}),
    Company.countDocuments({ tenantStatus: { $ne: 'suspended' }, subscriptionStatus: { $in: ['active', 'ACTIVE'] } }),
    Company.countDocuments({ subscriptionStatus: { $in: ['trial', 'TRIAL'] } }),
    Company.countDocuments({ $or: [{ tenantStatus: 'suspended' }, { subscriptionStatus: { $in: ['suspended', 'SUSPENDED'] } }] }),
    Property.countDocuments({}),
    Tenant.countDocuments({}),
    Lease.countDocuments({}),
    MaintenanceRequest.countDocuments({}),
    Subscription.countDocuments({ status: { $in: ['active', 'ACTIVE'] }, currentPeriodEnd: { $gte: now, $lte: in7 } }),
    Subscription.countDocuments({ status: { $in: ['active', 'ACTIVE'] }, currentPeriodEnd: { $gte: now, $lte: in30 } }),
    Subscription.countDocuments({ status: { $in: ['past_due', 'expired', 'PAST_DUE', 'EXPIRED'] } }),
    Subscription.countDocuments({ status: { $in: ['trial', 'TRIAL'] }, trialEndDate: { $gte: now, $lte: in7 } }),
    BillingPayment.aggregate([{ $match: { provider: 'cash', status: 'paid', createdAt: { $gte: monthStart } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    BillingPayment.aggregate([{ $match: { provider: { $ne: 'cash' }, status: 'paid', createdAt: { $gte: monthStart } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Company.aggregate([{ $group: { _id: '$plan', count: { $sum: 1 } } }]),
    Subscription.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Company.find({}).sort({ createdAt: -1 }).limit(5).select('name email plan createdAt').lean(),
    BillingPayment.find({ status: 'paid' }).sort({ createdAt: -1 }).limit(5).select('companyId plan amount currency provider method createdAt').lean(),
    SupportTicket.find({}).sort({ createdAt: -1 }).limit(5).select('companyId subject priority status createdAt').lean(),
    SupportTicket.countDocuments({ status: { $in: ['Open', 'In Progress', 'Waiting'] } }),
    SupportTicket.countDocuments({ priority: 'Critical', status: { $nin: ['Resolved', 'Closed'] } }),
    Subscription.find({ status: { $in: ['active', 'ACTIVE', 'trial', 'TRIAL'] } }).select('plan cycle status').lean()
  ]);

  let mrr = 0;
  let expectedRevenue = 0;
  for (const sub of activeSubscriptions) {
    const plan = await getPlanConfig((sub as any).plan || 'INDIVIDUAL');
    const monthly = (sub as any).cycle === 'yearly' ? money(plan.annualPrice) / 12 : money(plan.monthlyPrice);
    mrr += monthly;
    expectedRevenue += (sub as any).cycle === 'yearly' ? money(plan.annualPrice) : money(plan.monthlyPrice);
  }

  const monthlyRevenue = await BillingPayment.aggregate([
    { $match: { status: 'paid', createdAt: { $gte: new Date(now.getFullYear(), now.getMonth() - 11, 1) } } },
    { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, total: { $sum: '$amount' } } },
    { $sort: { '_id.year': 1, '_id.month': 1 } }
  ]);
  const companiesByMonth = await Company.aggregate([
    { $match: { createdAt: { $gte: new Date(now.getFullYear(), now.getMonth() - 11, 1) } } },
    { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, count: { $sum: 1 } } },
    { $sort: { '_id.year': 1, '_id.month': 1 } }
  ]);

  res.json({
    data: {
      kpis: {
        companies: { total: totalCompanies, active: activeCompanies, trial: trialCompanies, suspended: suspendedCompanies },
        revenue: {
          monthlyRecurringRevenue: mrr,
          expectedRevenue,
          cashRevenueThisMonth: cashRevenue[0]?.total || 0,
          onlineRevenueThisMonth: onlineRevenue[0]?.total || 0
        },
        usage: { totalProperties, totalTenants, totalLeases, totalMaintenanceRequests: totalMaintenance },
        subscriptions: { expiringIn7Days: expiring7, expiringIn30Days: expiring30, overdue, trialEndingSoon },
        support: { openTickets, criticalTickets }
      },
      charts: {
        monthlyRevenueTrend: monthlyRevenue.map((r: any) => ({ month: `${r._id.year}-${String(r._id.month).padStart(2, '0')}`, revenue: r.total })),
        newCompaniesPerMonth: companiesByMonth.map((r: any) => ({ month: `${r._id.year}-${String(r._id.month).padStart(2, '0')}`, companies: r.count })),
        planDistribution: planRows.map((r: any) => ({ name: r._id || 'Unassigned', value: r.count })),
        subscriptionStatusDistribution: statusRows.map((r: any) => ({ name: r._id || 'unknown', value: r.count }))
      },
      recentActivity: {
        newCompanyRegistrations: recentCompanies,
        newSubscriptionActivations: recentPayments,
        cashPaymentsApproved: recentPayments.filter((p: any) => p.provider === 'cash'),
        supportTicketsCreated: recentTickets
      }
    }
  });
};

export const listCompanies = async (req: Request, res: Response) => {
  requireSystemAdmin(req);
  const { page, limit, skip } = pagination(req);
  const search = String(req.query.search || '').trim();
  const status = String(req.query.status || '').trim();
  const plan = String(req.query.plan || '').trim();
  const q: any = {};
  if (search) q.$or = [{ name: new RegExp(search, 'i') }, { email: new RegExp(search, 'i') }, { tradingName: new RegExp(search, 'i') }];
  if (status) q.$or = [...(q.$or || []), { tenantStatus: status }, { subscriptionStatus: status }];
  if (plan && PLAN_CODES.includes(plan as PlanCode)) q.plan = plan;

  const [items, total] = await Promise.all([
    Company.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).select('_id name tradingName email plan tenantStatus subscriptionStatus subscriptionEndDate isActive createdAt updatedAt').lean(),
    Company.countDocuments(q)
  ]);
  const ids = items.map((c: any) => c._id);
  const [users, properties, lastLogins] = await Promise.all([
    User.aggregate([{ $match: { companyId: { $in: ids } } }, { $group: { _id: '$companyId', count: { $sum: 1 } } }]),
    Property.aggregate([{ $match: { companyId: { $in: ids } } }, { $group: { _id: '$companyId', count: { $sum: 1 } } }]),
    User.aggregate([{ $match: { companyId: { $in: ids }, lastLogin: { $exists: true } } }, { $group: { _id: '$companyId', lastLogin: { $max: '$lastLogin' } } }])
  ]);
  const userMap = new Map(users.map((r: any) => [String(r._id), r.count]));
  const propMap = new Map(properties.map((r: any) => [String(r._id), r.count]));
  const loginMap = new Map(lastLogins.map((r: any) => [String(r._id), r.lastLogin]));
  res.json({
    data: items.map((c: any) => ({
      companyId: String(c._id),
      name: c.name,
      tradingName: c.tradingName,
      email: c.email,
      plan: c.plan,
      status: c.tenantStatus || c.subscriptionStatus,
      subscriptionStatus: c.subscriptionStatus,
      properties: propMap.get(String(c._id)) || 0,
      users: userMap.get(String(c._id)) || 0,
      lastLogin: loginMap.get(String(c._id)) || null,
      createdAt: c.createdAt
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
};

export const getCompanyProfile = async (req: Request, res: Response) => {
  requireSystemAdmin(req);
  const companyId = asObjectId(req.params.id, 'company id');
  const company = await Company.findById(companyId).lean();
  if (!company) throw new AppError('Company not found', 404);
  const [subscription, usage, financials, cashPayments, onlinePayments, lastProperty, lastTenant, lastLease, lastLogin] = await Promise.all([
    Subscription.findOne({ companyId }).sort({ updatedAt: -1 }).lean(),
    companyUsage(companyId),
    BillingPayment.aggregate([{ $match: { companyId, status: 'paid' } }, { $group: { _id: null, lifetime: { $sum: '$amount' } } }]),
    BillingPayment.aggregate([{ $match: { companyId, provider: 'cash', status: 'paid' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    BillingPayment.aggregate([{ $match: { companyId, provider: { $ne: 'cash' }, status: 'paid' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Property.findOne({ companyId }).sort({ createdAt: -1 }).select('createdAt name').lean(),
    Tenant.findOne({ companyId }).sort({ createdAt: -1 }).select('createdAt firstName lastName').lean(),
    Lease.findOne({ companyId }).sort({ createdAt: -1 }).select('createdAt').lean(),
    User.findOne({ companyId, lastLogin: { $exists: true } }).sort({ lastLogin: -1 }).select('lastLogin email').lean()
  ]);
  const outstanding = await PlatformInvoice.aggregate([{ $match: { companyId, status: { $in: ['Issued', 'Overdue'] } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);

  res.json({
    data: {
      companyDetails: {
        companyId: String((company as any)._id),
        companyName: (company as any).name,
        tradingName: (company as any).tradingName,
        registrationNumber: (company as any).registrationNumber,
        address: (company as any).address,
        phone: (company as any).phone,
        email: (company as any).email,
        country: (company as any).country,
        defaultCurrency: (company as any).defaultCurrency || (company as any).workspacePreferences?.currency || 'USD'
      },
      subscription: subscription ? {
        plan: (subscription as any).plan,
        billingCycle: (subscription as any).cycle,
        status: (subscription as any).status,
        startDate: (subscription as any).currentPeriodStart || (subscription as any).trialStartDate,
        renewalDate: (subscription as any).nextPaymentAt,
        expiryDate: (subscription as any).currentPeriodEnd || (subscription as any).trialEndDate
      } : null,
      usage: { propertyCount: usage.properties, tenantCount: usage.tenants, leaseCount: usage.leases, userCount: usage.users, storageUsed: (company as any).storageUsedBytes || 0 },
      financials: {
        lifetimeRevenue: financials[0]?.lifetime || 0,
        outstandingBalance: outstanding[0]?.total || 0,
        cashPayments: cashPayments[0]?.total || 0,
        onlinePayments: onlinePayments[0]?.total || 0
      },
      activity: {
        lastLogin: (lastLogin as any)?.lastLogin || null,
        lastPropertyAdded: (lastProperty as any)?.createdAt || null,
        lastTenantAdded: (lastTenant as any)?.createdAt || null,
        lastLeaseCreated: (lastLease as any)?.createdAt || null
      }
    }
  });
};

export const updateCompanyProfile = async (req: Request, res: Response) => {
  requireSystemAdmin(req);
  const companyId = asObjectId(req.params.id, 'company id');
  const allowed = ['name', 'tradingName', 'registrationNumber', 'address', 'phone', 'email', 'country', 'defaultCurrency', 'plan'];
  const update: any = {};
  for (const key of allowed) if (req.body?.[key] !== undefined) update[key] = req.body[key];
  const company = await Company.findByIdAndUpdate(companyId, { $set: update }, { new: true });
  if (!company) throw new AppError('Company not found', 404);
  await audit(req, 'Company Updated', 'Company', companyId, companyId, { update });
  res.json({ message: 'Company updated', data: company });
};

export const setCompanyStatus = async (req: Request, res: Response) => {
  requireSystemAdmin(req);
  const companyId = asObjectId(req.params.id, 'company id');
  const action = req.params.action;
  if (!['suspend', 'activate'].includes(action)) throw new AppError('Invalid company action', 400);
  const active = action === 'activate';
  const company = await Company.findByIdAndUpdate(
    companyId,
    { $set: { tenantStatus: active ? 'active' : 'suspended', onboardingStatus: active ? 'ACTIVE' : 'SUSPENDED', subscriptionStatus: active ? 'active' : 'suspended', isActive: active } },
    { new: true }
  );
  if (!company) throw new AppError('Company not found', 404);
  await Subscription.updateMany({ companyId }, active ? { $set: { status: 'active' }, $unset: { suspendedAt: '', suspensionReason: '' } } : { $set: { status: 'suspended', suspendedAt: new Date(), suspensionReason: req.body?.reason || 'System admin action' } });
  await audit(req, active ? 'Company Activated' : 'Company Suspended', 'Company', companyId, companyId, { reason: req.body?.reason });
  res.json({ message: active ? 'Company activated' : 'Company suspended', data: company });
};

export const listCashPayments = async (req: Request, res: Response) => {
  requireSystemAdmin(req);
  const { page, limit, skip } = pagination(req);
  const q: any = {};
  if (req.query.companyId) q.companyId = asObjectId(req.query.companyId, 'company id');
  if (req.query.status) q.status = String(req.query.status);
  if (req.query.method) q.method = String(req.query.method);
  const [items, total] = await Promise.all([
    CashPayment.find(q).sort({ submittedAt: -1 }).skip(skip).limit(limit).populate('companyId', 'name email').lean(),
    CashPayment.countDocuments(q)
  ]);
  res.json({ data: items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
};

export const createCashPayment = async (req: Request, res: Response) => {
  requireSystemAdmin(req);
  const { companyId, amount, currency, method, referenceNumber, proofOfPayment, notes, plan, billingCycle } = req.body || {};
  if (!companyId) throw new AppError('companyId is required', 400);
  if (!PLAN_CODES.includes(plan)) throw new AppError('Valid plan is required', 400);
  if (!CASH_METHODS.includes(method)) throw new AppError('Valid payment method is required', 400);
  const doc = await CashPayment.create({
    companyId: asObjectId(companyId, 'company id'),
    amount: Number(amount || 0),
    currency: currency || 'USD',
    method,
    referenceNumber,
    proofOfPayment,
    status: 'Pending',
    submittedBy: actorId(req),
    submittedAt: new Date(),
    notes,
    plan,
    billingCycle: billingCycle || 'monthly'
  });
  await audit(req, 'Cash Payment Created', 'CashPayment', doc._id, companyId, { amount, method });
  res.status(201).json({ message: 'Cash payment submitted', data: doc });
};

export const reviewCashPayment = async (req: Request, res: Response) => {
  requireSystemAdmin(req);
  const id = asObjectId(req.params.id, 'cash payment id');
  const action = req.params.action;
  const cashPayment = await CashPayment.findById(id);
  if (!cashPayment) throw new AppError('Cash payment not found', 404);

  if (action === 'reject') {
    cashPayment.status = 'Rejected';
    cashPayment.rejectedAt = new Date();
    cashPayment.adminNotes = req.body?.notes;
    await cashPayment.save();
    await audit(req, 'Payment Rejected', 'CashPayment', id, cashPayment.companyId, { notes: req.body?.notes });
    return res.json({ message: 'Cash payment rejected', data: cashPayment });
  }

  if (action === 'request-info') {
    cashPayment.status = 'More Info Requested';
    cashPayment.moreInfoRequestedAt = new Date();
    cashPayment.adminNotes = req.body?.notes;
    await cashPayment.save();
    await audit(req, 'Payment More Info Requested', 'CashPayment', id, cashPayment.companyId, { notes: req.body?.notes });
    return res.json({ message: 'More information requested', data: cashPayment });
  }

  if (action !== 'approve') throw new AppError('Invalid payment review action', 400);

  const plan = await getPlanConfig(cashPayment.plan);
  const providerRef = cashPayment.referenceNumber || `CASH-${cashPayment._id.toString()}`;
  const subscription = await Subscription.findOneAndUpdate(
    { companyId: cashPayment.companyId },
    { $setOnInsert: { companyId: cashPayment.companyId, plan: cashPayment.plan, cycle: cashPayment.billingCycle, status: 'past_due' } },
    { upsert: true, new: true }
  );
  const billingPayment = await BillingPayment.findOneAndUpdate(
    { provider: 'cash', providerRef },
    {
      $setOnInsert: {
        companyId: cashPayment.companyId,
        subscriptionId: subscription._id,
        plan: cashPayment.plan,
        cycle: cashPayment.billingCycle,
        amount: cashPayment.amount,
        currency: cashPayment.currency === 'ZWL' ? 'ZWL' : 'USD',
        method: 'voucher',
        provider: 'cash',
        providerRef,
        status: 'pending'
      }
    },
    { upsert: true, new: true }
  );
  const paymentSession = await PaymentSession.findOneAndUpdate(
    { idempotencyKey: `cash-payment:${cashPayment._id}` },
    {
      $setOnInsert: {
        companyId: cashPayment.companyId,
        subscriptionId: subscription._id,
        billingPaymentId: billingPayment._id,
        idempotencyKey: `cash-payment:${cashPayment._id}`,
        provider: 'cash',
        providerRef,
        plan: cashPayment.plan,
        billingCycle: cashPayment.billingCycle,
        amount: cashPayment.amount,
        currency: cashPayment.currency === 'ZWL' ? 'ZWL' : 'USD',
        status: 'pending',
        metadata: { cashPaymentId: cashPayment._id, method: cashPayment.method }
      }
    },
    { upsert: true, new: true }
  );

  await activateSubscriptionFromPayment({ paymentSessionId: paymentSession._id.toString(), provider: 'cash', providerRef, rawProviderResponse: { cashPaymentId: cashPayment._id }, paidAt: new Date() });
  await Company.findByIdAndUpdate(cashPayment.companyId, {
    $set: {
      plan: cashPayment.plan,
      propertyLimit: plan.propertyLimit,
      featureFlags: plan.featureFlags,
      subscriptionStatus: 'active',
      tenantStatus: 'active',
      isActive: true
    }
  });
  cashPayment.status = 'Approved';
  cashPayment.approvedAt = new Date();
  cashPayment.approvedBy = actorId(req);
  cashPayment.subscriptionId = subscription._id as any;
  cashPayment.billingPaymentId = billingPayment._id as any;
  cashPayment.paymentSessionId = paymentSession._id as any;
  cashPayment.adminNotes = req.body?.notes;
  await cashPayment.save();
  await audit(req, 'Payment Approved', 'CashPayment', id, cashPayment.companyId, { amount: cashPayment.amount, method: cashPayment.method });
  res.json({ message: 'Cash payment approved and subscription activated', data: cashPayment });
};

export const listPlans = async (req: Request, res: Response) => {
  requireSystemAdmin(req);
  await seedDefaultPlans();
  const data = await Plan.find({}).sort({ monthlyPrice: 1 }).lean();
  res.json({ data });
};

export const upsertPlan = async (req: Request, res: Response) => {
  requireSystemAdmin(req);
  const code = String(req.params.code || req.body?.code || '').toUpperCase() as PlanCode;
  if (!PLAN_CODES.includes(code)) throw new AppError('Invalid plan code', 400);
  const body = req.body || {};
  const data = await Plan.findOneAndUpdate(
    { code },
    {
      $set: {
        name: body.name || code,
        description: body.description,
        monthlyPrice: Number(body.monthlyPrice || 0),
        annualPrice: Number(body.annualPrice || 0),
        currency: body.currency || 'USD',
        limits: body.limits || {},
        featureFlags: body.featureFlags || {},
        isActive: body.isActive !== false,
        updatedBy: actorId(req)
      },
      $setOnInsert: { code, createdBy: actorId(req) }
    },
    { upsert: true, new: true }
  );
  await audit(req, 'Plan Updated', 'Plan', data._id, undefined, { code });
  res.json({ message: 'Plan saved', data });
};

export const listPlatformInvoices = async (req: Request, res: Response) => {
  requireSystemAdmin(req);
  const { page, limit, skip } = pagination(req);
  const q: any = {};
  if (req.query.companyId) q.companyId = asObjectId(req.query.companyId, 'company id');
  if (req.query.status) q.status = String(req.query.status);
  const [items, total] = await Promise.all([
    PlatformInvoice.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('companyId', 'name email').lean(),
    PlatformInvoice.countDocuments(q)
  ]);
  res.json({ data: items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
};

export const generatePlatformInvoice = async (req: Request, res: Response) => {
  requireSystemAdmin(req);
  const { companyId, plan, billingCycle, amount, currency, dueDate, status, notes } = req.body || {};
  if (!companyId) throw new AppError('companyId is required', 400);
  if (!PLAN_CODES.includes(plan)) throw new AppError('Valid plan is required', 400);
  const companyObjectId = asObjectId(companyId, 'company id');
  const planConfig = await getPlanConfig(plan);
  const issueDate = new Date();
  const invoice = await PlatformInvoice.create({
    invoiceNumber: `INV-${issueDate.getFullYear()}${String(issueDate.getMonth() + 1).padStart(2, '0')}-${Date.now().toString().slice(-6)}`,
    companyId: companyObjectId,
    plan,
    subscriptionId: (await Subscription.findOne({ companyId: companyObjectId }).select('_id').lean())?._id,
    amount: amount !== undefined ? Number(amount) : (billingCycle === 'yearly' ? planConfig.annualPrice : planConfig.monthlyPrice),
    currency: currency || 'USD',
    issueDate,
    dueDate: dueDate ? new Date(dueDate) : daysFromNow(14),
    status: status || 'Issued',
    billingCycle: billingCycle || 'monthly',
    notes,
    createdBy: actorId(req)
  });
  await audit(req, 'Invoice Generated', 'PlatformInvoice', invoice._id, companyId, { amount: invoice.amount });
  res.status(201).json({ message: 'Invoice generated', data: invoice });
};

export const updatePlatformInvoice = async (req: Request, res: Response) => {
  requireSystemAdmin(req);
  const invoice = await PlatformInvoice.findByIdAndUpdate(asObjectId(req.params.id, 'invoice id'), { $set: { ...req.body, updatedBy: actorId(req) } }, { new: true });
  if (!invoice) throw new AppError('Invoice not found', 404);
  await audit(req, 'Invoice Updated', 'PlatformInvoice', invoice._id, invoice.companyId, { status: invoice.status });
  res.json({ message: 'Invoice updated', data: invoice });
};

export const downloadPlatformInvoicePdf = async (req: Request, res: Response) => {
  requireSystemAdmin(req);
  const invoice = await PlatformInvoice.findById(asObjectId(req.params.id, 'invoice id')).lean();
  if (!invoice) throw new AppError('Invoice not found', 404);
  const company = await Company.findById((invoice as any).companyId).lean();
  const pdf = await buildInvoicePdfBuffer(invoice, company);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${(invoice as any).invoiceNumber}.pdf"`);
  res.send(pdf);
};

export const emailPlatformInvoice = async (req: Request, res: Response) => {
  requireSystemAdmin(req);
  const invoice = await PlatformInvoice.findById(asObjectId(req.params.id, 'invoice id'));
  if (!invoice) throw new AppError('Invoice not found', 404);
  const company = await Company.findById(invoice.companyId).lean();
  const to = req.body?.to || (company as any)?.email;
  if (!to) throw new AppError('Recipient email is required', 400);
  const pdf = await buildInvoicePdfBuffer(invoice.toObject(), company);
  await sendMail({
    to,
    subject: `Invoice ${invoice.invoiceNumber}`,
    html: `<p>Please find invoice <strong>${escapeHtml(invoice.invoiceNumber)}</strong> for ${escapeHtml(invoice.currency)} ${Number(invoice.amount).toFixed(2)}.</p>`,
    text: `Invoice ${invoice.invoiceNumber} for ${invoice.currency} ${Number(invoice.amount).toFixed(2)}.`,
    attachments: [{ filename: `${invoice.invoiceNumber}.pdf`, content: pdf, contentType: 'application/pdf' }] as any
  } as any);
  invoice.sentAt = new Date();
  invoice.sentTo = to;
  await invoice.save();
  await audit(req, 'Invoice Emailed', 'PlatformInvoice', invoice._id, invoice.companyId, { to });
  res.json({ message: 'Invoice emailed', data: invoice });
};

export const listEnhancedVouchers = async (req: Request, res: Response) => {
  requireSystemAdmin(req);
  const { page, limit, skip } = pagination(req);
  const q: any = {};
  if (req.query.companyId) {
    const companyId = String(req.query.companyId);
    q.$or = [{ 'metadata.intendedCompanyId': companyId }, { redeemedBy: asObjectId(companyId, 'company id') }];
  }
  if (req.query.status) q.status = String(req.query.status);
  const [items, total] = await Promise.all([
    Voucher.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Voucher.countDocuments(q)
  ]);
  res.json({ data: items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
};

export const revokeVoucher = async (req: Request, res: Response) => {
  requireSystemAdmin(req);
  const voucher = await Voucher.findById(asObjectId(req.params.id, 'voucher id'));
  if (!voucher) throw new AppError('Voucher not found', 404);
  if (voucher.redeemedAt) throw new AppError('Redeemed vouchers cannot be revoked', 400);
  voucher.status = 'Cancelled';
  voucher.cancelledAt = new Date();
  voucher.cancelledBy = actorId(req);
  (voucher as any).auditHistory = [...((voucher as any).auditHistory || []), { action: 'Revoked', userId: actorId(req), details: { reason: req.body?.reason }, createdAt: new Date() }];
  await voucher.save();
  await audit(req, 'Voucher Revoked', 'Voucher', voucher._id, (voucher as any).metadata?.intendedCompanyId, { code: voucher.code });
  res.json({ message: 'Voucher revoked', data: voucher });
};

export const extendVoucher = async (req: Request, res: Response) => {
  requireSystemAdmin(req);
  const voucher = await Voucher.findById(asObjectId(req.params.id, 'voucher id'));
  if (!voucher) throw new AppError('Voucher not found', 404);
  if (!req.body?.validUntil) throw new AppError('validUntil is required', 400);
  voucher.validUntil = new Date(req.body.validUntil);
  if (voucher.status === 'Expired') voucher.status = 'Unused';
  (voucher as any).auditHistory = [...((voucher as any).auditHistory || []), { action: 'Expiry Extended', userId: actorId(req), details: { validUntil: voucher.validUntil }, createdAt: new Date() }];
  await voucher.save();
  await audit(req, 'Voucher Expiry Extended', 'Voucher', voucher._id, (voucher as any).metadata?.intendedCompanyId, { code: voucher.code, validUntil: voucher.validUntil });
  res.json({ message: 'Voucher expiry extended', data: voucher });
};

export const getVoucherHistory = async (req: Request, res: Response) => {
  requireSystemAdmin(req);
  const voucher = await Voucher.findById(asObjectId(req.params.id, 'voucher id')).select('code auditHistory createdAt redeemedAt redeemedBy metadata status validUntil').lean();
  if (!voucher) throw new AppError('Voucher not found', 404);
  res.json({ data: voucher });
};

export const listAuditLogs = async (req: Request, res: Response) => {
  requireSystemAdmin(req);
  const { page, limit, skip } = pagination(req);
  const q: any = {};
  if (req.query.companyId) q.companyId = asObjectId(req.query.companyId, 'company id');
  if (req.query.userId) q.userId = asObjectId(req.query.userId, 'user id');
  if (req.query.action) q.action = new RegExp(String(req.query.action), 'i');
  if (req.query.from || req.query.to) q.createdAt = {};
  if (req.query.from) q.createdAt.$gte = new Date(String(req.query.from));
  if (req.query.to) q.createdAt.$lte = new Date(String(req.query.to));
  const [items, total] = await Promise.all([
    AuditLog.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('userId', 'email firstName lastName').populate('companyId', 'name email').lean(),
    AuditLog.countDocuments(q)
  ]);
  res.json({ data: items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
};

export const listSupportTickets = async (req: Request, res: Response) => {
  requireSystemAdmin(req);
  const { page, limit, skip } = pagination(req);
  const q: any = {};
  if (req.query.companyId) q.companyId = asObjectId(req.query.companyId, 'company id');
  if (req.query.status) q.status = String(req.query.status);
  if (req.query.priority) q.priority = String(req.query.priority);
  const [items, total] = await Promise.all([
    SupportTicket.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('companyId', 'name email').lean(),
    SupportTicket.countDocuments(q)
  ]);
  res.json({ data: items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
};

export const createSupportTicket = async (req: Request, res: Response) => {
  requireSystemAdmin(req);
  const { companyId, subject, description, priority } = req.body || {};
  if (!companyId || !subject || !description) throw new AppError('companyId, subject and description are required', 400);
  const ticket = await SupportTicket.create({ companyId: asObjectId(companyId, 'company id'), subject, description, priority: priority || 'Medium', status: 'Open', createdBy: actorId(req), lastActivityAt: new Date() });
  await audit(req, 'Support Ticket Created', 'SupportTicket', ticket._id, companyId, { priority: ticket.priority });
  res.status(201).json({ message: 'Support ticket created', data: ticket });
};

export const updateSupportTicket = async (req: Request, res: Response) => {
  requireSystemAdmin(req);
  const update: any = { ...req.body, lastActivityAt: new Date() };
  if (update.status === 'Resolved') update.resolvedAt = new Date();
  if (update.status === 'Closed') update.closedAt = new Date();
  const ticket = await SupportTicket.findByIdAndUpdate(asObjectId(req.params.id, 'ticket id'), { $set: update }, { new: true });
  if (!ticket) throw new AppError('Support ticket not found', 404);
  await audit(req, 'Support Ticket Updated', 'SupportTicket', ticket._id, ticket.companyId, { status: ticket.status, priority: ticket.priority });
  res.json({ message: 'Support ticket updated', data: ticket });
};

export const getRevenueAnalytics = async (req: Request, res: Response) => {
  requireSystemAdmin(req);
  const monthStart = startOfMonth();
  const paid = await BillingPayment.find({ status: 'paid' }).select('companyId plan amount provider createdAt').lean();
  const invoices = await PlatformInvoice.find({ status: { $in: ['Issued', 'Overdue'] } }).select('amount').lean();
  const activeSubs = await Subscription.find({ status: { $in: ['active', 'ACTIVE'] } }).select('plan cycle').lean();
  let mrr = 0;
  for (const sub of activeSubs) {
    const cfg = await getPlanConfig((sub as any).plan || 'INDIVIDUAL');
    mrr += (sub as any).cycle === 'yearly' ? money(cfg.annualPrice) / 12 : money(cfg.monthlyPrice);
  }
  const byMonth = new Map<string, number>();
  const byPlan = new Map<string, number>();
  const byCompany = new Map<string, number>();
  let cashRevenue = 0;
  let onlineRevenue = 0;
  for (const p of paid as any[]) {
    const d = new Date(p.createdAt);
    byMonth.set(monthKey(d), (byMonth.get(monthKey(d)) || 0) + money(p.amount));
    byPlan.set(p.plan || 'Unknown', (byPlan.get(p.plan || 'Unknown') || 0) + money(p.amount));
    byCompany.set(String(p.companyId), (byCompany.get(String(p.companyId)) || 0) + money(p.amount));
    if (new Date(p.createdAt) >= monthStart) {
      if (p.provider === 'cash') cashRevenue += money(p.amount);
      else onlineRevenue += money(p.amount);
    }
  }
  const topCompanies = Array.from(byCompany.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const companies = await Company.find({ _id: { $in: topCompanies.map(([id]) => asObjectId(id, 'company id')) } }).select('name').lean();
  const companyName = new Map(companies.map((c: any) => [String(c._id), c.name]));
  res.json({
    data: {
      metrics: {
        mrr,
        arr: mrr * 12,
        cashRevenue,
        onlineRevenue,
        outstandingRevenue: invoices.reduce((sum, i: any) => sum + money(i.amount), 0)
      },
      charts: {
        revenueByMonth: Array.from(byMonth.entries()).map(([month, revenue]) => ({ month, revenue })).sort((a, b) => a.month.localeCompare(b.month)),
        revenueByPlan: Array.from(byPlan.entries()).map(([plan, revenue]) => ({ plan, revenue })),
        revenueByCompany: topCompanies.map(([companyId, revenue]) => ({ companyId, company: companyName.get(companyId) || companyId, revenue })),
        revenueForecast: [{ month: monthKey(new Date()), revenue: mrr }, { month: monthKey(daysFromNow(30)), revenue: mrr }, { month: monthKey(daysFromNow(60)), revenue: mrr }]
      }
    }
  });
};
