import { PaymentSession } from '../models/PaymentSession';
import { BillingPayment } from '../models/BillingPayment';
import { activateSubscriptionFromPayment } from './billingActivationService';
import { evaluateProviderPoll, ProviderPoll } from './registrationPaymentPolicy';
import { recordAuditEvent } from './auditService';

export async function applyPolledPayment(reference: string, poll: ProviderPoll) {
  const session = await PaymentSession.findOne({ provider: 'paynow', providerRef: reference });
  if (!session) return { found: false as const, activated: false };
  if (session.status === 'paid' || session.status === 'reconciled') {
    return { found: true as const, paymentStatus: 'paid', activated: false, session };
  }

  const decision = evaluateProviderPoll(
    { amount: Number(session.amount), currency: session.currency || 'USD', providerRef: session.providerRef },
    poll
  );
  if (decision.outcome === 'rejected') {
    const error: any = new Error(decision.reason);
    error.statusCode = 409;
    error.code = 'PAYMENT_MISMATCH';
    throw error;
  }
  if (decision.outcome === 'paid') {
    await recordAuditEvent({
      companyId: String(session.companyId),
      action: 'payment.verified',
      entityType: 'PaymentSession',
      entityId: String(session._id),
      metadata: { providerRef: session.providerRef }
    });
    await activateSubscriptionFromPayment({
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
    return { found: true as const, paymentStatus: 'paid', activated: true, session };
  }
  if (decision.outcome === 'failed') {
    session.status = decision.status === 'cancelled' ? 'cancelled' : 'failed';
    session.failedAt = new Date();
    await session.save();
    if (session.billingPaymentId) {
      await BillingPayment.findByIdAndUpdate(session.billingPaymentId, {
        $set: { status: session.status === 'cancelled' ? 'cancelled' : 'failed', failedAt: session.failedAt }
      });
    }
    await recordAuditEvent({
      companyId: String(session.companyId),
      action: session.status === 'cancelled' ? 'checkout.cancelled' : 'checkout.failed',
      entityType: 'PaymentSession',
      entityId: String(session._id),
      metadata: { providerRef: session.providerRef }
    });
    return { found: true as const, paymentStatus: session.status, activated: false, session };
  }
  return { found: true as const, paymentStatus: decision.status || session.status, activated: false, session };
}
