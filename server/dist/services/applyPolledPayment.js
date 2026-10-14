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
exports.applyPolledPayment = applyPolledPayment;
const PaymentSession_1 = require("../models/PaymentSession");
const BillingPayment_1 = require("../models/BillingPayment");
const billingActivationService_1 = require("./billingActivationService");
const registrationPaymentPolicy_1 = require("./registrationPaymentPolicy");
const auditService_1 = require("./auditService");
function applyPolledPayment(reference, poll) {
    return __awaiter(this, void 0, void 0, function* () {
        const session = yield PaymentSession_1.PaymentSession.findOne({ provider: 'paynow', providerRef: reference });
        if (!session)
            return { found: false, activated: false };
        if (session.status === 'paid' || session.status === 'reconciled') {
            return { found: true, paymentStatus: 'paid', activated: false, session };
        }
        const decision = (0, registrationPaymentPolicy_1.evaluateProviderPoll)({ amount: Number(session.amount), currency: session.currency || 'USD', providerRef: session.providerRef }, poll);
        if (decision.outcome === 'rejected') {
            const error = new Error(decision.reason);
            error.statusCode = 409;
            error.code = 'PAYMENT_MISMATCH';
            throw error;
        }
        if (decision.outcome === 'paid') {
            yield (0, auditService_1.recordAuditEvent)({
                companyId: String(session.companyId),
                action: 'payment.verified',
                entityType: 'PaymentSession',
                entityId: String(session._id),
                metadata: { providerRef: session.providerRef }
            });
            yield (0, billingActivationService_1.activateSubscriptionFromPayment)({
                provider: 'paynow',
                providerRef: reference,
                rawProviderResponse: {
                    status: 'paid',
                    amount: Number(poll.amount),
                    paynowReference: poll.paynowReference,
                    currency: poll.currency
                },
                paidAt: new Date()
            });
            return { found: true, paymentStatus: 'paid', activated: true, session };
        }
        if (decision.outcome === 'failed') {
            session.status = decision.status === 'cancelled' ? 'cancelled' : 'failed';
            session.failedAt = new Date();
            yield session.save();
            if (session.billingPaymentId) {
                yield BillingPayment_1.BillingPayment.findByIdAndUpdate(session.billingPaymentId, {
                    $set: { status: session.status === 'cancelled' ? 'cancelled' : 'failed', failedAt: session.failedAt }
                });
            }
            yield (0, auditService_1.recordAuditEvent)({
                companyId: String(session.companyId),
                action: session.status === 'cancelled' ? 'checkout.cancelled' : 'checkout.failed',
                entityType: 'PaymentSession',
                entityId: String(session._id),
                metadata: { providerRef: session.providerRef }
            });
            return { found: true, paymentStatus: session.status, activated: false, session };
        }
        return { found: true, paymentStatus: decision.status || session.status, activated: false, session };
    });
}
