import { normalizeRentalTaxRegime, type RentalTaxRegime } from './tax/rentalTaxTypes';
import type { TransactionTaxSourceKind } from './tax/taxMetadataTypes';
import type { TaxRuleRecord } from './taxRuleRegistry';

export const RENTAL_TAX_APPLICABILITY_STATUSES = [
  'APPLICABLE',
  'NOT_APPLICABLE',
  'REVIEW_REQUIRED',
  'RULE_UNAVAILABLE'
] as const;
export type RentalTaxApplicabilityStatus = (typeof RENTAL_TAX_APPLICABILITY_STATUSES)[number];

export const RENTAL_TAX_REVIEW_REASONS = [
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
] as const;
export type RentalTaxReviewReason = (typeof RENTAL_TAX_REVIEW_REASONS)[number];

const RENTAL_SOURCE_KINDS: TransactionTaxSourceKind[] = ['PAYMENT_RENT', 'OTHER_INCOME'];

export type RentalTaxApplicabilityResult = {
  applicable: boolean;
  regime: RentalTaxRegime;
  reason: string;
  status: RentalTaxApplicabilityStatus;
  taxRuleId: string | null;
  taxRuleVersion: number | null;
  taxRuleCode: string | null;
  configuredRate: number | null;
  calculationMethod: string | null;
  sourceReference: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  effectiveDate: string | null;
  reviewReasons: string[];
};

function ruleMeta(rule?: Pick<
  TaxRuleRecord,
  'id' | 'version' | 'ruleCode' | 'rate' | 'calculationMethod' | 'sourceReference' | 'effectiveFrom' | 'effectiveTo'
> | null) {
  return {
    taxRuleId: rule?.id || null,
    taxRuleVersion: rule?.version ?? null,
    taxRuleCode: rule?.ruleCode || null,
    configuredRate: rule?.rate ?? null,
    calculationMethod: rule?.calculationMethod || null,
    sourceReference: rule?.sourceReference || null,
    effectiveFrom: rule?.effectiveFrom ? new Date(rule.effectiveFrom).toISOString().slice(0, 10) : null,
    effectiveTo: rule?.effectiveTo ? new Date(rule.effectiveTo).toISOString().slice(0, 10) : null
  };
}

function empty(
  status: RentalTaxApplicabilityStatus,
  extra: Partial<RentalTaxApplicabilityResult>
): RentalTaxApplicabilityResult {
  return {
    applicable: false,
    regime: extra.regime || 'ACCOUNTANT_REVIEW',
    reason: extra.reason || status.toLowerCase(),
    status,
    taxRuleId: extra.taxRuleId || null,
    taxRuleVersion: extra.taxRuleVersion ?? null,
    taxRuleCode: extra.taxRuleCode || null,
    configuredRate: extra.configuredRate ?? null,
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
export function evaluateIndividualRentalTaxApplicability(input: {
  sourceKind: TransactionTaxSourceKind;
  rentalTaxRegime?: string | null;
  rentalTaxTreatment?: string | null;
  propertyUseClass?: string | null;
  profileSnapshotPresent?: boolean;
  transactionDate?: Date | string | null;
  rentalTaxRule?: Pick<
    TaxRuleRecord,
    'id' | 'version' | 'ruleCode' | 'rate' | 'calculationMethod' | 'sourceReference' | 'effectiveFrom' | 'effectiveTo'
  > | null;
}): RentalTaxApplicabilityResult {
  const reviewReasons: string[] = [];
  const regime = normalizeRentalTaxRegime(input.rentalTaxRegime);
  const propertyTreatment = input.rentalTaxTreatment
    ? normalizeRentalTaxRegime(input.rentalTaxTreatment)
    : regime;
  const effectiveDate = input.transactionDate
    ? new Date(input.transactionDate).toISOString().slice(0, 10)
    : null;
  const meta = { ...ruleMeta(input.rentalTaxRule), regime, effectiveDate };

  if (!RENTAL_SOURCE_KINDS.includes(input.sourceKind)) {
    return empty('NOT_APPLICABLE', {
      ...meta,
      reason: input.sourceKind === 'PAYMENT_DEPOSIT' || input.sourceKind === 'LIABILITY'
        ? 'deposit_is_not_rental_income'
        : 'transaction_not_a_rental_receipt'
    });
  }

  if (input.profileSnapshotPresent === false) {
    reviewReasons.push('PROFILE_SNAPSHOT_MISSING');
    return empty('REVIEW_REQUIRED', { ...meta, reason: 'profile_snapshot_missing', reviewReasons });
  }

  if (!input.rentalTaxRegime) {
    reviewReasons.push('RENTAL_TAX_REGIME_NOT_SELECTED');
    return empty('REVIEW_REQUIRED', { ...meta, reason: 'rental_tax_regime_not_selected', reviewReasons });
  }

  if (regime === 'ACCOUNTANT_REVIEW' || propertyTreatment === 'ACCOUNTANT_REVIEW') {
    reviewReasons.push('RENTAL_TAX_REGIME_ACCOUNTANT_REVIEW');
    return empty('REVIEW_REQUIRED', { ...meta, reason: 'rental_tax_regime_accountant_review', reviewReasons });
  }

  if (regime === 'SELF_ASSESSMENT' || propertyTreatment === 'SELF_ASSESSMENT') {
    return empty('NOT_APPLICABLE', {
      ...meta,
      reason: 'self_assessment_is_not_presumptive_rental_tax'
    });
  }

  if (regime === 'EXEMPT' || regime === 'NOT_APPLICABLE' || propertyTreatment === 'EXEMPT' || propertyTreatment === 'NOT_APPLICABLE') {
    return empty('NOT_APPLICABLE', { ...meta, reason: 'rental_tax_regime_not_presumptive' });
  }

  const useClass = String(input.propertyUseClass || '').toUpperCase();
  if (!useClass) {
    reviewReasons.push('PROPERTY_CLASSIFICATION_MISSING');
    return empty('REVIEW_REQUIRED', { ...meta, reason: 'property_classification_missing', reviewReasons });
  }

  if (useClass === 'RESIDENTIAL_DWELLING') {
    return empty('NOT_APPLICABLE', {
      ...meta,
      reason: 'residential_premises_not_liable_pn08'
    });
  }

  if (useClass === 'MIXED_USE' || useClass === 'SHORT_TERM_ACCOMMODATION' || useClass === 'OTHER_SERVICE') {
    reviewReasons.push(useClass === 'MIXED_USE' ? 'MIXED_USE_REQUIRES_REVIEW' : 'PROPERTY_CLASSIFICATION_MISSING');
    return empty('REVIEW_REQUIRED', {
      ...meta,
      reason: 'property_use_requires_accountant_review',
      reviewReasons
    });
  }

  if (useClass !== 'COMMERCIAL') {
    reviewReasons.push('PROPERTY_CLASSIFICATION_MISSING');
    return empty('REVIEW_REQUIRED', {
      ...meta,
      reason: 'property_use_not_established_as_business_premises',
      reviewReasons
    });
  }

  if (regime !== 'PRESUMPTIVE_RENTAL') {
    return empty('NOT_APPLICABLE', { ...meta, reason: 'rental_tax_regime_not_presumptive' });
  }

  if (!input.rentalTaxRule || input.rentalTaxRule.rate == null) {
    reviewReasons.push('TAX_RULE_UNAVAILABLE');
    return empty('RULE_UNAVAILABLE', {
      ...meta,
      status: 'RULE_UNAVAILABLE',
      reason: 'no_effective_presumptive_rental_tax_rule',
      reviewReasons
    });
  }

  return {
    applicable: true,
    reason: 'snapshot_presumptive_rental',
    status: 'APPLICABLE',
    ...meta,
    reviewReasons: []
  };
}

export const individualRentalTaxApplicabilityService = {
  evaluate: evaluateIndividualRentalTaxApplicability
};

export default individualRentalTaxApplicabilityService;
