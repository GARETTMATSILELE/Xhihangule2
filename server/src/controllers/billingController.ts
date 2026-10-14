import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { PLAN_CONFIG, Plan } from '../types/plan';
import { BillingPayment } from '../models/BillingPayment';
import { Subscription } from '../models/Subscription';
import { Voucher } from '../models/Voucher';
import { PaymentSession } from '../models/PaymentSession';
import { Company } from '../models/Company';
import { activateSubscriptionFromPayment } from '../services/billingActivationService';
import { enterpriseDirectCheckoutEnabled } from '../services/registrationPaymentPolicy';
import { chargeForPlan, listDashboardPlans } from '../services/systemPlanService';
import { initiatePaynowCheckout } from './paynowController';
import crypto from 'crypto';

export const listPublicPlans = async (_req: Request, res: Response, next: (error: unknown) => void) => {
  try {
    const enterpriseCheckout = enterpriseDirectCheckoutEnabled();
    const plans = (await listDashboardPlans()).map((plan) => ({
      ...plan,
      checkout: plan.code === 'ENTERPRISE' && !enterpriseCheckout ? 'sales' as const : 'paynow' as const
    }));
    res.json({ trialDays: 14, currency: plans[0]?.currency || 'USD', plans });
  } catch (error) {
    next(error);
  }
};

export const getCheckoutSession = async (req: Request, res: Response) => {
  if (!req.user?.companyId) return res.status(401).json({ message: 'Unauthorized' });
  const requestedId = String(req.params.id || 'current');
  const query: Record<string, unknown> = {
    companyId: new mongoose.Types.ObjectId(req.user.companyId),
    provider: 'paynow'
  };
  if (requestedId !== 'current') query._id = requestedId;
  const session = await PaymentSession.findOne(query).sort({ createdAt: -1 });
  if (!session) return res.status(404).json({ message: 'No checkout is waiting for this company', code: 'NO_CHECKOUT' });
  const priced = await chargeForPlan(session.plan, session.billingCycle);
  if (priced == null) {
    return res.status(503).json({ message: 'This plan does not have a configured price for the selected billing frequency', code: 'REGISTRATION_PRICE_NOT_CONFIGURED' });
  }
  res.json({
    paymentSessionId: session._id,
    plan: session.plan,
    billingCycle: session.billingCycle,
    amount: priced,
    currency: session.currency || 'USD',
    status: session.status,
    awaitingConfirmation: Boolean(session.pollUrl) && (session.status === 'pending' || session.status === 'provider_created')
  });
};

export const createCheckout = async (req: Request, res: Response) => {
  const { plan, cycle }: { plan: Plan; cycle: 'monthly' | 'yearly' } = req.body || {};
  if (!req.user?.companyId) return res.status(401).json({ message: 'Unauthorized' });
  if (!plan || !['INDIVIDUAL','SME','ENTERPRISE'].includes(plan)) return res.status(400).json({ message: 'Invalid plan' });
  if (!cycle || !['monthly','yearly'].includes(cycle)) return res.status(400).json({ message: 'Invalid cycle' });
  if (plan === 'ENTERPRISE' && !enterpriseDirectCheckoutEnabled()) {
    return res.status(400).json({ message: 'Enterprise is arranged with sales. Direct checkout is not available.', code: 'ENTERPRISE_SALES_ONLY' });
  }

  const pendingRegistration = await PaymentSession.findOne({
    companyId: new mongoose.Types.ObjectId(req.user.companyId),
    provider: 'paynow',
    status: { $in: ['pending', 'provider_created'] }
  }).sort({ createdAt: -1 });
  if (pendingRegistration && (pendingRegistration.plan !== plan || pendingRegistration.billingCycle !== cycle)) {
    return res.status(409).json({
      message: 'Checkout does not match the plan and billing frequency selected at registration',
      code: 'PLAN_MISMATCH',
      plan: pendingRegistration.plan,
      billingCycle: pendingRegistration.billingCycle,
      paymentSessionId: pendingRegistration._id
    });
  }

  const amount = (await chargeForPlan(plan, cycle)) || 0;
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(503).json({ message: 'This plan does not have a configured price', code: 'REGISTRATION_PRICE_NOT_CONFIGURED' });
  }

  const openSession = await PaymentSession.findOne({
    companyId: new mongoose.Types.ObjectId(req.user.companyId),
    plan,
    billingCycle: cycle,
    provider: 'paynow',
    status: { $in: ['pending', 'provider_created'] }
  }).sort({ createdAt: -1 });
  if (openSession) {
    if (openSession.amount !== amount) {
      openSession.amount = amount;
      await openSession.save();
      if (openSession.billingPaymentId) {
        await BillingPayment.updateOne({ _id: openSession.billingPaymentId }, { $set: { amount } });
      }
    }
    try {
      const checkout = await initiatePaynowCheckout(req, {
        paymentSessionId: String(openSession._id),
        plan,
        cycle,
        description: `Mantis ${plan} ${cycle} subscription`
      });
      return res.json({
        redirectUrl: checkout.redirectUrl,
        paymentId: openSession.billingPaymentId,
        paymentSessionId: openSession._id,
        reference: checkout.reference,
        metadata: { companyId: req.user.companyId, userId: req.user.userId, plan, billingCycle: cycle }
      });
    } catch (e: any) {
      return res.status(e?.statusCode || 502).json({
        message: e?.message || 'Failed to start Paynow checkout',
        code: e?.code || 'PAYNOW_CHECKOUT_FAILED',
        paymentSessionId: openSession._id
      });
    }
  }

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

  let checkout;
  try {
    checkout = await initiatePaynowCheckout(req, {
      paymentSessionId: String(paymentSession._id),
      plan,
      cycle,
      reference: ref,
      description: `Mantis ${plan} ${cycle} subscription`
    });
  } catch (e: any) {
    return res.status(e?.statusCode || 502).json({
      message: e?.message || 'Failed to start Paynow checkout',
      paymentId: payment._id,
      paymentSessionId: paymentSession._id,
      reference: ref
    });
  }

  return res.json({
    redirectUrl: checkout.redirectUrl,
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

  const subscription = await Subscription.findOne({ companyId: req.user.companyId });
  if (!subscription) {
    return res.json({ message: 'Subscription unchanged', subscription: null, unchanged: true });
  }
  const planUnchanged = !plan || subscription.plan === plan;
  const cycleUnchanged = !cycle || subscription.cycle === cycle;
  if (planUnchanged && cycleUnchanged) {
    return res.json({ message: 'Subscription unchanged', subscription, unchanged: true });
  }
  return res.status(403).json({
    status: 'error',
    message: 'Plan changes require a verified billing event',
    code: 'PLAN_CHANGE_REQUIRES_BILLING',
  });
};



















