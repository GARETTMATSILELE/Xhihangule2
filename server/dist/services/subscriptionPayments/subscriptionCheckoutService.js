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
exports.startDodoSubscriptionCheckout = startDodoSubscriptionCheckout;
const mongoose_1 = __importDefault(require("mongoose"));
const BillingPayment_1 = require("../../models/BillingPayment");
const PaymentSession_1 = require("../../models/PaymentSession");
const Subscription_1 = require("../../models/Subscription");
const User_1 = require("../../models/User");
const logger_1 = require("../../utils/logger");
const dodoPaymentsProvider_1 = require("./dodoPaymentsProvider");
const dodoProductMap_1 = require("./dodoProductMap");
const CHECKOUT_TTL_MS = 23 * 60 * 60 * 1000;
function startDodoSubscriptionCheckout(req, input) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId) || !req.user.userId) {
            return { status: 401, body: { message: 'Unauthorized', code: 'UNAUTHORIZED' } };
        }
        const amount = yield (0, dodoProductMap_1.subscriptionListPrice)(input.plan, input.cycle);
        if (amount == null || amount <= 0) {
            return { status: 503, body: { message: 'This plan does not have a configured price', code: 'REGISTRATION_PRICE_NOT_CONFIGURED' } };
        }
        const user = yield User_1.User.findById(req.user.userId).select('email firstName lastName').lean();
        const email = String((user === null || user === void 0 ? void 0 : user.email) || '').trim();
        if (!email)
            return { status: 422, body: { message: 'A customer email is required for card checkout.', code: 'CUSTOMER_EMAIL_REQUIRED' } };
        const name = `${(user === null || user === void 0 ? void 0 : user.firstName) || ''} ${(user === null || user === void 0 ? void 0 : user.lastName) || ''}`.trim() || email;
        const subscription = ((_b = input.openSession) === null || _b === void 0 ? void 0 : _b.subscriptionId)
            ? yield Subscription_1.Subscription.findById(input.openSession.subscriptionId)
            : yield Subscription_1.Subscription.findOneAndUpdate({ companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId) }, { $setOnInsert: { companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId), plan: input.plan, cycle: input.cycle, status: 'past_due' } }, { upsert: true, new: true });
        if (!subscription)
            return { status: 409, body: { message: 'Subscription was not found.', code: 'SUBSCRIPTION_NOT_FOUND' } };
        let session = input.openSession || null;
        if (!session) {
            const idempotencyKey = req.get('idempotency-key') || `dodo-open:${req.user.companyId}:${input.plan}:${input.cycle}`;
            session = yield PaymentSession_1.PaymentSession.findOne({ idempotencyKey });
            if (!session || session.status === 'paid' || session.status === 'reconciled' || session.status === 'cancelled' || session.status === 'expired') {
                const freshKey = session ? `${idempotencyKey}:${Date.now()}` : idempotencyKey;
                session = yield PaymentSession_1.PaymentSession.findOneAndUpdate({ idempotencyKey: freshKey }, {
                    $setOnInsert: {
                        companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId),
                        userId: new mongoose_1.default.Types.ObjectId(req.user.userId),
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
                }, { upsert: true, new: true });
            }
        }
        if (!session)
            return { status: 503, body: { message: 'Checkout could not be opened.', code: 'CHECKOUT_NOT_CREATED' } };
        if (session.provider !== 'dodo') {
            return { status: 409, body: { message: 'A payment attempt is already open with another provider.', code: 'PAYMENT_ATTEMPT_PENDING', paymentSessionId: session._id } };
        }
        if (session.amount !== amount && (session.status === 'pending' || session.status === 'provider_created')) {
            session.amount = amount;
            yield session.save();
        }
        let payment = session.billingPaymentId ? yield BillingPayment_1.BillingPayment.findById(session.billingPaymentId) : null;
        if (!payment) {
            payment = yield BillingPayment_1.BillingPayment.create({
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
            session.billingPaymentId = payment._id;
            yield session.save();
        }
        const createdAt = Number(((_c = session.metadata) === null || _c === void 0 ? void 0 : _c.dodoCheckoutCreatedAt) || 0);
        const existingUrl = String(((_d = session.metadata) === null || _d === void 0 ? void 0 : _d.dodoCheckoutUrl) || '');
        if (existingUrl && createdAt && Date.now() - createdAt < CHECKOUT_TTL_MS && session.status !== 'paid' && session.status !== 'reconciled') {
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
            const checkout = yield (0, dodoPaymentsProvider_1.createDodoPaymentsProvider)().createCheckout({
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
            session.metadata = Object.assign(Object.assign(Object.assign({}, (session.metadata || {})), checkout.metadata), { dodoCheckoutUrl: checkout.redirectUrl, dodoCheckoutCreatedAt: Date.now() });
            session.markModified('metadata');
            yield session.save();
            yield BillingPayment_1.BillingPayment.updateOne({ _id: payment._id }, { $set: { provider: 'dodo', amount, currency: 'USD', providerRef: checkout.providerTransactionId } });
            logger_1.logger.info('dodo_checkout_created', {
                paymentSessionId: String(session._id),
                companyId: String(session.companyId),
                provider: 'dodo',
                mode: checkout.metadata.mode
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
        }
        catch (error) {
            const coded = error;
            logger_1.logger.warn('dodo_checkout_failed', {
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
    });
}
