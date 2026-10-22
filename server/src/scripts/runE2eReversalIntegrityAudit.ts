/**
 * Disposable-local end-to-end reversal integrity audit.
 * Refuses any database that is not a uniquely named local mantis_e2e_reversal_audit_* database.
 * Email and payment-provider calls are blocked. This file is an audit harness, not a production change.
 */
const RUN_ID = Date.now().toString(36);
const MAIN_DB = `mantis_e2e_reversal_audit_${RUN_ID}`;
const ACCT_DB = `mantis_e2e_reversal_audit_acct_${RUN_ID}`;
const MAIN_URI = `mongodb://127.0.0.1:27017/${MAIN_DB}`;
const ACCT_URI = `mongodb://127.0.0.1:27017/${ACCT_DB}`;
const MARKER = `E2E-REVERSAL-AUDIT-${RUN_ID}`;
const PAYMENT_DATE = '2026-10-15';
const PERIOD = { month: 10, year: 2026 };

process.env.NODE_ENV = 'development';
process.env.MANTIS_TEST_SEAM = '1';
process.env.ACCOUNTING_DASHBOARD_CACHE_TTL_MS = '0';
process.env.MONGODB_URI = MAIN_URI;
process.env.ACCOUNTING_DB_URI = ACCT_URI;
process.env.MONGODB_URI_PROPERTY = MAIN_URI;
process.env.MONGODB_URI_ACCOUNTING = ACCT_URI;
delete process.env.ACCOUNTING_PERIOD_LOCK_BEFORE;
delete process.env.AZURE_COSMOS_CONNECTIONSTRING;
delete process.env.CUSTOMCONNSTR_MONGODB_URI;
delete process.env.CUSTOMCONNSTR_MONGODB_URI_PROPERTY;
delete process.env.CUSTOMCONNSTR_ACCOUNTING_DB_URI;
delete process.env.CUSTOMCONNSTR_MONGODB_URI_ACCOUNTING;
delete process.env.FORCE_DB_URI;

const BLOCKED_ENV = [
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM',
  'SMTP_HOST_MANTIS', 'SMTP_PORT_MANTIS', 'SMTP_USER_MANTIS', 'SMTP_PASS_MANTIS', 'SMTP_FROM_MANTIS',
  'RESEND_API_KEY', 'RESEND_API_KEY_MANTIS', 'SENDGRID_API_KEY', 'SENDGRID_API_KEY_MANTIS',
  'MAILGUN_API_KEY', 'MAILGUN_API_KEY_MANTIS', 'MAILGUN_DOMAIN', 'MAILGUN_DOMAIN_MANTIS',
  'MAILTRAP_API_TOKEN', 'MAILTRAP_API_TOKEN_MANTIS', 'MAILTRAP_FROM_EMAIL', 'MAILTRAP_FROM_EMAIL_MANTIS',
  'PAYNOW_INTEGRATION_ID', 'PAYNOW_INTEGRATION_KEY', 'PAYNOW_RESULT_URL', 'PAYNOW_RETURN_URL', 'PAYNOW_MODE',
  'EMAIL_STRICT', 'EMAIL_REQUIRE_PROVIDER'
];
for (const key of BLOCKED_ENV) process.env[key] = '';

type Status = 'PASS' | 'FAIL' | 'UNVERIFIED';
type Evidence = {
  name: string;
  status: Status;
  expected: string;
  actual: string;
  ids?: Record<string, string>;
  persisted?: string[];
};

const results: Evidence[] = [];
const capturedMail: Array<{ to?: string; subject?: string; text?: string }> = [];
const blockedExternal: string[] = [];
let mailShouldFail = false;

function record(row: Evidence) {
  results.push(row);
  console.error(`[${row.status}] ${row.name}`);
}

function assertDisposable(uri: string, expectedName: string) {
  const parsed = new URL(uri);
  const host = parsed.hostname.toLowerCase();
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, '')).toLowerCase();
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(`Refusing audit: host is not local (${host})`);
  }
  if (name !== expectedName || !/^mantis_e2e_reversal_audit(_acct)?_[a-z0-9]+$/.test(name)) {
    throw new Error(`Refusing audit: database ${name} is not the disposable run database`);
  }
  if (/prod|cosmos|azure|live|property-management|^accounting$/.test(name)) {
    throw new Error(`Refusing audit: database name is not disposable (${name})`);
  }
}

function near(actual: number, expected: number, tolerance = 0.02) {
  return Math.abs(Number(actual || 0) - Number(expected || 0)) <= tolerance;
}

function money(value: unknown) {
  return Number(Number(value || 0).toFixed(2));
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

async function main() {
  assertDisposable(MAIN_URI, MAIN_DB);
  assertDisposable(ACCT_URI, ACCT_DB);

  const mongoose = (await import('mongoose')).default;
  const emailService = await import('../services/emailService');
  const sendTarget: any = (emailService as any).sendMail ? emailService : (emailService as any).default;
  sendTarget.sendMail = async (params: { to?: string; subject?: string; text?: string }) => {
    capturedMail.push({ to: params.to, subject: params.subject, text: params.text });
    if (mailShouldFail) {
      mailShouldFail = false;
      throw new Error('AUDIT_INJECTED_MAIL_FAILURE');
    }
  };
  const originalFetch = globalThis.fetch?.bind(globalThis);
  globalThis.fetch = (async (input: any, init?: any) => {
    const raw = typeof input === 'string' ? input : input?.url;
    const host = new URL(String(raw)).hostname.toLowerCase();
    if (host !== '127.0.0.1' && host !== 'localhost') {
      blockedExternal.push(host);
      throw new Error(`Blocked external request to ${host}`);
    }
    if (!originalFetch) throw new Error('No local fetch implementation');
    return originalFetch(input, init);
  }) as typeof fetch;

  const emailStatus = sendTarget.getEmailConfigStatus();
  if (emailStatus.anyProviderConfigured || emailStatus.smtpConfigured) {
    throw new Error('Refusing audit: an email provider is still configured');
  }
  if (String(process.env.PAYNOW_INTEGRATION_ID || '').trim() || String(process.env.PAYNOW_INTEGRATION_KEY || '').trim()) {
    throw new Error('Refusing audit: Paynow credentials are still configured');
  }

  const { accountingConnection } = await import('../config/database');
  const { Company } = await import('../models/Company');
  const { User } = await import('../models/User');
  const { Property } = await import('../models/Property');
  const { Tenant } = await import('../models/Tenant');
  const { Lease } = await import('../models/Lease');
  const { Payment } = await import('../models/Payment');
  const { PropertyOwner } = await import('../models/PropertyOwner');
  const { OwnerRentNotice } = await import('../models/OwnerRentNotice');
  const { TaxObligation } = await import('../models/TaxObligation');
  const { VatRecord } = await import('../models/VatRecord');
  const { JournalEntry } = await import('../models/JournalEntry');
  const { JournalLine } = await import('../models/JournalLine');
  const { CompanyAccount } = await import('../models/CompanyAccount');
  const { AgentAccount } = await import('../models/AgentAccount');
  const PropertyAccount = (await import('../models/PropertyAccount')).default;
  const { createPayment, updatePaymentStatus, reversePayment } = await import('../controllers/paymentController');
  const { getDashboardSummary, getVatStatus, getDashboardOutstanding } = await import('../controllers/accountingController');
  const { getPropertyTransactions } = await import('../controllers/propertyAccountController');
  const { CommissionService } = await import('../services/commissionService');
  const { ensureSystemTaxRules } = await import('../services/taxRuleRegistry');
  const { resolveCommissionVatPolicy } = await import('../services/vatPolicyService');
  const { reconcilePayment } = await import('../services/paymentAccountingReconciliation');
  const { prepareVatReturn } = await import('../services/vatReturnService');
  const { sumRentalPeriodReservation, sumRentCoverageForPeriod } = await import('../services/rentalPeriodCoverage');
  const { createPaymentAccountant, createPaymentPublic } = await import('../controllers/paymentController');
  const { createAgentPayment } = await import('../controllers/agentController');
  const { evaluatePermanentAccountingPolicy, completedPaymentRequiresFinalizedCommission } = await import('../services/accountingPostingPolicy');
  const { buildExpectedAccountingProjection } = await import('../services/paymentAccountingProjection');
  const accountingService = (await import('../services/accountingService')).default;

  await mongoose.connect(MAIN_URI, { serverSelectionTimeoutMS: 8000, autoIndex: false });
  await accountingConnection.openUri(ACCT_URI, { serverSelectionTimeoutMS: 8000 });
  const mainName = String(mongoose.connection.name || '');
  const acctName = String(accountingConnection.name || '');
  const mainHost = String(mongoose.connection.host || '');
  if (mainName !== MAIN_DB || acctName !== ACCT_DB || (mainHost !== '127.0.0.1' && mainHost !== 'localhost')) {
    throw new Error(`Refusing audit after connect: main=${mainHost}/${mainName} accounting=${acctName}`);
  }
  await mongoose.connection.dropDatabase();
  await accountingConnection.dropDatabase();
  await ensureSystemTaxRules();
  await Promise.all([
    JournalEntry.syncIndexes(),
    JournalLine.syncIndexes(),
    TaxObligation.syncIndexes(),
    VatRecord.syncIndexes(),
    Payment.syncIndexes(),
    OwnerRentNotice.syncIndexes(),
  ]);

  const accountant = await User.create({
    email: `e2e-accountant-${RUN_ID}@example.test`,
    password: 'test-pass-1',
    firstName: 'Audit',
    lastName: 'Accountant',
    role: 'accountant',
    roles: ['accountant'],
    isActive: true,
    sessionVersion: 1,
  });
  const agent = await User.create({
    email: `e2e-agent-${RUN_ID}@example.test`,
    password: 'test-pass-1',
    firstName: 'Audit',
    lastName: 'Agent',
    role: 'agent',
    roles: ['agent'],
    isActive: true,
    sessionVersion: 1,
  });
  const company = await Company.create({
    name: `E2E Reversal Audit ${RUN_ID}`,
    address: '1 Audit Lane',
    phone: '0770000001',
    email: `e2e-company-${RUN_ID}@example.test`,
    registrationNumber: `E2E-${RUN_ID}`,
    tinNumber: `E2E-TIN-${RUN_ID}`,
    country: 'Zimbabwe',
    ownerId: accountant._id,
    workspaceType: 'agency',
    taxProfile: {
      vatRegistered: true,
      vatNumber: `ZW-E2E-${RUN_ID}`,
      vatRegistrationEffectiveDate: new Date('2020-01-01T00:00:00.000Z'),
    },
    commissionConfig: {
      preaPercentOfTotal: 0.03,
      agentPercentOfRemaining: 0.6,
      agencyPercentOfRemaining: 0.4,
    },
  });
  accountant.companyId = company._id;
  agent.companyId = company._id;
  await accountant.save();
  await agent.save();

  const property = await Property.create({
    companyId: company._id,
    ownerId: accountant._id,
    agentId: agent._id,
    name: `E2E House ${RUN_ID}`,
    address: `1 ${MARKER} Road`,
    rentalType: 'management',
    rent: 1800,
    commission: 15,
    vatOnCommission: true,
    vatCommissionTreatment: 'exclusive',
  });
  const tenant = await Tenant.create({
    firstName: 'Audit',
    lastName: 'Tenant',
    email: `e2e-tenant-${RUN_ID}@example.test`,
    phone: '0770000002',
    companyId: company._id,
    ownerId: accountant._id,
    status: 'Active',
  });
  const lease = await Lease.create({
    propertyId: property._id,
    tenantId: tenant._id,
    companyId: company._id,
    ownerId: accountant._id,
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    endDate: new Date('2027-12-31T00:00:00.000Z'),
    rentAmount: 1800,
    depositAmount: 0,
    status: 'active',
  });
  await PropertyOwner.create({
    email: `e2e-owner-${RUN_ID}@example.test`,
    password: 'test-pass-1',
    firstName: 'Audit',
    lastName: 'Owner',
    phone: '0770000003',
    companyId: company._id,
    properties: [property._id],
    active: true,
  });

  const actor = {
    userId: String(accountant._id),
    companyId: String(company._id),
    role: 'accountant',
    roles: ['accountant'],
  };
  const paymentDate = new Date(`${PAYMENT_DATE}T10:00:00.000Z`);
  const storedProperty = await Property.findById(property._id).lean();
  const policy = await resolveCommissionVatPolicy({
    companyId: String(company._id),
    paymentDate,
    property: storedProperty,
    requestedVatOnCommission: true,
    requestedTreatment: 'exclusive',
    commissionType: 'management',
  });
  const expectedCalc = await CommissionService.calculateForProperty({
    companyId: company._id,
    grossRent: 1800,
    levy: 0,
    commissionPercentage: Number((storedProperty as any).commission || 0),
    vatOnCommission: policy.apply,
    vatTreatment: policy.treatment === 'COMMISSION_VAT_INCLUSIVE' ? 'inclusive' : 'exclusive',
    vatRate: policy.vatRate,
    paymentDate,
    commissionType: 'management',
  });
  const expected = {
    grossRent: money(expectedCalc.grossRent),
    commission: money(expectedCalc.commissionNet),
    vat: money(expectedCalc.vatAmount),
    ownerPayable: money(expectedCalc.ownerAmount),
    agentCommission: money(expectedCalc.agentShare),
    companyIncome: money(expectedCalc.agencyShare),
    preaFee: money(expectedCalc.preaFee),
    vatRate: Number(policy.vatRate || 0),
    treatment: policy.treatment,
    vatReason: policy.reason,
  };
  console.error(`WATERFALL ${JSON.stringify(expected)}`);

  const periodQuery = () => ({
    companyId: company._id,
    propertyId: property._id,
    tenantId: tenant._id,
    rentalPeriodYear: PERIOD.year,
    rentalPeriodMonth: PERIOD.month,
    leaseId: lease._id,
    currency: 'USD',
  });

  async function coverage(month = PERIOD.month, year = PERIOD.year, currency = 'USD', leaseId: any = lease._id) {
    return sumRentCoverageForPeriod({
      companyId: company._id,
      propertyId: property._id,
      tenantId: tenant._id,
      rentalPeriodYear: year,
      rentalPeriodMonth: month,
      leaseId,
      currency,
    });
  }

  async function snapshot(label: string) {
    const lines = await JournalLine.find({ companyId: company._id }).select('debit credit').lean();
    const debit = money(lines.reduce((sum, line: any) => sum + Number(line.debit || 0), 0));
    const credit = money(lines.reduce((sum, line: any) => sum + Number(line.credit || 0), 0));
    const propertyAccount = await PropertyAccount.findOne({ propertyId: property._id, ledgerType: 'rental' }).lean();
    const companyAccount = await CompanyAccount.findOne({ companyId: company._id }).lean();
    const agentAccount = await AgentAccount.findOne({ agentId: agent._id }).lean();
    const obligations = await TaxObligation.find({ companyId: company._id }).lean();
    const activeTax = obligations.filter((row: any) => String(row.status) !== 'REVERSED');
    const vatLiability = money(activeTax.filter((row: any) => row.taxType === 'VAT_ON_COMMISSION').reduce((sum, row: any) => sum + Number(row.taxAmount || 0), 0));
    const taxObligations = money(activeTax.reduce((sum, row: any) => sum + Number(row.taxAmount || 0), 0));
    const passThrough = ((propertyAccount as any)?.passThroughAccounts || []).reduce((sum: number, row: any) => sum + Number(row.runningBalance || 0), 0);
    const trustJournals = await JournalEntry.countDocuments({ companyId: company._id, sourceModule: 'trust' });
    const dash = await invoke(getDashboardSummary, { user: actor, query: {} });
    const outstanding = await invoke(getDashboardOutstanding, { user: actor, query: {} });
    const vatStatus = await invoke(getVatStatus, { user: actor, query: { filingPeriod: '2026-10' } });
    const statement = await invoke(getPropertyTransactions, { user: actor, params: { propertyId: String(property._id) }, query: { includePayouts: 'true' } });
    return {
      label,
      validRentCoverage: money(await coverage()),
      ownerIncome: money((propertyAccount as any)?.runningBalance),
      agentCommission: money((agentAccount as any)?.runningBalance),
      companyIncome: money((companyAccount as any)?.runningBalance),
      companyTotalIncome: money((companyAccount as any)?.totalIncome),
      vatLiability,
      taxObligations,
      trustBalance: trustJournals === 0 ? null : trustJournals,
      passThroughBalance: (propertyAccount as any)?.passThroughAccounts?.length ? money(passThrough) : null,
      levyBalance: null,
      propertyAccountBalance: money((propertyAccount as any)?.runningBalance),
      companyAccountBalance: money((companyAccount as any)?.runningBalance),
      journalDebit: debit,
      journalCredit: credit,
      journalDifference: money(debit - credit),
      dashboardRevenue: money(dash.body?.totalRevenue),
      dashboardVat: money(dash.body?.vatPayable),
      outstandingRentals: money(outstanding.body?.outstandingRentals),
      statementCount: Array.isArray(statement.body?.data) ? statement.body.data.length : -1,
      statementBalance: money((propertyAccount as any)?.netOwnerBalance),
      vatStatus: vatStatus.body?.data || [],
      obligationCount: obligations.length,
      activeObligationCount: activeTax.length,
    };
  }

  async function settleMail() {
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  function paymentRequest(month: number, year: number, amount = 1800, currency = 'USD', status = 'pending') {
    return {
      user: actor,
      headers: {},
      params: {},
      body: {
        leaseId: String(lease._id),
        amount,
        paymentDate: year === 2026 && month === 10 ? PAYMENT_DATE : `${year}-${String(month).padStart(2, '0')}-15`,
        paymentMethod: 'bank_transfer',
        status,
        rentalPeriodMonth: month,
        rentalPeriodYear: year,
        currency,
        idempotencyKey: `${MARKER}:${month}:${year}:${currency}:${amount}:${new mongoose.Types.ObjectId().toString()}`,
      },
    };
  }

  async function createAndComplete(month: number, year: number, note = '') {
    const created = await invoke(createPayment, paymentRequest(month, year));
    const id = String(created.body?.payment?._id || '');
    if (created.statusCode !== 201 || !id) {
      return { created, completed: null, id };
    }
    if (note) await Payment.updateOne({ _id: id }, { $set: { notes: `${MARKER} ${note}` } });
    const completed = await invoke(updatePaymentStatus, {
      user: actor,
      params: { id },
      body: { status: 'completed', reason: `${MARKER} complete` },
    });
    await settleMail();
    return { created, completed, id };
  }

  const before = await snapshot('before');
  record({
    name: 'environment is a disposable local standalone MongoDB',
    status: 'PASS',
    expected: '127.0.0.1 disposable databases, no replica set, no Cosmos claim',
    actual: `main=${mainHost}/${mainName}; accounting=${acctName}; replicaSet=none`,
  });

  const created = await invoke(createPayment, paymentRequest(PERIOD.month, PERIOD.year));
  const originalId = String(created.body?.payment?._id || '');
  record({
    name: 'create the demo rental through createPayment',
    status: created.statusCode === 201 && originalId ? 'PASS' : 'FAIL',
    expected: 'HTTP 201 pending rental receipt',
    actual: `HTTP ${created.statusCode} ${created.body?.message || ''} accountingComplete=${created.body?.accountingComplete}`,
    ids: { paymentId: originalId },
  });
  if (!originalId) throw new Error('Demo payment was not created');
  await Payment.updateOne({ _id: originalId }, { $set: { notes: MARKER } });
  const pending = await Payment.findById(originalId).lean();
  const pendingCoverage = await coverage();
  record({
    name: 'pending non-correction receipt occupies the period and does not post accounting',
    status: pending?.status === 'pending' && pending?.accountingComplete !== true && pendingCoverage === 1800 ? 'PASS' : 'FAIL',
    expected: 'status pending, accounting not complete, coverage 1800',
    actual: `status=${pending?.status} accountingComplete=${pending?.accountingComplete} coverage=${pendingCoverage}`,
    ids: { paymentId: originalId },
  });

  const completed = await invoke(updatePaymentStatus, {
    user: actor,
    params: { id: originalId },
    body: { status: 'completed', reason: `${MARKER} complete original` },
  });
  await settleMail();
  const posted = await Payment.findById(originalId).lean();
  const postedRecon = await reconcilePayment(originalId);
  record({
    name: 'complete the original payment through updatePaymentStatus',
    status: completed.statusCode === 200 && posted?.status === 'completed' && posted?.accountingComplete === true ? 'PASS' : 'FAIL',
    expected: 'completed and accountingComplete',
    actual: `HTTP ${completed.statusCode} status=${posted?.status} posting=${(posted as any)?.postingStatus} accounting=${posted?.accountingComplete} recon=${postedRecon.status} missing=${(postedRecon.missing || []).join(',')}`,
    ids: { paymentId: originalId, reference: String(posted?.referenceNumber || '') },
    persisted: ['payments', 'journalentries', 'taxobligations', 'vatrecords', 'propertyaccounts', 'companyaccounts', 'agentaccounts'],
  });
  if (posted?.accountingComplete !== true) {
    record({
      name: 'reversal and replacement',
      status: 'UNVERIFIED',
      expected: 'reversal only after accounting settlement',
      actual: 'Stopped because the original payment did not reach accountingComplete',
    });
    throw new Error('Original payment did not settle');
  }

  const originalSnapshot = {
    amount: money(posted?.amount),
    currency: String((posted as any)?.currency || ''),
    commission: JSON.parse(JSON.stringify((posted as any)?.commissionDetails || {})),
    vatRate: (posted as any)?.vatOnCommissionRate,
    ownerAmount: money((posted as any)?.commissionDetails?.ownerAmount),
    vatAmount: money((posted as any)?.commissionDetails?.vatAmount ?? (posted as any)?.commissionDetails?.vatOnCommission),
  };
  const afterOriginal = await snapshot('after-original');
  const originalJournal = await JournalEntry.findOne({ companyId: company._id, sourceModule: 'payment', sourceId: originalId }).lean();
  const originalLines = originalJournal
    ? await JournalLine.find({ journalEntryId: (originalJournal as any)._id }).lean()
    : [];
  const duplicateWhileCovered = await invoke(createPayment, paymentRequest(PERIOD.month, PERIOD.year));
  record({
    name: 'duplicate receipt is blocked while the original covers the period',
    status: duplicateWhileCovered.statusCode === 409 ? 'PASS' : 'FAIL',
    expected: 'HTTP 409',
    actual: `HTTP ${duplicateWhileCovered.statusCode} ${duplicateWhileCovered.body?.message || ''}`,
  });
  record({
    name: 'original waterfall matches the stored commission snapshot',
    status: near(originalSnapshot.amount, expected.grossRent)
      && near(originalSnapshot.commission.commissionNet, expected.commission)
      && near(originalSnapshot.vatAmount, expected.vat)
      && near(originalSnapshot.ownerAmount, expected.ownerPayable)
      && near(originalSnapshot.commission.agentShare, expected.agentCommission)
      && near(originalSnapshot.commission.agencyShare, expected.companyIncome)
      ? 'PASS' : 'FAIL',
    expected: JSON.stringify(expected),
    actual: JSON.stringify(originalSnapshot),
    ids: { paymentId: originalId },
  });

  const vatReturnAfterOriginal = await prepareVatReturn(String(company._id), '2026-10', String(accountant._id));
  record({
    name: 'VAT return after the original receipt uses the active obligation',
    status: near(Number((vatReturnAfterOriginal as any).vatOnCommission || 0), expected.vat)
      && near(Number((vatReturnAfterOriginal as any).taxableSupplies || 0), expected.commission)
      && near(Number((vatReturnAfterOriginal as any).glOutputVat || 0), expected.vat)
      && (vatReturnAfterOriginal as any).reconciliationStatus === 'MATCHED'
      ? 'PASS' : 'FAIL',
    expected: `taxable supplies ${expected.commission}, VAT ${expected.vat}, GL net ${expected.vat}, MATCHED`,
    actual: `vatOnCommission=${(vatReturnAfterOriginal as any).vatOnCommission} outputVat=${(vatReturnAfterOriginal as any).outputVat} glOutputVat=${(vatReturnAfterOriginal as any).glOutputVat} difference=${(vatReturnAfterOriginal as any).reconciliationDifference} taxableSupplies=${(vatReturnAfterOriginal as any).taxableSupplies} status=${(vatReturnAfterOriginal as any).reconciliationStatus}`,
  });

  const reversal = await invoke(reversePayment, {
    user: actor,
    params: { id: originalId },
    body: { reason: `${MARKER} wrong allocation` },
  });
  await settleMail();
  const reversedOriginal = await Payment.findById(originalId).lean();
  const reversalId = String((reversedOriginal as any)?.reversalPaymentId || reversal.body?.reversalPayment?._id || '');
  const reversalDoc = reversalId ? await Payment.findById(reversalId).lean() : null;
  const correctionId = String((reversedOriginal as any)?.correctedPaymentId || reversal.body?.correctedPayment?._id || '');
  const correction = correctionId ? await Payment.findById(correctionId).lean() : null;
  const reversalCount = await Payment.countDocuments({ companyId: company._id, reversalOfPaymentId: originalId, amount: { $lt: 0 } });
  record({
    name: 'reverse the original through reversePayment',
    status: reversal.statusCode === 200
      && String((reversedOriginal as any)?.reversalState || '') === 'reversed'
      && reversalCount === 1
      && reversalDoc
      && correction
      ? 'PASS' : 'FAIL',
    expected: 'HTTP 200, reversalState reversed, one negative reversal, one correction draft',
    actual: `HTTP ${reversal.statusCode} outcome=${reversal.body?.outcome} state=${(reversedOriginal as any)?.reversalState} reversals=${reversalCount} warnings=${JSON.stringify(reversal.body?.warnings || [])}`,
    ids: { paymentId: originalId, reversalId, correctionId },
  });

  const originalAfterReverse = await Payment.findById(originalId).lean();
  const snapshotUnchanged = money(originalAfterReverse?.amount) === originalSnapshot.amount
    && money((originalAfterReverse as any)?.commissionDetails?.ownerAmount) === originalSnapshot.ownerAmount
    && money((originalAfterReverse as any)?.commissionDetails?.vatAmount ?? (originalAfterReverse as any)?.commissionDetails?.vatOnCommission) === originalSnapshot.vatAmount
    && money((originalAfterReverse as any)?.commissionDetails?.agentShare) === money(originalSnapshot.commission.agentShare)
    && String(originalAfterReverse?.status || '') === 'completed';
  record({
    name: 'original amount and financial snapshot stay unchanged',
    status: snapshotUnchanged ? 'PASS' : 'FAIL',
    expected: `amount ${originalSnapshot.amount}, owner ${originalSnapshot.ownerAmount}, VAT ${originalSnapshot.vatAmount}, status completed`,
    actual: `amount=${originalAfterReverse?.amount} owner=${(originalAfterReverse as any)?.commissionDetails?.ownerAmount} vat=${(originalAfterReverse as any)?.commissionDetails?.vatAmount} agent=${(originalAfterReverse as any)?.commissionDetails?.agentShare} status=${originalAfterReverse?.status}`,
  });

  const reversalJournal = await JournalEntry.findOne({ companyId: company._id, sourceModule: 'payment', sourceId: `${originalId}:reversal` }).lean();
  const reversalLines = reversalJournal ? await JournalLine.find({ journalEntryId: (reversalJournal as any)._id }).lean() : [];
  const originalPaired = originalLines.map((line: any) => `${line.accountId}:${money(line.debit)}:${money(line.credit)}`).sort().join('|');
  const reversalPaired = reversalLines.map((line: any) => `${line.accountId}:${money(line.credit)}:${money(line.debit)}`).sort().join('|');
  record({
    name: 'payment journal reversal swaps the original posted lines',
    status: originalLines.length > 0 && originalPaired === reversalPaired ? 'PASS' : 'FAIL',
    expected: 'reversal debits and credits swap the stored original lines',
    actual: `originalLines=${originalLines.length} reversalLines=${reversalLines.length} match=${originalPaired === reversalPaired}`,
    ids: { originalJournalId: String((originalJournal as any)?._id || ''), reversalJournalId: String((reversalJournal as any)?._id || '') },
  });

  const retry = await invoke(reversePayment, {
    user: actor,
    params: { id: originalId },
    body: { reason: `${MARKER} retry` },
  });
  const reversalCountAfterRetry = await Payment.countDocuments({ companyId: company._id, reversalOfPaymentId: originalId, amount: { $lt: 0 } });
  const correctionCount = await Payment.countDocuments({ companyId: company._id, referenceNumber: `CORR-${posted?.referenceNumber}`, isCorrectionEntry: true, reversalOfPaymentId: { $exists: false } });
  const reversalJournalCount = await JournalEntry.countDocuments({ companyId: company._id, sourceModule: 'payment', sourceId: `${originalId}:reversal` });
  record({
    name: 'retrying a settled reversal does not create another reversal, draft, or journal',
    status: retry.statusCode === 200
      && retry.body?.alreadyReversed !== false
      && reversalCountAfterRetry === 1
      && correctionCount === 1
      && reversalJournalCount === 1
      ? 'PASS' : 'FAIL',
    expected: 'one reversal, one draft, one reversal journal',
    actual: `HTTP ${retry.statusCode} outcome=${retry.body?.outcome} reversals=${reversalCountAfterRetry} drafts=${correctionCount} journals=${reversalJournalCount}`,
  });

  const afterReversal = await snapshot('after-reversal');
  const coverageAfterReversal = await coverage();
  const reservationAfterReversal = await sumRentalPeriodReservation(periodQuery());
  const vatReturnAfterReversal = await prepareVatReturn(String(company._id), '2026-10', String(accountant._id));
  record({
    name: 'VAT return after a same-period settled reversal nets the original',
    status: near(Number((vatReturnAfterReversal as any).taxableSupplies || 0), 0)
      && near(Number((vatReturnAfterReversal as any).vatOnCommission || 0), 0)
      && near(Number((vatReturnAfterReversal as any).glOutputVat || 0), 0)
      && (vatReturnAfterReversal as any).reconciliationStatus === 'MATCHED'
      ? 'PASS' : 'FAIL',
    expected: 'taxable supplies 0, VAT obligation 0, GL net 0, MATCHED. Same filing period because the reversal journal is dated today and the original payment is October 2026.',
    actual: `taxableSupplies=${(vatReturnAfterReversal as any).taxableSupplies} vatOnCommission=${(vatReturnAfterReversal as any).vatOnCommission} glOutputVat=${(vatReturnAfterReversal as any).glOutputVat} difference=${(vatReturnAfterReversal as any).reconciliationDifference} status=${(vatReturnAfterReversal as any).reconciliationStatus}`,
  });
  const competingBody = {
    ...paymentRequest(PERIOD.month, PERIOD.year, 1800).body,
    propertyId: String(property._id),
    tenantId: String(tenant._id),
    paymentType: 'rental',
  };
  const agentActor = { ...actor, userId: String(agent._id), role: 'agent', roles: ['agent'] };
  const [competingLease, competingAccountant, competingPublic, competingAgent] = await Promise.all([
    invoke(createPayment, { ...paymentRequest(PERIOD.month, PERIOD.year, 1800), body: competingBody }),
    invoke(createPaymentAccountant, { user: actor, body: competingBody }),
    invoke(createPaymentPublic, { user: actor, body: { ...competingBody, status: 'pending' } }),
    invoke(createAgentPayment, { user: agentActor, headers: {}, body: { ...competingBody, status: 'pending' } }),
  ]);
  record({
    name: 'fully reversed period no longer counts the original as rent coverage',
    status: coverageAfterReversal === 0 ? 'PASS' : 'FAIL',
    expected: 'coverage 0',
    actual: `coverage=${coverageAfterReversal}`,
  });
  record({
    name: 'pending correction reserves the period and blocks competing receipts',
    status: near(reservationAfterReversal, 1800)
      && competingLease.statusCode === 409
      && competingAccountant.statusCode === 409
      && competingPublic.statusCode === 409
      && competingAgent.statusCode === 409
      ? 'PASS' : 'FAIL',
    expected: 'reservation 1800 and HTTP 409 from lease, accountant, public, and agent creation',
    actual: `reservation=${reservationAfterReversal} lease=${competingLease.statusCode} ${competingLease.body?.message || ''} accountant=${competingAccountant.statusCode} ${competingAccountant.body?.message || ''} public=${competingPublic.statusCode} ${competingPublic.body?.message || ''} agent=${competingAgent.statusCode} ${competingAgent.body?.message || ''}`,
  });

  const earlyComplete = correctionId
    ? null
    : null;
  void earlyComplete;
  const draftBeforeSettlementCheck = correction;
  record({
    name: 'correction draft is pending and does not cover rent',
    status: draftBeforeSettlementCheck
      && draftBeforeSettlementCheck.status === 'pending'
      && String((draftBeforeSettlementCheck as any).postingStatus || '') === 'draft'
      && coverageAfterReversal === 0
      ? 'PASS' : 'FAIL',
    expected: 'pending draft and coverage 0',
    actual: `status=${draftBeforeSettlementCheck?.status} posting=${(draftBeforeSettlementCheck as any)?.postingStatus} coverage=${coverageAfterReversal}`,
    ids: { correctionId },
  });

  const replacement = await invoke(updatePaymentStatus, {
    user: actor,
    params: { id: correctionId },
    body: { status: 'completed', reason: `${MARKER} complete correction` },
  });
  await settleMail();
  const replacementDoc = await Payment.findById(correctionId).lean();
  const replacementRecon = correctionId ? await reconcilePayment(correctionId) : null;
  record({
    name: 'complete the correction draft through updatePaymentStatus',
    status: replacement.statusCode === 200 && replacementDoc?.accountingComplete === true ? 'PASS' : 'FAIL',
    expected: 'HTTP 200 and accountingComplete',
    actual: `HTTP ${replacement.statusCode} ${replacement.body?.message || ''} status=${replacementDoc?.status} accounting=${replacementDoc?.accountingComplete} recon=${replacementRecon?.status} missing=${(replacementRecon?.missing || []).join(',')}`,
    ids: { correctionId, reference: String(replacementDoc?.referenceNumber || '') },
  });

  const afterReplacement = await snapshot('after-replacement');
  const secondDuplicate = await invoke(createPayment, paymentRequest(PERIOD.month, PERIOD.year));
  record({
    name: 'completed correction covers the period and blocks another receipt',
    status: near(afterReplacement.validRentCoverage, 1800) && secondDuplicate.statusCode === 409 ? 'PASS' : 'FAIL',
    expected: 'coverage 1800 and HTTP 409',
    actual: `coverage=${afterReplacement.validRentCoverage} HTTP ${secondDuplicate.statusCode} ${secondDuplicate.body?.message || ''}`,
  });

  const repeatPost = await accountingService.getDashboardSummary(String(company._id));
  void repeatPost;
  const retryAfterReplacement = await invoke(reversePayment, {
    user: actor,
    params: { id: originalId },
    body: { reason: `${MARKER} retry after replacement` },
  });
  const finalReversalCount = await Payment.countDocuments({ companyId: company._id, reversalOfPaymentId: originalId, amount: { $lt: 0 } });
  record({
    name: 'another reversal retry after replacement leaves one reversal',
    status: finalReversalCount === 1 && retryAfterReplacement.statusCode === 200 ? 'PASS' : 'FAIL',
    expected: 'one reversal',
    actual: `HTTP ${retryAfterReplacement.statusCode} reversals=${finalReversalCount}`,
  });

  const uncachedAgency = await accountingService.agencyRevenue(String(company._id));
  const cachedAgency = await accountingService.getDashboardSummary(String(company._id));
  const refreshedAgency = await accountingService.getDashboardSummary(String(company._id));
  const correctionNotices = await OwnerRentNotice.find({
    companyId: company._id,
    paymentId: correctionId,
    idempotencyKey: /^owner-rent-payment:/,
  }).lean();
  const originalNotices = await OwnerRentNotice.find({
    companyId: company._id,
    paymentId: originalId,
    idempotencyKey: /^owner-rent-payment:/,
  }).lean();
  const unfinalizedSample = {
    _id: 'corr-sample',
    status: 'completed',
    paymentType: 'rental',
    amount: 1800,
    agentId: String(agent._id),
    commissionFinalized: false,
    isCorrectionEntry: true,
    referenceNumber: 'CORR-SAMPLE',
    commissionDetails: { agentShare: expected.agentCommission, agencyShare: expected.companyIncome, ownerAmount: expected.ownerPayable },
  };
  const unfinalizedPolicy = evaluatePermanentAccountingPolicy(unfinalizedSample);
  const unfinalizedProjection = buildExpectedAccountingProjection(unfinalizedSample);
  record({
    name: 'an unfinalized correction with stored shares still requires agent and company projections',
    status: completedPaymentRequiresFinalizedCommission(unfinalizedSample)
      && unfinalizedPolicy.skipAgentCommission === false
      && unfinalizedPolicy.skipCompanyCommission === false
      && unfinalizedProjection.agentCommission === true
      && unfinalizedProjection.companyCommission === true
      ? 'PASS' : 'FAIL',
    expected: 'positive shares stay required and an unfinalized completed correction cannot be treated as not applicable',
    actual: `requiresFinalized=${completedPaymentRequiresFinalizedCommission(unfinalizedSample)} skipAgent=${unfinalizedPolicy.skipAgentCommission} skipCompany=${unfinalizedPolicy.skipCompanyCommission} agentRequired=${unfinalizedProjection.agentCommission} companyRequired=${unfinalizedProjection.companyCommission}`,
  });
  record({
    name: 'completed correction restores one owner, agent, and company posting',
    status: near(afterReplacement.ownerIncome, expected.ownerPayable)
      && near(afterReplacement.agentCommission, expected.agentCommission)
      && near(afterReplacement.companyIncome, expected.companyIncome)
      && replacementDoc?.accountingComplete === true
      && replacementDoc?.commissionFinalized === true
      && (replacementDoc as any)?.commissionDetails?.paymentAllocation?.grossAmount
      ? 'PASS' : 'FAIL',
    expected: `owner ${expected.ownerPayable}, agent ${expected.agentCommission}, agency ${expected.companyIncome}, allocation present, accountingComplete`,
    actual: `owner=${afterReplacement.ownerIncome} agent=${afterReplacement.agentCommission} company=${afterReplacement.companyIncome} finalized=${replacementDoc?.commissionFinalized} accounting=${replacementDoc?.accountingComplete} allocation=${(replacementDoc as any)?.commissionDetails?.paymentAllocation?.grossAmount}`,
  });
  record({
    name: 'owner rent-received notice is sent once for the completed correction',
    status: correctionNotices.length === 1
      && correctionNotices[0]?.status === 'SENT'
      && originalNotices.length === 1
      ? 'PASS' : 'FAIL',
    expected: 'one SENT notice for the correction and the original notice is not resent',
    actual: `correctionNotices=${correctionNotices.length}:${correctionNotices.map((row: any) => row.status).join(',')} originalNotices=${originalNotices.length}`,
  });
  record({
    name: 'agency revenue matches company-account income before and after cache refresh',
    status: near(uncachedAgency, expected.companyIncome)
      && near(Number(cachedAgency.totalRevenue || 0), expected.companyIncome)
      && near(Number(refreshedAgency.totalRevenue || 0), expected.companyIncome)
      ? 'PASS' : 'FAIL',
    expected: `agency revenue ${expected.companyIncome} uncached and from the dashboard summary`,
    actual: `uncached=${uncachedAgency} cached=${cachedAgency.totalRevenue} refreshed=${refreshedAgency.totalRevenue}`,
  });
  record({
    name: 'outstanding rent follows settled reversal and completed replacement',
    status: near(before.outstandingRentals, afterOriginal.outstandingRentals + 1800)
      && near(afterReversal.outstandingRentals, before.outstandingRentals)
      && near(afterReplacement.outstandingRentals, afterOriginal.outstandingRentals)
      ? 'PASS' : 'FAIL',
    expected: 'outstanding falls by 1800 after the original, returns after reversal, and falls again after the correction',
    actual: `before=${before.outstandingRentals} afterOriginal=${afterOriginal.outstandingRentals} afterReversal=${afterReversal.outstandingRentals} afterReplacement=${afterReplacement.outstandingRentals}`,
  });
  const vatReturnFinal = await prepareVatReturn(String(company._id), '2026-10', String(accountant._id));
  record({
    name: 'VAT return after the completed correction counts the replacement once',
    status: near(Number((vatReturnFinal as any).taxableSupplies || 0), expected.commission)
      && near(Number((vatReturnFinal as any).vatOnCommission || 0), expected.vat)
      && near(Number((vatReturnFinal as any).glOutputVat || 0), expected.vat)
      && (vatReturnFinal as any).reconciliationStatus === 'MATCHED'
      ? 'PASS' : 'FAIL',
    expected: `taxable supplies ${expected.commission}, VAT ${expected.vat}, GL net ${expected.vat}, MATCHED`,
    actual: `taxableSupplies=${(vatReturnFinal as any).taxableSupplies} vatOnCommission=${(vatReturnFinal as any).vatOnCommission} outputVat=${(vatReturnFinal as any).outputVat} glOutputVat=${(vatReturnFinal as any).glOutputVat} difference=${(vatReturnFinal as any).reconciliationDifference} status=${(vatReturnFinal as any).reconciliationStatus}`,
  });
  const notices = await OwnerRentNotice.find({ companyId: company._id }).lean();
  const originalUnchangedAtEnd = await Payment.findById(originalId).lean();
  const stillUnchanged = money(originalUnchangedAtEnd?.amount) === originalSnapshot.amount
    && money((originalUnchangedAtEnd as any)?.commissionDetails?.vatAmount ?? (originalUnchangedAtEnd as any)?.commissionDetails?.vatOnCommission) === originalSnapshot.vatAmount;

  const primary = {
    before,
    afterOriginal,
    afterReversal,
    afterReplacement,
    expected,
    original: {
      id: originalId,
      reference: posted?.referenceNumber,
      snapshot: originalSnapshot,
      unchanged: snapshotUnchanged && stillUnchanged,
    },
    reversal: {
      id: reversalId,
      reference: reversalDoc?.referenceNumber,
      amount: reversalDoc?.amount,
      reversalOf: String((reversalDoc as any)?.reversalOfPaymentId || ''),
    },
    correction: {
      id: correctionId,
      reference: replacementDoc?.referenceNumber,
      amount: replacementDoc?.amount,
      commission: (replacementDoc as any)?.commissionDetails || null,
      accountingComplete: replacementDoc?.accountingComplete,
    },
    vatReturnFinal: {
      vatOnCommission: (vatReturnFinal as any).vatOnCommission,
      outputVat: (vatReturnFinal as any).outputVat,
      glOutputVat: (vatReturnFinal as any).glOutputVat,
      reconciliationDifference: (vatReturnFinal as any).reconciliationDifference,
      taxableSupplies: (vatReturnFinal as any).taxableSupplies,
      reconciliationStatus: (vatReturnFinal as any).reconciliationStatus,
    },
    notices: notices.map((row: any) => ({
      key: row.idempotencyKey,
      status: row.status,
      paymentId: String(row.paymentId || ''),
      reversalPaymentId: String(row.reversalPaymentId || ''),
    })),
    mail: capturedMail.map((row) => ({ to: row.to, subject: row.subject, text: row.text })),
  };

  async function side(name: string, month: number, year: number, fn: (id: string) => Promise<void>) {
    try {
      const postedSide = await createAndComplete(month, year);
      if (!postedSide.id || postedSide.completed?.statusCode !== 200) {
        record({ name, status: 'FAIL', expected: 'side payment completes', actual: `create ${postedSide.created.statusCode} complete ${postedSide.completed?.statusCode} ${postedSide.completed?.body?.message || postedSide.created.body?.message || ''}` });
        return;
      }
      const sideDoc = await Payment.findById(postedSide.id).select('accountingComplete').lean();
      if (sideDoc?.accountingComplete !== true) {
        record({ name, status: 'FAIL', expected: 'side payment accountingComplete', actual: `accountingComplete=${sideDoc?.accountingComplete}`, ids: { paymentId: postedSide.id } });
        return;
      }
      await fn(postedSide.id);
    } catch (error: any) {
      record({ name, status: 'FAIL', expected: 'side case runs', actual: error?.message || String(error) });
    }
  }

  await side('failure before reversal save then immediate retry', 11, 2026, async (id) => {
    await Payment.updateOne({ _id: id }, { $set: { notes: `${MARKER} PHASE28_FAIL_BEFORE_REVERSAL_SAVE` } });
    const first = await invoke(reversePayment, { user: actor, params: { id }, body: { reason: `${MARKER} PHASE28_FAIL_BEFORE_REVERSAL_SAVE` } });
    const mid = await Payment.findById(id).lean();
    const blocked = await invoke(createPayment, paymentRequest(11, 2026));
    const second = await invoke(reversePayment, { user: actor, params: { id }, body: { reason: `${MARKER} retry immediately` } });
    const after = await Payment.findById(id).lean();
    const count = await Payment.countDocuments({ reversalOfPaymentId: id, amount: { $lt: 0 } });
    const open = String((mid as any)?.reversalState || '') === 'reversal_in_progress' || String((mid as any)?.reversalState || '') === 'reversal_incomplete';
    record({
      name: 'failure before reversal save then immediate retry',
      status: first.statusCode >= 400
        && open
        && blocked.statusCode === 409
        && second.statusCode === 200
        && String((after as any)?.reversalState || '') === 'reversed'
        && count === 1
        ? 'PASS' : 'FAIL',
      expected: 'abandoned in-progress lock with no REV is retried into one settled reversal',
      actual: `first=${first.statusCode} ${first.body?.message || first.body?.outcome || ''} midState=${(mid as any)?.reversalState} blocked=${blocked.statusCode} retry=${second.statusCode} ${second.body?.message || second.body?.outcome || ''} after=${(after as any)?.reversalState} reversals=${count}`,
      ids: { paymentId: id },
    });
  });

  await side('journal reversal failure then retry', 12, 2026, async (id) => {
    await Payment.updateOne({ _id: id }, { $set: { notes: `${MARKER} PHASE27_FAIL_JOURNAL` } });
    const first = await invoke(reversePayment, { user: actor, params: { id }, body: { reason: `${MARKER} PHASE27_FAIL_JOURNAL` } });
    const mid = await Payment.findById(id).lean();
    const blocked = await invoke(createPayment, paymentRequest(12, 2026));
    const draft = (mid as any)?.correctedPaymentId
      ? await invoke(updatePaymentStatus, { user: actor, params: { id: String((mid as any).correctedPaymentId) }, body: { status: 'completed', reason: 'too early' } })
      : { statusCode: 0, body: { message: 'no draft' } };
    const second = await invoke(reversePayment, { user: actor, params: { id }, body: { reason: `${MARKER} retry journal` } });
    const after = await Payment.findById(id).lean();
    const journals = await JournalEntry.countDocuments({ sourceId: `${id}:reversal`, sourceModule: 'payment' });
    record({
      name: 'journal reversal failure then retry',
      status: (first.statusCode === 202 || first.statusCode === 500)
        && String((mid as any)?.reversalState || '') === 'reversal_incomplete'
        && blocked.statusCode === 409
        && draft.statusCode === 409
        && second.statusCode === 200
        && String((after as any)?.reversalState || '') === 'reversed'
        && journals === 1
        ? 'PASS' : 'FAIL',
      expected: 'incomplete first, blocked competing receipt, blocked early correction, settled retry, one reversal journal',
      actual: `first=${first.statusCode} ${first.body?.outcome || ''} mid=${(mid as any)?.reversalState} blocked=${blocked.statusCode} earlyDraft=${draft.statusCode} ${draft.body?.code || draft.body?.message || ''} retry=${second.statusCode} ${second.body?.outcome || ''} after=${(after as any)?.reversalState} journals=${journals}`,
      ids: { paymentId: id },
    });
  });

  await side('tax reversal failure then retry', 1, 2027, async (id) => {
    await Payment.updateOne({ _id: id }, { $set: { notes: `${MARKER} PHASE28_FAIL_TAX` } });
    const first = await invoke(reversePayment, { user: actor, params: { id }, body: { reason: `${MARKER} PHASE28_FAIL_TAX` } });
    const mid = await Payment.findById(id).select('reversalState accountingComplete').lean();
    const second = await invoke(reversePayment, { user: actor, params: { id }, body: { reason: `${MARKER} retry tax` } });
    const after = await Payment.findById(id).select('reversalState').lean();
    const rows = await TaxObligation.countDocuments({ paymentId: id });
    record({
      name: 'tax reversal failure then retry',
      status: (first.statusCode === 202 || first.statusCode === 500)
        && String((mid as any)?.reversalState || '') !== 'reversed'
        && second.statusCode === 200
        && String((after as any)?.reversalState || '') === 'reversed'
        ? 'PASS' : 'FAIL',
      expected: 'first incomplete, retry settled, no duplicate tax rows beyond original plus one reversal',
      actual: `first=${first.statusCode} ${first.body?.outcome || first.body?.message || ''} mid=${(mid as any)?.reversalState} retry=${second.statusCode} ${(second.body?.outcome || '')} after=${(after as any)?.reversalState} obligationRows=${rows}`,
      ids: { paymentId: id },
    });
  });

  await side('company-account reversal failure then retry', 2, 2027, async (id) => {
    await Payment.updateOne({ _id: id }, { $set: { notes: `${MARKER} PHASE27_FAIL_COMPANY` } });
    const first = await invoke(reversePayment, { user: actor, params: { id }, body: { reason: `${MARKER} PHASE27_FAIL_COMPANY` } });
    const mid = await Payment.findById(id).select('reversalState').lean();
    const second = await invoke(reversePayment, { user: actor, params: { id }, body: { reason: `${MARKER} retry company` } });
    const after = await Payment.findById(id).select('reversalState').lean();
    record({
      name: 'separate accounting-connection company reversal failure then retry',
      status: (first.statusCode === 202 || first.statusCode === 500)
        && String((mid as any)?.reversalState || '') === 'reversal_incomplete'
        && second.statusCode === 200
        && String((after as any)?.reversalState || '') === 'reversed'
        ? 'PASS' : 'FAIL',
      expected: 'company reversal failure stays incomplete and retry settles',
      actual: `first=${first.statusCode} ${first.body?.outcome || ''} warnings=${JSON.stringify(first.body?.warnings || [])} mid=${(mid as any)?.reversalState} retry=${second.statusCode} ${second.body?.outcome || ''} after=${(after as any)?.reversalState}`,
      ids: { paymentId: id },
    });
  });

  await side('owner-income reversal failure then retry', 3, 2027, async (id) => {
    await Payment.updateOne({ _id: id }, { $set: { notes: `${MARKER} PHASE_FAIL_REVERSAL_OWNER` } });
    const first = await invoke(reversePayment, { user: actor, params: { id }, body: { reason: `${MARKER} PHASE_FAIL_REVERSAL_OWNER` } });
    const mid = await Payment.findById(id).select('reversalState').lean();
    const second = await invoke(reversePayment, { user: actor, params: { id }, body: { reason: `${MARKER} retry owner` } });
    const after = await Payment.findById(id).select('reversalState').lean();
    record({
      name: 'owner-income reversal failure then retry',
      status: (first.statusCode === 202 || first.statusCode === 500)
        && String((mid as any)?.reversalState || '') === 'reversal_incomplete'
        && second.statusCode === 200
        && String((after as any)?.reversalState || '') === 'reversed'
        ? 'PASS' : 'FAIL',
      expected: 'owner reversal failure stays incomplete and retry settles',
      actual: `first=${first.statusCode} ${first.body?.outcome || ''} mid=${(mid as any)?.reversalState} retry=${second.statusCode} ${second.body?.outcome || ''} after=${(after as any)?.reversalState}`,
      ids: { paymentId: id },
    });
  });

  await side('concurrent reversal attempts', 5, 2027, async (id) => {
    const [a, b] = await Promise.all([
      invoke(reversePayment, { user: actor, params: { id }, body: { reason: `${MARKER} concurrent a` } }),
      invoke(reversePayment, { user: actor, params: { id }, body: { reason: `${MARKER} concurrent b` } }),
    ]);
    const count = await Payment.countDocuments({ reversalOfPaymentId: id, amount: { $lt: 0 } });
    const drafts = await Payment.countDocuments({ companyId: company._id, referenceNumber: new RegExp(`^CORR-`), isCorrectionEntry: true, notes: new RegExp(String((await Payment.findById(id).select('referenceNumber').lean())?.referenceNumber || 'NO-MATCH')) });
    const state = String((await Payment.findById(id).select('reversalState').lean() as any)?.reversalState || '');
    record({
      name: 'concurrent reversal attempts create one reversal',
      status: count === 1
        && (state === 'reversed' || state === 'reversal_incomplete')
        && a.statusCode !== 500
        && b.statusCode !== 500
        ? 'PASS' : 'FAIL',
      expected: 'exactly one negative reversal',
      actual: `responses=${a.statusCode}/${b.statusCode} outcomes=${a.body?.outcome || a.body?.message}/${b.body?.outcome || b.body?.message} reversals=${count} state=${state} matchingDraftNotes=${drafts}`,
      ids: { paymentId: id },
    });
  });

  await side('owner notice failure does not change the payment', 7, 2027, async (id) => {
    const beforeAmount = money((await Payment.findById(id).lean())?.amount);
    await Payment.updateOne({ _id: id }, { $set: { notes: `${MARKER} PHASE4B1_FAIL_MAIL` } });
    mailShouldFail = true;
    const response = await invoke(reversePayment, { user: actor, params: { id }, body: { reason: `${MARKER} notice failure` } });
    await settleMail();
    const afterDoc = await Payment.findById(id).lean();
    const notice = await OwnerRentNotice.findOne({ paymentId: id, idempotencyKey: new RegExp('owner-rent-reversal') }).lean();
    record({
      name: 'owner notice failure does not change the financial payment',
      status: money(afterDoc?.amount) === beforeAmount && response.statusCode < 500 ? 'PASS' : 'FAIL',
      expected: 'payment amount unchanged; notice failure is recorded or the reversal mail path reports failure',
      actual: `HTTP ${response.statusCode} amount=${afterDoc?.amount} state=${(afterDoc as any)?.reversalState} notice=${(notice as any)?.status || 'none'} reason=${(notice as any)?.failureReason || ''}`,
      ids: { paymentId: id },
    });
  });

  const historical = await createAndComplete(6, 2025);
  if (historical.id && historical.completed?.statusCode === 200) {
    const old = await Payment.findById(historical.id).lean();
    const oldVat = money((old as any)?.commissionDetails?.vatAmount ?? (old as any)?.commissionDetails?.vatOnCommission);
    const oldRate = Number((old as any)?.vatOnCommissionRate || 0);
    const response = await invoke(reversePayment, { user: actor, params: { id: historical.id }, body: { reason: `${MARKER} historical rate probe` } });
    const draft = (await Payment.findById(historical.id).lean() as any)?.correctedPaymentId
      ? await Payment.findById((await Payment.findById(historical.id).lean() as any).correctedPaymentId).lean()
      : null;
    const draftVat = money((draft as any)?.commissionDetails?.vatAmount ?? (draft as any)?.commissionDetails?.vatOnCommission);
    const draftRate = Number((draft as any)?.vatOnCommissionRate || 0);
    const juneReturn = await prepareVatReturn(String(company._id), '2025-06', String(accountant._id));
    record({
      name: '2025 receipt keeps its dated VAT rate and a later reversal stays visible',
      status: response.statusCode === 200
        && near(oldRate, 0.15)
        && near(draftRate, oldRate)
        && near(draftVat, oldVat)
        && near(Number((juneReturn as any).vatOnCommission || 0), 0)
        && (juneReturn as any).reconciliationStatus === 'RECONCILIATION_REQUIRED'
        ? 'PASS' : 'FAIL',
      expected: 'draft keeps the June 2025 15% VAT. June obligations net to 0 because both rows are REVERSED. The reversal journal is dated in the reversal month, so the June GL credit remains and the return stays RECONCILIATION_REQUIRED. Amounts are not rewritten.',
      actual: `HTTP ${response.statusCode} originalRate=${oldRate} originalVat=${oldVat} draftRate=${draftRate} draftVat=${draftVat} juneSupplies=${(juneReturn as any).taxableSupplies} juneObligation=${(juneReturn as any).vatOnCommission} juneGl=${(juneReturn as any).glOutputVat} juneDifference=${(juneReturn as any).reconciliationDifference} juneStatus=${(juneReturn as any).reconciliationStatus}`,
      ids: { paymentId: historical.id },
    });
  } else {
    record({
      name: '2025 receipt reversal journal uses stored facts and the draft rate is inspected',
      status: 'UNVERIFIED',
      expected: 'a June 2025 receipt can be posted',
      actual: `create ${historical.created.statusCode} ${historical.created.body?.message || ''} complete ${historical.completed?.statusCode || 0} ${historical.completed?.body?.message || ''}`,
    });
  }

  const zwl = await invoke(createPayment, paymentRequest(9, 2026, 1800, 'ZWL', 'pending'));
  const usdCover = await createAndComplete(9, 2026);
  record({
    name: 'currency isolation',
    status: zwl.statusCode === 201 && usdCover.completed?.statusCode === 200 ? 'PASS' : 'FAIL',
    expected: 'ZWL pending receipt does not stop a USD receipt for the same month',
    actual: `ZWL HTTP ${zwl.statusCode}; USD create ${usdCover.created.statusCode} complete ${usdCover.completed?.statusCode}`,
  });

  const depositAttempt = await invoke(createPayment, paymentRequest(8, 2026, 0));
  record({
    name: 'deposit-only receipt through createPayment',
    status: 'UNVERIFIED',
    expected: 'deposit-only rent coverage is exercised only if this API accepts amount 0',
    actual: `HTTP ${depositAttempt.statusCode} ${depositAttempt.body?.message || depositAttempt.body?.status || ''}`,
  });

  const output = {
    runId: RUN_ID,
    marker: MARKER,
    environment: {
      main: MAIN_URI,
      accounting: ACCT_URI,
      host: mainHost,
      replicaSet: false,
      cosmos: false,
      emailProviderConfigured: false,
      paynowConfigured: false,
      externalHostsBlocked: blockedExternal,
    },
    expected,
    primary,
    results,
  };
  const fs = await import('fs');
  const path = await import('path');
  const outDir = path.join(process.cwd(), 'tmp');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `e2e-reversal-audit-${RUN_ID}.json`);
  fs.writeFileSync(outFile, JSON.stringify(output, null, 2));
  console.log(`EVIDENCE ${outFile}`);
  console.log(JSON.stringify({ runId: RUN_ID, results: results.map((row) => ({ name: row.name, status: row.status, actual: row.actual })) }, null, 2));
  await mongoose.disconnect();
  await accountingConnection.close();
  process.exit(results.some((row) => row.status === 'FAIL') ? 1 : 0);
}

main().catch(async (error) => {
  console.error('AUDIT_ABORTED');
  console.error(error?.stack || error?.message || error);
  console.log(JSON.stringify({ runId: RUN_ID, aborted: true, results }, null, 2));
  process.exit(1);
});
