export const TAX_TYPES = [
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
] as const;

export type CanonicalTaxType = (typeof TAX_TYPES)[number];

export const TAX_STATUSES = [
  'CALCULATED',
  'WITHHELD',
  'PAYABLE',
  'RETURN_PREPARED',
  'RETURN_SUBMITTED',
  'PAID',
  'RECONCILED',
  'REVERSED',
  'ACCOUNTANT_REVIEW'
] as const;

export type TaxObligationStatus = (typeof TAX_STATUSES)[number];

export const VAT_SUPPLY_TREATMENTS = [
  'EXEMPT',
  'STANDARD_TAXABLE',
  'ZERO_RATED',
  'OUT_OF_SCOPE',
  'ACCOUNTANT_REVIEW'
] as const;

export type VatSupplyTreatment = (typeof VAT_SUPPLY_TREATMENTS)[number];

export const PROPERTY_USE_CLASSES = [
  'RESIDENTIAL_DWELLING',
  'COMMERCIAL',
  'MIXED_USE',
  'SHORT_TERM_ACCOMMODATION',
  'SALE',
  'AGENCY_COMMISSION',
  'OTHER_SERVICE'
] as const;

export type PropertyUseClass = (typeof PROPERTY_USE_CLASSES)[number];

export const COMMISSION_VAT_TREATMENTS = [
  'NONE',
  'COMMISSION_VAT_EXCLUSIVE',
  'COMMISSION_VAT_INCLUSIVE'
] as const;

export type CommissionVatTreatment = (typeof COMMISSION_VAT_TREATMENTS)[number];

export const TAX_CALCULATION_MODES = ['AUTOMATED', 'MANUAL', 'EXTERNAL', 'NOT_IMPLEMENTED'] as const;
export type TaxCalculationMode = (typeof TAX_CALCULATION_MODES)[number];

export const TAX_TYPE_MODE: Record<CanonicalTaxType, TaxCalculationMode> = {
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

export const TAX_TYPE_LABEL: Record<CanonicalTaxType, string> = {
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

export function isPayableStatus(status: TaxObligationStatus): boolean {
  return status === 'PAYABLE' || status === 'WITHHELD' || status === 'RETURN_PREPARED' || status === 'RETURN_SUBMITTED';
}

export function isSettledStatus(status: TaxObligationStatus): boolean {
  return status === 'PAID' || status === 'RECONCILED';
}
