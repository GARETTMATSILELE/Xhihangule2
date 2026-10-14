/**
 * Central posting eligibility for payment-derived accounting.
 * Every writer (controllers, change streams, jobs, LedgerEvent processor)
 * must consult this module rather than adding local `if (isProvisional)` guards.
 */

export type AccountingSkipReason =
  | 'missing_payment'
  | 'reversal_row'
  | 'negative_amount'
  | 'not_completed'
  | 'deposit_only'
  | 'provisional'
  | 'suspense'
  | 'commission_unfinalized';

export type PermanentAccountingDecision = {
  allowed: boolean;
  reason?: AccountingSkipReason;
  skipOwnerIncome: boolean;
  skipAgentCommission: boolean;
  skipCompanyCommission: boolean;
  skipJournal: boolean;
  skipTrust: boolean;
  skipPassThrough: boolean;
};

const deny = (
  reason: AccountingSkipReason,
  extras?: Partial<PermanentAccountingDecision>
): PermanentAccountingDecision => ({
  allowed: false,
  reason,
  skipOwnerIncome: true,
  skipAgentCommission: true,
  skipCompanyCommission: true,
  skipJournal: true,
  skipTrust: true,
  skipPassThrough: true,
  ...extras
});

const allowAll = (): PermanentAccountingDecision => ({
  allowed: true,
  skipOwnerIncome: false,
  skipAgentCommission: false,
  skipCompanyCommission: false,
  skipJournal: false,
  skipTrust: false,
  skipPassThrough: false
});

export function isReversalRow(payment: any): boolean {
  return Boolean(payment?.reversalOfPaymentId) || Number(payment?.amount || 0) < 0;
}

export function isProvisionalPayment(payment: any): boolean {
  return payment?.isProvisional === true;
}

/**
 * Deposit-only means there is a deposit and no rental/sale cash (`amount`).
 * `amount` is the rent (or sale) portion, not the receipt total.
 * Combined payments (amount > 0 and depositAmount > 0) are not deposit-only.
 */
export function isDepositOnlyPayment(payment: any): boolean {
  const deposit = Number(payment?.depositAmount || 0);
  const amount = Number(payment?.amount || 0);
  return deposit > 0 && amount <= 0;
}

/**
 * Provisional payments must not create permanent accounting artifacts
 * unless an explicit accounting workflow authorizes them (none currently does).
 *
 * Authorised exception: none. Finalization (`isProvisional: false`) is the
 * only path that unlocks permanent posting.
 */
export function evaluatePermanentAccountingPolicy(payment: any): PermanentAccountingDecision {
  if (!payment) return deny('missing_payment');
  if (payment.reversalOfPaymentId) return deny('reversal_row');
  if (Number(payment.amount || 0) < 0) return deny('negative_amount');
  if (String(payment.status || '') !== 'completed') return deny('not_completed');
  if (payment.isProvisional === true) return deny('provisional');
  if (payment.isInSuspense === true) return deny('suspense');
  if (isDepositOnlyPayment(payment)) {
    return deny('deposit_only');
  }

  const decision = allowAll();
  if (payment.commissionFinalized === false) {
    decision.skipAgentCommission = true;
    decision.skipCompanyCommission = true;
  }
  // Trust posting is sale-only; rental/introduction never post buyer trust receipts.
  if (String(payment.paymentType || '') !== 'sale') {
    decision.skipTrust = true;
  }
  return decision;
}

export function shouldPostOwnerIncome(payment: any): boolean {
  return evaluatePermanentAccountingPolicy(payment).allowed
    && !evaluatePermanentAccountingPolicy(payment).skipOwnerIncome;
}

export function shouldPostAgentCommission(payment: any): boolean {
  const d = evaluatePermanentAccountingPolicy(payment);
  return d.allowed && !d.skipAgentCommission;
}

export function shouldPostCompanyCommission(payment: any): boolean {
  const d = evaluatePermanentAccountingPolicy(payment);
  return d.allowed && !d.skipCompanyCommission;
}

export function shouldPostJournal(payment: any): boolean {
  const d = evaluatePermanentAccountingPolicy(payment);
  return d.allowed && !d.skipJournal;
}

export function shouldPostTrust(payment: any): boolean {
  const d = evaluatePermanentAccountingPolicy(payment);
  return d.allowed && !d.skipTrust;
}

/**
 * Reversal may run against a payment that is already `reversed`.
 * It must still attempt to retire leftover artifacts (partial failure recovery).
 */
export function shouldAttemptAccountingReversal(payment: any): boolean {
  if (!payment) return false;
  if (payment.reversalOfPaymentId) return false;
  const status = String(payment.status || '');
  const postingStatus = String(payment.postingStatus || '');
  return status === 'reversed' || postingStatus === 'reversed' || Boolean(payment.reversalPaymentId);
}

export const COMPANY_REVENUE_SOURCE_OF_TRUTH =
  'CompanyAccount.transactions (active, non-archived agency commission income)';

export const OWNER_INCOME_SOURCE_OF_TRUTH =
  'PropertyAccount.transactions (completed income, non-PASS_THROUGH)';

export const USER_BALANCE_INTENDED_MEANING =
  'User.balance is a leftover agent/admin wallet field — not the owner income ledger. Owner income lives on PropertyAccount.';
