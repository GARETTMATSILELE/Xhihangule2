import {
  type ComplianceFinding,
  type ComplianceMetrics,
  type ComplianceReadinessResult,
  type ComplianceStatus
} from './tax/complianceTypes';

export type ReadinessInput = {
  taxYear?: number;
  packFinalized?: boolean;
  hasAnyActivity?: boolean;
  unclassifiedTransactions?: number;
  missingTaxRules?: number;
  missingTaxPeriods?: number;
  incompleteTaxableIncome?: boolean;
  unresolvedIncomeTaxReviews?: number;
  unresolvedRentalTaxReviews?: number;
  unresolvedVatReviews?: number;
  missingDocuments?: number;
  unmatchedTaxPayments?: number;
  capitalAllowanceReviews?: number;
  aidsLevyReviews?: number;
  mixedCurrency?: boolean;
  vatRegistered?: boolean;
  presumptiveApplicable?: boolean;
  incomeTaxPaymentRecorded?: boolean;
  rentalTaxPaymentRecorded?: boolean;
  ownershipUnclear?: boolean;
  closedPeriods?: number;
  pendingAdjustments?: number;
};

function finding(
  severity: ComplianceFinding['severity'],
  issueType: string,
  description: string,
  extra: Partial<ComplianceFinding> = {}
): ComplianceFinding {
  return { severity, issueType, description, taxType: extra.taxType || null, sourceId: extra.sourceId || null, taxPeriodKey: extra.taxPeriodKey || null };
}

/**
 * Deterministic Phase H readiness. Does not calculate tax.
 */
export function evaluateComplianceReadiness(input: ReadinessInput): ComplianceReadinessResult {
  const blockers: ComplianceFinding[] = [];
  const warnings: ComplianceFinding[] = [];
  const information: ComplianceFinding[] = [];

  if (input.unclassifiedTransactions) {
    blockers.push(finding('BLOCKER', 'MISSING_TAX_CLASSIFICATION', `${input.unclassifiedTransactions} income/expense transactions are not tax-classified`));
  }
  if (input.missingTaxRules) {
    blockers.push(finding('BLOCKER', 'MISSING_TAX_RULE', `${input.missingTaxRules} applicable tax rules are missing`));
  }
  if (input.missingTaxPeriods) {
    blockers.push(finding('BLOCKER', 'MISSING_TAX_PERIOD', `${input.missingTaxPeriods} required tax periods are not open`));
  }
  if (input.incompleteTaxableIncome) {
    blockers.push(finding('BLOCKER', 'INCOME_TAX_REVIEW', 'Ordinary taxable-income calculation is incomplete'));
  }
  if (input.unresolvedIncomeTaxReviews) {
    blockers.push(finding('BLOCKER', 'INCOME_TAX_REVIEW', `${input.unresolvedIncomeTaxReviews} ordinary income-tax review items are unresolved`, { taxType: 'INCOME_TAX' }));
  }
  if (input.unresolvedRentalTaxReviews) {
    blockers.push(finding('BLOCKER', 'PRESUMPTIVE_RENTAL_REVIEW', `${input.unresolvedRentalTaxReviews} presumptive rental-tax review items are unresolved`, { taxType: 'PRESUMPTIVE_RENTAL_INCOME_TAX' }));
  }
  if (input.unresolvedVatReviews) {
    blockers.push(finding('BLOCKER', 'VAT_REVIEW', `${input.unresolvedVatReviews} VAT review items are unresolved`, { taxType: 'VAT' }));
  }
  if (input.mixedCurrency) {
    blockers.push(finding('BLOCKER', 'CURRENCY_CONVERSION_REQUIRED', 'Mixed currencies require a verified conversion source before annual totals can be treated as complete'));
  }
  if (input.pendingAdjustments) {
    blockers.push(finding('BLOCKER', 'INCOME_TAX_REVIEW', `${input.pendingAdjustments} income-tax adjustments await approval`, { taxType: 'INCOME_TAX' }));
  }

  if (input.missingDocuments) {
    warnings.push(finding('WARNING', 'MISSING_DOCUMENT', `${input.missingDocuments} supporting documents are missing`));
  }
  if (input.unmatchedTaxPayments) {
    warnings.push(finding('WARNING', 'TAX_PAYMENT_UNMATCHED', `${input.unmatchedTaxPayments} recorded tax payments are not matched to a calculated projection`));
  }
  if (input.capitalAllowanceReviews) {
    warnings.push(finding('WARNING', 'CAPITAL_ALLOWANCE_REVIEW', 'Capital allowances are not implemented and remain under review'));
  }
  if (input.aidsLevyReviews) {
    warnings.push(finding('WARNING', 'AIDS_LEVY_REVIEW', 'AIDS levy is not included in the ordinary income-tax working paper'));
  }
  if (input.ownershipUnclear) {
    blockers.push(finding('BLOCKER', 'OWNERSHIP_ALLOCATION_UNCLEAR', 'Ownership percentage is not 100% and the tax allocation is not determined'));
  }

  if (input.vatRegistered === false) {
    information.push(finding('INFORMATION', 'VAT_REVIEW', 'Landlord is not VAT registered'));
  }
  if (input.presumptiveApplicable === false) {
    information.push(finding('INFORMATION', 'PRESUMPTIVE_RENTAL_REVIEW', 'No presumptive rental tax is applicable on the recorded snapshots'));
  }
  if (input.incomeTaxPaymentRecorded === false) {
    information.push(finding('INFORMATION', 'TAX_PAYMENT_UNMATCHED', 'No ordinary income-tax payment has been recorded'));
  }
  if (input.rentalTaxPaymentRecorded === false && input.presumptiveApplicable) {
    information.push(finding('INFORMATION', 'TAX_PAYMENT_UNMATCHED', 'No presumptive rental-tax payment has been recorded'));
  }

  const metrics: ComplianceMetrics = {
    unclassifiedTransactions: Number(input.unclassifiedTransactions || 0),
    missingDocuments: Number(input.missingDocuments || 0),
    openReviews:
      Number(input.unresolvedIncomeTaxReviews || 0) +
      Number(input.unresolvedRentalTaxReviews || 0) +
      Number(input.unresolvedVatReviews || 0),
    closedPeriods: Number(input.closedPeriods || 0),
    incompleteCalculations: input.incompleteTaxableIncome ? 1 : 0,
    vatReviewItems: Number(input.unresolvedVatReviews || 0),
    rentalTaxReviewItems: Number(input.unresolvedRentalTaxReviews || 0),
    incomeTaxReviewItems: Number(input.unresolvedIncomeTaxReviews || 0)
  };

  let status: ComplianceStatus = 'NOT_STARTED';
  if (blockers.length) status = 'REVIEW_REQUIRED';
  else if (input.packFinalized) status = 'FINALIZED';
  else if (!input.hasAnyActivity) status = 'NOT_STARTED';
  else if (warnings.length) status = 'READY_FOR_ACCOUNTANT';
  else status = 'READY_FOR_TAX_PREPARATION';

  return { status, blockers, warnings, information, metrics };
}

export const individualTaxComplianceReadinessService = {
  evaluate: evaluateComplianceReadiness
};

export default individualTaxComplianceReadinessService;
