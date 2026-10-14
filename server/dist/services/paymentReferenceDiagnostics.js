"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyPaymentReferenceGroup = classifyPaymentReferenceGroup;
function dayKey(value) {
    if (!value)
        return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return '';
    return date.toISOString().slice(0, 10);
}
/**
 * The schema asks for one non-empty reference per company.
 * Live rows also reuse a reference for separate installments, so this
 * classification is evidence for review. It does not merge or reject payments.
 */
function classifyPaymentReferenceGroup(records) {
    const amounts = new Set(records.map((row) => Number(row.amount)));
    const types = new Set(records.map((row) => String(row.paymentType || '')));
    const days = new Set(records.map((row) => dayKey(row.paymentDate) || dayKey(row.createdAt)));
    if (amounts.size === 1 && types.size === 1 && days.size === 1)
        return 'possible_duplicate';
    if (amounts.size > 1 || types.size > 1 || days.size > 1)
        return 'separate_transactions_sharing_a_reference';
    return 'review_required';
}
