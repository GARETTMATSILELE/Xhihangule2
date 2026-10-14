/**
 * Completed financial Payments are immutable for material financial fields.
 * Corrections belong on the existing reverse → reversal payment → correction draft workflow.
 * Do not UPDATE the original completed Payment amount.
 */
export const COMPLETED_PAYMENT_IMMUTABLE_MESSAGE =
  'Completed financial Payments cannot be edited directly. Reverse the original Payment and post a correction through the approved correction process.';

export const PAYMENT_FINANCIAL_FIELDS = [
  'amount',
  'depositAmount',
  'rentAllocated',
  'levyAllocated',
  'rentUsed',
  'levyUsed',
  'commissionDetails',
  'vatIncluded',
  'vatRate',
  'vatAmount',
  'applyVatOnCommission',
  'vatOnCommissionRate',
  'vatCommissionTreatment',
  'currency',
  'paymentMethod',
  'propertyId',
  'tenantId',
  'leaseId',
  'agentId',
  'companyId',
  'paymentDate',
  'rentalPeriodMonth',
  'rentalPeriodYear',
  'paymentType',
  'paymentLines'
] as const;

export type PaymentFinancialField = (typeof PAYMENT_FINANCIAL_FIELDS)[number];

export function isCompletedFinancialPayment(payment: {
  status?: string;
  postingStatus?: string;
  isProvisional?: boolean;
  isInSuspense?: boolean;
} | null | undefined): boolean {
  if (!payment) return false;
  if (payment.isProvisional === true || payment.isInSuspense === true) return false;
  const status = String(payment.status || '').toLowerCase();
  const posting = String(payment.postingStatus || '').toLowerCase();
  return status === 'completed' || posting === 'posted' || status === 'reversed';
}

const UPDATE_OPERATORS_WITH_KEYS = ['$set', '$unset', '$inc', '$push', '$addToSet', '$pull', '$rename'] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Collect top-level and dotted keys from a Mongoose query update document. */
export function collectQueryUpdateKeys(update: Record<string, unknown> | null | undefined): string[] {
  if (!isPlainObject(update)) return [];
  const keys: string[] = [];
  let sawOperator = false;
  for (const op of UPDATE_OPERATORS_WITH_KEYS) {
    const payload = update[op];
    if (!isPlainObject(payload)) continue;
    sawOperator = true;
    keys.push(...Object.keys(payload));
  }
  if (!sawOperator) {
    keys.push(...Object.keys(update).filter((key) => !key.startsWith('$')));
  }
  return keys;
}

export function financialFieldsInQueryUpdate(update: Record<string, unknown> | null | undefined): PaymentFinancialField[] {
  const keys = collectQueryUpdateKeys(update);
  return PAYMENT_FINANCIAL_FIELDS.filter((field) =>
    keys.some((key) => key === field || key.startsWith(`${field}.`))
  );
}

export function financialFieldsPresentInPayload(payload: Record<string, unknown> | null | undefined): PaymentFinancialField[] {
  if (!payload || typeof payload !== 'object') return [];
  const own = PAYMENT_FINANCIAL_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(payload, field));
  if (own.length) return own;
  return financialFieldsInQueryUpdate(payload);
}

export function assertCompletedPaymentFinanciallyImmutable(
  payment: {
    status?: string;
    postingStatus?: string;
    isProvisional?: boolean;
    isInSuspense?: boolean;
  } | null | undefined,
  payload?: Record<string, unknown> | null
): void {
  if (!isCompletedFinancialPayment(payment)) return;
  const attempted = financialFieldsPresentInPayload(payload || {});
  if (payload && attempted.length === 0) return;
  const error = new Error(COMPLETED_PAYMENT_IMMUTABLE_MESSAGE) as Error & { statusCode?: number; code?: string };
  error.statusCode = 409;
  error.code = 'PAYMENT_FINANCIAL_IMMUTABLE';
  throw error;
}
