import mongoose from 'mongoose';
import { Company } from '../models/Company';
import { Subscription } from '../models/Subscription';
import { PaymentSession } from '../models/PaymentSession';
import { BillingPayment } from '../models/BillingPayment';
import { OnboardingSession } from '../models/OnboardingSession';
import { AppError } from '../middleware/errorHandler';
import { throwOnceIfArmed } from './testFailureSeam';

type ActivationInput = {
  paymentSessionId?: string;
  provider?: 'paynow' | 'cash' | 'manual';
  providerRef?: string;
  rawProviderResponse?: any;
  paidAt?: Date;
};

const AWAITING_REGISTRATION = ['PENDING_PAYMENT', 'PENDING_SETUP', 'FAILED_SETUP', 'PAYMENT_RECEIVED'];

async function finishRegistrationIfNeeded(
  paymentSession: InstanceType<typeof PaymentSession>,
  subscription: InstanceType<typeof Subscription>,
  paidAt: Date,
  rawProviderResponse: unknown
) {
  if (paymentSession.billingPaymentId) {
    const billing = await BillingPayment.findById(paymentSession.billingPaymentId).select('status');
    if (billing && billing.status !== 'paid') {
      await BillingPayment.findByIdAndUpdate(paymentSession.billingPaymentId, {
        $set: {
          subscriptionId: subscription._id,
          paymentSessionId: paymentSession._id,
          status: 'paid',
          paidAt,
          reconciledAt: new Date(),
          rawResponse: rawProviderResponse
        }
      });
    }
  }
  const company = await Company.findById(paymentSession.companyId).select('onboardingStatus onboardingCompleted');
  const awaitingRegistration = AWAITING_REGISTRATION.includes(String(company?.onboardingStatus || ''));
  await Company.findByIdAndUpdate(paymentSession.companyId, {
    $set: {
      tenantStatus: 'active',
      onboardingStatus: awaitingRegistration ? 'INITIALIZING_WORKSPACE' : (company?.onboardingStatus || 'ACTIVE'),
      onboardingCompleted: awaitingRegistration ? false : company?.onboardingCompleted !== false,
      subscriptionStatus: 'active',
      subscriptionEndDate: subscription.currentPeriodEnd,
      isActive: true
    }
  });
  if (paymentSession.onboardingSessionId) {
    const onboarding = await OnboardingSession.findById(paymentSession.onboardingSessionId).select('status');
    if (onboarding && AWAITING_REGISTRATION.includes(String(onboarding.status || ''))) {
      await OnboardingSession.findByIdAndUpdate(paymentSession.onboardingSessionId, {
        $set: {
          status: 'INITIALIZING_WORKSPACE',
          currentStep: 'WORKSPACE_SETUP',
          subscriptionId: subscription._id,
          paymentSessionId: paymentSession._id,
          completedAt: new Date()
        }
      });
    }
  }
}

async function reconciledResult(paymentSession: InstanceType<typeof PaymentSession>, paidAt: Date, rawProviderResponse: unknown) {
  const subscription = paymentSession.subscriptionId
    ? await Subscription.findById(paymentSession.subscriptionId)
    : null;
  if (subscription) await finishRegistrationIfNeeded(paymentSession, subscription, paidAt, rawProviderResponse);
  return { paymentSession, alreadyProcessed: true as const, subscription };
}

export async function activateSubscriptionFromPayment(input: ActivationInput) {
  const paidAt = input.paidAt || new Date();
  const query: any = {};
  if (input.paymentSessionId) {
    query._id = input.paymentSessionId;
  } else if (input.provider && input.providerRef) {
    const matches = await PaymentSession.countDocuments({ provider: input.provider, providerRef: input.providerRef });
    if (matches > 1) {
      throw new AppError(
        'More than one payment session shares this provider reference. Activation requires review.',
        409,
        'PAYMENT_SESSION_AMBIGUOUS'
      );
    }
    query.provider = input.provider;
    query.providerRef = input.providerRef;
  } else {
    throw new AppError('paymentSessionId or provider/providerRef is required', 400, 'PAYMENT_SESSION_REQUIRED');
  }

  let paymentSession = await PaymentSession.findOne(query);
  if (!paymentSession) {
    throw new AppError('Payment session not found', 404, 'PAYMENT_SESSION_NOT_FOUND');
  }

  if (paymentSession.status === 'cancelled' || paymentSession.status === 'failed' || paymentSession.status === 'expired') {
    throw new AppError('This checkout can no longer be activated', 409, 'PAYMENT_SESSION_CLOSED');
  }
  if (paymentSession.status === 'reconciled') {
    return reconciledResult(paymentSession, paymentSession.paidAt || paidAt, input.rawProviderResponse);
  }

  if (paymentSession.status === 'pending' || paymentSession.status === 'provider_created') {
    const moved = await PaymentSession.findOneAndUpdate(
      { _id: paymentSession._id, status: { $in: ['pending', 'provider_created'] } },
      {
        $set: {
          status: 'paid',
          paidAt,
          rawProviderResponse: input.rawProviderResponse || paymentSession.rawProviderResponse
        }
      },
      { new: true }
    );
    paymentSession = moved || await PaymentSession.findById(paymentSession._id);
    if (!paymentSession) throw new AppError('Payment session not found', 404, 'PAYMENT_SESSION_NOT_FOUND');
  }
  if (paymentSession.status === 'reconciled') {
    return reconciledResult(paymentSession, paymentSession.paidAt || paidAt, input.rawProviderResponse);
  }
  if (paymentSession.status === 'cancelled' || paymentSession.status === 'failed' || paymentSession.status === 'expired') {
    throw new AppError('This checkout can no longer be activated', 409, 'PAYMENT_SESSION_CLOSED');
  }
  if (paymentSession.status !== 'paid') {
    throw new AppError('This payment session cannot be activated from its current state', 409, 'PAYMENT_SESSION_STATE');
  }
  throwOnceIfArmed(
    String(paymentSession._id),
    String((paymentSession.metadata as any)?.testSeam || ''),
    'PHASE_FAIL_ACTIVATION_AFTER_PAID'
  );

  const staleClaim = new Date(Date.now() - 2 * 60 * 1000);
  const owned = await PaymentSession.findOneAndUpdate(
    {
      _id: paymentSession._id,
      status: 'paid',
      subscriptionId: null,
      $or: [
        { 'metadata.activationClaimedAt': null },
        { 'metadata.activationClaimedAt': { $lte: staleClaim } }
      ]
    },
    { $set: { 'metadata.activationClaimedAt': new Date() } },
    { new: true }
  );
  if (!owned) {
    const current = await PaymentSession.findById(paymentSession._id);
    if (current?.status === 'reconciled') {
      return reconciledResult(current, current.paidAt || paidAt, input.rawProviderResponse);
    }
    if (current?.subscriptionId && current.status === 'paid') {
      paymentSession = current;
    } else {
      throw new AppError('Activation is already in progress for this payment', 409, 'ACTIVATION_IN_PROGRESS');
    }
  } else {
    paymentSession = owned;
  }
  throwOnceIfArmed(
    String(paymentSession._id),
    String((paymentSession.metadata as any)?.testSeam || ''),
    'PHASE_FAIL_ACTIVATION_AFTER_CLAIM'
  );

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
  throwOnceIfArmed(
    String(paymentSession._id),
    String((paymentSession.metadata as any)?.testSeam || ''),
    'PHASE_FAIL_ACTIVATION_AFTER_SUBSCRIPTION'
  );

  paymentSession.subscriptionId = subscription._id as mongoose.Types.ObjectId;
  paymentSession.status = 'reconciled';
  await paymentSession.save();
  throwOnceIfArmed(
    String(paymentSession._id),
    String((paymentSession.metadata as any)?.testSeam || ''),
    'PHASE_FAIL_ACTIVATION_AFTER_RECONCILED'
  );
  await finishRegistrationIfNeeded(paymentSession, subscription, paidAt, input.rawProviderResponse);

  return { paymentSession, subscription, alreadyProcessed: false };
}
