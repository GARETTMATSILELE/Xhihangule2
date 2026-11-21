/**
 * Isolated Dodo subscription checkout tests.
 * Uses a disposable local database and a mocked Dodo client.
 * Does not call Dodo, Paynow, or production.
 */
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import DodoPayments from 'dodopayments';
import { Webhook } from 'standardwebhooks';
import { Company } from '../models/Company';
import { User } from '../models/User';
import { Plan } from '../models/Plan';
import { Subscription } from '../models/Subscription';
import { PaymentSession } from '../models/PaymentSession';
import { BillingPayment } from '../models/BillingPayment';
import { WebhookEventReceipt } from '../models/WebhookEventReceipt';
import { selectSubscriptionProvider } from '../services/subscriptionPayments/providerAvailability';
import { resolveDodoProductId, cycleMatchesDodoPrice } from '../services/subscriptionPayments/dodoProductMap';
import { setDodoGatewayForTests } from '../services/subscriptionPayments/dodoClient';
import { startDodoSubscriptionCheckout } from '../services/subscriptionPayments/subscriptionCheckoutService';
import { processVerifiedDodoEvent, reconcileDodoPayment, verifyDodoWebhook } from '../services/subscriptionPayments/dodoWebhookService';
import { handleDodoWebhook } from '../controllers/dodoWebhookController';
import { activateSubscriptionFromPayment } from '../services/billingActivationService';
import { processVerifiedPaynowEvent } from '../services/paynowCallbackService';

const TEST_DB = 'mongodb://127.0.0.1:27017/mantis_dodo_payments_test';
const WEBHOOK_KEY = `whsec_${Buffer.alloc(24, 7).toString('base64')}`;
const failures: string[] = [];

function check(condition: unknown, message: string) {
  if (!condition) failures.push(message);
  console.log(`${condition ? 'PASS' : 'FAIL'} ${message}`);
}

function env(extra: Record<string, string> = {}) {
  process.env.DODO_PAYMENTS_ENABLED = 'true';
  process.env.DODO_PAYMENTS_MODE = 'test';
  process.env.DODO_PAYMENTS_API_KEY = 'dodo_test_key';
  process.env.DODO_PAYMENTS_WEBHOOK_KEY = WEBHOOK_KEY;
  process.env.DODO_PAYMENTS_RETURN_URL = 'http://localhost:3000/billing/return';
  process.env.DODO_PAYMENTS_PRODUCT_MONTHLY = 'pdt_monthly';
  process.env.DODO_PAYMENTS_PRODUCT_QUARTERLY = 'pdt_quarterly';
  process.env.DODO_PAYMENTS_PRODUCT_ANNUAL = 'pdt_annual';
  process.env.PAYNOW_ENABLED = 'true';
  process.env.PAYNOW_MODE = 'test';
  process.env.PAYNOW_INTEGRATION_ID = '90001';
  process.env.PAYNOW_INTEGRATION_KEY = 'paynow-test-key';
  Object.assign(process.env, extra);
}

function fakeGateway(createImpl?: () => Promise<{ session_id: string; checkout_url: string | null }>) {
  const state = { created: 0 };
  setDodoGatewayForTests({
    products: {
      retrieve: async (id: string) => ({
        price: id === 'pdt_quarterly'
          ? { type: 'recurring_price', currency: 'USD', price: 5000, payment_frequency_interval: 'Month', payment_frequency_count: 3 }
          : id === 'pdt_mismatch'
            ? { type: 'recurring_price', currency: 'USD', price: 100, payment_frequency_interval: 'Month', payment_frequency_count: 1 }
            : { type: 'recurring_price', currency: 'USD', price: 1900, payment_frequency_interval: 'Month', payment_frequency_count: 1 }
      })
    },
    checkoutSessions: {
      create: async () => {
        state.created += 1;
        if (createImpl) return createImpl();
        return { session_id: `cks_${state.created}`, checkout_url: `https://test.checkout.dodopayments.com/session/cks_${state.created}` };
      }
    },
    payments: {
      retrieve: async (id: string) => ({
        payment_id: id,
        status: id === 'pay_processing' ? 'processing' : 'succeeded',
        currency: 'USD',
        total_amount: 1900,
        metadata: {},
        customer: { customer_id: 'cus_retrieved' }
      })
    },
    webhooks: { unwrap: () => { throw new Error('unwrap is not used by the fake gateway'); } }
  } as any);
  return state;
}

function requestFor(user: { _id: unknown; companyId?: unknown }) {
  return { user: { userId: String(user._id), companyId: String(user.companyId) }, get: () => undefined } as any;
}

async function world(label: string) {
  const email = `${label}@example.test`;
  const user = await User.create({
    email, password: 'Register1pay', firstName: 'Dodo', lastName: label, role: 'admin', roles: ['admin'], isActive: true, sessionVersion: 1
  });
  const company = await Company.create({
    name: `Dodo ${label}`, address: '1 Test Close', phone: '0772000001', email, ownerId: user._id,
    companyType: 'INDIVIDUAL_LANDLORD', workspaceType: 'individual', onboardingStatus: 'PENDING_PAYMENT',
    onboardingCompleted: false, subscriptionStatus: 'past_due', isActive: true, plan: 'INDIVIDUAL'
  });
  user.companyId = company._id;
  await user.save();
  return { user, company };
}

async function main() {
  if (/cosmos|azure|mantisafrica/i.test(TEST_DB) || mongoose.connection.readyState !== 0) process.exit(1);
  env();
  check(selectSubscriptionProvider('paynow').ok === true && (selectSubscriptionProvider('paynow') as { provider: string }).provider === 'paynow', 'Paynow can be selected');
  check((selectSubscriptionProvider('dodo') as { provider?: string }).provider === 'dodo', 'Dodo can be selected when configured');
  check(selectSubscriptionProvider('card').ok === false && (selectSubscriptionProvider('card') as { code?: string }).code === 'PROVIDER_INVALID', 'an invalid provider is rejected');
  check(selectSubscriptionProvider(undefined, { ...process.env, DODO_PAYMENTS_ENABLED: 'false' } as NodeJS.ProcessEnv).ok === true, 'Dodo disabled leaves Paynow selected when it is the only provider');
  check((selectSubscriptionProvider('dodo', { ...process.env, DODO_PAYMENTS_ENABLED: 'false' } as NodeJS.ProcessEnv) as { code?: string }).code === 'DODO_DISABLED', 'disabled Dodo is rejected');
  check((selectSubscriptionProvider('dodo', { ...process.env, DODO_PAYMENTS_API_KEY: '' } as NodeJS.ProcessEnv) as { code?: string }).code === 'DODO_NOT_CONFIGURED', 'missing Dodo credentials are rejected without disabling Paynow');
  check(selectSubscriptionProvider('paynow', { ...process.env, DODO_PAYMENTS_API_KEY: '' } as NodeJS.ProcessEnv).ok === true, 'Paynow still works when Dodo credentials are missing');
  check(resolveDodoProductId('SME', 'monthly') === 'pdt_monthly', 'monthly product mapping uses the central configuration');
  check(cycleMatchesDodoPrice('quarterly', { cents: 5000, currency: 'USD', recurring: true, interval: 'Month', count: 3 }), 'quarterly matches a three-month recurring price');
  check(!cycleMatchesDodoPrice('monthly', { cents: 1900, currency: 'USD', recurring: false, interval: 'Month', count: 1 }), 'a one-time price is not a subscription');

  const real = new DodoPayments({ bearerToken: 'dodo_test_key', webhookKey: WEBHOOK_KEY, environment: 'test_mode' });
  setDodoGatewayForTests(real);
  const payload = JSON.stringify({ business_id: 'bus_test', type: 'payment.processing', timestamp: new Date().toISOString(), data: { payment_id: 'pay_signature' } });
  const webhook = new Webhook(WEBHOOK_KEY);
  const webhookId = 'msg_dodo_signature';
  const signedAt = new Date();
  const signature = webhook.sign(webhookId, signedAt, payload);
  const headers = { 'webhook-id': webhookId, 'webhook-signature': signature, 'webhook-timestamp': String(Math.floor(signedAt.getTime() / 1000)) };
  let verified = false;
  try { verified = verifyDodoWebhook(payload, headers).type === 'payment.processing'; } catch { verified = false; }
  check(verified, 'a valid Dodo signature is accepted by the official SDK');
  let invalidStatus = 0;
  await handleDodoWebhook({ body: Buffer.from(payload), headers: { ...headers, 'webhook-signature': 'v1,invalid' } } as any, { status: (code: number) => ({ json: () => { invalidStatus = code; } }) } as any);
  check(invalidStatus === 401, 'an invalid signature is rejected');
  let missingStatus = 0;
  await handleDodoWebhook({ body: Buffer.from(payload), headers: {} } as any, { status: (code: number) => ({ json: () => { missingStatus = code; } }) } as any);
  check(missingStatus === 401, 'a missing signature is rejected');

  await mongoose.connect(TEST_DB, { serverSelectionTimeoutMS: 8000, autoIndex: false });
  if (mongoose.connection.name !== 'mantis_dodo_payments_test') process.exit(1);
  await mongoose.connection.dropDatabase();
  await WebhookEventReceipt.collection.createIndex({ provider: 1, eventId: 1 }, { unique: true });
  await PaymentSession.collection.createIndex({ idempotencyKey: 1 }, { unique: true });
  await Plan.create({ code: 'INDIVIDUAL', name: 'Individual', monthlyPrice: 19, quarterlyPrice: 50, annualPrice: 200, currency: 'USD', isActive: true });

  const checkoutWorld = await world('checkout');
  const created = fakeGateway();
  const first = await startDodoSubscriptionCheckout(requestFor(checkoutWorld.user), { plan: 'INDIVIDUAL', cycle: 'monthly' });
  const second = await startDodoSubscriptionCheckout(requestFor(checkoutWorld.user), { plan: 'INDIVIDUAL', cycle: 'monthly' });
  const sessions = await PaymentSession.find({ companyId: checkoutWorld.company._id, provider: 'dodo' });
  const payments = await BillingPayment.find({ companyId: checkoutWorld.company._id, provider: 'dodo' });
  check(first.status === 200 && first.body.redirectUrl && sessions.length === 1 && payments.length === 1 && payments[0].amount === 19 && payments[0].currency === 'USD', 'checkout creates one USD payment for the server price');
  check(second.body.reused === true && created.created === 1 && String(second.body.paymentSessionId) === String(first.body.paymentSessionId), 'a second checkout reuses the open attempt');
  check(String((sessions[0].metadata as any).dodoProductId) === 'pdt_monthly', 'the checkout stores the mapped product');
  check(String(sessions[0].userId) === String(checkoutWorld.user._id), 'the checkout is associated with the customer');

  process.env.DODO_PAYMENTS_PRODUCT_MONTHLY = 'pdt_mismatch';
  const mismatchWorld = await world('mismatch');
  const mismatch = await startDodoSubscriptionCheckout(requestFor(mismatchWorld.user), { plan: 'INDIVIDUAL', cycle: 'monthly' });
  check(mismatch.status === 409 && mismatch.body.code === 'DODO_PRODUCT_MISMATCH', 'a product price that differs from the server price is rejected');
  process.env.DODO_PAYMENTS_PRODUCT_MONTHLY = 'pdt_monthly';

  const failedWorld = await world('failed-create');
  fakeGateway(async () => { throw new Error('provider unavailable'); });
  const failedCreate = await startDodoSubscriptionCheckout(requestFor(failedWorld.user), { plan: 'INDIVIDUAL', cycle: 'monthly' });
  check(failedCreate.status === 502 && await Subscription.countDocuments({ companyId: failedWorld.company._id, status: 'active' }) === 0, 'checkout creation failure does not activate the subscription');

  const quarterWorld = await world('quarter');
  fakeGateway();
  const quarter = await startDodoSubscriptionCheckout(requestFor(quarterWorld.user), { plan: 'INDIVIDUAL', cycle: 'quarterly' });
  const quarterSession = await PaymentSession.findById(quarter.body.paymentSessionId);
  check(quarter.status === 200 && quarterSession?.billingCycle === 'quarterly' && quarterSession.amount === 50, 'quarterly checkout uses the quarterly product and server price');

  async function paidEvent(sessionId: string, paymentId: string, amount = 1900, extra: Record<string, unknown> = {}) {
    return processVerifiedDodoEvent({
      type: 'payment.succeeded',
      data: {
        payment_id: paymentId,
        currency: 'USD',
        total_amount: amount,
        status: 'succeeded',
        customer: { customer_id: 'cus_test' },
        metadata: { mantis_payment_session_id: sessionId },
        ...extra
      }
    }, `msg_${paymentId}`);
  }

  const lifecycle = await world('lifecycle');
  fakeGateway();
  const started = await startDodoSubscriptionCheckout(requestFor(lifecycle.user), { plan: 'INDIVIDUAL', cycle: 'monthly' });
  const sessionId = String(started.body.paymentSessionId);
  const unknown = await processVerifiedDodoEvent({ type: 'payment.succeeded', data: { payment_id: 'pay_unknown', currency: 'USD', total_amount: 1900, metadata: {} } }, 'msg_unknown');
  check(unknown.status === 500 && await Subscription.countDocuments({ companyId: lifecycle.company._id, status: 'active' }) === 0, 'an unknown payment reference is not activated');
  const unknownEvent = await processVerifiedDodoEvent({ type: 'license_key.created', data: {} }, 'msg_unknown_event');
  check(unknownEvent.status === 200 && unknownEvent.body.status === 'ignored', 'an unknown event is ignored');
  const failedPayment = await processVerifiedDodoEvent({ type: 'payment.failed', data: { payment_id: 'pay_failed', metadata: { mantis_payment_session_id: sessionId } } }, 'msg_failed');
  check(failedPayment.status === 200 && (await PaymentSession.findById(sessionId))?.status === 'failed', 'a failed payment does not activate the subscription');
  await PaymentSession.updateOne({ _id: sessionId }, { $set: { status: 'provider_created' } });
  await BillingPayment.updateOne({ paymentSessionId: sessionId }, { $set: { status: 'pending' } });
  process.env.MANTIS_DODO_FAIL_ONCE = '1';
  const temporary = await paidEvent(sessionId, 'pay_lifecycle');
  const retried = await paidEvent(sessionId, 'pay_lifecycle');
  const active = await Subscription.findOne({ companyId: lifecycle.company._id });
  check(temporary.status === 500 && retried.body.activated === true && active?.status === 'active', 'a failed webhook can be retried once');
  const duplicate = await paidEvent(sessionId, 'pay_lifecycle');
  check(duplicate.body.status === 'duplicate' && await Subscription.countDocuments({ companyId: lifecycle.company._id }) === 1 && await BillingPayment.countDocuments({ companyId: lifecycle.company._id, status: 'paid' }) === 1, 'a duplicate webhook does not extend the subscription again');

  const concurrentWorld = await world('concurrent');
  fakeGateway();
  const concurrentStart = await startDodoSubscriptionCheckout(requestFor(concurrentWorld.user), { plan: 'INDIVIDUAL', cycle: 'monthly' });
  const concurrentId = String(concurrentStart.body.paymentSessionId);
  await Promise.all([0, 1].map(() => paidEvent(concurrentId, 'pay_concurrent')));
  check(await Subscription.countDocuments({ companyId: concurrentWorld.company._id, status: 'active' }) === 1 && await BillingPayment.countDocuments({ companyId: concurrentWorld.company._id, status: 'paid' }) === 1, 'concurrent deliveries do not create a second payment or subscription');

  setDodoGatewayForTests({
    products: { retrieve: async () => ({ price: { type: 'recurring_price', currency: 'USD', price: 1900, payment_frequency_interval: 'Month', payment_frequency_count: 1 } }) },
    checkoutSessions: { create: async () => ({ session_id: 'cks_reconcile', checkout_url: 'https://test.checkout.dodopayments.com/session/cks_reconcile' }) },
    payments: { retrieve: async (id: string) => ({ payment_id: id, status: 'succeeded', currency: 'USD', total_amount: 1900, metadata: { mantis_payment_session_id: concurrentId }, customer: { customer_id: 'cus_retrieved' } }) },
    webhooks: { unwrap: () => { throw new Error('not used'); } }
  } as any);
  const paidBefore = await BillingPayment.countDocuments({ companyId: concurrentWorld.company._id, status: 'paid' });
  const reconciled = await reconcileDodoPayment(concurrentId, String(concurrentWorld.company._id), 'pay_retrieved');
  const paidAfter = await BillingPayment.countDocuments({ companyId: concurrentWorld.company._id, status: 'paid' });
  check(reconciled.status === 200 && paidBefore === paidAfter && await Subscription.countDocuments({ companyId: concurrentWorld.company._id }) === 1, 'a return-page verification does not create another subscription payment');

  const renewedPayment = 'pay_renewal';
  const renewedFirst = await processVerifiedDodoEvent({ type: 'subscription.renewed', data: { payment_id: renewedPayment, subscription_id: 'sub_test', metadata: { mantis_subscription_id: String(active?._id) }, next_billing_date: new Date(Date.now() + 30 * 86400000).toISOString() } }, 'msg_renewed_first');
  check(renewedFirst.body.activated !== true && await Subscription.findById(active?._id).then((row) => row?.status) === 'active', 'a renewal notice before payment does not extend access by itself');
  const renewalPaid = await processVerifiedDodoEvent({ type: 'payment.succeeded', data: { payment_id: renewedPayment, currency: 'USD', total_amount: 1900, subscription_id: 'sub_test', metadata: { mantis_subscription_id: String(active?._id) }, customer: { customer_id: 'cus_test' } } }, 'msg_renewed_paid');
  const renewalDuplicate = await processVerifiedDodoEvent({ type: 'payment.succeeded', data: { payment_id: renewedPayment, currency: 'USD', total_amount: 1900, subscription_id: 'sub_test', metadata: { mantis_subscription_id: String(active?._id) } } }, 'msg_renewed_paid');
  check(renewalPaid.body.activated === true && renewalDuplicate.body.status === 'duplicate' && await Subscription.countDocuments({ companyId: lifecycle.company._id }) === 1 && await BillingPayment.countDocuments({ companyId: lifecycle.company._id, providerTransactionId: renewedPayment }) === 1, 'a renewal payment is recorded once on the same subscription');
  await processVerifiedDodoEvent({ type: 'subscription.plan_changed', data: { subscription_id: 'sub_test', product_id: 'pdt_other', metadata: { mantis_subscription_id: String(active?._id) } } }, 'msg_plan_changed');
  check((await Subscription.findById(active?._id))?.plan === 'INDIVIDUAL', 'a provider plan change does not rewrite the Mantis plan');
  await processVerifiedDodoEvent({ type: 'subscription.on_hold', data: { subscription_id: 'sub_test', metadata: { mantis_subscription_id: String(active?._id) } } }, 'msg_hold');
  check((await Subscription.findById(active?._id))?.status === 'past_due', 'a failed renewal puts the subscription past due');
  await processVerifiedDodoEvent({ type: 'subscription.cancelled', data: { subscription_id: 'sub_test', metadata: { mantis_subscription_id: String(active?._id) } } }, 'msg_cancel');
  check((await Subscription.findById(active?._id))?.status === 'cancelled', 'cancellation is synchronized');
  await processVerifiedDodoEvent({ type: 'subscription.expired', data: { subscription_id: 'sub_test', metadata: { mantis_subscription_id: String(active?._id) } } }, 'msg_expired');
  check((await Subscription.findById(active?._id))?.status === 'expired', 'expiration is synchronized');

  const refundWorld = await world('refund');
  fakeGateway();
  const refundStart = await startDodoSubscriptionCheckout(requestFor(refundWorld.user), { plan: 'INDIVIDUAL', cycle: 'monthly' });
  await paidEvent(String(refundStart.body.paymentSessionId), 'pay_refund');
  const refunded = await processVerifiedDodoEvent({ type: 'refund.succeeded', data: { payment_id: 'pay_refund', refund_id: 'ref_1', is_partial: false, amount: 1900 } }, 'msg_refund');
  const refundPayment = await BillingPayment.findOne({ providerTransactionId: 'pay_refund' });
  check(refunded.status === 200 && refundPayment?.status === 'refunded' && await BillingPayment.countDocuments({ providerTransactionId: 'pay_refund' }) === 1, 'a refund is recorded without deleting the payment');

  const paynowUser = await world('paynow');
  const paynowSubscription = await Subscription.create({ companyId: paynowUser.company._id, userId: paynowUser.user._id, plan: 'INDIVIDUAL', cycle: 'monthly', status: 'past_due', provider: 'paynow' });
  const paynowSession = await PaymentSession.create({
    companyId: paynowUser.company._id, userId: paynowUser.user._id, subscriptionId: paynowSubscription._id,
    idempotencyKey: 'paynow-regression', provider: 'paynow', providerRef: 'PAY-REGRESSION', plan: 'INDIVIDUAL',
    billingCycle: 'monthly', amount: 19, currency: 'USD', status: 'pending'
  });
  await BillingPayment.create({
    companyId: paynowUser.company._id, userId: paynowUser.user._id, subscriptionId: paynowSubscription._id,
    paymentSessionId: paynowSession._id, plan: 'INDIVIDUAL', cycle: 'monthly', amount: 19, currency: 'USD',
    method: 'card', provider: 'paynow', providerRef: 'PAY-REGRESSION', idempotencyKey: 'paynow-regression', status: 'pending'
  });
  await activateSubscriptionFromPayment({ paymentSessionId: String(paynowSession._id), provider: 'paynow', providerRef: 'PAY-REGRESSION' });
  check((await Subscription.findById(paynowSubscription._id))?.status === 'active' && (await Subscription.findById(paynowSubscription._id))?.provider === 'paynow', 'existing Paynow activation still completes');
  check(typeof processVerifiedPaynowEvent === 'function', 'the Paynow webhook processor is still available');
  check(await mongoose.connection.collection('payments').countDocuments() === 0, 'subscription checkout does not create rental payments');

  const webhookSource = fs.readFileSync(path.join(__dirname, '../services/subscriptionPayments/dodoWebhookService.ts'), 'utf8');
  check(!webhookSource.includes('postPaymentAccounting') && !webhookSource.includes('JournalEntry') && !webhookSource.includes("models/Payment'"), 'Dodo processing does not enter rental accounting');

  if (failures.length) {
    console.error(failures.map((failure) => `FAIL ${failure}`).join('\n'));
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log('Dodo subscription payment tests passed.');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (error) => {
  console.error(error);
  try { await mongoose.disconnect(); } catch { /* already closed */ }
  process.exit(1);
});
