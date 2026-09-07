"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanStatementDescription = exports.formatRentPeriodDescription = void 0;
const MONTH_NAMES = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'
];
const toMonthYear = (month, year) => {
    const m = Number(month);
    const y = Number(year);
    if (!Number.isInteger(m) || !Number.isInteger(y) || m < 1 || m > 12 || y < 1900)
        return undefined;
    return { month: m, year: y };
};
const addMonths = (start, extraMonths) => {
    const index = start.year * 12 + (start.month - 1) + extraMonths;
    return {
        year: Math.floor(index / 12),
        month: (index % 12) + 1
    };
};
const monthLabel = (value) => `${MONTH_NAMES[value.month - 1]} ${value.year}`;
/**
 * Formats stored rental-period metadata for landlord statements.
 * Does not infer a rental month from the payment/transaction date.
 */
const formatRentPeriodDescription = (input) => {
    var _a, _b, _c, _d;
    const start = toMonthYear((_a = input.advancePeriodStart) === null || _a === void 0 ? void 0 : _a.month, (_b = input.advancePeriodStart) === null || _b === void 0 ? void 0 : _b.year) ||
        toMonthYear(input.rentalPeriodMonth, input.rentalPeriodYear);
    if (!start)
        return undefined;
    const monthsPaid = Number(input.advanceMonthsPaid || 0);
    const explicitEnd = toMonthYear((_c = input.advancePeriodEnd) === null || _c === void 0 ? void 0 : _c.month, (_d = input.advancePeriodEnd) === null || _d === void 0 ? void 0 : _d.year);
    const end = explicitEnd || (monthsPaid > 1 ? addMonths(start, monthsPaid - 1) : start);
    if (end.year === start.year && end.month === start.month) {
        return `${monthLabel(start)} Rent`;
    }
    if (end.year === start.year) {
        return `${MONTH_NAMES[start.month - 1]}–${MONTH_NAMES[end.month - 1]} ${start.year} Rent`;
    }
    return `${monthLabel(start)}–${monthLabel(end)} Rent`;
};
exports.formatRentPeriodDescription = formatRentPeriodDescription;
const cleanStatementDescription = (description, fallback = 'Transaction') => {
    const text = String(description || '').trim();
    if (!text)
        return fallback;
    const withoutRef = text
        .replace(/\s*[-–—]\s*(REF[-_:]?\s*\S+)/gi, '')
        .replace(/\bREF[-_:]?\s*\S+/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    if (!withoutRef)
        return fallback;
    if (/^rental income$/i.test(withoutRef))
        return 'Rental Income';
    if (/^sale income$/i.test(withoutRef))
        return 'Sale Income';
    if (/^owner payout$/i.test(withoutRef))
        return 'Owner Payout';
    return withoutRef;
};
exports.cleanStatementDescription = cleanStatementDescription;
