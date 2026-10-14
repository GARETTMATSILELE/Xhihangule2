/**
 * Registration and subscription-payment checks.
 * Uses the local development database and disposable fixtures.
 * Does not call Paynow and does not move money.
 */
import dotenv from 'dotenv';
import http from 'http';
import express from 'express';
import mongoose from 'mongoose';

dotenv.config();

import { isPublicSignupAllowed } from '../utils/publicSignupCompany';
import {
  companyAwaitingRegistrationPayment,
  configuredPlanCharge,
  evaluateProviderPoll,
  isAllowedPaynowPollUrl,
  paynowConfigurationState,
  paynowPayloadHash,
  productionApiUrl,
  registrationCreatesPaymentHold,
  registrationPasswordError,
  resolvePublicRegistration,
  verifyPaynowPayload
} from '../services/registrationPaymentPolicy';
import { abandonedRegistrationRetentionMs } from '../services/abandonedRegistrationService';
import { errorHandler } from '../middleware/errorHandler';
import { authWithCompany } from '../middleware/auth';

const checks: { name: string; ok: boolean; detail: string }[] = [];

function record(name: string, ok: boolean, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function tokenFor(user: { _id: any; role: string; roles?: string[]; companyId?: any }) {
  const { JWT_CONFIG } = require('../config/jwt') as typeof import('../config/jwt');
  const jwt = require('jsonwebtoken');
  return jwt.sign({
    userId: String(user._id),
    role: user.role,
    roles: user.roles,
    sessionVersion: 1,
    companyId: user.companyId ? String(user.companyId) : undefined,
    type: 'access'
  }, JWT_CONFIG.SECRET, { expiresIn: '2h', issuer: JWT_CONFIG.ISSUER, audience: JWT_CONFIG.AUDIENCE });
}

function request(port: number, method: string, requestPath: string, token: string | undefined, body?: unknown): Promise<{ status: number; json: any }> {
  const payload = body === undefined ? '' : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      method,
      path: requestPath,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {})
      },
      timeout: 20000
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json: any = {};
        try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
        resolve({ status: res.statusCode || 0, json });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    if (payload) req.write(payload);
    req.end();
  });
}

function registrationInput(
  stamp: string,
  suffix: string,
  key?: string,
  registrationMode: 'trial' | 'paid' = 'trial',
  plan: 'INDIVIDUAL' | 'SME' | 'ENTERPRISE' = 'INDIVIDUAL',
  billingCycle: 'monthly' | 'yearly' = 'monthly'
) {
  return {
    email: `${stamp}-${suffix}@example.test`,
    password: 'Register1pay',
    name: 'Registration Admin',
    plan,
    billingCycle,
    registrationMode,
    company: {
      name: `${stamp} ${suffix}`,
      email: `${stamp}-${suffix}@example.test`,
      address: '1 Test Close',
      phone: '0772000000',
      registrationNumber: `${stamp}-${suffix}-REG`,
      tinNumber: `${stamp}-${suffix}-TIN`,
      country: 'Zimbabwe',
      companyType: 'REGISTERED_BUSINESS' as const,
      workspaceType: 'individual' as const
    },
    idempotencyKey: key || `${stamp}-${suffix}`
  };
}

function runStaticChecks() {
  record('Production signup stays closed unless explicitly allowed',
    isPublicSignupAllowed({ NODE_ENV: 'production' } as NodeJS.ProcessEnv) === false
    && isPublicSignupAllowed({ NODE_ENV: 'production', ALLOW_PUBLIC_SIGNUP: 'true' } as NodeJS.ProcessEnv) === true);
  record('Abandoned paid registrations are retained for 7 days by default',
    abandonedRegistrationRetentionMs({} as NodeJS.ProcessEnv) === 7 * 86400000
    && abandonedRegistrationRetentionMs({ ABANDONED_REGISTRATION_RETENTION_DAYS: '3' } as NodeJS.ProcessEnv) === 3 * 86400000);
  record('Payment hold is explicit and trial remains the default',
    registrationCreatesPaymentHold({} as NodeJS.ProcessEnv) === false
    && registrationCreatesPaymentHold({ REGISTRATION_PAYMENT_REQUIRED: 'true' } as NodeJS.ProcessEnv) === true);
  record('Configured Individual monthly price is used', configuredPlanCharge('INDIVIDUAL', 'monthly') === 250);
  record('A plan without a positive price is not invented', configuredPlanCharge('NOT_A_PLAN', 'monthly') === null);
  record('Weak passwords are rejected', registrationPasswordError('short') !== null && registrationPasswordError('Register1pay') === null);
  record('Wrong amount is rejected', evaluateProviderPoll({ amount: 250, currency: 'USD', providerRef: 'SUBS-1' }, { status: 'Paid', amount: 10, reference: 'SUBS-1' }).outcome === 'rejected');
  record('Wrong currency is rejected', evaluateProviderPoll({ amount: 250, currency: 'USD', providerRef: 'SUBS-1' }, { status: 'Paid', amount: 250, currency: 'ZWL', reference: 'SUBS-1' }).outcome === 'rejected');
  record('Mismatched reference is rejected', evaluateProviderPoll({ amount: 250, currency: 'USD', providerRef: 'SUBS-1' }, { status: 'Paid', amount: 250, reference: 'OTHER' }).outcome === 'rejected');
  record('Matching paid poll is accepted', evaluateProviderPoll({ amount: 250, currency: 'USD', providerRef: 'SUBS-1' }, { status: 'Paid', amount: '250.00', reference: 'SUBS-1' }).outcome === 'paid');
  record('Cancelled and pending polls do not count as paid',
    evaluateProviderPoll({ amount: 250, currency: 'USD' }, { status: 'Cancelled', amount: 250 }).outcome === 'failed'
    && evaluateProviderPoll({ amount: 250, currency: 'USD' }, { status: 'Sent', amount: 250 }).outcome === 'pending');
  record('Poll URLs must be Paynow HTTPS',
    isAllowedPaynowPollUrl('https://www.paynow.co.zw/interface/pollstatus')
    && !isAllowedPaynowPollUrl('http://www.paynow.co.zw/interface/pollstatus')
    && !isAllowedPaynowPollUrl('https://127.0.0.1/poll'));
  const payload: Record<string, unknown> = { reference: 'SUBS-1', amount: '250.00', status: 'Paid' };
  payload.hash = paynowPayloadHash(payload, 'integration-key');
  record('Valid Paynow hash is accepted and a bad hash is rejected',
    verifyPaynowPayload(payload, 'integration-key')
    && !verifyPaynowPayload({ ...payload, hash: 'not-the-hash' }, 'integration-key'));
  record('Missing Paynow credentials are unconfigured and modes stay distinct',
    paynowConfigurationState({} as NodeJS.ProcessEnv).mode === 'unconfigured'
    && paynowConfigurationState({ PAYNOW_INTEGRATION_ID: 'id', PAYNOW_INTEGRATION_KEY: 'key', PAYNOW_MODE: 'test' } as NodeJS.ProcessEnv).mode === 'test'
    && paynowConfigurationState({ PAYNOW_INTEGRATION_ID: 'id', PAYNOW_INTEGRATION_KEY: 'key', PAYNOW_MODE: 'live' } as NodeJS.ProcessEnv).mode === 'live');
  record('Production API configuration does not keep a localhost base',
    productionApiUrl('http://localhost:5000/api', 'production', 'https://www.mantisafrica.com') === 'https://www.mantisafrica.com/api');
  const trialOffer = resolvePublicRegistration({ plan: 'SME', registrationMode: 'trial', billingCycle: 'yearly' });
  const landlordMonthly = resolvePublicRegistration({ plan: 'INDIVIDUAL', registrationMode: 'paid', billingCycle: 'monthly' });
  const landlordYearly = resolvePublicRegistration({ plan: 'INDIVIDUAL', registrationMode: 'paid', billingCycle: 'yearly' });
  const managerMonthly = resolvePublicRegistration({ plan: 'SME', registrationMode: 'paid', billingCycle: 'monthly' });
  const managerYearly = resolvePublicRegistration({ plan: 'SME', registrationMode: 'paid', billingCycle: 'yearly' });
  const enterpriseClosed = resolvePublicRegistration({ plan: 'ENTERPRISE', registrationMode: 'paid', billingCycle: 'monthly' }, {} as NodeJS.ProcessEnv);
  const enterpriseOpen = resolvePublicRegistration({ plan: 'ENTERPRISE', registrationMode: 'paid', billingCycle: 'monthly' }, { ENTERPRISE_DIRECT_CHECKOUT: 'true' } as NodeJS.ProcessEnv);
  const weekly = resolvePublicRegistration({ plan: 'INDIVIDUAL', registrationMode: 'paid', billingCycle: 'weekly' });
  record('Free trial registration does not require payment', Boolean(trialOffer.ok && trialOffer.mode === 'trial' && trialOffer.plan === 'INDIVIDUAL' && trialOffer.paymentRequired === false));
  record('Landlord and Property Manager prices resolve for monthly and yearly',
    Boolean(landlordMonthly.ok && landlordYearly.ok && managerMonthly.ok && managerYearly.ok)
    && configuredPlanCharge('INDIVIDUAL', 'monthly') === 250
    && configuredPlanCharge('INDIVIDUAL', 'yearly') === 3000
    && configuredPlanCharge('SME', 'monthly') === 600
    && configuredPlanCharge('SME', 'yearly') === 7200);
  record('Enterprise does not enter direct checkout unless configured',
    !enterpriseClosed.ok && enterpriseClosed.ok === false && enterpriseClosed.code === 'ENTERPRISE_SALES_ONLY'
    && enterpriseOpen.ok && enterpriseOpen.mode === 'paid');
  record('An unsupported billing frequency is rejected', !weekly.ok && weekly.ok === false && weekly.code === 'UNSUPPORTED_BILLING_CYCLE');
  record('Pending registration does not open the workspace',
    companyAwaitingRegistrationPayment('PENDING_PAYMENT')
    && !companyAwaitingRegistrationPayment('ACTIVE')
    && !companyAwaitingRegistrationPayment('INITIALIZING_WORKSPACE'));
}

async function runDatabaseChecks() {
  if (process.env.NODE_ENV === 'production') {
    record('Database registration checks were not run against production', true, 'NODE_ENV=production');
    return;
  }

  const { connectDatabase, closeDatabase } = await import('../config/database');
  const { OnboardingService } = await import('../services/onboardingService');
  const { applyPolledPayment } = await import('../services/applyPolledPayment');
  const { User } = await import('../models/User');
  const { Company } = await import('../models/Company');
  const { Subscription } = await import('../models/Subscription');
  const { PaymentSession } = await import('../models/PaymentSession');
  const { BillingPayment } = await import('../models/BillingPayment');
  const { OnboardingSession } = await import('../models/OnboardingSession');
  const { WebhookEventReceipt } = await import('../models/WebhookEventReceipt');
  const paynowRoutes = (await import('../routes/paynowRoutes')).default;
  const { ensurePaymentSessionProviderRefIndex } = await import('../services/paymentSessionReferenceIndex');

  await connectDatabase();
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.get('/api/workspace', authWithCompany, (req, res) => res.json({ ok: true, companyId: req.user?.companyId }));
  app.use('/api/paynow', paynowRoutes);
  app.use(errorHandler);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as any).port as number;
  const service = OnboardingService.getInstance();
  const stamp = `REGPAY${Date.now().toString().slice(-8)}`;
  const previousKey = process.env.PAYNOW_INTEGRATION_KEY;
  const previousMode = process.env.PAYNOW_MODE;
  process.env.PAYNOW_INTEGRATION_KEY = 'registration-test-key';
  process.env.PAYNOW_MODE = 'test';
  const createdCompanyIds: mongoose.Types.ObjectId[] = [];
  const startedAt = new Date();
  const rentalPaymentsBefore = await mongoose.connection.collection('payments').countDocuments();

  try {
    const beforeUsers = await User.countDocuments({ email: `${stamp}-invalid@example.test` });
    let invalidRejected = false;
    try {
      await service.start({ ...registrationInput(stamp, 'invalid'), password: 'short' });
    } catch (error: any) {
      invalidRejected = error?.code === 'VALIDATION_ERROR';
    }
    const afterUsers = await User.countDocuments({ email: `${stamp}-invalid@example.test` });
    record('Invalid registration is rejected without creating a user', invalidRejected && beforeUsers === afterUsers);

    let partialRejected = false;
    try {
      await service.start({
        ...registrationInput(stamp, 'partial'),
        company: { ...registrationInput(stamp, 'partial').company, address: '', phone: '' }
      });
    } catch (error: any) {
      partialRejected = error?.statusCode === 400 || error?.statusCode === 500;
    }
    const partialUser = await User.findOne({ email: `${stamp}-partial@example.test` });
    const partialCompany = await Company.findOne({ email: `${stamp}-partial@example.test` });
    record('A failed company save does not leave an administrator without a company', partialRejected && !partialUser && !partialCompany);

    const first = await service.start(registrationInput(stamp, 'trial', `${stamp}-trial`));
    createdCompanyIds.push(first.company._id);
    const repeat = await service.start(registrationInput(stamp, 'trial', `${stamp}-trial`));
    const companyCount = await Company.countDocuments({ _id: first.company._id });
    const admin = await User.findById(first.user._id);
    record('A valid registration creates the company and its administrator', Boolean(first.company?._id && first.user?._id));
    record('The initial administrator is a company admin and not a system administrator',
      admin?.role === 'admin' && !(admin?.roles || []).includes('system_admin'));
    record('The administrator belongs to the new company', String(admin?.companyId) === String(first.company._id));
    const trialSessions = await PaymentSession.countDocuments({ companyId: first.company._id });
    const trialDays = (new Date(first.subscription.trialEndDate).getTime() - new Date(first.subscription.trialStartDate).getTime()) / 86400000;
    record('Repeated registration does not create a second company or restart the trial',
      repeat.alreadyProcessed === true
      && companyCount === 1
      && new Date(repeat.subscription.trialEndDate).getTime() === new Date(first.subscription.trialEndDate).getTime());
    record('Free trial registration creates an active company without a Paynow session',
      first.company.tenantStatus === 'active'
      && first.company.onboardingStatus === 'ACTIVE'
      && first.company.plan === 'INDIVIDUAL'
      && first.subscription.status === 'trial'
      && first.subscription.trialDurationDays === 14
      && trialDays > 13.9
      && trialDays < 14.1
      && !first.paymentSession
      && trialSessions === 0
      && first.company.featureFlags?.onlinePaymentsEnabled !== true);

    const trialEndBefore = new Date(first.subscription.trialEndDate).getTime();
    const trialStartBefore = new Date(first.subscription.trialStartDate).getTime();
    let takeoverBlocked = false;
    let takeoverMessage = '';
    try {
      await service.start({ ...registrationInput(stamp, 'takeover', `${stamp}-takeover`), email: first.user.email, password: 'Wrongpass1' });
    } catch (error: any) {
      takeoverBlocked = error?.code === 'REGISTRATION_SIGN_IN_REQUIRED';
      takeoverMessage = String(error?.message || '');
    }
    const resumedTrial = await service.start({ ...registrationInput(stamp, 'resume-trial', `${stamp}-resume-trial`), email: first.user.email });
    record('An unauthenticated person cannot take over another user\'s pending registration',
      takeoverBlocked
      && !takeoverMessage.includes(String(first.company._id))
      && !takeoverMessage.toLowerCase().includes('payment')
      && (await Company.countDocuments({ _id: first.company._id })) === 1);
    record('Retrying an active trial does not create another company or change trial dates',
      String(resumedTrial.company._id) === String(first.company._id)
      && new Date(resumedTrial.subscription.trialEndDate).getTime() === trialEndBefore
      && new Date(resumedTrial.subscription.trialStartDate).getTime() === trialStartBefore
      && resumedTrial.subscription.status === 'trial'
      && (await Company.countDocuments({ normalizedEmail: String(first.user.email) })) === 1);

    let duplicateCompany = false;
    try {
      await service.start({
        ...registrationInput(stamp, 'tin', `${stamp}-tin`),
        company: { ...registrationInput(stamp, 'tin').company, tinNumber: first.company.tinNumber }
      });
    } catch (error: any) {
      duplicateCompany = error?.code === 'DUPLICATE_COMPANY';
    }
    record('Duplicate company registration is rejected', duplicateCompany);

    const blankLandlord = {
      ...registrationInput(stamp, 'blankid', `${stamp}-blankid`),
      company: {
        ...registrationInput(stamp, 'blankid').company,
        companyType: 'INDIVIDUAL_LANDLORD' as const,
        registrationNumber: '',
        tinNumber: '',
        workspaceType: 'individual' as const
      }
    };
    const blankOne = await service.start(blankLandlord);
    const blankTwo = await service.start({
      ...blankLandlord,
      email: `${stamp}-blankid-2@example.test`,
      idempotencyKey: `${stamp}-blankid-2`,
      company: { ...blankLandlord.company, name: `${stamp} blankid 2`, email: `${stamp}-blankid-2@example.test` }
    });
    createdCompanyIds.push(blankOne.company._id, blankTwo.company._id);
    const storedBlank = await Company.findById(blankOne.company._id).lean();
    record('A landlord without a TIN is not rejected because another blank TIN exists',
      Boolean(blankOne.company?._id && blankTwo.company?._id)
      && !storedBlank?.tinNumber
      && !storedBlank?.registrationNumber);

    const trialToken = tokenFor(admin as any);
    const trialWorkspace = await request(port, 'GET', '/api/workspace', trialToken);
    record('A trial administrator can authenticate to the company workspace', trialWorkspace.status === 200 && trialWorkspace.json.companyId === String(first.company._id));

    const previousPaynowId = process.env.PAYNOW_INTEGRATION_ID;
    const previousPaynowKey = process.env.PAYNOW_INTEGRATION_KEY;
    delete process.env.PAYNOW_INTEGRATION_ID;
    delete process.env.PAYNOW_INTEGRATION_KEY;
    const trialWithoutPaynow = await service.start(registrationInput(stamp, 'nopaynow', `${stamp}-nopaynow`));
    process.env.PAYNOW_INTEGRATION_ID = previousPaynowId;
    process.env.PAYNOW_INTEGRATION_KEY = previousPaynowKey || 'registration-test-key';
    createdCompanyIds.push(trialWithoutPaynow.company._id);
    record('Trial registration succeeds when Paynow credentials are absent',
      trialWithoutPaynow.company?.tenantStatus === 'active' && !trialWithoutPaynow.paymentSession);

    const { AuthService } = await import('../services/authService');
    const loggedIn = await AuthService.getInstance().login(`${stamp}-trial@example.test`, 'Register1pay');
    record('Existing login accepts the company administrator',
      Boolean(loggedIn.token) && String((loggedIn.user as any).companyId) === String(first.company._id));

    const held = await service.start(registrationInput(stamp, 'held', `${stamp}-held`, 'paid'));
    createdCompanyIds.push(held.company._id);
    const heldAdmin = await User.findById(held.user._id);
    const heldToken = tokenFor(heldAdmin as any);
    const blocked = await request(port, 'GET', '/api/workspace', heldToken);
    const heldCompany = await Company.findById(held.company._id);
    const { chargeForPlan } = await import('../services/systemPlanService');
    const landlordMonthly = await chargeForPlan('INDIVIDUAL', 'monthly');
    record('Landlord registration waits for payment at the configured monthly price',
      held.company.plan === 'INDIVIDUAL'
      && held.subscription.cycle === 'monthly'
      && held.paymentSession.amount === landlordMonthly
      && held.paymentSession.currency === 'USD'
      && String(held.paymentSession.companyId) === String(held.company._id)
      && held.company.onboardingStatus === 'PENDING_PAYMENT'
      && held.company.isActive === false
      && blocked.status === 403
      && blocked.json.code === 'PAYMENT_REQUIRED');

    await PaymentSession.updateOne({ _id: held.paymentSession._id }, {
      $set: {
        status: 'provider_created',
        pollUrl: 'https://www.paynow.co.zw/interface/pollstatus?guid=registration-test',
        rawProviderResponse: { redirectUrl: 'https://www.paynow.co.zw/Payment/ConfirmPayment/registration-test' }
      }
    });
    const destination = await request(port, 'POST', '/api/paynow/web/create', heldToken, {
      paymentSessionId: String(held.paymentSession._id),
      amount: 1,
      reference: 'client-picked-reference'
    });
    await PaymentSession.updateOne({ _id: held.paymentSession._id }, { $set: { status: 'pending' }, $unset: { pollUrl: '', rawProviderResponse: '' } });
    record('A payment session returns its Paynow destination and ignores a client amount',
      destination.status === 200 && destination.json.redirectUrl === 'https://www.paynow.co.zw/Payment/ConfirmPayment/registration-test');

    const fakePaid = await request(port, 'POST', '/api/paynow/confirm', heldToken, {
      reference: held.paymentSession.providerRef,
      paymentStatus: 'paid',
      success: true
    });
    const afterFake = await Company.findById(held.company._id);
    record('A client-side paid flag cannot activate a company',
      fakePaid.status === 200
      && fakePaid.json.paymentStatus !== 'paid'
      && afterFake?.onboardingStatus === 'PENDING_PAYMENT'
      && afterFake?.tenantStatus === 'pending');

    const invoiceAmount = Number(held.paymentSession.amount);
    const badAmount = await applyPolledPayment(String(held.paymentSession.providerRef), { status: 'Paid', amount: invoiceAmount + 25, reference: held.paymentSession.providerRef }).then(() => 'accepted').catch((error: any) => error?.code || error?.message);
    const afterBadAmount = await Company.findById(held.company._id);
    record('An incorrect provider amount does not activate the company', badAmount === 'PAYMENT_MISMATCH' && afterBadAmount?.onboardingStatus === 'PENDING_PAYMENT');

    const badCurrency = await applyPolledPayment(String(held.paymentSession.providerRef), { status: 'Paid', amount: invoiceAmount, currency: 'ZWL', reference: held.paymentSession.providerRef }).then(() => 'accepted').catch((error: any) => error?.code);
    record('A currency mismatch does not activate the company', badCurrency === 'PAYMENT_MISMATCH');

    const cancelled = await applyPolledPayment(String(held.paymentSession.providerRef), { status: 'Cancelled', amount: invoiceAmount, reference: held.paymentSession.providerRef });
    const afterCancel = await Company.findById(held.company._id);
    record('A cancelled payment does not activate the company', cancelled.activated === false && cancelled.paymentStatus === 'cancelled' && afterCancel?.onboardingStatus === 'PENDING_PAYMENT');

    await PaymentSession.updateOne({ _id: held.paymentSession._id }, { $set: { status: 'pending', failedAt: null } });
    const pending = await applyPolledPayment(String(held.paymentSession.providerRef), { status: 'Sent', amount: invoiceAmount, reference: held.paymentSession.providerRef });
    const afterPending = await Company.findById(held.company._id);
    record('A pending payment does not activate the company', pending.activated === false && afterPending?.tenantStatus === 'pending');

    const paid = await applyPolledPayment(String(held.paymentSession.providerRef), { status: 'Paid', amount: held.paymentSession.amount, currency: 'USD', reference: held.paymentSession.providerRef, paynowReference: `${stamp}-paynow` });
    const paidAgain = await applyPolledPayment(String(held.paymentSession.providerRef), { status: 'Paid', amount: held.paymentSession.amount, currency: 'USD', reference: held.paymentSession.providerRef });
    const subscriptionCount = await Subscription.countDocuments({ companyId: held.company._id });
    const billingCount = await BillingPayment.countDocuments({ companyId: held.company._id, status: 'paid' });
    const activated = await Company.findById(held.company._id);
    const opened = await request(port, 'GET', '/api/workspace', heldToken);
    record('A verified payment activates the held company once',
      paid.activated === true
      && paidAgain.activated === false
      && activated?.tenantStatus === 'active'
      && activated?.subscriptionStatus === 'active'
      && subscriptionCount === 1
      && billingCount === 1
      && opened.status === 200);

    const other = await service.start(registrationInput(stamp, 'otherco', `${stamp}-otherco`, 'paid'));
    createdCompanyIds.push(other.company._id);
    const manager = await service.start(registrationInput(stamp, 'manager', `${stamp}-manager`, 'paid', 'SME', 'yearly'));
    createdCompanyIds.push(manager.company._id);
    const foreignCheckout = await request(port, 'POST', '/api/paynow/web/create', tokenFor({ _id: other.user._id, role: 'admin', roles: ['admin'], companyId: other.company._id }), {
      paymentSessionId: String(held.paymentSession._id)
    });
    record('Property Manager yearly checkout uses the configured price for that company',
      manager.company.plan === 'SME'
      && manager.paymentSession.billingCycle === 'yearly'
      && manager.paymentSession.amount === await chargeForPlan('SME', 'yearly')
      && String(manager.paymentSession.companyId) === String(manager.company._id));
    record('A company cannot use another company payment session', foreignCheckout.status === 404);

    const badHash = await request(port, 'POST', '/api/paynow/result', undefined, {
      reference: other.paymentSession.providerRef,
      status: 'Paid',
      amount: '250.00',
      hash: 'not-a-valid-signature'
    });
    const afterBadHash = await Company.findById(other.company._id);
    record('An invalid Paynow signature is rejected', badHash.status === 401 && afterBadHash?.onboardingStatus === 'PENDING_PAYMENT' && afterBadHash?.subscriptionStatus !== 'active');

    const signed: Record<string, unknown> = {
      reference: String(other.paymentSession.providerRef),
      status: 'Paid',
      amount: '250.00'
    };
    signed.hash = paynowPayloadHash(signed, 'registration-test-key');
    const firstNotice = await request(port, 'POST', '/api/paynow/result', undefined, signed);
    const secondNotice = await request(port, 'POST', '/api/paynow/result', undefined, signed);
    const receipts = await WebhookEventReceipt.countDocuments({ provider: 'paynow', eventId: String(signed.hash) });
    const stillTrial = await Company.findById(other.company._id);
    record('A signed notice without a Paynow status URL does not activate the company',
      firstNotice.status === 200 && stillTrial?.onboardingStatus === 'PENDING_PAYMENT' && stillTrial?.subscriptionStatus !== 'active');
    record('A duplicate signed notice is ignored', secondNotice.json.status === 'duplicate' && receipts === 1);

    const unauthenticated = await request(port, 'POST', '/api/paynow/web/create', undefined, { paymentSessionId: String(other.paymentSession._id) });
    record('Unauthenticated checkout is rejected', unauthenticated.status === 401);

    const priced = await service.start({
      ...registrationInput(stamp, 'yearly', `${stamp}-yearly`, 'paid', 'INDIVIDUAL', 'yearly'),
      amount: 1
    } as any);
    const pricedAgain = await service.start(registrationInput(stamp, 'yearly', `${stamp}-yearly`, 'paid', 'INDIVIDUAL', 'yearly'));
    createdCompanyIds.push(priced.company._id);
    const pricedCompanies = await Company.countDocuments({ _id: priced.company._id });
    record('Yearly Landlord checkout uses the configured price and ignores a client amount',
      priced.paymentSession.amount === await chargeForPlan('INDIVIDUAL', 'yearly') && priced.paymentSession.billingCycle === 'yearly');
    record('A repeated paid registration does not create another company', pricedAgain.alreadyProcessed === true && pricedCompanies === 1);

    const previousNodeEnv = process.env.NODE_ENV;
    const savedPaynowId = process.env.PAYNOW_INTEGRATION_ID;
    const savedPaynowKey = process.env.PAYNOW_INTEGRATION_KEY;
    const unconfigured = await service.start(registrationInput(stamp, 'unconfigured', `${stamp}-unconfigured`, 'paid'));
    createdCompanyIds.push(unconfigured.company._id);
    delete process.env.PAYNOW_INTEGRATION_ID;
    delete process.env.PAYNOW_INTEGRATION_KEY;
    process.env.NODE_ENV = 'production';
    const unconfiguredCheckout = await request(port, 'POST', '/api/paynow/web/create', tokenFor({
      _id: unconfigured.user._id,
      role: 'admin',
      roles: ['admin'],
      companyId: unconfigured.company._id
    }), {
      paymentSessionId: String(unconfigured.paymentSession._id),
      amount: 1
    });
    process.env.NODE_ENV = previousNodeEnv;
    process.env.PAYNOW_INTEGRATION_ID = savedPaynowId;
    process.env.PAYNOW_INTEGRATION_KEY = savedPaynowKey;
    const unconfiguredCompany = await Company.findById(unconfigured.company._id);
    record('Checkout initiation fails safely when Paynow is not configured',
      unconfiguredCheckout.status === 503
      && unconfiguredCheckout.json.code === 'PAYNOW_NOT_CONFIGURED'
      && unconfiguredCompany?.onboardingStatus === 'PENDING_PAYMENT'
      && unconfiguredCompany?.subscriptionStatus !== 'active');

    let enterpriseRejected = false;
    try {
      await service.start(registrationInput(stamp, 'enterprise', `${stamp}-enterprise`, 'paid', 'ENTERPRISE'));
    } catch (error: any) {
      enterpriseRejected = error?.code === 'ENTERPRISE_SALES_ONLY';
    }
    const enterpriseCompany = await Company.findOne({ email: `${stamp}-enterprise@example.test` });
    record('Enterprise registration does not start checkout', enterpriseRejected && !enterpriseCompany);

    let unsupportedCycle = false;
    try {
      await service.start({ ...registrationInput(stamp, 'weekly', `${stamp}-weekly`, 'paid'), billingCycle: 'weekly' as any });
    } catch (error: any) {
      unsupportedCycle = error?.code === 'UNSUPPORTED_BILLING_CYCLE';
    }
    record('An unsupported billing frequency does not create a company', unsupportedCycle && !(await Company.findOne({ email: `${stamp}-weekly@example.test` })));

    const { Plan: PlanModel } = await import('../models/Plan');
    const { seedDefaultPlans } = await import('../services/systemPlanService');
    await seedDefaultPlans();
    const savedYearly = (await PlanModel.findOne({ code: 'SME' }).select('annualPrice').lean())?.annualPrice;
    await PlanModel.updateOne({ code: 'SME' }, { $set: { annualPrice: 0 } });
    let missingYearly = false;
    try {
      await service.start(registrationInput(stamp, 'noyearly', `${stamp}-noyearly`, 'paid', 'SME', 'yearly'));
    } catch (error: any) {
      missingYearly = error?.code === 'REGISTRATION_PRICE_NOT_CONFIGURED';
    } finally {
      await PlanModel.updateOne({ code: 'SME' }, { $set: { annualPrice: savedYearly ?? 0 } });
    }
    record('A missing yearly price is rejected instead of using the monthly price',
      missingYearly && !(await Company.findOne({ email: `${stamp}-noyearly@example.test` })));

    const closed = await service.start(registrationInput(stamp, 'closed', `${stamp}-closed`, 'paid'));
    createdCompanyIds.push(closed.company._id);
    const closedStill = await Company.findById(closed.company._id);
    const closedAdmin = await User.findById(closed.user._id);
    record('A new paid registration creates one company and one administrator',
      Boolean(closed.company?._id && closed.user?._id)
      && (await User.countDocuments({ companyId: closed.company._id })) === 1
      && (await Company.countDocuments({ _id: closed.company._id })) === 1);
    record('Browser closure does not destroy the registration',
      closedStill?.onboardingStatus === 'PENDING_PAYMENT' && closedAdmin?.email === closed.user.email && closedStill?.isActive === false);
    const resumedClosed = await service.start({
      ...registrationInput(stamp, 'closed-retry', `${stamp}-closed-retry`, 'paid'),
      email: closed.user.email,
      company: { ...registrationInput(stamp, 'closed', `${stamp}-closed`, 'paid').company, email: closed.user.email }
    });
    record('A pending registration can resume checkout',
      String(resumedClosed.company._id) === String(closed.company._id)
      && String(resumedClosed.paymentSession?._id) === String(closed.paymentSession._id)
      && resumedClosed.resume?.code === 'PENDING_REGISTRATION');
    record('An authenticated pending user can resume checkout',
      resumedClosed.alreadyProcessed === true && Boolean(resumedClosed.paymentSession?._id));
    record('Retrying registration does not create a duplicate company',
      (await Company.countDocuments({ normalizedEmail: String(closed.user.email) })) === 1);
    record('Retrying checkout does not create a duplicate subscription',
      (await Subscription.countDocuments({ companyId: closed.company._id })) === 1
      && String(resumedClosed.subscription._id) === String(closed.subscription._id));

    const resumedUnconfigured = await service.start({
      ...registrationInput(stamp, 'unconfigured-retry', `${stamp}-unconfigured-retry`, 'paid'),
      email: unconfigured.user.email,
      company: { ...registrationInput(stamp, 'unconfigured', `${stamp}-unconfigured`, 'paid').company, email: unconfigured.user.email }
    });
    record('Checkout initiation failure leaves the registration recoverable',
      String(resumedUnconfigured.company._id) === String(unconfigured.company._id)
      && resumedUnconfigured.company.onboardingStatus === 'PENDING_PAYMENT'
      && resumedUnconfigured.company.subscriptionStatus !== 'active');

    const cancelCo = await service.start(registrationInput(stamp, 'cancelco', `${stamp}-cancelco`, 'paid'));
    createdCompanyIds.push(cancelCo.company._id);
    const cancelAmount = Number(cancelCo.paymentSession.amount);
    const cancelPoll = await applyPolledPayment(String(cancelCo.paymentSession.providerRef), {
      status: 'Cancelled',
      amount: cancelAmount,
      currency: 'USD',
      reference: cancelCo.paymentSession.providerRef
    });
    const cancelRetry = await service.start({
      ...registrationInput(stamp, 'cancel-retry', `${stamp}-cancel-retry`, 'paid'),
      email: cancelCo.user.email,
      company: { ...registrationInput(stamp, 'cancelco', `${stamp}-cancelco`, 'paid').company, email: cancelCo.user.email }
    });
    const afterCancelRetry = await Company.findById(cancelCo.company._id);
    record('Customer cancellation does not permanently block the email address',
      cancelPoll.activated === false
      && String(cancelRetry.company._id) === String(cancelCo.company._id)
      && afterCancelRetry?.onboardingStatus === 'PENDING_PAYMENT'
      && (await Company.countDocuments({ normalizedEmail: String(cancelCo.user.email) })) === 1);
    record('A cancelled payment does not activate the subscription',
      cancelPoll.paymentStatus === 'cancelled' && afterCancelRetry?.subscriptionStatus !== 'active');

    const failedCo = await service.start(registrationInput(stamp, 'failedco', `${stamp}-failedco`, 'paid'));
    createdCompanyIds.push(failedCo.company._id);
    const failedPoll = await applyPolledPayment(String(failedCo.paymentSession.providerRef), {
      status: 'Failed',
      amount: Number(failedCo.paymentSession.amount),
      currency: 'USD',
      reference: failedCo.paymentSession.providerRef
    });
    const afterFailed = await Company.findById(failedCo.company._id);
    const failedRetry = await service.start({
      ...registrationInput(stamp, 'failed-retry', `${stamp}-failed-retry`, 'paid'),
      email: failedCo.user.email,
      company: { ...registrationInput(stamp, 'failedco', `${stamp}-failedco`, 'paid').company, email: failedCo.user.email }
    });
    record('A failed payment does not activate the subscription',
      failedPoll.activated === false
      && afterFailed?.onboardingStatus === 'PENDING_PAYMENT'
      && afterFailed?.subscriptionStatus !== 'active'
      && String(failedRetry.company._id) === String(failedCo.company._id)
      && (await Subscription.countDocuments({ companyId: failedCo.company._id })) === 1);

    const ambiguous = await service.start(registrationInput(stamp, 'ambiguous', `${stamp}-ambiguous`, 'paid'));
    createdCompanyIds.push(ambiguous.company._id);
    const old = new Date(Date.now() - 8 * 86400000);
    await Company.collection.updateOne({ _id: ambiguous.company._id }, { $set: { createdAt: old, updatedAt: old } });
    await User.collection.updateOne({ _id: ambiguous.user._id }, { $set: { createdAt: old, updatedAt: old } });
    await PaymentSession.collection.updateOne({ _id: ambiguous.paymentSession._id }, {
      $set: {
        createdAt: old,
        updatedAt: old,
        status: 'pending',
        pollUrl: 'https://www.paynow.co.zw/interface/pollstatus?guid=ambiguous'
      }
    });
    await OnboardingSession.collection.updateOne({ _id: ambiguous.onboardingSession._id }, { $set: { createdAt: old, updatedAt: old } });
    const { releaseAbandonedRegistration } = await import('../services/abandonedRegistrationService');
    const deferred = await releaseAbandonedRegistration(ambiguous.company._id);
    const ambiguousStill = await Company.findById(ambiguous.company._id);
    const ambiguousUser = await User.findById(ambiguous.user._id);
    const ambiguousResume = await service.start({
      ...registrationInput(stamp, 'ambiguous-retry', `${stamp}-ambiguous-retry`, 'paid'),
      email: ambiguous.user.email,
      company: { ...registrationInput(stamp, 'ambiguous', `${stamp}-ambiguous`, 'paid').company, email: ambiguous.user.email }
    });
    record('A pending Paynow transaction is not treated as failure without checking provider state',
      deferred === 'deferred'
      && ambiguousStill?.onboardingStatus === 'PENDING_PAYMENT'
      && ambiguousUser?.email === ambiguous.user.email
      && String(ambiguousResume.company._id) === String(ambiguous.company._id)
      && ambiguousResume.resume?.code === 'PAYMENT_IN_PROGRESS');

    const paidRetry = await service.start({
      ...registrationInput(stamp, 'held-retry', `${stamp}-held-retry`, 'paid'),
      email: `${stamp}-held@example.test`,
      company: { ...registrationInput(stamp, 'held', `${stamp}-held`, 'paid').company, email: `${stamp}-held@example.test` }
    });
    record('A verified payment is not charged again on retry',
      String(paidRetry.company._id) === String(held.company._id)
      && (paidRetry.resume?.code === 'ACCOUNT_EXISTS' || paidRetry.resume?.code === 'PAYMENT_ALREADY_VERIFIED')
      && !paidRetry.paymentSession
      && (await Subscription.countDocuments({ companyId: held.company._id })) === 1
      && (await BillingPayment.countDocuments({ companyId: held.company._id, status: 'paid' })) === 1);

    const abandoned = await service.start(registrationInput(stamp, 'abandoned', `${stamp}-abandoned`, 'paid'));
    createdCompanyIds.push(abandoned.company._id);
    const abandonedEmail = String(abandoned.user.email);
    await Company.collection.updateOne({ _id: abandoned.company._id }, { $set: { createdAt: old, updatedAt: old } });
    await User.collection.updateOne({ _id: abandoned.user._id }, { $set: { createdAt: old, updatedAt: old } });
    await PaymentSession.collection.updateOne({ _id: abandoned.paymentSession._id }, { $set: { createdAt: old, updatedAt: old } });
    await OnboardingSession.collection.updateOne({ _id: abandoned.onboardingSession._id }, { $set: { createdAt: old, updatedAt: old } });
    const released = await releaseAbandonedRegistration(abandoned.company._id);
    const archivedEmailAfterFirst = (await User.findById(abandoned.user._id))?.email;
    const releasedAgain = await releaseAbandonedRegistration(abandoned.company._id);
    const archivedUser = await User.findById(abandoned.user._id);
    const archivedCompany = await Company.findById(abandoned.company._id);
    const archivedSession = await PaymentSession.findById(abandoned.paymentSession._id);
    const fresh = await service.start({
      ...registrationInput(stamp, 'again', `${stamp}-again`, 'paid'),
      email: abandonedEmail,
      company: { ...registrationInput(stamp, 'again', `${stamp}-again`, 'paid').company, email: abandonedEmail }
    });
    createdCompanyIds.push(fresh.company._id);
    record('Expired eligible registrations can be safely archived',
      released === 'released'
      && archivedCompany?.onboardingStatus === 'EXPIRED'
      && archivedCompany?.tenantStatus === 'archived'
      && archivedUser?.isArchived === true
      && archivedUser?.isActive === false
      && Boolean(archivedSession));
    record('Expired registrations release the email address',
      archivedUser?.email !== abandonedEmail
      && !String(archivedUser?.password || '').includes('Register1pay')
      && archivedCompany?.email !== abandonedEmail);
    record('The same email can register again after a safe release',
      String(fresh.company._id) !== String(abandoned.company._id)
      && fresh.user.email === abandonedEmail
      && fresh.company.onboardingStatus === 'PENDING_PAYMENT'
      && (await User.countDocuments({ email: abandonedEmail })) === 1);
    record('Cleanup is idempotent',
      releasedAgain === 'released' && archivedUser?.email === archivedEmailAfterFirst);

    await Company.collection.updateOne({ _id: first.company._id }, { $set: { createdAt: old, updatedAt: old } });
    await User.collection.updateOne({ _id: first.user._id }, { $set: { createdAt: old, updatedAt: old } });
    const trialRelease = await releaseAbandonedRegistration(first.company._id);
    const trialStill = await Company.findById(first.company._id);
    const trialUser = await User.findById(first.user._id);
    const trialSub = await Subscription.findById(first.subscription._id);
    record('An active trial cannot be archived by abandoned-registration cleanup',
      trialRelease === 'skipped' && trialStill?.onboardingStatus === 'ACTIVE' && trialStill?.tenantStatus === 'active' && trialUser?.email === first.user.email);
    record('An active user cannot be archived by abandoned-registration cleanup',
      trialUser?.isArchived !== true && trialUser?.isActive === true && trialUser?.email === first.user.email);
    record('Trial start and end dates do not change when registration is retried',
      new Date(trialSub?.trialEndDate || 0).getTime() === trialEndBefore
      && new Date(trialSub?.trialStartDate || 0).getTime() === trialStartBefore);
    const paidRelease = await releaseAbandonedRegistration(held.company._id);
    const heldStill = await Company.findById(held.company._id);
    record('Verified paid accounts are never removed by cleanup',
      paidRelease === 'skipped'
      && heldStill?.subscriptionStatus === 'active'
      && heldStill?.onboardingStatus !== 'EXPIRED'
      && heldStill?.email === held.company.email);
    record('Company isolation remains enforced',
      trialStill?.email === first.company.email
      && heldStill?.email === held.company.email
      && String(trialStill?._id) !== String(heldStill?._id));

    let duplicateActiveBlocked = false;
    try {
      const duplicateUser = await User.create({
        email: first.user.email,
        password: 'Register1pay',
        firstName: 'Dup',
        lastName: 'User',
        role: 'admin',
        companyId: first.company._id
      });
      await User.deleteOne({ _id: duplicateUser._id });
    } catch (error: any) {
      duplicateActiveBlocked = error?.code === 11000;
    }
    const emailIndexes = await User.collection.indexes();
    const uniqueEmailIndex = emailIndexes.some((index: any) => index.unique && index.key?.email === 1);
    record('Duplicate active email addresses remain impossible', uniqueEmailIndex && duplicateActiveBlocked);

    const crypto = require('crypto') as typeof import('crypto');
    const recovery = await service.start(registrationInput(stamp, 'recover', `${stamp}-recover`));
    createdCompanyIds.push(recovery.company._id);
    const recoveryToken = `recover-${stamp}`;
    const recoveryUser = await User.findById(recovery.user._id);
    recoveryUser!.resetPasswordToken = crypto.createHash('sha256').update(recoveryToken).digest('hex');
    recoveryUser!.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000);
    await recoveryUser!.save();
    const { resetPassword } = await import('../controllers/authController');
    await new Promise<void>((resolve, reject) => {
      const req = { body: { token: recoveryToken, email: recovery.user.email, password: 'Recover2pay' } } as any;
      const res = { json: () => resolve() } as any;
      resetPassword(req, res, (error: any) => error ? reject(error) : resolve());
    });
    const recoveredLogin = await AuthService.getInstance().login(String(recovery.user.email), 'Recover2pay');
    record('Existing authentication and password recovery continue to work', Boolean(recoveredLogin.token));

    const rentalPaymentsAfter = await mongoose.connection.collection('payments').countDocuments();
    record('Existing rental payment records are unchanged', rentalPaymentsBefore === rentalPaymentsAfter);

    const indexResult = await ensurePaymentSessionProviderRefIndex();
    const refs = await PaymentSession.distinct('providerRef', { companyId: { $in: createdCompanyIds }, providerRef: { $ne: null } });
    record('Registration payment references for this run are unique', new Set(refs).size === refs.length);
    record('Payment session reference index is created only when existing rows allow it',
      indexResult.duplicateGroups === 0 ? indexResult.created || indexResult.alreadyPresent : indexResult.created === false);
  } finally {
    process.env.PAYNOW_INTEGRATION_KEY = previousKey;
    process.env.PAYNOW_MODE = previousMode;
    if (createdCompanyIds.length) {
      await WebhookEventReceipt.deleteMany({ provider: 'paynow', createdAt: { $gte: startedAt } });
      await BillingPayment.deleteMany({ companyId: { $in: createdCompanyIds } });
      await PaymentSession.deleteMany({ companyId: { $in: createdCompanyIds } });
      await Subscription.deleteMany({ companyId: { $in: createdCompanyIds } });
      await OnboardingSession.deleteMany({ companyId: { $in: createdCompanyIds } });
      await User.deleteMany({ companyId: { $in: createdCompanyIds } });
      await Company.deleteMany({ _id: { $in: createdCompanyIds } });
      await User.deleteMany({ email: { $regex: `^${stamp}-` } });
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await closeDatabase();
  }
}

async function main() {
  runStaticChecks();
  await runDatabaseChecks();
  const failed = checks.filter((check) => !check.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
  if (failed.length) {
    console.log(failed.map((check) => check.name).join('\n'));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
