"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PAYMENT_RECONCILIATION_BATCH_SIZE = void 0;
exports.buildOwnerIncomeReconciliationPaymentFilter = buildOwnerIncomeReconciliationPaymentFilter;
exports.isRecordIncomeEarlyExit = isRecordIncomeEarlyExit;
const mongoose_1 = __importDefault(require("mongoose"));
const accountingPostingPolicy_1 = require("./accountingPostingPolicy");
/**
 * Matches existing poll/failure-reprocessor conventions (100).
 * Caps prevent accidental unbounded in-memory batches.
 */
exports.PAYMENT_RECONCILIATION_BATCH_SIZE = Math.min(500, Math.max(1, Number(process.env.PAYMENT_RECONCILIATION_BATCH_SIZE || 100)));
/**
 * Mongo filter for payments that recordIncomeFromPayment might still attempt.
 *
 * Intentionally does NOT treat "income already on PropertyAccount" as skippable:
 * sale payments can require multiple ledger targets, and pass-through/expense
 * posting still runs after an existing income row. Skipping those would change
 * recovery behaviour.
 *
 * Payment-field exclusions match recordIncomeFromPayment early returns only:
 * not completed, reversal rows, negative amounts. Deposit-only is applied in
 * `isRecordIncomeEarlyExit` after a bounded fetch (avoids $expr on Cosmos).
 */
function buildOwnerIncomeReconciliationPaymentFilter(options) {
    const filter = {
        status: 'completed',
        amount: { $gte: 0 },
        $or: [{ reversalOfPaymentId: { $exists: false } }, { reversalOfPaymentId: null }],
        isProvisional: { $ne: true },
        isInSuspense: { $ne: true }
    };
    const companyId = typeof (options === null || options === void 0 ? void 0 : options.companyId) === 'string' ? options.companyId.trim() : '';
    if (companyId) {
        if (!mongoose_1.default.Types.ObjectId.isValid(companyId)) {
            throw new Error('Invalid companyId for payment reconciliation');
        }
        filter.companyId = new mongoose_1.default.Types.ObjectId(companyId);
    }
    if ((options === null || options === void 0 ? void 0 : options.paymentDateFrom) instanceof Date && !Number.isNaN(options.paymentDateFrom.getTime())) {
        filter.paymentDate = { $gte: options.paymentDateFrom };
    }
    return filter;
}
function isRecordIncomeEarlyExit(payment) {
    if (payment.reversalOfPaymentId)
        return true;
    if (Number(payment.amount || 0) < 0)
        return true;
    if (payment.status !== 'completed')
        return true;
    if (payment.isProvisional === true)
        return true;
    if (payment.isInSuspense === true)
        return true;
    if ((0, accountingPostingPolicy_1.isDepositOnlyPayment)(payment))
        return true;
    return false;
}
