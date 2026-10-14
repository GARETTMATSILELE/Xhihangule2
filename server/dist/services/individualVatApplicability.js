"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INPUT_VAT_ELIGIBILITIES = exports.VAT_DIRECTIONS = exports.VAT_TREATMENTS = void 0;
exports.evaluateIndividualVatApplicability = evaluateIndividualVatApplicability;
exports.VAT_TREATMENTS = [
    'NOT_APPLICABLE',
    'NOT_VAT_REGISTERED',
    'EXEMPT',
    'STANDARD',
    'ZERO_RATED',
    'OUT_OF_SCOPE',
    'REVIEW_REQUIRED'
];
exports.VAT_DIRECTIONS = ['OUTPUT', 'INPUT'];
exports.INPUT_VAT_ELIGIBILITIES = [
    'RECOVERABLE',
    'NON_RECOVERABLE',
    'PARTIALLY_RECOVERABLE',
    'REVIEW_REQUIRED',
    'NOT_APPLICABLE'
];
function normalizeTreatment(raw) {
    const value = String(raw || '').toUpperCase();
    if (value === 'STANDARD_TAXABLE' || value === 'VAT_INCLUSIVE' || value === 'VAT_EXCLUSIVE' || value === 'STANDARD') {
        return 'STANDARD';
    }
    if (value === 'EXEMPT')
        return 'EXEMPT';
    if (value === 'ZERO_RATED')
        return 'ZERO_RATED';
    if (value === 'OUT_OF_SCOPE')
        return 'OUT_OF_SCOPE';
    if (value === 'NO_VAT' || value === 'NOT_APPLICABLE' || value === 'NOT_TAXABLE')
        return 'NOT_APPLICABLE';
    return 'REVIEW_REQUIRED';
}
function directionFor(sourceKind) {
    if (sourceKind === 'PAYMENT_RENT' || sourceKind === 'OTHER_INCOME')
        return 'OUTPUT';
    if (sourceKind === 'EXPENSE' || sourceKind === 'MAINTENANCE' || sourceKind === 'CAPITAL')
        return 'INPUT';
    return null;
}
/**
 * VAT applicability from the **immutable Phase D snapshot**, never the live profile.
 */
function evaluateIndividualVatApplicability(input) {
    var _a, _b;
    const reviewReasons = [];
    const direction = directionFor(input.sourceKind);
    const vatRule = input.vatRule || null;
    const ruleMeta = {
        ruleId: (vatRule === null || vatRule === void 0 ? void 0 : vatRule.id) || null,
        ruleVersion: (_a = vatRule === null || vatRule === void 0 ? void 0 : vatRule.version) !== null && _a !== void 0 ? _a : null,
        ruleCode: (vatRule === null || vatRule === void 0 ? void 0 : vatRule.ruleCode) || null,
        configuredRate: (_b = vatRule === null || vatRule === void 0 ? void 0 : vatRule.rate) !== null && _b !== void 0 ? _b : null,
        effectiveFrom: (vatRule === null || vatRule === void 0 ? void 0 : vatRule.effectiveFrom) ? new Date(vatRule.effectiveFrom).toISOString().slice(0, 10) : null
    };
    if (!direction) {
        return Object.assign({ applicable: false, treatment: 'NOT_APPLICABLE', direction: null, reason: 'transaction_not_a_vat_supply_or_purchase', reviewRequired: false, reviewReasons: [] }, ruleMeta);
    }
    if (!input.vatRegisteredOnSnapshot) {
        return Object.assign({ applicable: false, treatment: 'NOT_VAT_REGISTERED', direction, reason: 'landlord_not_vat_registered_on_snapshot', reviewRequired: false, reviewReasons: [] }, ruleMeta);
    }
    const treatment = normalizeTreatment(input.userVatTreatment || input.vatSupplyTreatment);
    if (treatment === 'REVIEW_REQUIRED') {
        reviewReasons.push('MISSING_VAT_TREATMENT');
        return Object.assign({ applicable: false, treatment: 'REVIEW_REQUIRED', direction, reason: 'supply_requires_accountant_review', reviewRequired: true, reviewReasons }, ruleMeta);
    }
    if (treatment === 'NOT_APPLICABLE' || treatment === 'OUT_OF_SCOPE') {
        return Object.assign({ applicable: false, treatment,
            direction, reason: treatment === 'OUT_OF_SCOPE' ? 'supply_out_of_scope' : 'vat_not_applicable', reviewRequired: false, reviewReasons: [] }, ruleMeta);
    }
    if (treatment === 'STANDARD' && !vatRule) {
        reviewReasons.push('MISSING_VAT_RULE');
        return Object.assign({ applicable: false, treatment: 'REVIEW_REQUIRED', direction, reason: 'no_effective_vat_rule', reviewRequired: true, reviewReasons }, ruleMeta);
    }
    return Object.assign({ applicable: treatment === 'STANDARD' || treatment === 'EXEMPT' || treatment === 'ZERO_RATED', treatment,
        direction, reason: `snapshot_${treatment.toLowerCase()}`, reviewRequired: false, reviewReasons: [] }, ruleMeta);
}
