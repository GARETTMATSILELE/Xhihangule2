/**
 * Signup gate tests. They do not connect to MongoDB, call Paynow, or create a company.
 */
import http from 'http';
import express from 'express';
import mongoose from 'mongoose';
import onboardingRoutes from '../routes/onboardingRoutes';
import { errorHandler } from '../middleware/errorHandler';
import { publicSignupDecision } from '../utils/publicSignupCompany';
import { paynowModeMatchesSession, resolvePublicRegistration } from '../services/registrationPaymentPolicy';

const checks: { name: string; ok: boolean; detail: string }[] = [];

function record(name: string, ok: boolean, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function request(port: number, method: string, path: string, body?: unknown): Promise<{ status: number; json: any; text: string }> {
  const payload = body === undefined ? '' : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      method,
      path,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json: any = {};
        try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
        resolve({ status: res.statusCode || 0, json, text });
      });
    });
    req.on('error', reject);
    req.end(payload);
  });
}

async function main() {
  mongoose.set('bufferCommands', false);
  const closed = publicSignupDecision({ NODE_ENV: 'production' } as NodeJS.ProcessEnv);
  record('Signup disabled in production when the flag is missing', closed.signupEnabled === false && closed.code === 'SIGNUP_DISABLED');
  const opened = publicSignupDecision({ NODE_ENV: 'production', ALLOW_PUBLIC_SIGNUP: 'true' } as NodeJS.ProcessEnv);
  record('Signup enabled only when production explicitly allows it', opened.signupEnabled === true && opened.emailAllowed === true);
  const allowlistAlone = publicSignupDecision({ NODE_ENV: 'production', SIGNUP_EMAIL_ALLOWLIST: 'owner@example.com' } as NodeJS.ProcessEnv, 'owner@example.com');
  record('An allowlist does not open production signup by itself', allowlistAlone.signupEnabled === false && allowlistAlone.code === 'SIGNUP_DISABLED');
  const invalidAllowlist = publicSignupDecision({ NODE_ENV: 'production', ALLOW_PUBLIC_SIGNUP: 'true', SIGNUP_EMAIL_ALLOWLIST: 'not-an-email' } as NodeJS.ProcessEnv, 'owner@example.com');
  record('An invalid allowlist does not become unrestricted signup', invalidAllowlist.emailAllowed === false && invalidAllowlist.code === 'SIGNUP_NOT_INVITED');
  const explicitOpen = publicSignupDecision({ NODE_ENV: 'production', ALLOW_PUBLIC_SIGNUP: 'true', SIGNUP_EMAIL_ALLOWLIST: '' } as NodeJS.ProcessEnv, 'owner@example.com');
  record('Unrestricted signup requires the explicit public-signup flag and a blank allowlist', explicitOpen.signupEnabled === true && explicitOpen.allowlistRestricted === false && explicitOpen.emailAllowed === true);
  const invited = publicSignupDecision({ NODE_ENV: 'production', ALLOW_PUBLIC_SIGNUP: 'true', SIGNUP_EMAIL_ALLOWLIST: 'Owner@Example.com' } as NodeJS.ProcessEnv, 'owner@example.com');
  const stranger = publicSignupDecision({ NODE_ENV: 'production', ALLOW_PUBLIC_SIGNUP: 'true', SIGNUP_EMAIL_ALLOWLIST: 'owner@example.com' } as NodeJS.ProcessEnv, 'other@example.com');
  record('The allowlist accepts only the authorised email', invited.emailAllowed === true && stranger.code === 'SIGNUP_NOT_INVITED');
  record('Development signup remains available', publicSignupDecision({ NODE_ENV: 'development' } as NodeJS.ProcessEnv).signupEnabled === true);

  const paid = resolvePublicRegistration({ plan: 'INDIVIDUAL', registrationMode: 'paid', billingCycle: 'monthly' });
  const trial = resolvePublicRegistration({ plan: 'SME', registrationMode: 'trial', billingCycle: 'yearly' });
  record('Paid registration keeps payment required and ignores a client-selected plan price',
    paid.ok === true && paid.paymentRequired === true && paid.plan === 'INDIVIDUAL' && paid.billingCycle === 'monthly');
  record('Trial registration does not require payment and stays on the Individual plan',
    trial.ok === true && trial.paymentRequired === false && trial.plan === 'INDIVIDUAL');
  record('A test checkout does not match a live server', paynowModeMatchesSession('test', { PAYNOW_MODE: 'live', PAYNOW_INTEGRATION_ID: '90001', PAYNOW_INTEGRATION_KEY: 'signup-test-key' } as NodeJS.ProcessEnv) === false);

  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    ALLOW_PUBLIC_SIGNUP: process.env.ALLOW_PUBLIC_SIGNUP,
    SIGNUP_EMAIL_ALLOWLIST: process.env.SIGNUP_EMAIL_ALLOWLIST
  };
  const app = express();
  app.use(express.json());
  app.use('/api/onboarding', onboardingRoutes);
  app.use(errorHandler);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as { port: number }).port;

  try {
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_PUBLIC_SIGNUP;
    delete process.env.SIGNUP_EMAIL_ALLOWLIST;
    const hidden = await request(port, 'GET', '/api/onboarding/availability');
    const rejected = await request(port, 'POST', '/api/onboarding/start', { email: 'owner@example.com', password: 'Secret123', name: 'Owner' });
    record('The availability endpoint and registration route agree that signup is closed',
      hidden.status === 200 && hidden.json.signupEnabled === false && hidden.json.onboardingEnabled === true && hidden.json.paidRegistrationRequiresPayment === true
      && !('database' in hidden.json) && !('checkout' in hidden.json) && !/mongodb|allowlist@|SIGNUP_EMAIL/i.test(hidden.text)
      && rejected.status === 403 && rejected.json.code === 'SIGNUP_DISABLED' && !rejected.text.includes('mongodb'));

    process.env.ALLOW_PUBLIC_SIGNUP = 'true';
    process.env.SIGNUP_EMAIL_ALLOWLIST = 'owner@example.com';
    const visible = await request(port, 'GET', '/api/onboarding/availability');
    const blocked = await request(port, 'POST', '/api/onboarding/start', { email: 'other@example.com', password: 'Secret123', name: 'Other', company: { name: 'Other Co' } });
    record('An open allowlist still rejects an unauthorised email before creating records',
      visible.json.signupEnabled === true && visible.json.allowlistRestricted === true && !JSON.stringify(visible.json).includes('owner@example.com')
      && blocked.status === 403 && blocked.json.code === 'SIGNUP_NOT_INVITED');

    if (mongoose.connection.readyState !== 0) {
      record('A database failure does not expose a connection string', false, 'refused to continue because a database was already connected');
    } else {
    const databaseDown = await request(port, 'POST', '/api/onboarding/start', {
      email: 'owner@example.com',
      password: 'Secret123',
      name: 'Owner',
      plan: 'INDIVIDUAL',
      registrationMode: 'paid',
      billingCycle: 'monthly',
      company: { name: 'Owner Co', country: 'Zimbabwe', companyType: 'INDIVIDUAL_LANDLORD' }
    });
    record('A database failure does not expose a connection string',
      databaseDown.status === 500 && databaseDown.json.code === 'INTERNAL_SERVER_ERROR' && databaseDown.json.message === 'Something went wrong' && !/mongodb:\/\/|AccountKey|stack/i.test(databaseDown.text));
    }
  } finally {
    process.env.NODE_ENV = previous.NODE_ENV;
    if (previous.ALLOW_PUBLIC_SIGNUP === undefined) delete process.env.ALLOW_PUBLIC_SIGNUP;
    else process.env.ALLOW_PUBLIC_SIGNUP = previous.ALLOW_PUBLIC_SIGNUP;
    if (previous.SIGNUP_EMAIL_ALLOWLIST === undefined) delete process.env.SIGNUP_EMAIL_ALLOWLIST;
    else process.env.SIGNUP_EMAIL_ALLOWLIST = previous.SIGNUP_EMAIL_ALLOWLIST;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  const failed = checks.filter((check) => !check.ok);
  console.log(`${checks.length - failed.length}/${checks.length} signup availability checks passed`);
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error(String((error as { message?: string })?.message || error).slice(0, 200));
  process.exit(1);
});
