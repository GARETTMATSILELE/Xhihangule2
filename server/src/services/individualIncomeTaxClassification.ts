import { normalizeRentalTaxRegime } from './tax/rentalTaxTypes';
import type { TransactionTaxSourceKind } from './tax/taxMetadataTypes';
import {
  type IncomeTaxCalculationStatus,
  type IncomeTaxClassification
} from './tax/incomeTaxTypes';

export type IncomeTaxLineClassification = {
  classification: IncomeTaxClassification;
  calculationStatus: IncomeTaxCalculationStatus;
  accountingIncome: number | null;
  accountingExpense: number | null;
  addBack: number | null;
  deduction: number | null;
  exemptIncome: number | null;
  taxableContribution: number | null;
  reviewReasons: string[];
  reason: string;
  documentStatus: 'DOCUMENTED' | 'MISSING' | 'REVIEW_REQUIRED' | 'NOT_REQUIRED';
};

const PRIVATE_CATEGORIES = new Set(['PRIVATE', 'PRIVATE_EXPENSE', 'PERSONAL', 'DRAWINGS']);
const DEPRECIATION_CATEGORIES = new Set(['DEPRECIATION', 'ACCOUNTING_DEPRECIATION']);
const OWNER_CATEGORIES = new Set(['OWNER_FUNDS', 'OWNER_CONTRIBUTION', 'OWNER_TRANSFER', 'LOAN_PROCEEDS', 'CAPITAL_INJECTION']);
const RENT_CATEGORIES = new Set(['RENTAL_INCOME', 'RENT', 'DEPOSIT_APPLICATION']);

function money(value: number | null | undefined): number {
  return Number(value || 0);
}

/**
 * Income-tax line classification from the immutable Phase D snapshot.
 * Never infers from workspaceType. Never treats accounting expense as a deduction automatically.
 */
export function classifyIncomeTaxLine(input: {
  sourceKind: TransactionTaxSourceKind;
  amount: number;
  rentalTaxRegime?: string | null;
  rentalTaxTreatment?: string | null;
  deductibility?: string | null;
  capitalOrRevenue?: string | null;
  category?: string | null;
  vatMode?: string | null;
  profileSnapshotPresent?: boolean;
  attachments?: string[] | null;
}): IncomeTaxLineClassification {
  const reviewReasons: string[] = [];
  const amount = money(input.amount);
  const regime = normalizeRentalTaxRegime(input.rentalTaxTreatment || input.rentalTaxRegime);
  const category = String(input.category || '').toUpperCase().replace(/\s+/g, '_');
  const deductibility = String(input.deductibility || '').toUpperCase();
  const capitalOrRevenue = String(input.capitalOrRevenue || '').toUpperCase();
  const vatMode = String(input.vatMode || '').toUpperCase();
  const documented = Array.isArray(input.attachments) && input.attachments.some((row) => String(row || '').trim());
  const documentStatus: IncomeTaxLineClassification['documentStatus'] = documented
    ? 'DOCUMENTED'
    : input.sourceKind === 'PAYMENT_DEPOSIT' || input.sourceKind === 'LIABILITY'
      ? 'NOT_REQUIRED'
      : 'MISSING';

  if (input.profileSnapshotPresent === false) {
    return {
      classification: 'REVIEW_REQUIRED',
      calculationStatus: 'PROFILE_REQUIRED',
      accountingIncome: null,
      accountingExpense: null,
      addBack: null,
      deduction: null,
      exemptIncome: null,
      taxableContribution: null,
      reviewReasons: ['PROFILE_SNAPSHOT_MISSING'],
      reason: 'profile_snapshot_missing',
      documentStatus
    };
  }

  if (vatMode === 'VAT_INCLUSIVE' || vatMode === 'INCLUSIVE') {
    return {
      classification: 'REVIEW_REQUIRED',
      calculationStatus: 'REVIEW_REQUIRED',
      accountingIncome: input.sourceKind === 'PAYMENT_RENT' || input.sourceKind === 'OTHER_INCOME' ? amount : null,
      accountingExpense: input.sourceKind === 'EXPENSE' || input.sourceKind === 'MAINTENANCE' ? amount : null,
      addBack: null,
      deduction: null,
      exemptIncome: null,
      taxableContribution: null,
      reviewReasons: ['VAT_COMPONENT_REQUIRES_REVIEW'],
      reason: 'vat_inclusive_income_tax_base_requires_review',
      documentStatus
    };
  }
  if (documentStatus === 'MISSING' && (input.sourceKind === 'EXPENSE' || input.sourceKind === 'MAINTENANCE')) {
    reviewReasons.push('MISSING_SUPPORTING_DOCUMENT');
  }

  if (input.sourceKind === 'PAYMENT_DEPOSIT' || input.sourceKind === 'LIABILITY' || OWNER_CATEGORIES.has(category)) {
    return {
      classification: 'NOT_INCOME_TAX_RELEVANT',
      calculationStatus: 'NOT_APPLICABLE',
      accountingIncome: null,
      accountingExpense: null,
      addBack: null,
      deduction: null,
      exemptIncome: null,
      taxableContribution: null,
      reviewReasons: [],
      reason: input.sourceKind === 'PAYMENT_DEPOSIT' || category === 'TENANT_DEPOSIT' ? 'deposit_is_not_taxable_income' : 'owner_capital_is_not_taxable_income',
      documentStatus: 'NOT_REQUIRED'
    };
  }

  if (input.sourceKind === 'CAPITAL' || capitalOrRevenue === 'CAPITAL' || deductibility === 'CAPITAL') {
    return {
      classification: 'CAPITAL',
      calculationStatus: 'REVIEW_REQUIRED',
      accountingIncome: null,
      accountingExpense: amount,
      addBack: null,
      deduction: null,
      exemptIncome: null,
      taxableContribution: null,
      reviewReasons: Array.from(new Set([...reviewReasons, 'CAPITAL_ALLOWANCE_NOT_IMPLEMENTED'])),
      reason: 'capital_expenditure_is_not_an_ordinary_deduction',
      documentStatus
    };
  }

  if (PRIVATE_CATEGORIES.has(category)) {
    return {
      classification: 'PRIVATE_EXPENSE',
      calculationStatus: reviewReasons.length ? 'REVIEW_REQUIRED' : 'CALCULATED',
      accountingIncome: null,
      accountingExpense: amount,
      addBack: amount,
      deduction: null,
      exemptIncome: null,
      taxableContribution: amount,
      reviewReasons,
      reason: 'private_expense_added_back',
      documentStatus
    };
  }

  if (DEPRECIATION_CATEGORIES.has(category)) {
    return {
      classification: 'NON_DEDUCTIBLE',
      calculationStatus: 'REVIEW_REQUIRED',
      accountingIncome: null,
      accountingExpense: amount,
      addBack: amount,
      deduction: null,
      exemptIncome: null,
      taxableContribution: amount,
      reviewReasons: Array.from(new Set([...reviewReasons, 'ACCOUNTING_DEPRECIATION_NOT_A_TAX_ALLOWANCE'])),
      reason: 'accounting_depreciation_added_back_allowance_not_implemented',
      documentStatus
    };
  }

  const isIncome = input.sourceKind === 'PAYMENT_RENT' || input.sourceKind === 'OTHER_INCOME';
  const isExpense = input.sourceKind === 'EXPENSE' || input.sourceKind === 'MAINTENANCE';

  if (isIncome) {
    if (regime === 'ACCOUNTANT_REVIEW' || !input.rentalTaxRegime) {
      return {
        classification: 'REVIEW_REQUIRED',
        calculationStatus: input.rentalTaxRegime ? 'REVIEW_REQUIRED' : 'PROFILE_REQUIRED',
        accountingIncome: amount,
        accountingExpense: null,
        addBack: null,
        deduction: null,
        exemptIncome: null,
        taxableContribution: null,
        reviewReasons: Array.from(new Set([...reviewReasons, input.rentalTaxRegime ? 'PRESUMPTIVE_VS_ORDINARY_TREATMENT_UNCLEAR' : 'MISSING_INCOME_TAX_CLASSIFICATION'])),
        reason: 'income_tax_regime_not_established',
        documentStatus
      };
    }
    if (regime === 'PRESUMPTIVE_RENTAL') {
      return {
        classification: 'NOT_INCOME_TAX_RELEVANT',
        calculationStatus: 'NOT_APPLICABLE',
        accountingIncome: amount,
        accountingExpense: null,
        addBack: null,
        deduction: null,
        exemptIncome: amount,
        taxableContribution: 0,
        reviewReasons: [],
        reason: 'presumptive_rental_is_final_tax_excluded_from_ordinary_income',
        documentStatus
      };
    }
    if (regime === 'EXEMPT' || regime === 'NOT_APPLICABLE') {
      return {
        classification: regime === 'EXEMPT' ? 'EXEMPT_INCOME' : 'NOT_INCOME_TAX_RELEVANT',
        calculationStatus: 'NOT_APPLICABLE',
        accountingIncome: amount,
        accountingExpense: null,
        addBack: null,
        deduction: null,
        exemptIncome: regime === 'EXEMPT' ? amount : null,
        taxableContribution: 0,
        reviewReasons: [],
        reason: 'income_excluded_from_ordinary_income_tax',
        documentStatus
      };
    }
    if (regime === 'SELF_ASSESSMENT') {
      if (!RENT_CATEGORIES.has(category) && input.sourceKind === 'OTHER_INCOME' && category && !RENT_CATEGORIES.has(category)) {
        if (category === 'LEVY_RECOVERY' || category === 'UTILITY_RECOVERY') {
          return {
            classification: 'REVIEW_REQUIRED',
            calculationStatus: 'REVIEW_REQUIRED',
            accountingIncome: amount,
            accountingExpense: null,
            addBack: null,
            deduction: null,
            exemptIncome: null,
            taxableContribution: null,
            reviewReasons: Array.from(new Set([...reviewReasons, 'MISSING_INCOME_TAX_CLASSIFICATION'])),
            reason: 'other_income_classification_unclear',
            documentStatus
          };
        }
      }
      return {
        classification: 'TAXABLE_INCOME',
        calculationStatus: reviewReasons.length ? 'REVIEW_REQUIRED' : 'CALCULATED',
        accountingIncome: amount,
        accountingExpense: null,
        addBack: null,
        deduction: null,
        exemptIncome: null,
        taxableContribution: amount,
        reviewReasons,
        reason: 'self_assessment_ordinary_taxable_income',
        documentStatus
      };
    }
  }

  if (isExpense) {
    if (regime === 'PRESUMPTIVE_RENTAL') {
      return {
        classification: 'NOT_INCOME_TAX_RELEVANT',
        calculationStatus: 'NOT_APPLICABLE',
        accountingIncome: null,
        accountingExpense: amount,
        addBack: null,
        deduction: null,
        exemptIncome: null,
        taxableContribution: 0,
        reviewReasons: [],
        reason: 'expense_on_presumptive_rental_property_not_ordinary_deduction',
        documentStatus
      };
    }
    if (deductibility === 'DEDUCTIBLE') {
      return {
        classification: 'ALLOWABLE_DEDUCTION',
        calculationStatus: reviewReasons.length ? 'REVIEW_REQUIRED' : 'CALCULATED',
        accountingIncome: null,
        accountingExpense: amount,
        addBack: null,
        deduction: amount,
        exemptIncome: null,
        taxableContribution: -amount,
        reviewReasons,
        reason: 'classified_allowable_deduction',
        documentStatus
      };
    }
    if (deductibility === 'NON_DEDUCTIBLE') {
      return {
        classification: 'NON_DEDUCTIBLE',
        calculationStatus: reviewReasons.length ? 'REVIEW_REQUIRED' : 'CALCULATED',
        accountingIncome: null,
        accountingExpense: amount,
        addBack: amount,
        deduction: null,
        exemptIncome: null,
        taxableContribution: 0,
        reviewReasons,
        reason: 'non_deductible_expense_added_back',
        documentStatus
      };
    }
    if (deductibility === 'PARTIALLY_DEDUCTIBLE' || deductibility === 'ACCOUNTANT_REVIEW' || !deductibility) {
      return {
        classification: 'REVIEW_REQUIRED',
        calculationStatus: 'REVIEW_REQUIRED',
        accountingIncome: null,
        accountingExpense: amount,
        addBack: null,
        deduction: null,
        exemptIncome: null,
        taxableContribution: null,
        reviewReasons: Array.from(new Set([...reviewReasons, 'MISSING_INCOME_TAX_CLASSIFICATION'])),
        reason: 'expense_tax_treatment_unclear',
        documentStatus
      };
    }
  }

  return {
    classification: 'REVIEW_REQUIRED',
    calculationStatus: 'REVIEW_REQUIRED',
    accountingIncome: isIncome ? amount : null,
    accountingExpense: isExpense ? amount : null,
    addBack: null,
    deduction: null,
    exemptIncome: null,
    taxableContribution: null,
    reviewReasons: Array.from(new Set([...reviewReasons, 'MISSING_INCOME_TAX_CLASSIFICATION'])),
    reason: 'income_tax_classification_incomplete',
    documentStatus
  };
}
