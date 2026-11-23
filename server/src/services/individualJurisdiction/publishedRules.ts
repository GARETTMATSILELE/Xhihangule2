/**
 * Effective-dated individual-owner tax constants.
 * Zimbabwe ordinary-income, presumptive and VAT rates already live in taxRuleRegistry.
 * These additions are the dated rules for AIDS levy, South Africa and the global catalogue.
 * They are not applied to agency commission or trust accounting.
 */

export const ZW_AIDS_LEVY_PERCENT = 3;

export const SA_TAX_YEAR_2027 = {
  effectiveFrom: new Date(Date.UTC(2026, 2, 1)),
  effectiveTo: new Date(Date.UTC(2027, 1, 28)),
  sourceReference: 'SARS Budget 2026 tax guide — rates of tax for individuals, 2027 tax year (1 March 2026 – 28 February 2027)',
  sourceDocument: 'https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/',
  brackets: [
    { upTo: 245100, base: 0, above: 0, rate: 0.18 },
    { upTo: 383100, base: 44118, above: 245100, rate: 0.26 },
    { upTo: 530200, base: 79998, above: 383100, rate: 0.31 },
    { upTo: 695800, base: 125599, above: 530200, rate: 0.36 },
    { upTo: 887000, base: 185215, above: 695800, rate: 0.39 },
    { upTo: 1878600, base: 259783, above: 887000, rate: 0.41 },
    { upTo: Number.POSITIVE_INFINITY, base: 666339, above: 1878600, rate: 0.45 }
  ],
  rebates: { primary: 17820, secondary: 9765, tertiary: 3249 },
  thresholds: { under65: 99000, age65: 153250, age75: 171300 },
  topThreshold: 1878600
} as const;

export const SA_VAT = {
  standardPercent: 15,
  standardFrom: new Date(Date.UTC(2018, 3, 1)),
  compulsoryThresholdFromApril2026: 2_300_000,
  voluntaryThresholdFromApril2026: 120_000,
  compulsoryThresholdBeforeApril2026: 1_000_000,
  voluntaryThresholdBeforeApril2026: 50_000,
  thresholdChange: new Date(Date.UTC(2026, 3, 1)),
  sourceReference: 'SARS Budget 2026 tax guide — Value-Added Tax. Standard rate 15%. Compulsory registration above R2.3 million and voluntary registration above R120 000, as increased with effect from 1 April 2026.'
} as const;

export const SA_PROVISIONAL = {
  rentalExemption: 30_000,
  firstDue: '31 August',
  secondDue: 'last day of February',
  sourceReference: 'SARS Budget 2026 tax guide — Provisional tax. An individual is not a provisional taxpayer solely because they let property when the stated exemptions apply.'
} as const;

export const SA_TURNOVER_TAX_2027 = {
  effectiveFrom: new Date(Date.UTC(2026, 2, 1)),
  effectiveTo: new Date(Date.UTC(2027, 1, 28)),
  sourceReference: 'SARS Budget 2026 tax guide — Turnover tax for micro businesses, individuals 1 March 2026 to 28 February 2027',
  brackets: [
    { upTo: 600000, base: 0, above: 0, rate: 0 },
    { upTo: 950000, base: 0, above: 600000, rate: 0.01 },
    { upTo: 1400000, base: 3500, above: 950000, rate: 0.02 },
    { upTo: Number.POSITIVE_INFINITY, base: 12500, above: 1400000, rate: 0.03 }
  ]
} as const;

export const GLOBAL_TAX_CATEGORIES = [
  'PERSONAL_INCOME_TAX',
  'RENTAL_INCOME_TAX',
  'PRESUMPTIVE_RENTAL_TAX',
  'PROPERTY_TAX',
  'VAT',
  'GST',
  'SALES_TAX',
  'WITHHOLDING_TAX',
  'OTHER'
] as const;

export type GlobalTaxCategory = (typeof GLOBAL_TAX_CATEGORIES)[number];

export type JurisdictionCode = 'ZW' | 'ZA' | 'GLOBAL';

export function individualJurisdictionFromLabel(value?: string | null): JurisdictionCode | '' {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return '';
  if (v === 'zw' || v === 'zimbabwe' || v === 'republic of zimbabwe') return 'ZW';
  if (v === 'za' || v === 'south africa' || v === 'rsa' || v === 'republic of south africa') return 'ZA';
  if (v === 'global' || v === 'other' || v === 'other countries' || v === 'international') return 'GLOBAL';
  if (/^[a-z]{2}$/.test(v)) {
    if (v === 'zw') return 'ZW';
    if (v === 'za') return 'ZA';
    return 'GLOBAL';
  }
  return 'GLOBAL';
}

/** Empty values stay unresolved so callers can fall back. Do not treat a blank country as Zimbabwe here. */
export function resolveIndividualJurisdiction(primary?: string | null, fallback?: string | null): JurisdictionCode {
  return individualJurisdictionFromLabel(primary) || individualJurisdictionFromLabel(fallback) || 'ZW';
}
