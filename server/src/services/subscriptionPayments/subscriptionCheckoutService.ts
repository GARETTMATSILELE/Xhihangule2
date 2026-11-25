import mongoose from 'mongoose';
import { Request } from 'express';
import { BillingPayment } from '../../models/BillingPayment';
import { PaymentSession } from '../../models/PaymentSession';
import { Subscription } from '../../models/Subscription';
import { User } from '../../models/User';
import { logger } from '../../utils/logger';
import { createDodoPaymentsProvider, DodoCheckoutError } from './dodoPaymentsProvider';
import { subscriptionListPrice } from './dodoProductMap';
import { SubscriptionCycle } from './providerAvailability';
import { assessDodoAttempt, DODO_RECOVERY_MESSAGE } from './dodoWebhookService';

const CHECKOUT_TTL_MS = 23 * 60 * 60 * 1000;

export async function startDodoSubscriptionCheckout(req: Request, input: {
  plan: 'INDIVIDUAL' | 'SME' | 'ENTERPRISE';
  cycle: SubscriptionCycle;
  openSession?: InstanceType<typeof PaymentSession> | null;
}) {
  if (!req.user?.companyId || !req.user.userId) {
    return { status: 401, body: { message: 'Unauthorized', code: 'UNAUTHORIZED' } };
  }
  const amount = await subscriptionListPrice(input.plan, input.cycle);
  if (amount == null || amount <= 0) {
    return { status: 503, body: { message: 'This plan does not have a configured price', code: 'REGISTRATION_PRICE_NOT_CONFIGURED' } };
  }
  const user = await User.findById(req.user.userId).select('email firstName lastName').lean();
  const email = String(user?.email || '').trim();
  if (!email) return { status: 422, body: { message: 'A customer email is required for card checkout.', code: 'CUSTOMER_EMAIL_REQUIRED' } };
  const name = `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || email;

  const subscription = input.openSession?.subscriptionId
    ? await Subscription.findById(input.openSession.subscriptionId)
    : await Subscription.findOneAndUpdate(
      { companyId: new mongoose.Types.ObjectId(req.user.companyId) },
      { $setOnInsert: { companyId: new mongoose.Types.ObjectId(req.user.companyId), plan: input.plan, cycle: input.cycle, status: 'past_due' } },
      { upsert: true, new: true }
    );
  if (!subscription) return { status: 409, body: { message: 'Subscription was not found.', code: 'SUBSCRIPTION_NOT_FOUND' } };

  const purchaseAttempts = await PaymentSession.find({
    companyId: new mongoose.Types.ObjectId(req.user.companyId),
    provider: 'dodo',
    plan: input.plan,
    billingCycle: input.cycle,
    idempotencyKey: { $not: /^dodo:payment:/ }
  }).sort({ createdAt: -1 });
  let reusable: InstanceType<typeof PaymentSession> | null = null;
  for (const attempt of purchaseAttempts) {
    const state = await assessDodoAttempt(attempt);
    if (state === 'succeeded' || attempt.metadata?.doNotPay) {
      return {
        status: 200,
        body: {
          message: 'Payment successful. Continue to workspace setup.',
          code: 'PAYMENT_ALREADY_COMPLETED',
          paymentSessionId: attempt.metadata?.supersededBySessionId || attempt._id,
          provider: 'dodo',
          outcome: 'success'
        }
      };
    }
    if (state === 'unresolved') {
      return {
        status: 409,
        body: {
          message: DODO_RECOVERY_MESSAGE,
          code: 'PAYMENT_AWAITING_CONFIRMATION',
          paymentSessionId: attempt._id,
          provider: 'dodo',
          outcome: 'uncertain'
        }
      };
    }
    if (state === 'open' && !reusable) reusable = attempt;
  }

  let session = reusable || input.openSession || null;
  if (session && session.provider !== 'dodo') {
    return { status: 409, body: { message: 'A payment attempt is already open with another provider.', code: 'PAYMENT_ATTEMPT_PENDING', paymentSessionId: session._id } };
  }
  if (!session) {
    const idempotencyKey = req.get('idempotency-key') || `dodo-open:${req.user.companyId}:${input.plan}:${input.cycle}`;
    const existing = await PaymentSession.findOne({ idempotencyKey });
    const freshKey = existing ? `${idempotencyKey}:${Date.now()}` : idempotencyKey;
    session = await PaymentSession.findOneAndUpdate(
      { idempotencyKey: freshKey },
      {
        $setOnInsert: {
          companyId: new mongoose.Types.ObjectId(req.user.companyId),
          userId: new mongoose.Types.ObjectId(req.user.userId),
          subscriptionId: subscription._id,
          idempotencyKey: freshKey,
          provider: 'dodo',
          plan: input.plan,
          billingCycle: input.cycle,
          amount,
          currency: 'USD',
          status: 'pending',
          metadata: { source: 'billing_checkout' }
        }
      },
      { upsert: true, new: true }
    );
  }
  if (!session) return { status: 503, body: { message: 'Checkout could not be opened.', code: 'CHECKOUT_NOT_CREATED' } };
  if (session.provider !== 'dodo') {
    return { status: 409, body: { message: 'A payment attempt is already open with another provider.', code: 'PAYMENT_ATTEMPT_PENDING', paymentSessionId: session._id } };
  }
  if (session.amount !== amount && (session.status === 'pending' || session.status === 'provider_created')) {
    session.amount = amount;
    await session.save();
  }

  let payment = session.billingPaymentId ? await BillingPayment.findById(session.billingPaymentId) : null;
  if (!payment) {
    payment = await BillingPayment.create({
      companyId: session.companyId,
      userId: session.userId,
      subscriptionId: subscription._id,
      paymentSessionId: session._id,
      plan: input.plan,
      cycle: input.cycle,
      amount,
      currency: 'USD',
      method: 'card',
      provider: 'dodo',
      idempotencyKey: session.idempotencyKey,
      status: 'pending'
    });
    session.billingPaymentId = payment._id as typeof session.billingPaymentId;
    await session.save();
  }

  const createdAt = Number((session.metadata as { dodoCheckoutCreatedAt?: number } | undefined)?.dodoCheckoutCreatedAt || 0);
  const existingUrl = String((session.metadata as { dodoCheckoutUrl?: string } | undefined)?.dodoCheckoutUrl || '');
  const checkoutStillOpen = session.status === 'pending' || session.status === 'provider_created';
  if (existingUrl && createdAt && Date.now() - createdAt < CHECKOUT_TTL_MS && checkoutStillOpen) {
    return {
      status: 200,
      body: {
        redirectUrl: existingUrl,
        paymentId: payment._id,
        paymentSessionId: session._id,
        provider: 'dodo',
        reused: true
      }
    };
  }

  try {
    const checkout = await createDodoPaymentsProvider().createCheckout({
      paymentSessionId: String(session._id),
      companyId: String(session.companyId),
      subscriptionId: String(subscription._id),
      customerId: String(session.userId || req.user.userId),
      customerEmail: email,
      customerName: name,
      plan: input.plan,
      cycle: input.cycle,
      amount,
      currency: 'USD',
      description: `Mantis ${input.plan} ${input.cycle} subscription`
    });
    session.provider = 'dodo';
    session.status = 'provider_created';
    session.providerTransactionId = checkout.providerTransactionId;
    session.metadata = {
      ...(session.metadata || {}),
      ...checkout.metadata,
      dodoCheckoutUrl: checkout.redirectUrl,
      dodoCheckoutCreatedAt: Date.now()
    };
    session.markModified('metadata');
    await session.save();
    await BillingPayment.updateOne({ _id: payment._id }, { $set: { provider: 'dodo', amount, currency: 'USD', providerRef: checkout.providerTransactionId } });
    logger.info('dodo_checkout_created', {
      paymentSessionId: String(session._id),
      companyId: String(session.companyId),
      provider: 'dodo',
      mode: checkout.metadata.mode,
      checkoutSessionId: checkout.providerTransactionId
    });
    return {
      status: 200,
      body: {
        redirectUrl: checkout.redirectUrl,
        paymentId: payment._id,
        paymentSessionId: session._id,
        provider: 'dodo',
        reference: checkout.providerTransactionId,
        testMode: checkout.metadata.mode === 'test'
      }
    };
  } catch (error) {
    const coded = error as DodoCheckoutError;
    logger.warn('dodo_checkout_failed', {
      paymentSessionId: String(session._id),
      code: coded.code || 'DODO_CHECKOUT_FAILED'
    });
    return {
      status: coded.statusCode || 502,
      body: {
        message: coded.message || 'Failed to start Dodo checkout',
        code: coded.code || 'DODO_CHECKOUT_FAILED',
        paymentId: payment._id,
        paymentSessionId: session._id,
        provider: 'dodo'
      }
    };
  }
}
