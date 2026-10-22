"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanStatementDescription = exports.formatRentPeriodDescription = exports.formatAgentCommissionDescription = exports.formatPaidMonthLabel = void 0;
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
const resolvePeriodRange = (input) => {
    var _a, _b, _c, _d;
    const start = toMonthYear((_a = input.advancePeriodStart) === null || _a === void 0 ? void 0 : _a.month, (_b = input.advancePeriodStart) === null || _b === void 0 ? void 0 : _b.year) ||
        toMonthYear(input.rentalPeriodMonth, input.rentalPeriodYear);
    if (!start)
        return undefined;
    const monthsPaid = Number(input.advanceMonthsPaid || 0);
    const explicitEnd = toMonthYear((_c = input.advancePeriodEnd) === null || _c === void 0 ? void 0 : _c.month, (_d = input.advancePeriodEnd) === null || _d === void 0 ? void 0 : _d.year);
    const end = explicitEnd || (monthsPaid > 1 ? addMonths(start, monthsPaid - 1) : start);
    return { start, end };
};
/** Covered months only, for example "June" or "June–August". No payment date fallback. */
const formatCoveredMonthPhrase = (input) => {
    const range = resolvePeriodRange(input);
    if (!range)
        return undefined;
    const { start, end } = range;
    if (end.year === start.year && end.month === start.month) {
        return MONTH_NAMES[start.month - 1];
    }
    if (end.year === start.year) {
        return `${MONTH_NAMES[start.month - 1]}–${MONTH_NAMES[end.month - 1]}`;
    }
    return `${monthLabel(start)}–${monthLabel(end)}`;
};
/**
 * Month the receipt covers, for agent-account transaction descriptions.
 * A June rental reads "June rent". A same-year advance reads "June–August rent".
 * Does not infer a month from the payment date.
 */
const formatPaidMonthLabel = (input) => {
    const phrase = formatCoveredMonthPhrase(input);
    if (!phrase)
        return undefined;
    return `${phrase} rent`;
};
exports.formatPaidMonthLabel = formatPaidMonthLabel;
/**
 * Description shown for a commission or commission-reversal row.
 * Rental rows name the month being paid. Sale and introduction rows omit receipt numbers.
 */
const formatAgentCommissionDescription = (input, options) => {
    const reversal = Boolean(options === null || options === void 0 ? void 0 : options.reversal);
    const paymentType = String(input.paymentType || '').toLowerCase();
    const propertyName = String((options === null || options === void 0 ? void 0 : options.propertyName) || '').trim();
    const withProperty = (label) => {
        if (!label)
            return undefined;
        return propertyName ? `${label} — ${propertyName}` : label;
    };
    if (paymentType === 'sale') {
        return withProperty(reversal ? 'Sale commission reversal' : 'Sale commission');
    }
    const coveredMonths = formatCoveredMonthPhrase(input);
    if (paymentType === 'introduction') {
        if (!coveredMonths)
            return withProperty(reversal ? 'Introduction commission reversal' : 'Introduction commission');
        return withProperty(reversal ? `${coveredMonths} introduction reversal` : `${coveredMonths} introduction`);
    }
    if (paymentType && paymentType !== 'rental')
        return undefined;
    if (!coveredMonths)
        return undefined;
    const rentLabel = `${coveredMonths} rent`;
    return withProperty(reversal ? `${rentLabel} reversal` : rentLabel);
};
exports.formatAgentCommissionDescription = formatAgentCommissionDescription;
/**
 * Formats stored rental-period metadata for landlord statements.
 * Does not infer a rental month from the payment/transaction date.
 */
const formatRentPeriodDescription = (input) => {
    const range = resolvePeriodRange(input);
    if (!range)
        return undefined;
    const { start, end } = range;
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
