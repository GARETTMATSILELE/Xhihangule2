import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { PLAN_CONFIG, Plan } from '../types/plan';
import { BillingPayment } from '../models/BillingPayment';
import { Subscription } from '../models/Subscription';
import { Voucher } from '../models/Voucher';
import crypto from 'crypto';

export const createCheckout = async (req: Request, res: Response) => {
  const { plan, cycle }: { plan: Plan; cycle: 'monthly' | 'yearly' } = req.body || {};
  if (!req.user?.companyId) return res.status(401).json({ message: 'Unauthorized' });
  if (!plan || !['INDIVIDUAL','SME','ENTERPRISE'].includes(plan)) return res.status(400).json({ message: 'Invalid plan' });
  if (!cycle || !['monthly','yearly'].includes(cycle)) return res.status(400).json({ message: 'Invalid cycle' });

  const cfg = PLAN_CONFIG[plan];
  const amount = cfg.pricingUSD ? (cycle === 'monthly' ? cfg.pricingUSD.monthly : cfg.pricingUSD.yearly) : 0;
  const ref = `PAY-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;

  const payment = await BillingPayment.create({
    companyId: new mongoose.Types.ObjectId(req.user.companyId),
    plan,
    cycle,
    amount,
    currency: 'USD',
    method: 'card',
    provider: 'paynow',
    providerRef: ref,
    status: 'pending'
  });

  // Deferred Paynow integration: return placeholder redirect URL (client can show instructions)
  const redirectUrl = `/billing/pending?ref=${encodeURIComponent(ref)}`;
  return res.json({ redirectUrl, paymentId: payment._id, reference: ref });
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
  if (voucher.validFrom && voucher.validFrom > new Date()) return res.status(400).json({ message: 'Voucher not yet valid' });
  if (voucher.validUntil && voucher.validUntil < new Date()) return res.status(400).json({ message: 'Voucher expired' });
  if (voucher.redeemedAt) return res.status(400).json({ message: 'Voucher already redeemed' });
  const pinHash = crypto.createHash('sha256').update(pin).digest('hex');
  if (pinHash !== voucher.pinHash) return res.status(400).json({ message: 'Invalid PIN' });

  const now = new Date();
  const end = new Date();
  if (voucher.cycle === 'monthly') end.setMonth(end.getMonth() + 1);
  else end.setFullYear(end.getFullYear() + 1);

  const subscription = await Subscription.findOneAndUpdate(
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
  await voucher.save();

  return res.json({ message: 'Voucher redeemed', subscription });
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









