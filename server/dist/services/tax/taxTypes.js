"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TAX_TYPE_LABEL = exports.TAX_TYPE_MODE = exports.TAX_CALCULATION_MODES = exports.COMMISSION_VAT_TREATMENTS = exports.PROPERTY_USE_CLASSES = exports.VAT_SUPPLY_TREATMENTS = exports.TAX_STATUSES = exports.TAX_TYPES = void 0;
exports.isPayableStatus = isPayableStatus;
exports.isSettledStatus = isSettledStatus;
exports.TAX_TYPES = [
    'VAT_OUTPUT',
    'VAT_INPUT',
    'VAT_ON_COMMISSION',
    'VAT_WITHHOLDING',
    'CAPITAL_GAINS_TAX',
    'CAPITAL_GAINS_WITHHOLDING_TAX',
    'PROPERTY_COMMISSION_TAX',
    'PAYE',
    'CORPORATE_TAX',
    'PRESUMPTIVE_RENTAL_INCOME_TAX',
    'INCOME_TAX'
];
exports.TAX_STATUSES = [
    'CALCULATED',
    'WITHHELD',
    'PAYABLE',
    'RETURN_PREPARED',
    'RETURN_SUBMITTED',
    'PAID',
    'RECONCILED',
    'REVERSED',
    'ACCOUNTANT_REVIEW'
];
exports.VAT_SUPPLY_TREATMENTS = [
    'EXEMPT',
    'STANDARD_TAXABLE',
    'ZERO_RATED',
    'OUT_OF_SCOPE',
    'ACCOUNTANT_REVIEW'
];
exports.PROPERTY_USE_CLASSES = [
    'RESIDENTIAL_DWELLING',
    'COMMERCIAL',
    'MIXED_USE',
    'SHORT_TERM_ACCOMMODATION',
    'SALE',
    'AGENCY_COMMISSION',
    'OTHER_SERVICE'
];
exports.COMMISSION_VAT_TREATMENTS = [
    'NONE',
    'COMMISSION_VAT_EXCLUSIVE',
    'COMMISSION_VAT_INCLUSIVE'
];
exports.TAX_CALCULATION_MODES = ['AUTOMATED', 'MANUAL', 'EXTERNAL', 'NOT_IMPLEMENTED'];
exports.TAX_TYPE_MODE = {
    VAT_OUTPUT: 'AUTOMATED',
    VAT_INPUT: 'MANUAL',
    VAT_ON_COMMISSION: 'AUTOMATED',
    VAT_WITHHOLDING: 'MANUAL',
    CAPITAL_GAINS_TAX: 'AUTOMATED',
    CAPITAL_GAINS_WITHHOLDING_TAX: 'AUTOMATED',
    PROPERTY_COMMISSION_TAX: 'MANUAL',
    PAYE: 'EXTERNAL',
    CORPORATE_TAX: 'EXTERNAL',
    PRESUMPTIVE_RENTAL_INCOME_TAX: 'NOT_IMPLEMENTED',
    INCOME_TAX: 'NOT_IMPLEMENTED'
};
exports.TAX_TYPE_LABEL = {
    VAT_OUTPUT: 'Output VAT',
    VAT_INPUT: 'Input VAT',
    VAT_ON_COMMISSION: 'VAT on agency commission',
    VAT_WITHHOLDING: 'VAT withholding',
    CAPITAL_GAINS_TAX: 'Capital Gains Tax',
    CAPITAL_GAINS_WITHHOLDING_TAX: 'Capital Gains Withholding Tax',
    PROPERTY_COMMISSION_TAX: 'Property commission tax',
    PAYE: 'PAYE',
    CORPORATE_TAX: 'Corporate income tax',
    PRESUMPTIVE_RENTAL_INCOME_TAX: 'Presumptive rental income tax',
    INCOME_TAX: 'Income tax'
};
function isPayableStatus(status) {
    return status === 'PAYABLE' || status === 'WITHHELD' || status === 'RETURN_PREPARED' || status === 'RETURN_SUBMITTED';
}
function isSettledStatus(status) {
    return status === 'PAID' || status === 'RECONCILED';
}
