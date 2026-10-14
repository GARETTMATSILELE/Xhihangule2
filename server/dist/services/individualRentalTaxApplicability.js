"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.individualRentalTaxApplicabilityService = exports.RENTAL_TAX_REVIEW_REASONS = exports.RENTAL_TAX_APPLICABILITY_STATUSES = void 0;
exports.evaluateIndividualRentalTaxApplicability = evaluateIndividualRentalTaxApplicability;
const rentalTaxTypes_1 = require("./tax/rentalTaxTypes");
exports.RENTAL_TAX_APPLICABILITY_STATUSES = [
    'APPLICABLE',
    'NOT_APPLICABLE',
    'REVIEW_REQUIRED',
    'RULE_UNAVAILABLE'
];
exports.RENTAL_TAX_REVIEW_REASONS = [
    'RENTAL_TAX_REGIME_NOT_SELECTED',
    'RENTAL_TAX_REGIME_ACCOUNTANT_REVIEW',
    'TAX_RULE_UNAVAILABLE',
    'TAX_PERIOD_MISSING',
    'TAX_BASE_CANNOT_BE_DETERMINED',
    'TRANSACTION_CLASSIFICATION_INCOMPLETE',
    'PROPERTY_CLASSIFICATION_MISSING',
    'PROFILE_SNAPSHOT_MISSING',
    'CALCULATION_FAILED',
    'TAX_PAYMENT_MISSING_REFERENCE',
    'RESIDENTIAL_PREMISES_REVIEW',
    'MIXED_USE_REQUIRES_REVIEW',
    'PASS_THROUGH_TREATMENT_UNCLEAR'
];
const RENTAL_SOURCE_KINDS = ['PAYMENT_RENT', 'OTHER_INCOME'];
function ruleMeta(rule) {
    var _a, _b;
    return {
        taxRuleId: (rule === null || rule === void 0 ? void 0 : rule.id) || null,
        taxRuleVersion: (_a = rule === null || rule === void 0 ? void 0 : rule.version) !== null && _a !== void 0 ? _a : null,
        taxRuleCode: (rule === null || rule === void 0 ? void 0 : rule.ruleCode) || null,
        configuredRate: (_b = rule === null || rule === void 0 ? void 0 : rule.rate) !== null && _b !== void 0 ? _b : null,
        calculationMethod: (rule === null || rule === void 0 ? void 0 : rule.calculationMethod) || null,
        sourceReference: (rule === null || rule === void 0 ? void 0 : rule.sourceReference) || null,
        effectiveFrom: (rule === null || rule === void 0 ? void 0 : rule.effectiveFrom) ? new Date(rule.effectiveFrom).toISOString().slice(0, 10) : null,
        effectiveTo: (rule === null || rule === void 0 ? void 0 : rule.effectiveTo) ? new Date(rule.effectiveTo).toISOString().slice(0, 10) : null
    };
}
function empty(status, extra) {
    var _a, _b;
    return {
        applicable: false,
        regime: extra.regime || 'ACCOUNTANT_REVIEW',
        reason: extra.reason || status.toLowerCase(),
        status,
        taxRuleId: extra.taxRuleId || null,
        taxRuleVersion: (_a = extra.taxRuleVersion) !== null && _a !== void 0 ? _a : null,
        taxRuleCode: extra.taxRuleCode || null,
        configuredRate: (_b = extra.configuredRate) !== null && _b !== void 0 ? _b : null,
        calculationMethod: extra.calculationMethod || null,
        sourceReference: extra.sourceReference || null,
        effectiveFrom: extra.effectiveFrom || null,
        effectiveTo: extra.effectiveTo || null,
        effectiveDate: extra.effectiveDate || null,
        reviewReasons: extra.reviewReasons || []
    };
}
/**
 * Presumptive rental-tax applicability from the **immutable Phase D snapshot**.
 * Never reads the live landlord profile. Never infers from workspaceType.
 */
function evaluateIndividualRentalTaxApplicability(input) {
    const reviewReasons = [];
    const regime = (0, rentalTaxTypes_1.normalizeRentalTaxRegime)(input.rentalTaxRegime);
    const propertyTreatment = input.rentalTaxTreatment
        ? (0, rentalTaxTypes_1.normalizeRentalTaxRegime)(input.rentalTaxTreatment)
        : regime;
    const effectiveDate = input.transactionDate
        ? new Date(input.transactionDate).toISOString().slice(0, 10)
        : null;
    const meta = Object.assign(Object.assign({}, ruleMeta(input.rentalTaxRule)), { regime, effectiveDate });
    if (!RENTAL_SOURCE_KINDS.includes(input.sourceKind)) {
        return empty('NOT_APPLICABLE', Object.assign(Object.assign({}, meta), { reason: input.sourceKind === 'PAYMENT_DEPOSIT' || input.sourceKind === 'LIABILITY'
                ? 'deposit_is_not_rental_income'
                : 'transaction_not_a_rental_receipt' }));
    }
    if (input.profileSnapshotPresent === false) {
        reviewReasons.push('PROFILE_SNAPSHOT_MISSING');
        return empty('REVIEW_REQUIRED', Object.assign(Object.assign({}, meta), { reason: 'profile_snapshot_missing', reviewReasons }));
    }
    if (!input.rentalTaxRegime) {
        reviewReasons.push('RENTAL_TAX_REGIME_NOT_SELECTED');
        return empty('REVIEW_REQUIRED', Object.assign(Object.assign({}, meta), { reason: 'rental_tax_regime_not_selected', reviewReasons }));
    }
    if (regime === 'ACCOUNTANT_REVIEW' || propertyTreatment === 'ACCOUNTANT_REVIEW') {
        reviewReasons.push('RENTAL_TAX_REGIME_ACCOUNTANT_REVIEW');
        return empty('REVIEW_REQUIRED', Object.assign(Object.assign({}, meta), { reason: 'rental_tax_regime_accountant_review', reviewReasons }));
    }
    if (regime === 'SELF_ASSESSMENT' || propertyTreatment === 'SELF_ASSESSMENT') {
        return empty('NOT_APPLICABLE', Object.assign(Object.assign({}, meta), { reason: 'self_assessment_is_not_presumptive_rental_tax' }));
    }
    if (regime === 'EXEMPT' || regime === 'NOT_APPLICABLE' || propertyTreatment === 'EXEMPT' || propertyTreatment === 'NOT_APPLICABLE') {
        return empty('NOT_APPLICABLE', Object.assign(Object.assign({}, meta), { reason: 'rental_tax_regime_not_presumptive' }));
    }
    const useClass = String(input.propertyUseClass || '').toUpperCase();
    if (!useClass) {
        reviewReasons.push('PROPERTY_CLASSIFICATION_MISSING');
        return empty('REVIEW_REQUIRED', Object.assign(Object.assign({}, meta), { reason: 'property_classification_missing', reviewReasons }));
    }
    if (useClass === 'RESIDENTIAL_DWELLING') {
        return empty('NOT_APPLICABLE', Object.assign(Object.assign({}, meta), { reason: 'residential_premises_not_liable_pn08' }));
    }
    if (useClass === 'MIXED_USE' || useClass === 'SHORT_TERM_ACCOMMODATION' || useClass === 'OTHER_SERVICE') {
        reviewReasons.push(useClass === 'MIXED_USE' ? 'MIXED_USE_REQUIRES_REVIEW' : 'PROPERTY_CLASSIFICATION_MISSING');
        return empty('REVIEW_REQUIRED', Object.assign(Object.assign({}, meta), { reason: 'property_use_requires_accountant_review', reviewReasons }));
    }
    if (useClass !== 'COMMERCIAL') {
        reviewReasons.push('PROPERTY_CLASSIFICATION_MISSING');
        return empty('REVIEW_REQUIRED', Object.assign(Object.assign({}, meta), { reason: 'property_use_not_established_as_business_premises', reviewReasons }));
    }
    if (regime !== 'PRESUMPTIVE_RENTAL') {
        return empty('NOT_APPLICABLE', Object.assign(Object.assign({}, meta), { reason: 'rental_tax_regime_not_presumptive' }));
    }
    if (!input.rentalTaxRule || input.rentalTaxRule.rate == null) {
        reviewReasons.push('TAX_RULE_UNAVAILABLE');
        return empty('RULE_UNAVAILABLE', Object.assign(Object.assign({}, meta), { status: 'RULE_UNAVAILABLE', reason: 'no_effective_presumptive_rental_tax_rule', reviewReasons }));
    }
    return Object.assign(Object.assign({ applicable: true, reason: 'snapshot_presumptive_rental', status: 'APPLICABLE' }, meta), { reviewReasons: [] });
}
exports.individualRentalTaxApplicabilityService = {
    evaluate: evaluateIndividualRentalTaxApplicability
};
exports.default = exports.individualRentalTaxApplicabilityService;
