import mongoose from 'mongoose';
import { Company } from '../models/Company';
import { Subscription } from '../models/Subscription';
import { PaymentSession } from '../models/PaymentSession';
import { BillingPayment } from '../models/BillingPayment';
import { OnboardingSession } from '../models/OnboardingSession';
import { AppError } from '../middleware/errorHandler';

type ActivationInput = {
  paymentSessionId?: string;
  provider?: 'paynow' | 'cash' | 'manual';
  providerRef?: string;
  rawProviderResponse?: any;
  paidAt?: Date;
};

export async function activateSubscriptionFromPayment(input: ActivationInput) {
  const paidAt = input.paidAt || new Date();
  const query: any = {};
  if (input.paymentSessionId) {
    query._id = input.paymentSessionId;
  } else if (input.provider && input.providerRef) {
    query.provider = input.provider;
    query.providerRef = input.providerRef;
  } else {
    throw new AppError('paymentSessionId or provider/providerRef is required', 400, 'PAYMENT_SESSION_REQUIRED');
  }

  const paymentSession = await PaymentSession.findOne(query);
  if (!paymentSession) {
    throw new AppError('Payment session not found', 404, 'PAYMENT_SESSION_NOT_FOUND');
  }

  if (paymentSession.status === 'reconciled') {
    return { paymentSession, alreadyProcessed: true, subscription: paymentSession.subscriptionId
      ? await Subscription.findById(paymentSession.subscriptionId)
      : null };
  }

  paymentSession.status = 'paid';
  paymentSession.paidAt = paidAt;
  paymentSession.rawProviderResponse = input.rawProviderResponse || paymentSession.rawProviderResponse;
  await paymentSession.save();

  const now = new Date();
  const periodEnd = new Date(now);
  if (paymentSession.billingCycle === 'yearly') periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  else periodEnd.setMonth(periodEnd.getMonth() + 1);

  const subscriptionQuery: any = paymentSession.subscriptionId
    ? { _id: paymentSession.subscriptionId, companyId: paymentSession.companyId }
    : { companyId: paymentSession.companyId };

  const subscription = await Subscription.findOneAndUpdate(
    subscriptionQuery,
    {
      $set: {
        companyId: paymentSession.companyId,
        userId: paymentSession.userId,
        onboardingSessionId: paymentSession.onboardingSessionId,
        plan: paymentSession.plan,
        cycle: paymentSession.billingCycle,
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        nextPaymentAt: periodEnd,
        provider: paymentSession.provider,
        lastPaymentSessionId: paymentSession._id,
        lastPaymentAt: paidAt,
        lastReconciledAt: now
      }
    },
    { upsert: true, new: true }
  );

  paymentSession.subscriptionId = subscription._id as mongoose.Types.ObjectId;
  paymentSession.status = 'reconciled';
  await paymentSession.save();

  if (paymentSession.billingPaymentId) {
    await BillingPayment.findByIdAndUpdate(paymentSession.billingPaymentId, {
      $set: {
        subscriptionId: subscription._id,
        paymentSessionId: paymentSession._id,
        status: 'paid',
        paidAt,
        reconciledAt: now,
        rawResponse: input.rawProviderResponse
      }
    });
  }

  const company = await Company.findById(paymentSession.companyId).select('onboardingStatus onboardingCompleted');
  const awaitingRegistration = ['PENDING_PAYMENT', 'PENDING_SETUP', 'FAILED_SETUP', 'PAYMENT_RECEIVED'].includes(
    String(company?.onboardingStatus || '')
  );
  await Company.findByIdAndUpdate(paymentSession.companyId, {
    $set: {
      tenantStatus: 'active',
      onboardingStatus: awaitingRegistration ? 'INITIALIZING_WORKSPACE' : (company?.onboardingStatus || 'ACTIVE'),
      onboardingCompleted: awaitingRegistration ? false : company?.onboardingCompleted !== false,
      subscriptionStatus: 'active',
      subscriptionEndDate: periodEnd,
      isActive: true
    }
  });

  if (paymentSession.onboardingSessionId) {
    await OnboardingSession.findByIdAndUpdate(paymentSession.onboardingSessionId, {
      $set: {
        status: 'INITIALIZING_WORKSPACE',
        currentStep: 'WORKSPACE_SETUP',
        subscriptionId: subscription._id,
        paymentSessionId: paymentSession._id,
        completedAt: now
      }
    });
  }

  return { paymentSession, subscription, alreadyProcessed: false };
}
