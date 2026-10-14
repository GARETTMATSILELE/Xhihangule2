import crypto from 'crypto';
import mongoose, { ClientSession } from 'mongoose';
import { AppError } from '../middleware/errorHandler';
import { Company } from '../models/Company';
import { User } from '../models/User';
import { Subscription } from '../models/Subscription';
import { OnboardingSession } from '../models/OnboardingSession';
import { PaymentSession } from '../models/PaymentSession';
import { BillingPayment } from '../models/BillingPayment';
import { PLAN_CONFIG, Plan, WorkspaceType } from '../types/plan';
import { normalizeCompanyType, normalizeEmail, normalizeLegalIdentifier } from '../utils/normalization';
import { isRegistrationEmail, registrationPasswordError, resolvePublicRegistration } from './registrationPaymentPolicy';
import { chargeForPlan } from './systemPlanService';
import { releaseAbandonedRegistration, SIGN_IN_REQUIRED_MESSAGE } from './abandonedRegistrationService';
import { activateSubscriptionFromPayment } from './billingActivationService';
import { recordAuditEvent } from './auditService';

export type StartOnboardingInput = {
  email: string;
  password: string;
  name: string;
  plan: Plan;
  billingCycle?: 'monthly' | 'yearly';
  registrationMode?: 'trial' | 'paid';
  company: {
    name: string;
    email?: string;
    address?: string;
    phone?: string;
    website?: string;
    registrationNumber?: string;
    tinNumber?: string;
    vatNumber?: string;
    country?: string;
    companyType?: 'INDIVIDUAL_LANDLORD' | 'REGISTERED_BUSINESS';
    workspaceType?: WorkspaceType;
  };
  idempotencyKey?: string;
};

function deriveIdempotencyKey(input: StartOnboardingInput): string {
  if (input.idempotencyKey) return input.idempotencyKey;
  const material = `${normalizeEmail(input.email)}:${input.registrationMode || 'trial'}:${input.plan || ''}:${input.billingCycle || 'monthly'}:${input.company?.name || ''}`;
  return crypto.createHash('sha256').update(material).digest('hex');
}

function splitName(name: string) {
  const [firstNameRaw, ...lastParts] = String(name || '').trim().split(/\s+/);
  const firstName = firstNameRaw || 'User';
  const lastName = lastParts.join(' ') || firstNameRaw || 'Admin';
  return { firstName, lastName };
}

type CreatedIds = {
  userId?: mongoose.Types.ObjectId;
  companyId?: mongoose.Types.ObjectId;
  subscriptionId?: mongoose.Types.ObjectId;
  paymentSessionId?: mongoose.Types.ObjectId;
  billingPaymentId?: mongoose.Types.ObjectId;
  onboardingSessionId?: mongoose.Types.ObjectId;
};

async function compensate(ids: CreatedIds) {
  if (ids.billingPaymentId) {
    await BillingPayment.deleteOne({ _id: ids.billingPaymentId, status: { $in: ['pending', 'failed', 'cancelled'] } });
  }
  if (ids.paymentSessionId) {
    await PaymentSession.deleteOne({ _id: ids.paymentSessionId, status: { $nin: ['paid', 'reconciled'] } });
  }
  if (ids.subscriptionId) {
    await Subscription.deleteOne({ _id: ids.subscriptionId, status: { $in: ['past_due', 'trial'] } });
  }
  if (ids.companyId) {
    await Company.deleteOne({
      _id: ids.companyId,
      onboardingStatus: { $in: ['PENDING_PAYMENT', 'PENDING_SETUP', 'FAILED_SETUP', 'INITIALIZING_WORKSPACE'] },
      onboardingCompleted: { $ne: true }
    });
  }
  if (ids.userId) {
    const user = await User.findById(ids.userId).select('companyId role');
    const companyGone = !ids.companyId || !(await Company.exists({ _id: ids.companyId }));
    if (user && user.role !== 'system_admin' && (companyGone || !user.companyId)) {
      await User.deleteOne({ _id: ids.userId });
    }
  }
  if (ids.onboardingSessionId) {
    await OnboardingSession.deleteOne({
      _id: ids.onboardingSessionId,
      status: { $in: ['PENDING_SETUP', 'FAILED_SETUP', 'PENDING_PAYMENT', 'INITIALIZING_WORKSPACE'] }
    });
  }
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
    const email = normalizeEmail(input.email);
    const companyType = normalizeCompanyType(input.company?.companyType);
    const offer = resolvePublicRegistration({
      plan: input.plan,
      registrationMode: input.registrationMode,
      billingCycle: input.billingCycle
    });
    if (!offer.ok) {
      throw new AppError(offer.message, offer.status, offer.code);
    }
    const plan = offer.plan;
    const billingCycle = offer.billingCycle;
    const paymentHold = offer.paymentRequired;
    const planConfig = PLAN_CONFIG[plan];
    const workspaceType = planConfig.workspaceType;
    const normalizedCompanyEmail = normalizeEmail(input.company?.email || input.email);
    const normalizedRegistrationNumber = normalizeLegalIdentifier(input.company?.registrationNumber);
    const normalizedTinNumber = normalizeLegalIdentifier(input.company?.tinNumber);
    const amount = paymentHold ? await chargeForPlan(plan, billingCycle) : null;

    if (!email || !input.password || !String(input.name || '').trim()) {
      throw new AppError('Email, password and name are required', 400, 'VALIDATION_ERROR');
    }
    if (!isRegistrationEmail(email)) {
      throw new AppError('Email is invalid', 400, 'VALIDATION_ERROR');
    }
    const passwordError = registrationPasswordError(input.password);
    if (passwordError) throw new AppError(passwordError, 400, 'VALIDATION_ERROR');
    if (!String(input.company?.name || '').trim()) {
      throw new AppError('Company name is required', 400, 'VALIDATION_ERROR');
    }
    if (!String(input.company?.country || '').trim()) {
      throw new AppError('Country is required', 400, 'VALIDATION_ERROR');
    }
    if (companyType === 'REGISTERED_BUSINESS' && (!normalizedRegistrationNumber || !normalizedTinNumber)) {
      throw new AppError('Registration number and TIN number are required for registered businesses', 400, 'VALIDATION_ERROR');
    }
    if (paymentHold && amount == null) {
      throw new AppError('This plan does not have a configured price for the selected billing frequency', 503, 'REGISTRATION_PRICE_NOT_CONFIGURED');
    }

    const duplicateUser = await User.findOne({ $or: [{ normalizedEmail: email }, { email }] });
    if (duplicateUser) {
      const resumed = await this.recoverDuplicate(duplicateUser, input.password, { plan, billingCycle });
      if (resumed) return resumed;
    }

    const existingSession = await OnboardingSession.findOne({ idempotencyKey });
    if (existingSession && existingSession.status !== 'FAILED_SETUP' && existingSession.status !== 'EXPIRED') {
      if (existingSession.userId) {
        const sessionUser = await User.findById(existingSession.userId);
        const sameEmail = sessionUser && normalizeEmail(sessionUser.email) === email;
        const passwordOk = sessionUser ? await sessionUser.comparePassword(input.password) : false;
        if (!sessionUser || sessionUser.isArchived || !sameEmail || !passwordOk) {
          throw new AppError(SIGN_IN_REQUIRED_MESSAGE, 400, 'REGISTRATION_SIGN_IN_REQUIRED');
        }
      }
      return this.hydrate(existingSession._id.toString(), true);
    }
    if (existingSession?.status === 'FAILED_SETUP') {
      await compensate({
        userId: existingSession.userId as mongoose.Types.ObjectId | undefined,
        companyId: existingSession.companyId as mongoose.Types.ObjectId | undefined,
        subscriptionId: existingSession.subscriptionId as mongoose.Types.ObjectId | undefined,
        paymentSessionId: existingSession.paymentSessionId as mongoose.Types.ObjectId | undefined,
        onboardingSessionId: existingSession._id as mongoose.Types.ObjectId
      });
    }
    if (existingSession?.status === 'EXPIRED' && existingSession.idempotencyKey === idempotencyKey) {
      existingSession.idempotencyKey = `archived:${existingSession._id.toString()}`;
      await existingSession.save();
    }

    const duplicateCompanyClauses: any[] = [{ normalizedEmail: normalizedCompanyEmail }];
    if (normalizedRegistrationNumber) duplicateCompanyClauses.push({ normalizedRegistrationNumber });
    if (normalizedTinNumber) duplicateCompanyClauses.push({ normalizedTinNumber });
    const duplicateCompany = await Company.findOne({ $or: duplicateCompanyClauses });
    if (duplicateCompany) {
      throw new AppError('Company already exists', 400, 'DUPLICATE_COMPANY');
    }

    const ids: CreatedIds = {};
    const run = async (session?: ClientSession) => {
      const saveOpts = session ? { session } : undefined;
      const onboardingSession = await OnboardingSession.create([{
        idempotencyKey,
        status: 'PENDING_SETUP',
        plan,
        billingCycle,
        companyType,
        workspaceType,
        currentStep: 'CREATE_USER',
        retryCount: existingSession ? existingSession.retryCount + 1 : 0
      }], saveOpts);
      ids.onboardingSessionId = onboardingSession[0]._id as mongoose.Types.ObjectId;

      const { firstName, lastName } = splitName(input.name);
      const user = await User.create([{
        email,
        normalizedEmail: email,
        password: input.password,
        firstName,
        lastName,
        role: 'admin',
        roles: ['admin'],
        isActive: true
      }], saveOpts);
      ids.userId = user[0]._id as mongoose.Types.ObjectId;

      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 14);
      const company = await Company.create([{
        name: String(input.company.name).trim(),
        email: normalizedCompanyEmail,
        normalizedEmail: normalizedCompanyEmail,
        address: input.company.address || (companyType === 'INDIVIDUAL_LANDLORD' ? 'N/A' : undefined),
        phone: input.company.phone || (companyType === 'INDIVIDUAL_LANDLORD' ? 'N/A' : undefined),
        website: input.company.website,
        ...(normalizedRegistrationNumber ? { registrationNumber: normalizedRegistrationNumber, normalizedRegistrationNumber } : {}),
        ...(normalizedTinNumber ? { tinNumber: normalizedTinNumber, normalizedTinNumber } : {}),
        ...(String(input.company.vatNumber || '').trim() ? { vatNumber: String(input.company.vatNumber).trim() } : {}),
        country: input.company.country ? String(input.company.country).trim().slice(0, 80) : undefined,
        companyType,
        workspaceType,
        tenantStatus: paymentHold ? 'pending' : 'active',
        onboardingStatus: paymentHold ? 'PENDING_PAYMENT' : 'INITIALIZING_WORKSPACE',
        onboardingCompleted: false,
        ownerId: user[0]._id,
        plan,
        propertyLimit: planConfig.propertyLimit,
        featureFlags: planConfig.featureFlags,
        isActive: !paymentHold,
        subscriptionStatus: paymentHold ? 'inactive' : 'trial',
        subscriptionEndDate: paymentHold ? undefined : trialEnd,
        onboardingSessionId: onboardingSession[0]._id
      }], saveOpts);
      ids.companyId = company[0]._id as mongoose.Types.ObjectId;

      user[0].companyId = company[0]._id as mongoose.Types.ObjectId;
      await user[0].save(saveOpts);

      const subscription = await Subscription.create([{
        companyId: company[0]._id,
        userId: user[0]._id,
        onboardingSessionId: onboardingSession[0]._id,
        plan,
        cycle: billingCycle,
        status: paymentHold ? 'past_due' : 'trial',
        trialStartDate: paymentHold ? undefined : new Date(),
        trialEndDate: paymentHold ? undefined : trialEnd,
        trialDurationDays: 14,
        currentPeriodStart: paymentHold ? undefined : new Date(),
        currentPeriodEnd: paymentHold ? undefined : trialEnd
      }], saveOpts);
      ids.subscriptionId = subscription[0]._id as mongoose.Types.ObjectId;

      let paymentSession: any = null;
      let billingPayment: any = null;
      if (paymentHold) {
        const createdSession = await PaymentSession.create([{
          companyId: company[0]._id,
          userId: user[0]._id,
          subscriptionId: subscription[0]._id,
          onboardingSessionId: onboardingSession[0]._id,
          idempotencyKey: `${idempotencyKey}:payment`,
          provider: 'paynow',
          providerRef: `SUBS-${company[0]._id.toString()}`,
          plan,
          billingCycle,
          amount,
          currency: 'USD',
          status: 'pending',
          metadata: { source: 'company_registration' }
        }], saveOpts);
        paymentSession = createdSession[0];
        ids.paymentSessionId = paymentSession._id as mongoose.Types.ObjectId;

        const createdBilling = await BillingPayment.create([{
          companyId: company[0]._id,
          userId: user[0]._id,
          subscriptionId: subscription[0]._id,
          onboardingSessionId: onboardingSession[0]._id,
          paymentSessionId: paymentSession._id,
          plan,
          cycle: billingCycle,
          amount,
          currency: 'USD',
          method: 'card',
          provider: 'paynow',
          providerRef: `SUBS-${company[0]._id.toString()}`,
          idempotencyKey: `${idempotencyKey}:billing`,
          status: 'pending'
        }], saveOpts);
        billingPayment = createdBilling[0];
        ids.billingPaymentId = billingPayment._id as mongoose.Types.ObjectId;
        paymentSession.billingPaymentId = billingPayment._id as mongoose.Types.ObjectId;
        await paymentSession.save(saveOpts);
      } else {
        company[0].onboardingStatus = 'ACTIVE';
        company[0].onboardingCompleted = true;
        await company[0].save(saveOpts);
      }

      onboardingSession[0].userId = user[0]._id as mongoose.Types.ObjectId;
      onboardingSession[0].companyId = company[0]._id as mongoose.Types.ObjectId;
      onboardingSession[0].subscriptionId = subscription[0]._id as mongoose.Types.ObjectId;
      onboardingSession[0].paymentSessionId = paymentSession?._id as mongoose.Types.ObjectId | undefined;
      onboardingSession[0].status = paymentHold ? 'PENDING_PAYMENT' : 'ACTIVE';
      onboardingSession[0].currentStep = paymentHold ? 'PENDING_PAYMENT' : 'DASHBOARD';
      if (!paymentHold) onboardingSession[0].completedAt = new Date();
      await onboardingSession[0].save(saveOpts);

      return {
        onboardingSession: onboardingSession[0],
        user: user[0],
        company: company[0],
        subscription: subscription[0],
        paymentSession,
        billingPayment,
        alreadyProcessed: false
      };
    };

    const session = await mongoose.startSession();
    try {
      let result: any;
      try {
        await session.withTransaction(async () => {
          result = await run(session);
        });
      } catch (txError: any) {
        const message = String(txError?.message || '');
        const unsupported = /transaction numbers are only allowed|transactions are not supported|transaction is not supported/i.test(message);
        if (!unsupported) throw txError;
        await compensate(ids);
        Object.keys(ids).forEach((key) => { delete (ids as any)[key]; });
        result = await run(undefined);
      }
      if (result && !result.alreadyProcessed) {
        await recordAuditEvent({
          userId: result.user?._id?.toString?.(),
          companyId: result.company?._id?.toString?.(),
          action: 'registration.initiated',
          entityType: 'Company',
          entityId: result.company?._id?.toString?.(),
          metadata: { plan: result.company?.plan, paymentRequired: Boolean(result.paymentSession) }
        });
      }
      return result;
    } catch (error: any) {
      await compensate(ids);
      if (error?.code === 11000) {
        const dup = String(error?.message || '');
        if (dup.toLowerCase().includes('email')) throw new AppError('Email already registered', 400, 'DUPLICATE_EMAIL');
        if (dup.includes('tinNumber') || dup.includes('registrationNumber')) throw new AppError('Company already exists', 400, 'DUPLICATE_COMPANY');
        const raced = await OnboardingSession.findOne({ idempotencyKey });
        if (raced && raced.status !== 'FAILED_SETUP') return this.hydrate(raced._id.toString(), true);
        throw new AppError('Duplicate registration', 409, 'DUPLICATE_KEY');
      }
      if (error instanceof AppError) throw error;
      if (error?.name === 'ValidationError') {
        throw new AppError('Registration details are not valid', 400, 'VALIDATION_ERROR');
      }
      throw new AppError('Registration could not be completed', 500, 'REGISTRATION_FAILED');
    } finally {
      session.endSession();
    }
  }

  private async recoverDuplicate(
    user: InstanceType<typeof User>,
    password: string,
    offer: { plan: Plan; billingCycle: 'monthly' | 'yearly' }
  ) {
    if (user.role === 'system_admin' || (user.roles || []).includes('system_admin') || !user.companyId) {
      throw new AppError(SIGN_IN_REQUIRED_MESSAGE, 400, 'REGISTRATION_SIGN_IN_REQUIRED');
    }
    const outcome = await releaseAbandonedRegistration(user.companyId);
    if (outcome === 'released') return null;

    const passwordOk = user.isActive !== false && !user.isArchived && await user.comparePassword(password);
    if (!passwordOk) {
      throw new AppError(SIGN_IN_REQUIRED_MESSAGE, 400, 'REGISTRATION_SIGN_IN_REQUIRED');
    }
    const company = await Company.findById(user.companyId);
    if (!company) {
      throw new AppError(SIGN_IN_REQUIRED_MESSAGE, 400, 'REGISTRATION_SIGN_IN_REQUIRED');
    }
    return this.buildResume(user, company, offer);
  }

  private async buildResume(
    user: InstanceType<typeof User>,
    company: InstanceType<typeof Company>,
    offer: { plan: Plan; billingCycle: 'monthly' | 'yearly' }
  ) {
    const [subscription, sessions, onboardingSession] = await Promise.all([
      Subscription.findOne({ companyId: company._id }).sort({ createdAt: -1 }),
      PaymentSession.find({ companyId: company._id }).sort({ createdAt: -1 }),
      OnboardingSession.findOne({ companyId: company._id }).sort({ createdAt: -1 })
    ]);
    const subscriptionStatus = String(subscription?.status || '').toLowerCase();
    const companySubscription = String(company.subscriptionStatus || '').toLowerCase();
    const onboardingStatus = String(company.onboardingStatus || '');

    const pack = async (
      nextStep: 'payment' | 'dashboard',
      code: string,
      message: string,
      paymentSession: any
    ) => {
      await recordAuditEvent({
        userId: String(user._id),
        companyId: String(company._id),
        action: 'registration.resumed',
        entityType: 'Company',
        entityId: String(company._id),
        metadata: { code }
      });
      return {
        onboardingSession,
        user,
        company,
        subscription,
        paymentSession,
        billingPayment: null,
        alreadyProcessed: true,
        resume: { nextStep, code, message }
      };
    };

    if (subscriptionStatus === 'trial' || (companySubscription === 'trial' && onboardingStatus === 'ACTIVE')) {
      return pack('dashboard', 'TRIAL_ACTIVE', 'This email already has an active trial. Sign in to continue. The trial is not restarted.', null);
    }
    if (subscriptionStatus === 'active' || companySubscription === 'active' || (onboardingStatus === 'ACTIVE' && company.tenantStatus === 'active')) {
      return pack('dashboard', 'ACCOUNT_EXISTS', 'This email already has an account. Sign in to continue.', null);
    }
    if (onboardingStatus === 'PAYMENT_RECEIVED' || onboardingStatus === 'INITIALIZING_WORKSPACE') {
      return pack('dashboard', 'PAYMENT_ALREADY_VERIFIED', 'Payment for this registration is already confirmed. Sign in to continue.', null);
    }

    const paidSession = sessions.find((session) => session.status === 'paid' || session.status === 'reconciled');
    if (paidSession) {
      if (paidSession.status === 'paid') {
        await activateSubscriptionFromPayment({ paymentSessionId: String(paidSession._id), paidAt: paidSession.paidAt || new Date() });
      }
      const refreshed = await Company.findById(company._id);
      return pack('dashboard', 'PAYMENT_ALREADY_VERIFIED', 'Payment for this registration is already confirmed. Sign in to continue.', null)
        .then((result) => ({ ...result, company: refreshed || company }));
    }

    const openSession = sessions.find((session) => session.status === 'pending' || session.status === 'provider_created');
    if (openSession && (openSession.status === 'provider_created' || openSession.pollUrl)) {
      return pack('payment', 'PAYMENT_IN_PROGRESS', 'This payment is still being checked. Do not start another payment until it is confirmed.', openSession);
    }

    let paymentSession = openSession || sessions.find((session) => ['failed', 'cancelled', 'expired'].includes(session.status)) || null;
    if (paymentSession && paymentSession.status === 'pending' && !paymentSession.pollUrl && (paymentSession.plan !== offer.plan || paymentSession.billingCycle !== offer.billingCycle)) {
      const nextAmount = await chargeForPlan(offer.plan, offer.billingCycle);
      if (nextAmount != null) {
        paymentSession.plan = offer.plan;
        paymentSession.billingCycle = offer.billingCycle;
        paymentSession.amount = nextAmount;
        await paymentSession.save();
        if (subscription && !['trial', 'active'].includes(subscriptionStatus)) {
          subscription.plan = offer.plan;
          subscription.cycle = offer.billingCycle;
          await subscription.save();
        }
        company.plan = offer.plan;
        await company.save();
      }
    }
    if (!paymentSession && subscription) {
      const amount = await chargeForPlan(company.plan as Plan, subscription.cycle);
      if (amount == null) {
        throw new AppError('This plan does not have a configured price for the selected billing frequency', 503, 'REGISTRATION_PRICE_NOT_CONFIGURED');
      }
      paymentSession = await PaymentSession.create({
        companyId: company._id,
        userId: user._id,
        subscriptionId: subscription._id,
        onboardingSessionId: onboardingSession?._id,
        idempotencyKey: `resume:${company._id.toString()}:${Date.now()}`,
        provider: 'paynow',
        providerRef: `SUBS-${company._id.toString()}`,
        plan: company.plan,
        billingCycle: subscription.cycle,
        amount,
        currency: 'USD',
        status: 'pending',
        metadata: { source: 'registration_resume' }
      });
    }

    const retrying = paymentSession && ['failed', 'cancelled', 'expired'].includes(paymentSession.status);
    return pack(
      'payment',
      retrying ? 'CHECKOUT_RETRY' : 'PENDING_REGISTRATION',
      retrying
        ? 'No successful payment has been confirmed. You can retry checkout. This registration is still saved.'
        : 'Registration is not complete yet. Continue to checkout. You can return later with the same email address and password.',
      paymentSession
    );
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
