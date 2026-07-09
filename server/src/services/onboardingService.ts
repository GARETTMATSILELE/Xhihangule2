import crypto from 'crypto';
import mongoose from 'mongoose';
import { AppError } from '../middleware/errorHandler';
import { Company } from '../models/Company';
import { User } from '../models/User';
import { Subscription } from '../models/Subscription';
import { OnboardingSession } from '../models/OnboardingSession';
import { PaymentSession } from '../models/PaymentSession';
import { BillingPayment } from '../models/BillingPayment';
import { PLAN_CONFIG, Plan, WorkspaceType } from '../types/plan';
import { normalizeCompanyType, normalizeEmail, normalizeLegalIdentifier, normalizeWorkspaceType } from '../utils/normalization';

export type StartOnboardingInput = {
  email: string;
  password: string;
  name: string;
  plan: Plan;
  billingCycle?: 'monthly' | 'yearly';
  company: {
    name: string;
    email?: string;
    address?: string;
    phone?: string;
    website?: string;
    registrationNumber?: string;
    tinNumber?: string;
    vatNumber?: string;
    companyType?: 'INDIVIDUAL_LANDLORD' | 'REGISTERED_BUSINESS';
    workspaceType?: WorkspaceType;
  };
  idempotencyKey?: string;
};

function deriveIdempotencyKey(input: StartOnboardingInput): string {
  if (input.idempotencyKey) return input.idempotencyKey;
  const material = `${normalizeEmail(input.email)}:${input.plan}:${input.billingCycle || 'monthly'}:${input.company?.name || ''}`;
  return crypto.createHash('sha256').update(material).digest('hex');
}

function splitName(name: string) {
  const [firstNameRaw, ...lastParts] = String(name || '').trim().split(/\s+/);
  const firstName = firstNameRaw || 'User';
  const lastName = lastParts.join(' ') || firstNameRaw || 'Admin';
  return { firstName, lastName };
}

export class OnboardingService {
  private static instance: OnboardingService;

  public static getInstance(): OnboardingService {
    if (!OnboardingService.instance) {
      OnboardingService.instance = new OnboardingService();
    }
    return OnboardingService.instance;
  }

  public async start(input: StartOnboardingInput) {
    const idempotencyKey = deriveIdempotencyKey(input);
    const existingSession = await OnboardingSession.findOne({ idempotencyKey });
    if (existingSession) {
      return this.hydrate(existingSession._id.toString(), true);
    }

    const email = normalizeEmail(input.email);
    const billingCycle = input.billingCycle || 'monthly';
    const companyType = normalizeCompanyType(input.company?.companyType);
    const planConfig = PLAN_CONFIG[input.plan];
    const workspaceType = normalizeWorkspaceType(input.company?.workspaceType, planConfig.workspaceType);
    const normalizedCompanyEmail = normalizeEmail(input.company?.email || input.email);
    const normalizedRegistrationNumber = normalizeLegalIdentifier(input.company?.registrationNumber);
    const normalizedTinNumber = normalizeLegalIdentifier(input.company?.tinNumber);

    if (!email || !input.password || !input.name) {
      throw new AppError('Email, password and name are required', 400, 'VALIDATION_ERROR');
    }
    if (companyType === 'REGISTERED_BUSINESS' && (!normalizedRegistrationNumber || !normalizedTinNumber)) {
      throw new AppError('Registration number and TIN number are required for registered businesses', 400, 'VALIDATION_ERROR');
    }

    const duplicateUser = await User.findOne({ normalizedEmail: email });
    if (duplicateUser) {
      throw new AppError('Email already registered', 400, 'DUPLICATE_EMAIL');
    }

    const duplicateCompanyClauses: any[] = [{ normalizedEmail: normalizedCompanyEmail }];
    if (normalizedRegistrationNumber) duplicateCompanyClauses.push({ normalizedRegistrationNumber });
    if (normalizedTinNumber) duplicateCompanyClauses.push({ normalizedTinNumber });
    const duplicateCompany = await Company.findOne({ $or: duplicateCompanyClauses });
    if (duplicateCompany) {
      throw new AppError('Company already exists', 400, 'DUPLICATE_COMPANY');
    }

    const { firstName, lastName } = splitName(input.name);
    const pricing = planConfig.pricingUSD;
    const amount = pricing ? (billingCycle === 'yearly' ? pricing.yearly : pricing.monthly) : 0;

    const onboardingSession = await OnboardingSession.create({
      idempotencyKey,
      status: 'PENDING_SETUP',
      plan: input.plan,
      billingCycle,
      companyType,
      workspaceType,
      currentStep: 'CREATE_USER',
      retryCount: 0
    });

    try {
      const user = await User.create({
        email,
        normalizedEmail: email,
        password: input.password,
        firstName,
        lastName,
        role: 'admin',
        isActive: true
      });

      onboardingSession.userId = user._id as mongoose.Types.ObjectId;
      onboardingSession.currentStep = 'CREATE_COMPANY';
      await onboardingSession.save();

      const company = await Company.create({
        name: input.company.name,
        email: normalizedCompanyEmail,
        normalizedEmail: normalizedCompanyEmail,
        address: input.company.address || (companyType === 'INDIVIDUAL_LANDLORD' ? 'N/A' : undefined),
        phone: input.company.phone || (companyType === 'INDIVIDUAL_LANDLORD' ? 'N/A' : undefined),
        website: input.company.website,
        registrationNumber: input.company.registrationNumber,
        normalizedRegistrationNumber,
        tinNumber: input.company.tinNumber,
        normalizedTinNumber,
        vatNumber: input.company.vatNumber,
        companyType,
        workspaceType,
        tenantStatus: 'pending',
        onboardingStatus: 'PENDING_PAYMENT',
        onboardingCompleted: false,
        ownerId: user._id,
        plan: input.plan,
        propertyLimit: planConfig.propertyLimit,
        featureFlags: planConfig.featureFlags,
        isActive: false,
        subscriptionStatus: 'inactive',
        onboardingSessionId: onboardingSession._id
      });

      user.companyId = company._id as mongoose.Types.ObjectId;
      await user.save();

      const subscription = await Subscription.create({
        companyId: company._id,
        userId: user._id,
        onboardingSessionId: onboardingSession._id,
        plan: input.plan,
        cycle: billingCycle,
        status: 'past_due'
      });

      const paymentSession = await PaymentSession.create({
        companyId: company._id,
        userId: user._id,
        subscriptionId: subscription._id,
        onboardingSessionId: onboardingSession._id,
        idempotencyKey: `${idempotencyKey}:payment`,
        provider: 'paynow',
        plan: input.plan,
        billingCycle,
        amount,
        currency: 'USD',
        status: 'pending',
        metadata: { source: 'onboarding_v2' }
      });

      const billingPayment = await BillingPayment.create({
        companyId: company._id,
        userId: user._id,
        subscriptionId: subscription._id,
        onboardingSessionId: onboardingSession._id,
        paymentSessionId: paymentSession._id,
        plan: input.plan,
        cycle: billingCycle,
        amount,
        currency: 'USD',
        method: 'card',
        provider: 'paynow',
        providerRef: paymentSession._id.toString(),
        idempotencyKey: `${idempotencyKey}:billing`,
        status: 'pending'
      });

      paymentSession.billingPaymentId = billingPayment._id as mongoose.Types.ObjectId;
      await paymentSession.save();

      onboardingSession.companyId = company._id as mongoose.Types.ObjectId;
      onboardingSession.subscriptionId = subscription._id as mongoose.Types.ObjectId;
      onboardingSession.paymentSessionId = paymentSession._id as mongoose.Types.ObjectId;
      onboardingSession.status = 'PENDING_PAYMENT';
      onboardingSession.currentStep = 'PENDING_PAYMENT';
      await onboardingSession.save();

      return { onboardingSession, user, company, subscription, paymentSession, billingPayment, alreadyProcessed: false };
    } catch (error: any) {
      onboardingSession.status = 'FAILED_SETUP';
      onboardingSession.currentStep = 'FAILED_SETUP';
      onboardingSession.retryCount += 1;
      onboardingSession.lastError = error?.message || String(error);
      await onboardingSession.save();
      throw error;
    }
  }

  private async hydrate(onboardingSessionId: string, alreadyProcessed: boolean) {
    const onboardingSession = await OnboardingSession.findById(onboardingSessionId);
    if (!onboardingSession) throw new AppError('Onboarding session not found', 404, 'ONBOARDING_NOT_FOUND');
    const [user, company, subscription, paymentSession] = await Promise.all([
      onboardingSession.userId ? User.findById(onboardingSession.userId) : null,
      onboardingSession.companyId ? Company.findById(onboardingSession.companyId) : null,
      onboardingSession.subscriptionId ? Subscription.findById(onboardingSession.subscriptionId) : null,
      onboardingSession.paymentSessionId ? PaymentSession.findById(onboardingSession.paymentSessionId) : null
    ]);
    return { onboardingSession, user, company, subscription, paymentSession, alreadyProcessed };
  }
}

export default OnboardingService;
