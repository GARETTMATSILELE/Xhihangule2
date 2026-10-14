"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.individualRentalTaxCalculationService = exports.RENTAL_TAX_CALCULATION_STATUSES = void 0;
exports.calculateIndividualRentalTax = calculateIndividualRentalTax;
const rentalTaxRounding_1 = require("./tax/rentalTaxRounding");
exports.RENTAL_TAX_CALCULATION_STATUSES = [
    'NOT_APPLICABLE',
    'NOT_CALCULATED',
    'READY_FOR_CALCULATION',
    'CALCULATED',
    'REVIEW_REQUIRED',
    'PERIOD_REQUIRED',
    'FINALIZED',
    'REVERSED'
];
function empty(status, extra = {}) {
    var _a, _b, _c, _d, _e, _f;
    return {
        calculationMethod: extra.calculationMethod || 'GROSS_RENTAL_PERCENT',
        calculationStatus: status,
        grossRentalAmount: (_a = extra.grossRentalAmount) !== null && _a !== void 0 ? _a : null,
        excludedAmount: (_b = extra.excludedAmount) !== null && _b !== void 0 ? _b : null,
        taxableRentalBase: (_c = extra.taxableRentalBase) !== null && _c !== void 0 ? _c : null,
        taxRate: (_d = extra.taxRate) !== null && _d !== void 0 ? _d : null,
        taxAmount: (_e = extra.taxAmount) !== null && _e !== void 0 ? _e : null,
        taxRuleId: extra.taxRuleId || null,
        taxRuleVersion: (_f = extra.taxRuleVersion) !== null && _f !== void 0 ? _f : null,
        taxRuleCode: extra.taxRuleCode || null,
        sourceReference: extra.sourceReference || null,
        reviewReasons: extra.reviewReasons || [],
        incomeTaxAmount: null,
        vatAmount: null
    };
}
/**
 * Deterministic presumptive rental tax from snapshot applicability + rule + tax base.
 * Rate always comes from the TaxRule. Never hard-codes 15%.
 */
function calculateIndividualRentalTax(input) {
    const rule = {
        calculationMethod: input.applicability.calculationMethod || input.taxBase.calculationMethod || 'GROSS_RENTAL_PERCENT',
        taxRuleId: input.applicability.taxRuleId,
        taxRuleVersion: input.applicability.taxRuleVersion,
        taxRuleCode: input.applicability.taxRuleCode,
        sourceReference: input.applicability.sourceReference,
        taxRate: input.applicability.configuredRate,
        grossRentalAmount: input.taxBase.grossRentalAmount,
        excludedAmount: input.taxBase.excludedAmount,
        taxableRentalBase: input.taxBase.taxableRentalBase
    };
    if (input.periodAssignmentStatus === 'PERIOD_REQUIRED') {
        return empty('PERIOD_REQUIRED', Object.assign(Object.assign({}, rule), { taxAmount: null, reviewReasons: Array.from(new Set([...(input.applicability.reviewReasons || []), 'TAX_PERIOD_MISSING'])) }));
    }
    if (input.applicability.status === 'NOT_APPLICABLE' || input.taxBase.status === 'NOT_APPLICABLE') {
        return empty('NOT_APPLICABLE', Object.assign(Object.assign({}, rule), { taxAmount: null }));
    }
    const reviewReasons = Array.from(new Set([...(input.applicability.reviewReasons || []), ...(input.taxBase.reviewReasons || [])]));
    if (input.applicability.status === 'REVIEW_REQUIRED' ||
        input.applicability.status === 'RULE_UNAVAILABLE' ||
        input.taxBase.status === 'REVIEW_REQUIRED') {
        if (input.applicability.status === 'RULE_UNAVAILABLE' && !reviewReasons.includes('TAX_RULE_UNAVAILABLE')) {
            reviewReasons.push('TAX_RULE_UNAVAILABLE');
        }
        return empty('REVIEW_REQUIRED', Object.assign(Object.assign({}, rule), { taxAmount: null, reviewReasons }));
    }
    if (!input.applicability.applicable) {
        return empty('NOT_APPLICABLE', Object.assign(Object.assign({}, rule), { taxAmount: null }));
    }
    const rate = input.applicability.configuredRate;
    const base = input.taxBase.taxableRentalBase;
    if (rate == null || base == null) {
        reviewReasons.push(rate == null ? 'TAX_RULE_UNAVAILABLE' : 'TAX_BASE_CANNOT_BE_DETERMINED');
        return empty('REVIEW_REQUIRED', Object.assign(Object.assign({}, rule), { taxAmount: null, reviewReasons }));
    }
    const taxAmount = (0, rentalTaxRounding_1.calculateGrossRentalPercent)(base, rate);
    return empty('CALCULATED', Object.assign(Object.assign({}, rule), { taxableRentalBase: (0, rentalTaxRounding_1.roundRentalTaxMoney)(base), taxRate: rate, taxAmount }));
}
exports.individualRentalTaxCalculationService = {
    calculate: calculateIndividualRentalTax
};
exports.default = exports.individualRentalTaxCalculationService;
