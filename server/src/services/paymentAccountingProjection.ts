import {
  evaluatePermanentAccountingPolicy,
  isDepositOnlyPayment,
  type AccountingSkipReason
} from './accountingPostingPolicy';
import { computeOwnerIncomeAmount } from './paymentAccountingCompleteness';
import { projectCommissionLanes } from './commissionProjection';
import { moneyAmountsMatch, moneyDifference, roundMoney } from '../utils/money';

export type AccountingComponent =
  | 'ownerIncome'
  | 'agentCommission'
  | 'companyCommission'
  | 'journal'
  | 'vat'
  | 'deposit';

export type AccountingComponentStatus = 'VALID' | 'MISSING' | 'MISMATCHED' | 'NOT_APPLICABLE';

export type ExpectedAccountingProjection = {
  policyAllowed: boolean;
  reason?: AccountingSkipReason;
  ownerIncome: boolean;
  agentCommission: boolean;
  companyCommission: boolean;
  journal: boolean;
  vat: boolean;
  deposit: boolean;
  amounts: {
    ownerIncome: number;
    agentCommission: number;
    companyCommission: number;
    journal: number;
    vat: number;
    deposit: number;
  };
};

export type AccountingActualSnapshot = {
  ownerIncome: boolean;
  agentCommission: boolean;
  companyCommission: boolean;
  journal: boolean;
  vat: boolean;
  deposit: boolean;
  /** When known, used to avoid expecting owner income that posting would skip as zero. */
  computedOwnerIncomeAmount?: number;
  amounts?: {
    ownerIncome?: number;
    agentCommission?: number;
    companyCommission?: number;
    journal?: number;
    vat?: number;
    deposit?: number;
  };
  linkedPaymentIds?: {
    ownerIncome?: string;
    agentCommission?: string;
    companyCommission?: string;
    journal?: string;
    vat?: string;
    deposit?: string;
  };
  duplicates?: Partial<Record<AccountingComponent, number>>;
};

export type AccountingReconciliationStatus = 'complete' | 'incomplete' | 'failed' | 'not_applicable';

export type AccountingComponentIssue = {
  component: AccountingComponent;
  expected: number | string;
  actual: number | string;
  difference: number | string;
  status: 'MISSING' | 'MISMATCHED';
  paymentId: string;
};

export type AccountingReconciliationResult = {
  paymentId: string;
  propertyId?: string;
  /** Authoritative binary integrity. True only when every required projection exists and matches. */
  accountingComplete: boolean;
  expected: ExpectedAccountingProjection;
  actual: AccountingActualSnapshot;
  status: AccountingReconciliationStatus;
  missing: AccountingComponent[];
  mismatched: AccountingComponent[];
  issues: AccountingComponentIssue[];
  componentStatus: Record<AccountingComponent, AccountingComponentStatus>;
};

export type AccountingRepairPlan = {
  paymentId: string;
  accountingComplete: boolean;
  missing: AccountingComponent[];
  mismatched: AccountingComponent[];
  wouldCreate: AccountingComponent[];
  wouldNotModify: AccountingComponent[];
  requiresManualReview: AccountingComponent[];
};

const emptyAmounts = () => ({
  ownerIncome: 0,
  agentCommission: 0,
  companyCommission: 0,
  journal: 0,
  vat: 0,
  deposit: 0
});

const emptyExpected = (reason?: AccountingSkipReason): ExpectedAccountingProjection => ({
  policyAllowed: false,
  reason,
  ownerIncome: false,
  agentCommission: false,
  companyCommission: false,
  journal: false,
  vat: false,
  deposit: false,
  amounts: emptyAmounts()
});

function vatAmountOnPayment(payment: any): number {
  return roundMoney(
    Number((payment?.commissionDetails as any)?.vatOnCommission || 0)
    + Number(payment?.vatAmount || 0)
  );
}

function passThroughTotalFromPayment(payment: any): number {
  return roundMoney(Number(payment?.levyAllocated || 0));
}

function expectedOwnerIncomeAmount(payment: any): number {
  const isSale = String(payment?.paymentType || '') === 'sale';
  return roundMoney(computeOwnerIncomeAmount({
    isSale,
    ownerAmount: payment?.commissionDetails?.ownerAmount,
    passThroughTotal: passThroughTotalFromPayment(payment)
  }));
}

function expectedAgentCommissionAmount(payment: any): number {
  return roundMoney(projectCommissionLanes(payment).reduce((sum, lane) => sum + Number(lane.amount || 0), 0));
}

/**
 * Deterministic expected accounting projection for a payment.
 * Reuses production posting policy, stored commissionDetails, and commission lanes.
 * Does not recompute commission/VAT/owner formulas.
 */
export function buildExpectedAccountingProjection(payment: any): ExpectedAccountingProjection {
  if (!payment) return emptyExpected('missing_payment');
  const policy = evaluatePermanentAccountingPolicy(payment);
  const depositExpected = Number(payment.depositAmount || 0) > 0
    && !payment.reversalOfPaymentId
    && Number(payment.amount || 0) >= 0
    && String(payment.status || '') === 'completed'
    && payment.isProvisional !== true
    && payment.isInSuspense !== true;

  const amounts = emptyAmounts();
  amounts.deposit = depositExpected ? roundMoney(Number(payment.depositAmount || 0)) : 0;

  if (!policy.allowed) {
    if (policy.reason === 'deposit_only' || isDepositOnlyPayment(payment)) {
      return {
        ...emptyExpected(policy.reason || 'deposit_only'),
        deposit: depositExpected,
        amounts
      };
    }
    return emptyExpected(policy.reason);
  }

  const computedIncome = expectedOwnerIncomeAmount(payment);
  const agentAmount = expectedAgentCommissionAmount(payment);
  const agencyShare = roundMoney(Number(payment.commissionDetails?.agencyShare || 0));
  const amount = roundMoney(Number(payment.amount || 0));
  const journalExpected = !policy.skipJournal && amount > 0;
  const vatExpected = journalExpected && vatAmountOnPayment(payment) > 0;

  amounts.ownerIncome = computedIncome;
  amounts.agentCommission = agentAmount;
  amounts.companyCommission = agencyShare;
  amounts.journal = amount;
  amounts.vat = vatAmountOnPayment(payment);

  return {
    policyAllowed: true,
    reason: policy.reason,
    // Positive cash with a zero owner share is not fully accounted.
    // Do not invent an income row; leave the component missing.
    ownerIncome: !policy.skipOwnerIncome && amount > 0,
    agentCommission: !policy.skipAgentCommission && agentAmount > 0,
    companyCommission: !policy.skipCompanyCommission && agencyShare > 0,
    journal: journalExpected,
    vat: vatExpected,
    deposit: depositExpected,
    amounts
  };
}

export function deriveAccountingComplete(status: AccountingReconciliationStatus): boolean {
  return status === 'complete' || status === 'not_applicable';
}

function compareComponent(input: {
  paymentId: string;
  component: AccountingComponent;
  required: boolean;
  present: boolean;
  expectedAmount: number;
  actualAmount?: number;
  linkedPaymentId?: string;
  duplicateCount?: number;
}): { status: AccountingComponentStatus; issue?: AccountingComponentIssue } {
  const { paymentId, component, required, present, expectedAmount, actualAmount, linkedPaymentId, duplicateCount } = input;
  if (!required) {
    const unexpectedAmount = present
      && actualAmount != null
      && Number.isFinite(Number(actualAmount))
      && roundMoney(Number(actualAmount)) > 0
      && roundMoney(Number(expectedAmount || 0)) <= 0;
    if (unexpectedAmount) {
      return {
        status: 'MISMATCHED',
        issue: {
          component,
          expected: 0,
          actual: roundMoney(Number(actualAmount)),
          difference: roundMoney(Number(actualAmount)),
          status: 'MISMATCHED',
          paymentId
        }
      };
    }
    return { status: 'NOT_APPLICABLE' };
  }
  if (!present) {
    return {
      status: 'MISSING',
      issue: {
        component,
        expected: expectedAmount,
        actual: 'MISSING',
        difference: 'missing',
        status: 'MISSING',
        paymentId
      }
    };
  }
  if (linkedPaymentId && String(linkedPaymentId) !== String(paymentId)) {
    return {
      status: 'MISMATCHED',
      issue: {
        component,
        expected: paymentId,
        actual: linkedPaymentId,
        difference: 'paymentId mismatch',
        status: 'MISMATCHED',
        paymentId
      }
    };
  }
  if (Number(duplicateCount || 0) > 1) {
    return {
      status: 'MISMATCHED',
      issue: {
        component,
        expected: 1,
        actual: Number(duplicateCount),
        difference: Number(duplicateCount) - 1,
        status: 'MISMATCHED',
        paymentId
      }
    };
  }
  if (actualAmount == null || !Number.isFinite(Number(actualAmount))) {
    return { status: 'VALID' };
  }
  if (!moneyAmountsMatch(expectedAmount, actualAmount)) {
    return {
      status: 'MISMATCHED',
      issue: {
        component,
        expected: roundMoney(expectedAmount),
        actual: roundMoney(actualAmount),
        difference: moneyDifference(expectedAmount, actualAmount),
        status: 'MISMATCHED',
        paymentId
      }
    };
  }
  return { status: 'VALID' };
}

export function evaluateAccountingReconciliation(input: {
  paymentId: string;
  propertyId?: string;
  expected: ExpectedAccountingProjection;
  actual: AccountingActualSnapshot;
}): AccountingReconciliationResult {
  const { paymentId, propertyId, expected, actual } = input;
  const ownerIncomeRequired = Boolean(expected.ownerIncome);

  const componentStatus = {} as Record<AccountingComponent, AccountingComponentStatus>;
  const missing: AccountingComponent[] = [];
  const mismatched: AccountingComponent[] = [];
  const issues: AccountingComponentIssue[] = [];

  const checks: Array<{
    component: AccountingComponent;
    required: boolean;
    present: boolean;
    expectedAmount: number;
  }> = [
    { component: 'ownerIncome', required: ownerIncomeRequired, present: Boolean(actual.ownerIncome), expectedAmount: expected.amounts.ownerIncome },
    { component: 'agentCommission', required: expected.agentCommission, present: Boolean(actual.agentCommission), expectedAmount: expected.amounts.agentCommission },
    { component: 'companyCommission', required: expected.companyCommission, present: Boolean(actual.companyCommission), expectedAmount: expected.amounts.companyCommission },
    { component: 'journal', required: expected.journal, present: Boolean(actual.journal), expectedAmount: expected.amounts.journal },
    { component: 'vat', required: expected.vat, present: Boolean(actual.vat), expectedAmount: expected.amounts.vat },
    { component: 'deposit', required: expected.deposit, present: Boolean(actual.deposit), expectedAmount: expected.amounts.deposit }
  ];

  for (const check of checks) {
    const compared = compareComponent({
      paymentId,
      component: check.component,
      required: check.required,
      present: check.present,
      expectedAmount: check.expectedAmount,
      actualAmount: actual.amounts?.[check.component],
      linkedPaymentId: actual.linkedPaymentIds?.[check.component],
      duplicateCount: actual.duplicates?.[check.component]
    });
    componentStatus[check.component] = compared.status;
    if (compared.status === 'MISSING') missing.push(check.component);
    if (compared.status === 'MISMATCHED') mismatched.push(check.component);
    if (compared.issue) issues.push(compared.issue);
  }

  const anyExpected = expected.ownerIncome
    || expected.agentCommission
    || expected.companyCommission
    || expected.journal
    || expected.vat
    || expected.deposit;

  if (!anyExpected) {
    return {
      paymentId,
      propertyId,
      expected,
      actual,
      status: 'not_applicable',
      accountingComplete: true,
      missing: [],
      mismatched: [],
      issues: [],
      componentStatus
    };
  }
  if (missing.length === 0 && mismatched.length === 0) {
    return {
      paymentId,
      propertyId,
      expected,
      actual,
      status: 'complete',
      accountingComplete: true,
      missing,
      mismatched,
      issues,
      componentStatus
    };
  }
  return {
    paymentId,
    propertyId,
    expected,
    actual,
    status: 'incomplete',
    accountingComplete: false,
    missing,
    mismatched,
    issues,
    componentStatus
  };
}

export function buildAccountingRepairPlan(recon: AccountingReconciliationResult): AccountingRepairPlan {
  const present: AccountingComponent[] = [];
  if (recon.actual.ownerIncome) present.push('ownerIncome');
  if (recon.actual.agentCommission) present.push('agentCommission');
  if (recon.actual.companyCommission) present.push('companyCommission');
  if (recon.actual.journal) present.push('journal');
  if (recon.actual.vat) present.push('vat');
  if (recon.actual.deposit) present.push('deposit');
  const mismatched = recon.mismatched || [];
  return {
    paymentId: recon.paymentId,
    accountingComplete: recon.accountingComplete,
    missing: recon.missing,
    mismatched,
    wouldCreate: [...recon.missing],
    wouldNotModify: present.filter((c) => !mismatched.includes(c)),
    requiresManualReview: [...mismatched]
  };
}

export type PaymentAccountingStatus =
  | 'pending'
  | 'posted'
  | 'partial'
  | 'failed'
  | 'not_applicable'
  | 'incomplete';

/** Diagnostic only. Never treat pending/partial/failed as accountingComplete. */
export function deriveAccountingStatus(input: {
  reconStatus: AccountingReconciliationStatus;
  missing: string[];
  mismatched?: string[];
  postedCount?: number;
  retryCount?: number;
}): PaymentAccountingStatus {
  if (input.reconStatus === 'complete') return 'posted';
  if (input.reconStatus === 'not_applicable') return 'not_applicable';
  return 'incomplete';
}

/**
 * Integrity watchdog candidates: explicit incomplete tracking only.
 * Historical payments without accountingComplete/accountingStatus are never selected.
 */
export function buildAccountingIntegrityCandidateFilter(): Record<string, unknown> {
  return {
    $or: [
      { accountingComplete: false },
      { accountingStatus: { $in: ['pending', 'partial', 'failed', 'incomplete'] } }
    ]
  };
}

export function isHistoricalUntrackedPayment(payment: {
  accountingComplete?: boolean | null;
  accountingStatus?: string;
}): boolean {
  return payment?.accountingComplete == null && !payment?.accountingStatus;
}
