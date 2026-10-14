import { calculateTaxableIncomePercent, roundIncomeTaxMoney } from './tax/incomeTaxRounding';
import type { IncomeTaxCalculationStatus } from './tax/incomeTaxTypes';
import type { TaxRuleRecord } from './taxRuleRegistry';

export type IncomeTaxAdjustmentInput = {
  adjustmentType: string;
  amount: number;
  currency: string;
  reason?: string | null;
  status?: string;
};

export type IncomeTaxWorkingPaperCalc = {
  currencies: string[];
  accountingIncome: number | null;
  accountingExpenses: number | null;
  accountingProfit: number | null;
  addBacks: number | null;
  deductions: number | null;
  exemptIncome: number | null;
  capitalAdjustments: number | null;
  otherTaxAdjustments: number | null;
  taxableIncomeBeforeAdjustments: number | null;
  taxableIncome: number | null;
  taxRate: number | null;
  taxAmount: number | null;
  calculationMethod: string;
  calculationStatus: IncomeTaxCalculationStatus;
  taxRuleId: string | null;
  taxRuleVersion: number | null;
  taxRuleCode: string | null;
  sourceReference: string | null;
  reviewReasons: string[];
  vatAmount: null;
  presumptiveTaxAmount: null;
};

function signedAdjustment(type: string, amount: number): { addBack: number; deduction: number; exempt: number; capital: number; other: number } {
  const value = Math.abs(Number(amount || 0));
  const code = String(type || '').toUpperCase();
  if (code === 'ADD_BACK' || code === 'NON_DEDUCTIBLE_EXPENSE' || code === 'PRIVATE_EXPENSE' || code === 'ACCOUNTING_DEPRECIATION_ADD_BACK') {
    return { addBack: value, deduction: 0, exempt: 0, capital: 0, other: 0 };
  }
  if (code === 'DEDUCTION') return { addBack: 0, deduction: value, exempt: 0, capital: 0, other: 0 };
  if (code === 'EXEMPT_INCOME') return { addBack: 0, deduction: 0, exempt: value, capital: 0, other: 0 };
  if (code === 'CAPITAL_ADJUSTMENT') return { addBack: 0, deduction: 0, exempt: 0, capital: value, other: 0 };
  return { addBack: 0, deduction: 0, exempt: 0, capital: 0, other: Number(amount || 0) };
}

const BLOCKING_REVIEW = new Set([
  'PROFILE_SNAPSHOT_MISSING',
  'TAX_PERIOD_MISSING',
  'TAX_RULE_UNAVAILABLE',
  'PRESUMPTIVE_VS_ORDINARY_TREATMENT_UNCLEAR',
  'MISSING_INCOME_TAX_CLASSIFICATION',
  'CURRENCY_CONVERSION_REQUIRED',
  'MANUAL_ADJUSTMENT_AWAITING_REVIEW',
  'VAT_COMPONENT_REQUIRES_REVIEW'
]);

export function calculateOrdinaryIncomeTaxWorkingPaper(input: {
  currencies: string[];
  accountingIncome: number;
  accountingExpenses: number;
  lineAddBacks: number;
  /** Informational only. Allowable deductions already sit in accounting expenses. */
  lineDeductions: number;
  lineExemptIncome: number;
  adjustments?: IncomeTaxAdjustmentInput[];
  incomeTaxRule?: Pick<TaxRuleRecord, 'id' | 'version' | 'ruleCode' | 'rate' | 'calculationMethod' | 'sourceReference'> | null;
  periodAssignmentStatus?: string | null;
  profilePresent?: boolean;
  reviewReasons?: string[];
}): IncomeTaxWorkingPaperCalc {
  const reviewReasons = [...(input.reviewReasons || [])];
  const currencies = Array.from(new Set((input.currencies || []).filter(Boolean)));
  const ruleMeta = {
    taxRuleId: input.incomeTaxRule?.id || null,
    taxRuleVersion: input.incomeTaxRule?.version ?? null,
    taxRuleCode: input.incomeTaxRule?.ruleCode || null,
    sourceReference: input.incomeTaxRule?.sourceReference || null,
    calculationMethod: input.incomeTaxRule?.calculationMethod || 'TAXABLE_INCOME_PERCENT',
    taxRate: input.incomeTaxRule?.rate ?? null
  };

  const empty = (status: IncomeTaxCalculationStatus, extra: Partial<IncomeTaxWorkingPaperCalc> = {}): IncomeTaxWorkingPaperCalc => ({
    currencies,
    accountingIncome: extra.accountingIncome ?? null,
    accountingExpenses: extra.accountingExpenses ?? null,
    accountingProfit: extra.accountingProfit ?? null,
    addBacks: extra.addBacks ?? null,
    deductions: extra.deductions ?? null,
    exemptIncome: extra.exemptIncome ?? null,
    capitalAdjustments: extra.capitalAdjustments ?? null,
    otherTaxAdjustments: extra.otherTaxAdjustments ?? null,
    taxableIncomeBeforeAdjustments: extra.taxableIncomeBeforeAdjustments ?? null,
    taxableIncome: extra.taxableIncome ?? null,
    taxRate: extra.taxRate ?? ruleMeta.taxRate,
    taxAmount: extra.taxAmount ?? null,
    calculationMethod: ruleMeta.calculationMethod,
    calculationStatus: status,
    taxRuleId: ruleMeta.taxRuleId,
    taxRuleVersion: ruleMeta.taxRuleVersion,
    taxRuleCode: ruleMeta.taxRuleCode,
    sourceReference: ruleMeta.sourceReference,
    reviewReasons: extra.reviewReasons || reviewReasons,
    vatAmount: null,
    presumptiveTaxAmount: null
  });

  if (input.profilePresent === false) {
    return empty('PROFILE_REQUIRED', { reviewReasons: ['PROFILE_SNAPSHOT_MISSING'] });
  }
  if (input.periodAssignmentStatus === 'PERIOD_REQUIRED') {
    return empty('PERIOD_REQUIRED', { reviewReasons: Array.from(new Set([...reviewReasons, 'TAX_PERIOD_MISSING'])) });
  }
  if (currencies.length > 1) {
    return empty('REVIEW_REQUIRED', {
      reviewReasons: Array.from(new Set([...reviewReasons, 'CURRENCY_CONVERSION_REQUIRED']))
    });
  }

  const income = roundIncomeTaxMoney(input.accountingIncome);
  const expenses = roundIncomeTaxMoney(input.accountingExpenses);
  const profit = roundIncomeTaxMoney(income - expenses);
  let addBacks = roundIncomeTaxMoney(input.lineAddBacks);
  const classifiedDeductions = roundIncomeTaxMoney(input.lineDeductions);
  let extraDeductions = 0;
  let exempt = roundIncomeTaxMoney(input.lineExemptIncome);
  let capital = 0;
  let other = 0;
  for (const row of input.adjustments || []) {
    if (row.status && row.status !== 'APPROVED' && row.status !== 'POSTED') {
      if (row.status === 'PENDING' || row.status === 'REVIEW_REQUIRED') {
        reviewReasons.push('MANUAL_ADJUSTMENT_AWAITING_REVIEW');
      }
      continue;
    }
    if (!String(row.reason || '').trim()) {
      reviewReasons.push('MANUAL_ADJUSTMENT_AWAITING_REVIEW');
      continue;
    }
    const split = signedAdjustment(row.adjustmentType, row.amount);
    addBacks = roundIncomeTaxMoney(addBacks + split.addBack);
    extraDeductions = roundIncomeTaxMoney(extraDeductions + split.deduction);
    exempt = roundIncomeTaxMoney(exempt + split.exempt);
    capital = roundIncomeTaxMoney(capital + split.capital);
    other = roundIncomeTaxMoney(other + split.other);
  }
  const deductions = roundIncomeTaxMoney(classifiedDeductions + extraDeductions);

  const before = profit;
  // Allowable line deductions already reduced accounting profit. Only extra/manual deductions subtract again.
  const taxable = roundIncomeTaxMoney(profit + addBacks - extraDeductions - exempt + other);

  if (reviewReasons.some((reason) => BLOCKING_REVIEW.has(reason))) {
    return empty('REVIEW_REQUIRED', {
      accountingIncome: income,
      accountingExpenses: expenses,
      accountingProfit: profit,
      addBacks,
      deductions,
      exemptIncome: exempt,
      capitalAdjustments: capital,
      otherTaxAdjustments: other,
      taxableIncomeBeforeAdjustments: before,
      taxableIncome: null,
      taxAmount: null,
      reviewReasons: Array.from(new Set(reviewReasons))
    });
  }

  if (!input.incomeTaxRule || input.incomeTaxRule.rate == null || input.incomeTaxRule.calculationMethod !== 'TAXABLE_INCOME_PERCENT') {
    return empty('RULE_REQUIRED', {
      accountingIncome: income,
      accountingExpenses: expenses,
      accountingProfit: profit,
      addBacks,
      deductions,
      exemptIncome: exempt,
      capitalAdjustments: capital,
      otherTaxAdjustments: other,
      taxableIncomeBeforeAdjustments: before,
      taxableIncome: taxable,
      taxAmount: null,
      reviewReasons: Array.from(new Set([...reviewReasons, 'TAX_RULE_UNAVAILABLE']))
    });
  }

  const taxAmount = calculateTaxableIncomePercent(taxable, input.incomeTaxRule.rate);
  return empty('CALCULATED', {
    accountingIncome: income,
    accountingExpenses: expenses,
    accountingProfit: profit,
    addBacks,
    deductions,
    exemptIncome: exempt,
    capitalAdjustments: capital,
    otherTaxAdjustments: other,
    taxableIncomeBeforeAdjustments: before,
    taxableIncome: taxable,
    taxRate: input.incomeTaxRule.rate,
    taxAmount
  });
}
