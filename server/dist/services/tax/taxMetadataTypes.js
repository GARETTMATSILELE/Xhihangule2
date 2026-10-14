"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TRANSACTION_TAX_SOURCE_KINDS = exports.TAX_PERIOD_ASSIGNMENT_STATUSES = exports.TAX_PERIOD_TAX_TYPES = exports.TAX_PERIOD_STATUSES = exports.TAX_CLASSIFICATION_SOURCES = exports.TAX_CALCULATION_STATUSES = void 0;
exports.calendarPeriodKey = calendarPeriodKey;
exports.calendarPeriodBounds = calendarPeriodBounds;
exports.isTaxCalculationStatus = isTaxCalculationStatus;
exports.uncalculatedTaxFields = uncalculatedTaxFields;
exports.TAX_CALCULATION_STATUSES = [
    'NOT_APPLICABLE',
    'NOT_CALCULATED',
    'READY_FOR_CALCULATION',
    'CALCULATED',
    'REVIEW_REQUIRED',
    'FINALIZED'
];
exports.TAX_CLASSIFICATION_SOURCES = [
    'PROPERTY_PROFILE',
    'LANDLORD_PROFILE',
    'TAX_RULE',
    'USER_SELECTED',
    'ACCOUNTANT_REVIEW',
    'SYSTEM_DEFAULT'
];
exports.TAX_PERIOD_STATUSES = ['OPEN', 'REVIEW', 'FINALIZED', 'AMENDED', 'LOCKED'];
exports.TAX_PERIOD_TAX_TYPES = [
    'VAT',
    'PRESUMPTIVE_RENTAL_INCOME_TAX',
    'INCOME_TAX'
];
exports.TAX_PERIOD_ASSIGNMENT_STATUSES = [
    'ASSIGNED',
    'PERIOD_REQUIRED',
    'PERIOD_CLOSED'
];
exports.TRANSACTION_TAX_SOURCE_KINDS = [
    'PAYMENT_RENT',
    'PAYMENT_DEPOSIT',
    'EXPENSE',
    'OTHER_INCOME',
    'MAINTENANCE',
    'CAPITAL',
    'LIABILITY',
    'REVERSAL'
];
function calendarPeriodKey(date) {
    const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    return `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, '0')}`;
}
function calendarPeriodBounds(periodKey) {
    const [year, month] = periodKey.split('-').map(Number);
    const periodStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const periodEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    return { periodStart, periodEnd };
}
function isTaxCalculationStatus(value) {
    return typeof value === 'string' && exports.TAX_CALCULATION_STATUSES.includes(value);
}
/**
 * API/tax overlay must never emit 0 as a fake calculated tax.
 */
function uncalculatedTaxFields() {
    return {
        taxAmount: null,
        taxableAmount: null,
        taxRate: null,
        vatAmount: null,
        presumptiveTaxAmount: null,
        incomeTaxAmount: null
    };
}
