export const RENTAL_TAX_REGIMES = [
  'SELF_ASSESSMENT',
  'PRESUMPTIVE_RENTAL',
  'EXEMPT',
  'NOT_APPLICABLE',
  'ACCOUNTANT_REVIEW'
] as const;

export type RentalTaxRegime = (typeof RENTAL_TAX_REGIMES)[number];

export const TAXPAYER_TYPES = ['INDIVIDUAL', 'COMPANY', 'TRUST', 'OTHER'] as const;
export type TaxpayerType = (typeof TAXPAYER_TYPES)[number];

export function isRentalTaxRegime(value: unknown): value is RentalTaxRegime {
  return typeof value === 'string' && (RENTAL_TAX_REGIMES as readonly string[]).includes(value);
}

export function isTaxpayerType(value: unknown): value is TaxpayerType {
  return typeof value === 'string' && (TAXPAYER_TYPES as readonly string[]).includes(value);
}

/**
 * Missing or unrecognised regime is always accountant review.
 * Never infer from workspaceType / plan.
 */
export function normalizeRentalTaxRegime(value: unknown): RentalTaxRegime {
  return isRentalTaxRegime(value) ? value : 'ACCOUNTANT_REVIEW';
}

export const TAX_DISCLAIMER =
  "Mantis provides accounting records, tax classifications and tax-working papers based on information entered into the system and configured tax rules. It does not constitute tax advice and does not replace the taxpayer's responsibility to comply with ZIMRA requirements or obtain professional advice where required.";
