import mongoose from 'mongoose';

/**
 * Matches existing poll/failure-reprocessor conventions (100).
 * Caps prevent accidental unbounded in-memory batches.
 */
export const PAYMENT_RECONCILIATION_BATCH_SIZE = Math.min(
  500,
  Math.max(1, Number(process.env.PAYMENT_RECONCILIATION_BATCH_SIZE || 100))
);

export type OwnerIncomeReconciliationFilterOptions = {
  companyId?: string;
  paymentDateFrom?: Date;
};

/**
 * Mongo filter for payments that recordIncomeFromPayment might still attempt.
 *
 * Intentionally does NOT treat "income already on PropertyAccount" as skippable:
 * sale payments can require multiple ledger targets, and pass-through/expense
 * posting still runs after an existing income row. Skipping those would change
 * recovery behaviour.
 *
 * Payment-field exclusions match recordIncomeFromPayment early returns only:
 * not completed, reversal rows, negative amounts. Deposit-only is applied in
 * `isRecordIncomeEarlyExit` after a bounded fetch (avoids $expr on Cosmos).
 */
export function buildOwnerIncomeReconciliationPaymentFilter(
  options?: OwnerIncomeReconciliationFilterOptions
): Record<string, unknown> {
  const filter: Record<string, unknown> = {
    status: 'completed',
    amount: { $gte: 0 },
    $or: [{ reversalOfPaymentId: { $exists: false } }, { reversalOfPaymentId: null }],
    isProvisional: { $ne: true },
    isInSuspense: { $ne: true }
  };

  const companyId = typeof options?.companyId === 'string' ? options.companyId.trim() : '';
  if (companyId) {
    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      throw new Error('Invalid companyId for payment reconciliation');
    }
    filter.companyId = new mongoose.Types.ObjectId(companyId);
  }

  if (options?.paymentDateFrom instanceof Date && !Number.isNaN(options.paymentDateFrom.getTime())) {
    filter.paymentDate = { $gte: options.paymentDateFrom };
  }

  return filter;
}

export function isRecordIncomeEarlyExit(payment: {
  status?: string;
  amount?: number;
  depositAmount?: number;
  reversalOfPaymentId?: unknown;
  isProvisional?: boolean;
  isInSuspense?: boolean;
}): boolean {
  if (payment.reversalOfPaymentId) return true;
  if (Number(payment.amount || 0) < 0) return true;
  if (payment.status !== 'completed') return true;
  if (payment.isProvisional === true) return true;
  if (payment.isInSuspense === true) return true;
  const deposit = Number(payment.depositAmount || 0);
  if (deposit > 0 && Number(payment.amount || 0) <= deposit) return true;
  return false;
}
