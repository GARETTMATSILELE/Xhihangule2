import mongoose from 'mongoose';
import { BillingPayment } from '../../models/BillingPayment';
import { PaymentSession } from '../../models/PaymentSession';
import { Subscription } from '../../models/Subscription';
import { WebhookEventReceipt } from '../../models/WebhookEventReceipt';
import { logger } from '../../utils/logger';
import { activateSubscriptionFromPayment } from '../billingActivationService';
import { amountToCents } from './dodoProductMap';
import { getDodoGateway } from './dodoClient';
import { readDodoConfig } from './providerAvailability';

const STALE_PROCESSING_MS = 2 * 60 * 1000;
const KNOWN_EVENTS = new Set([
  'payment.succeeded',
  'payment.failed',
  'payment.processing',
  'payment.cancelled',
  'subscription.active',
  'subscription.updated',
  'subscription.past_due',
  'subscription.on_hold',
  'subscription.paused',
  'subscription.unpaused',
  'subscription.renewed',
  'subscription.plan_changed',
  'subscription.update_payment_method',
  'subscription.cancelled',
  'subscription.failed',
  'subscription.expired',
  'refund.succeeded',
  'refund.failed'
]);

type DodoEvent = { type?: string; data?: Record<string, any>; business_id?: string; timestamp?: string };
type ApplyResult = { activated: boolean; ignored: boolean; retryable?: boolean; session?: InstanceType<typeof PaymentSession> | null };

function metadataString(metadata: unknown, key: string): string {
  if (!metadata || typeof metadata !== 'object') return '';
  const value = (metadata as Record<string, unknown>)[key];
  return value == null ? '' : String(value);
}

function providerSubscriptionId(data: Record<string, any>): string {
  return String(data.subscription_id || (Array.isArray(data.subscription_ids) ? data.subscription_ids[0] : '') || '');
}

async function claimDodoEvent(eventId: string, payloadFingerprint: string) {
  const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS);
  const reclaimed = await WebhookEventReceipt.findOneAndUpdate(
    {
      provider: 'dodo',
      eventId,
      $or: [{ status: 'failed' }, { status: 'processing', updatedAt: { $lte: staleBefore } }]
    },
    { $set: { status: 'processing', payloadFingerprint }, $unset: { lastError: 1 } },
    { new: true }
  );
  if (reclaimed) return { action: 'process' as const, receipt: reclaimed };
  const existing = await WebhookEventReceipt.findOne({ provider: 'dodo', eventId });
  if (existing?.status === 'processed') return { action: 'duplicate' as const, receipt: existing };
  if (existing?.status === 'processing') return { action: 'in_progress' as const, receipt: existing };
  try {
    const created = await WebhookEventReceipt.create({ provider: 'dodo', eventId, status: 'processing', payloadFingerprint });
    return { action: 'process' as const, receipt: created };
  } catch (error) {
    if (Number((error as { code?: unknown }).code) !== 11000) throw error;
    const raced = await WebhookEventReceipt.findOne({ provider: 'dodo', eventId });
    if (raced?.status === 'processed') return { action: 'duplicate' as const, receipt: raced };
    return { action: 'in_progress' as const, receipt: raced };
  }
}

async function findCheckoutSession(data: Record<string, any>) {
  const sessionId = metadataString(data.metadata, 'mantis_payment_session_id');
  if (sessionId && mongoose.isValidObjectId(sessionId)) {
    const session = await PaymentSession.findById(sessionId);
    if (session) return session;
  }
  const paymentId = String(data.payment_id || '');
  if (paymentId) {
    const represented = await PaymentSession.findOne({ provider: 'dodo', providerTransactionId: paymentId });
    if (represented) return represented;
    const byRenewal = await PaymentSession.findOne({ provider: 'dodo', idempotencyKey: `dodo:payment:${paymentId}` });
    if (byRenewal) return byRenewal;
  }
  const subscriptionId = providerSubscriptionId(data);
  if (subscriptionId) {
    return PaymentSession.findOne({ provider: 'dodo', providerSubscriptionId: subscriptionId }).sort({ createdAt: -1 });
  }
  return null;
}

async function findSubscriptionRecord(data: Record<string, any>) {
  const providerId = providerSubscriptionId(data);
  if (providerId) {
    const linked = await Subscription.findOne({ providerSubscriptionId: providerId });
    if (linked) return linked;
  }
  const mantisId = metadataString(data.metadata, 'mantis_subscription_id');
  if (mantisId && mongoose.isValidObjectId(mantisId)) return Subscription.findById(mantisId);
  const session = await findCheckoutSession(data);
  if (session?.subscriptionId) return Subscription.findById(session.subscriptionId);
  return null;
}

async function expectedAmount(session: InstanceType<typeof PaymentSession>) {
  if (session.subscriptionId) {
    const lastPaid = await BillingPayment.findOne({ subscriptionId: session.subscriptionId, provider: 'dodo', status: { $in: ['paid', 'refunded'] } }).sort({ paidAt: -1 });
    if (lastPaid && session.status !== 'pending' && session.status !== 'provider_created') return Number(lastPaid.amount);
  }
  return Number(session.amount);
}

async function openRenewalSession(subscription: InstanceType<typeof Subscription>, paymentId: string, data: Record<string, any>) {
  const existing = await PaymentSession.findOne({
    provider: 'dodo',
    $or: [{ idempotencyKey: `dodo:payment:${paymentId}` }, { providerTransactionId: paymentId }]
  });
  if (existing) return existing;
  const previous = await PaymentSession.findOne({ subscriptionId: subscription._id, provider: 'dodo' }).sort({ createdAt: -1 });
  if (!previous) return null;
  const amount = Number(previous.amount);
  const session = await PaymentSession.create({
    companyId: subscription.companyId,
    userId: subscription.userId,
    subscriptionId: subscription._id,
    idempotencyKey: `dodo:payment:${paymentId}`,
    provider: 'dodo',
    providerTransactionId: paymentId,
    providerSubscriptionId: providerSubscriptionId(data) || subscription.providerSubscriptionId,
    plan: previous.plan,
    billingCycle: previous.billingCycle,
    amount,
    currency: 'USD',
    status: 'pending',
    metadata: { source: 'dodo_renewal', dodoPaymentId: paymentId }
  });
  const billing = await BillingPayment.create({
    companyId: subscription.companyId,
    userId: subscription.userId,
    subscriptionId: subscription._id,
    paymentSessionId: session._id,
    plan: previous.plan,
    cycle: previous.billingCycle,
    amount,
    currency: 'USD',
    method: 'card',
    provider: 'dodo',
    providerTransactionId: paymentId,
    providerSubscriptionId: session.providerSubscriptionId,
    idempotencyKey: `dodo:payment:${paymentId}`,
    status: 'pending'
  });
  session.billingPaymentId = billing._id as typeof session.billingPaymentId;
  await session.save();
  return session;
}

async function applySucceeded(data: Record<string, any>): Promise<ApplyResult> {
  const paymentId = String(data.payment_id || '');
  if (!paymentId) return { activated: false, ignored: true, retryable: true };
  const already = await PaymentSession.findOne({ provider: 'dodo', idempotencyKey: `dodo:payment:${paymentId}`, status: { $in: ['paid', 'reconciled'] } });
  if (already) return { activated: false, ignored: false, session: already };
  let session = await findCheckoutSession(data);
  if (session && (session.status === 'paid' || session.status === 'reconciled') && session.providerTransactionId !== paymentId) {
    const subscription = await findSubscriptionRecord(data);
    session = subscription ? await openRenewalSession(subscription, paymentId, data) : null;
  } else if (!session) {
    const subscription = await findSubscriptionRecord(data);
    session = subscription ? await openRenewalSession(subscription, paymentId, data) : null;
  }
  if (!session || session.provider !== 'dodo') return { activated: false, ignored: true, retryable: true };
  const currency = String(data.currency || '').toUpperCase();
  const total = Number(data.total_amount);
  const expected = amountToCents(await expectedAmount(session));
  if (currency !== 'USD' || total !== expected) {
    logger.warn('dodo_payment_amount_mismatch', { paymentSessionId: String(session._id), paymentId });
    return { activated: false, ignored: true, session };
  }
  session.providerTransactionId = paymentId;
  session.providerSubscriptionId = providerSubscriptionId(data) || session.providerSubscriptionId;
  session.providerCustomerId = String(data.customer?.customer_id || session.providerCustomerId || '');
  session.metadata = { ...(session.metadata || {}), dodoPaymentId: paymentId, dodoSubscriptionId: session.providerSubscriptionId || '' };
  session.markModified('metadata');
  await session.save();
  if (session.billingPaymentId) {
    await BillingPayment.updateOne({ _id: session.billingPaymentId }, {
      $set: {
        providerTransactionId: paymentId,
        providerSubscriptionId: session.providerSubscriptionId,
        providerCustomerId: session.providerCustomerId,
        completedAt: new Date()
      }
    });
  }
  if (process.env.NODE_ENV !== 'production' && process.env.MANTIS_DODO_FAIL_ONCE === '1') {
    process.env.MANTIS_DODO_FAIL_ONCE = '0';
    throw new Error('temporary dodo processing failure');
  }
  const activation = await activateSubscriptionFromPayment({
    paymentSessionId: String(session._id),
    provider: 'dodo',
    providerRef: session.providerRef,
    rawProviderResponse: { provider: 'dodo', paymentId },
    paidAt: new Date()
  });
  if (session.providerSubscriptionId) {
    await Subscription.updateOne({ _id: activation.subscription?._id || session.subscriptionId }, {
      $set: { provider: 'dodo', providerSubscriptionId: session.providerSubscriptionId, providerCustomerId: session.providerCustomerId }
    });
  }
  return { activated: activation.alreadyProcessed !== true, ignored: false, session };
}

async function markOpenFailed(data: Record<string, any>, status: 'failed' | 'cancelled'): Promise<ApplyResult> {
  const session = await findCheckoutSession(data);
  if (!session) return { activated: false, ignored: true, retryable: true };
  if (session.status === 'paid' || session.status === 'reconciled') return { activated: false, ignored: true, session };
  await PaymentSession.updateOne({ _id: session._id, status: { $in: ['pending', 'provider_created'] } }, { $set: { status, failedAt: new Date() } });
  if (session.billingPaymentId) {
    await BillingPayment.updateOne({ _id: session.billingPaymentId, status: 'pending' }, { $set: { status, failedAt: new Date() } });
  }
  return { activated: false, ignored: false, session };
}

async function syncSubscription(data: Record<string, any>, status: 'past_due' | 'cancelled' | 'expired', extra: Record<string, unknown> = {}): Promise<ApplyResult> {
  const subscription = await findSubscriptionRecord(data);
  if (!subscription) return { activated: false, ignored: true };
  await Subscription.updateOne({ _id: subscription._id }, {
    $set: {
      status,
      provider: 'dodo',
      providerSubscriptionId: providerSubscriptionId(data) || subscription.providerSubscriptionId,
      providerCustomerId: String(data.customer?.customer_id || subscription.providerCustomerId || ''),
      ...extra
    }
  });
  return { activated: false, ignored: false };
}

async function applyEvent(event: DodoEvent): Promise<ApplyResult> {
  const type = String(event.type || '');
  const data = event.data || {};
  if (!KNOWN_EVENTS.has(type)) return { activated: false, ignored: true };
  if (type === 'payment.succeeded') return applySucceeded(data);
  if (type === 'payment.failed' || type === 'subscription.failed') return markOpenFailed(data, 'failed');
  if (type === 'payment.cancelled') return markOpenFailed(data, 'cancelled');
  if (type === 'payment.processing' || type === 'subscription.update_payment_method' || type === 'subscription.unpaused') {
    return { activated: false, ignored: false, session: await findCheckoutSession(data) };
  }
  if (type === 'subscription.active') {
    const session = await findCheckoutSession(data);
    const subscription = await findSubscriptionRecord(data);
    const providerId = providerSubscriptionId(data);
    if (session && providerId) {
      await PaymentSession.updateOne({ _id: session._id }, { $set: { providerSubscriptionId: providerId, providerCustomerId: String(data.customer?.customer_id || '') } });
    }
    if (subscription && providerId) {
      await Subscription.updateOne({ _id: subscription._id }, { $set: { providerSubscriptionId: providerId, providerCustomerId: String(data.customer?.customer_id || ''), provider: subscription.provider || 'dodo' } });
    }
    if (!session && !subscription) return { activated: false, ignored: true, retryable: true };
    return { activated: false, ignored: false, session };
  }
  if (type === 'subscription.renewed') {
    const paymentId = String(data.payment_id || '');
    if (!paymentId) return { activated: false, ignored: true };
    const paid = await PaymentSession.findOne({ provider: 'dodo', idempotencyKey: `dodo:payment:${paymentId}`, status: { $in: ['paid', 'reconciled'] } });
    const subscription = await findSubscriptionRecord(data);
    if (!subscription) return { activated: false, ignored: true, retryable: true };
    if (!paid) await openRenewalSession(subscription, paymentId, data);
    if (data.next_billing_date && paid) {
      const next = new Date(data.next_billing_date);
      if (!Number.isNaN(next.getTime())) {
        await Subscription.updateOne({ _id: subscription._id, providerSubscriptionId: providerSubscriptionId(data) || subscription.providerSubscriptionId }, {
          $set: { nextPaymentAt: next, currentPeriodEnd: next }
        });
      }
    }
    return { activated: false, ignored: false };
  }
  if (type === 'subscription.past_due' || type === 'subscription.on_hold' || type === 'subscription.paused') {
    return syncSubscription(data, 'past_due', { suspensionReason: type });
  }
  if (type === 'subscription.cancelled') return syncSubscription(data, 'cancelled', { cancelledAt: new Date() });
  if (type === 'subscription.expired') return syncSubscription(data, 'expired');
  if (type === 'subscription.plan_changed' || type === 'subscription.updated') {
    logger.warn('dodo_subscription_status_mismatch', { type, providerSubscriptionId: providerSubscriptionId(data) });
    return { activated: false, ignored: true };
  }
  if (type === 'refund.succeeded') {
    const paymentId = String(data.payment_id || '');
    const payment = await BillingPayment.findOne({ provider: 'dodo', providerTransactionId: paymentId });
    if (!payment) return { activated: false, ignored: true, retryable: true };
    const partial = data.is_partial === true;
    await BillingPayment.updateOne({ _id: payment._id }, {
      $set: {
        status: partial ? payment.status : 'refunded',
        rawResponse: { ...(payment.rawResponse || {}), refundId: data.refund_id, refundAmount: data.amount, partial }
      }
    });
    if (!partial && payment.subscriptionId) {
      await Subscription.updateOne({ _id: payment.subscriptionId }, { $set: { status: 'past_due', suspensionReason: 'dodo_refund' } });
    }
    return { activated: false, ignored: false };
  }
  return { activated: false, ignored: true };
}

export async function processVerifiedDodoEvent(event: DodoEvent, eventId: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const fingerprint = `${event.type || ''}|${event.data?.payment_id || ''}|${event.data?.subscription_id || ''}|${event.data?.refund_id || ''}`;
  const claim = await claimDodoEvent(eventId, fingerprint);
  if (claim.action === 'duplicate') return { status: 200, body: { status: 'duplicate', activated: false } };
  if (claim.action === 'in_progress' || !claim.receipt) return { status: 200, body: { status: 'in_progress', activated: false } };
  const receipt = claim.receipt;
  try {
    const applied = await applyEvent(event);
    if (applied.retryable) {
      receipt.status = 'failed';
      receipt.lastError = 'The Dodo event did not match a Mantis subscription payment.';
      await receipt.save();
      return { status: 500, body: { status: 'retry', activated: false } };
    }
    receipt.status = 'processed';
    receipt.processedAt = new Date();
    if (applied.session?.companyId) receipt.companyId = applied.session.companyId as typeof receipt.companyId;
    await receipt.save();
    logger.info('dodo_webhook_processed', {
      eventId,
      type: event.type,
      paymentSessionId: applied.session ? String(applied.session._id) : undefined,
      activated: applied.activated,
      ignored: applied.ignored
    });
    return { status: 200, body: { status: applied.ignored ? 'ignored' : 'received', activated: applied.activated } };
  } catch (error) {
    receipt.status = 'failed';
    receipt.lastError = String((error as Error).message || error).slice(0, 200);
    await receipt.save().catch(() => undefined);
    logger.warn('dodo_webhook_failed', { eventId, type: event.type, message: receipt.lastError });
    return { status: 500, body: { status: 'retry', activated: false } };
  }
}

export function verifyDodoWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>) {
  const config = readDodoConfig();
  if (!config.enabled || !config.webhookKey) {
    const error: any = new Error('Dodo webhook is not configured.');
    error.statusCode = 503;
    error.code = 'DODO_NOT_CONFIGURED';
    throw error;
  }
  const signatureHeaders = {
    'webhook-id': String(headers['webhook-id'] || ''),
    'webhook-signature': String(headers['webhook-signature'] || ''),
    'webhook-timestamp': String(headers['webhook-timestamp'] || '')
  };
  if (!signatureHeaders['webhook-id'] || !signatureHeaders['webhook-signature'] || !signatureHeaders['webhook-timestamp']) {
    const error: any = new Error('Dodo webhook signature is missing.');
    error.statusCode = 401;
    error.code = 'DODO_SIGNATURE_MISSING';
    throw error;
  }
  const gateway = getDodoGateway();
  if (!gateway) {
    const error: any = new Error('Dodo webhook is not configured.');
    error.statusCode = 503;
    error.code = 'DODO_NOT_CONFIGURED';
    throw error;
  }
  return gateway.webhooks.unwrap(rawBody, { headers: signatureHeaders }) as DodoEvent;
}

export async function reconcileDodoPayment(paymentSessionId: string, companyId: string, hintedPaymentId?: string) {
  const session = await PaymentSession.findOne({ _id: paymentSessionId, companyId, provider: 'dodo' });
  if (!session) return { status: 404, body: { message: 'Checkout was not found.', code: 'PAYMENT_SESSION_NOT_FOUND' } };
  if (session.status === 'reconciled' || session.status === 'paid') {
    return { status: 200, body: { status: session.status, activated: session.status === 'reconciled' } };
  }
  const paymentId = String(hintedPaymentId || (session.metadata as { dodoPaymentId?: string } | undefined)?.dodoPaymentId || '').trim();
  if (!paymentId) return { status: 200, body: { status: session.status, activated: false } };
  const gateway = getDodoGateway();
  if (!gateway) return { status: 503, body: { message: 'Dodo Payments is not configured.', code: 'DODO_NOT_CONFIGURED' } };
  const payment = await gateway.payments.retrieve(paymentId);
  const metadataSessionId = metadataString(payment.metadata, 'mantis_payment_session_id');
  if (metadataSessionId && metadataSessionId !== String(session._id)) {
    return { status: 409, body: { message: 'This payment belongs to a different checkout.', code: 'PAYMENT_SESSION_MISMATCH', activated: false } };
  }
  if (!metadataSessionId && session.providerTransactionId !== payment.payment_id) {
    return { status: 409, body: { message: 'The payment could not be matched to this checkout.', code: 'PAYMENT_SESSION_MISMATCH', activated: false } };
  }
  if (payment.status !== 'succeeded') return { status: 200, body: { status: session.status, activated: false } };
  const result = await processVerifiedDodoEvent({ type: 'payment.succeeded', data: payment as unknown as Record<string, any> }, `reconcile:${payment.payment_id}`);
  return { status: result.status, body: result.body };
}
