export const TAX_CALCULATION_STATUSES = [
  'NOT_APPLICABLE',
  'NOT_CALCULATED',
  'READY_FOR_CALCULATION',
  'CALCULATED',
  'REVIEW_REQUIRED',
  'FINALIZED'
] as const;
export type TaxCalculationStatus = (typeof TAX_CALCULATION_STATUSES)[number];

export const TAX_CLASSIFICATION_SOURCES = [
  'PROPERTY_PROFILE',
  'LANDLORD_PROFILE',
  'TAX_RULE',
  'USER_SELECTED',
  'ACCOUNTANT_REVIEW',
  'SYSTEM_DEFAULT'
] as const;
export type TaxClassificationSource = (typeof TAX_CLASSIFICATION_SOURCES)[number];

export const TAX_PERIOD_STATUSES = ['OPEN', 'REVIEW', 'FINALIZED', 'AMENDED', 'LOCKED'] as const;
export type TaxPeriodStatus = (typeof TAX_PERIOD_STATUSES)[number];

export const TAX_PERIOD_TAX_TYPES = [
  'VAT',
  'PRESUMPTIVE_RENTAL_INCOME_TAX',
  'INCOME_TAX'
] as const;
export type TaxPeriodTaxType = (typeof TAX_PERIOD_TAX_TYPES)[number];

export const TAX_PERIOD_ASSIGNMENT_STATUSES = [
  'ASSIGNED',
  'PERIOD_REQUIRED',
  'PERIOD_CLOSED'
] as const;
export type TaxPeriodAssignmentStatus = (typeof TAX_PERIOD_ASSIGNMENT_STATUSES)[number];

export const TRANSACTION_TAX_SOURCE_KINDS = [
  'PAYMENT_RENT',
  'PAYMENT_DEPOSIT',
  'EXPENSE',
  'OTHER_INCOME',
  'MAINTENANCE',
  'CAPITAL',
  'LIABILITY',
  'REVERSAL'
] as const;
export type TransactionTaxSourceKind = (typeof TRANSACTION_TAX_SOURCE_KINDS)[number];

export type TaxRuleReference = {
  taxType: string;
  ruleId: string | null;
  ruleCode: string | null;
  ruleVersion: number | null;
  effectiveFrom: string | null;
  sourceReference: string | null;
  /** Configured registry rate. Not a calculated tax amount. */
  configuredRate: number | null;
  taxAmount: null;
  taxCalculationStatus: TaxCalculationStatus;
};

export type TaxProfileSnapshot = {
  vatRegistered: boolean;
  vatNumber: string;
  rentalTaxRegime: string;
  incomeTaxRegistered: boolean;
  propertyUseClass: string | null;
  vatSupplyTreatment: string;
  rentalTaxTreatment: string;
  ownerProfileVersion: number;
  propertyUpdatedAt: string | null;
};

export function calendarPeriodKey(date: Date): string {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function calendarPeriodBounds(periodKey: string): { periodStart: Date; periodEnd: Date } {
  const [year, month] = periodKey.split('-').map(Number);
  const periodStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { periodStart, periodEnd };
}

export function isTaxCalculationStatus(value: unknown): value is TaxCalculationStatus {
  return typeof value === 'string' && (TAX_CALCULATION_STATUSES as readonly string[]).includes(value);
}

/**
 * API/tax overlay must never emit 0 as a fake calculated tax.
 */
export function uncalculatedTaxFields() {
  return {
    taxAmount: null as null,
    taxableAmount: null as null,
    taxRate: null as null,
    vatAmount: null as null,
    presumptiveTaxAmount: null as null,
    incomeTaxAmount: null as null
  };
}
