export type PaymentReferenceRecord = {
  amount?: number;
  paymentType?: string;
  paymentDate?: unknown;
  createdAt?: unknown;
};

function dayKey(value: unknown): string {
  if (!value) return '';
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

/**
 * The schema asks for one non-empty reference per company.
 * Live rows also reuse a reference for separate installments, so this
 * classification is evidence for review. It does not merge or reject payments.
 */
export function classifyPaymentReferenceGroup(records: PaymentReferenceRecord[]): 'possible_duplicate' | 'separate_transactions_sharing_a_reference' | 'review_required' {
  const amounts = new Set(records.map((row) => Number(row.amount)));
  const types = new Set(records.map((row) => String(row.paymentType || '')));
  const days = new Set(records.map((row) => dayKey(row.paymentDate) || dayKey(row.createdAt)));
  if (amounts.size === 1 && types.size === 1 && days.size === 1) return 'possible_duplicate';
  if (amounts.size > 1 || types.size > 1 || days.size > 1) return 'separate_transactions_sharing_a_reference';
  return 'review_required';
}
