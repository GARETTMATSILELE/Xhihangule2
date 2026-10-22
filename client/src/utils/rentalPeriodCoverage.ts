/**
 * Client mirror of the server rent-coverage rules.
 * The server remains the authority when a payment is created.
 */
export type RentCoveragePayment = {
  amount?: number;
  depositAmount?: number;
  rentAllocated?: number | null;
  rentUsed?: number;
  status?: string;
  postingStatus?: string;
  reversalState?: string;
  reversalOfPaymentId?: string;
  isCorrectionEntry?: boolean;
  referenceNumber?: string;
  rentalPeriodMonth?: number;
  rentalPeriodYear?: number;
  advanceMonthsPaid?: number;
  advancePeriodStart?: { month?: number; year?: number };
  advancePeriodEnd?: { month?: number; year?: number };
  leaseId?: string;
  currency?: string;
  paymentType?: string;
};

const ACTIVE = new Set(['pending', 'completed', 'paid', 'success']);

function monthIndex(year?: number, month?: number): number | null {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  return y * 12 + m;
}

export function isPendingCorrectionDraft(payment: RentCoveragePayment | null | undefined): boolean {
  if (!payment) return false;
  const status = String(payment.status || '').toLowerCase();
  if (status === 'completed' || status === 'paid' || status === 'success') return false;
  const ref = String(payment.referenceNumber || '');
  const looksLikeCorrection = payment.isCorrectionEntry === true || ref.startsWith('CORR-');
  if (!looksLikeCorrection) return false;
  return status === 'pending' || String(payment.postingStatus || '').toLowerCase() === 'draft';
}

export function coverageForMonth(
  payment: RentCoveragePayment | null | undefined,
  year: number,
  month: number
): number {
  if (!payment) return 0;
  const status = String(payment.status || '').toLowerCase();
  if (!ACTIVE.has(status)) return 0;
  if (payment.reversalOfPaymentId) return 0;
  if (Number(payment.amount || 0) < 0) return 0;
  if (String(payment.reversalState || '') === 'reversed') return 0;
  if (isPendingCorrectionDraft(payment)) return 0;
  const amount = Number(payment.amount || 0);
  const deposit = Number(payment.depositAmount || 0);
  if (amount <= 0 && deposit > 0) return 0;
  const target = monthIndex(year, month);
  const own = monthIndex(payment.rentalPeriodYear, payment.rentalPeriodMonth);
  const months = Number(payment.advanceMonthsPaid || 1);
  let covers = own != null && own === target;
  if (!covers && months > 1) {
    const start = monthIndex(payment.advancePeriodStart?.year, payment.advancePeriodStart?.month);
    const end = monthIndex(payment.advancePeriodEnd?.year, payment.advancePeriodEnd?.month);
    covers = start != null && end != null && target != null && target >= Math.min(start, end) && target <= Math.max(start, end);
  }
  if (!covers || target == null) return 0;
  const portion = payment.rentAllocated != null && payment.rentAllocated !== ('' as any)
    ? Number(payment.rentAllocated)
    : amount;
  if (!(portion > 0)) return 0;
  if (months > 1) {
    const monthly = Number(payment.rentUsed || 0);
    return monthly > 0 ? monthly : portion / months;
  }
  return portion;
}

/** Amount that blocks another receipt. Pending correction drafts reserve the month without counting as rent received. */
export function reservationForMonth(
  payment: RentCoveragePayment | null | undefined,
  year: number,
  month: number
): number {
  if (!payment) return 0;
  if (isPendingCorrectionDraft(payment)) {
    const status = String(payment.status || '').toLowerCase();
    if (status === 'failed' || status === 'voided') return 0;
    if (payment.reversalOfPaymentId) return 0;
    if (Number(payment.amount || 0) < 0) return 0;
    const amount = Number(payment.amount || 0);
    const deposit = Number(payment.depositAmount || 0);
    if (amount <= 0 && deposit > 0) return 0;
    const held = { ...payment, status: 'completed', isCorrectionEntry: false, referenceNumber: 'RCPT-HELD' };
    return coverageForMonth(held, year, month);
  }
  return coverageForMonth(payment, year, month);
}
