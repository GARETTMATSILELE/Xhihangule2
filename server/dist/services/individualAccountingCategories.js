"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CANONICAL_LIABILITY_CATEGORIES = exports.CANONICAL_CAPITAL_CATEGORIES = exports.CANONICAL_EXPENSE_CATEGORIES = exports.CANONICAL_INCOME_CATEGORIES = exports.LEGACY_EXPENSE_CATEGORIES = exports.LEGACY_INCOME_CATEGORIES = void 0;
exports.normalizeLandlordCategory = normalizeLandlordCategory;
exports.classifyLandlordCategory = classifyLandlordCategory;
exports.isAllowedLegacyCategory = isAllowedLegacyCategory;
exports.LEGACY_INCOME_CATEGORIES = [
    'Rent',
    'Parking',
    'Levy Recovery',
    'Utilities Recovery',
    'Storage Income',
    'Other Income'
];
exports.LEGACY_EXPENSE_CATEGORIES = [
    'Maintenance',
    'Municipal',
    'Levies',
    'Security',
    'Insurance',
    'Gardening',
    'Cleaning',
    'Repairs',
    'Utilities',
    'Legal',
    'Other'
];
exports.CANONICAL_INCOME_CATEGORIES = [
    'RENTAL_INCOME',
    'PARKING_INCOME',
    'STORAGE_INCOME',
    'UTILITY_RECOVERY',
    'LEVY_RECOVERY',
    'OTHER_PROPERTY_INCOME',
    'INTEREST_INCOME',
    'OTHER_INCOME',
    'DEPOSIT_APPLICATION'
];
exports.CANONICAL_EXPENSE_CATEGORIES = [
    'MAINTENANCE',
    'REPAIRS',
    'MUNICIPAL_RATES',
    'LEVIES',
    'INSURANCE',
    'SECURITY',
    'GARDENING',
    'CLEANING',
    'UTILITIES',
    'LEGAL',
    'ACCOUNTING',
    'BANK_CHARGES',
    'PROPERTY_MANAGEMENT',
    'ADVERTISING',
    'TRAVEL',
    'OTHER_PROPERTY_EXPENSE'
];
exports.CANONICAL_CAPITAL_CATEGORIES = [
    'PROPERTY_ACQUISITION',
    'CAPITAL_IMPROVEMENT',
    'MAJOR_RENOVATION',
    'EQUIPMENT'
];
exports.CANONICAL_LIABILITY_CATEGORIES = [
    'TENANT_DEPOSIT',
    'DEPOSIT_REFUND',
    'OWNER_FUNDS'
];
const LEGACY_INCOME_MAP = {
    Rent: 'RENTAL_INCOME',
    Parking: 'PARKING_INCOME',
    'Levy Recovery': 'LEVY_RECOVERY',
    'Utilities Recovery': 'UTILITY_RECOVERY',
    'Storage Income': 'STORAGE_INCOME',
    'Other Income': 'OTHER_INCOME'
};
const LEGACY_EXPENSE_MAP = {
    Maintenance: 'MAINTENANCE',
    Municipal: 'MUNICIPAL_RATES',
    Levies: 'LEVIES',
    Security: 'SECURITY',
    Insurance: 'INSURANCE',
    Gardening: 'GARDENING',
    Cleaning: 'CLEANING',
    Repairs: 'REPAIRS',
    Utilities: 'UTILITIES',
    Legal: 'LEGAL',
    Other: 'OTHER_PROPERTY_EXPENSE'
};
function normalizeLandlordCategory(raw, fallbackKind) {
    const value = String(raw || '').trim();
    if (!value) {
        if (fallbackKind === 'OTHER_INCOME')
            return 'OTHER_INCOME';
        if (fallbackKind === 'MAINTENANCE')
            return 'MAINTENANCE';
        if (fallbackKind === 'CAPITAL')
            return 'CAPITAL_IMPROVEMENT';
        if (fallbackKind === 'LIABILITY')
            return 'TENANT_DEPOSIT';
        return 'OTHER_PROPERTY_EXPENSE';
    }
    if (LEGACY_INCOME_MAP[value])
        return LEGACY_INCOME_MAP[value];
    if (LEGACY_EXPENSE_MAP[value])
        return LEGACY_EXPENSE_MAP[value];
    return value.replace(/\s+/g, '_').toUpperCase();
}
function classifyLandlordCategory(category) {
    const code = category.toUpperCase();
    if (code === 'DEPOSIT_APPLICATION') {
        return {
            sourceKind: 'OTHER_INCOME',
            accountingTreatment: 'PROPERTY_INCOME',
            transactionCategory: 'RENT',
            capitalOrRevenue: 'REVENUE',
            deductibility: 'NOT_APPLICABLE',
            vatModeDefault: 'UNKNOWN',
            ledgerType: 'income'
        };
    }
    if (exports.CANONICAL_LIABILITY_CATEGORIES.includes(code) || code === 'DEPOSIT') {
        return {
            sourceKind: 'LIABILITY',
            accountingTreatment: 'LIABILITY',
            transactionCategory: 'DEPOSIT',
            capitalOrRevenue: 'ACCOUNTANT_REVIEW',
            deductibility: 'NOT_APPLICABLE',
            vatModeDefault: 'NO_VAT',
            ledgerType: 'other'
        };
    }
    if (exports.CANONICAL_CAPITAL_CATEGORIES.includes(code)) {
        return {
            sourceKind: 'CAPITAL',
            accountingTreatment: 'CAPITAL',
            transactionCategory: 'OTHER',
            capitalOrRevenue: 'CAPITAL',
            deductibility: 'CAPITAL',
            vatModeDefault: 'ACCOUNTANT_REVIEW',
            ledgerType: 'other'
        };
    }
    if (exports.CANONICAL_INCOME_CATEGORIES.includes(code)) {
        return {
            sourceKind: 'OTHER_INCOME',
            accountingTreatment: 'PROPERTY_INCOME',
            transactionCategory: code === 'RENTAL_INCOME' ? 'RENT' : 'OTHER',
            capitalOrRevenue: 'REVENUE',
            deductibility: 'NOT_APPLICABLE',
            vatModeDefault: 'UNKNOWN',
            ledgerType: 'income'
        };
    }
    if (code === 'MAINTENANCE') {
        return {
            sourceKind: 'MAINTENANCE',
            accountingTreatment: 'PROPERTY_EXPENSE',
            transactionCategory: 'MAINTENANCE',
            capitalOrRevenue: 'REVENUE',
            deductibility: 'ACCOUNTANT_REVIEW',
            vatModeDefault: 'UNKNOWN',
            ledgerType: 'maintenance'
        };
    }
    return {
        sourceKind: 'EXPENSE',
        accountingTreatment: 'PROPERTY_EXPENSE',
        transactionCategory: 'OTHER',
        capitalOrRevenue: 'REVENUE',
        deductibility: 'ACCOUNTANT_REVIEW',
        vatModeDefault: 'UNKNOWN',
        ledgerType: 'expense'
    };
}
function isAllowedLegacyCategory(entryType, category) {
    if (entryType === 'income') {
        return exports.LEGACY_INCOME_CATEGORIES.includes(category)
            || exports.CANONICAL_INCOME_CATEGORIES.includes(category);
    }
    const allowed = [
        ...exports.LEGACY_EXPENSE_CATEGORIES,
        ...exports.CANONICAL_EXPENSE_CATEGORIES,
        ...exports.CANONICAL_CAPITAL_CATEGORIES,
        ...exports.CANONICAL_LIABILITY_CATEGORIES
    ];
    return allowed.includes(category);
}
