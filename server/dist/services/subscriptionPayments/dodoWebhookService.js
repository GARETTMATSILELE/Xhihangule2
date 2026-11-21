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
exports.processVerifiedDodoEvent = processVerifiedDodoEvent;
exports.verifyDodoWebhook = verifyDodoWebhook;
exports.reconcileDodoPayment = reconcileDodoPayment;
const mongoose_1 = __importDefault(require("mongoose"));
const BillingPayment_1 = require("../../models/BillingPayment");
const PaymentSession_1 = require("../../models/PaymentSession");
const Subscription_1 = require("../../models/Subscription");
const WebhookEventReceipt_1 = require("../../models/WebhookEventReceipt");
const logger_1 = require("../../utils/logger");
const billingActivationService_1 = require("../billingActivationService");
const dodoProductMap_1 = require("./dodoProductMap");
const dodoClient_1 = require("./dodoClient");
const providerAvailability_1 = require("./providerAvailability");
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
function metadataString(metadata, key) {
    if (!metadata || typeof metadata !== 'object')
        return '';
    const value = metadata[key];
    return value == null ? '' : String(value);
}
function providerSubscriptionId(data) {
    return String(data.subscription_id || (Array.isArray(data.subscription_ids) ? data.subscription_ids[0] : '') || '');
}
function claimDodoEvent(eventId, payloadFingerprint) {
    return __awaiter(this, void 0, void 0, function* () {
        const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS);
        const reclaimed = yield WebhookEventReceipt_1.WebhookEventReceipt.findOneAndUpdate({
            provider: 'dodo',
            eventId,
            $or: [{ status: 'failed' }, { status: 'processing', updatedAt: { $lte: staleBefore } }]
        }, { $set: { status: 'processing', payloadFingerprint }, $unset: { lastError: 1 } }, { new: true });
        if (reclaimed)
            return { action: 'process', receipt: reclaimed };
        const existing = yield WebhookEventReceipt_1.WebhookEventReceipt.findOne({ provider: 'dodo', eventId });
        if ((existing === null || existing === void 0 ? void 0 : existing.status) === 'processed')
            return { action: 'duplicate', receipt: existing };
        if ((existing === null || existing === void 0 ? void 0 : existing.status) === 'processing')
            return { action: 'in_progress', receipt: existing };
        try {
            const created = yield WebhookEventReceipt_1.WebhookEventReceipt.create({ provider: 'dodo', eventId, status: 'processing', payloadFingerprint });
            return { action: 'process', receipt: created };
        }
        catch (error) {
            if (Number(error.code) !== 11000)
                throw error;
            const raced = yield WebhookEventReceipt_1.WebhookEventReceipt.findOne({ provider: 'dodo', eventId });
            if ((raced === null || raced === void 0 ? void 0 : raced.status) === 'processed')
                return { action: 'duplicate', receipt: raced };
            return { action: 'in_progress', receipt: raced };
        }
    });
}
function findCheckoutSession(data) {
    return __awaiter(this, void 0, void 0, function* () {
        const sessionId = metadataString(data.metadata, 'mantis_payment_session_id');
        if (sessionId && mongoose_1.default.isValidObjectId(sessionId)) {
            const session = yield PaymentSession_1.PaymentSession.findById(sessionId);
            if (session)
                return session;
        }
        const paymentId = String(data.payment_id || '');
        if (paymentId) {
            const represented = yield PaymentSession_1.PaymentSession.findOne({ provider: 'dodo', providerTransactionId: paymentId });
            if (represented)
                return represented;
            const byRenewal = yield PaymentSession_1.PaymentSession.findOne({ provider: 'dodo', idempotencyKey: `dodo:payment:${paymentId}` });
            if (byRenewal)
                return byRenewal;
        }
        const subscriptionId = providerSubscriptionId(data);
        if (subscriptionId) {
            return PaymentSession_1.PaymentSession.findOne({ provider: 'dodo', providerSubscriptionId: subscriptionId }).sort({ createdAt: -1 });
        }
        return null;
    });
}
function findSubscriptionRecord(data) {
    return __awaiter(this, void 0, void 0, function* () {
        const providerId = providerSubscriptionId(data);
        if (providerId) {
            const linked = yield Subscription_1.Subscription.findOne({ providerSubscriptionId: providerId });
            if (linked)
                return linked;
        }
        const mantisId = metadataString(data.metadata, 'mantis_subscription_id');
        if (mantisId && mongoose_1.default.isValidObjectId(mantisId))
            return Subscription_1.Subscription.findById(mantisId);
        const session = yield findCheckoutSession(data);
        if (session === null || session === void 0 ? void 0 : session.subscriptionId)
            return Subscription_1.Subscription.findById(session.subscriptionId);
        return null;
    });
}
function expectedAmount(session) {
    return __awaiter(this, void 0, void 0, function* () {
        if (session.subscriptionId) {
            const lastPaid = yield BillingPayment_1.BillingPayment.findOne({ subscriptionId: session.subscriptionId, provider: 'dodo', status: { $in: ['paid', 'refunded'] } }).sort({ paidAt: -1 });
            if (lastPaid && session.status !== 'pending' && session.status !== 'provider_created')
                return Number(lastPaid.amount);
        }
        return Number(session.amount);
    });
}
function openRenewalSession(subscription, paymentId, data) {
    return __awaiter(this, void 0, void 0, function* () {
        const existing = yield PaymentSession_1.PaymentSession.findOne({
            provider: 'dodo',
            $or: [{ idempotencyKey: `dodo:payment:${paymentId}` }, { providerTransactionId: paymentId }]
        });
        if (existing)
            return existing;
        const previous = yield PaymentSession_1.PaymentSession.findOne({ subscriptionId: subscription._id, provider: 'dodo' }).sort({ createdAt: -1 });
        if (!previous)
            return null;
        const amount = Number(previous.amount);
        const session = yield PaymentSession_1.PaymentSession.create({
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
        const billing = yield BillingPayment_1.BillingPayment.create({
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
        session.billingPaymentId = billing._id;
        yield session.save();
        return session;
    });
}
function applySucceeded(data) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const paymentId = String(data.payment_id || '');
        if (!paymentId)
            return { activated: false, ignored: true, retryable: true };
        const already = yield PaymentSession_1.PaymentSession.findOne({ provider: 'dodo', idempotencyKey: `dodo:payment:${paymentId}`, status: { $in: ['paid', 'reconciled'] } });
        if (already)
            return { activated: false, ignored: false, session: already };
        let session = yield findCheckoutSession(data);
        if (session && (session.status === 'paid' || session.status === 'reconciled') && session.providerTransactionId !== paymentId) {
            const subscription = yield findSubscriptionRecord(data);
            session = subscription ? yield openRenewalSession(subscription, paymentId, data) : null;
        }
        else if (!session) {
            const subscription = yield findSubscriptionRecord(data);
            session = subscription ? yield openRenewalSession(subscription, paymentId, data) : null;
        }
        if (!session || session.provider !== 'dodo')
            return { activated: false, ignored: true, retryable: true };
        const currency = String(data.currency || '').toUpperCase();
        const total = Number(data.total_amount);
        const expected = (0, dodoProductMap_1.amountToCents)(yield expectedAmount(session));
        if (currency !== 'USD' || total !== expected) {
            logger_1.logger.warn('dodo_payment_amount_mismatch', { paymentSessionId: String(session._id), paymentId });
            return { activated: false, ignored: true, session };
        }
        session.providerTransactionId = paymentId;
        session.providerSubscriptionId = providerSubscriptionId(data) || session.providerSubscriptionId;
        session.providerCustomerId = String(((_a = data.customer) === null || _a === void 0 ? void 0 : _a.customer_id) || session.providerCustomerId || '');
        session.metadata = Object.assign(Object.assign({}, (session.metadata || {})), { dodoPaymentId: paymentId, dodoSubscriptionId: session.providerSubscriptionId || '' });
        session.markModified('metadata');
        yield session.save();
        if (session.billingPaymentId) {
            yield BillingPayment_1.BillingPayment.updateOne({ _id: session.billingPaymentId }, {
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
        const activation = yield (0, billingActivationService_1.activateSubscriptionFromPayment)({
            paymentSessionId: String(session._id),
            provider: 'dodo',
            providerRef: session.providerRef,
            rawProviderResponse: { provider: 'dodo', paymentId },
            paidAt: new Date()
        });
        if (session.providerSubscriptionId) {
            yield Subscription_1.Subscription.updateOne({ _id: ((_b = activation.subscription) === null || _b === void 0 ? void 0 : _b._id) || session.subscriptionId }, {
                $set: { provider: 'dodo', providerSubscriptionId: session.providerSubscriptionId, providerCustomerId: session.providerCustomerId }
            });
        }
        return { activated: activation.alreadyProcessed !== true, ignored: false, session };
    });
}
function markOpenFailed(data, status) {
    return __awaiter(this, void 0, void 0, function* () {
        const session = yield findCheckoutSession(data);
        if (!session)
            return { activated: false, ignored: true, retryable: true };
        if (session.status === 'paid' || session.status === 'reconciled')
            return { activated: false, ignored: true, session };
        yield PaymentSession_1.PaymentSession.updateOne({ _id: session._id, status: { $in: ['pending', 'provider_created'] } }, { $set: { status, failedAt: new Date() } });
        if (session.billingPaymentId) {
            yield BillingPayment_1.BillingPayment.updateOne({ _id: session.billingPaymentId, status: 'pending' }, { $set: { status, failedAt: new Date() } });
        }
        return { activated: false, ignored: false, session };
    });
}
function syncSubscription(data_1, status_1) {
    return __awaiter(this, arguments, void 0, function* (data, status, extra = {}) {
        var _a;
        const subscription = yield findSubscriptionRecord(data);
        if (!subscription)
            return { activated: false, ignored: true };
        yield Subscription_1.Subscription.updateOne({ _id: subscription._id }, {
            $set: Object.assign({ status, provider: 'dodo', providerSubscriptionId: providerSubscriptionId(data) || subscription.providerSubscriptionId, providerCustomerId: String(((_a = data.customer) === null || _a === void 0 ? void 0 : _a.customer_id) || subscription.providerCustomerId || '') }, extra)
        });
        return { activated: false, ignored: false };
    });
}
function applyEvent(event) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const type = String(event.type || '');
        const data = event.data || {};
        if (!KNOWN_EVENTS.has(type))
            return { activated: false, ignored: true };
        if (type === 'payment.succeeded')
            return applySucceeded(data);
        if (type === 'payment.failed' || type === 'subscription.failed')
            return markOpenFailed(data, 'failed');
        if (type === 'payment.cancelled')
            return markOpenFailed(data, 'cancelled');
        if (type === 'payment.processing' || type === 'subscription.update_payment_method' || type === 'subscription.unpaused') {
            return { activated: false, ignored: false, session: yield findCheckoutSession(data) };
        }
        if (type === 'subscription.active') {
            const session = yield findCheckoutSession(data);
            const subscription = yield findSubscriptionRecord(data);
            const providerId = providerSubscriptionId(data);
            if (session && providerId) {
                yield PaymentSession_1.PaymentSession.updateOne({ _id: session._id }, { $set: { providerSubscriptionId: providerId, providerCustomerId: String(((_a = data.customer) === null || _a === void 0 ? void 0 : _a.customer_id) || '') } });
            }
            if (subscription && providerId) {
                yield Subscription_1.Subscription.updateOne({ _id: subscription._id }, { $set: { providerSubscriptionId: providerId, providerCustomerId: String(((_b = data.customer) === null || _b === void 0 ? void 0 : _b.customer_id) || ''), provider: subscription.provider || 'dodo' } });
            }
            if (!session && !subscription)
                return { activated: false, ignored: true, retryable: true };
            return { activated: false, ignored: false, session };
        }
        if (type === 'subscription.renewed') {
            const paymentId = String(data.payment_id || '');
            if (!paymentId)
                return { activated: false, ignored: true };
            const paid = yield PaymentSession_1.PaymentSession.findOne({ provider: 'dodo', idempotencyKey: `dodo:payment:${paymentId}`, status: { $in: ['paid', 'reconciled'] } });
            const subscription = yield findSubscriptionRecord(data);
            if (!subscription)
                return { activated: false, ignored: true, retryable: true };
            if (!paid)
                yield openRenewalSession(subscription, paymentId, data);
            if (data.next_billing_date && paid) {
                const next = new Date(data.next_billing_date);
                if (!Number.isNaN(next.getTime())) {
                    yield Subscription_1.Subscription.updateOne({ _id: subscription._id, providerSubscriptionId: providerSubscriptionId(data) || subscription.providerSubscriptionId }, {
                        $set: { nextPaymentAt: next, currentPeriodEnd: next }
                    });
                }
            }
            return { activated: false, ignored: false };
        }
        if (type === 'subscription.past_due' || type === 'subscription.on_hold' || type === 'subscription.paused') {
            return syncSubscription(data, 'past_due', { suspensionReason: type });
        }
        if (type === 'subscription.cancelled')
            return syncSubscription(data, 'cancelled', { cancelledAt: new Date() });
        if (type === 'subscription.expired')
            return syncSubscription(data, 'expired');
        if (type === 'subscription.plan_changed' || type === 'subscription.updated') {
            logger_1.logger.warn('dodo_subscription_status_mismatch', { type, providerSubscriptionId: providerSubscriptionId(data) });
            return { activated: false, ignored: true };
        }
        if (type === 'refund.succeeded') {
            const paymentId = String(data.payment_id || '');
            const payment = yield BillingPayment_1.BillingPayment.findOne({ provider: 'dodo', providerTransactionId: paymentId });
            if (!payment)
                return { activated: false, ignored: true, retryable: true };
            const partial = data.is_partial === true;
            yield BillingPayment_1.BillingPayment.updateOne({ _id: payment._id }, {
                $set: {
                    status: partial ? payment.status : 'refunded',
                    rawResponse: Object.assign(Object.assign({}, (payment.rawResponse || {})), { refundId: data.refund_id, refundAmount: data.amount, partial })
                }
            });
            if (!partial && payment.subscriptionId) {
                yield Subscription_1.Subscription.updateOne({ _id: payment.subscriptionId }, { $set: { status: 'past_due', suspensionReason: 'dodo_refund' } });
            }
            return { activated: false, ignored: false };
        }
        return { activated: false, ignored: true };
    });
}
function processVerifiedDodoEvent(event, eventId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        const fingerprint = `${event.type || ''}|${((_a = event.data) === null || _a === void 0 ? void 0 : _a.payment_id) || ''}|${((_b = event.data) === null || _b === void 0 ? void 0 : _b.subscription_id) || ''}|${((_c = event.data) === null || _c === void 0 ? void 0 : _c.refund_id) || ''}`;
        const claim = yield claimDodoEvent(eventId, fingerprint);
        if (claim.action === 'duplicate')
            return { status: 200, body: { status: 'duplicate', activated: false } };
        if (claim.action === 'in_progress' || !claim.receipt)
            return { status: 200, body: { status: 'in_progress', activated: false } };
        const receipt = claim.receipt;
        try {
            const applied = yield applyEvent(event);
            if (applied.retryable) {
                receipt.status = 'failed';
                receipt.lastError = 'The Dodo event did not match a Mantis subscription payment.';
                yield receipt.save();
                return { status: 500, body: { status: 'retry', activated: false } };
            }
            receipt.status = 'processed';
            receipt.processedAt = new Date();
            if ((_d = applied.session) === null || _d === void 0 ? void 0 : _d.companyId)
                receipt.companyId = applied.session.companyId;
            yield receipt.save();
            logger_1.logger.info('dodo_webhook_processed', {
                eventId,
                type: event.type,
                paymentSessionId: applied.session ? String(applied.session._id) : undefined,
                activated: applied.activated,
                ignored: applied.ignored
            });
            return { status: 200, body: { status: applied.ignored ? 'ignored' : 'received', activated: applied.activated } };
        }
        catch (error) {
            receipt.status = 'failed';
            receipt.lastError = String(error.message || error).slice(0, 200);
            yield receipt.save().catch(() => undefined);
            logger_1.logger.warn('dodo_webhook_failed', { eventId, type: event.type, message: receipt.lastError });
            return { status: 500, body: { status: 'retry', activated: false } };
        }
    });
}
function verifyDodoWebhook(rawBody, headers) {
    const config = (0, providerAvailability_1.readDodoConfig)();
    if (!config.enabled || !config.webhookKey) {
        const error = new Error('Dodo webhook is not configured.');
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
        const error = new Error('Dodo webhook signature is missing.');
        error.statusCode = 401;
        error.code = 'DODO_SIGNATURE_MISSING';
        throw error;
    }
    const gateway = (0, dodoClient_1.getDodoGateway)();
    if (!gateway) {
        const error = new Error('Dodo webhook is not configured.');
        error.statusCode = 503;
        error.code = 'DODO_NOT_CONFIGURED';
        throw error;
    }
    return gateway.webhooks.unwrap(rawBody, { headers: signatureHeaders });
}
function reconcileDodoPayment(paymentSessionId, companyId, hintedPaymentId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const session = yield PaymentSession_1.PaymentSession.findOne({ _id: paymentSessionId, companyId, provider: 'dodo' });
        if (!session)
            return { status: 404, body: { message: 'Checkout was not found.', code: 'PAYMENT_SESSION_NOT_FOUND' } };
        if (session.status === 'reconciled' || session.status === 'paid') {
            return { status: 200, body: { status: session.status, activated: session.status === 'reconciled' } };
        }
        const paymentId = String(hintedPaymentId || ((_a = session.metadata) === null || _a === void 0 ? void 0 : _a.dodoPaymentId) || '').trim();
        if (!paymentId)
            return { status: 200, body: { status: session.status, activated: false } };
        const gateway = (0, dodoClient_1.getDodoGateway)();
        if (!gateway)
            return { status: 503, body: { message: 'Dodo Payments is not configured.', code: 'DODO_NOT_CONFIGURED' } };
        const payment = yield gateway.payments.retrieve(paymentId);
        const metadataSessionId = metadataString(payment.metadata, 'mantis_payment_session_id');
        if (metadataSessionId && metadataSessionId !== String(session._id)) {
            return { status: 409, body: { message: 'This payment belongs to a different checkout.', code: 'PAYMENT_SESSION_MISMATCH', activated: false } };
        }
        if (!metadataSessionId && session.providerTransactionId !== payment.payment_id) {
            return { status: 409, body: { message: 'The payment could not be matched to this checkout.', code: 'PAYMENT_SESSION_MISMATCH', activated: false } };
        }
        if (payment.status !== 'succeeded')
            return { status: 200, body: { status: session.status, activated: false } };
        const result = yield processVerifiedDodoEvent({ type: 'payment.succeeded', data: payment }, `reconcile:${payment.payment_id}`);
        return { status: result.status, body: result.body };
    });
}
