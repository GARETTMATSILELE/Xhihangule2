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
function activateSubscriptionFromPayment(input) {
    return __awaiter(this, void 0, void 0, function* () {
        const paidAt = input.paidAt || new Date();
        const query = {};
        if (input.paymentSessionId) {
            query._id = input.paymentSessionId;
        }
        else if (input.provider && input.providerRef) {
            query.provider = input.provider;
            query.providerRef = input.providerRef;
        }
        else {
            throw new errorHandler_1.AppError('paymentSessionId or provider/providerRef is required', 400, 'PAYMENT_SESSION_REQUIRED');
        }
        const paymentSession = yield PaymentSession_1.PaymentSession.findOne(query);
        if (!paymentSession) {
            throw new errorHandler_1.AppError('Payment session not found', 404, 'PAYMENT_SESSION_NOT_FOUND');
        }
        if (paymentSession.status === 'paid' || paymentSession.status === 'reconciled') {
            return { paymentSession, alreadyProcessed: true };
        }
        paymentSession.status = 'paid';
        paymentSession.paidAt = paidAt;
        paymentSession.rawProviderResponse = input.rawProviderResponse || paymentSession.rawProviderResponse;
        yield paymentSession.save();
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
        paymentSession.subscriptionId = subscription._id;
        paymentSession.status = 'reconciled';
        yield paymentSession.save();
        if (paymentSession.billingPaymentId) {
            yield BillingPayment_1.BillingPayment.findByIdAndUpdate(paymentSession.billingPaymentId, {
                $set: {
                    subscriptionId: subscription._id,
                    paymentSessionId: paymentSession._id,
                    status: 'paid',
                    paidAt,
                    reconciledAt: now,
                    rawResponse: input.rawProviderResponse
                }
            });
        }
        yield Company_1.Company.findByIdAndUpdate(paymentSession.companyId, {
            $set: {
                tenantStatus: 'active',
                onboardingStatus: 'INITIALIZING_WORKSPACE',
                subscriptionStatus: 'active',
                subscriptionEndDate: periodEnd,
                isActive: true
            }
        });
        if (paymentSession.onboardingSessionId) {
            yield OnboardingSession_1.OnboardingSession.findByIdAndUpdate(paymentSession.onboardingSessionId, {
                $set: {
                    status: 'INITIALIZING_WORKSPACE',
                    currentStep: 'WORKSPACE_SETUP',
                    subscriptionId: subscription._id,
                    paymentSessionId: paymentSession._id,
                    completedAt: now
                }
            });
        }
        return { paymentSession, subscription, alreadyProcessed: false };
    });
}
