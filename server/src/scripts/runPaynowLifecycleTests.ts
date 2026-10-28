/**
 * Isolated Paynow checkout lifecycle tests.
 * Uses a disposable local database and stand-in Paynow responses.
 * Does not call Paynow, does not use merchant credentials, and does not send mail.
 */
import './paynowLifecyclePreload';
import { PAYNOW_LIFECYCLE_POLL, paynowTestDouble } from './paynowLifecyclePreload';
import http from 'http';
import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/jwt';
import {
  evaluatePaynowDeployment,
  explainUnreconciledPaynowSession,
  paynowCallbackTargetDiffers,
  paynowConfigurationState,
  paynowCustomerAuthEmail,
  paynowPayloadHash,
  paynowRequestHost
} from '../services/registrationPaymentPolicy';
import { canonicalRedirectTarget } from '../utils/canonicalHost';
import paynowRoutes from '../routes/paynowRoutes';
import { Company } from '../models/Company';
import { User } from '../models/User';
import { Subscription } from '../models/Subscription';
import { PaymentSession } from '../models/PaymentSession';
import { BillingPayment } from '../models/BillingPayment';
import { Plan } from '../models/Plan';
import { AuditLog } from '../models/AuditLog';

const TEST_DB = 'mongodb://127.0.0.1:27017/mantis_paynow_lifecycle_test';
const AMOUNT = 19;
const KEY = 'lifecycle-test-key';

const checks: { name: string; ok: boolean; detail: string }[] = [];

function record(name: string, ok: boolean, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function resetDouble() {
  paynowTestDouble.mode = 'ok';
  paynowTestDouble.sends = 0;
  paynowTestDouble.last = null;
  paynowTestDouble.pollStatus = 'Created';
  paynowTestDouble.pollAmount = AMOUNT.toFixed(2);
  paynowTestDouble.pollCurrency = '';
  paynowTestDouble.pollReference = '';
  paynowTestDouble.pollPaynowReference = '70000001';
  paynowTestDouble.pollFault = '';
  paynowTestDouble.urls = [];
  process.env.PAYNOW_MODE = 'test';
  process.env.PAYNOW_MERCHANT_EMAIL = 'merchant@example.test';
  process.env.PAYNOW_CALLBACK_HOST = 'payments.example.test';
  process.env.PAYNOW_RESULT_URL = 'https://payments.example.test/api/paynow/result';
  process.env.PAYNOW_RETURN_URL = 'https://payments.example.test/api/paynow/return';
  process.env.PUBLIC_BASE_URL = 'https://payments.example.test';
  process.env.PAYNOW_INTEGRATION_ID = '90001';
  process.env.PAYNOW_INTEGRATION_KEY = KEY;
}

function tokenFor(user: { _id: unknown; role: string; companyId?: unknown }) {
  return jwt.sign({
    userId: String(user._id),
    role: user.role,
    roles: [user.role],
    sessionVersion: 1,
    companyId: user.companyId ? String(user.companyId) : undefined,
    type: 'access'
  }, JWT_CONFIG.SECRET, { expiresIn: '2h', issuer: JWT_CONFIG.ISSUER, audience: JWT_CONFIG.AUDIENCE });
}

function request(port: number, method: string, requestPath: string, token: string | undefined, body?: unknown, contentType = 'application/json', host = 'payments.example.test'): Promise<{ status: number; json: any; text: string; location: string }> {
  const payload = body === undefined ? '' : (contentType === 'application/json' ? JSON.stringify(body) : String(body));
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      method,
      path: requestPath,
      headers: {
        Host: host,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(payload ? { 'Content-Type': contentType, 'Content-Length': Buffer.byteLength(payload) } : {})
      },
      timeout: 20000
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json: any = {};
        try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
        resolve({ status: res.statusCode || 0, json, text, location: String(res.headers.location || '') });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    if (payload) req.write(payload);
    req.end();
  });
}

async function world(label: string, email = `${label}@example.test`) {
  const user = await User.create({
    email,
    password: 'Register1pay',
    firstName: 'Paynow',
    lastName: label,
    role: 'admin',
    roles: ['admin'],
    isActive: true,
    sessionVersion: 1
  });
  const company = await Company.create({
    name: `Lifecycle ${label}`,
    address: '1 Test Close',
    phone: '0772000001',
    email,
    ownerId: user._id,
    companyType: 'INDIVIDUAL_LANDLORD',
    workspaceType: 'individual',
    onboardingStatus: 'PENDING_PAYMENT',
    onboardingCompleted: false,
    subscriptionStatus: 'past_due',
    isActive: true,
    plan: 'INDIVIDUAL'
  });
  user.companyId = company._id;
  await user.save();
  const subscription = await Subscription.create({
    companyId: company._id,
    userId: user._id,
    plan: 'INDIVIDUAL',
    cycle: 'monthly',
    status: 'past_due'
  });
  const session = await PaymentSession.create({
    companyId: company._id,
    userId: user._id,
    subscriptionId: subscription._id,
    idempotencyKey: `lifecycle:${label}:${company._id.toString()}`,
    provider: 'paynow',
    providerRef: `SUBS-${company._id.toString()}`,
    plan: 'INDIVIDUAL',
    billingCycle: 'monthly',
    amount: AMOUNT,
    currency: 'USD',
    status: 'pending'
  });
  const billing = await BillingPayment.create({
    companyId: company._id,
    userId: user._id,
    subscriptionId: subscription._id,
    paymentSessionId: session._id,
    plan: 'INDIVIDUAL',
    cycle: 'monthly',
    amount: AMOUNT,
    currency: 'USD',
    method: 'card',
    provider: 'paynow',
    providerRef: session.providerRef,
    idempotencyKey: `lifecycle-billing:${label}:${company._id.toString()}`,
    status: 'pending'
  });
  session.billingPaymentId = billing._id;
  await session.save();
  return { user, company, subscription, session, billing, token: tokenFor(user) };
}

function statusMessage(status: string, reference: string, amount = AMOUNT.toFixed(2), currency = '') {
  const values: Record<string, string> = {
    reference,
    paynowreference: paynowTestDouble.pollPaynowReference,
    amount,
    status,
    pollurl: PAYNOW_LIFECYCLE_POLL
  };
  if (currency) values.currency = currency;
  values.hash = paynowPayloadHash(values, KEY);
  return Object.keys(values).map((name) => `${encodeURIComponent(name)}=${encodeURIComponent(values[name])}`).join('&');
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('FAIL lifecycle tests refuse to run with NODE_ENV=production');
    process.exit(1);
  }
  process.env.PAYNOW_MODE = 'test';
  process.env.PAYNOW_MERCHANT_EMAIL = 'merchant@example.test';
  process.env.PAYNOW_INTEGRATION_ID = '90001';
  process.env.PAYNOW_INTEGRATION_KEY = KEY;
  if (paynowConfigurationState().mode !== 'test' || process.env.PAYNOW_INTEGRATION_KEY !== KEY || process.env.PAYNOW_INTEGRATION_ID === '23136') {
    console.error('FAIL lifecycle tests were not pinned to the isolated test integration');
    process.exit(1);
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(process.env.PAYNOW_INTEGRATION_KEY || ''))) {
    console.error('FAIL lifecycle tests refused a live-style integration key');
    process.exit(1);
  }

  const documented = {
    id: '1201',
    reference: 'TEST REF',
    amount: '99.99',
    additionalinfo: 'A test ticket transaction',
    returnurl: 'http://www.google.com/search?q=returnurl',
    resulturl: 'http://www.google.com/search?q=resulturl',
    status: 'Message'
  };
  const documentedHash = paynowPayloadHash(documented, '3e9fed89-60e1-4ce5-ab6e-6b1eb2d4f977');
  record('Paynow documented hash example matches',
    documentedHash === '2A033FC38798D913D42ECB786B9B19645ADEDBDE788862032F1BD82CF3B92DEF84F316385D5B40DBB35F1A4FD7D5BFE73835174136463CDD48C9366B0749C689',
    documentedHash);
  record('A result URL on another host is visible before checkout',
    paynowCallbackTargetDiffers('https://www.mantisafrica.com/api/paynow/result', 'localhost:5000')
    && !paynowCallbackTargetDiffers('https://payments.example.test/api/paynow/result', 'payments.example.test'));
  record('Test mode can use the merchant login email without changing live checkout',
    paynowCustomerAuthEmail('garet.matsi@gmail.com', { PAYNOW_MODE: 'test', PAYNOW_INTEGRATION_ID: '90001', PAYNOW_INTEGRATION_KEY: KEY, PAYNOW_MERCHANT_EMAIL: 'merchant@example.test' } as NodeJS.ProcessEnv) === 'merchant@example.test'
    && paynowCustomerAuthEmail('garet.matsi@gmail.com', { PAYNOW_MODE: 'live', PAYNOW_INTEGRATION_ID: '90001', PAYNOW_INTEGRATION_KEY: KEY, PAYNOW_MERCHANT_EMAIL: 'merchant@example.test' } as NodeJS.ProcessEnv) === 'garet.matsi@gmail.com');

  const productionEnv = {
    NODE_ENV: 'production',
    PAYNOW_MODE: 'live',
    PAYNOW_INTEGRATION_ID: '90001',
    PAYNOW_INTEGRATION_KEY: KEY,
    PAYNOW_RESULT_URL: 'https://www.mantisafrica.com/api/paynow/result',
    PAYNOW_RETURN_URL: 'https://www.mantisafrica.com/api/paynow/return',
    PUBLIC_BASE_URL: 'https://www.mantisafrica.com',
    CLIENT_URL: 'https://www.mantisafrica.com'
  } as NodeJS.ProcessEnv;
  const productionReady = evaluatePaynowDeployment(productionEnv, { nodeEnv: 'production', requestHost: 'www.mantisafrica.com' });
  record('Production callback configuration is accepted when the host matches', productionReady.ok && productionReady.issues.length === 0);
  const wwwWithoutApex = evaluatePaynowDeployment({
    ...productionEnv,
    CANONICAL_HOST: 'https://www.mantisafrica.com',
    REDIRECT_FROM_HOSTS: ''
  }, { nodeEnv: 'production', requestHost: 'www.mantisafrica.com' });
  record('Checkout through www.mantisafrica.com does not require the apex domain',
    wwwWithoutApex.ok
    && wwwWithoutApex.resultHost === 'www.mantisafrica.com'
    && wwwWithoutApex.resultPath === '/api/paynow/result'
    && wwwWithoutApex.returnHost === 'www.mantisafrica.com'
    && wwwWithoutApex.returnPath === '/api/paynow/return');
  const apexCheckout = evaluatePaynowDeployment({
    ...productionEnv,
    CANONICAL_HOST: 'www.mantisafrica.com'
  }, { nodeEnv: 'production', requestHost: 'mantisafrica.com' });
  record('The apex hostname is not accepted as the checkout host',
    !apexCheckout.ok && apexCheckout.issues.includes('callback_host_mismatch') && wwwWithoutApex.ok);
  const signupQuery = '/signup?plan=INDIVIDUAL&checkout=paid&cycle=monthly';
  record('A request already on www keeps the signup parameters',
    canonicalRedirectTarget({
      hostHeader: 'www.mantisafrica.com',
      protocol: 'https',
      originalUrl: signupQuery,
      method: 'GET',
      canonicalHost: 'https://www.mantisafrica.com',
      redirectFromHosts: ''
    }) === null);
  record('A listed alias redirects to www and keeps the signup parameters',
    canonicalRedirectTarget({
      hostHeader: 'mantisafrica.azurewebsites.net',
      protocol: 'https',
      originalUrl: signupQuery,
      method: 'GET',
      canonicalHost: 'www.mantisafrica.com',
      redirectFromHosts: 'mantisafrica.azurewebsites.net'
    }) === `https://www.mantisafrica.com${signupQuery}`);
  record('The apex host is not redirected unless it is explicitly listed',
    canonicalRedirectTarget({
      hostHeader: 'mantisafrica.com',
      protocol: 'https',
      originalUrl: signupQuery,
      method: 'GET',
      canonicalHost: 'www.mantisafrica.com',
      redirectFromHosts: ''
    }) === null
    && canonicalRedirectTarget({
      hostHeader: 'mantisafrica.com',
      protocol: 'https',
      originalUrl: signupQuery,
      method: 'GET',
      canonicalHost: 'www.mantisafrica.com',
      redirectFromHosts: 'mantisafrica.com'
    }) === `https://www.mantisafrica.com${signupQuery}`);
  record('Paynow result posts are not redirected',
    canonicalRedirectTarget({
      hostHeader: 'mantisafrica.azurewebsites.net',
      protocol: 'https',
      originalUrl: '/api/paynow/result',
      method: 'POST',
      canonicalHost: 'www.mantisafrica.com',
      redirectFromHosts: 'mantisafrica.azurewebsites.net'
    }) === null);
  const localhostCallback = evaluatePaynowDeployment({
    ...productionEnv,
    PAYNOW_RESULT_URL: 'http://localhost:5000/api/paynow/result',
    PAYNOW_RETURN_URL: 'http://localhost:5000/api/paynow/return'
  }, { nodeEnv: 'production', requestHost: 'localhost:5000' });
  record('Production rejects a localhost callback URL',
    !localhostCallback.ok && localhostCallback.issues.includes('result_url_localhost') && localhostCallback.issues.includes('result_url_not_https'));
  const missingMode = evaluatePaynowDeployment({ ...productionEnv, PAYNOW_MODE: '' }, { nodeEnv: 'production', requestHost: 'www.mantisafrica.com' });
  record('Production rejects an unspecified Paynow mode', !missingMode.ok && missingMode.issues.includes('mode_required'));
  const wrongHost = evaluatePaynowDeployment(productionEnv, { nodeEnv: 'production', requestHost: 'staging.example.test' });
  record('Production rejects a callback host that is not this server', !wrongHost.ok && wrongHost.issues.includes('callback_host_mismatch'));
  const azureAlias = evaluatePaynowDeployment({
    ...productionEnv,
    CANONICAL_HOST: 'www.mantisafrica.com',
    REDIRECT_FROM_HOSTS: 'mantisafrica.azurewebsites.net'
  }, { nodeEnv: 'production', requestHost: 'mantisafrica.azurewebsites.net' });
  record('Production accepts the Azure hostname when it redirects to the callback host', azureAlias.ok);
  const localToProduction = evaluatePaynowDeployment({
    ...productionEnv,
    NODE_ENV: 'development',
    PAYNOW_MODE: 'test',
    PAYNOW_MERCHANT_EMAIL: 'merchant@example.test',
    PAYNOW_CALLBACK_HOST: 'www.mantisafrica.com'
  }, { nodeEnv: 'development', requestHost: 'localhost:5000' });
  record('A local server cannot send callbacks to the production host', !localToProduction.ok && localToProduction.issues.includes('callback_host_mismatch'));
  const spoofedHost = evaluatePaynowDeployment({
    ...productionEnv,
    NODE_ENV: 'development',
    PAYNOW_MODE: 'test',
    PAYNOW_MERCHANT_EMAIL: 'merchant@example.test'
  }, { nodeEnv: 'development', requestHost: 'www.mantisafrica.com' });
  record('A spoofed Host header cannot aim a local server at production', !spoofedHost.ok && spoofedHost.issues.includes('callback_host_mismatch'));
  record('Checkout trusts the Host header and ignores X-Forwarded-Host',
    paynowRequestHost({ host: 'localhost:5000', 'x-forwarded-host': 'www.mantisafrica.com' } as { host: string }) === 'localhost:5000');
  const forwardedSpoof = evaluatePaynowDeployment(productionEnv, {
    nodeEnv: 'production',
    requestHost: paynowRequestHost({ host: 'evil.example', 'x-forwarded-host': 'www.mantisafrica.com' } as { host: string })
  });
  record('An untrusted hostname is rejected even when a forwarded host names www',
    forwardedSpoof.issues.includes('callback_host_mismatch') && !forwardedSpoof.ok);
  const testWithoutMerchant = evaluatePaynowDeployment({
    ...productionEnv,
    NODE_ENV: 'development',
    PAYNOW_MODE: 'test',
    PAYNOW_MERCHANT_EMAIL: '',
    PAYNOW_RESULT_URL: 'https://payments.example.test/api/paynow/result',
    PAYNOW_RETURN_URL: 'https://payments.example.test/api/paynow/return',
    PUBLIC_BASE_URL: 'https://payments.example.test'
  }, { nodeEnv: 'development', requestHost: 'payments.example.test' });
  record('Test mode requires the merchant email and does not fall back to live checkout', !testWithoutMerchant.ok && testWithoutMerchant.issues.includes('test_merchant_email_required'));
  const orphan = explainUnreconciledPaynowSession({ found: true, status: 'provider_created', verifiedAuditCount: 0 });
  const absent = explainUnreconciledPaynowSession({ found: false, verifiedAuditCount: 0 });
  record('An unreconciled session is explained without a write', orphan.classification === 'unreconciled' && orphan.writeAllowed === false && absent.classification === 'absent' && absent.writeAllowed === false);

  await mongoose.connect(TEST_DB, { serverSelectionTimeoutMS: 8000, autoIndex: false });
  if (mongoose.connection.name !== 'mantis_paynow_lifecycle_test') {
    console.error('FAIL connected database was not the isolated lifecycle database');
    process.exit(1);
  }
  await mongoose.connection.dropDatabase();
  const { WebhookEventReceipt } = await import('../models/WebhookEventReceipt');
  await Promise.all([
    PaymentSession.syncIndexes(),
    BillingPayment.syncIndexes(),
    WebhookEventReceipt.syncIndexes(),
    AuditLog.syncIndexes()
  ]);
  await Plan.create({ code: 'INDIVIDUAL', name: 'Individual', monthlyPrice: AMOUNT, annualPrice: 200, currency: 'USD', isActive: true });
  await Plan.create({ code: 'INDIVIDUAL', name: 'Individual', monthlyPrice: AMOUNT, annualPrice: 200, currency: 'USD', isActive: true });

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/api/paynow', paynowRoutes);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as { port: number }).port;

  try {
    resetDouble();
    const paid = await world('paid', 'garet.matsi@gmail.com');
    const created = await request(port, 'POST', '/api/paynow/web/create', paid.token, { paymentSessionId: String(paid.session._id), email: 'garet.matsi@gmail.com' });
    const stored = await PaymentSession.findById(paid.session._id);
    const subscription = await Subscription.findById(paid.subscription._id);
    const initiated = await AuditLog.countDocuments({ entityId: String(paid.session._id), action: 'checkout.initiated' });
    record('A Successful initiation stores USD checkout and does not activate',
      created.status === 200
      && created.json.redirectUrl === 'https://www.paynow.co.zw/Interface/Process?guid=lifecycle-test'
      && stored?.status === 'provider_created'
      && stored?.currency === 'USD'
      && stored?.amount === AMOUNT
      && stored?.providerRef === `SUBS-${paid.company._id.toString()}`
      && (stored?.rawProviderResponse as { paynowReference?: string })?.paynowReference === '70000001'
      && subscription?.status === 'past_due'
      && paynowTestDouble.last?.amount === AMOUNT
      && paynowTestDouble.last?.email === 'merchant@example.test'
      && (stored?.metadata as { paynowMode?: string })?.paynowMode === 'test'
      && paynowTestDouble.last?.resultUrl === 'https://payments.example.test/api/paynow/result'
      && paynowTestDouble.last?.integrationId === '90001'
      && initiated === 1,
      `http ${created.status} session ${stored?.status} subscription ${subscription?.status}`);

    resetDouble();
    paynowTestDouble.pollReference = String(stored?.providerRef || '');
    const again = await request(port, 'POST', '/api/paynow/web/create', paid.token, { paymentSessionId: String(paid.session._id) });
    record('A An open checkout is not sent to Paynow a second time', again.status === 200 && paynowTestDouble.sends === 0);

    resetDouble();
    process.env.PAYNOW_MERCHANT_EMAIL = 'merchant@example.test';
    const merchant = await world('merchant-email');
    await request(port, 'POST', '/api/paynow/web/create', merchant.token, { paymentSessionId: String(merchant.session._id), email: 'garet.matsi@gmail.com' });
    record('A Test mode authemail uses the configured merchant login email', paynowTestDouble.last?.email === 'merchant@example.test');
    resetDouble();
    delete process.env.PAYNOW_MERCHANT_EMAIL;
    const missingMerchant = await world('missing-merchant-email');
    const missingMerchantCheckout = await request(port, 'POST', '/api/paynow/web/create', missingMerchant.token, { paymentSessionId: String(missingMerchant.session._id), email: 'buyer@example.test' });
    process.env.PAYNOW_MERCHANT_EMAIL = 'merchant@example.test';
    record('A Test mode without a merchant email does not start a payment',
      missingMerchantCheckout.status === 503
      && missingMerchantCheckout.json.code === 'PAYNOW_TEST_MERCHANT_EMAIL_REQUIRED'
      && paynowTestDouble.sends === 0
      && (await Subscription.findById(missingMerchant.subscription._id))?.status === 'past_due');

    for (const [mode, label] of [
      ['rejected', 'B Rejected initiation does not activate'],
      ['malformed', 'B Malformed initiation does not activate'],
      ['throw-hash', 'B Invalid initiation hash does not activate'],
      ['timeout', 'B Initiation timeout does not activate']
    ] as const) {
      resetDouble();
      paynowTestDouble.mode = mode;
      const row = await world(mode);
      const response = await request(port, 'POST', '/api/paynow/web/create', row.token, { paymentSessionId: String(row.session._id), email: 'buyer@example.test' });
      const current = await Subscription.findById(row.subscription._id);
      const session = await PaymentSession.findById(row.session._id);
      record(label, response.status >= 400 && current?.status === 'past_due' && session?.status === 'pending', `http ${response.status} ${session?.status}`);
    }

    resetDouble();
    const previousKey = process.env.PAYNOW_INTEGRATION_KEY;
    delete process.env.PAYNOW_INTEGRATION_KEY;
    const missingKey = await world('missing-key');
    const missing = await request(port, 'POST', '/api/paynow/web/create', missingKey.token, { paymentSessionId: String(missingKey.session._id) });
    process.env.PAYNOW_INTEGRATION_KEY = previousKey;
    const missingSubscription = await Subscription.findById(missingKey.subscription._id);
    record('B Missing credentials do not activate', missing.status === 503 && missing.json.code === 'PAYNOW_NOT_CONFIGURED' && missingSubscription?.status === 'past_due');

    resetDouble();
    const unauthenticated = await request(port, 'POST', '/api/paynow/web/create', undefined, { paymentSessionId: String(paid.session._id) });
    record('I Unauthenticated checkout is rejected', unauthenticated.status === 401);

    resetDouble();
    paynowTestDouble.pollReference = `SUBS-${paid.company._id.toString()}`;
    paynowTestDouble.pollStatus = 'Paid';
    const notice = statusMessage('Paid', paynowTestDouble.pollReference);
    const first = await request(port, 'POST', '/api/paynow/result', undefined, notice, 'application/x-www-form-urlencoded');
    const second = await request(port, 'POST', '/api/paynow/result', undefined, notice, 'application/x-www-form-urlencoded');
    const paidSession = await PaymentSession.findById(paid.session._id);
    const paidSubscription = await Subscription.findById(paid.subscription._id);
    const paidBilling = await BillingPayment.findById(paid.billing._id);
    const paidCompany = await Company.findById(paid.company._id);
    const verifiedAudits = await AuditLog.countDocuments({ entityId: String(paid.session._id), action: 'payment.verified' });
    record('C Valid notification and poll activate once',
      first.status === 200 && first.json.activated === true && paidSession?.status === 'reconciled' && paidSubscription?.status === 'active' && paidBilling?.status === 'paid' && paidCompany?.onboardingStatus === 'INITIALIZING_WORKSPACE' && verifiedAudits === 1,
      `http ${first.status} session ${paidSession?.status} audits ${verifiedAudits}`);
    record('E Duplicate notification does not activate again',
      second.status === 200 && second.json.status === 'duplicate' && second.json.activated === false && verifiedAudits === 1 && paidBilling?.status === 'paid');

    resetDouble();
    const badHash = await world('bad-hash');
    await request(port, 'POST', '/api/paynow/web/create', badHash.token, { paymentSessionId: String(badHash.session._id) });
    const tampered = statusMessage('Paid', `SUBS-${badHash.company._id.toString()}`).replace(/hash=[^&]+/, 'hash=NOTVALID');
    const rejected = await request(port, 'POST', '/api/paynow/result', undefined, tampered, 'application/x-www-form-urlencoded');
    const badSubscription = await Subscription.findById(badHash.subscription._id);
    record('D Invalid hash is rejected', rejected.status === 401 && badSubscription?.status === 'past_due');

    const missingHash = await request(port, 'POST', '/api/paynow/result', undefined, `reference=SUBS-${badHash.company._id.toString()}&status=Paid&amount=19.00`, 'application/x-www-form-urlencoded');
    record('D Missing hash is rejected', missingHash.status === 401 && badSubscription?.status === 'past_due');

    resetDouble();
    const unknown = await request(port, 'POST', '/api/paynow/result', undefined, statusMessage('Paid', 'SUBS-does-not-exist'), 'application/x-www-form-urlencoded');
    record('D Unknown reference does not activate a subscription', unknown.status === 200 && unknown.json.activated !== true && await Subscription.countDocuments({ status: 'active' }) === 1);

    resetDouble();
    const other = await world('other-company');
    const foreign = await request(port, 'POST', '/api/paynow/confirm', other.token, { reference: `SUBS-${paid.company._id.toString()}` });
    const otherSubscription = await Subscription.findById(other.subscription._id);
    record('I Another company cannot confirm this payment', foreign.status === 404 && otherSubscription?.status === 'past_due');
    const anonymousConfirm = await request(port, 'POST', '/api/paynow/confirm', undefined, { reference: `SUBS-${paid.company._id.toString()}` });
    record('I Unauthenticated confirm is rejected', anonymousConfirm.status === 401);

    resetDouble();
    const pending = await world('pending');
    await request(port, 'POST', '/api/paynow/web/create', pending.token, { paymentSessionId: String(pending.session._id) });
    paynowTestDouble.pollStatus = 'Sent';
    paynowTestDouble.pollReference = `SUBS-${pending.company._id.toString()}`;
    const pendingNotice = await request(port, 'POST', '/api/paynow/result', undefined, statusMessage('Paid', paynowTestDouble.pollReference), 'application/x-www-form-urlencoded');
    const pendingSubscription = await Subscription.findById(pending.subscription._id);
    const pendingSession = await PaymentSession.findById(pending.session._id);
    record('G Pending poll does not activate even when the notice says Paid', pendingNotice.status === 200 && pendingNotice.json.activated !== true && pendingSubscription?.status === 'past_due' && pendingSession?.status === 'provider_created');

    const returned = await request(port, 'GET', `/api/paynow/return?reference=SUBS-${pending.company._id.toString()}`, undefined);
    const afterReturn = await Subscription.findById(pending.subscription._id);
    record('F Browser return does not activate a pending payment', returned.status === 302 && returned.location.includes('/billing/return') && afterReturn?.status === 'past_due');

    resetDouble();
    const low = await world('low-amount');
    await request(port, 'POST', '/api/paynow/web/create', low.token, { paymentSessionId: String(low.session._id) });
    paynowTestDouble.pollReference = `SUBS-${low.company._id.toString()}`;
    paynowTestDouble.pollStatus = 'Paid';
    paynowTestDouble.pollAmount = '1.00';
    const lowNotice = await request(port, 'POST', '/api/paynow/result', undefined, statusMessage('Paid', paynowTestDouble.pollReference, '1.00'), 'application/x-www-form-urlencoded');
    const lowSubscription = await Subscription.findById(low.subscription._id);
    record('H Lower amount is rejected', lowNotice.status === 200 && lowNotice.json.status === 'ignored' && lowSubscription?.status === 'past_due');

    resetDouble();
    const high = await world('high-amount');
    await request(port, 'POST', '/api/paynow/web/create', high.token, { paymentSessionId: String(high.session._id) });
    paynowTestDouble.pollReference = `SUBS-${high.company._id.toString()}`;
    paynowTestDouble.pollStatus = 'Paid';
    paynowTestDouble.pollAmount = '250.00';
    const highNotice = await request(port, 'POST', '/api/paynow/result', undefined, statusMessage('Paid', paynowTestDouble.pollReference, '250.00'), 'application/x-www-form-urlencoded');
    record('H Higher amount is rejected', highNotice.json.status === 'ignored' && (await Subscription.findById(high.subscription._id))?.status === 'past_due');

    resetDouble();
    const wrongCurrency = await world('wrong-currency');
    await request(port, 'POST', '/api/paynow/web/create', wrongCurrency.token, { paymentSessionId: String(wrongCurrency.session._id) });
    paynowTestDouble.pollReference = `SUBS-${wrongCurrency.company._id.toString()}`;
    paynowTestDouble.pollStatus = 'Paid';
    paynowTestDouble.pollCurrency = 'ZWL';
    const currencyNotice = await request(port, 'POST', '/api/paynow/result', undefined, statusMessage('Paid', paynowTestDouble.pollReference, AMOUNT.toFixed(2), 'ZWL'), 'application/x-www-form-urlencoded');
    record('H Wrong currency is rejected', currencyNotice.json.status === 'ignored' && (await Subscription.findById(wrongCurrency.subscription._id))?.status === 'past_due');

    resetDouble();
    const noCurrency = await world('no-currency');
    await request(port, 'POST', '/api/paynow/web/create', noCurrency.token, { paymentSessionId: String(noCurrency.session._id) });
    paynowTestDouble.pollReference = `SUBS-${noCurrency.company._id.toString()}`;
    paynowTestDouble.pollStatus = 'Paid';
    const noCurrencyNotice = await request(port, 'POST', '/api/paynow/result', undefined, statusMessage('Paid', paynowTestDouble.pollReference), 'application/x-www-form-urlencoded');
    record('H Missing currency is accepted because Paynow status updates omit it', noCurrencyNotice.json.activated === true && (await Subscription.findById(noCurrency.subscription._id))?.status === 'active');

    resetDouble();
    const cancelled = await world('cancelled');
    await request(port, 'POST', '/api/paynow/web/create', cancelled.token, { paymentSessionId: String(cancelled.session._id) });
    paynowTestDouble.pollReference = `SUBS-${cancelled.company._id.toString()}`;
    paynowTestDouble.pollStatus = 'Cancelled';
    const cancelledNotice = await request(port, 'POST', '/api/paynow/result', undefined, statusMessage('Cancelled', paynowTestDouble.pollReference), 'application/x-www-form-urlencoded');
    const cancelledSession = await PaymentSession.findById(cancelled.session._id);
    record('G Cancelled poll does not activate', cancelledNotice.json.activated !== true && cancelledSession?.status === 'cancelled' && (await Subscription.findById(cancelled.subscription._id))?.status === 'past_due');

    resetDouble();
    const failed = await world('failed');
    await request(port, 'POST', '/api/paynow/web/create', failed.token, { paymentSessionId: String(failed.session._id) });
    paynowTestDouble.pollReference = `SUBS-${failed.company._id.toString()}`;
    paynowTestDouble.pollFault = 'bad-hash';
    const failedPoll = await request(port, 'POST', '/api/paynow/confirm', failed.token, { reference: paynowTestDouble.pollReference });
    record('G Invalid poll hash does not activate', failedPoll.status === 500 && (await Subscription.findById(failed.subscription._id))?.status === 'past_due');

    resetDouble();
    paynowTestDouble.pollReference = `SUBS-${failed.company._id.toString()}`;
    paynowTestDouble.pollFault = 'timeout';
    const timedOut = await request(port, 'POST', '/api/paynow/confirm', failed.token, { reference: paynowTestDouble.pollReference });
    record('G Poll timeout does not activate', timedOut.status === 500 && (await Subscription.findById(failed.subscription._id))?.status === 'past_due');

    resetDouble();
    paynowTestDouble.pollReference = `SUBS-${failed.company._id.toString()}`;
    paynowTestDouble.pollFault = 'down';
    const down = await request(port, 'POST', '/api/paynow/confirm', failed.token, { reference: paynowTestDouble.pollReference });
    record('G Unavailable poll endpoint does not activate', down.status === 500 && (await Subscription.findById(failed.subscription._id))?.status === 'past_due');

    resetDouble();
    paynowTestDouble.pollReference = `SUBS-${failed.company._id.toString()}`;
    paynowTestDouble.pollFault = 'malformed';
    const malformed = await request(port, 'POST', '/api/paynow/confirm', failed.token, { reference: paynowTestDouble.pollReference });
    record('G Malformed poll does not activate', malformed.status === 500 && (await Subscription.findById(failed.subscription._id))?.status === 'past_due');

    const outside = paynowTestDouble.urls.filter((url) => { try { return new URL(url).host !== 'www.paynow.co.zw'; } catch { return true; } });
    resetDouble();
    const wrongHostCheckout = await world('wrong-host');
    delete process.env.PAYNOW_CALLBACK_HOST;
    const rejectedHost = await request(port, 'POST', '/api/paynow/web/create', wrongHostCheckout.token, { paymentSessionId: String(wrongHostCheckout.session._id) }, 'application/json', 'localhost:5000');
    process.env.PAYNOW_CALLBACK_HOST = 'payments.example.test';
    record('A checkout from this server is rejected when the callback host differs',
      rejectedHost.status === 503
      && rejectedHost.json.code === 'PAYNOW_CALLBACK_URL_REJECTED'
      && rejectedHost.json.issue === 'callback_host_mismatch'
      && paynowTestDouble.sends === 0
      && (await PaymentSession.findById(wrongHostCheckout.session._id))?.status === 'pending');

    resetDouble();
    const modeMismatch = await world('mode-mismatch');
    await request(port, 'POST', '/api/paynow/web/create', modeMismatch.token, { paymentSessionId: String(modeMismatch.session._id) });
    paynowTestDouble.pollStatus = 'Paid';
    paynowTestDouble.pollReference = `SUBS-${modeMismatch.company._id.toString()}`;
    process.env.PAYNOW_MODE = 'live';
    const blockedNotice = statusMessage('Paid', paynowTestDouble.pollReference);
    const blocked = await request(port, 'POST', '/api/paynow/result', undefined, blockedNotice, 'application/x-www-form-urlencoded');
    const blockedSubscription = await Subscription.findById(modeMismatch.subscription._id);
    record('A test checkout is not activated while the server is in live mode',
      blocked.status === 200 && blocked.json.activated !== true && blockedSubscription?.status === 'past_due' && (await PaymentSession.findById(modeMismatch.session._id))?.status === 'provider_created');
    process.env.PAYNOW_MODE = 'test';
    const retried = await request(port, 'POST', '/api/paynow/result', undefined, blockedNotice, 'application/x-www-form-urlencoded');
    const retriedAudits = await AuditLog.countDocuments({ entityId: String(modeMismatch.session._id), action: 'payment.verified' });
    record('A failed callback can be retried once the mode matches',
      retried.json.activated === true && retriedAudits === 1 && (await Subscription.findById(modeMismatch.subscription._id))?.status === 'active');
    const retriedAgain = await request(port, 'POST', '/api/paynow/result', undefined, blockedNotice, 'application/x-www-form-urlencoded');
    record('The retried callback does not activate the subscription again',
      retriedAgain.json.status === 'duplicate' && retriedAgain.json.activated === false && await AuditLog.countDocuments({ entityId: String(modeMismatch.session._id), action: 'payment.verified' }) === 1);

    record('J Tests stayed on the isolated database and the Paynow stand-in',
      mongoose.connection.name === 'mantis_paynow_lifecycle_test'
      && paynowConfigurationState().mode === 'test'
      && process.env.PAYNOW_INTEGRATION_KEY === KEY
      && outside.length === 0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await mongoose.disconnect();
  }

  const failed = checks.filter((check) => !check.ok);
  console.log(`${checks.length - failed.length}/${checks.length} Paynow lifecycle checks passed`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(String(error?.stack || error?.message || error).slice(0, 2000));
  process.exit(1);
});
