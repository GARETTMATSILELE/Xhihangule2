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
exports.ACTIVE_REVERSAL_STATES = void 0;
exports.isReversalDocument = isReversalDocument;
exports.reversalStateOf = reversalStateOf;
exports.activeCommissionPaymentFilter = activeCommissionPaymentFilter;
exports.hasReversalInEffect = hasReversalInEffect;
exports.canStartPaymentReversal = canStartPaymentReversal;
exports.applyPaymentStatusFilter = applyPaymentStatusFilter;
exports.assertCorrectionDraftCanComplete = assertCorrectionDraftCanComplete;
/**
 * Authoritative reversal eligibility. Posting, reversal, reporting filters, and
 * correction-draft completion all use these predicates.
 * A reversed original keeps its amount. It is not an ordinary live receipt.
 */
const mongoose_1 = __importDefault(require("mongoose"));
const Payment_1 = require("../models/Payment");
const errorHandler_1 = require("../middleware/errorHandler");
exports.ACTIVE_REVERSAL_STATES = ['reversal_in_progress', 'reversal_incomplete', 'reversed'];
function isReversalDocument(payment) {
    return Boolean(payment === null || payment === void 0 ? void 0 : payment.reversalOfPaymentId) || Number((payment === null || payment === void 0 ? void 0 : payment.amount) || 0) < 0;
}
function reversalStateOf(payment) {
    return String((payment === null || payment === void 0 ? void 0 : payment.reversalState) || '');
}
/**
 * Completed commission rows that still represent live agency, agent, or PREA income.
 * A reversal document copies the positive snapshot and is excluded.
 * A fully reversed original is excluded. A pending correction is not completed.
 */
function activeCommissionPaymentFilter() {
    return {
        reversalOfPaymentId: { $exists: false },
        reversalState: { $ne: 'reversed' },
        amount: { $gte: 0 }
    };
}
function hasReversalInEffect(payment) {
    if (!payment || isReversalDocument(payment))
        return false;
    if (payment.reversalPaymentId)
        return true;
    return exports.ACTIVE_REVERSAL_STATES.includes(reversalStateOf(payment));
}
function canStartPaymentReversal(payment) {
    if (!payment)
        return { ok: false, reason: 'missing_payment' };
    if (isReversalDocument(payment))
        return { ok: false, reason: 'reversal_document' };
    if (hasReversalInEffect(payment))
        return { ok: false, reason: 'reversal_in_effect' };
    const postingStatus = String(payment.postingStatus || '');
    const status = String(payment.status || '');
    if (postingStatus !== 'posted' && status !== 'completed')
        return { ok: false, reason: 'not_posted' };
    return { ok: true };
}
/**
 * Status query used by payment lists. "reversed" matches reversal metadata,
 * not only the legacy payment.status value.
 */
function applyPaymentStatusFilter(query, status) {
    if (status !== 'reversed') {
        query.status = status;
        return;
    }
    const clause = {
        $or: [
            { status: 'reversed' },
            { postingStatus: 'reversed' },
            { reversalState: { $in: [...exports.ACTIVE_REVERSAL_STATES] } },
            { reversalPaymentId: { $exists: true } },
            { reversalOfPaymentId: { $exists: true } }
        ]
    };
    if (Array.isArray(query.$and))
        query.$and.push(clause);
    else
        query.$and = [clause];
}
function assertCorrectionDraftCanComplete(draft, companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        const looksLikeCorrection = Boolean(draft === null || draft === void 0 ? void 0 : draft.isCorrectionEntry) || String((draft === null || draft === void 0 ? void 0 : draft.referenceNumber) || '').startsWith('CORR-');
        if (!looksLikeCorrection)
            return;
        if (!companyId || !mongoose_1.default.Types.ObjectId.isValid(String(companyId))) {
            throw new errorHandler_1.AppError('Correction draft company is missing.', 409, 'CORRECTION_COMPANY_REQUIRED');
        }
        const linked = yield Payment_1.Payment.findOne({ correctedPaymentId: draft._id, companyId }).lean();
        if (!linked) {
            throw new errorHandler_1.AppError('Correction draft is not linked to an original payment in this company.', 409, 'CORRECTION_LINK_MISSING');
        }
        if (String(linked.companyId) !== String(companyId)) {
            throw new errorHandler_1.AppError('Correction draft belongs to another company.', 403, 'CORRECTION_COMPANY_MISMATCH');
        }
        if (String(linked.correctedPaymentId || '') !== String(draft._id)) {
            throw new errorHandler_1.AppError('Correction draft link does not match the original payment.', 409, 'CORRECTION_LINK_MISMATCH');
        }
        if (!linked.reversalPaymentId) {
            throw new errorHandler_1.AppError('Correction draft cannot be posted until the reversal payment exists.', 409, 'REVERSAL_PAYMENT_MISSING');
        }
        const reversal = yield Payment_1.Payment.findOne({
            _id: linked.reversalPaymentId,
            companyId
        }).select('_id reversalOfPaymentId amount companyId').lean();
        if (!reversal || String(reversal.reversalOfPaymentId || '') !== String(linked._id)) {
            throw new errorHandler_1.AppError('Correction draft reversal payment does not match the original.', 409, 'REVERSAL_LINK_MISMATCH');
        }
        if (String(linked.reversalState || '') !== 'reversed') {
            throw new errorHandler_1.AppError('Correction draft cannot be posted until the reversal accounting has settled.', 409, 'REVERSAL_NOT_SETTLED');
        }
    });
}
