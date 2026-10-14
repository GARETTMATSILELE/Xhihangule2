import { extractInclusiveVat, exclusiveVatOn } from './tax/vatCalculation';
import { vatPercentToFraction } from './tax/vatRounding';
import type { InputVatEligibility, IndividualVatTreatment, VatDirection } from './individualVatApplicability';

export type VatCalculationMethod = 'INCLUSIVE' | 'EXCLUSIVE' | 'NONE';

export type VatCalculationResult = {
  direction: VatDirection;
  treatment: IndividualVatTreatment;
  calculationMethod: VatCalculationMethod;
  calculationStatus: 'CALCULATED' | 'REVIEW_REQUIRED' | 'NOT_APPLICABLE';
  grossAmount: number | null;
  netAmount: number | null;
  taxableAmount: number | null;
  vatRate: number | null;
  vatAmount: number | null;
  chargedVatAmount: number | null;
  recoverableVatAmount: number | null;
  inputVatEligibility: InputVatEligibility | null;
  reviewReasons: string[];
  incomeTaxAmount: null;
  presumptiveTaxAmount: null;
};

function emptyAmounts(status: VatCalculationResult['calculationStatus'], extra: Partial<VatCalculationResult> = {}): VatCalculationResult {
  return {
    direction: extra.direction || 'OUTPUT',
    treatment: extra.treatment || 'NOT_APPLICABLE',
    calculationMethod: extra.calculationMethod || 'NONE',
    calculationStatus: status,
    grossAmount: extra.grossAmount ?? null,
    netAmount: extra.netAmount ?? null,
    taxableAmount: extra.taxableAmount ?? null,
    vatRate: extra.vatRate ?? null,
    vatAmount: extra.vatAmount ?? null,
    chargedVatAmount: extra.chargedVatAmount ?? null,
    recoverableVatAmount: extra.recoverableVatAmount ?? null,
    inputVatEligibility: extra.inputVatEligibility ?? null,
    reviewReasons: extra.reviewReasons || [],
    incomeTaxAmount: null,
    presumptiveTaxAmount: null
  };
}

export function resolveCalculationMethod(input: {
  direction: VatDirection;
  vatMode?: string | null;
  vatIncluded?: boolean | null;
}): VatCalculationMethod | 'REVIEW' {
  const mode = String(input.vatMode || '').toUpperCase();
  if (mode === 'VAT_INCLUSIVE' || mode === 'INCLUSIVE') return 'INCLUSIVE';
  if (mode === 'VAT_EXCLUSIVE' || mode === 'EXCLUSIVE') return 'EXCLUSIVE';
  if (mode === 'NO_VAT' || mode === 'NOT_APPLICABLE') return 'NONE';
  if (mode === 'ACCOUNTANT_REVIEW' || mode === 'UNKNOWN') return 'REVIEW';
  if (input.vatIncluded === true) return 'INCLUSIVE';
  if (input.vatIncluded === false) return 'EXCLUSIVE';
  // Individual rent is treated as exclusive of VAT unless the payment explicitly marks inclusive.
  if (input.direction === 'OUTPUT') return 'EXCLUSIVE';
  return 'REVIEW';
}

/**
 * Calculate VAT from a snapshot-derived applicability result.
 * Rate must be the registry percentage stored on the snapshot/rule, not a hard-coded constant.
 */
export function calculateIndividualVat(input: {
  direction: VatDirection;
  treatment: IndividualVatTreatment;
  amount: number;
  vatRatePercent: number | null;
  method: VatCalculationMethod | 'REVIEW';
  inputVatEligibility?: string | null;
  supplierVatNumber?: string | null;
  invoiceNumber?: string | null;
}): VatCalculationResult {
  const reviewReasons: string[] = [];
  const base = { direction: input.direction, treatment: input.treatment };

  if (input.treatment === 'NOT_VAT_REGISTERED' || input.treatment === 'NOT_APPLICABLE' || input.treatment === 'OUT_OF_SCOPE') {
    return emptyAmounts('NOT_APPLICABLE', { ...base, vatAmount: null });
  }

  if (input.treatment === 'REVIEW_REQUIRED' || input.method === 'REVIEW') {
    if (input.method === 'REVIEW') reviewReasons.push('MISSING_VAT_TREATMENT');
    return emptyAmounts('REVIEW_REQUIRED', { ...base, reviewReasons, vatAmount: null });
  }

  if (input.treatment === 'EXEMPT') {
    const amount = Number(input.amount || 0);
    return emptyAmounts('CALCULATED', {
      ...base,
      calculationMethod: 'NONE',
      grossAmount: amount,
      netAmount: amount,
      taxableAmount: 0,
      vatRate: 0,
      vatAmount: 0,
      chargedVatAmount: 0,
      recoverableVatAmount: input.direction === 'INPUT' ? 0 : null,
      inputVatEligibility: input.direction === 'INPUT' ? 'NOT_APPLICABLE' : null
    });
  }

  if (input.treatment === 'ZERO_RATED') {
    const amount = Number(input.amount || 0);
    return emptyAmounts('CALCULATED', {
      ...base,
      calculationMethod: input.method === 'INCLUSIVE' ? 'INCLUSIVE' : 'EXCLUSIVE',
      grossAmount: amount,
      netAmount: amount,
      taxableAmount: amount,
      vatRate: 0,
      vatAmount: 0,
      chargedVatAmount: 0,
      recoverableVatAmount: input.direction === 'INPUT' ? 0 : null,
      inputVatEligibility: input.direction === 'INPUT' ? 'NOT_APPLICABLE' : null
    });
  }

  const percent = input.vatRatePercent;
  if (percent == null || !(Number(percent) > 0) || input.method === 'NONE') {
    reviewReasons.push('MISSING_VAT_RULE');
    return emptyAmounts('REVIEW_REQUIRED', { ...base, reviewReasons, vatAmount: null });
  }

  const fraction = vatPercentToFraction(percent);
  const split = input.method === 'INCLUSIVE'
    ? extractInclusiveVat(input.amount, fraction)
    : exclusiveVatOn(input.amount, fraction);

  if (input.direction === 'OUTPUT') {
    return emptyAmounts('CALCULATED', {
      ...base,
      calculationMethod: input.method,
      grossAmount: split.gross,
      netAmount: split.net,
      taxableAmount: split.net,
      vatRate: percent,
      vatAmount: split.vatAmount,
      chargedVatAmount: split.vatAmount,
      recoverableVatAmount: null,
      inputVatEligibility: null
    });
  }

  const eligibility = String(input.inputVatEligibility || 'REVIEW_REQUIRED').toUpperCase() as InputVatEligibility;
  const missingInvoice = !String(input.supplierVatNumber || '').trim() || !String(input.invoiceNumber || '').trim();
  if (eligibility === 'REVIEW_REQUIRED' || eligibility === 'PARTIALLY_RECOVERABLE' || missingInvoice) {
    if (missingInvoice) {
      if (!String(input.supplierVatNumber || '').trim()) reviewReasons.push('MISSING_SUPPLIER_VAT_NUMBER');
      if (!String(input.invoiceNumber || '').trim()) reviewReasons.push('MISSING_INVOICE_NUMBER');
    }
    if (eligibility === 'REVIEW_REQUIRED' || eligibility === 'PARTIALLY_RECOVERABLE') {
      reviewReasons.push('INPUT_VAT_ELIGIBILITY_UNCLEAR');
    }
    return emptyAmounts('REVIEW_REQUIRED', {
      ...base,
      calculationMethod: input.method,
      grossAmount: split.gross,
      netAmount: split.net,
      taxableAmount: split.net,
      vatRate: percent,
      vatAmount: null,
      chargedVatAmount: split.vatAmount,
      recoverableVatAmount: null,
      inputVatEligibility: missingInvoice ? 'REVIEW_REQUIRED' : eligibility,
      reviewReasons
    });
  }

  const recoverable = eligibility === 'RECOVERABLE' ? split.vatAmount : 0;
  return emptyAmounts('CALCULATED', {
    ...base,
    calculationMethod: input.method,
    grossAmount: split.gross,
    netAmount: split.net,
    taxableAmount: split.net,
    vatRate: percent,
    vatAmount: recoverable,
    chargedVatAmount: split.vatAmount,
    recoverableVatAmount: recoverable,
    inputVatEligibility: eligibility
  });
}
