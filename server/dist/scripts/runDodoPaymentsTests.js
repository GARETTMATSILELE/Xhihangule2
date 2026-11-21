"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Isolated Dodo subscription checkout tests.
 * Uses a disposable local database and a mocked Dodo client.
 * Does not call Dodo, Paynow, or production.
 */
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const mongoose_1 = __importDefault(require("mongoose"));
const dodopayments_1 = __importDefault(require("dodopayments"));
const standardwebhooks_1 = require("standardwebhooks");
const Company_1 = require("../models/Company");
const User_1 = require("../models/User");
const Plan_1 = require("../models/Plan");
const Subscription_1 = require("../models/Subscription");
const PaymentSession_1 = require("../models/PaymentSession");
const BillingPayment_1 = require("../models/BillingPayment");
const WebhookEventReceipt_1 = require("../models/WebhookEventReceipt");
const providerAvailability_1 = require("../services/subscriptionPayments/providerAvailability");
const dodoProductMap_1 = require("../services/subscriptionPayments/dodoProductMap");
const dodoClient_1 = require("../services/subscriptionPayments/dodoClient");
const subscriptionCheckoutService_1 = require("../services/subscriptionPayments/subscriptionCheckoutService");
const dodoWebhookService_1 = require("../services/subscriptionPayments/dodoWebhookService");
const dodoWebhookController_1 = require("../controllers/dodoWebhookController");
const billingActivationService_1 = require("../services/billingActivationService");
const paynowCallbackService_1 = require("../services/paynowCallbackService");
const TEST_DB = 'mongodb://127.0.0.1:27017/mantis_dodo_payments_test';
const WEBHOOK_KEY = Buffer.alloc(24, 7).toString('base64');
const failures = [];
function check(condition, message) {
    if (!condition)
        failures.push(message);
    console.log(`${condition ? 'PASS' : 'FAIL'} ${message}`);
}
function env(extra = {}) {
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
function fakeGateway(createImpl) {
    const state = { created: 0 };
    (0, dodoClient_1.setDodoGatewayForTests)({
        products: {
            retrieve: (id) => __awaiter(this, void 0, void 0, function* () {
                return ({
                    price: id === 'pdt_quarterly'
                        ? { type: 'recurring_price', currency: 'USD', price: 5000, payment_frequency_interval: 'Month', payment_frequency_count: 3 }
                        : id === 'pdt_mismatch'
                            ? { type: 'recurring_price', currency: 'USD', price: 100, payment_frequency_interval: 'Month', payment_frequency_count: 1 }
                            : { type: 'recurring_price', currency: 'USD', price: 1900, payment_frequency_interval: 'Month', payment_frequency_count: 1 }
                });
            })
        },
        checkoutSessions: {
            create: () => __awaiter(this, void 0, void 0, function* () {
                state.created += 1;
                if (createImpl)
                    return createImpl();
                return { session_id: `cks_${state.created}`, checkout_url: `https://test.checkout.dodopayments.com/session/cks_${state.created}` };
            })
        },
        payments: {
            retrieve: (id) => __awaiter(this, void 0, void 0, function* () {
                return ({
                    payment_id: id,
                    status: id === 'pay_processing' ? 'processing' : 'succeeded',
                    currency: 'USD',
                    total_amount: 1900,
                    metadata: {},
                    customer: { customer_id: 'cus_retrieved' }
                });
            })
        },
        webhooks: { unwrap: () => { throw new Error('unwrap is not used by the fake gateway'); } }
    });
    return state;
}
function requestFor(user) {
    return { user: { userId: String(user._id), companyId: String(user.companyId) }, get: () => undefined };
}
function world(label) {
    return __awaiter(this, void 0, void 0, function* () {
        const email = `${label}@example.test`;
        const user = yield User_1.User.create({
            email, password: 'Register1pay', firstName: 'Dodo', lastName: label, role: 'admin', roles: ['admin'], isActive: true, sessionVersion: 1
        });
        const company = yield Company_1.Company.create({
            name: `Dodo ${label}`, address: '1 Test Close', phone: '0772000001', email, ownerId: user._id,
            companyType: 'INDIVIDUAL_LANDLORD', workspaceType: 'individual', onboardingStatus: 'PENDING_PAYMENT',
            onboardingCompleted: false, subscriptionStatus: 'past_due', isActive: true, plan: 'INDIVIDUAL'
        });
        user.companyId = company._id;
        yield user.save();
        return { user, company };
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g;
        if (/cosmos|azure|mantisafrica/i.test(TEST_DB) || mongoose_1.default.connection.readyState !== 0)
            process.exit(1);
        env();
        check((0, providerAvailability_1.selectSubscriptionProvider)('paynow').ok === true && (0, providerAvailability_1.selectSubscriptionProvider)('paynow').provider === 'paynow', 'Paynow can be selected');
        check((0, providerAvailability_1.selectSubscriptionProvider)('dodo').provider === 'dodo', 'Dodo can be selected when configured');
        check((0, providerAvailability_1.selectSubscriptionProvider)('card').ok === false && (0, providerAvailability_1.selectSubscriptionProvider)('card').code === 'PROVIDER_INVALID', 'an invalid provider is rejected');
        check((0, providerAvailability_1.selectSubscriptionProvider)(undefined, Object.assign(Object.assign({}, process.env), { DODO_PAYMENTS_ENABLED: 'false' })).ok === true, 'Dodo disabled leaves Paynow selected when it is the only provider');
        check((0, providerAvailability_1.selectSubscriptionProvider)('dodo', Object.assign(Object.assign({}, process.env), { DODO_PAYMENTS_ENABLED: 'false' })).code === 'DODO_DISABLED', 'disabled Dodo is rejected');
        check((0, providerAvailability_1.selectSubscriptionProvider)('dodo', Object.assign(Object.assign({}, process.env), { DODO_PAYMENTS_API_KEY: '' })).code === 'DODO_NOT_CONFIGURED', 'missing Dodo credentials are rejected without disabling Paynow');
        check((0, providerAvailability_1.selectSubscriptionProvider)('paynow', Object.assign(Object.assign({}, process.env), { DODO_PAYMENTS_API_KEY: '' })).ok === true, 'Paynow still works when Dodo credentials are missing');
        check((0, dodoProductMap_1.resolveDodoProductId)('SME', 'monthly') === 'pdt_monthly', 'monthly product mapping uses the central configuration');
        check((0, dodoProductMap_1.cycleMatchesDodoPrice)('quarterly', { cents: 5000, currency: 'USD', recurring: true, interval: 'Month', count: 3 }), 'quarterly matches a three-month recurring price');
        check(!(0, dodoProductMap_1.cycleMatchesDodoPrice)('monthly', { cents: 1900, currency: 'USD', recurring: false, interval: 'Month', count: 1 }), 'a one-time price is not a subscription');
        const real = new dodopayments_1.default({ bearerToken: 'dodo_test_key', webhookKey: WEBHOOK_KEY, environment: 'test_mode' });
        (0, dodoClient_1.setDodoGatewayForTests)(real);
        const payload = JSON.stringify({ business_id: 'bus_test', type: 'payment.processing', timestamp: new Date().toISOString(), data: { payment_id: 'pay_signature' } });
        const webhook = new standardwebhooks_1.Webhook(WEBHOOK_KEY);
        const webhookId = 'msg_dodo_signature';
        const signedAt = new Date();
        const signature = webhook.sign(webhookId, signedAt, payload);
        const headers = { 'webhook-id': webhookId, 'webhook-signature': signature, 'webhook-timestamp': String(Math.floor(signedAt.getTime() / 1000)) };
        let verified = false;
        try {
            verified = (0, dodoWebhookService_1.verifyDodoWebhook)(payload, headers).type === 'payment.processing';
        }
        catch (_h) {
            verified = false;
        }
        check(verified, 'a valid Dodo signature is accepted by the official SDK');
        let invalidStatus = 0;
        yield (0, dodoWebhookController_1.handleDodoWebhook)({ body: Buffer.from(payload), headers: Object.assign(Object.assign({}, headers), { 'webhook-signature': 'v1,invalid' }) }, { status: (code) => ({ json: () => { invalidStatus = code; } }) });
        check(invalidStatus === 401, 'an invalid signature is rejected');
        let missingStatus = 0;
        yield (0, dodoWebhookController_1.handleDodoWebhook)({ body: Buffer.from(payload), headers: {} }, { status: (code) => ({ json: () => { missingStatus = code; } }) });
        check(missingStatus === 401, 'a missing signature is rejected');
        yield mongoose_1.default.connect(TEST_DB, { serverSelectionTimeoutMS: 8000, autoIndex: false });
        if (mongoose_1.default.connection.name !== 'mantis_dodo_payments_test')
            process.exit(1);
        yield mongoose_1.default.connection.dropDatabase();
        yield WebhookEventReceipt_1.WebhookEventReceipt.collection.createIndex({ provider: 1, eventId: 1 }, { unique: true });
        yield PaymentSession_1.PaymentSession.collection.createIndex({ idempotencyKey: 1 }, { unique: true });
        yield Plan_1.Plan.create({ code: 'INDIVIDUAL', name: 'Individual', monthlyPrice: 19, quarterlyPrice: 50, annualPrice: 200, currency: 'USD', isActive: true });
        const checkoutWorld = yield world('checkout');
        const created = fakeGateway();
        const first = yield (0, subscriptionCheckoutService_1.startDodoSubscriptionCheckout)(requestFor(checkoutWorld.user), { plan: 'INDIVIDUAL', cycle: 'monthly' });
        const second = yield (0, subscriptionCheckoutService_1.startDodoSubscriptionCheckout)(requestFor(checkoutWorld.user), { plan: 'INDIVIDUAL', cycle: 'monthly' });
        const sessions = yield PaymentSession_1.PaymentSession.find({ companyId: checkoutWorld.company._id, provider: 'dodo' });
        const payments = yield BillingPayment_1.BillingPayment.find({ companyId: checkoutWorld.company._id, provider: 'dodo' });
        check(first.status === 200 && first.body.redirectUrl && sessions.length === 1 && payments.length === 1 && payments[0].amount === 19 && payments[0].currency === 'USD', 'checkout creates one USD payment for the server price');
        check(second.body.reused === true && created.created === 1 && String(second.body.paymentSessionId) === String(first.body.paymentSessionId), 'a second checkout reuses the open attempt');
        check(String(sessions[0].metadata.dodoProductId) === 'pdt_monthly', 'the checkout stores the mapped product');
        check(String(sessions[0].userId) === String(checkoutWorld.user._id), 'the checkout is associated with the customer');
        process.env.DODO_PAYMENTS_PRODUCT_MONTHLY = 'pdt_mismatch';
        const mismatchWorld = yield world('mismatch');
        const mismatch = yield (0, subscriptionCheckoutService_1.startDodoSubscriptionCheckout)(requestFor(mismatchWorld.user), { plan: 'INDIVIDUAL', cycle: 'monthly' });
        check(mismatch.status === 409 && mismatch.body.code === 'DODO_PRODUCT_MISMATCH', 'a product price that differs from the server price is rejected');
        process.env.DODO_PAYMENTS_PRODUCT_MONTHLY = 'pdt_monthly';
        const failedWorld = yield world('failed-create');
        fakeGateway(() => __awaiter(this, void 0, void 0, function* () { throw new Error('provider unavailable'); }));
        const failedCreate = yield (0, subscriptionCheckoutService_1.startDodoSubscriptionCheckout)(requestFor(failedWorld.user), { plan: 'INDIVIDUAL', cycle: 'monthly' });
        check(failedCreate.status === 502 && (yield Subscription_1.Subscription.countDocuments({ companyId: failedWorld.company._id, status: 'active' })) === 0, 'checkout creation failure does not activate the subscription');
        const quarterWorld = yield world('quarter');
        fakeGateway();
        const quarter = yield (0, subscriptionCheckoutService_1.startDodoSubscriptionCheckout)(requestFor(quarterWorld.user), { plan: 'INDIVIDUAL', cycle: 'quarterly' });
        const quarterSession = yield PaymentSession_1.PaymentSession.findById(quarter.body.paymentSessionId);
        check(quarter.status === 200 && (quarterSession === null || quarterSession === void 0 ? void 0 : quarterSession.billingCycle) === 'quarterly' && quarterSession.amount === 50, 'quarterly checkout uses the quarterly product and server price');
        function paidEvent(sessionId_1, paymentId_1) {
            return __awaiter(this, arguments, void 0, function* (sessionId, paymentId, amount = 1900, extra = {}) {
                return (0, dodoWebhookService_1.processVerifiedDodoEvent)({
                    type: 'payment.succeeded',
                    data: Object.assign({ payment_id: paymentId, currency: 'USD', total_amount: amount, status: 'succeeded', customer: { customer_id: 'cus_test' }, metadata: { mantis_payment_session_id: sessionId } }, extra)
                }, `msg_${paymentId}`);
            });
        }
        const lifecycle = yield world('lifecycle');
        fakeGateway();
        const started = yield (0, subscriptionCheckoutService_1.startDodoSubscriptionCheckout)(requestFor(lifecycle.user), { plan: 'INDIVIDUAL', cycle: 'monthly' });
        const sessionId = String(started.body.paymentSessionId);
        const unknown = yield (0, dodoWebhookService_1.processVerifiedDodoEvent)({ type: 'payment.succeeded', data: { payment_id: 'pay_unknown', currency: 'USD', total_amount: 1900, metadata: {} } }, 'msg_unknown');
        check(unknown.status === 500 && (yield Subscription_1.Subscription.countDocuments({ companyId: lifecycle.company._id, status: 'active' })) === 0, 'an unknown payment reference is not activated');
        const unknownEvent = yield (0, dodoWebhookService_1.processVerifiedDodoEvent)({ type: 'license_key.created', data: {} }, 'msg_unknown_event');
        check(unknownEvent.status === 200 && unknownEvent.body.status === 'ignored', 'an unknown event is ignored');
        const failedPayment = yield (0, dodoWebhookService_1.processVerifiedDodoEvent)({ type: 'payment.failed', data: { payment_id: 'pay_failed', metadata: { mantis_payment_session_id: sessionId } } }, 'msg_failed');
        check(failedPayment.status === 200 && ((_a = (yield PaymentSession_1.PaymentSession.findById(sessionId))) === null || _a === void 0 ? void 0 : _a.status) === 'failed', 'a failed payment does not activate the subscription');
        yield PaymentSession_1.PaymentSession.updateOne({ _id: sessionId }, { $set: { status: 'provider_created' } });
        yield BillingPayment_1.BillingPayment.updateOne({ paymentSessionId: sessionId }, { $set: { status: 'pending' } });
        process.env.MANTIS_DODO_FAIL_ONCE = '1';
        const temporary = yield paidEvent(sessionId, 'pay_lifecycle');
        const retried = yield paidEvent(sessionId, 'pay_lifecycle');
        const active = yield Subscription_1.Subscription.findOne({ companyId: lifecycle.company._id });
        check(temporary.status === 500 && retried.body.activated === true && (active === null || active === void 0 ? void 0 : active.status) === 'active', 'a failed webhook can be retried once');
        const duplicate = yield paidEvent(sessionId, 'pay_lifecycle');
        check(duplicate.body.status === 'duplicate' && (yield Subscription_1.Subscription.countDocuments({ companyId: lifecycle.company._id })) === 1 && (yield BillingPayment_1.BillingPayment.countDocuments({ companyId: lifecycle.company._id, status: 'paid' })) === 1, 'a duplicate webhook does not extend the subscription again');
        const concurrentWorld = yield world('concurrent');
        fakeGateway();
        const concurrentStart = yield (0, subscriptionCheckoutService_1.startDodoSubscriptionCheckout)(requestFor(concurrentWorld.user), { plan: 'INDIVIDUAL', cycle: 'monthly' });
        const concurrentId = String(concurrentStart.body.paymentSessionId);
        yield Promise.all([0, 1].map(() => paidEvent(concurrentId, 'pay_concurrent')));
        check((yield Subscription_1.Subscription.countDocuments({ companyId: concurrentWorld.company._id, status: 'active' })) === 1 && (yield BillingPayment_1.BillingPayment.countDocuments({ companyId: concurrentWorld.company._id, status: 'paid' })) === 1, 'concurrent deliveries do not create a second payment or subscription');
        (0, dodoClient_1.setDodoGatewayForTests)({
            products: { retrieve: () => __awaiter(this, void 0, void 0, function* () { return ({ price: { type: 'recurring_price', currency: 'USD', price: 1900, payment_frequency_interval: 'Month', payment_frequency_count: 1 } }); }) },
            checkoutSessions: { create: () => __awaiter(this, void 0, void 0, function* () { return ({ session_id: 'cks_reconcile', checkout_url: 'https://test.checkout.dodopayments.com/session/cks_reconcile' }); }) },
            payments: { retrieve: (id) => __awaiter(this, void 0, void 0, function* () { return ({ payment_id: id, status: 'succeeded', currency: 'USD', total_amount: 1900, metadata: { mantis_payment_session_id: concurrentId }, customer: { customer_id: 'cus_retrieved' } }); }) },
            webhooks: { unwrap: () => { throw new Error('not used'); } }
        });
        const paidBefore = yield BillingPayment_1.BillingPayment.countDocuments({ companyId: concurrentWorld.company._id, status: 'paid' });
        const reconciled = yield (0, dodoWebhookService_1.reconcileDodoPayment)(concurrentId, String(concurrentWorld.company._id), 'pay_retrieved');
        const paidAfter = yield BillingPayment_1.BillingPayment.countDocuments({ companyId: concurrentWorld.company._id, status: 'paid' });
        check(reconciled.status === 200 && paidBefore === paidAfter && (yield Subscription_1.Subscription.countDocuments({ companyId: concurrentWorld.company._id })) === 1, 'a return-page verification does not create another subscription payment');
        const renewedPayment = 'pay_renewal';
        const renewedFirst = yield (0, dodoWebhookService_1.processVerifiedDodoEvent)({ type: 'subscription.renewed', data: { payment_id: renewedPayment, subscription_id: 'sub_test', metadata: { mantis_subscription_id: String(active === null || active === void 0 ? void 0 : active._id) }, next_billing_date: new Date(Date.now() + 30 * 86400000).toISOString() } }, 'msg_renewed_first');
        check(renewedFirst.body.activated !== true && (yield Subscription_1.Subscription.findById(active === null || active === void 0 ? void 0 : active._id).then((row) => row === null || row === void 0 ? void 0 : row.status)) === 'active', 'a renewal notice before payment does not extend access by itself');
        const renewalPaid = yield (0, dodoWebhookService_1.processVerifiedDodoEvent)({ type: 'payment.succeeded', data: { payment_id: renewedPayment, currency: 'USD', total_amount: 1900, subscription_id: 'sub_test', metadata: { mantis_subscription_id: String(active === null || active === void 0 ? void 0 : active._id) }, customer: { customer_id: 'cus_test' } } }, 'msg_renewed_paid');
        const renewalDuplicate = yield (0, dodoWebhookService_1.processVerifiedDodoEvent)({ type: 'payment.succeeded', data: { payment_id: renewedPayment, currency: 'USD', total_amount: 1900, subscription_id: 'sub_test', metadata: { mantis_subscription_id: String(active === null || active === void 0 ? void 0 : active._id) } } }, 'msg_renewed_paid');
        check(renewalPaid.body.activated === true && renewalDuplicate.body.status === 'duplicate' && (yield Subscription_1.Subscription.countDocuments({ companyId: lifecycle.company._id })) === 1 && (yield BillingPayment_1.BillingPayment.countDocuments({ companyId: lifecycle.company._id, providerTransactionId: renewedPayment })) === 1, 'a renewal payment is recorded once on the same subscription');
        yield (0, dodoWebhookService_1.processVerifiedDodoEvent)({ type: 'subscription.plan_changed', data: { subscription_id: 'sub_test', product_id: 'pdt_other', metadata: { mantis_subscription_id: String(active === null || active === void 0 ? void 0 : active._id) } } }, 'msg_plan_changed');
        check(((_b = (yield Subscription_1.Subscription.findById(active === null || active === void 0 ? void 0 : active._id))) === null || _b === void 0 ? void 0 : _b.plan) === 'INDIVIDUAL', 'a provider plan change does not rewrite the Mantis plan');
        yield (0, dodoWebhookService_1.processVerifiedDodoEvent)({ type: 'subscription.on_hold', data: { subscription_id: 'sub_test', metadata: { mantis_subscription_id: String(active === null || active === void 0 ? void 0 : active._id) } } }, 'msg_hold');
        check(((_c = (yield Subscription_1.Subscription.findById(active === null || active === void 0 ? void 0 : active._id))) === null || _c === void 0 ? void 0 : _c.status) === 'past_due', 'a failed renewal puts the subscription past due');
        yield (0, dodoWebhookService_1.processVerifiedDodoEvent)({ type: 'subscription.cancelled', data: { subscription_id: 'sub_test', metadata: { mantis_subscription_id: String(active === null || active === void 0 ? void 0 : active._id) } } }, 'msg_cancel');
        check(((_d = (yield Subscription_1.Subscription.findById(active === null || active === void 0 ? void 0 : active._id))) === null || _d === void 0 ? void 0 : _d.status) === 'cancelled', 'cancellation is synchronized');
        yield (0, dodoWebhookService_1.processVerifiedDodoEvent)({ type: 'subscription.expired', data: { subscription_id: 'sub_test', metadata: { mantis_subscription_id: String(active === null || active === void 0 ? void 0 : active._id) } } }, 'msg_expired');
        check(((_e = (yield Subscription_1.Subscription.findById(active === null || active === void 0 ? void 0 : active._id))) === null || _e === void 0 ? void 0 : _e.status) === 'expired', 'expiration is synchronized');
        const refundWorld = yield world('refund');
        fakeGateway();
        const refundStart = yield (0, subscriptionCheckoutService_1.startDodoSubscriptionCheckout)(requestFor(refundWorld.user), { plan: 'INDIVIDUAL', cycle: 'monthly' });
        yield paidEvent(String(refundStart.body.paymentSessionId), 'pay_refund');
        const refunded = yield (0, dodoWebhookService_1.processVerifiedDodoEvent)({ type: 'refund.succeeded', data: { payment_id: 'pay_refund', refund_id: 'ref_1', is_partial: false, amount: 1900 } }, 'msg_refund');
        const refundPayment = yield BillingPayment_1.BillingPayment.findOne({ providerTransactionId: 'pay_refund' });
        check(refunded.status === 200 && (refundPayment === null || refundPayment === void 0 ? void 0 : refundPayment.status) === 'refunded' && (yield BillingPayment_1.BillingPayment.countDocuments({ providerTransactionId: 'pay_refund' })) === 1, 'a refund is recorded without deleting the payment');
        const paynowUser = yield world('paynow');
        const paynowSubscription = yield Subscription_1.Subscription.create({ companyId: paynowUser.company._id, userId: paynowUser.user._id, plan: 'INDIVIDUAL', cycle: 'monthly', status: 'past_due', provider: 'paynow' });
        const paynowSession = yield PaymentSession_1.PaymentSession.create({
            companyId: paynowUser.company._id, userId: paynowUser.user._id, subscriptionId: paynowSubscription._id,
            idempotencyKey: 'paynow-regression', provider: 'paynow', providerRef: 'PAY-REGRESSION', plan: 'INDIVIDUAL',
            billingCycle: 'monthly', amount: 19, currency: 'USD', status: 'pending'
        });
        yield BillingPayment_1.BillingPayment.create({
            companyId: paynowUser.company._id, userId: paynowUser.user._id, subscriptionId: paynowSubscription._id,
            paymentSessionId: paynowSession._id, plan: 'INDIVIDUAL', cycle: 'monthly', amount: 19, currency: 'USD',
            method: 'card', provider: 'paynow', providerRef: 'PAY-REGRESSION', idempotencyKey: 'paynow-regression', status: 'pending'
        });
        yield (0, billingActivationService_1.activateSubscriptionFromPayment)({ paymentSessionId: String(paynowSession._id), provider: 'paynow', providerRef: 'PAY-REGRESSION' });
        check(((_f = (yield Subscription_1.Subscription.findById(paynowSubscription._id))) === null || _f === void 0 ? void 0 : _f.status) === 'active' && ((_g = (yield Subscription_1.Subscription.findById(paynowSubscription._id))) === null || _g === void 0 ? void 0 : _g.provider) === 'paynow', 'existing Paynow activation still completes');
        check(typeof paynowCallbackService_1.processVerifiedPaynowEvent === 'function', 'the Paynow webhook processor is still available');
        check((yield mongoose_1.default.connection.collection('payments').countDocuments()) === 0, 'subscription checkout does not create rental payments');
        const webhookSource = fs_1.default.readFileSync(path_1.default.join(__dirname, '../services/subscriptionPayments/dodoWebhookService.ts'), 'utf8');
        check(!webhookSource.includes('postPaymentAccounting') && !webhookSource.includes('JournalEntry') && !webhookSource.includes("models/Payment'"), 'Dodo processing does not enter rental accounting');
        if (failures.length) {
            console.error(failures.map((failure) => `FAIL ${failure}`).join('\n'));
            yield mongoose_1.default.disconnect();
            process.exit(1);
        }
        console.log('Dodo subscription payment tests passed.');
        yield mongoose_1.default.disconnect();
        process.exit(0);
    });
}
main().catch((error) => __awaiter(void 0, void 0, void 0, function* () {
    console.error(error);
    try {
        yield mongoose_1.default.disconnect();
    }
    catch ( /* already closed */_a) { /* already closed */ }
    process.exit(1);
}));
