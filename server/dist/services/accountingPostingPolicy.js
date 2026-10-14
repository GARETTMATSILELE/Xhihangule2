"use strict";
/**
 * Central posting eligibility for payment-derived accounting.
 * Every writer (controllers, change streams, jobs, LedgerEvent processor)
 * must consult this module rather than adding local `if (isProvisional)` guards.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.USER_BALANCE_INTENDED_MEANING = exports.OWNER_INCOME_SOURCE_OF_TRUTH = exports.COMPANY_REVENUE_SOURCE_OF_TRUTH = void 0;
exports.isReversalRow = isReversalRow;
exports.isProvisionalPayment = isProvisionalPayment;
exports.isDepositOnlyPayment = isDepositOnlyPayment;
exports.evaluatePermanentAccountingPolicy = evaluatePermanentAccountingPolicy;
exports.shouldPostOwnerIncome = shouldPostOwnerIncome;
exports.shouldPostAgentCommission = shouldPostAgentCommission;
exports.shouldPostCompanyCommission = shouldPostCompanyCommission;
exports.shouldPostJournal = shouldPostJournal;
exports.shouldPostTrust = shouldPostTrust;
exports.shouldAttemptAccountingReversal = shouldAttemptAccountingReversal;
const deny = (reason, extras) => (Object.assign({ allowed: false, reason, skipOwnerIncome: true, skipAgentCommission: true, skipCompanyCommission: true, skipJournal: true, skipTrust: true, skipPassThrough: true }, extras));
const allowAll = () => ({
    allowed: true,
    skipOwnerIncome: false,
    skipAgentCommission: false,
    skipCompanyCommission: false,
    skipJournal: false,
    skipTrust: false,
    skipPassThrough: false
});
function isReversalRow(payment) {
    return Boolean(payment === null || payment === void 0 ? void 0 : payment.reversalOfPaymentId) || Number((payment === null || payment === void 0 ? void 0 : payment.amount) || 0) < 0;
}
function isProvisionalPayment(payment) {
    return (payment === null || payment === void 0 ? void 0 : payment.isProvisional) === true;
}
/**
 * Deposit-only means there is a deposit and no rental/sale cash (`amount`).
 * `amount` is the rent (or sale) portion, not the receipt total.
 * Combined payments (amount > 0 and depositAmount > 0) are not deposit-only.
 */
function isDepositOnlyPayment(payment) {
    const deposit = Number((payment === null || payment === void 0 ? void 0 : payment.depositAmount) || 0);
    const amount = Number((payment === null || payment === void 0 ? void 0 : payment.amount) || 0);
    return deposit > 0 && amount <= 0;
}
/**
 * Provisional payments must not create permanent accounting artifacts
 * unless an explicit accounting workflow authorizes them (none currently does).
 *
 * Authorised exception: none. Finalization (`isProvisional: false`) is the
 * only path that unlocks permanent posting.
 */
function evaluatePermanentAccountingPolicy(payment) {
    if (!payment)
        return deny('missing_payment');
    if (payment.reversalOfPaymentId)
        return deny('reversal_row');
    if (Number(payment.amount || 0) < 0)
        return deny('negative_amount');
    if (String(payment.status || '') !== 'completed')
        return deny('not_completed');
    if (payment.isProvisional === true)
        return deny('provisional');
    if (payment.isInSuspense === true)
        return deny('suspense');
    if (isDepositOnlyPayment(payment)) {
        return deny('deposit_only');
    }
    const decision = allowAll();
    if (payment.commissionFinalized === false) {
        decision.skipAgentCommission = true;
        decision.skipCompanyCommission = true;
    }
    // Trust posting is sale-only; rental/introduction never post buyer trust receipts.
    if (String(payment.paymentType || '') !== 'sale') {
        decision.skipTrust = true;
    }
    return decision;
}
function shouldPostOwnerIncome(payment) {
    return evaluatePermanentAccountingPolicy(payment).allowed
        && !evaluatePermanentAccountingPolicy(payment).skipOwnerIncome;
}
function shouldPostAgentCommission(payment) {
    const d = evaluatePermanentAccountingPolicy(payment);
    return d.allowed && !d.skipAgentCommission;
}
function shouldPostCompanyCommission(payment) {
    const d = evaluatePermanentAccountingPolicy(payment);
    return d.allowed && !d.skipCompanyCommission;
}
function shouldPostJournal(payment) {
    const d = evaluatePermanentAccountingPolicy(payment);
    return d.allowed && !d.skipJournal;
}
function shouldPostTrust(payment) {
    const d = evaluatePermanentAccountingPolicy(payment);
    return d.allowed && !d.skipTrust;
}
/**
 * Reversal may run against a payment that is already `reversed`.
 * It must still attempt to retire leftover artifacts (partial failure recovery).
 */
function shouldAttemptAccountingReversal(payment) {
    if (!payment)
        return false;
    if (payment.reversalOfPaymentId)
        return false;
    const status = String(payment.status || '');
    const postingStatus = String(payment.postingStatus || '');
    return status === 'reversed' || postingStatus === 'reversed' || Boolean(payment.reversalPaymentId);
}
exports.COMPANY_REVENUE_SOURCE_OF_TRUTH = 'CompanyAccount.transactions (active, non-archived agency commission income)';
exports.OWNER_INCOME_SOURCE_OF_TRUTH = 'PropertyAccount.transactions (completed income, non-PASS_THROUGH)';
exports.USER_BALANCE_INTENDED_MEANING = 'User.balance is a leftover agent/admin wallet field — not the owner income ledger. Owner income lives on PropertyAccount.';
