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
exports.resolvePaynowProviderRef = resolvePaynowProviderRef;
exports.notePaynowLateStatus = notePaynowLateStatus;
exports.applyPolledPayment = applyPolledPayment;
const PaymentSession_1 = require("../models/PaymentSession");
const BillingPayment_1 = require("../models/BillingPayment");
const billingActivationService_1 = require("./billingActivationService");
const registrationPaymentPolicy_1 = require("./registrationPaymentPolicy");
const auditService_1 = require("./auditService");
const financialOperationVisibility_1 = require("./financialOperationVisibility");
const logger_1 = require("../utils/logger");
const auditPolicy_1 = require("./auditPolicy");
const operationalSignal_1 = require("./operationalSignal");
function resolvePaynowProviderRef(reference) {
    return __awaiter(this, void 0, void 0, function* () {
        const sessions = yield PaymentSession_1.PaymentSession.find({ provider: 'paynow', providerRef: reference });
        if (sessions.length === 0)
            return { kind: 'missing' };
        if (sessions.length === 1)
            return { kind: 'unique', session: sessions[0] };
        const sessionIds = sessions.map((session) => String(session._id));
        logger_1.logger.error('paynow_provider_ref_ambiguous', {
            correlationId: reference,
            reference,
            sessionCount: sessions.length,
            sessionIds
        });
        const companyIds = Array.from(new Set(sessions.map((session) => String(session.companyId || '')).filter(Boolean)));
        for (const companyId of companyIds) {
            try {
                if (process.env.NODE_ENV !== 'production' && process.env.MANTIS_TEST_SEAM === '1' && global.__failPaynowReview) {
                    global.__failPaynowReview = false;
                    throw new Error('PHASE_FAIL_PAYNOW_REVIEW');
                }
                yield (0, financialOperationVisibility_1.upsertFinancialReview)({
                    companyId,
                    component: 'PAYNOW_PROVIDER_REF_AMBIGUOUS',
                    operationId: reference,
                    missingRecord: 'unique payment session',
                    issueType: 'mismatched',
                    recommendedReview: `Provider reference ${reference} matches ${sessions.length} Paynow sessions. No session was activated. Identify the session before any registration change.`
                });
            }
            catch (error) {
                (0, operationalSignal_1.signalOperationalFailure)('paynow_provider_ref_review_failed', {
                    correlationId: reference,
                    reference,
                    companyId,
                    error: String((error === null || error === void 0 ? void 0 : error.message) || error).slice(0, 200)
                });
            }
        }
        return { kind: 'ambiguous', sessions };
    });
}
function notePaynowLateStatus(reference, status, knownSession) {
    return __awaiter(this, void 0, void 0, function* () {
        const normalized = status.trim().toLowerCase();
        if (normalized !== 'refunded' && normalized !== 'disputed')
            return;
        let session = (knownSession === null || knownSession === void 0 ? void 0 : knownSession.companyId) ? knownSession : undefined;
        if (!session) {
            const resolved = yield resolvePaynowProviderRef(reference);
            if (resolved.kind === 'unique')
                session = resolved.session;
        }
        if (!(session === null || session === void 0 ? void 0 : session.companyId)) {
            (0, operationalSignal_1.signalOperationalFailure)('paynow_late_status_unmatched', {
                correlationId: reference,
                reference,
                status: normalized
            });
            return;
        }
        try {
            if (process.env.NODE_ENV !== 'production' && process.env.MANTIS_TEST_SEAM === '1' && global.__failPaynowLateReview) {
                global.__failPaynowLateReview = false;
                throw new Error('PHASE_FAIL_PAYNOW_LATE_REVIEW');
            }
            yield (0, financialOperationVisibility_1.upsertFinancialReview)({
                companyId: String(session.companyId),
                component: 'PAYNOW_LATE_STATUS',
                operationId: `${reference}:${normalized}`,
                missingRecord: 'manual review of a Paynow refund or dispute',
                issueType: 'mismatched',
                recommendedReview: `Paynow reported ${normalized} for reference ${reference} while the session was ${session.status}. The payment and subscription were not reversed.`
            });
        }
        catch (error) {
            (0, operationalSignal_1.signalOperationalFailure)('paynow_late_status_review_failed', {
                correlationId: reference,
                reference,
                companyId: String(session.companyId),
                status: normalized,
                error: String((error === null || error === void 0 ? void 0 : error.message) || error).slice(0, 200)
            });
        }
    });
}
function applyPolledPayment(reference, poll) {
    return __awaiter(this, void 0, void 0, function* () {
        const resolved = yield resolvePaynowProviderRef(reference);
        if (resolved.kind === 'missing')
            return { found: false, activated: false };
        if (resolved.kind === 'ambiguous') {
            return {
                found: true,
                activated: false,
                ignored: true,
                reviewRequired: true,
                paymentStatus: 'review_required'
            };
        }
        const session = resolved.session;
        const decision = (0, registrationPaymentPolicy_1.evaluateProviderPoll)({ amount: Number(session.amount), currency: session.currency || 'USD', providerRef: session.providerRef }, poll);
        const lateStatus = decision.outcome === 'failed' && (decision.status === 'refunded' || decision.status === 'disputed')
            ? decision.status
            : '';
        const terminal = session.status === 'paid' || session.status === 'reconciled' || session.status === 'cancelled' || session.status === 'failed' || session.status === 'expired';
        if (terminal && lateStatus) {
            yield notePaynowLateStatus(reference, lateStatus, session);
            return {
                found: true,
                activated: false,
                ignored: true,
                reviewRequired: true,
                paymentStatus: lateStatus,
                session
            };
        }
        if (session.status === 'cancelled' || session.status === 'failed' || session.status === 'expired') {
            return { found: true, paymentStatus: session.status, activated: false, ignored: true, session };
        }
        if (session.status === 'reconciled') {
            yield (0, billingActivationService_1.activateSubscriptionFromPayment)({
                paymentSessionId: String(session._id),
                provider: 'paynow',
                providerRef: reference,
                rawProviderResponse: session.rawProviderResponse,
                paidAt: session.paidAt || new Date()
            });
            return { found: true, paymentStatus: 'reconciled', activated: false, alreadyComplete: true, session };
        }
        if (session.status === 'paid') {
            if (decision.outcome !== 'paid') {
                return { found: true, paymentStatus: 'paid', activated: false, ignored: true, session };
            }
            const resumed = yield (0, billingActivationService_1.activateSubscriptionFromPayment)({
                paymentSessionId: String(session._id),
                provider: 'paynow',
                providerRef: reference,
                rawProviderResponse: session.rawProviderResponse,
                paidAt: session.paidAt || new Date()
            });
            return { found: true, paymentStatus: 'paid', activated: resumed.alreadyProcessed !== true, resumed: true, session };
        }
        if (decision.outcome === 'rejected') {
            const error = new Error(decision.reason);
            error.statusCode = 409;
            error.code = 'PAYMENT_MISMATCH';
            throw error;
        }
        if (decision.outcome === 'paid') {
            const audited = yield (0, auditService_1.recordAuditEvent)({
                companyId: String(session.companyId),
                action: 'payment.verified',
                entityType: 'PaymentSession',
                entityId: String(session._id),
                metadata: { providerRef: session.providerRef }
            });
            if (!audited) {
                const error = new Error('Payment activation was not started because the audit event could not be stored');
                error.code = 'AUDIT_PERSIST_FAILED';
                throw error;
            }
            const activation = yield (0, billingActivationService_1.activateSubscriptionFromPayment)({
                paymentSessionId: String(session._id),
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
            return { found: true, paymentStatus: 'paid', activated: activation.alreadyProcessed !== true, session };
        }
        if (decision.outcome === 'failed') {
            session.status = decision.status === 'cancelled' || decision.status === 'expired' ? decision.status : 'failed';
            session.failedAt = new Date();
            yield session.save();
            if (session.billingPaymentId) {
                yield BillingPayment_1.BillingPayment.findByIdAndUpdate(session.billingPaymentId, {
                    $set: { status: session.status === 'cancelled' ? 'cancelled' : 'failed', failedAt: session.failedAt }
                });
            }
            const action = session.status === 'cancelled' ? 'checkout.cancelled' : 'checkout.failed';
            const audited = yield (0, auditService_1.recordAuditEvent)({
                companyId: String(session.companyId),
                action,
                entityType: 'PaymentSession',
                entityId: String(session._id),
                metadata: { providerRef: session.providerRef }
            });
            if (!audited) {
                yield (0, auditPolicy_1.noteMissingAudit)({
                    action,
                    companyId: String(session.companyId),
                    entityId: String(session._id),
                    operationId: String(session._id)
                });
            }
            return { found: true, paymentStatus: session.status, activated: false, session };
        }
        return { found: true, paymentStatus: decision.status || session.status, activated: false, session };
    });
}
