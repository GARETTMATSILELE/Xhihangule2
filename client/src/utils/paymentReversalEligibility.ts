export type ReversalListPayment = {
  _id?: string;
  amount?: number;
  status?: string;
  postingStatus?: string;
  reversalOfPaymentId?: string;
  reversalPaymentId?: string;
  reversalState?: string;
  correctedPaymentId?: string;
};

const BLOCKED_STATES = new Set(['reversal_in_progress', 'reversal_incomplete', 'reversed']);

export function isPaymentReversible(payment: ReversalListPayment | null | undefined): boolean {
  if (!payment) return false;
  const postingStatus = String(payment.postingStatus || '').toLowerCase();
  const status = String(payment.status || '').toLowerCase();
  if (payment.reversalOfPaymentId) return false;
  if (payment.reversalPaymentId) return false;
  if (BLOCKED_STATES.has(String(payment.reversalState || ''))) return false;
  if (Number(payment.amount || 0) < 0) return false;
  if (status === 'reversed' || postingStatus === 'reversed' || postingStatus === 'voided' || postingStatus === 'draft') return false;
  return postingStatus === 'posted' || status === 'completed' || status === 'paid' || status === 'success';
}

export function paymentDisplayStatus(payment: ReversalListPayment | null | undefined): string {
  if (!payment) return 'unknown';
  if (payment.reversalOfPaymentId || Number(payment.amount || 0) < 0) return 'reversal';
  const state = String(payment.reversalState || '');
  if (state === 'reversal_incomplete') return 'reversal incomplete';
  if (state === 'reversal_in_progress') return 'reversal in progress';
  if (state === 'reversed' || payment.reversalPaymentId) return 'reversed';
  return String(payment.status || 'unknown');
}

export function mergeReversalRows<T extends { _id?: string }>(previous: T[], incoming: Array<T | null | undefined>): T[] {
  const map = new Map<string, T>();
  for (const row of previous) {
    if (row?._id) map.set(String(row._id), row);
  }
  for (const row of incoming) {
    if (row?._id) map.set(String(row._id), row);
  }
  const rows: T[] = [];
  map.forEach((row) => rows.push(row));
  return rows;
}

export function countsAsCollectedReceipt(payment: ReversalListPayment | null | undefined): boolean {
  const status = String(payment?.status || '').toLowerCase();
  return status === 'completed' || status === 'paid' || status === 'success';
}

export function reversalOutcomeIsSettled(response: { outcome?: string; message?: string } | null | undefined): boolean {
  if (!response) return false;
  if (response.outcome === 'reversal_incomplete' || response.outcome === 'reversal_failed') return false;
  if (response.outcome === 'reversed') return true;
  return !String(response.message || '').toLowerCase().includes('incomplete');
}
