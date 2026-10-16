import { PaymentSession } from '../models/PaymentSession';
import { BillingPayment } from '../models/BillingPayment';
import { activateSubscriptionFromPayment } from './billingActivationService';
import { evaluateProviderPoll, ProviderPoll } from './registrationPaymentPolicy';
import { recordAuditEvent } from './auditService';
import { upsertFinancialReview } from './financialOperationVisibility';
import { logger } from '../utils/logger';
import { noteMissingAudit } from './auditPolicy';
import { signalOperationalFailure } from './operationalSignal';

export async function resolvePaynowProviderRef(reference: string) {
  const sessions = await PaymentSession.find({ provider: 'paynow', providerRef: reference });
  if (sessions.length === 0) return { kind: 'missing' as const };
  if (sessions.length === 1) return { kind: 'unique' as const, session: sessions[0] };
  const sessionIds = sessions.map((session) => String(session._id));
  logger.error('paynow_provider_ref_ambiguous', {
    correlationId: reference,
    reference,
    sessionCount: sessions.length,
    sessionIds
  });
  const companyIds = Array.from(new Set(sessions.map((session) => String(session.companyId || '')).filter(Boolean)));
  for (const companyId of companyIds) {
    try {
      if (process.env.NODE_ENV !== 'production' && process.env.MANTIS_TEST_SEAM === '1' && (global as any).__failPaynowReview) {
        (global as any).__failPaynowReview = false;
        throw new Error('PHASE_FAIL_PAYNOW_REVIEW');
      }
      await upsertFinancialReview({
        companyId,
        component: 'PAYNOW_PROVIDER_REF_AMBIGUOUS',
        operationId: reference,
        missingRecord: 'unique payment session',
        issueType: 'mismatched',
        recommendedReview: `Provider reference ${reference} matches ${sessions.length} Paynow sessions. No session was activated. Identify the session before any registration change.`
      });
    } catch (error) {
      signalOperationalFailure('paynow_provider_ref_review_failed', {
        correlationId: reference,
        reference,
        companyId,
        error: String((error as { message?: string })?.message || error).slice(0, 200)
      });
    }
  }
  return { kind: 'ambiguous' as const, sessions };
}

export async function notePaynowLateStatus(reference: string, status: string, knownSession?: { companyId?: unknown; status?: string }): Promise<void> {
  const normalized = status.trim().toLowerCase();
  if (normalized !== 'refunded' && normalized !== 'disputed') return;
  let session = knownSession?.companyId ? knownSession : undefined;
  if (!session) {
    const resolved = await resolvePaynowProviderRef(reference);
    if (resolved.kind === 'unique') session = resolved.session;
  }
  if (!session?.companyId) {
    signalOperationalFailure('paynow_late_status_unmatched', {
      correlationId: reference,
      reference,
      status: normalized
    });
    return;
  }
  try {
    if (process.env.NODE_ENV !== 'production' && process.env.MANTIS_TEST_SEAM === '1' && (global as any).__failPaynowLateReview) {
      (global as any).__failPaynowLateReview = false;
      throw new Error('PHASE_FAIL_PAYNOW_LATE_REVIEW');
    }
    await upsertFinancialReview({
      companyId: String(session.companyId),
      component: 'PAYNOW_LATE_STATUS',
      operationId: `${reference}:${normalized}`,
      missingRecord: 'manual review of a Paynow refund or dispute',
      issueType: 'mismatched',
      recommendedReview: `Paynow reported ${normalized} for reference ${reference} while the session was ${session.status}. The payment and subscription were not reversed.`
    });
  } catch (error) {
    signalOperationalFailure('paynow_late_status_review_failed', {
      correlationId: reference,
      reference,
      companyId: String(session.companyId),
      status: normalized,
      error: String((error as { message?: string })?.message || error).slice(0, 200)
    });
  }
}

export async function applyPolledPayment(reference: string, poll: ProviderPoll) {
  const resolved = await resolvePaynowProviderRef(reference);
  if (resolved.kind === 'missing') return { found: false as const, activated: false };
  if (resolved.kind === 'ambiguous') {
    return {
      found: true as const,
      activated: false,
      ignored: true,
      reviewRequired: true,
      paymentStatus: 'review_required'
    };
  }
  const session = resolved.session;
  const decision = evaluateProviderPoll(
    { amount: Number(session.amount), currency: session.currency || 'USD', providerRef: session.providerRef },
    poll
  );
  const lateStatus = decision.outcome === 'failed' && (decision.status === 'refunded' || decision.status === 'disputed')
    ? decision.status
    : '';
  const terminal = session.status === 'paid' || session.status === 'reconciled' || session.status === 'cancelled' || session.status === 'failed' || session.status === 'expired';
  if (terminal && lateStatus) {
    await notePaynowLateStatus(reference, lateStatus, session);
    return {
      found: true as const,
      activated: false,
      ignored: true,
      reviewRequired: true,
      paymentStatus: lateStatus,
      session
    };
  }
  if (session.status === 'cancelled' || session.status === 'failed' || session.status === 'expired') {
    return { found: true as const, paymentStatus: session.status, activated: false, ignored: true, session };
  }
  if (session.status === 'reconciled') {
    await activateSubscriptionFromPayment({
      paymentSessionId: String(session._id),
      provider: 'paynow',
      providerRef: reference,
      rawProviderResponse: session.rawProviderResponse,
      paidAt: session.paidAt || new Date()
    });
    return { found: true as const, paymentStatus: 'reconciled', activated: false, alreadyComplete: true, session };
  }
  if (session.status === 'paid') {
    if (decision.outcome !== 'paid') {
      return { found: true as const, paymentStatus: 'paid', activated: false, ignored: true, session };
    }
    const resumed = await activateSubscriptionFromPayment({
      paymentSessionId: String(session._id),
      provider: 'paynow',
      providerRef: reference,
      rawProviderResponse: session.rawProviderResponse,
      paidAt: session.paidAt || new Date()
    });
    return { found: true as const, paymentStatus: 'paid', activated: resumed.alreadyProcessed !== true, resumed: true, session };
  }

  if (decision.outcome === 'rejected') {
    const error: any = new Error(decision.reason);
    error.statusCode = 409;
    error.code = 'PAYMENT_MISMATCH';
    throw error;
  }
  if (decision.outcome === 'paid') {
    const audited = await recordAuditEvent({
      companyId: String(session.companyId),
      action: 'payment.verified',
      entityType: 'PaymentSession',
      entityId: String(session._id),
      metadata: { providerRef: session.providerRef }
    });
    if (!audited) {
      const error: any = new Error('Payment activation was not started because the audit event could not be stored');
      error.code = 'AUDIT_PERSIST_FAILED';
      throw error;
    }
    const activation = await activateSubscriptionFromPayment({
      paymentSessionId: String(session._id),
      provider: 'paynow',
      providerRef: reference,
      rawProviderResponse: {
        status: 'paid',
        amount: Number(poll.amount),
        paynowReference: poll.paynowReference,
        currency: poll.currency
      },
      paidAt: new Date()
    });
    return { found: true as const, paymentStatus: 'paid', activated: activation.alreadyProcessed !== true, session };
  }
  if (decision.outcome === 'failed') {
    session.status = decision.status === 'cancelled' || decision.status === 'expired' ? decision.status : 'failed';
    session.failedAt = new Date();
    await session.save();
    if (session.billingPaymentId) {
      await BillingPayment.findByIdAndUpdate(session.billingPaymentId, {
        $set: { status: session.status === 'cancelled' ? 'cancelled' : 'failed', failedAt: session.failedAt }
      });
    }
    const action = session.status === 'cancelled' ? 'checkout.cancelled' : 'checkout.failed';
    const audited = await recordAuditEvent({
      companyId: String(session.companyId),
      action,
      entityType: 'PaymentSession',
      entityId: String(session._id),
      metadata: { providerRef: session.providerRef }
    });
    if (!audited) {
      await noteMissingAudit({
        action,
        companyId: String(session.companyId),
        entityId: String(session._id),
        operationId: String(session._id)
      });
    }
    return { found: true as const, paymentStatus: session.status, activated: false, session };
  }
  return { found: true as const, paymentStatus: decision.status || session.status, activated: false, session };
}
