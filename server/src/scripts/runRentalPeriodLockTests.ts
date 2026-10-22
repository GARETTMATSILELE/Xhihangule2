/**
 * Rental-period lock ownership, stable keys, and controller concurrency.
 * Disposable local MongoDB only. Email uses an in-memory sender.
 */
import mongoose from 'mongoose';
import { Company } from '../models/Company';
import { User } from '../models/User';
import { Property } from '../models/Property';
import { Tenant } from '../models/Tenant';
import { Lease } from '../models/Lease';
import { Payment } from '../models/Payment';
import { PropertyOwner } from '../models/PropertyOwner';
import { OwnerRentNotice } from '../models/OwnerRentNotice';
import { EventDedupRecord } from '../models/EventDedupRecord';
import { JournalEntry } from '../models/JournalEntry';
import { accountingConnection } from '../config/database';
import { createPayment, createPaymentAccountant, createPaymentPublic } from '../controllers/paymentController';
import { createAgentPayment } from '../controllers/agentController';
import { AppError } from '../middleware/errorHandler';
import {
  RENTAL_GUARD_DEFAULTS,
  RENTAL_PERIOD_GUARD_SCOPE,
  acquireRentalPeriodGuard,
  acquireRentalPeriodGuards,
  enumerateRentalMonths,
  rentalPeriodGuardKeys,
  sumRentCoverageForPeriod,
  withRentalPeriodGuards,
} from '../services/rentalPeriodCoverage';
import { notifyOwnerOfRentReversal } from '../services/ownerRentNotificationService';

const DB = process.env.RENTAL_LOCK_DB || 'mongodb://127.0.0.1:27017/mantis_rental_lock_test';
const ACCOUNTING_DB = process.env.RENTAL_LOCK_ACCOUNTING_DB || 'mongodb://127.0.0.1:27017/mantis_rental_lock_accounting';
const failures: string[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) failures.push(message);
}

function stage(message: string) {
  console.error(`[lock] ${message}`);
}

function assertDisposable(uri: string) {
  const parsed = new URL(uri);
  const host = parsed.hostname.toLowerCase();
  const name = parsed.pathname.replace(/^\//, '').toLowerCase();
  if (host !== '127.0.0.1' && host !== 'localhost') throw new Error(`Refusing lock tests: host is not local (${host})`);
  if (!name || /prod|cosmos|azure|live/.test(name)) throw new Error('Refusing lock tests: database name is not disposable');
}

function blankEmailProviders() {
  for (const key of [
    'SMTP_HOST', 'SMTP_HOST_MANTIS', 'SMTP_USER', 'SMTP_USER_MANTIS', 'SMTP_PASS', 'SMTP_PASS_MANTIS',
    'RESEND_API_KEY', 'RESEND_API_KEY_MANTIS', 'SENDGRID_API_KEY', 'SENDGRID_API_KEY_MANTIS',
    'MAILGUN_API_KEY', 'MAILGUN_API_KEY_MANTIS', 'MAILGUN_DOMAIN', 'MAILGUN_DOMAIN_MANTIS',
    'MAILTRAP_API_TOKEN', 'MAILTRAP_API_TOKEN_MANTIS', 'EMAIL_STRICT', 'EMAIL_REQUIRE_PROVIDER',
  ]) delete process.env[key];
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function invoke(handler: any, req: any) {
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) { this.statusCode = code; return this; },
    json(body: any) { this.body = body; return this; },
  };
  await handler(req, res);
  return res;
}

function runPureKeys() {
  assert(RENTAL_GUARD_DEFAULTS.leaseMs > 30_000, 'lease outlives the old 30 second takeover');
  assert(RENTAL_GUARD_DEFAULTS.heartbeatMs * 3 < RENTAL_GUARD_DEFAULTS.leaseMs, 'an active holder survives missed heartbeats inside the lease');
  const base = {
    companyId: 'c1',
    propertyId: 'p1',
    tenantId: 't1',
    rentalPeriodYear: 2031,
    rentalPeriodMonth: 5,
    paymentType: 'rental',
    amount: 1800,
  };
  const withLease = rentalPeriodGuardKeys({ ...base, leaseId: 'lease-a', currency: 'USD' });
  const omitted = rentalPeriodGuardKeys(base);
  const otherCurrency = rentalPeriodGuardKeys({ ...base, currency: 'ZWL', leaseId: 'lease-b' });
  assert(!('error' in withLease) && !('error' in omitted) && !('error' in otherCurrency), 'known and omitted lease or currency still produce a key');
  if (!('error' in withLease) && !('error' in omitted) && !('error' in otherCurrency)) {
    assert(withLease.keys.length === 1 && withLease.keys[0] === omitted.keys[0], 'omitted lease and currency share the month lock');
    assert(withLease.keys[0] === otherCurrency.keys[0], 'a known different currency uses the same month lock and is not given a second key');
    assert(!withLease.keys[0].includes('lease-a') && !withLease.keys[0].includes('USD'), 'the lock key does not embed lease or currency');
  }
  const otherProperty = rentalPeriodGuardKeys({ ...base, propertyId: 'p2' });
  if (!('error' in withLease) && !('error' in otherProperty)) {
    assert(withLease.keys[0] !== otherProperty.keys[0], 'a different property has its own lock');
  }
  const advance = enumerateRentalMonths({
    rentalPeriodYear: 2032,
    rentalPeriodMonth: 5,
    advanceMonthsPaid: 2,
    advancePeriodStart: { month: 5, year: 2032 },
    advancePeriodEnd: { month: 6, year: 2032 },
  });
  const overlap = enumerateRentalMonths({
    rentalPeriodYear: 2032,
    rentalPeriodMonth: 6,
    advanceMonthsPaid: 2,
    advancePeriodStart: { month: 6, year: 2032 },
    advancePeriodEnd: { month: 7, year: 2032 },
  });
  assert(!('error' in advance) && !('error' in overlap), 'advance ranges enumerate');
  if (!('error' in advance) && !('error' in overlap)) {
    const left = rentalPeriodGuardKeys({ ...base, rentalPeriodYear: 2032, rentalPeriodMonth: 5, advanceMonthsPaid: 2, advancePeriodStart: { month: 5, year: 2032 }, advancePeriodEnd: { month: 6, year: 2032 } });
    const right = rentalPeriodGuardKeys({ ...base, rentalPeriodYear: 2032, rentalPeriodMonth: 6, advanceMonthsPaid: 2, advancePeriodStart: { month: 6, year: 2032 }, advancePeriodEnd: { month: 7, year: 2032 } });
    if (!('error' in left) && !('error' in right)) {
      assert(left.keys.length === 2 && right.keys.length === 2, 'each advance locks every month in its range');
      assert(left.keys[0] < left.keys[1], 'months are acquired in sorted order');
      assert(left.keys.some((key) => right.keys.includes(key)), 'overlapping advances share a month lock');
    }
  }
  const sale = rentalPeriodGuardKeys({ ...base, paymentType: 'sale' });
  const deposit = rentalPeriodGuardKeys({ ...base, amount: 0, depositAmount: 500 });
  assert(!('error' in sale) && sale.keys.length === 0, 'a sale does not take a rental lock');
  assert(!('error' in deposit) && deposit.keys.length === 0, 'a deposit-only payment does not take a rental lock');
  const missing = rentalPeriodGuardKeys({ ...base, rentalPeriodMonth: undefined, rentalPeriodYear: undefined });
  assert('error' in missing, 'a rental payment without a period is rejected instead of left unlocked');
}

async function ownerToken(key: string): Promise<string> {
  const row = await EventDedupRecord.findOne({ scope: RENTAL_PERIOD_GUARD_SCOPE, eventId: key }).select('ownerToken').lean();
  return String((row as any)?.ownerToken || '');
}

async function runLockOwnership() {
  const key = 'lock-ownership:month';
  const held = await acquireRentalPeriodGuard(key, { leaseMs: 60_000, heartbeatMs: 0, waitMs: 500 });
  const firstToken = await ownerToken(key);
  let busy = false;
  try {
    await acquireRentalPeriodGuard(key, { leaseMs: 60_000, heartbeatMs: 0, waitMs: 120 });
  } catch (error) {
    busy = error instanceof AppError && error.code === 'RENTAL_PERIOD_BUSY';
  }
  assert(busy, 'a live lock returns RENTAL_PERIOD_BUSY');
  assert((await ownerToken(key)) === firstToken, 'a rejected acquire does not replace the owner');
  await held();
  assert((await ownerToken(key)) === '', 'the owner release removes only its lock');

  const expiring = await acquireRentalPeriodGuard(key, { leaseMs: 50, heartbeatMs: 0, waitMs: 500 });
  const expiredToken = await ownerToken(key);
  await EventDedupRecord.updateOne(
    { scope: RENTAL_PERIOD_GUARD_SCOPE, eventId: key, ownerToken: expiredToken },
    { $set: { processedAt: new Date(Date.now() - 1000) } }
  );
  const recovered = await acquireRentalPeriodGuard(key, { leaseMs: 60_000, heartbeatMs: 0, waitMs: 1000 });
  const recoveredToken = await ownerToken(key);
  assert(recoveredToken !== '' && recoveredToken !== expiredToken, 'an expired lock can be recovered by a new owner');
  await expiring();
  assert((await ownerToken(key)) === recoveredToken, 'the previous owner cannot delete the new owner lock');
  await recovered();
  assert((await ownerToken(key)) === '', 'the current owner can release after the stale release');

  const active = await acquireRentalPeriodGuard(key, { leaseMs: 80, heartbeatMs: 25, waitMs: 500 });
  const activeToken = await ownerToken(key);
  await sleep(190);
  let displaced = false;
  try {
    const intruder = await acquireRentalPeriodGuard(key, { leaseMs: 60_000, heartbeatMs: 0, waitMs: 100 });
    displaced = true;
    await intruder();
  } catch (error) {
    displaced = !(error instanceof AppError && error.code === 'RENTAL_PERIOD_BUSY');
  }
  assert(!displaced && (await ownerToken(key)) === activeToken, 'heartbeat keeps an active holder past the lease, including past the old 30 second window');
  await active();

  await EventDedupRecord.create({
    scope: RENTAL_PERIOD_GUARD_SCOPE,
    eventId: `${key}:legacy`,
    status: 'processed',
    processedAt: new Date(Date.now() - 1000),
  });
  const legacyRelease = await acquireRentalPeriodGuard(`${key}:legacy`, { leaseMs: 60_000, heartbeatMs: 0, waitMs: 1000 });
  assert((await ownerToken(`${key}:legacy`)) !== '', 'a crashed legacy row without a token can be recovered');
  await legacyRelease();

  const june = `${key}:june`;
  const juneHold = await acquireRentalPeriodGuard(june, { leaseMs: 60_000, heartbeatMs: 0, waitMs: 500 });
  let partial = false;
  try {
    await acquireRentalPeriodGuards([`${key}:may`, june], { leaseMs: 60_000, heartbeatMs: 0, waitMs: 150 });
  } catch (error) {
    partial = error instanceof AppError && error.code === 'RENTAL_PERIOD_BUSY';
  }
  const mayLeft = await EventDedupRecord.countDocuments({ scope: RENTAL_PERIOD_GUARD_SCOPE, eventId: `${key}:may` });
  assert(partial && mayLeft === 0, 'a failed multi-month acquire releases the months it already took');
  assert((await ownerToken(june)) !== '', 'the existing June owner is kept when the overlapping acquire fails');
  await juneHold();
}

async function main() {
  stage('pure keys');
  if (process.env.MONGODB_URI) assertDisposable(process.env.MONGODB_URI);
  if (process.env.ACCOUNTING_DB_URI) assertDisposable(process.env.ACCOUNTING_DB_URI);
  runPureKeys();
  assertDisposable(DB);
  assertDisposable(ACCOUNTING_DB);
  blankEmailProviders();
  stage('connecting');
  await mongoose.connect(DB, { serverSelectionTimeoutMS: 8000, autoIndex: false });
  await accountingConnection.openUri(ACCOUNTING_DB, { serverSelectionTimeoutMS: 8000 });
  stage('dropping disposable database');
  await mongoose.connection.dropDatabase();
  await accountingConnection.dropDatabase();
  await Promise.all([Payment.init(), EventDedupRecord.init(), OwnerRentNotice.init()]);
  await EventDedupRecord.collection.createIndex({ scope: 1, eventId: 1 }, { unique: true });
  await Payment.collection.createIndex(
    { companyId: 1, idempotencyKey: 1 },
    { unique: true, partialFilterExpression: { idempotencyKey: { $exists: true, $type: 'string' } } }
  );

  stage('lock ownership');
  await runLockOwnership();

  const admin = await User.create({
    email: 'lock-admin@example.test',
    password: 'test-pass-1',
    firstName: 'Lock',
    lastName: 'Admin',
    role: 'admin',
    roles: ['admin', 'accountant'],
    isActive: true,
    sessionVersion: 1,
  });
  const agent = await User.create({
    email: 'lock-agent@example.test',
    password: 'test-pass-1',
    firstName: 'Lock',
    lastName: 'Agent',
    role: 'agent',
    roles: ['agent'],
    isActive: true,
    sessionVersion: 1,
  });
  const company = await Company.create({
    name: 'Lock Agency',
    address: '1 Lock Street',
    phone: '0770000094',
    email: 'lock@example.test',
    registrationNumber: 'LOCK-REV-1',
    tinNumber: 'LOCK-REV-TIN',
    country: 'Zimbabwe',
    ownerId: admin._id,
    workspaceType: 'agency',
  });
  const property = await Property.create({
    companyId: company._id,
    ownerId: admin._id,
    agentId: agent._id,
    name: 'Lock House',
    address: '1 Lock Road',
    rentalType: 'management',
    rent: 1800,
    commission: 0,
    vatOnCommission: false,
  });
  const tenant = await Tenant.create({
    firstName: 'Lock',
    lastName: 'Tenant',
    email: 'lock-tenant@example.test',
    phone: '0771111194',
    companyId: company._id,
    ownerId: admin._id,
    status: 'Active',
  });
  const lease = await Lease.create({
    propertyId: property._id,
    tenantId: tenant._id,
    companyId: company._id,
    ownerId: admin._id,
    startDate: new Date('2031-01-01T00:00:00.000Z'),
    endDate: new Date('2034-12-31T00:00:00.000Z'),
    rentAmount: 1800,
    depositAmount: 0,
    status: 'active',
  });
  const owner = await PropertyOwner.create({
    email: 'lock-owner@example.test',
    password: 'test-pass-1',
    firstName: 'Lock',
    lastName: 'Owner',
    phone: '0772222294',
    companyId: company._id,
    properties: [property._id],
    active: true,
  });

  const adminUser = { userId: String(admin._id), companyId: String(company._id), role: 'admin', roles: ['admin', 'accountant'] };
  const agentUser = { userId: String(agent._id), companyId: String(company._id), role: 'agent', roles: ['agent'] };

  const leaseReq = (month: number, year: number, extra: Record<string, unknown> = {}) => ({
    user: adminUser,
    body: {
      leaseId: String(lease._id),
      amount: 1800,
      paymentDate: '2031-05-20',
      paymentMethod: 'cash',
      status: 'completed',
      rentalPeriodMonth: month,
      rentalPeriodYear: year,
      currency: 'USD',
      idempotencyKey: `lock:${year}:${month}:${new mongoose.Types.ObjectId().toString()}`,
      ...extra,
    },
  });
  const accountantReq = (month: number, year: number, extra: Record<string, unknown> = {}) => ({
    user: adminUser,
    body: {
      propertyId: String(property._id),
      tenantId: String(tenant._id),
      agentId: String(agent._id),
      amount: 1800,
      paymentDate: '2031-05-20',
      paymentMethod: 'cash',
      paymentType: 'rental',
      rentalPeriodMonth: month,
      rentalPeriodYear: year,
      currency: 'USD',
      idempotencyKey: `lock-acc:${year}:${month}:${new mongoose.Types.ObjectId().toString()}`,
      ...extra,
    },
  });
  const agentReq = (month: number, year: number, extra: Record<string, unknown> = {}) => ({
    user: agentUser,
    headers: {},
    body: {
      propertyId: String(property._id),
      tenantId: String(tenant._id),
      amount: 1800,
      paymentDate: '2031-05-20',
      paymentMethod: 'cash',
      paymentType: 'rental',
      status: 'completed',
      rentalPeriodMonth: month,
      rentalPeriodYear: year,
      currency: 'USD',
      idempotencyKey: `lock-agent:${year}:${month}:${new mongoose.Types.ObjectId().toString()}`,
      ...extra,
    },
  });

  async function coveringCount(month: number, year: number) {
    return Payment.countDocuments({
      companyId: company._id,
      propertyId: property._id,
      tenantId: tenant._id,
      rentalPeriodYear: year,
      rentalPeriodMonth: month,
      amount: { $gt: 0 },
      reversalOfPaymentId: { $exists: false },
      isCorrectionEntry: { $ne: true },
    });
  }

  async function oneWinner(label: string, month: number, year: number, left: Promise<any>, right: Promise<any>) {
    const [a, b] = await Promise.all([left, right]);
    const count = await coveringCount(month, year);
    const covered = await sumRentCoverageForPeriod({
      companyId: company._id,
      propertyId: property._id,
      tenantId: tenant._id,
      rentalPeriodMonth: month,
      rentalPeriodYear: year,
    });
    assert(count === 1, `${label} stored one covering payment, got ${count}; statuses ${a.statusCode}/${b.statusCode} ${a.body?.message || ''} | ${b.body?.message || ''}`);
    assert(covered === 1800, `${label} coverage is 1800, got ${covered}`);
    const created = [a, b].filter((row) => row.statusCode === 201 || row.statusCode === 200).length;
    assert(created === 1, `${label} one response accepted the payment, got ${a.statusCode} and ${b.statusCode}`);
  }

  stage('concurrent controllers');
  await oneWinner('lease', 1, 2031, invoke(createPayment, leaseReq(1, 2031)), invoke(createPayment, leaseReq(1, 2031)));
  await oneWinner('public', 2, 2031, invoke(createPaymentPublic, leaseReq(2, 2031)), invoke(createPaymentPublic, leaseReq(2, 2031)));
  await oneWinner('accountant', 3, 2031, invoke(createPaymentAccountant, accountantReq(3, 2031)), invoke(createPaymentAccountant, accountantReq(3, 2031)));
  await oneWinner('agent', 4, 2031, invoke(createAgentPayment, agentReq(4, 2031)), invoke(createAgentPayment, agentReq(4, 2031)));

  stage('omitted lease and currency');
  await oneWinner(
    'omitted lease',
    5,
    2031,
    invoke(createPayment, leaseReq(5, 2031)),
    invoke(createPaymentAccountant, accountantReq(5, 2031, { leaseId: undefined }))
  );
  await oneWinner(
    'omitted currency',
    6,
    2031,
    invoke(createPayment, leaseReq(6, 2031, { currency: 'USD' })),
    invoke(createPayment, leaseReq(6, 2031, { currency: undefined }))
  );

  const usd = await invoke(createPayment, leaseReq(7, 2031, { currency: 'USD', amount: 1800 }));
  const zwl = await invoke(createPayment, leaseReq(7, 2031, { currency: 'ZWL', amount: 1800 }));
  const usdCovered = await sumRentCoverageForPeriod({
    companyId: company._id, propertyId: property._id, tenantId: tenant._id,
    rentalPeriodMonth: 7, rentalPeriodYear: 2031, currency: 'USD',
  });
  const zwlCovered = await sumRentCoverageForPeriod({
    companyId: company._id, propertyId: property._id, tenantId: tenant._id,
    rentalPeriodMonth: 7, rentalPeriodYear: 2031, currency: 'ZWL',
  });
  assert(usd.statusCode === 201 && zwl.statusCode === 201, `known USD and ZWL are both accepted, got ${usd.statusCode}/${zwl.statusCode} ${usd.body?.message || ''} ${zwl.body?.message || ''}`);
  assert(usdCovered === 1800 && zwlCovered === 1800, `currency isolation keeps USD ${usdCovered} and ZWL ${zwlCovered}`);

  stage('overlapping advances');
  const advanceA = leaseReq(5, 2032, {
    amount: 3600,
    advanceMonthsPaid: 2,
    advancePeriodStart: { month: 5, year: 2032 },
    advancePeriodEnd: { month: 6, year: 2032 },
  });
  const advanceB = leaseReq(6, 2032, {
    amount: 3600,
    advanceMonthsPaid: 2,
    advancePeriodStart: { month: 6, year: 2032 },
    advancePeriodEnd: { month: 7, year: 2032 },
  });
  const [firstAdvance, secondAdvance] = await Promise.all([
    invoke(createPayment, advanceA),
    invoke(createPayment, advanceB),
  ]);
  const advanceCount = await Payment.countDocuments({
    companyId: company._id,
    rentalPeriodYear: 2032,
    advanceMonthsPaid: { $gt: 1 },
    amount: { $gt: 0 },
  });
  const juneCovered = await sumRentCoverageForPeriod({
    companyId: company._id, propertyId: property._id, tenantId: tenant._id,
    rentalPeriodMonth: 6, rentalPeriodYear: 2032,
  });
  assert(advanceCount === 1, `overlapping advances stored one payment, got ${advanceCount}; ${firstAdvance.statusCode}/${secondAdvance.statusCode} ${firstAdvance.body?.message || ''} | ${secondAdvance.body?.message || ''}`);
  assert(juneCovered === 1800, `June advance coverage is one month of rent, got ${juneCovered}`);

  stage('retry after persistence');
  const retryReq = leaseReq(8, 2031);
  const retryKey = retryReq.body.idempotencyKey;
  const firstSave = await invoke(createPayment, retryReq);
  const afterFirst = await Payment.countDocuments({ companyId: company._id, idempotencyKey: retryKey });
  const journalsAfterFirst = await JournalEntry.countDocuments({ companyId: company._id });
  const secondSave = await invoke(createPayment, { ...retryReq, body: { ...retryReq.body } });
  const afterSecond = await Payment.countDocuments({ companyId: company._id, idempotencyKey: retryKey });
  const journalsAfterSecond = await JournalEntry.countDocuments({ companyId: company._id });
  assert(firstSave.statusCode === 201 && afterFirst === 1, `first save persists one payment, got ${firstSave.statusCode} count ${afterFirst} ${firstSave.body?.message || ''}`);
  assert(secondSave.statusCode === 200 && afterSecond === 1, `retry returns the existing payment, got ${secondSave.statusCode} count ${afterSecond}`);
  assert(journalsAfterSecond === journalsAfterFirst, `retry added a journal, before ${journalsAfterFirst} after ${journalsAfterSecond}`);
  assert(afterSecond === 1, 'retry did not create another payment');
  const savedId = String(firstSave.body?.payment?._id || '');
  const replayId = String(secondSave.body?.payment?._id || '');
  assert(savedId !== '' && savedId === replayId, 'retry returns the same payment id');

  stage('reversal and correction coverage');
  const period = {
    companyId: company._id,
    propertyId: property._id,
    tenantId: tenant._id,
    rentalPeriodMonth: 9,
    rentalPeriodYear: 2031,
    leaseId: lease._id,
    currency: 'USD',
  };
  const ordinary = await Payment.create({
    companyId: company._id,
    propertyId: property._id,
    tenantId: tenant._id,
    agentId: agent._id,
    processedBy: admin._id,
    leaseId: lease._id,
    propertyType: 'residential',
    amount: 1800,
    depositAmount: 0,
    paymentType: 'rental',
    paymentMethod: 'bank_transfer',
    status: 'completed',
    paymentDate: new Date('2031-09-13T10:00:00.000Z'),
    rentalPeriodMonth: 9,
    rentalPeriodYear: 2031,
    currency: 'USD',
    transactionDomain: 'RENTAL',
    commissionDetails: { totalCommission: 0, preaFee: 0, agentShare: 0, agencyShare: 0, ownerAmount: 1800 },
    referenceNumber: 'RCPT-LOCK-SEP',
  });
  ordinary.reversalState = 'reversal_in_progress';
  await ordinary.save();
  const blockedProgress = await invoke(createPayment, leaseReq(9, 2031));
  assert(blockedProgress.statusCode === 409, `reversal in progress still blocks, got ${blockedProgress.statusCode}`);
  ordinary.reversalState = 'reversal_incomplete';
  await ordinary.save();
  const blockedIncomplete = await invoke(createPayment, leaseReq(9, 2031));
  assert(blockedIncomplete.statusCode === 409, `reversal incomplete still blocks, got ${blockedIncomplete.statusCode}`);
  assert((await sumRentCoverageForPeriod(period)) === 1800, 'in-progress and incomplete reversals still cover the month');
  const reversal = await Payment.create({
    companyId: company._id,
    propertyId: property._id,
    tenantId: tenant._id,
    agentId: agent._id,
    processedBy: admin._id,
    leaseId: lease._id,
    propertyType: 'residential',
    amount: -1800,
    depositAmount: 0,
    paymentType: 'rental',
    paymentMethod: 'bank_transfer',
    status: 'completed',
    paymentDate: new Date('2031-09-20T10:00:00.000Z'),
    rentalPeriodMonth: 9,
    rentalPeriodYear: 2031,
    currency: 'USD',
    transactionDomain: 'RENTAL',
    commissionDetails: { totalCommission: 0, preaFee: 0, agentShare: 0, agencyShare: 0, ownerAmount: -1800 },
    referenceNumber: 'REV-LOCK-SEP',
    reversalOfPaymentId: ordinary._id,
  });
  ordinary.reversalState = 'reversed';
  (ordinary as any).reversalPaymentId = reversal._id;
  await ordinary.save();
  assert((await sumRentCoverageForPeriod(period)) === 0, 'a completed reversal leaves the month open');
  const draft = await Payment.create({
    companyId: company._id,
    propertyId: property._id,
    tenantId: tenant._id,
    agentId: agent._id,
    processedBy: admin._id,
    leaseId: lease._id,
    propertyType: 'residential',
    amount: 1800,
    depositAmount: 0,
    paymentType: 'rental',
    paymentMethod: 'bank_transfer',
    status: 'pending',
    postingStatus: 'draft',
    isCorrectionEntry: true,
    paymentDate: new Date('2031-09-21T10:00:00.000Z'),
    rentalPeriodMonth: 9,
    rentalPeriodYear: 2031,
    currency: 'USD',
    transactionDomain: 'RENTAL',
    commissionDetails: { totalCommission: 0, preaFee: 0, agentShare: 0, agencyShare: 0, ownerAmount: 1800 },
    referenceNumber: 'CORR-LOCK-SEP',
  });
  assert((await sumRentCoverageForPeriod(period)) === 0, 'a pending correction does not cover the month');
  const advanceDuringDraft = await invoke(createPayment, leaseReq(9, 2031, {
    amount: 3600,
    advanceMonthsPaid: 2,
    advancePeriodStart: { month: 9, year: 2031 },
    advancePeriodEnd: { month: 10, year: 2031 },
  }));
  assert(advanceDuringDraft.statusCode === 400 || advanceDuringDraft.statusCode === 409, `pending correction reserves the period and blocks an overlapping advance, got ${advanceDuringDraft.statusCode} ${advanceDuringDraft.body?.message || ''}`);
  await Payment.deleteMany({
    companyId: company._id,
    rentalPeriodYear: 2031,
    advanceMonthsPaid: { $gt: 1 },
    amount: { $gt: 0 },
  });
  draft.status = 'completed';
  (draft as any).postingStatus = 'posted';
  await draft.save();
  assert((await sumRentCoverageForPeriod(period)) === 1800, 'a completed correction covers the month');
  const blockedCorrection = await invoke(createPayment, leaseReq(9, 2031));
  assert(blockedCorrection.statusCode === 409, `completed correction blocks a new receipt, got ${blockedCorrection.statusCode}`);
  const advanceOverCorrection = await invoke(createPayment, leaseReq(9, 2031, {
    amount: 3600,
    advanceMonthsPaid: 2,
    advancePeriodStart: { month: 9, year: 2031 },
    advancePeriodEnd: { month: 10, year: 2031 },
  }));
  assert(advanceOverCorrection.statusCode === 400, `completed correction blocks an overlapping advance, got ${advanceOverCorrection.statusCode} ${advanceOverCorrection.body?.message || ''}`);

  stage('levy does not satisfy rent');
  await Property.updateOne({ _id: property._id }, { $set: { levyOrMunicipalType: 'levy', levyOrMunicipalAmount: 200 } });
  const levyOnly = await invoke(createAgentPayment, agentReq(11, 2031, { amount: 200, rentUsed: 1800, levyUsed: 200 }));
  const levyCoverage = await sumRentCoverageForPeriod({
    companyId: company._id, propertyId: property._id, tenantId: tenant._id,
    rentalPeriodMonth: 11, rentalPeriodYear: 2031,
  });
  assert(levyOnly.statusCode === 201, `levy-only payment is accepted, got ${levyOnly.statusCode} ${levyOnly.body?.message || ''}`);
  assert(levyCoverage === 0, `levy-only payment does not cover rent, got ${levyCoverage}`);
  const rentAfterLevy = await invoke(createPayment, leaseReq(11, 2031));
  assert(rentAfterLevy.statusCode === 201, `rent can still be collected after a levy-only payment, got ${rentAfterLevy.statusCode} ${rentAfterLevy.body?.message || ''}`);
  await Property.updateOne({ _id: property._id }, { $set: { levyOrMunicipalType: '', levyOrMunicipalAmount: 0 } });

  stage('reversal notice retry');
  const amountBefore = Number(ordinary.amount);
  const stateBefore = String(ordinary.reversalState);
  const journalsBeforeNotice = await JournalEntry.countDocuments({ companyId: company._id });
  const sent: Array<{ to: string }> = [];
  const noticePayment = {
    _id: ordinary._id,
    companyId: company._id,
    propertyId: property._id,
    tenantId: tenant._id,
    referenceNumber: ordinary.referenceNumber,
    amount: ordinary.amount,
    currency: 'USD',
    reversalPaymentId: reversal._id,
    reversalState: 'reversed',
    rentalPeriodMonth: 9,
    rentalPeriodYear: 2031,
  };
  await notifyOwnerOfRentReversal(noticePayment as any, 'duplicate receipt', {
    settled: true,
    send: async (message) => { sent.push(message); },
  });
  await notifyOwnerOfRentReversal(noticePayment as any, 'duplicate receipt', {
    settled: true,
    send: async (message) => { sent.push(message); },
  });
  const noticeCount = await OwnerRentNotice.countDocuments({
    idempotencyKey: `owner-rent-reversal:${String(ordinary._id)}:${String(reversal._id)}`,
  });
  const reloaded = await Payment.findById(ordinary._id).select('amount reversalState commissionDetails').lean();
  assert(sent.length === 1 && noticeCount === 1, `reversal notice retry sends once and stores one row, sent ${sent.length} rows ${noticeCount}`);
  assert(Number((reloaded as any)?.amount) === amountBefore && String((reloaded as any)?.reversalState) === stateBefore, 'reversal notice retry does not change the payment');
  assert((await JournalEntry.countDocuments({ companyId: company._id })) === journalsBeforeNotice, 'reversal notice retry does not add a journal');
  assert(owner.email === 'lock-owner@example.test', 'notice fixture stayed on the disposable owner');

  stage('guard still serializes a direct write');
  let raced = 0;
  await Promise.all([0, 1].map(() => withRentalPeriodGuards([
    `direct:${company._id}:2031:12`,
  ], async () => {
    const covered = await sumRentCoverageForPeriod({
      companyId: company._id, propertyId: property._id, tenantId: tenant._id,
      rentalPeriodMonth: 12, rentalPeriodYear: 2031,
    });
    if (covered >= 1800) return;
    await Payment.create({
      companyId: company._id,
      propertyId: property._id,
      tenantId: tenant._id,
      agentId: agent._id,
      processedBy: admin._id,
      leaseId: lease._id,
      propertyType: 'residential',
      amount: 1800,
      depositAmount: 0,
      paymentType: 'rental',
      paymentMethod: 'cash',
      status: 'completed',
      paymentDate: new Date('2031-12-01T00:00:00.000Z'),
      rentalPeriodMonth: 12,
      rentalPeriodYear: 2031,
      currency: 'USD',
      transactionDomain: 'RENTAL',
      commissionDetails: { totalCommission: 0, preaFee: 0, agentShare: 0, agencyShare: 0, ownerAmount: 1800 },
      referenceNumber: `RCPT-DIRECT-${new mongoose.Types.ObjectId().toString()}`,
      idempotencyKey: `direct:${new mongoose.Types.ObjectId().toString()}`,
    });
    raced += 1;
    await sleep(40);
  }, { leaseMs: 60_000, heartbeatMs: 0, waitMs: 2000 })));
  assert(raced === 1, `direct locked writers stored one receipt, got ${raced}`);
}

main()
  .then(async () => {
    if (accountingConnection.readyState !== 0) await accountingConnection.close();
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    if (failures.length) {
      console.error(failures.map((failure) => `- ${failure}`).join('\n'));
      console.error(`rental-lock failures: ${failures.length}`);
      process.exit(1);
    }
    console.log('rental-lock tests passed');
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error);
    if (accountingConnection.readyState !== 0) await accountingConnection.close().catch(() => undefined);
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => undefined);
    process.exit(1);
  });
