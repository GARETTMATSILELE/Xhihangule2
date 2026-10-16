import { WebhookEventReceipt } from '../models/WebhookEventReceipt';
import { logger } from '../utils/logger';
import { signalOperationalFailure } from './operationalSignal';
import { notePaynowLateStatus } from './applyPolledPayment';
import { samePaynowEventConflict } from './paynowWebhookIdentity';

const STALE_PROCESSING_MS = 2 * 60 * 1000;

export type PaynowClaim =
  | { action: 'process'; receipt: InstanceType<typeof WebhookEventReceipt> }
  | { action: 'duplicate'; payloadFingerprint?: string }
  | { action: 'in_progress' };

/**
 * Claim one Paynow callback. The unique { provider, eventId } index is the lock when it exists.
 * Startup does not create that index. A duplicate key without provider and eventId metadata is not
 * proof that this event was processed, and it does not activate a subscription.
 * A duplicate key is not payment success. Activation happens only after a paid,
 * matching poll is applied by the caller.
 */
export async function claimPaynowEvent(eventId: string, payloadFingerprint?: string): Promise<PaynowClaim> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_PROCESSING_MS);
  const reclaimed = await WebhookEventReceipt.findOneAndUpdate(
    {
      provider: 'paynow',
      eventId,
      $or: [
        { status: 'failed' },
        { status: 'processing', updatedAt: { $lte: staleBefore } }
      ]
    },
    { $set: { status: 'processing', ...(payloadFingerprint ? { payloadFingerprint } : {}) }, $unset: { lastError: 1 } },
    { new: true }
  );
  if (reclaimed) return { action: 'process', receipt: reclaimed };

  const existing = await WebhookEventReceipt.findOne({ provider: 'paynow', eventId });
  if (existing?.status === 'processed') return { action: 'duplicate', payloadFingerprint: existing.payloadFingerprint };
  if (existing?.status === 'processing') return { action: 'in_progress' };

  try {
    if (process.env.NODE_ENV !== 'production' && process.env.MANTIS_TEST_SEAM === '1' && (global as any).__paynowDuplicateKey) {
      const synthetic = (global as any).__paynowDuplicateKey;
      (global as any).__paynowDuplicateKey = undefined;
      throw synthetic;
    }
    const created = await WebhookEventReceipt.create({
      provider: 'paynow',
      eventId,
      status: 'processing',
      payloadFingerprint: payloadFingerprint || undefined
    });
    if (process.env.NODE_ENV !== 'production' && process.env.MANTIS_TEST_SEAM === '1' && (global as any).__paynowUncertainReceiptCreate) {
      (global as any).__paynowUncertainReceiptCreate = false;
      const uncertain: any = new Error('UNCERTAIN_RECEIPT_WRITE');
      uncertain.code = 'UNCERTAIN_WRITE';
      throw uncertain;
    }
    return { action: 'process', receipt: created };
  } catch (error) {
    const code = Number((error as { code?: unknown })?.code);
    if (code !== 11000) throw error;
    if (!samePaynowEventConflict(error, eventId)) {
      signalOperationalFailure('paynow_callback_conflict_unidentified', {
        correlationId: eventId,
        eventId
      });
      throw error;
    }
    const raced = await WebhookEventReceipt.findOne({ provider: 'paynow', eventId });
    if (!raced) {
      signalOperationalFailure('paynow_callback_conflict_unidentified', {
        correlationId: eventId,
        eventId,
        outcome: 'receipt_missing'
      });
      throw error;
    }
    if (raced.status === 'processed') return { action: 'duplicate', payloadFingerprint: raced.payloadFingerprint };
    return { action: 'in_progress' };
  }
}

export async function processVerifiedPaynowEvent(input: {
  reference: string;
  eventId: string;
  payloadFingerprint?: string;
  apply: () => Promise<{ found?: boolean; paymentStatus?: string; activated?: boolean; ignored?: boolean; session?: { companyId?: unknown; billingPaymentId?: unknown } }>;
}): Promise<{ status: string; activated: boolean; ignored: boolean }> {
  const claim = await claimPaynowEvent(input.eventId, input.payloadFingerprint);
  if (claim.action === 'duplicate') {
    if (input.payloadFingerprint && claim.payloadFingerprint && claim.payloadFingerprint !== input.payloadFingerprint) {
      signalOperationalFailure('paynow_callback_payload_conflict', {
        correlationId: input.reference,
        reference: input.reference,
        eventId: input.eventId
      });
      const lateStatus = String(input.payloadFingerprint.split('|')[1] || '').trim().toLowerCase();
      if (lateStatus === 'refunded' || lateStatus === 'disputed') {
        await notePaynowLateStatus(input.reference, lateStatus);
      }
      return { status: 'payload_conflict', activated: false, ignored: true };
    }
    return { status: 'duplicate', activated: false, ignored: false };
  }
  if (claim.action === 'in_progress') return { status: 'in_progress', activated: false, ignored: false };
  const receipt = claim.receipt;

  try {
    const applied = await input.apply();
    const activated = applied.activated === true;
    const ignored = applied.ignored === true;
    if (applied.session?.companyId) receipt.companyId = applied.session.companyId as any;
    if (applied.session?.billingPaymentId) receipt.paymentId = applied.session.billingPaymentId as any;
    receipt.status = 'processed';
    receipt.processedAt = new Date();
    await receipt.save();
    if (ignored) {
      logger.warn('paynow_callback_ignored', {
        correlationId: input.reference,
        reference: input.reference,
        eventId: input.eventId,
        paymentStatus: applied.paymentStatus
      });
    }
    return { status: ignored ? 'ignored' : 'received', activated, ignored };
  } catch (error) {
    receipt.status = 'failed';
    receipt.lastError = String((error as { message?: string })?.message || error).slice(0, 200);
    try {
      await receipt.save();
    } catch (saveError) {
      signalOperationalFailure('paynow_callback_receipt_update_failed', {
        correlationId: input.reference,
        reference: input.reference,
        eventId: input.eventId,
        error: String((saveError as { message?: string })?.message || saveError).slice(0, 200)
      });
    }
    signalOperationalFailure('paynow_callback_processing_failed', {
      correlationId: input.reference,
      reference: input.reference,
      eventId: input.eventId,
      code: String((error as { code?: unknown })?.code || 'callback_failed')
    });
    throw error;
  }
}
