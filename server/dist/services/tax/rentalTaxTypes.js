"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TAX_DISCLAIMER = exports.TAXPAYER_TYPES = exports.RENTAL_TAX_REGIMES = void 0;
exports.isRentalTaxRegime = isRentalTaxRegime;
exports.isTaxpayerType = isTaxpayerType;
exports.normalizeRentalTaxRegime = normalizeRentalTaxRegime;
exports.RENTAL_TAX_REGIMES = [
    'SELF_ASSESSMENT',
    'PRESUMPTIVE_RENTAL',
    'EXEMPT',
    'NOT_APPLICABLE',
    'ACCOUNTANT_REVIEW'
];
exports.TAXPAYER_TYPES = ['INDIVIDUAL', 'COMPANY', 'TRUST', 'OTHER'];
function isRentalTaxRegime(value) {
    return typeof value === 'string' && exports.RENTAL_TAX_REGIMES.includes(value);
}
function isTaxpayerType(value) {
    return typeof value === 'string' && exports.TAXPAYER_TYPES.includes(value);
}
/**
 * Missing or unrecognised regime is always accountant review.
 * Never infer from workspaceType / plan.
 */
function normalizeRentalTaxRegime(value) {
    return isRentalTaxRegime(value) ? value : 'ACCOUNTANT_REVIEW';
}
exports.TAX_DISCLAIMER = "Mantis provides accounting records, tax classifications and tax-working papers based on information entered into the system and configured tax rules. It does not constitute tax advice and does not replace the taxpayer's responsibility to comply with ZIMRA requirements or obtain professional advice where required.";
