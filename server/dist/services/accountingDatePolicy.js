"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveAccountingDates = resolveAccountingDates;
function copyDate(value) {
    if (!value)
        return null;
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (Number.isNaN(date.getTime()))
        return null;
    return date;
}
/**
 * The accounting date controls the period gate and the ledger date.
 * The original transaction date is copied and is never replaced by the posting time.
 * A bank payment date is stored beside the accounting date and does not move the period.
 */
function resolveAccountingDates(input) {
    const postedAt = copyDate(input.postedAt) || new Date();
    const originalTransactionDate = copyDate(input.originalTransactionDate);
    const explicitAccountingDate = copyDate(input.accountingDate);
    const accountingDate = explicitAccountingDate || originalTransactionDate || postedAt;
    return {
        originalTransactionDate,
        accountingDate: new Date(accountingDate.getTime()),
        settlementDate: copyDate(input.settlementDate),
        bankPaymentDate: copyDate(input.bankPaymentDate),
        postedAt
    };
}
