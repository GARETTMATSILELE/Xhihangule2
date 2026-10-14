/**
 * Focused checks for the first-adoption security remediation.
 * HTTP and payment fixtures are disposable and deleted afterwards.
 * Skips database writes when NODE_ENV=production.
 */
import dotenv from 'dotenv';
import http from 'http';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

dotenv.config();

import { productionStartupProblems } from '../config/productionConfig';
import { systemAdminBootstrapDecision } from '../services/systemAdminBootstrap';
import { isPublicSignupAllowed } from '../utils/publicSignupCompany';
import { errorHandler } from '../middleware/errorHandler';
import { classifyPaymentReferenceGroup } from '../services/paymentReferenceDiagnostics';
import fs from 'fs';
import path from 'path';

const checks: { name: string; ok: boolean; detail: string }[] = [];

function record(name: string, ok: boolean, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function tokenFor(user: { _id: any; role: string; roles?: string[]; companyId?: any }) {
  const { JWT_CONFIG } = require('../config/jwt') as typeof import('../config/jwt');
  return jwt.sign({
    userId: String(user._id),
    role: user.role,
    roles: user.roles,
    sessionVersion: 1,
    companyId: user.companyId ? String(user.companyId) : undefined,
    type: 'access',
  }, JWT_CONFIG.SECRET, {
    expiresIn: '2h',
    issuer: JWT_CONFIG.ISSUER,
    audience: JWT_CONFIG.AUDIENCE,
  });
}

function request(port: number, method: string, requestPath: string, token: string, body?: unknown): Promise<{ status: number; json: any }> {
  const payload = body === undefined ? '' : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      method,
      path: requestPath,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
      timeout: 20000,
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

function runStaticChecks() {
  const present = productionStartupProblems({
    NODE_ENV: 'production',
    JWT_SECRET: 'x'.repeat(32),
    JWT_REFRESH_SECRET: 'y'.repeat(32),
    MONGODB_URI: 'mongodb://127.0.0.1:27017/property-management',
  } as NodeJS.ProcessEnv);
  record('Production config accepts complete secrets', present.length === 0);

  const missingJwt = productionStartupProblems({
    NODE_ENV: 'production',
    JWT_REFRESH_SECRET: 'y'.repeat(32),
    MONGODB_URI: 'mongodb://127.0.0.1:27017/property-management',
  } as NodeJS.ProcessEnv);
  record('Production config rejects a missing JWT_SECRET', missingJwt.length === 1 && missingJwt[0].startsWith('JWT_SECRET') && !missingJwt.join(' ').includes('mongodb'));

  const missingRefresh = productionStartupProblems({
    NODE_ENV: 'production',
    JWT_SECRET: 'x'.repeat(32),
    MONGODB_URI: 'mongodb://127.0.0.1:27017/property-management',
  } as NodeJS.ProcessEnv);
  record('Production config rejects a missing JWT_REFRESH_SECRET', missingRefresh.length === 1 && missingRefresh[0].startsWith('JWT_REFRESH_SECRET'));

  const missingDb = productionStartupProblems({
    NODE_ENV: 'production',
    JWT_SECRET: 'x'.repeat(32),
    JWT_REFRESH_SECRET: 'y'.repeat(32),
    MONGODB_URI: '   ',
  } as NodeJS.ProcessEnv);
  record('Production config rejects a missing MONGODB_URI', missingDb.includes('MONGODB_URI'));

  const weak = productionStartupProblems({
    NODE_ENV: 'production',
    JWT_SECRET: 'too-short',
    JWT_REFRESH_SECRET: 'also-short',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/property-management',
  } as NodeJS.ProcessEnv);
  record('Production config rejects secrets shorter than 32 characters', weak.includes('JWT_SECRET (min 32 chars)') && weak.includes('JWT_REFRESH_SECRET (min 32 chars)'));

  record('Development config does not require production secrets', productionStartupProblems({ NODE_ENV: 'development' } as NodeJS.ProcessEnv).length === 0);
  record('Production ignores administrator bootstrap even when the flag is set', systemAdminBootstrapDecision({
    NODE_ENV: 'production',
    ALLOW_SYSTEM_ADMIN_BOOTSTRAP: 'true',
    SYSTEM_ADMIN_BOOTSTRAP_EMAIL: 'admin@example.test',
    SYSTEM_ADMIN_BOOTSTRAP_PASSWORD: 'a-long-test-password',
  } as NodeJS.ProcessEnv).action === 'skip');
  record('Production signup stays closed unless explicitly allowed', isPublicSignupAllowed({ NODE_ENV: 'production' } as NodeJS.ProcessEnv) === false
    && isPublicSignupAllowed({ NODE_ENV: 'production', ALLOW_PUBLIC_SIGNUP: 'true' } as NodeJS.ProcessEnv) === true);
  record('Development signup remains available for local onboarding', isPublicSignupAllowed({ NODE_ENV: 'development' } as NodeJS.ProcessEnv) === true);

  const accountingRoutes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'accountingRoutes.ts'), 'utf8');
  record('Tax receipt uploads stay limited to PDF and images',
    accountingRoutes.includes("allowedTypes = ['application/pdf', 'image/jpeg', 'image/png']")
    && accountingRoutes.includes("allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png']"));

  const paymentModel = fs.readFileSync(path.join(__dirname, '..', 'models', 'Payment.ts'), 'utf8');
  record('Payment references are still declared unique per company',
    paymentModel.includes('companyId: 1, referenceNumber: 1') && paymentModel.includes('unique: true'));
  record('Same amount, type, and day is classified as a possible duplicate',
    classifyPaymentReferenceGroup([
      { amount: 20, paymentType: 'sale', paymentDate: '2026-01-01' },
      { amount: 20, paymentType: 'sale', paymentDate: '2026-01-01' },
    ]) === 'possible_duplicate');
  record('Different amounts sharing a reference are classified as separate transactions',
    classifyPaymentReferenceGroup([
      { amount: 20, paymentType: 'sale', paymentDate: '2026-01-01' },
      { amount: 40, paymentType: 'sale', paymentDate: '2026-01-02' },
    ]) === 'separate_transactions_sharing_a_reference');
}

function paymentDraft(companyId: mongoose.Types.ObjectId, agentId: mongoose.Types.ObjectId, referenceNumber: string, amount: number) {
  return {
    paymentType: 'sale' as const,
    propertyType: 'residential' as const,
    propertyId: new mongoose.Types.ObjectId(),
    agentId,
    companyId,
    paymentDate: new Date('2026-02-01T00:00:00.000Z'),
    paymentMethod: 'cash' as const,
    amount,
    referenceNumber,
    processedBy: agentId,
    commissionDetails: {
      totalCommission: 0,
      preaFee: 0,
      agentShare: 0,
      agencyShare: 0,
      ownerAmount: amount,
    },
    status: 'pending' as const,
    currency: 'USD' as const,
  };
}

async function runDatabaseChecks() {
  if (process.env.NODE_ENV === 'production') {
    record('Database security checks were not run against production', true, 'NODE_ENV=production');
    return;
  }

  const { connectDatabase, closeDatabase } = await import('../config/database');
  const { Company } = await import('../models/Company');
  const { User } = await import('../models/User');
  const { Subscription } = await import('../models/Subscription');
  const { Payment } = await import('../models/Payment');
  const { PaymentSession } = await import('../models/PaymentSession');
  const { activateSubscriptionFromPayment } = await import('../services/billingActivationService');
  const { PLAN_CONFIG } = await import('../types/plan');
  const companyRoutes = (await import('../routes/companyRoutes')).default;
  const billingRoutes = (await import('../routes/billingRoutes')).default;

  await connectDatabase();
  const app = express();
  app.use(express.json());
  app.use('/api/companies', companyRoutes);
  app.use('/api/billing', billingRoutes);
  app.use(errorHandler);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as any).port as number;

  const stamp = `SECREMED${Date.now().toString().slice(-8)}`;
  const createdUserIds: mongoose.Types.ObjectId[] = [];
  const createdCompanyIds: mongoose.Types.ObjectId[] = [];
  const createdPaymentIds: mongoose.Types.ObjectId[] = [];
  const createdSubscriptionIds: mongoose.Types.ObjectId[] = [];
  const createdSessionIds: mongoose.Types.ObjectId[] = [];

  try {
    const owner = await User.create({
      email: `${stamp}-owner@example.test`,
      password: 'Security-Remediation-1',
      firstName: 'Owner',
      lastName: 'Test',
      role: 'admin',
      roles: ['admin'],
      isActive: true,
    });
    createdUserIds.push(owner._id);
    const company = await Company.create({
      name: `${stamp} Agency`,
      address: '1 Test Street',
      phone: '0770000000',
      email: `${stamp}@example.test`,
      registrationNumber: `${stamp}-REG`,
      tinNumber: `${stamp}-TIN`,
      ownerId: owner._id,
      workspaceType: 'individual',
      plan: 'INDIVIDUAL',
      propertyLimit: PLAN_CONFIG.INDIVIDUAL.propertyLimit,
      featureFlags: PLAN_CONFIG.INDIVIDUAL.featureFlags,
      subscriptionStatus: 'trial',
      tenantStatus: 'active',
      isActive: true,
    });
    const other = await Company.create({
      name: `${stamp} Other`,
      address: '2 Test Street',
      phone: '0770000001',
      email: `${stamp}-other@example.test`,
      registrationNumber: `${stamp}-REG2`,
      tinNumber: `${stamp}-TIN2`,
      ownerId: owner._id,
      workspaceType: 'individual',
      plan: 'INDIVIDUAL',
      propertyLimit: PLAN_CONFIG.INDIVIDUAL.propertyLimit,
      featureFlags: PLAN_CONFIG.INDIVIDUAL.featureFlags,
      subscriptionStatus: 'trial',
      tenantStatus: 'active',
      isActive: true,
    });
    createdCompanyIds.push(company._id, other._id);
    owner.companyId = company._id;
    await owner.save();

    const subscription = await Subscription.create({
      companyId: company._id,
      userId: owner._id,
      plan: 'INDIVIDUAL',
      cycle: 'monthly',
      status: 'trial',
    });
    createdSubscriptionIds.push(subscription._id);
    const token = tokenFor(owner);

    const profile = await request(port, 'PUT', '/api/companies/current', token, {
      name: `${stamp} Renamed`,
      phone: '0770000099',
      plan: 'ENTERPRISE',
      propertyLimit: 9999,
      featureFlags: { ...PLAN_CONFIG.ENTERPRISE.featureFlags, onlinePaymentsEnabled: true },
      subscriptionStatus: 'active',
    });
    const saved = await Company.findById(company._id).lean();
    record('Company profile updates still save', profile.status === 200 && saved?.name === `${stamp} Renamed` && saved?.phone === '0770000099');
    record('Company profile updates cannot grant an enterprise plan',
      saved?.plan === 'INDIVIDUAL'
      && saved?.propertyLimit === PLAN_CONFIG.INDIVIDUAL.propertyLimit
      && (saved as any)?.featureFlags?.commissionEnabled === false
      && (saved as any)?.subscriptionStatus === 'trial');

    const directPlan = await request(port, 'PUT', `/api/companies/${company._id}/plan`, token, { plan: 'ENTERPRISE' });
    const afterDirect = await Company.findById(company._id).select('plan').lean();
    record('Direct plan route rejects entitlement changes', directPlan.status === 403 && directPlan.json?.code === 'PLAN_CHANGE_REQUIRES_BILLING' && afterDirect?.plan === 'INDIVIDUAL');

    const samePlan = await request(port, 'POST', '/api/billing/subscriptions/change-plan', token, { plan: 'INDIVIDUAL', cycle: 'monthly' });
    const changedPlan = await request(port, 'POST', '/api/billing/subscriptions/change-plan', token, { plan: 'ENTERPRISE', cycle: 'yearly' });
    const subscriptionAfter = await Subscription.findById(subscription._id).lean();
    record('Repeating the current subscription plan is accepted', samePlan.status === 200 && samePlan.json?.unchanged === true);
    record('A company user cannot change the subscription plan', changedPlan.status === 403 && subscriptionAfter?.plan === 'INDIVIDUAL' && subscriptionAfter?.cycle === 'monthly');

    const session = await PaymentSession.create({
      companyId: company._id,
      userId: owner._id,
      idempotencyKey: `${stamp}-session`,
      provider: 'manual',
      providerRef: `${stamp}-ref`,
      plan: 'SME',
      billingCycle: 'monthly',
      amount: 1,
      currency: 'USD',
      status: 'pending',
    });
    createdSessionIds.push(session._id);
    const activation = await activateSubscriptionFromPayment({
      paymentSessionId: String(session._id),
      provider: 'manual',
      providerRef: `${stamp}-ref`,
    });
    const activated = await Subscription.findOne({ companyId: company._id }).lean();
    const companyAfterBilling = await Company.findById(company._id).select('plan tenantStatus subscriptionStatus featureFlags').lean();
    record('Verified billing activation still updates the subscription',
      activation.alreadyProcessed === false
      && activated?.plan === 'SME'
      && activated?.status === 'active'
      && companyAfterBilling?.tenantStatus === 'active'
      && companyAfterBilling?.subscriptionStatus === 'active');
    record('Billing activation does not depend on the profile plan field', companyAfterBilling?.plan === 'INDIVIDUAL' && (companyAfterBilling as any)?.featureFlags?.commissionEnabled === false);
    if (activated?._id && String(activated._id) !== String(subscription._id)) {
      createdSubscriptionIds.push(activated._id as mongoose.Types.ObjectId);
    }

    const first = await Payment.create(paymentDraft(company._id, owner._id, `${stamp}-REF-A`, 25));
    const second = await Payment.create(paymentDraft(company._id, owner._id, `${stamp}-REF-B`, 40));
    const otherCompany = await Payment.create(paymentDraft(other._id, owner._id, `${stamp}-REF-A`, 25));
    const blankA = await Payment.create(paymentDraft(company._id, owner._id, '', 5));
    const blankB = await Payment.create(paymentDraft(company._id, owner._id, '', 6));
    const repeated = await Payment.create(paymentDraft(company._id, owner._id, `${stamp}-REF-A`, 30));
    createdPaymentIds.push(first._id, second._id, otherCompany._id, blankA._id, blankB._id, repeated._id);
    const sameReferenceCount = await Payment.countDocuments({ companyId: company._id, referenceNumber: `${stamp}-REF-A` });
    record('Independent payment references are accepted', Boolean(first._id && second._id && otherCompany._id && blankA._id && blankB._id));
    record('A repeated reference is not rejected while historical collisions block the unique index', sameReferenceCount === 2);
  } finally {
    if (createdPaymentIds.length) await Payment.deleteMany({ _id: { $in: createdPaymentIds } });
    if (createdSessionIds.length) await PaymentSession.deleteMany({ _id: { $in: createdSessionIds } });
    if (createdSubscriptionIds.length) await Subscription.deleteMany({ _id: { $in: createdSubscriptionIds } });
    await Subscription.deleteMany({ companyId: { $in: createdCompanyIds } });
    if (createdCompanyIds.length) await Company.deleteMany({ _id: { $in: createdCompanyIds } });
    if (createdUserIds.length) await User.deleteMany({ _id: { $in: createdUserIds } });
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await closeDatabase();
  }
}

async function main() {
  runStaticChecks();
  try {
    await runDatabaseChecks();
  } catch (error) {
    record('Database security checks completed', false, error instanceof Error ? error.message : 'unknown error');
  }
  const failed = checks.filter((check) => !check.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main();
