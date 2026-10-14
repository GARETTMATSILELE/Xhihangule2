import { calculateGrossRentalPercent, roundRentalTaxMoney } from './tax/rentalTaxRounding';
import type { RentalTaxApplicabilityResult } from './individualRentalTaxApplicability';
import type { RentalTaxBaseResult } from './individualRentalTaxBase';

export const RENTAL_TAX_CALCULATION_STATUSES = [
  'NOT_APPLICABLE',
  'NOT_CALCULATED',
  'READY_FOR_CALCULATION',
  'CALCULATED',
  'REVIEW_REQUIRED',
  'PERIOD_REQUIRED',
  'FINALIZED',
  'REVERSED'
] as const;
export type RentalTaxCalculationStatus = (typeof RENTAL_TAX_CALCULATION_STATUSES)[number];

export type RentalTaxCalculationResult = {
  calculationMethod: string;
  calculationStatus: RentalTaxCalculationStatus;
  grossRentalAmount: number | null;
  excludedAmount: number | null;
  taxableRentalBase: number | null;
  taxRate: number | null;
  taxAmount: number | null;
  taxRuleId: string | null;
  taxRuleVersion: number | null;
  taxRuleCode: string | null;
  sourceReference: string | null;
  reviewReasons: string[];
  incomeTaxAmount: null;
  vatAmount: null;
};

function empty(
  status: RentalTaxCalculationStatus,
  extra: Partial<RentalTaxCalculationResult> = {}
): RentalTaxCalculationResult {
  return {
    calculationMethod: extra.calculationMethod || 'GROSS_RENTAL_PERCENT',
    calculationStatus: status,
    grossRentalAmount: extra.grossRentalAmount ?? null,
    excludedAmount: extra.excludedAmount ?? null,
    taxableRentalBase: extra.taxableRentalBase ?? null,
    taxRate: extra.taxRate ?? null,
    taxAmount: extra.taxAmount ?? null,
    taxRuleId: extra.taxRuleId || null,
    taxRuleVersion: extra.taxRuleVersion ?? null,
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
export function calculateIndividualRentalTax(input: {
  applicability: RentalTaxApplicabilityResult;
  taxBase: RentalTaxBaseResult;
  periodAssignmentStatus?: string | null;
}): RentalTaxCalculationResult {
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
    return empty('PERIOD_REQUIRED', {
      ...rule,
      taxAmount: null,
      reviewReasons: Array.from(new Set([...(input.applicability.reviewReasons || []), 'TAX_PERIOD_MISSING']))
    });
  }

  if (input.applicability.status === 'NOT_APPLICABLE' || input.taxBase.status === 'NOT_APPLICABLE') {
    return empty('NOT_APPLICABLE', { ...rule, taxAmount: null });
  }

  const reviewReasons = Array.from(
    new Set([...(input.applicability.reviewReasons || []), ...(input.taxBase.reviewReasons || [])])
  );

  if (
    input.applicability.status === 'REVIEW_REQUIRED' ||
    input.applicability.status === 'RULE_UNAVAILABLE' ||
    input.taxBase.status === 'REVIEW_REQUIRED'
  ) {
    if (input.applicability.status === 'RULE_UNAVAILABLE' && !reviewReasons.includes('TAX_RULE_UNAVAILABLE')) {
      reviewReasons.push('TAX_RULE_UNAVAILABLE');
    }
    return empty('REVIEW_REQUIRED', { ...rule, taxAmount: null, reviewReasons });
  }

  if (!input.applicability.applicable) {
    return empty('NOT_APPLICABLE', { ...rule, taxAmount: null });
  }

  const rate = input.applicability.configuredRate;
  const base = input.taxBase.taxableRentalBase;
  if (rate == null || base == null) {
    reviewReasons.push(rate == null ? 'TAX_RULE_UNAVAILABLE' : 'TAX_BASE_CANNOT_BE_DETERMINED');
    return empty('REVIEW_REQUIRED', { ...rule, taxAmount: null, reviewReasons });
  }

  const taxAmount = calculateGrossRentalPercent(base, rate);
  return empty('CALCULATED', {
    ...rule,
    taxableRentalBase: roundRentalTaxMoney(base),
    taxRate: rate,
    taxAmount
  });
}

export const individualRentalTaxCalculationService = {
  calculate: calculateIndividualRentalTax
};

export default individualRentalTaxCalculationService;
