/**
 * Reversal remediation regression.
 * Classifier and eligibility cases always run.
 * Database cases use a disposable local MongoDB database only.
 * They do not open the application database and they are not Cosmos DB results.
 */
import mongoose from 'mongoose';
import { User } from '../models/User';
import { Company } from '../models/Company';
import { Property } from '../models/Property';
import { Tenant } from '../models/Tenant';
import { Payment } from '../models/Payment';
import { TaxObligation } from '../models/TaxObligation';
import { VatRecord } from '../models/VatRecord';
import { VatReturn } from '../models/VatReturn';
import { JournalEntry } from '../models/JournalEntry';
import { JournalLine } from '../models/JournalLine';
import { LevyPayment } from '../models/LevyPayment';
import PropertyAccount from '../models/PropertyAccount';
import { CompanyAccount } from '../models/CompanyAccount';
import { AgentAccount } from '../models/AgentAccount';
import { PropertyOwner } from '../models/PropertyOwner';
import { OwnerRentNotice } from '../models/OwnerRentNotice';
import { IndividualVatRecord } from '../models/IndividualVatRecord';
import { TrustTransaction } from '../models/TrustTransaction';
import { CommissionService } from '../services/commissionService';
import { toPaymentCommissionSnapshot } from '../services/propertyCommissionCalculator';
import { commissionVatFlagsFromPolicy, resolveCommissionVatPolicy } from '../services/vatPolicyService';
import { ensureSystemTaxRules } from '../services/taxRuleRegistry';
import { ensurePaymentAccountingPosted } from '../services/paymentAccountingReconciliation';
import { postPaymentAccounting, reversePaymentAccounting } from '../services/paymentAccountingOrchestrator';
import accountingIntegrationService from '../services/accountingIntegrationService';
import { evaluatePermanentAccountingPolicy, shouldAttemptAccountingReversal } from '../services/accountingPostingPolicy';
import {
  applyPaymentStatusFilter,
  assertCorrectionDraftCanComplete,
  canStartPaymentReversal,
  hasReversalInEffect,
  isReversalDocument
} from '../services/paymentReversalPolicy';
import { matchingJournalIdentity } from '../services/journalDuplicateKey';
import { outstandingForObligation } from '../services/taxObligationService';
import { reversePayment, updatePayment, updatePaymentStatus } from '../controllers/paymentController';
import { notifyOwnerOfRentPayment, notifyOwnerOfRentReversal } from '../services/ownerRentNotificationService';
import trustPaymentPostingService from '../services/trustPaymentPostingService';
import propertyAccountService from '../services/propertyAccountService';
import { accountingConnection } from '../config/database';
const DB = process.env.REVERSAL_REMEDIATION_DB || 'mongodb://127.0.0.1:27017/mantis_reversal_remediation_test';
const ACCOUNTING_DB = process.env.REVERSAL_REMEDIATION_ACCOUNTING_DB || 'mongodb://127.0.0.1:27017/mantis_reversal_remediation_accounting';
const PAYMENT_DATE = new Date('2026-10-13T10:00:00.000Z');
const failures: string[] = [];
const notes: string[] = [];
const ledgerEvidence: string[] = [];

function stage(message: string) {
  console.error(`[reversal-remediation] ${message}`);
}

function assert(condition: boolean, message: string) {
  if (!condition) failures.push(message);
}

function near(actual: number, expected: number, message: string) {
  if (Math.abs(Number(actual) - Number(expected)) > 0.02) {
    failures.push(`${message} (actual ${actual}, expected ${expected})`);
  }
}

function assertDisposable(uri: string, label: string) {
  const value = String(uri || '');
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} is not a MongoDB URI`);
  }
  const host = parsed.hostname.toLowerCase();
  const name = parsed.pathname.replace(/^\//, '').toLowerCase();
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(`Refusing ${label}: host is not local`);
  }
  if (!name || /prod|cosmos|azure|live/.test(name)) {
    throw new Error(`Refusing ${label}: database name is not a disposable test database`);
  }
}

function blankEmailProviders() {
  for (const key of [
    'SMTP_HOST', 'SMTP_HOST_MANTIS', 'SMTP_USER', 'SMTP_USER_MANTIS', 'SMTP_PASS', 'SMTP_PASS_MANTIS',
    'RESEND_API_KEY', 'RESEND_API_KEY_MANTIS', 'SENDGRID_API_KEY', 'SENDGRID_API_KEY_MANTIS',
    'MAILGUN_API_KEY', 'MAILGUN_API_KEY_MANTIS', 'MAILGUN_DOMAIN', 'MAILGUN_DOMAIN_MANTIS',
    'MAILTRAP_API_TOKEN', 'MAILTRAP_API_TOKEN_MANTIS'
  ]) {
    delete process.env[key];
  }
}

function financeReq(userId: string, companyId: string, paymentId: string, body: Record<string, unknown> = {}) {
  return {
    user: { userId, companyId, role: 'admin', roles: ['admin'] },
    params: { id: paymentId },
    body
  } as any;
}

async function invoke(handler: any, req: any) {
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) { this.statusCode = code; return this; },
    json(body: any) { this.body = body; return this; }
  };
  await handler(req, res);
  return res;
}

function runPureCases() {
  assert(isReversalDocument({ reversalOfPaymentId: 'a', amount: 10 }) === true, 'reversalOfPaymentId marks a reversal document');
  assert(isReversalDocument({ amount: -1 }) === true, 'a negative amount marks a reversal document');
  assert(canStartPaymentReversal({ reversalOfPaymentId: 'a', status: 'completed', postingStatus: 'posted' }).ok === false, 'a reversal document cannot start another reversal');
  assert(canStartPaymentReversal({ reversalPaymentId: 'rev', status: 'completed', postingStatus: 'posted' }).ok === false, 'an original with a reversal cannot start another reversal');
  assert(canStartPaymentReversal({ reversalState: 'reversal_incomplete', status: 'completed', postingStatus: 'posted' }).ok === false, 'an incomplete reversal cannot start another reversal');
  assert(canStartPaymentReversal({ status: 'completed', postingStatus: 'posted', amount: 10 }).ok === true, 'an ordinary posted payment can be reversed');
  assert(hasReversalInEffect({ reversalState: 'reversal_in_progress', status: 'completed', amount: 10 }) === true, 'in-progress reversal is in effect');
  assert(evaluatePermanentAccountingPolicy({
    status: 'completed', amount: 1800, reversalPaymentId: 'rev', postingStatus: 'posted'
  }).reason === 'reversed_original', 'a reversed original is denied ordinary posting');
  assert(evaluatePermanentAccountingPolicy({
    status: 'completed', amount: -1800, reversalOfPaymentId: 'orig', postingStatus: 'posted'
  }).reason === 'reversal_row', 'a reversal row is denied ordinary posting');
  assert(shouldAttemptAccountingReversal({ reversalOfPaymentId: 'orig', amount: -1 }) === false, 'accounting reversal does not run on a reversal document');
  assert(shouldAttemptAccountingReversal({ reversalState: 'reversal_incomplete', status: 'completed', amount: 10 }) === true, 'an incomplete original can resume reversal');
  const unrelated = matchingJournalIdentity({
    code: 11000,
    keyPattern: { description: 1 },
    keyValue: { description: 'unrelated' }
  }, [{ companyId: 'c', sourceModule: 'payment', sourceId: 'p:reversal', reference: 'REV-P' }]);
  assert(unrelated == null, 'an unrelated duplicate key is not treated as a successful reversal');
  assert(matchingJournalIdentity({ code: 11000, message: 'E11000 duplicate key error' }, [{
    companyId: 'c', sourceModule: 'payment', sourceId: 'p:reversal', reference: 'REV-P'
  }]) == null, 'a duplicate key without index metadata fails closed');

  const reversedFilter: Record<string, any> = { companyId: 'c' };
  applyPaymentStatusFilter(reversedFilter, 'reversed');
  assert(Array.isArray(reversedFilter.$and) && reversedFilter.status == null, 'reversed filter uses reversal metadata');
  const pendingFilter: Record<string, any> = {};
  applyPaymentStatusFilter(pendingFilter, 'pending');
  assert(pendingFilter.status === 'pending', 'pending filter stays a status filter');
}

async function main() {
  runPureCases();
  blankEmailProviders();
  process.env.MANTIS_TEST_SEAM = '1';
  process.env.NODE_ENV = 'development';
  delete process.env.ACCOUNTING_PERIOD_LOCK_BEFORE;
  assertDisposable(DB, 'remediation database');
  assertDisposable(ACCOUNTING_DB, 'remediation accounting database');
  try {
    await mongoose.connect(DB, { serverSelectionTimeoutMS: 4000 });
  } catch (error: any) {
    notes.push(`INTEGRATION SKIPPED: local MongoDB unavailable (${error?.message || error}). Pure cases still ran. This is not a Cosmos DB result.`);
    finish();
    return;
  }
  stage('connected');
  await mongoose.connection.dropDatabase();
  stage('main database reset');
  await accountingConnection.openUri(ACCOUNTING_DB, { serverSelectionTimeoutMS: 4000 });
  stage('accounting connected');
  await accountingConnection.dropDatabase();
  stage('accounting database reset');
  await ensureSystemTaxRules();
  stage('tax rules ready');
  await Payment.syncIndexes();
  await JournalEntry.syncIndexes();
  await JournalLine.syncIndexes();
  await VatRecord.syncIndexes();
  await TaxObligation.syncIndexes();

  const user = await User.create({
    email: 'reversal-remediation@example.test',
    password: 'test-pass-1',
    firstName: 'Remediation',
    lastName: 'Accountant',
    role: 'admin',
    roles: ['admin'],
    isActive: true,
    sessionVersion: 1
  });
  const company = await Company.create({
    name: 'Remediation Agency',
    address: '1 Remediation Street',
    phone: '0770000091',
    email: 'remediation@example.test',
    registrationNumber: 'REM-REV-1',
    tinNumber: 'REM-REV-TIN',
    country: 'Zimbabwe',
    ownerId: user._id,
    workspaceType: 'agency',
    taxProfile: { vatRegistered: true, vatNumber: 'ZW-REM', vatRegistrationEffectiveDate: new Date('2020-01-01T00:00:00.000Z') }
  });
  const property = await Property.create({
    companyId: company._id,
    ownerId: user._id,
    name: 'Remediation House',
    address: '1 Remediation Road',
    rentalType: 'management',
    rent: 1800,
    commission: 15,
    vatOnCommission: true,
    vatCommissionTreatment: 'exclusive'
  });
  const tenant = await Tenant.create({
    firstName: 'Remediation',
    lastName: 'Tenant',
    email: 'remediation-tenant@example.test',
    phone: '0771111191',
    companyId: company._id,
    ownerId: user._id,
    status: 'Active'
  });
  const owner = await PropertyOwner.create({
    email: 'remediation-owner@example.test',
    password: 'test-pass-1',
    firstName: 'Olive',
    lastName: 'Owner',
    phone: '0772222291',
    companyId: company._id,
    properties: [property._id],
    active: true
  });
  const policy = await resolveCommissionVatPolicy({
    companyId: String(company._id),
    paymentDate: PAYMENT_DATE,
    property,
    requestedVatOnCommission: true,
    requestedTreatment: 'exclusive',
    commissionType: 'management'
  });
  const flags = commissionVatFlagsFromPolicy(policy);
  const calc = await CommissionService.calculateForProperty({
    companyId: company._id,
    grossRent: 1800,
    levy: 0,
    commissionPercentage: 15,
    vatOnCommission: flags.vatOnCommission,
    vatTreatment: flags.vatTreatment,
    vatRate: flags.vatRate,
    paymentDate: PAYMENT_DATE,
    commissionType: 'management'
  });

  async function postedPayment(referenceNumber: string, extra: Record<string, unknown> = {}) {
    const payment = await Payment.create({
      companyId: company._id,
      propertyId: property._id,
      tenantId: tenant._id,
      agentId: user._id,
      processedBy: user._id,
      propertyType: 'residential',
      amount: 1800,
      depositAmount: 0,
      paymentType: 'rental',
      paymentMethod: 'bank_transfer',
      status: 'completed',
      paymentDate: PAYMENT_DATE,
      rentalPeriodMonth: 10,
      rentalPeriodYear: 2026,
      transactionDomain: 'RENTAL',
      commissionFinalized: true,
      accountingStatus: 'pending',
      accountingComplete: false,
      applyVatOnCommission: flags.vatOnCommission,
      vatOnCommissionRate: flags.vatRate,
      vatCommissionTreatment: flags.vatTreatment,
      commissionDetails: toPaymentCommissionSnapshot(calc),
      referenceNumber,
      idempotencyKey: `rem:${referenceNumber}:${new mongoose.Types.ObjectId().toString()}`,
      ...extra
    });
    stage(`posting ${referenceNumber}`);
    await ensurePaymentAccountingPosted(String(payment._id), { createdBy: String(user._id) });
    stage(`posted ${referenceNumber}`);
    return Payment.findById(payment._id);
  }

  stage('fixtures ready');
  const payment = await postedPayment('REM-MAIN');
  stage('main payment posted');
  const originalAmount = Number(payment?.amount);
  const originalDate = new Date(payment?.paymentDate || 0).toISOString();
  const originalMethod = String(payment?.paymentMethod || '');
  const originalJournal = await JournalEntry.findOne({ sourceId: String(payment?._id), sourceModule: 'payment' }).lean();
  const originalLines = await JournalLine.find({ journalEntryId: originalJournal?._id }).lean();
  const originalDebit = originalLines.reduce((sum, line: any) => sum + Number(line.debit || 0), 0);
  const originalCredit = originalLines.reduce((sum, line: any) => sum + Number(line.credit || 0), 0);
  const obligationBefore = await TaxObligation.findOne({ paymentId: payment?._id, reversalOf: null }).lean();
  const vatBefore = await VatRecord.findOne({ transactionId: String(payment?._id) }).lean();
  const levy = await LevyPayment.create({
    paymentType: 'levy',
    propertyId: property._id,
    companyId: company._id,
    paymentDate: PAYMENT_DATE,
    paymentMethod: 'bank_transfer',
    amount: 120,
    referenceNumber: 'LEVY-REM-MAIN',
    notes: 'Original levy note',
    processedBy: user._id,
    status: 'completed',
    currency: 'USD',
    parentPaymentId: payment?._id
  });
  await Payment.updateOne({ _id: payment?._id }, { $set: { linkedLevyPaymentId: levy._id } });
  const accountBefore = await PropertyAccount.findOne({ propertyId: property._id, isArchived: { $ne: true } });
  assert(Boolean(accountBefore), 'posted rental created a property account');
  await PropertyAccount.updateOne(
    { _id: accountBefore?._id },
    {
      $push: {
        passThroughAccounts: {
          type: 'BODY_CORPORATE',
          label: 'Body corporate',
          transactions: [{
            type: 'collection',
            amount: 120,
            date: PAYMENT_DATE,
            paymentId: payment?._id,
            chargeTypeCode: 'RETIRED_LEVY_CODE',
            idempotencyKey: `payment:${String(payment?._id)}:pt:levy`,
            description: 'Body corporate levy',
            referenceNumber: 'LEVY-REM-MAIN',
            status: 'completed'
          }],
          totalCollected: 120,
          totalPaid: 0,
          runningBalance: 120
        }
      }
    }
  );
  await OwnerRentNotice.create({
    companyId: company._id,
    ownerId: owner._id,
    paymentId: payment?._id,
    propertyId: property._id,
    idempotencyKey: `owner-rent-payment:${String(payment?._id)}`,
    status: 'SENT'
  });

  stage('reversing main payment');
  const first = await invoke(reversePayment, financeReq(String(user._id), String(company._id), String(payment?._id), { reason: 'incorrect allocation' }));
  stage(`main reversal status ${first.statusCode}`);
  assert(first.statusCode === 200, `successful reversal returns 200, got ${first.statusCode} ${first.body?.message || ''} ${JSON.stringify(first.body?.warnings || [])}`);
  assert(first.body?.outcome === 'reversed', `successful reversal outcome is reversed, got ${first.body?.outcome}`);
  const revCount = await Payment.countDocuments({ reversalOfPaymentId: payment?._id, amount: { $lt: 0 } });
  const corrCount = await Payment.countDocuments({ companyId: company._id, referenceNumber: 'CORR-REM-MAIN', isCorrectionEntry: true });
  assert(revCount === 1, `one REV payment, got ${revCount}`);
  assert(corrCount === 1, `one CORR draft, got ${corrCount}`);
  const originalAfter = await Payment.findById(payment?._id).lean();
  assert(Number(originalAfter?.amount) === originalAmount, 'original amount is unchanged');
  assert(new Date(originalAfter?.paymentDate || 0).toISOString() === originalDate, 'original date is unchanged');
  assert(String(originalAfter?.paymentMethod || '') === originalMethod, 'original method is unchanged');
  assert(String(originalAfter?.status || '') === 'completed', 'original status remains the historical completed receipt');
  assert(String((originalAfter as any)?.reversalState || '') === 'reversed', `original reversal state is reversed, got ${(originalAfter as any)?.reversalState}`);

  const reversal = await Payment.findOne({ reversalOfPaymentId: payment?._id, amount: { $lt: 0 } }).lean();
  const corrected = await Payment.findOne({ referenceNumber: 'CORR-REM-MAIN', companyId: company._id }).lean();
  assert(String((originalAfter as any)?.reversalPaymentId || '') === String(reversal?._id), 'original points at the reversal');
  assert(String((originalAfter as any)?.correctedPaymentId || '') === String(corrected?._id), 'original points at the correction draft');
  assert(String(corrected?.status || '') === 'pending', 'correction draft stays pending');
  near(Number(reversal?.amount), -1800, 'reversal amount is the negative of the original');

  const retry = await invoke(reversePayment, financeReq(String(user._id), String(company._id), String(payment?._id), { reason: 'incorrect allocation' }));
  assert(retry.statusCode === 200, `repeat reversal stays successful, got ${retry.statusCode} ${retry.body?.message || ''}`);
  assert(await Payment.countDocuments({ reversalOfPaymentId: payment?._id, amount: { $lt: 0 } }) === 1, 'repeat reversal does not create another REV');
  assert(await Payment.countDocuments({ referenceNumber: 'CORR-REM-MAIN', companyId: company._id }) === 1, 'repeat reversal does not create another CORR');

  const ofReversal = await invoke(reversePayment, financeReq(String(user._id), String(company._id), String(reversal?._id), { reason: 'should fail' }));
  assert(ofReversal.statusCode === 409 && ofReversal.body?.code === 'REVERSAL_OF_REVERSAL', `reversing a REV is rejected, got ${ofReversal.statusCode} ${ofReversal.body?.code}`);
  const directRev = await reversePaymentAccounting(String(reversal?._id), { reason: 'direct' });
  assert(directRev.status === 'failed', 'direct accounting reversal of a REV fails before ledger writes');

  const repost = await postPaymentAccounting(String(payment?._id), { createdBy: String(user._id) });
  assert(repost.status === 'skipped' && repost.reason === 'reversed_original', `repost of a reversed original is skipped, got ${repost.status} ${repost.reason}`);
  assert(await JournalEntry.countDocuments({ sourceId: String(payment?._id), sourceModule: 'payment' }) === 1, 'repost does not create another original journal');

  const journalAfter = await JournalEntry.findById(originalJournal?._id).lean();
  assert(journalAfter?.status === 'posted' && String(journalAfter?.reference) === String(originalJournal?.reference), 'original journal reference and status stay');
  const originalLinesAfter = await JournalLine.find({ journalEntryId: originalJournal?._id }).lean();
  near(originalLinesAfter.reduce((sum, line: any) => sum + Number(line.debit || 0), 0), originalDebit, 'original journal debits stay');
  const reversalJournal = await JournalEntry.findOne({ sourceId: `${payment?._id}:reversal` }).lean();
  const reversalLines = await JournalLine.find({ journalEntryId: reversalJournal?._id }).lean();
  const reversalDebit = reversalLines.reduce((sum, line: any) => sum + Number(line.debit || 0), 0);
  const reversalCredit = reversalLines.reduce((sum, line: any) => sum + Number(line.credit || 0), 0);
  near(reversalDebit, reversalCredit, 'reversal journal balances');
  near(reversalDebit, originalCredit, 'reversal debits equal original credits');
  near(reversalCredit, originalDebit, 'reversal credits equal original debits');
  assert(await JournalEntry.countDocuments({ sourceId: `${payment?._id}:reversal` }) === 1, 'retry leaves one reversal journal');

  const obligationAfter = await TaxObligation.findById(obligationBefore?._id).lean();
  near(Number(obligationAfter?.taxAmount || 0), Number(obligationBefore?.taxAmount || 0), 'original tax amount stays');
  const taxCounters = await TaxObligation.find({ reversalOf: obligationBefore?._id }).lean();
  assert(taxCounters.length === 1, `one linked tax reversal, got ${taxCounters.length}`);
  near(await outstandingForObligation(String(obligationBefore?._id)), 0, 'reversed tax obligation has no outstanding balance');

  const vatRows = await VatRecord.find({ transactionId: String(payment?._id) }).lean();
  assert(vatRows.length === 1, `one VAT record, got ${vatRows.length}`);
  near(Number(vatRows[0]?.vatCollected || 0), Number((vatBefore as any)?.vatCollected || 0), 'VAT amount stays');
  assert(String(vatRows[0]?.status || '') === 'reversed', 'VAT record is marked reversed without a second positive row');

  const propertyAccount = await PropertyAccount.findOne({ propertyId: property._id, isArchived: { $ne: true } }).lean();
  const ownerRows = (propertyAccount?.transactions || []).filter((row: any) =>
    String(row.paymentId || '') === String(payment?._id) || String(row.reversesPaymentId || '') === String(payment?._id)
  );
  const ownerIncome = ownerRows.filter((row: any) => row.type === 'income').reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
  const ownerCounter = ownerRows.filter((row: any) => String(row.idempotencyKey || '').includes(':owner-income:reversal:')).reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
  near(ownerIncome - ownerCounter, 0, 'owner income plus reversal counter is zero');
  assert(ownerRows.filter((row: any) => String(row.idempotencyKey || '').includes(':owner-income:reversal:')).length === 1, 'owner income counter is not duplicated');

  const agentAccount = await AgentAccount.findOne({ agentId: user._id }).lean();
  const commissionRows = (agentAccount?.transactions || []).filter((row: any) => row.type === 'commission' && String(row.paymentId || '') === String(payment?._id));
  const penaltyRows = (agentAccount?.transactions || []).filter((row: any) => row.type === 'penalty' && String(row.paymentId || '') === String(payment?._id));
  const commissionTotal = commissionRows.reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
  const penaltyTotal = penaltyRows.reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
  assert(commissionRows.length > 0, 'original agent commission rows exist');
  assert(penaltyRows.length === commissionRows.length, 'each original commission row has one penalty');
  near(penaltyTotal, commissionTotal, 'agent penalty uses the original posted commission');

  const companyAccount = await CompanyAccount.findOne({ companyId: company._id }).lean();
  const companyOriginal = (companyAccount?.transactions || []).filter((row: any) => String(row.paymentId || '') === String(payment?._id) && !row.reversesPaymentId && Number(row.amount || 0) > 0);
  const companyCounters = (companyAccount?.transactions || []).filter((row: any) => String(row.reversesPaymentId || '') === String(payment?._id));
  near(companyCounters.reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0), -companyOriginal.reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0), 'company income is countered once');
  assert(companyCounters.length === 1, `one company reversal, got ${companyCounters.length}`);

  const buckets = (propertyAccount as any)?.passThroughAccounts || [];
  const passRows = buckets.flatMap((bucket: any) => bucket.transactions || []).filter((row: any) => String(row.paymentId || '') === String(payment?._id));
  const collections = passRows.filter((row: any) => row.type === 'collection');
  const collectionReversals = passRows.filter((row: any) => row.type === 'collection_reversal');
  const disbursements = passRows.filter((row: any) => row.type === 'payment');
  assert(collections.length === 1 && Number(collections[0]?.amount) === 120, 'original pass-through collection remains');
  assert(String(collections[0]?.chargeTypeCode || '') === 'RETIRED_LEVY_CODE', 'pass-through reversal keeps the original charge code');
  assert(collectionReversals.length === 1 && Number(collectionReversals[0]?.amount) === 120, 'one pass-through collection counter');
  assert(disbursements.length === 0, 'reversing a collection does not increase paid-onward');
  const passNet = await propertyAccountService.getCompanyPassThroughSummary(String(company._id));
  near(Number((propertyAccount as any)?.passThroughPaid || 0), 0, 'stored pass-through paid stays zero');
  notes.push(`pass-through summary collected=${passNet?.totalCollected} paid=${passNet?.totalPaid}`);

  const levyAfter = await LevyPayment.findById(levy._id).lean();
  const levyContra = await LevyPayment.find({ reversalOfLevyPaymentId: levy._id }).lean();
  assert(String(levyAfter?.status || '') === 'completed', 'original levy status stays completed');
  assert(String(levyAfter?.notes || '') === 'Original levy note', 'original levy notes stay');
  assert(levyContra.length === 1, `one levy contra, got ${levyContra.length}`);
  near(Number(levyContra[0]?.amount), -120, 'levy contra uses the original amount');
  assert(String((levyAfter as any)?.reversalLevyPaymentId || '') === String(levyContra[0]?._id), 'original levy points at its contra');

  const reversalNoticeKey = `owner-rent-reversal:${String(payment?._id)}:${String(reversal?._id)}`;
  const originalNotice = await OwnerRentNotice.findOne({ idempotencyKey: `owner-rent-payment:${String(payment?._id)}` }).lean();
  const reversalNotice = await OwnerRentNotice.findOne({ idempotencyKey: reversalNoticeKey }).lean();
  assert(originalNotice?.status === 'SENT', 'original owner notice remains');
  assert(reversalNotice?.status === 'SENT', `reversal notice was sent, got ${reversalNotice?.status}`);
  await notifyOwnerOfRentReversal(originalAfter as any, 'incorrect allocation');
  assert(await OwnerRentNotice.countDocuments({ idempotencyKey: reversalNoticeKey }) === 1, 'reversal notice retry does not send a second row');
  await notifyOwnerOfRentPayment(reversal as any, { accountingComplete: true });
  assert(await OwnerRentNotice.countDocuments({ idempotencyKey: `owner-rent-payment:${String(reversal?._id)}` }) === 0, 'a negative REV does not send a rent-received notice');

  const individualRows = await IndividualVatRecord.countDocuments({ companyId: company._id });
  assert(individualRows === 0, `agency company has no individual VAT rows, got ${individualRows}`);

  ledgerEvidence.push(JSON.stringify({
    rent: originalAmount,
    ownerIncome,
    ownerCounter,
    agentCommission: commissionTotal,
    agentPenalty: penaltyTotal,
    companyIncome: companyOriginal.reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0),
    companyCounter: companyCounters.reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0),
    journalOriginalDebit: originalDebit,
    journalReversalDebit: reversalDebit,
    taxAmount: Number(obligationBefore?.taxAmount || 0),
    vatCollected: Number((vatBefore as any)?.vatCollected || 0),
    passThroughCollected: 120,
    passThroughReversed: 120,
    passThroughPaid: disbursements.length,
    levy: 120
  }));

  const concurrent = await postedPayment('REM-CONCURRENT');
  const concurrentResults = await Promise.all([
    invoke(reversePayment, financeReq(String(user._id), String(company._id), String(concurrent?._id), { reason: 'concurrent a' })),
    invoke(reversePayment, financeReq(String(user._id), String(company._id), String(concurrent?._id), { reason: 'concurrent b' }))
  ]);
  const concurrentRevs = await Payment.countDocuments({ reversalOfPaymentId: concurrent?._id, amount: { $lt: 0 } });
  assert(concurrentRevs === 1, `concurrent requests create one REV, got ${concurrentRevs}`);
  assert(concurrentResults.some((result) => result.statusCode === 200 || result.statusCode === 202), 'one concurrent request is accepted');

  const lockedPeriod = await postedPayment('REM-PERIOD');
  process.env.ACCOUNTING_PERIOD_LOCK_BEFORE = '2026-12-01T00:00:00.000Z';
  const periodBlocked = await invoke(reversePayment, financeReq(String(user._id), String(company._id), String(lockedPeriod?._id), { reason: 'period' }));
  delete process.env.ACCOUNTING_PERIOD_LOCK_BEFORE;
  assert(periodBlocked.statusCode === 409, `accounting period lock rejects reversal, got ${periodBlocked.statusCode}`);
  assert(await Payment.countDocuments({ reversalOfPaymentId: lockedPeriod?._id }) === 0, 'period lock does not create a reversal');

  const vatLocked = await postedPayment('REM-VAT-LOCK');
  const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`;
  await VatReturn.create({ companyId: company._id, filingPeriod: period, status: 'SUBMITTED' });
  const vatBlocked = await invoke(reversePayment, financeReq(String(user._id), String(company._id), String(vatLocked?._id), { reason: 'vat period' }));
  await VatReturn.deleteMany({ companyId: company._id, filingPeriod: period });
  assert(vatBlocked.statusCode === 409, `locked VAT period rejects reversal, got ${vatBlocked.statusCode} ${vatBlocked.body?.message || ''}`);
  assert(await Payment.countDocuments({ reversalOfPaymentId: vatLocked?._id }) === 0, 'VAT lock does not create a reversal');

  const journalFail = await postedPayment('REM-JOURNAL', { notes: 'PHASE27_FAIL_JOURNAL' });
  const journalFirst = await invoke(reversePayment, financeReq(String(user._id), String(company._id), String(journalFail?._id), { reason: 'journal seam' }));
  assert(journalFirst.statusCode === 202 && journalFirst.body?.outcome === 'reversal_incomplete', `journal failure stays incomplete, got ${journalFirst.statusCode} ${journalFirst.body?.outcome}`);
  const journalRetry = await invoke(reversePayment, financeReq(String(user._id), String(company._id), String(journalFail?._id), { reason: 'journal retry' }));
  assert(journalRetry.statusCode === 200, `journal retry settles, got ${journalRetry.statusCode} ${journalRetry.body?.message || ''} ${JSON.stringify(journalRetry.body?.warnings || [])}`);
  assert(await JournalEntry.countDocuments({ sourceId: `${journalFail?._id}:reversal` }) === 1, 'journal retry does not duplicate the reversal journal');
  const journalState = await Payment.findById(journalFail?._id).select('reversalState').lean();
  assert(String((journalState as any)?.reversalState || '') === 'reversed', 'journal retry finishes the reversal');

  const missingJournal = await Payment.create({
    companyId: company._id,
    propertyId: property._id,
    tenantId: tenant._id,
    agentId: user._id,
    processedBy: user._id,
    propertyType: 'residential',
    amount: 900,
    paymentType: 'rental',
    paymentMethod: 'cash',
    rentalPeriodMonth: 10,
    rentalPeriodYear: 2026,
    status: 'completed',
    postingStatus: 'posted',
    paymentDate: PAYMENT_DATE,
    transactionDomain: 'RENTAL',
    commissionFinalized: true,
    commissionDetails: toPaymentCommissionSnapshot(calc),
    referenceNumber: 'REM-NO-JOURNAL',
    idempotencyKey: `rem:no-journal:${new mongoose.Types.ObjectId().toString()}`
  });
  let missingThrew = false;
  try {
    await accountingIntegrationService.postReversalJournal(missingJournal as any, { reason: 'missing journal' });
  } catch (error: any) {
    missingThrew = String(error?.message || '').includes('Original journal is missing');
  }
  assert(missingThrew, 'a missing original journal fails instead of being rebuilt');
  assert(await JournalEntry.countDocuments({ sourceId: `${missingJournal._id}:reversal` }) === 0, 'missing journal does not create a synthesized reversal');

  const crashed = await postedPayment('REM-CRASH');
  const crashedRev = await Payment.create({
    companyId: company._id,
    propertyId: property._id,
    tenantId: tenant._id,
    agentId: user._id,
    processedBy: user._id,
    propertyType: 'residential',
    amount: -1800,
    paymentType: 'rental',
    paymentMethod: 'bank_transfer',
    rentalPeriodMonth: 10,
    rentalPeriodYear: 2026,
    status: 'completed',
    postingStatus: 'posted',
    paymentDate: new Date(),
    transactionDomain: 'RENTAL',
    commissionFinalized: true,
    commissionDetails: crashed?.commissionDetails,
    referenceNumber: 'REV-REM-CRASH',
    reversalOfPaymentId: crashed?._id,
    isCorrectionEntry: true,
    idempotencyKey: `rem:crash-rev:${new mongoose.Types.ObjectId().toString()}`
  });
  await Payment.updateOne(
    { _id: crashed?._id },
    { $set: { reversalPaymentId: crashedRev._id, reversalState: 'reversal_in_progress', reversalLockAt: new Date() } }
  );
  const resumed = await invoke(reversePayment, financeReq(String(user._id), String(company._id), String(crashed?._id), { reason: 'resume missing draft' }));
  assert(resumed.statusCode === 200, `resume creates the missing draft and settles, got ${resumed.statusCode} ${resumed.body?.message || ''}`);
  assert(await Payment.countDocuments({ reversalOfPaymentId: crashed?._id, amount: { $lt: 0 } }) === 1, 'resume does not create a second REV');
  assert(await Payment.countDocuments({ referenceNumber: 'CORR-REM-CRASH', companyId: company._id }) === 1, 'resume creates one correction draft');

  const stale = await postedPayment('REM-STALE');
  await Payment.updateOne(
    { _id: stale?._id },
    { $set: { reversalState: 'reversal_in_progress', reversalLockAt: new Date(Date.now() - 61 * 1000) } }
  );
  const staleResult = await invoke(reversePayment, financeReq(String(user._id), String(company._id), String(stale?._id), { reason: 'stale lock' }));
  assert(staleResult.statusCode === 200, `stale lock can be taken over, got ${staleResult.statusCode} ${staleResult.body?.message || ''}`);
  assert(await Payment.countDocuments({ reversalOfPaymentId: stale?._id, amount: { $lt: 0 } }) === 1, 'stale takeover creates one REV');

  const fresh = await postedPayment('REM-FRESH');
  await Payment.updateOne(
    { _id: fresh?._id },
    { $set: { reversalState: 'reversal_in_progress', reversalLockAt: new Date() } }
  );
  const freshResult = await invoke(reversePayment, financeReq(String(user._id), String(company._id), String(fresh?._id), { reason: 'fresh lock' }));
  assert(freshResult.statusCode === 200, `an in-progress lock with no REV is abandoned and can be retried, got ${freshResult.statusCode} ${freshResult.body?.message || ''}`);
  assert(await Payment.countDocuments({ reversalOfPaymentId: fresh?._id, amount: { $lt: 0 } }) === 1, 'abandoned fresh lock creates one REV');

  let duplicateRejected = false;
  let duplicateDetail = '';
  try {
    await Payment.create({
      companyId: company._id,
      propertyId: property._id,
      tenantId: tenant._id,
      agentId: user._id,
      processedBy: user._id,
      propertyType: 'residential',
      amount: -1,
      commissionDetails: toPaymentCommissionSnapshot(calc),
      paymentType: 'rental',
      paymentMethod: 'cash',
      rentalPeriodMonth: 10,
      rentalPeriodYear: 2026,
      status: 'completed',
      paymentDate: new Date(),
      transactionDomain: 'RENTAL',
      referenceNumber: 'REV-DUP',
      reversalOfPaymentId: payment?._id,
      idempotencyKey: `rem:dup:${new mongoose.Types.ObjectId().toString()}`
    });
  } catch (error: any) {
    duplicateRejected = Number(error?.code) === 11000;
    duplicateDetail = String(error?.code || error?.message || error);
  }
  assert(duplicateRejected, `the local partial unique index rejects a second full reversal (${duplicateDetail || 'insert succeeded'})`);

  const correctedDraft = await Payment.findById(corrected?._id);
  await Payment.updateOne({ _id: payment?._id }, { $set: { reversalState: 'reversal_in_progress' } });
  const blockedProgress = await invoke(updatePayment, financeReq(String(user._id), String(company._id), String(corrected?._id), { status: 'completed' }));
  assert(blockedProgress.statusCode === 409 && blockedProgress.body?.code === 'REVERSAL_NOT_SETTLED', `completion during reversal_in_progress is rejected, got ${blockedProgress.statusCode} ${blockedProgress.body?.code}`);
  await Payment.updateOne({ _id: payment?._id }, { $set: { reversalState: 'reversal_incomplete' } });
  const blockedIncomplete = await invoke(updatePayment, financeReq(String(user._id), String(company._id), String(corrected?._id), { postingStatus: 'posted' }));
  assert(blockedIncomplete.statusCode === 409 && blockedIncomplete.body?.code === 'REVERSAL_NOT_SETTLED', `postingStatus bypass during reversal_incomplete is rejected, got ${blockedIncomplete.statusCode} ${blockedIncomplete.body?.code}`);
  const blockedStatus = await invoke(updatePaymentStatus, financeReq(String(user._id), String(company._id), String(corrected?._id), { status: 'completed' }));
  assert(blockedStatus.statusCode === 409 && blockedStatus.body?.code === 'REVERSAL_NOT_SETTLED', `status route bypass is rejected, got ${blockedStatus.statusCode} ${blockedStatus.body?.code}`);
  const otherCompany = await Company.create({
    name: 'Other Remediation Co',
    address: '2 Remediation Street',
    phone: '0770000092',
    email: 'other-remediation@example.test',
    registrationNumber: 'REM-REV-2',
    tinNumber: 'REM-REV-TIN-2',
    country: 'Zimbabwe',
    ownerId: user._id,
    workspaceType: 'agency'
  });
  let crossCompany = '';
  try {
    await assertCorrectionDraftCanComplete(correctedDraft, String(otherCompany._id));
  } catch (error: any) {
    crossCompany = String(error?.code || '');
  }
  assert(crossCompany === 'CORRECTION_LINK_MISSING' || crossCompany === 'CORRECTION_COMPANY_MISMATCH', `cross-company completion is rejected, got ${crossCompany}`);
  const orphan = await Payment.create({
    companyId: company._id,
    propertyId: property._id,
    tenantId: tenant._id,
    agentId: user._id,
    processedBy: user._id,
    propertyType: 'residential',
    amount: 1800,
    paymentType: 'rental',
    paymentMethod: 'cash',
    rentalPeriodMonth: 10,
    rentalPeriodYear: 2026,
    commissionDetails: toPaymentCommissionSnapshot(calc),
    status: 'pending',
    postingStatus: 'draft',
    paymentDate: PAYMENT_DATE,
    transactionDomain: 'RENTAL',
    referenceNumber: 'CORR-ORPHAN',
    isCorrectionEntry: true,
    idempotencyKey: `rem:orphan:${new mongoose.Types.ObjectId().toString()}`
  });
  let orphanCode = '';
  try {
    await assertCorrectionDraftCanComplete(orphan, String(company._id));
  } catch (error: any) {
    orphanCode = String(error?.code || '');
  }
  assert(orphanCode === 'CORRECTION_LINK_MISSING', `an unlinked correction draft is rejected, got ${orphanCode}`);
  await Payment.updateOne({ _id: payment?._id }, { $set: { reversalState: 'reversed' } });
  const completed = await invoke(updatePayment, financeReq(String(user._id), String(company._id), String(corrected?._id), { status: 'completed' }));
  assert(completed.statusCode === 200, `settled correction completes through the ordinary update, got ${completed.statusCode} ${completed.body?.message || ''}`);
  const completedPayment = await Payment.findById(corrected?._id).lean();
  assert(String(completedPayment?.status || '') === 'completed', 'corrected payment is completed');
  assert(String((completedPayment as any)?.postingStatus || '') === 'posted', 'corrected payment is posted');
  const correctedJournal = await JournalEntry.findOne({ sourceId: String(corrected?._id), sourceModule: 'payment' }).lean();
  assert(Boolean(correctedJournal), 'corrected payment posted a journal through the ordinary pipeline');
  const propertyAfterCorrection = await PropertyAccount.findOne({ propertyId: property._id, isArchived: { $ne: true } }).lean();
  const correctedIncome = (propertyAfterCorrection?.transactions || [])
    .filter((row: any) => row.type === 'income' && String(row.paymentId || '') === String(corrected?._id))
    .reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
  const netAfterCorrection = (propertyAfterCorrection?.transactions || [])
    .filter((row: any) =>
      String(row.paymentId || '') === String(payment?._id) ||
      String(row.reversesPaymentId || '') === String(payment?._id) ||
      String(row.paymentId || '') === String(corrected?._id)
    )
    .reduce((sum: number, row: any) => {
      if (row.type === 'income') return sum + Number(row.amount || 0);
      if (String(row.idempotencyKey || '').includes(':owner-income:reversal:')) return sum - Number(row.amount || 0);
      return sum;
    }, 0);
  near(netAfterCorrection, correctedIncome, 'original plus reversal plus correction equals the corrected owner income');
  ledgerEvidence.push(JSON.stringify({ correctedOwnerIncome: correctedIncome, netAfterCorrection }));

  const reversedQuery: Record<string, any> = { companyId: company._id };
  applyPaymentStatusFilter(reversedQuery, 'reversed');
  const reversedRows = await Payment.find(reversedQuery).select('_id referenceNumber').lean();
  const reversedIds = new Set(reversedRows.map((row) => String(row._id)));
  assert(reversedIds.has(String(payment?._id)) && reversedIds.has(String(reversal?._id)), 'reversed filter returns the original and the reversal');
  assert(!reversedIds.has(String(lockedPeriod?._id)), 'reversed filter does not return an untouched receipt');

  const individualCompany = await Company.create({
    name: 'Remediation Individual',
    address: '3 Remediation Street',
    phone: '0770000093',
    email: 'individual-remediation@example.test',
    registrationNumber: 'REM-IND-1',
    tinNumber: 'REM-IND-TIN',
    country: 'Zimbabwe',
    ownerId: user._id,
    workspaceType: 'individual',
    plan: 'INDIVIDUAL'
  });
  const individualProperty = await Property.create({
    companyId: individualCompany._id,
    ownerId: user._id,
    name: 'Individual House',
    address: '3 Remediation Road',
    rentalType: 'management',
    rent: 1800,
    commission: 15
  });
  const individualPayment = await Payment.create({
    companyId: individualCompany._id,
    propertyId: individualProperty._id,
    tenantId: tenant._id,
    agentId: user._id,
    processedBy: user._id,
    propertyType: 'residential',
    amount: 1800,
    paymentType: 'rental',
    paymentMethod: 'bank_transfer',
    status: 'completed',
    paymentDate: PAYMENT_DATE,
    rentalPeriodMonth: 10,
    rentalPeriodYear: 2026,
    transactionDomain: 'RENTAL',
    commissionFinalized: true,
    commissionDetails: toPaymentCommissionSnapshot(calc),
    referenceNumber: 'REM-INDIVIDUAL',
    notes: 'PHASE_FAIL_INDIVIDUAL_VAT PHASE_FAIL_INDIVIDUAL_RENTAL_TAX PHASE_FAIL_INDIVIDUAL_INCOME_TAX',
    idempotencyKey: `rem:individual:${new mongoose.Types.ObjectId().toString()}`
  });
  await ensurePaymentAccountingPosted(String(individualPayment._id), { createdBy: String(user._id) });
  const individualReverse = await invoke(reversePayment, financeReq(String(user._id), String(individualCompany._id), String(individualPayment._id), { reason: 'individual tax seam' }));
  const individualState = await Payment.findById(individualPayment._id).select('reversalState').lean();
  assert(individualReverse.statusCode === 202 && individualReverse.body?.outcome === 'reversal_incomplete', `individual tax failure stays incomplete, got ${individualReverse.statusCode} ${individualReverse.body?.outcome} ${JSON.stringify(individualReverse.body?.warnings || [])}`);
  assert(String((individualState as any)?.reversalState || '') === 'reversal_incomplete', 'individual tax failure stores reversal_incomplete');
  const individualRetry = await invoke(reversePayment, financeReq(String(user._id), String(individualCompany._id), String(individualPayment._id), { reason: 'individual retry' }));
  const individualRetried = await Payment.findById(individualPayment._id).select('reversalState').lean();
  assert(individualRetry.body?.outcome === 'reversed' || String((individualRetried as any)?.reversalState || '') === 'reversed', `individual retry can settle, got ${individualRetry.statusCode} ${individualRetry.body?.outcome}`);

  const sale = await Payment.create({
    companyId: company._id,
    propertyId: property._id,
    agentId: user._id,
    processedBy: user._id,
    propertyType: 'residential',
    amount: 5000,
    paymentType: 'sale',
    paymentMethod: 'bank_transfer',
    status: 'completed',
    paymentDate: PAYMENT_DATE,
    transactionDomain: 'SALE',
    commissionFinalized: true,
    commissionDetails: toPaymentCommissionSnapshot(calc),
    referenceNumber: 'REM-SALE',
    buyerName: 'Buyer Example',
    idempotencyKey: `rem:sale:${new mongoose.Types.ObjectId().toString()}`
  });
  await trustPaymentPostingService.postBuyerPaymentToTrust({
    paymentId: String(sale._id),
    propertyId: String(property._id),
    amount: 5000,
    companyId: String(company._id),
    reference: 'REM-SALE',
    performedBy: String(user._id)
  });
  const saleReverse = await invoke(reversePayment, financeReq(String(user._id), String(company._id), String(sale._id), { reason: 'sale trust' }));
  await invoke(reversePayment, financeReq(String(user._id), String(company._id), String(sale._id), { reason: 'sale trust retry' }));
  const trustDebits = await TrustTransaction.countDocuments({ reference: `reversal:${String(sale._id)}` });
  assert(saleReverse.statusCode === 200 || saleReverse.statusCode === 202, `sale reversal is accepted, got ${saleReverse.statusCode} ${saleReverse.body?.message || ''}`);
  assert(trustDebits === 1, `sale trust is debited once, got ${trustDebits}`);

  stage('complete');
  finish();
}

function finish() {
  console.log(JSON.stringify({
    failures,
    notes,
    ledgerEvidence,
    cosmosDb: 'UNVERIFIED',
    database: DB
  }, null, 2));
  process.exit(failures.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  failures.push(error?.message || String(error));
  finish();
});
