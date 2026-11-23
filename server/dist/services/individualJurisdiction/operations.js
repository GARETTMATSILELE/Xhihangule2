"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INDIVIDUAL_NOTIFICATION_EVENTS = exports.SIMPLE_EXPENSE_CATEGORIES = exports.BILL_CATEGORIES = void 0;
exports.isBillCategory = isBillCategory;
exports.settlementForEntry = settlementForEntry;
exports.sameObligation = sameObligation;
exports.deriveExpenseTaxMetadata = deriveExpenseTaxMetadata;
exports.convertForReporting = convertForReporting;
exports.sumSameCurrency = sumSameCurrency;
exports.buildPropertyFinancialOverview = buildPropertyFinancialOverview;
exports.defaultNotificationPreferences = defaultNotificationPreferences;
exports.individualChannelDecision = individualChannelDecision;
exports.jurisdictionProfileLabel = jurisdictionProfileLabel;
const money_1 = require("../../utils/money");
exports.BILL_CATEGORIES = ['Municipal', 'Municipal Rates', 'Levies', 'Insurance', 'Utilities'];
exports.SIMPLE_EXPENSE_CATEGORIES = [
    'Repairs',
    'Maintenance',
    'Utilities',
    'Levies',
    'Municipal Rates',
    'Insurance',
    'Security',
    'Property Management',
    'Other'
];
const QUALIFYING_RENTAL_EXPENSES = new Set([
    'REPAIRS',
    'MAINTENANCE',
    'UTILITIES',
    'LEVIES',
    'MUNICIPAL',
    'MUNICIPAL_RATES',
    'INSURANCE',
    'SECURITY',
    'PROPERTY_MANAGEMENT',
    'PROPERTY MANAGEMENT'
]);
function isBillCategory(category) {
    return exports.BILL_CATEGORIES.includes(String(category || ''));
}
function settlementForEntry(category, paymentStatus) {
    if (!isBillCategory(category))
        return 'NOT_AN_OBLIGATION';
    const status = String(paymentStatus || 'unpaid').trim().toLowerCase();
    return status === 'paid' || status === 'settled' || status === 'completed' ? 'SETTLED' : 'UNSETTLED';
}
function sameObligation(existing, candidate) {
    if (existing.settlementStatus !== 'UNSETTLED')
        return false;
    if (String(existing.propertyId) !== String(candidate.propertyId))
        return false;
    if (String(existing.category) !== String(candidate.category))
        return false;
    if ((0, money_1.roundMoney)(existing.amount) !== (0, money_1.roundMoney)(candidate.amount))
        return false;
    const left = new Date(existing.date).toISOString().slice(0, 10);
    const right = new Date(candidate.date).toISOString().slice(0, 10);
    if (left !== right)
        return false;
    return String(existing.reference || '') === String(candidate.reference || '');
}
function deriveExpenseTaxMetadata(category) {
    const code = String(category || '').trim().toUpperCase().replace(/\s+/g, '_');
    const qualifying = QUALIFYING_RENTAL_EXPENSES.has(code) || QUALIFYING_RENTAL_EXPENSES.has(String(category || '').trim().toUpperCase());
    return {
        deductibility: qualifying ? 'DEDUCTIBLE' : 'ACCOUNTANT_REVIEW',
        capitalOrRevenue: qualifying ? 'REVENUE' : 'ACCOUNTANT_REVIEW',
        vatMode: 'UNKNOWN',
        inputVatEligibility: 'REVIEW_REQUIRED'
    };
}
function convertForReporting(input) {
    const from = String(input.fromCurrency || '').trim().toUpperCase() || 'USD';
    const to = String(input.toCurrency || '').trim().toUpperCase() || from;
    const originalAmount = (0, money_1.roundMoney)(input.amount);
    if (from === to) {
        return {
            originalAmount,
            originalCurrency: from,
            convertedAmount: originalAmount,
            currency: to,
            rate: 1,
            rateDate: input.rateDate || null,
            source: 'SAME_CURRENCY',
            conversionRequired: false,
            originalPreserved: true
        };
    }
    const rate = input.rate == null ? null : Number(input.rate);
    if (rate == null || !Number.isFinite(rate) || rate <= 0) {
        return {
            originalAmount,
            originalCurrency: from,
            convertedAmount: null,
            currency: to,
            rate: null,
            rateDate: input.rateDate || null,
            source: input.source || null,
            conversionRequired: true,
            originalPreserved: true
        };
    }
    return {
        originalAmount,
        originalCurrency: from,
        convertedAmount: (0, money_1.roundMoney)(originalAmount * rate),
        currency: to,
        rate,
        rateDate: input.rateDate || null,
        source: input.source || 'USER_PROVIDED',
        conversionRequired: false,
        originalPreserved: true
    };
}
function sumSameCurrency(rows) {
    const currencies = Array.from(new Set(rows.map((row) => String(row.currency || '').toUpperCase()).filter(Boolean)));
    if (currencies.length !== 1)
        return { total: null, currency: currencies[0] || null, mixed: currencies.length > 1 };
    return {
        total: (0, money_1.roundMoney)(rows.reduce((sum, row) => sum + Number(row.amount || 0), 0)),
        currency: currencies[0],
        mixed: false
    };
}
function buildPropertyFinancialOverview(input) {
    const currency = String(input.currency || 'USD').toUpperCase();
    const inPeriod = (value) => {
        if (!value)
            return false;
        const date = new Date(value);
        return date >= input.periodStart && date < input.periodEnd;
    };
    const foreign = input.transactions.filter((row) => row.currency && String(row.currency).toUpperCase() !== currency);
    const usable = input.transactions.filter((row) => !row.currency || String(row.currency).toUpperCase() === currency);
    const sum = (rows) => (0, money_1.roundMoney)(rows.reduce((total, row) => total + Number(row.amount || 0), 0));
    const outstanding = (categories) => sum(usable.filter((row) => categories.includes(String(row.category || '')) && row.obligationStatus === 'UNSETTLED'));
    const monthlyExpenses = sum(usable.filter((row) => inPeriod(row.date) && row.type !== 'income' && row.type !== 'opening_balance'));
    const rentCollected = (0, money_1.roundMoney)(input.rentCollected);
    const monthlyRent = (0, money_1.roundMoney)(input.monthlyRent);
    return {
        currency,
        monthlyRental: monthlyRent,
        rentCollected,
        outstandingRent: (0, money_1.roundMoney)(Math.max(0, monthlyRent - rentCollected)),
        outstandingLevies: outstanding(['Levies']),
        municipalCharges: outstanding(['Municipal', 'Municipal Rates']),
        utilities: outstanding(['Utilities']),
        insurance: outstanding(['Insurance']),
        totalOutstandingBills: outstanding(['Levies', 'Municipal', 'Municipal Rates', 'Utilities', 'Insurance']),
        monthlyExpenses,
        netOperatingIncome: (0, money_1.roundMoney)(rentCollected - monthlyExpenses),
        mixedCurrency: foreign.length > 0,
        conversionRequired: foreign.length > 0,
        originalAmountsPreserved: true
    };
}
exports.INDIVIDUAL_NOTIFICATION_EVENTS = [
    'RENT_PAID',
    'RENT_OVERDUE',
    'LEASE_EXPIRING',
    'INSPECTION_DUE',
    'MAINTENANCE_COMPLETED',
    'MUNICIPAL_BILL_DUE',
    'EXPENSE_ADDED',
    'TENANT_ADDED'
];
const TEMPLATE_TO_OWNER_EVENT = {
    RENT_PAYMENT_RECEIVED: 'RENT_PAID',
    RENT_PAYMENT_REMINDER: 'RENT_OVERDUE',
    LEASE_EXPIRING: 'LEASE_EXPIRING',
    INSPECTION_DUE: 'INSPECTION_DUE',
    WORK_COMPLETED: 'MAINTENANCE_COMPLETED',
    MAINTENANCE_COMPLETED: 'MAINTENANCE_COMPLETED',
    MUNICIPAL_BILL_DUE: 'MUNICIPAL_BILL_DUE',
    EXPENSE_ADDED: 'EXPENSE_ADDED',
    TENANT_ADDED: 'TENANT_ADDED'
};
function defaultNotificationPreferences() {
    return exports.INDIVIDUAL_NOTIFICATION_EVENTS.reduce((prefs, event) => {
        prefs[event] = { email: true, inApp: true };
        return prefs;
    }, {});
}
/** inherit = NotificationService keeps its existing channel rules. skip = this owner turned the channel off. */
function individualChannelDecision(stored, templateOrEvent, channel) {
    if (!stored || typeof stored !== 'object')
        return 'inherit';
    const event = TEMPLATE_TO_OWNER_EVENT[templateOrEvent];
    if (!event)
        return 'inherit';
    if (channel !== 'IN_APP' && channel !== 'EMAIL')
        return 'inherit';
    const row = stored[event];
    if (!row)
        return 'send';
    if (channel === 'EMAIL' && row.email === false)
        return 'skip';
    if (channel === 'IN_APP' && row.inApp === false)
        return 'skip';
    return 'send';
}
function jurisdictionProfileLabel(code) {
    if (code === 'ZA')
        return 'South Africa';
    if (code === 'GLOBAL')
        return 'Other countries';
    return 'Zimbabwe';
}
