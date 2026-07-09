import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { PLAN_CONFIG, Plan } from '../types/plan';
import { BillingPayment } from '../models/BillingPayment';
import { Subscription } from '../models/Subscription';
import { Voucher } from '../models/Voucher';
import { PaymentSession } from '../models/PaymentSession';
import { Company } from '../models/Company';
import { activateSubscriptionFromPayment } from '../services/billingActivationService';
import crypto from 'crypto';

export const createCheckout = async (req: Request, res: Response) => {
  const { plan, cycle }: { plan: Plan; cycle: 'monthly' | 'yearly' } = req.body || {};
  if (!req.user?.companyId) return res.status(401).json({ message: 'Unauthorized' });
  if (!plan || !['INDIVIDUAL','SME','ENTERPRISE'].includes(plan)) return res.status(400).json({ message: 'Invalid plan' });
  if (!cycle || !['monthly','yearly'].includes(cycle)) return res.status(400).json({ message: 'Invalid cycle' });

  const cfg = PLAN_CONFIG[plan];
  const amount = cfg.pricingUSD ? (cycle === 'monthly' ? cfg.pricingUSD.monthly : cfg.pricingUSD.yearly) : 0;
  const ref = `PAY-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const idempotencyKey = req.get('idempotency-key') || `checkout:${req.user.companyId}:${plan}:${cycle}:${Date.now()}`;
  const subscription = await Subscription.findOneAndUpdate(
    { companyId: new mongoose.Types.ObjectId(req.user.companyId) },
    { $setOnInsert: { companyId: new mongoose.Types.ObjectId(req.user.companyId), plan, cycle, status: 'past_due' } },
    { upsert: true, new: true }
  );

  const paymentSession = await PaymentSession.findOneAndUpdate(
    { idempotencyKey },
    {
      $setOnInsert: {
        companyId: new mongoose.Types.ObjectId(req.user.companyId),
        userId: req.user?.userId ? new mongoose.Types.ObjectId(req.user.userId) : undefined,
        subscriptionId: subscription._id,
        idempotencyKey,
        provider: 'paynow',
        providerRef: ref,
        plan,
        billingCycle: cycle,
        amount,
        currency: 'USD',
        status: 'pending',
        metadata: { source: 'billing_checkout' }
      }
    },
    { upsert: true, new: true }
  );

  const payment = await BillingPayment.create({
    companyId: new mongoose.Types.ObjectId(req.user.companyId),
    userId: req.user?.userId ? new mongoose.Types.ObjectId(req.user.userId) : undefined,
    subscriptionId: subscription._id,
    paymentSessionId: paymentSession._id,
    plan,
    cycle,
    amount,
    currency: 'USD',
    method: 'card',
    provider: 'paynow',
    providerRef: ref,
    idempotencyKey,
    status: 'pending'
  });
  paymentSession.billingPaymentId = payment._id as any;
  await paymentSession.save();

  // Deferred Paynow integration: return placeholder redirect URL (client can show instructions)
  const redirectUrl = `/billing/pending?ref=${encodeURIComponent(ref)}`;
  return res.json({
    redirectUrl,
    paymentId: payment._id,
    paymentSessionId: paymentSession._id,
    reference: ref,
    metadata: {
      companyId: req.user.companyId,
      userId: req.user.userId,
      plan,
      billingCycle: cycle,
      onboardingSessionId: paymentSession.onboardingSessionId
    }
  });
};

export const getPaymentStatus = async (req: Request, res: Response) => {
  const payment = await BillingPayment.findById(req.params.id);
  if (!payment) return res.status(404).json({ message: 'Payment not found' });
  return res.json({ status: payment.status, providerRef: payment.providerRef });
};

export const redeemVoucher = async (req: Request, res: Response) => {
  const { code, pin } = req.body as { code?: string; pin?: string };
  if (!req.user?.companyId) return res.status(401).json({ message: 'Unauthorized' });
  if (!code || !pin) return res.status(400).json({ message: 'Code and PIN required' });
  const voucher = await Voucher.findOne({ code });
  if (!voucher) return res.status(404).json({ message: 'Voucher not found' });
  // If voucher was issued for a specific company, enforce that constraint
  const intendedCompanyId = (voucher as any)?.metadata?.intendedCompanyId
    ? String((voucher as any).metadata.intendedCompanyId)
    : undefined;
  if (intendedCompanyId && intendedCompanyId !== String(req.user.companyId)) {
    return res.status(403).json({ message: 'This voucher was not issued to your company' });
  }
  if (voucher.validFrom && voucher.validFrom > new Date()) return res.status(400).json({ message: 'Voucher not yet valid' });
  if (voucher.validUntil && voucher.validUntil < new Date()) return res.status(400).json({ message: 'Voucher expired' });
  if ((voucher as any).status === 'Cancelled') return res.status(400).json({ message: 'Voucher cancelled' });
  if (voucher.redeemedAt) return res.status(400).json({ message: 'Voucher already redeemed' });
  const pinHash = crypto.createHash('sha256').update(pin).digest('hex');
  if (pinHash !== voucher.pinHash) return res.status(400).json({ message: 'Invalid PIN' });

  const now = new Date();
  const end = new Date();
  if (voucher.cycle === 'monthly') end.setMonth(end.getMonth() + 1);
  else end.setFullYear(end.getFullYear() + 1);

  const paymentSession = await PaymentSession.findOneAndUpdate(
    {
      provider: 'cash',
      providerRef: voucher.code
    },
    {
      $setOnInsert: {
        companyId: req.user.companyId,
        userId: req.user?.userId ? new mongoose.Types.ObjectId(req.user.userId) : undefined,
        idempotencyKey: `voucher:${voucher.code}`,
        provider: 'cash',
        providerRef: voucher.code,
        plan: voucher.plan,
        billingCycle: voucher.cycle,
        amount: voucher.amount,
        currency: 'USD',
        status: 'pending',
        metadata: { voucherId: voucher._id }
      }
    },
    { upsert: true, new: true }
  );

  const activation = await activateSubscriptionFromPayment({
    paymentSessionId: paymentSession._id.toString(),
    provider: 'cash',
    providerRef: voucher.code,
    rawProviderResponse: { voucherId: voucher._id, code: voucher.code },
    paidAt: now
  });

  const subscription = activation.subscription || await Subscription.findOne(
    { companyId: req.user.companyId }
  );

  await Company.findByIdAndUpdate(req.user.companyId, {
    $set: {
      plan: voucher.plan,
      propertyLimit: PLAN_CONFIG[voucher.plan].propertyLimit,
      featureFlags: PLAN_CONFIG[voucher.plan].featureFlags,
      tenantStatus: 'active',
      subscriptionStatus: 'active',
      subscriptionEndDate: subscription?.currentPeriodEnd
    }
  });

  await Subscription.findOneAndUpdate(
    { companyId: req.user.companyId },
    {
      $set: {
        plan: voucher.plan,
        cycle: voucher.cycle,
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: end
      }
    },
    { upsert: true, new: true }
  );

  voucher.redeemedAt = now;
  voucher.redeemedBy = new mongoose.Types.ObjectId(req.user.companyId);
  (voucher as any).status = 'Redeemed';
  (voucher as any).auditHistory = [
    ...(((voucher as any).auditHistory as any[]) || []),
    {
      action: 'Redeemed',
      userId: req.user?.userId ? new mongoose.Types.ObjectId(req.user.userId) : undefined,
      companyId: new mongoose.Types.ObjectId(req.user.companyId),
      plan: voucher.plan,
      details: { code: voucher.code },
      createdAt: now
    }
  ];
  await voucher.save();

  // Link any matching BillingPayment record (cash/voucher) to this subscription
  try {
    await BillingPayment.updateOne(
      {
        provider: 'cash',
        method: 'voucher',
        providerRef: voucher.code
      },
      {
        $set: {
          subscriptionId: subscription?._id,
          paymentSessionId: paymentSession._id,
          status: 'paid'
        }
      }
    );
  } catch (e) {
    // Non-fatal
  }

  return res.json({ message: 'Voucher redeemed', subscription, paymentSession });
};

export const changePlan = async (req: Request, res: Response) => {
  const { plan, cycle }: { plan?: Plan; cycle?: 'monthly' | 'yearly' } = req.body || {};
  if (!req.user?.companyId) return res.status(401).json({ message: 'Unauthorized' });
  if (plan && !['INDIVIDUAL','SME','ENTERPRISE'].includes(plan)) return res.status(400).json({ message: 'Invalid plan' });
  if (cycle && !['monthly','yearly'].includes(cycle)) return res.status(400).json({ message: 'Invalid cycle' });

  const subscription = await Subscription.findOneAndUpdate(
    { companyId: req.user.companyId },
    { $set: { ...(plan ? { plan } : {}), ...(cycle ? { cycle } : {}) } },
    { upsert: true, new: true }
  );
  return res.json({ message: 'Subscription updated', subscription });
};



















