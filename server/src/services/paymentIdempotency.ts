import mongoose from 'mongoose';
import { Payment } from '../models/Payment';

/**
 * A reversed, voided, or negative receipt must not keep answering later submits
 * of the same form. The key belongs to the live receipt only.
 */
export function idempotencyHolderIsRetired(payment: {
  reversalOfPaymentId?: unknown;
  reversalState?: string;
  status?: string;
  postingStatus?: string;
  amount?: number;
} | null | undefined): boolean {
  if (!payment) return false;
  if (payment.reversalOfPaymentId) return true;
  if (Number(payment.amount || 0) < 0) return true;
  if (String(payment.reversalState || '') === 'reversed') return true;
  const status = String(payment.status || '').toLowerCase();
  const posting = String(payment.postingStatus || '').toLowerCase();
  if (status === 'reversed' || status === 'failed') return true;
  if (posting === 'reversed' || posting === 'voided') return true;
  return false;
}

/**
 * Return the live payment for this key.
 * If the key is still sitting on a reversed receipt, release it and return null
 * so the caller can store a new receipt.
 */
export async function findLiveIdempotentPayment(params: {
  companyId: unknown;
  idempotencyKey?: string | null;
  session?: mongoose.ClientSession | null;
}): Promise<any | null> {
  const key = String(params.idempotencyKey || '').trim();
  if (!key || !params.companyId) return null;
  const companyId = mongoose.Types.ObjectId.isValid(String(params.companyId))
    ? new mongoose.Types.ObjectId(String(params.companyId))
    : params.companyId;
  let query = Payment.findOne({ companyId, idempotencyKey: key });
  if (params.session) query = query.session(params.session);
  const existing = await query.lean();
  if (!existing) return null;
  if (!idempotencyHolderIsRetired(existing)) return existing;
  const release = Payment.updateOne(
    { _id: (existing as any)._id, idempotencyKey: key },
    { $unset: { idempotencyKey: 1 } }
  );
  if (params.session) release.session(params.session);
  await release;
  return null;
}
