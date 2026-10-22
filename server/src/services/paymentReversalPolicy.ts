/**
 * Authoritative reversal eligibility. Posting, reversal, reporting filters, and
 * correction-draft completion all use these predicates.
 * A reversed original keeps its amount. It is not an ordinary live receipt.
 */
import mongoose from 'mongoose';
import { Payment } from '../models/Payment';
import { AppError } from '../middleware/errorHandler';

export const ACTIVE_REVERSAL_STATES = ['reversal_in_progress', 'reversal_incomplete', 'reversed'] as const;

export type ActiveReversalState = (typeof ACTIVE_REVERSAL_STATES)[number];

export function isReversalDocument(payment: any): boolean {
  return Boolean(payment?.reversalOfPaymentId) || Number(payment?.amount || 0) < 0;
}

export function reversalStateOf(payment: any): string {
  return String(payment?.reversalState || '');
}

/**
 * Completed commission rows that still represent live agency, agent, or PREA income.
 * A reversal document copies the positive snapshot and is excluded.
 * A fully reversed original is excluded. A pending correction is not completed.
 */
export function activeCommissionPaymentFilter(): Record<string, unknown> {
  return {
    reversalOfPaymentId: { $exists: false },
    reversalState: { $ne: 'reversed' },
    amount: { $gte: 0 }
  };
}

export function hasReversalInEffect(payment: any): boolean {
  if (!payment || isReversalDocument(payment)) return false;
  if (payment.reversalPaymentId) return true;
  return ACTIVE_REVERSAL_STATES.includes(reversalStateOf(payment) as ActiveReversalState);
}

export function canStartPaymentReversal(payment: any): { ok: true } | { ok: false; reason: string } {
  if (!payment) return { ok: false, reason: 'missing_payment' };
  if (isReversalDocument(payment)) return { ok: false, reason: 'reversal_document' };
  if (hasReversalInEffect(payment)) return { ok: false, reason: 'reversal_in_effect' };
  const postingStatus = String(payment.postingStatus || '');
  const status = String(payment.status || '');
  if (postingStatus !== 'posted' && status !== 'completed') return { ok: false, reason: 'not_posted' };
  return { ok: true };
}

/**
 * Status query used by payment lists. "reversed" matches reversal metadata,
 * not only the legacy payment.status value.
 */
export function applyPaymentStatusFilter(query: Record<string, any>, status: string): void {
  if (status !== 'reversed') {
    query.status = status;
    return;
  }
  const clause = {
    $or: [
      { status: 'reversed' },
      { postingStatus: 'reversed' },
      { reversalState: { $in: [...ACTIVE_REVERSAL_STATES] } },
      { reversalPaymentId: { $exists: true } },
      { reversalOfPaymentId: { $exists: true } }
    ]
  };
  if (Array.isArray(query.$and)) query.$and.push(clause);
  else query.$and = [clause];
}

export async function assertCorrectionDraftCanComplete(draft: any, companyId: string): Promise<void> {
  const looksLikeCorrection = Boolean(draft?.isCorrectionEntry) || String(draft?.referenceNumber || '').startsWith('CORR-');
  if (!looksLikeCorrection) return;
  if (!companyId || !mongoose.Types.ObjectId.isValid(String(companyId))) {
    throw new AppError('Correction draft company is missing.', 409, 'CORRECTION_COMPANY_REQUIRED');
  }
  const linked = await Payment.findOne({ correctedPaymentId: draft._id, companyId }).lean();
  if (!linked) {
    throw new AppError('Correction draft is not linked to an original payment in this company.', 409, 'CORRECTION_LINK_MISSING');
  }
  if (String((linked as any).companyId) !== String(companyId)) {
    throw new AppError('Correction draft belongs to another company.', 403, 'CORRECTION_COMPANY_MISMATCH');
  }
  if (String((linked as any).correctedPaymentId || '') !== String(draft._id)) {
    throw new AppError('Correction draft link does not match the original payment.', 409, 'CORRECTION_LINK_MISMATCH');
  }
  if (!(linked as any).reversalPaymentId) {
    throw new AppError('Correction draft cannot be posted until the reversal payment exists.', 409, 'REVERSAL_PAYMENT_MISSING');
  }
  const reversal = await Payment.findOne({
    _id: (linked as any).reversalPaymentId,
    companyId
  }).select('_id reversalOfPaymentId amount companyId').lean();
  if (!reversal || String((reversal as any).reversalOfPaymentId || '') !== String((linked as any)._id)) {
    throw new AppError('Correction draft reversal payment does not match the original.', 409, 'REVERSAL_LINK_MISMATCH');
  }
  if (String((linked as any).reversalState || '') !== 'reversed') {
    throw new AppError(
      'Correction draft cannot be posted until the reversal accounting has settled.',
      409,
      'REVERSAL_NOT_SETTLED'
    );
  }
}
