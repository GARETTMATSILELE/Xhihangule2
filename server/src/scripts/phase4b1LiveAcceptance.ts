/**
 * Phase 4B.1 live acceptance against the already-running local API.
 * Setup fixtures are labelled. The rental payment itself is posted only through HTTP.
 * Does not print tokens, passwords, or connection strings.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { connectDatabase, accountingConnection } from '../config/database';
import { Payment } from '../models/Payment';
import { TaxRate } from '../models/TaxRate';
import { OwnerRentNotice } from '../models/OwnerRentNotice';
import { MaintenanceRequest } from '../models/MaintenanceRequest';
import { MaintenanceQuote } from '../models/MaintenanceQuote';
import { MaintenanceContractor } from '../models/MaintenanceContractor';
import { ContractorJobRecord } from '../ecosystem/models/maintenanceWorkflow';
import { RentalApplication, ViewingRequest } from '../ecosystem/models/tenantFacing';
import { notifyOwnerOfRentPayment } from '../services/ownerRentNotificationService';
import { explainOwnerWaterfall } from '../reporting/ownerWaterfall';

const STAMP = Date.now().toString().slice(-8);
const PASSWORD = 'Phase4b1-Accept-1';
const BASE = '127.0.0.1';
const PORT = 5000;
const OUT = path.resolve(__dirname, '../../tmp/phase4b1-evidence.json');

type HttpResult = { status: number; body: any; text: string };
const evidence: Record<string, any> = {
  startedAt: new Date().toISOString(),
  stamp: STAMP,
  setupVersusAcceptance: {
    setup: 'signup, users, property settings, VAT rate, tax profile, tenant, lease, owner link, maintenance fixture records',
    acceptance: 'POST /api/accountants/payments then read payment, accounts, journals, statement, csv, financial trace',
  },
  http: [] as any[],
};

function save() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(evidence, null, 2));
}

function request(method: string, urlPath: string, token: string | null, body?: unknown): Promise<HttpResult> {
  const payload = body === undefined ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: BASE,
      port: PORT,
      path: urlPath,
      method,
      headers: {
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      timeout: 180000,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed: any = text;
        try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
        resolve({ status: res.statusCode || 0, body: parsed, text });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    if (payload) req.write(payload);
    req.end();
  });
}

function redact(value: any): any {
  if (Array.isArray(value)) return value.slice(0, 30).map(redact);
  if (!value || typeof value !== 'object') return value;
  const out: any = {};
  for (const [key, item] of Object.entries(value)) {
    if (/token|password|secret|authorization/i.test(key)) continue;
    out[key] = redact(item);
  }
  return out;
}

async function call(label: string, method: string, urlPath: string, token: string | null, body?: unknown, extra?: Record<string, unknown>) {
  const result = await request(method, urlPath, token, body);
  const row = {
    label,
    method,
    path: urlPath.split('?')[0],
    status: result.status,
    ...extra,
    body: typeof result.body === 'string' ? result.text.slice(0, 1500) : redact(result.body),
  };
  evidence.http.push(row);
  save();
  return result;
}

function idOf(body: any): string | undefined {
  const value = body?._id || body?.id || body?.data?._id || body?.data?.id || body?.payment?._id || body?.user?._id || body?.company?._id;
  return value ? String(value) : undefined;
}

async function signup(companyName: string, plan: 'ENTERPRISE' | 'INDIVIDUAL') {
  const email = `${companyName.toLowerCase()}.${STAMP}@phase4b1.test`;
  const result = await call(`signup ${companyName}`, 'POST', '/api/auth/signup', null, {
    email,
    password: PASSWORD,
    name: `${companyName} Admin`,
    plan,
    company: {
      name: companyName,
      address: '1 Test Close, Harare',
      phone: '0772000000',
      email,
      registrationNumber: `P4B1-${STAMP}-${companyName.slice(-4)}`,
      tinNumber: `T4B1-${STAMP}-${companyName.slice(-4)}`,
    },
  });
  if (result.status !== 201) throw new Error(`signup ${companyName} failed ${result.status} ${result.text.slice(0, 400)}`);
  return {
    email,
    token: result.body.token as string,
    userId: String(result.body.user._id),
    companyId: String(result.body.user.companyId || result.body.company._id),
  };
}

async function createStaff(adminToken: string, role: string, roles: string[], label: string) {
  const email = `${label.toLowerCase()}.${STAMP}@phase4b1.test`;
  const result = await call(`create ${label}`, 'POST', '/api/users', adminToken, {
    email,
    password: PASSWORD,
    firstName: label,
    lastName: 'PHASE4B1',
    role,
    roles,
  });
  if (result.status >= 400) throw new Error(`user ${label} failed ${result.status} ${result.text.slice(0, 400)}`);
  const login = await call(`login ${label}`, 'POST', '/api/auth/login', null, { email, password: PASSWORD });
  if (login.status !== 200) throw new Error(`login ${label} failed ${login.status}`);
  return { email, token: login.body.token as string, userId: String(login.body.user._id) };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForNotice(paymentId: string) {
  for (let i = 0; i < 20; i++) {
    const row = await OwnerRentNotice.findOne({ idempotencyKey: `owner-rent-payment:${paymentId}` }).lean();
    if (row) return row;
    await sleep(500);
  }
  return null;
}

async function main() {
  const blocked = ['MONGODB_URI', 'ACCOUNTING_DB_URI', 'MONGODB_URI_PROPERTY', 'MONGODB_URI_ACCOUNTING', 'AZURE_COSMOS_CONNECTIONSTRING', 'CUSTOMCONNSTR_MONGODB_URI', 'FORCE_DB_URI']
    .filter((key) => Boolean(process.env[key]));
  if (process.env.NODE_ENV === 'production' || blocked.length) {
    console.error('ABORT: database environment is not a confirmed local development target');
    process.exit(2);
  }
  const health = await request('GET', '/api/health/live', null);
  evidence.health = { status: health.status };
  if (health.status !== 200) throw new Error(`API health ${health.status}`);

  await connectDatabase();
  const host = String((mongoose.connection as any).host || '');
  const accountingHost = String((accountingConnection as any).host || '');
  evidence.database = {
    nodeEnv: process.env.NODE_ENV,
    mainName: mongoose.connection.name,
    mainHostIsLocal: host === 'localhost' || host === '127.0.0.1',
    accountingName: accountingConnection.name,
    accountingHostIsLocal: accountingHost === 'localhost' || accountingHost === '127.0.0.1',
  };
  if (!evidence.database.mainHostIsLocal || !evidence.database.accountingHostIsLocal) {
    console.error('ABORT: connected host is not local');
    process.exit(2);
  }
  save();

  const historical = await Payment.findOne({}).sort({ createdAt: 1 }).select('_id status amount accountingComplete updatedAt companyId').lean();
  evidence.historicalSentinel = historical ? {
    id: String(historical._id),
    status: historical.status,
    amount: historical.amount,
    accountingComplete: (historical as any).accountingComplete,
    updatedAt: (historical as any).updatedAt,
  } : null;
  evidence.paymentCountBefore = await Payment.countDocuments({});

  const testCo = await signup('PHASE4B1_TEST_COMPANY', 'ENTERPRISE');
  const companyA = await signup('PHASE4B1_COMPANY_A', 'ENTERPRISE');
  const companyB = await signup('PHASE4B1_COMPANY_B', 'ENTERPRISE');
  const individual = await signup('PHASE4B1_INDIVIDUAL', 'INDIVIDUAL');
  evidence.identities = {
    testCompanyId: testCo.companyId,
    companyAId: companyA.companyId,
    companyBId: companyB.companyId,
    individualCompanyId: individual.companyId,
    testAdminEmail: testCo.email,
    companyAAdminEmail: companyA.email,
    companyBAdminEmail: companyB.email,
    individualEmail: individual.email,
  };

  const agent = await createStaff(testCo.token, 'agent', ['agent', 'principal'], 'PHASE4B1_TEST_AGENT');
  const junior = await createStaff(testCo.token, 'agent', ['agent'], 'PHASE4B1_TEST_AGENT_JUNIOR');
  const accountant = await createStaff(testCo.token, 'accountant', ['accountant'], 'PHASE4B1_TEST_ACCOUNTANT');
  const ownerUser = await createStaff(testCo.token, 'owner', ['owner'], 'PHASE4B1_TEST_OWNER_USER');
  evidence.identities.agentEmail = agent.email;
  evidence.identities.juniorEmail = junior.email;
  evidence.identities.accountantEmail = accountant.email;
  evidence.identities.ownerUserEmail = ownerUser.email;
  save();

  const taxProfile = await call('set vat profile', 'PUT', `/api/companies/${testCo.companyId}`, testCo.token, {
    taxProfile: { vatRegistered: true, vatRegistrationEffectiveDate: '2020-01-01' },
  });
  const taxRate = await call('set vat rate', 'POST', '/api/accounting/tax-rates', testCo.token, {
    taxType: 'VAT', rate: 15.5, effectiveFrom: '2020-01-01',
  });
  evidence.vatSetup = { profileStatus: taxProfile.status, rateStatus: taxRate.status, rate: redact(taxRate.body) };

  const propertyRes = await call('create property', 'POST', '/api/properties', testCo.token, {
    name: 'PHASE4B1_TEST_PROPERTY',
    address: '1 Borrowdale Test Close, Harare',
    type: 'house',
    rent: 1000,
    commission: 10,
    rentalType: 'management',
    vatOnCommission: true,
    vatCommissionTreatment: 'exclusive',
    levyOrMunicipalType: 'levy',
    levyOrMunicipalAmount: 100,
    status: 'rented',
  });
  const propertyId = idOf(propertyRes.body);
  if (!propertyId) throw new Error(`property create failed ${propertyRes.status} ${propertyRes.text.slice(0, 500)}`);

  const ownerRes = await call('create property owner', 'POST', '/api/property-owners', testCo.token, {
    email: `phase4b1_test_owner.${STAMP}@phase4b1.test`,
    password: PASSWORD,
    firstName: 'PHASE4B1_TEST_OWNER',
    lastName: 'Disposable',
    phone: '0772000001',
    propertyIds: [propertyId],
  });
  const ownerId = idOf(ownerRes.body);
  if (!ownerId) throw new Error(`owner create failed ${ownerRes.status} ${ownerRes.text.slice(0, 400)}`);
  const linked = await call('link property owner', 'PUT', `/api/properties/${propertyId}`, testCo.token, {
    propertyOwnerId: ownerId,
    name: 'PHASE4B1_TEST_PROPERTY',
    address: '1 Borrowdale Test Close, Harare',
    rent: 1000,
    commission: 10,
    rentalType: 'management',
    vatOnCommission: true,
    vatCommissionTreatment: 'exclusive',
    levyOrMunicipalType: 'levy',
    levyOrMunicipalAmount: 100,
  });
  evidence.propertyLink = { status: linked.status, propertyOwnerId: linked.body?.propertyOwnerId || linked.body?.data?.propertyOwnerId };

  const tenantRes = await call('create tenant', 'POST', '/api/tenants', testCo.token, {
    firstName: 'PHASE4B1_TEST_TENANT',
    lastName: 'Disposable',
    email: `phase4b1_test_tenant.${STAMP}@phase4b1.test`,
    phone: '0772000002',
    propertyId,
  });
  const tenantId = idOf(tenantRes.body) || idOf(tenantRes.body?.tenant) || tenantRes.body?.data?._id;
  if (!tenantId) throw new Error(`tenant create failed ${tenantRes.status} ${tenantRes.text.slice(0, 400)}`);

  const leaseRes = await call('create lease', 'POST', '/api/leases', testCo.token, {
    propertyId,
    tenantId,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    rentAmount: 1000,
    depositAmount: 0,
    status: 'active',
  });
  const leaseId = idOf(leaseRes.body) || leaseRes.body?.lease?._id;
  if (!leaseId) throw new Error(`lease create failed ${leaseRes.status} ${leaseRes.text.slice(0, 500)}`);
  evidence.records = { propertyId, ownerId, tenantId: String(tenantId), leaseId: String(leaseId), agentId: agent.userId };

  async function postRent(month: number, year: number, notes?: string) {
    return call(`payment ${year}-${month}`, 'POST', '/api/accountants/payments', testCo.token, {
      paymentType: 'rental',
      paymentDate: `${year}-${String(month).padStart(2, '0')}-11`,
      paymentMethod: 'cash',
      amount: 1000,
      currency: 'USD',
      propertyId,
      tenantId,
      agentId: agent.userId,
      leaseId,
      rentalPeriodMonth: month,
      rentalPeriodYear: year,
      referenceNumber: `PHASE4B1-${year}-${month}-${STAMP}`,
      notes,
    });
  }

  const paymentRes = await postRent(10, 2026);
  const paymentId = idOf(paymentRes.body) || paymentRes.body?.data?.payment?._id || paymentRes.body?.payment?._id;
  if (!paymentId) throw new Error(`payment failed ${paymentRes.status} ${paymentRes.text.slice(0, 800)}`);
  evidence.borrowdale = { createStatus: paymentRes.status, paymentId: String(paymentId) };

  const readPay = await call('read payment', 'GET', `/api/accountants/payments/${paymentId}`, testCo.token);
  const paymentDoc = readPay.body?.data || readPay.body?.payment || readPay.body;
  const snapshot = paymentDoc?.commissionDetails || {};
  const allocation = paymentDoc?.paymentAllocation || {};
  const waterfall = explainOwnerWaterfall({
    grossAmount: Number(snapshot.grossRent ?? paymentDoc?.amount ?? 0),
    commissionAmount: Number(snapshot.commissionNet ?? snapshot.totalCommission ?? 0),
    levyAmount: Number(snapshot.levy ?? 0),
    vatOnCommission: Number(snapshot.vatOnCommission ?? snapshot.vatAmount ?? 0),
    recordedOwnerAmount: allocation.ownerPayable,
  });
  const accounts = await accountingConnection.collection('propertyaccounts').find({
    propertyId: new mongoose.Types.ObjectId(propertyId),
    isArchived: { $ne: true },
  }).project({ ledgerType: 1, propertyId: 1, isArchived: 1, 'transactions.paymentId': 1, 'transactions.type': 1, 'transactions.category': 1, 'transactions.amount': 1 }).toArray();
  const journals = await mongoose.connection.collection('journalentries').find({
    companyId: new mongoose.Types.ObjectId(testCo.companyId),
    sourceId: String(paymentId),
  }).project({ sourceModule: 1, sourceId: 1, reference: 1, status: 1 }).toArray();
  const statement = await call('owner statement', 'GET', `/api/reporting/owner/${propertyId}?ledger=rental&includeAllTransactions=true`, testCo.token);
  const csv = await call('owner csv', 'GET', `/api/reporting/owner/${propertyId}/csv?ledger=rental&includeAllTransactions=true`, testCo.token);
  const trace = await call('financial trace', 'GET', `/api/accountants/payments/${paymentId}/financial-trace`, testCo.token);
  const activeAccounts = accounts.filter((row) => row.isArchived !== true);
  evidence.borrowdale.persisted = {
    status: paymentDoc?.status,
    currency: paymentDoc?.currency,
    transactionDomain: paymentDoc?.transactionDomain,
    paymentType: paymentDoc?.paymentType,
    amount: paymentDoc?.amount,
    rentAllocated: paymentDoc?.rentAllocated,
    levyAllocated: paymentDoc?.levyAllocated,
    accountingComplete: paymentDoc?.accountingComplete,
    accountingStatus: paymentDoc?.accountingStatus,
    commissionNet: snapshot.commissionNet ?? snapshot.totalCommission,
    levy: snapshot.levy,
    vatOnCommission: snapshot.vatOnCommission ?? snapshot.vatAmount,
    grossRent: snapshot.grossRent,
    ownerAmount: snapshot.ownerAmount,
    ownerPayable: allocation.ownerPayable,
    waterfall,
    activePropertyAccountCount: activeAccounts.length,
    accountLedgerTypes: activeAccounts.map((row) => row.ledgerType),
    journalCount: journals.length,
    journalModules: journals.map((row) => row.sourceModule),
    statementStatus: statement.status,
    csvStatus: csv.status,
    csvHasPaymentId: typeof csv.body === 'string' ? csv.text.includes(String(paymentId)) : JSON.stringify(csv.body).includes(String(paymentId)),
    csvExcerpt: (typeof csv.body === 'string' ? csv.text : JSON.stringify(csv.body)).slice(0, 1800),
    traceStatus: trace.status,
    traceExcerpt: redact(trace.body),
  };
  save();

  const notice1 = await waitForNotice(String(paymentId));
  const noticeBeforeRetry = notice1 ? { status: notice1.status, updatedAt: (notice1 as any).updatedAt } : null;
  const loaded = await Payment.findById(paymentId);
  if (loaded) await notifyOwnerOfRentPayment(loaded as any, { accountingComplete: loaded.accountingComplete === true });
  const noticeAfter = await OwnerRentNotice.find({ paymentId }).lean();
  evidence.notification = {
    provider: 'Mailtrap SMTP is configured on the API process. Inbox delivery was not read back, so provider delivery is NOT VERIFIED.',
    scenario1: noticeBeforeRetry,
    scenario2: {
      count: noticeAfter.length,
      statuses: noticeAfter.map((row) => row.status),
      updatedAtUnchanged: noticeBeforeRetry ? String((noticeAfter[0] as any)?.updatedAt) === String(noticeBeforeRetry.updatedAt) : false,
    },
    emailTextCheckedForTenantId: notice1 ? false : null,
  };
  save();

  const mailPayment = await postRent(1, 2027, 'PHASE4B1_FAIL_MAIL controlled adapter failure');
  const mailPaymentId = String(idOf(mailPayment.body) || mailPayment.body?.payment?._id || '');
  const mailBefore = mailPaymentId ? await Payment.findById(mailPaymentId).select('status accountingComplete').lean() : null;
  let mailNotice = mailPaymentId ? await waitForNotice(mailPaymentId) : null;
  if (loaded && mailPaymentId) {
    const mailDoc = await Payment.findById(mailPaymentId);
    if (mailDoc) {
      await notifyOwnerOfRentPayment(mailDoc as any, { accountingComplete: mailDoc.accountingComplete === true });
      await notifyOwnerOfRentPayment(mailDoc as any, { accountingComplete: mailDoc.accountingComplete === true });
    }
  }
  mailNotice = mailPaymentId ? await OwnerRentNotice.findOne({ paymentId: mailPaymentId }).lean() : null;
  const mailCount = mailPaymentId ? await OwnerRentNotice.countDocuments({ paymentId: mailPaymentId }) : 0;
  const mailAfter = mailPaymentId ? await Payment.findById(mailPaymentId).select('status accountingComplete').lean() : null;
  evidence.notification.scenario5 = {
    mode: 'Development seam PHASE4B1_FAIL_MAIL on the API process, then the same notifyOwnerOfRentPayment retry. First send throws; retry uses the same owner-rent-payment key.',
    paymentId: mailPaymentId,
    createStatus: mailPayment.status,
    before: mailBefore,
    after: mailAfter,
    notice: mailNotice ? { status: mailNotice.status, failureReason: (mailNotice as any).failureReason, key: mailNotice.idempotencyKey } : null,
    noticeCount: mailCount,
    accountingUnchanged: Boolean(mailBefore && mailAfter && mailBefore.status === mailAfter.status && mailBefore.accountingComplete === mailAfter.accountingComplete),
  };

  await call('opt out', 'POST', `/api/property-owners/${ownerId}/preferences`, testCo.token, { rentPaymentEmails: false });
  const optPayment = await postRent(11, 2026);
  const optPaymentId = String(idOf(optPayment.body) || '');
  const optNotice = optPaymentId ? await waitForNotice(optPaymentId) : null;
  const optPay = optPaymentId ? await Payment.findById(optPaymentId).select('status accountingComplete').lean() : null;
  evidence.notification.scenario3 = {
    paymentId: optPaymentId,
    noticeStatus: optNotice?.status || null,
    accountingComplete: optPay?.accountingComplete,
    paymentStatus: optPay?.status,
  };

  const incomplete = await postRent(12, 2026, 'PHASE26_FAIL_JOURNAL');
  const incompleteId = String(idOf(incomplete.body) || '');
  await sleep(1500);
  const incompletePay = incompleteId ? await Payment.findById(incompleteId).select('status accountingComplete notes').lean() : null;
  const incompleteNotice = incompleteId ? await OwnerRentNotice.findOne({ paymentId: incompleteId }).lean() : null;
  evidence.notification.scenario4 = {
    paymentId: incompleteId,
    createStatus: incomplete.status,
    paymentStatus: incompletePay?.status,
    accountingComplete: incompletePay?.accountingComplete,
    noticeCreated: Boolean(incompleteNotice),
  };
  save();

  const storedRate = await TaxRate.findOne({ companyId: testCo.companyId, taxType: 'VAT' }).select('rate effectiveFrom isActive').lean();
  evidence.vatSetup.storedRate = storedRate;

  const journalsBeforeOps = await mongoose.connection.collection('journalentries').countDocuments({ companyId: new mongoose.Types.ObjectId(testCo.companyId) });
  const contractor = await MaintenanceContractor.create({
    companyId: testCo.companyId,
    companyName: 'PHASE4B1 Contractor',
    contactPerson: 'PHASE4B1',
    phone: '0772000003',
    email: `phase4b1.contractor.${STAMP}@phase4b1.test`,
    trade: 'General Contractor',
    rating: 0,
    active: true,
  });
  const maint = await MaintenanceRequest.create({
    propertyId,
    companyId: testCo.companyId,
    requestedBy: agent.userId,
    ownerId,
    title: 'PHASE4B1 test repair',
    description: 'Disposable maintenance smoke fixture',
    companyName: 'PHASE4B1',
  });
  const quote = await MaintenanceQuote.create({
    requestId: maint._id,
    companyId: testCo.companyId,
    contractorId: contractor._id,
    propertyId,
    amount: 80,
    total: 80,
    description: 'PHASE4B1 approved quote',
    submittedDate: new Date(),
    status: 'OWNER_APPROVED',
    version: 3,
  });
  await ContractorJobRecord.create({
    requestId: maint._id,
    companyId: testCo.companyId,
    propertyId,
    contractorId: contractor._id,
    quoteId: quote._id,
    status: 'AUTHORISED',
    authorisedBy: agent.userId,
    authorisedAt: new Date(),
  });
  evidence.maintenanceSetup = 'Fixture records only. The payment request is the HTTP acceptance step.';
  const tooMuch = await call('maintenance over approved', 'POST', '/api/agents/letting/maintenance-payment-requests', agent.token, {
    quoteId: String(quote._id), propertyId, amount: 500,
  });
  const okReq = await call('maintenance within approved', 'POST', '/api/agents/letting/maintenance-payment-requests', agent.token, {
    quoteId: String(quote._id), propertyId, amount: 80, payTo: { name: 'PHASE4B1', surname: 'Contractor' },
  });
  const journalsAfterMaint = await mongoose.connection.collection('journalentries').countDocuments({ companyId: new mongoose.Types.ObjectId(testCo.companyId) });
  const queue = await call('accountant queue', 'GET', '/api/accountants/letting/work-queue', accountant.token);
  evidence.maintenance = {
    overStatus: tooMuch.status,
    overBody: typeof tooMuch.body === 'string' ? tooMuch.text.slice(0, 400) : redact(tooMuch.body),
    requestStatus: okReq.status,
    quoteVersion: 3,
    journalsBefore: journalsBeforeOps,
    journalsAfter: journalsAfterMaint,
    journalsUnchanged: journalsBeforeOps === journalsAfterMaint,
    queueStatus: queue.status,
    queueContainsRequest: JSON.stringify(queue.body).includes(String(quote._id)) || JSON.stringify(queue.body).includes('Maintenance'),
  };

  const levy = await call('create levy', 'POST', '/api/levy-payments', testCo.token, {
    propertyId, paymentDate: '2026-10-11', paymentMethod: 'cash', amount: 10, currency: 'USD', levyPeriodMonth: 9, levyPeriodYear: 2026,
  });
  const levyId = idOf(levy.body);
  const journalsBeforeReceipt = await mongoose.connection.collection('journalentries').countDocuments({ companyId: new mongoose.Types.ObjectId(testCo.companyId) });
  const levyCountBefore = levyId ? await mongoose.connection.collection('levypayments').countDocuments({ companyId: new mongoose.Types.ObjectId(testCo.companyId) }) : 0;
  const receipt = levyId ? await call('file levy receipt', 'POST', `/api/agents/letting/levies/${levyId}/receipt`, agent.token, {
    receiptNumber: `PHASE4B1-${STAMP}`, receiptFileUrl: `phase4b1://${STAMP}/receipt.pdf`, levyAuthority: 'PHASE4B1 Authority',
  }) : null;
  const journalsAfterReceipt = await mongoose.connection.collection('journalentries').countDocuments({ companyId: new mongoose.Types.ObjectId(testCo.companyId) });
  const levyCountAfter = await mongoose.connection.collection('levypayments').countDocuments({ companyId: new mongoose.Types.ObjectId(testCo.companyId) });
  evidence.levy = {
    createStatus: levy.status,
    levyId,
    receiptStatus: receipt?.status,
    journalsUnchangedByReceipt: journalsBeforeReceipt === journalsAfterReceipt,
    levyCountUnchangedByReceipt: levyCountBefore === levyCountAfter,
  };

  const bProperty = await call('company B property', 'POST', '/api/properties', companyB.token, {
    name: 'PHASE4B1_COMPANY_B_PROPERTY', address: '2 Other Company Close', type: 'house', rent: 50, rentalType: 'management',
  });
  const bPropertyId = idOf(bProperty.body);
  const bOwner = await call('company B owner', 'POST', '/api/property-owners', companyB.token, {
    email: `phase4b1.b.owner.${STAMP}@phase4b1.test`, password: PASSWORD, firstName: 'CompanyB', lastName: 'Owner', phone: '0772000004',
  });
  const bOwnerId = idOf(bOwner.body);
  const bTenant = await call('company B tenant', 'POST', '/api/tenants', companyB.token, {
    firstName: 'CompanyB', lastName: 'Tenant', email: `phase4b1.b.tenant.${STAMP}@phase4b1.test`, phone: '0772000005',
  });
  const bTenantId = idOf(bTenant.body);
  let bLeaseId: string | undefined;
  if (bPropertyId && bTenantId) {
    const bLease = await call('company B lease', 'POST', '/api/leases', companyB.token, {
      propertyId: bPropertyId, tenantId: bTenantId, startDate: '2026-01-01', endDate: '2026-12-31', rentAmount: 50, depositAmount: 0,
    });
    bLeaseId = idOf(bLease.body) ? String(idOf(bLease.body)) : undefined;
  }
  const bApp = bPropertyId ? await RentalApplication.create({
    tenantUserId: companyB.userId, propertyId: bPropertyId, companyId: companyB.companyId, status: 'SUBMITTED', snapshot: { label: 'PHASE4B1' }, statusHistory: [{ status: 'SUBMITTED', at: new Date() }],
  }) : null;
  const bViewing = bPropertyId ? await ViewingRequest.create({
    tenantUserId: companyB.userId, propertyId: bPropertyId, companyId: companyB.companyId, requestedDate: new Date(), status: 'REQUESTED',
  }) : null;
  const bLevy = bPropertyId ? await call('company B levy', 'POST', '/api/levy-payments', companyB.token, {
    propertyId: bPropertyId, paymentDate: '2026-10-11', paymentMethod: 'cash', amount: 5, currency: 'USD',
  }) : null;
  const bLevyId = bLevy ? idOf(bLevy.body) : undefined;

  const matrix: any[] = [];
  async function probe(entry: { endpoint: string; method: string; caller: string; target: string; token: string | null; body?: unknown; mutationCheck?: () => Promise<number> }) {
    const before = entry.mutationCheck ? await entry.mutationCheck() : undefined;
    const result = await request(entry.method, entry.endpoint, entry.token, entry.body);
    const after = entry.mutationCheck ? await entry.mutationCheck() : undefined;
    const text = typeof result.body === 'string' ? result.text : JSON.stringify(result.body || '');
    const leaked = Boolean(bPropertyId && text.includes(bPropertyId) && entry.target === 'B' && entry.caller.startsWith('A'));
    matrix.push({
      endpoint: entry.endpoint.split('?')[0],
      method: entry.method,
      caller: entry.caller,
      target: entry.target,
      status: result.status,
      dataExposed: leaked,
      mutation: before === undefined ? false : before !== after,
    });
  }
  const bPayCount = async () => Payment.countDocuments({ companyId: companyB.companyId });
  if (bPropertyId) {
    await probe({ endpoint: `/api/properties/${bPropertyId}`, method: 'GET', caller: 'A admin', target: 'B', token: testCo.token });
    await probe({ endpoint: `/api/properties/${propertyId}`, method: 'GET', caller: 'A admin', target: 'A', token: testCo.token });
    await probe({ endpoint: `/api/properties/${bPropertyId}`, method: 'GET', caller: 'B admin', target: 'B', token: companyB.token });
  }
  if (bOwnerId) await probe({ endpoint: `/api/property-owners/${bOwnerId}`, method: 'GET', caller: 'A admin', target: 'B', token: testCo.token });
  if (ownerId) await probe({ endpoint: `/api/property-owners/${ownerId}`, method: 'GET', caller: 'A admin', target: 'A', token: testCo.token });
  if (bApp) {
    await probe({ endpoint: `/api/ecosystem/agency/applications/${bApp._id}/status`, method: 'POST', caller: 'A agent', target: 'B', token: agent.token, body: { status: 'UNDER_REVIEW' } });
    await probe({ endpoint: '/api/ecosystem/agency/applications', method: 'GET', caller: 'A admin', target: 'A list', token: testCo.token });
  }
  if (bLeaseId) await probe({ endpoint: `/api/leases/${bLeaseId}`, method: 'GET', caller: 'A admin', target: 'B', token: testCo.token });
  if (leaseId) await probe({ endpoint: `/api/leases/${leaseId}`, method: 'GET', caller: 'A admin', target: 'A', token: testCo.token });
  await probe({
    endpoint: '/api/accountants/payments', method: 'POST', caller: 'A admin', target: 'B', token: testCo.token,
    body: { paymentType: 'rental', paymentDate: '2026-08-11', paymentMethod: 'cash', amount: 10, currency: 'USD', propertyId: bPropertyId, tenantId: bTenantId, rentalPeriodMonth: 8, rentalPeriodYear: 2026 },
    mutationCheck: bPayCount,
  });
  if (paymentId) await probe({ endpoint: `/api/accountants/payments/${paymentId}`, method: 'GET', caller: 'B admin', target: 'A', token: companyB.token });
  if (paymentId) await probe({ endpoint: `/api/accountants/payments/${paymentId}`, method: 'GET', caller: 'A admin', target: 'A', token: testCo.token });
  await probe({ endpoint: '/api/agents/letting/maintenance-payment-requests', method: 'POST', caller: 'A agent', target: 'B', token: agent.token, body: { quoteId: String(quote._id), propertyId: bPropertyId, amount: 10 } });
  if (bLevyId) {
    await probe({ endpoint: `/api/levy-payments/${bLevyId}/receipt`, method: 'GET', caller: 'A admin', target: 'B', token: testCo.token });
    await probe({ endpoint: `/api/agents/letting/levies/${bLevyId}/receipt`, method: 'POST', caller: 'A agent', target: 'B', token: agent.token, body: { receiptNumber: 'CROSS' } });
  }
  if (levyId) await probe({ endpoint: `/api/levy-payments/${levyId}/receipt`, method: 'GET', caller: 'A admin', target: 'A', token: testCo.token });
  await probe({ endpoint: '/api/accountants/owner-collections', method: 'POST', caller: 'A accountant', target: 'B', token: accountant.token, body: { propertyId: bPropertyId, operationalAmount: 1 } });
  await probe({ endpoint: '/api/accountants/owner-collections', method: 'GET', caller: 'A accountant', target: 'A', token: accountant.token });
  await probe({ endpoint: '/api/properties', method: 'GET', caller: 'unauthenticated', target: 'any', token: null });
  await probe({ endpoint: `/api/accountants/payments/${paymentId}`, method: 'GET', caller: 'A owner role', target: 'A', token: ownerUser.token });
  if (bPropertyId) await probe({ endpoint: `/api/properties/${bPropertyId}`, method: 'GET', caller: 'A owner role', target: 'B', token: ownerUser.token });
  await probe({ endpoint: `/api/agents/letting/properties/${bPropertyId}/workspace`, method: 'GET', caller: 'A agent', target: 'B', token: agent.token });
  await probe({ endpoint: `/api/agents/letting/properties/${propertyId}/workspace`, method: 'GET', caller: 'A agent', target: 'A', token: agent.token });
  evidence.securityMatrix = matrix;
  evidence.viewingFixtureId = bViewing ? String(bViewing._id) : null;
  save();

  const collection = await call('owner collection', 'POST', '/api/accountants/owner-collections', accountant.token, { propertyId });
  evidence.ownerCollection = { status: collection.status, body: redact(collection.body) };

  const workspace = await call('workspace', 'GET', `/api/agents/letting/properties/${propertyId}/workspace`, agent.token);
  const assessment = await call('assessment', 'POST', '/api/agents/letting/assessments', agent.token, { propertyId, recommendedRent: 1000, condition: 'good' });
  const assessmentId = assessment.body?.data?._id;
  const submitted = assessmentId ? await call('submit assessment', 'POST', `/api/agents/letting/assessments/${assessmentId}/status`, agent.token, { status: 'ASSESSMENT_SUBMITTED' }) : null;
  const juniorDecision = assessmentId ? await call('junior owner decision denied', 'POST', `/api/agents/letting/assessments/${assessmentId}/status`, junior.token, { status: 'OWNER_APPROVED', approvedRent: 1000 }) : null;
  const approved = assessmentId ? await call('senior owner decision', 'POST', `/api/agents/letting/assessments/${assessmentId}/status`, agent.token, { status: 'OWNER_APPROVED', approvedRent: 1000 }) : null;
  const mandate = await call('mandate', 'POST', '/api/agents/letting/mandates', agent.token, { propertyId });
  const mandateId = mandate.body?.data?._id;
  const listingBlocked = await call('listing before mandate', 'POST', '/api/agents/letting/listings', agent.token, { propertyId, platform: 'PHASE4B1 board', status: 'ACTIVE' });
  evidence.agencyApi = {
    workspace: workspace.status,
    assessment: assessment.status,
    submitted: submitted?.status,
    juniorDenied: juniorDecision?.status,
    approved: approved?.status,
    mandate: mandate.status,
    mandateId,
    listingBlocked: listingBlocked.status,
  };

  const sentinelNow = evidence.historicalSentinel
    ? await Payment.findById(evidence.historicalSentinel.id).select('status amount accountingComplete updatedAt').lean()
    : null;
  evidence.historicalAfter = sentinelNow ? {
    id: String(sentinelNow._id),
    status: sentinelNow.status,
    amount: sentinelNow.amount,
    accountingComplete: (sentinelNow as any).accountingComplete,
    updatedAt: (sentinelNow as any).updatedAt,
    unchanged: sentinelNow.status === evidence.historicalSentinel.status
      && Number(sentinelNow.amount) === Number(evidence.historicalSentinel.amount)
      && (sentinelNow as any).accountingComplete === evidence.historicalSentinel.accountingComplete,
  } : null;
  evidence.paymentCountAfter = await Payment.countDocuments({});
  evidence.finishedAt = new Date().toISOString();
  evidence.cleanup = 'Retained. Journal entries are immutable, so disposable PHASE4B1 companies were not deleted.';
  save();
  console.log(JSON.stringify({
    out: OUT,
    paymentId: evidence.borrowdale?.paymentId,
    accountingComplete: evidence.borrowdale?.persisted?.accountingComplete,
    ownerPayable: evidence.borrowdale?.persisted?.ownerPayable,
    waterfall: evidence.borrowdale?.persisted?.waterfall,
    notice: evidence.notification?.scenario1,
    optOut: evidence.notification?.scenario3,
    incomplete: evidence.notification?.scenario4,
    mail: evidence.notification?.scenario5,
    securityCases: matrix.length,
  }));
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (error) => {
  evidence.fatal = String(error?.stack || error);
  save();
  console.error(evidence.fatal);
  try { await mongoose.disconnect(); } catch { /* ignore */ }
  process.exit(1);
});
