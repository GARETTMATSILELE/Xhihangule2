import type { TaxRuleRecord } from './taxRuleRegistry';
import type { TransactionTaxSourceKind } from './tax/taxMetadataTypes';

export const VAT_TREATMENTS = [
  'NOT_APPLICABLE',
  'NOT_VAT_REGISTERED',
  'EXEMPT',
  'STANDARD',
  'ZERO_RATED',
  'OUT_OF_SCOPE',
  'REVIEW_REQUIRED'
] as const;
export type IndividualVatTreatment = (typeof VAT_TREATMENTS)[number];

export const VAT_DIRECTIONS = ['OUTPUT', 'INPUT'] as const;
export type VatDirection = (typeof VAT_DIRECTIONS)[number];

export const INPUT_VAT_ELIGIBILITIES = [
  'RECOVERABLE',
  'NON_RECOVERABLE',
  'PARTIALLY_RECOVERABLE',
  'REVIEW_REQUIRED',
  'NOT_APPLICABLE'
] as const;
export type InputVatEligibility = (typeof INPUT_VAT_ELIGIBILITIES)[number];

export type VatApplicabilityResult = {
  applicable: boolean;
  treatment: IndividualVatTreatment;
  direction: VatDirection | null;
  reason: string;
  reviewRequired: boolean;
  reviewReasons: string[];
  ruleId: string | null;
  ruleVersion: number | null;
  ruleCode: string | null;
  configuredRate: number | null;
  effectiveFrom: string | null;
};

function normalizeTreatment(raw: string | null | undefined): IndividualVatTreatment {
  const value = String(raw || '').toUpperCase();
  if (value === 'STANDARD_TAXABLE' || value === 'VAT_INCLUSIVE' || value === 'VAT_EXCLUSIVE' || value === 'STANDARD') {
    return 'STANDARD';
  }
  if (value === 'EXEMPT') return 'EXEMPT';
  if (value === 'ZERO_RATED') return 'ZERO_RATED';
  if (value === 'OUT_OF_SCOPE') return 'OUT_OF_SCOPE';
  if (value === 'NO_VAT' || value === 'NOT_APPLICABLE' || value === 'NOT_TAXABLE') return 'NOT_APPLICABLE';
  return 'REVIEW_REQUIRED';
}

function directionFor(sourceKind: TransactionTaxSourceKind): VatDirection | null {
  if (sourceKind === 'PAYMENT_RENT' || sourceKind === 'OTHER_INCOME') return 'OUTPUT';
  if (sourceKind === 'EXPENSE' || sourceKind === 'MAINTENANCE' || sourceKind === 'CAPITAL') return 'INPUT';
  return null;
}

/**
 * VAT applicability from the **immutable Phase D snapshot**, never the live profile.
 */
export function evaluateIndividualVatApplicability(input: {
  sourceKind: TransactionTaxSourceKind;
  vatRegisteredOnSnapshot: boolean;
  vatSupplyTreatment: string | null | undefined;
  userVatTreatment?: string | null;
  vatRule?: Pick<TaxRuleRecord, 'id' | 'version' | 'ruleCode' | 'rate' | 'effectiveFrom'> | null;
}): VatApplicabilityResult {
  const reviewReasons: string[] = [];
  const direction = directionFor(input.sourceKind);
  const vatRule = input.vatRule || null;
  const ruleMeta = {
    ruleId: vatRule?.id || null,
    ruleVersion: vatRule?.version ?? null,
    ruleCode: vatRule?.ruleCode || null,
    configuredRate: vatRule?.rate ?? null,
    effectiveFrom: vatRule?.effectiveFrom ? new Date(vatRule.effectiveFrom).toISOString().slice(0, 10) : null
  };

  if (!direction) {
    return {
      applicable: false,
      treatment: 'NOT_APPLICABLE',
      direction: null,
      reason: 'transaction_not_a_vat_supply_or_purchase',
      reviewRequired: false,
      reviewReasons: [],
      ...ruleMeta
    };
  }

  if (!input.vatRegisteredOnSnapshot) {
    return {
      applicable: false,
      treatment: 'NOT_VAT_REGISTERED',
      direction,
      reason: 'landlord_not_vat_registered_on_snapshot',
      reviewRequired: false,
      reviewReasons: [],
      ...ruleMeta
    };
  }

  const treatment = normalizeTreatment(input.userVatTreatment || input.vatSupplyTreatment);
  if (treatment === 'REVIEW_REQUIRED') {
    reviewReasons.push('MISSING_VAT_TREATMENT');
    return {
      applicable: false,
      treatment: 'REVIEW_REQUIRED',
      direction,
      reason: 'supply_requires_accountant_review',
      reviewRequired: true,
      reviewReasons,
      ...ruleMeta
    };
  }

  if (treatment === 'NOT_APPLICABLE' || treatment === 'OUT_OF_SCOPE') {
    return {
      applicable: false,
      treatment,
      direction,
      reason: treatment === 'OUT_OF_SCOPE' ? 'supply_out_of_scope' : 'vat_not_applicable',
      reviewRequired: false,
      reviewReasons: [],
      ...ruleMeta
    };
  }

  if (treatment === 'STANDARD' && !vatRule) {
    reviewReasons.push('MISSING_VAT_RULE');
    return {
      applicable: false,
      treatment: 'REVIEW_REQUIRED',
      direction,
      reason: 'no_effective_vat_rule',
      reviewRequired: true,
      reviewReasons,
      ...ruleMeta
    };
  }

  return {
    applicable: treatment === 'STANDARD' || treatment === 'EXEMPT' || treatment === 'ZERO_RATED',
    treatment,
    direction,
    reason: `snapshot_${treatment.toLowerCase()}`,
    reviewRequired: false,
    reviewReasons: [],
    ...ruleMeta
  };
}
