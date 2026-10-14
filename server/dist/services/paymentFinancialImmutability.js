"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PAYMENT_FINANCIAL_FIELDS = exports.COMPLETED_PAYMENT_IMMUTABLE_MESSAGE = void 0;
exports.isCompletedFinancialPayment = isCompletedFinancialPayment;
exports.collectQueryUpdateKeys = collectQueryUpdateKeys;
exports.financialFieldsInQueryUpdate = financialFieldsInQueryUpdate;
exports.financialFieldsPresentInPayload = financialFieldsPresentInPayload;
exports.assertCompletedPaymentFinanciallyImmutable = assertCompletedPaymentFinanciallyImmutable;
/**
 * Completed financial Payments are immutable for material financial fields.
 * Corrections belong on the existing reverse → reversal payment → correction draft workflow.
 * Do not UPDATE the original completed Payment amount.
 */
exports.COMPLETED_PAYMENT_IMMUTABLE_MESSAGE = 'Completed financial Payments cannot be edited directly. Reverse the original Payment and post a correction through the approved correction process.';
exports.PAYMENT_FINANCIAL_FIELDS = [
    'amount',
    'depositAmount',
    'rentAllocated',
    'levyAllocated',
    'rentUsed',
    'levyUsed',
    'commissionDetails',
    'vatIncluded',
    'vatRate',
    'vatAmount',
    'applyVatOnCommission',
    'vatOnCommissionRate',
    'vatCommissionTreatment',
    'currency',
    'paymentMethod',
    'propertyId',
    'tenantId',
    'leaseId',
    'agentId',
    'companyId',
    'paymentDate',
    'rentalPeriodMonth',
    'rentalPeriodYear',
    'paymentType',
    'paymentLines'
];
function isCompletedFinancialPayment(payment) {
    if (!payment)
        return false;
    if (payment.isProvisional === true || payment.isInSuspense === true)
        return false;
    const status = String(payment.status || '').toLowerCase();
    const posting = String(payment.postingStatus || '').toLowerCase();
    return status === 'completed' || posting === 'posted' || status === 'reversed';
}
const UPDATE_OPERATORS_WITH_KEYS = ['$set', '$unset', '$inc', '$push', '$addToSet', '$pull', '$rename'];
function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
/** Collect top-level and dotted keys from a Mongoose query update document. */
function collectQueryUpdateKeys(update) {
    if (!isPlainObject(update))
        return [];
    const keys = [];
    let sawOperator = false;
    for (const op of UPDATE_OPERATORS_WITH_KEYS) {
        const payload = update[op];
        if (!isPlainObject(payload))
            continue;
        sawOperator = true;
        keys.push(...Object.keys(payload));
    }
    if (!sawOperator) {
        keys.push(...Object.keys(update).filter((key) => !key.startsWith('$')));
    }
    return keys;
}
function financialFieldsInQueryUpdate(update) {
    const keys = collectQueryUpdateKeys(update);
    return exports.PAYMENT_FINANCIAL_FIELDS.filter((field) => keys.some((key) => key === field || key.startsWith(`${field}.`)));
}
function financialFieldsPresentInPayload(payload) {
    if (!payload || typeof payload !== 'object')
        return [];
    const own = exports.PAYMENT_FINANCIAL_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(payload, field));
    if (own.length)
        return own;
    return financialFieldsInQueryUpdate(payload);
}
function assertCompletedPaymentFinanciallyImmutable(payment, payload) {
    if (!isCompletedFinancialPayment(payment))
        return;
    const attempted = financialFieldsPresentInPayload(payload || {});
    if (payload && attempted.length === 0)
        return;
    const error = new Error(exports.COMPLETED_PAYMENT_IMMUTABLE_MESSAGE);
    error.statusCode = 409;
    error.code = 'PAYMENT_FINANCIAL_IMMUTABLE';
    throw error;
}
