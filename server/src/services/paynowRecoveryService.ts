import axios from 'axios';
import { PaymentSession } from '../models/PaymentSession';
import { applyPolledPayment } from './applyPolledPayment';
import { logger } from '../utils/logger';
import { normalizePaynowCredential, parsePaynowBody } from './paynowHash';
import {
  evaluateProviderPoll,
  isAllowedPaynowPollUrl,
  PAYNOW_RECOVERY_MAX_ATTEMPTS,
  paynowRecoveryDecision,
  verifyPaynowPayload
} from './registrationPaymentPolicy';

const BATCH_LIMIT = 10;

function integrationKey(): string {
  return normalizePaynowCredential(process.env.PAYNOW_INTEGRATION_KEY);
}

export async function recoverOutstandingPaynowSessions(now: Date = new Date()): Promise<{ checked: number; applied: number }> {
  if (!integrationKey()) return { checked: 0, applied: 0 };
  const candidates = await PaymentSession.find({
    provider: 'paynow',
    status: 'provider_created',
    pollUrl: { $exists: true, $nin: [null, ''] }
  }).sort({ createdAt: 1 }).limit(BATCH_LIMIT);

  let checked = 0;
  let applied = 0;
  for (const session of candidates) {
    const decision = paynowRecoveryDecision(session, now);
    if (decision.action !== 'poll') continue;
    const claimed = await PaymentSession.findOneAndUpdate(
      { _id: session._id, status: 'provider_created' },
      {
        $inc: { 'metadata.paynowRecovery.attempts': 1 },
        $set: { 'metadata.paynowRecovery.lastAttemptAt': now }
      },
      { new: true }
    );
    if (!claimed || Number((claimed.metadata as { paynowRecovery?: { attempts?: number } } | undefined)?.paynowRecovery?.attempts || 0) > PAYNOW_RECOVERY_MAX_ATTEMPTS) {
      continue;
    }
    checked += 1;
    const reference = String(claimed.providerRef || '');
    try {
      const outcome = await recoverOneSession(claimed);
      if (outcome === 'applied') applied += 1;
      logger.info('paynow_recovery_checked', {
        correlationId: reference,
        reference,
        paymentSessionId: String(claimed._id),
        outcome
      });
    } catch (error) {
      logger.warn('paynow_recovery_failed', {
        correlationId: reference,
        reference,
        paymentSessionId: String(claimed._id),
        error: String((error as { message?: string })?.message || error).slice(0, 160)
      });
    }
  }
  return { checked, applied };
}

async function recoverOneSession(session: {
  _id: unknown;
  providerRef?: string;
  pollUrl?: string;
  amount?: number;
  currency?: string;
  companyId?: unknown;
  rawProviderResponse?: unknown;
}): Promise<'applied' | 'pending' | 'rejected' | 'unverified'> {
  const pollUrl = String(session.pollUrl || '');
  const reference = String(session.providerRef || '');
  if (!isAllowedPaynowPollUrl(pollUrl)) return 'rejected';
  const response = await axios.post(pollUrl, null, { timeout: 15000, responseType: 'text', maxRedirects: 0 });
  const raw = typeof response.data === 'string' ? response.data : String(response.data || '');
  const fields = parsePaynowBody(raw);
  if (!verifyPaynowPayload(fields, integrationKey())) return 'unverified';
  const poll = {
    status: fields.status,
    amount: fields.amount,
    currency: fields.currency,
    reference: fields.reference,
    paynowReference: fields.paynowreference,
    origin: 'verified_poll' as const
  };
  const storedPaynowReference = String((session.rawProviderResponse as { paynowReference?: string } | undefined)?.paynowReference || '').trim();
  if (storedPaynowReference && poll.paynowReference && storedPaynowReference !== poll.paynowReference) return 'rejected';
  if (String(session.companyId || '') === '') return 'rejected';
  const verdict = evaluateProviderPoll(
    { amount: Number(session.amount), currency: String(session.currency || 'USD'), providerRef: reference },
    poll
  );
  if (verdict.outcome === 'pending') return 'pending';
  if (verdict.outcome === 'rejected') return 'rejected';
  await applyPolledPayment(reference, poll);
  return 'applied';
}

let recoveryTimer: NodeJS.Timeout | undefined;
let recoveryStarted = false;

export function startPaynowRecoveryJob(): void {
  if (recoveryStarted || process.env.NODE_ENV !== 'production' || process.env.PAYNOW_RECOVERY_DISABLED === '1') return;
  recoveryStarted = true;
  const run = () => {
    recoverOutstandingPaynowSessions().catch((error) => {
      logger.warn('paynow_recovery_failed', {
        error: String((error as { message?: string })?.message || error).slice(0, 160)
      });
    });
  };
  const initial = setTimeout(run, 15000);
  initial.unref?.();
  recoveryTimer = setInterval(run, 2 * 60 * 1000);
  recoveryTimer.unref?.();
}
