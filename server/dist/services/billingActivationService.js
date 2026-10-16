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
Object.defineProperty(exports, "__esModule", { value: true });
exports.activateSubscriptionFromPayment = activateSubscriptionFromPayment;
const Company_1 = require("../models/Company");
const Subscription_1 = require("../models/Subscription");
const PaymentSession_1 = require("../models/PaymentSession");
const BillingPayment_1 = require("../models/BillingPayment");
const OnboardingSession_1 = require("../models/OnboardingSession");
const errorHandler_1 = require("../middleware/errorHandler");
const testFailureSeam_1 = require("./testFailureSeam");
const AWAITING_REGISTRATION = ['PENDING_PAYMENT', 'PENDING_SETUP', 'FAILED_SETUP', 'PAYMENT_RECEIVED'];
function finishRegistrationIfNeeded(paymentSession, subscription, paidAt, rawProviderResponse) {
    return __awaiter(this, void 0, void 0, function* () {
        if (paymentSession.billingPaymentId) {
            const billing = yield BillingPayment_1.BillingPayment.findById(paymentSession.billingPaymentId).select('status');
            if (billing && billing.status !== 'paid') {
                yield BillingPayment_1.BillingPayment.findByIdAndUpdate(paymentSession.billingPaymentId, {
                    $set: {
                        subscriptionId: subscription._id,
                        paymentSessionId: paymentSession._id,
                        status: 'paid',
                        paidAt,
                        reconciledAt: new Date(),
                        rawResponse: rawProviderResponse
                    }
                });
            }
        }
        const company = yield Company_1.Company.findById(paymentSession.companyId).select('onboardingStatus onboardingCompleted');
        const awaitingRegistration = AWAITING_REGISTRATION.includes(String((company === null || company === void 0 ? void 0 : company.onboardingStatus) || ''));
        yield Company_1.Company.findByIdAndUpdate(paymentSession.companyId, {
            $set: {
                tenantStatus: 'active',
                onboardingStatus: awaitingRegistration ? 'INITIALIZING_WORKSPACE' : ((company === null || company === void 0 ? void 0 : company.onboardingStatus) || 'ACTIVE'),
                onboardingCompleted: awaitingRegistration ? false : (company === null || company === void 0 ? void 0 : company.onboardingCompleted) !== false,
                subscriptionStatus: 'active',
                subscriptionEndDate: subscription.currentPeriodEnd,
                isActive: true
            }
        });
        if (paymentSession.onboardingSessionId) {
            const onboarding = yield OnboardingSession_1.OnboardingSession.findById(paymentSession.onboardingSessionId).select('status');
            if (onboarding && AWAITING_REGISTRATION.includes(String(onboarding.status || ''))) {
                yield OnboardingSession_1.OnboardingSession.findByIdAndUpdate(paymentSession.onboardingSessionId, {
                    $set: {
                        status: 'INITIALIZING_WORKSPACE',
                        currentStep: 'WORKSPACE_SETUP',
                        subscriptionId: subscription._id,
                        paymentSessionId: paymentSession._id,
                        completedAt: new Date()
                    }
                });
            }
        }
    });
}
function reconciledResult(paymentSession, paidAt, rawProviderResponse) {
    return __awaiter(this, void 0, void 0, function* () {
        const subscription = paymentSession.subscriptionId
            ? yield Subscription_1.Subscription.findById(paymentSession.subscriptionId)
            : null;
        if (subscription)
            yield finishRegistrationIfNeeded(paymentSession, subscription, paidAt, rawProviderResponse);
        return { paymentSession, alreadyProcessed: true, subscription };
    });
}
function activateSubscriptionFromPayment(input) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        const paidAt = input.paidAt || new Date();
        const query = {};
        if (input.paymentSessionId) {
            query._id = input.paymentSessionId;
        }
        else if (input.provider && input.providerRef) {
            const matches = yield PaymentSession_1.PaymentSession.countDocuments({ provider: input.provider, providerRef: input.providerRef });
            if (matches > 1) {
                throw new errorHandler_1.AppError('More than one payment session shares this provider reference. Activation requires review.', 409, 'PAYMENT_SESSION_AMBIGUOUS');
            }
            query.provider = input.provider;
            query.providerRef = input.providerRef;
        }
        else {
            throw new errorHandler_1.AppError('paymentSessionId or provider/providerRef is required', 400, 'PAYMENT_SESSION_REQUIRED');
        }
        let paymentSession = yield PaymentSession_1.PaymentSession.findOne(query);
        if (!paymentSession) {
            throw new errorHandler_1.AppError('Payment session not found', 404, 'PAYMENT_SESSION_NOT_FOUND');
        }
        if (paymentSession.status === 'cancelled' || paymentSession.status === 'failed' || paymentSession.status === 'expired') {
            throw new errorHandler_1.AppError('This checkout can no longer be activated', 409, 'PAYMENT_SESSION_CLOSED');
        }
        if (paymentSession.status === 'reconciled') {
            return reconciledResult(paymentSession, paymentSession.paidAt || paidAt, input.rawProviderResponse);
        }
        if (paymentSession.status === 'pending' || paymentSession.status === 'provider_created') {
            const moved = yield PaymentSession_1.PaymentSession.findOneAndUpdate({ _id: paymentSession._id, status: { $in: ['pending', 'provider_created'] } }, {
                $set: {
                    status: 'paid',
                    paidAt,
                    rawProviderResponse: input.rawProviderResponse || paymentSession.rawProviderResponse
                }
            }, { new: true });
            paymentSession = moved || (yield PaymentSession_1.PaymentSession.findById(paymentSession._id));
            if (!paymentSession)
                throw new errorHandler_1.AppError('Payment session not found', 404, 'PAYMENT_SESSION_NOT_FOUND');
        }
        if (paymentSession.status === 'reconciled') {
            return reconciledResult(paymentSession, paymentSession.paidAt || paidAt, input.rawProviderResponse);
        }
        if (paymentSession.status === 'cancelled' || paymentSession.status === 'failed' || paymentSession.status === 'expired') {
            throw new errorHandler_1.AppError('This checkout can no longer be activated', 409, 'PAYMENT_SESSION_CLOSED');
        }
        if (paymentSession.status !== 'paid') {
            throw new errorHandler_1.AppError('This payment session cannot be activated from its current state', 409, 'PAYMENT_SESSION_STATE');
        }
        (0, testFailureSeam_1.throwOnceIfArmed)(String(paymentSession._id), String(((_a = paymentSession.metadata) === null || _a === void 0 ? void 0 : _a.testSeam) || ''), 'PHASE_FAIL_ACTIVATION_AFTER_PAID');
        const staleClaim = new Date(Date.now() - 2 * 60 * 1000);
        const owned = yield PaymentSession_1.PaymentSession.findOneAndUpdate({
            _id: paymentSession._id,
            status: 'paid',
            subscriptionId: null,
            $or: [
                { 'metadata.activationClaimedAt': null },
                { 'metadata.activationClaimedAt': { $lte: staleClaim } }
            ]
        }, { $set: { 'metadata.activationClaimedAt': new Date() } }, { new: true });
        if (!owned) {
            const current = yield PaymentSession_1.PaymentSession.findById(paymentSession._id);
            if ((current === null || current === void 0 ? void 0 : current.status) === 'reconciled') {
                return reconciledResult(current, current.paidAt || paidAt, input.rawProviderResponse);
            }
            if ((current === null || current === void 0 ? void 0 : current.subscriptionId) && current.status === 'paid') {
                paymentSession = current;
            }
            else {
                throw new errorHandler_1.AppError('Activation is already in progress for this payment', 409, 'ACTIVATION_IN_PROGRESS');
            }
        }
        else {
            paymentSession = owned;
        }
        (0, testFailureSeam_1.throwOnceIfArmed)(String(paymentSession._id), String(((_b = paymentSession.metadata) === null || _b === void 0 ? void 0 : _b.testSeam) || ''), 'PHASE_FAIL_ACTIVATION_AFTER_CLAIM');
        const now = new Date();
        const periodEnd = new Date(now);
        if (paymentSession.billingCycle === 'yearly')
            periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        else
            periodEnd.setMonth(periodEnd.getMonth() + 1);
        const subscriptionQuery = paymentSession.subscriptionId
            ? { _id: paymentSession.subscriptionId, companyId: paymentSession.companyId }
            : { companyId: paymentSession.companyId };
        const subscription = yield Subscription_1.Subscription.findOneAndUpdate(subscriptionQuery, {
            $set: {
                companyId: paymentSession.companyId,
                userId: paymentSession.userId,
                onboardingSessionId: paymentSession.onboardingSessionId,
                plan: paymentSession.plan,
                cycle: paymentSession.billingCycle,
                status: 'active',
                currentPeriodStart: now,
                currentPeriodEnd: periodEnd,
                nextPaymentAt: periodEnd,
                provider: paymentSession.provider,
                lastPaymentSessionId: paymentSession._id,
                lastPaymentAt: paidAt,
                lastReconciledAt: now
            }
        }, { upsert: true, new: true });
        (0, testFailureSeam_1.throwOnceIfArmed)(String(paymentSession._id), String(((_c = paymentSession.metadata) === null || _c === void 0 ? void 0 : _c.testSeam) || ''), 'PHASE_FAIL_ACTIVATION_AFTER_SUBSCRIPTION');
        paymentSession.subscriptionId = subscription._id;
        paymentSession.status = 'reconciled';
        yield paymentSession.save();
        (0, testFailureSeam_1.throwOnceIfArmed)(String(paymentSession._id), String(((_d = paymentSession.metadata) === null || _d === void 0 ? void 0 : _d.testSeam) || ''), 'PHASE_FAIL_ACTIVATION_AFTER_RECONCILED');
        yield finishRegistrationIfNeeded(paymentSession, subscription, paidAt, input.rawProviderResponse);
        return { paymentSession, subscription, alreadyProcessed: false };
    });
}
