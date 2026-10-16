/**
 * Reversal-journal duplicate-key handling.
 * Classifier cases always run. Database cases use a disposable local database.
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
import { JournalEntry } from '../models/JournalEntry';
import { JournalLine } from '../models/JournalLine';
import { CommissionService } from '../services/commissionService';
import { toPaymentCommissionSnapshot } from '../services/propertyCommissionCalculator';
import { commissionVatFlagsFromPolicy, resolveCommissionVatPolicy } from '../services/vatPolicyService';
import { ensureSystemTaxRules } from '../services/taxRuleRegistry';
import { ensurePaymentAccountingPosted } from '../services/paymentAccountingReconciliation';
import { reversePaymentAccounting } from '../services/paymentAccountingOrchestrator';
import accountingIntegrationService from '../services/accountingIntegrationService';
import {
  matchingJournalIdentity,
  persistedJournalMatchesIdentity,
  type JournalOperationIdentity
} from '../services/journalDuplicateKey';
import { accountingConnection } from '../config/database';

const DB = process.env.REVERSAL_JOURNAL_DB || 'mongodb://127.0.0.1:27017/mantis_reversal_journal_test';
const ACCOUNTING_DB = process.env.REVERSAL_JOURNAL_ACCOUNTING_DB || 'mongodb://127.0.0.1:27017/mantis_reversal_journal_accounting';
const PAYMENT_DATE = new Date('2026-10-13T10:00:00.000Z');
const failures: string[] = [];
const notes: string[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) failures.push(message);
}

function identity(overrides?: Partial<JournalOperationIdentity>): JournalOperationIdentity {
  return {
    companyId: 'company-1',
    sourceModule: 'payment',
    sourceId: 'payment-1:reversal',
    reference: 'REV-PAY-1',
    ...overrides
  };
}

function runClassifierCases() {
  const same = identity();
  const sourceError = {
    code: 11000,
    keyPattern: { companyId: 1, sourceModule: 1, sourceId: 1 },
    keyValue: { companyId: 'company-1', sourceModule: 'payment', sourceId: 'payment-1:reversal' }
  };
  assert(matchingJournalIdentity(sourceError, [same])?.sourceId === 'payment-1:reversal', 'source-index duplicate matches this reversal');
  assert(matchingJournalIdentity({
    code: 11000,
    keyPattern: { companyId: 1, sourceModule: 1, sourceId: 1 },
    keyValue: { companyId: 'company-1', sourceModule: 'payment', sourceId: 'other:reversal' }
  }, [same]) == null, 'source-index duplicate for another payment is not this reversal');
  assert(matchingJournalIdentity({
    code: 11000,
    keyPattern: { companyId: 1, reference: 1 },
    keyValue: { companyId: 'company-1', reference: 'REV-PAY-1' }
  }, [same])?.reference === 'REV-PAY-1', 'reference-index duplicate can name this reversal');
  assert(matchingJournalIdentity({
    code: 11000,
    keyPattern: { description: 1 },
    keyValue: { description: 'unrelated' }
  }, [same]) == null, 'unrelated journal index is not an idempotent reversal');
  assert(matchingJournalIdentity({ code: 11000, message: 'E11000 duplicate key error' }, [same]) == null, 'duplicate key without index metadata is not success');
  assert(persistedJournalMatchesIdentity(null, same) === false, 'missing journal after a duplicate key is not success');
  assert(persistedJournalMatchesIdentity({
    companyId: 'company-1',
    sourceModule: 'payment',
    sourceId: 'payment-1:reversal'
  }, same), 'stored journal with the same source identity is the reversal');
  assert(persistedJournalMatchesIdentity({
    companyId: 'company-1',
    sourceModule: 'payment',
    sourceId: 'payment-1'
  }, same) === false, 'the original journal is not the reversal journal');
}

async function main() {
  runClassifierCases();
  process.env.MANTIS_TEST_SEAM = '1';
  process.env.NODE_ENV = 'development';
  try {
    await mongoose.connect(DB, { serverSelectionTimeoutMS: 4000 });
  } catch (error: any) {
    notes.push(`INTEGRATION SKIPPED: local MongoDB unavailable (${error?.message || error}). Classifier cases still ran. This is not a Cosmos DB pass.`);
    finish();
    return;
  }
  await mongoose.connection.dropDatabase();
  await accountingConnection.openUri(ACCOUNTING_DB);
  await accountingConnection.dropDatabase();
  await ensureSystemTaxRules();
  await JournalEntry.syncIndexes();
  await JournalLine.syncIndexes();
  await VatRecord.syncIndexes();
  await TaxObligation.syncIndexes();

  const user = await User.create({
    email: 'reversal-journal@example.test',
    password: 'test-pass-1',
    firstName: 'Journal',
    lastName: 'Reversal',
    role: 'admin',
    roles: ['admin'],
    isActive: true,
    sessionVersion: 1
  });
  const company = await Company.create({
    name: 'Journal Reversal Co',
    address: '1 Journal Street',
    phone: '0770000081',
    email: 'journal-reversal@example.test',
    registrationNumber: 'JRN-REV-1',
    tinNumber: 'JRN-REV-TIN',
    country: 'Zimbabwe',
    ownerId: user._id,
    taxProfile: { vatRegistered: true, vatNumber: 'ZW-JRN', vatRegistrationEffectiveDate: new Date('2020-01-01T00:00:00.000Z') }
  });
  const property = await Property.create({
    companyId: company._id,
    ownerId: user._id,
    name: 'Journal House',
    address: '1 Journal Road',
    rentalType: 'management',
    rent: 1800,
    commission: 15,
    vatOnCommission: true,
    vatCommissionTreatment: 'exclusive'
  });
  const tenant = await Tenant.create({
    firstName: 'Journal',
    lastName: 'Tenant',
    email: 'journal-tenant@example.test',
    phone: '0771111181',
    companyId: company._id,
    ownerId: user._id,
    status: 'Active'
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

  async function postedPayment(notesText?: string, referenceNumber?: string) {
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
      rentalPeriodMonth: 3,
      rentalPeriodYear: 2026,
      transactionDomain: 'RENTAL',
      commissionFinalized: true,
      accountingStatus: 'pending',
      accountingComplete: false,
      applyVatOnCommission: flags.vatOnCommission,
      vatOnCommissionRate: flags.vatRate,
      vatCommissionTreatment: flags.vatTreatment,
      commissionDetails: toPaymentCommissionSnapshot(calc),
      referenceNumber: referenceNumber || `JRN-${new mongoose.Types.ObjectId().toString()}`,
      notes: notesText,
      idempotencyKey: `jrn:${new mongoose.Types.ObjectId().toString()}`
    });
    await ensurePaymentAccountingPosted(String(payment._id), { createdBy: String(user._id) });
    return Payment.findById(payment._id);
  }

  const payment = await postedPayment(undefined, 'JRN-FIRST');
  const originalJournalBefore = await JournalEntry.findOne({ sourceId: String(payment?._id), sourceModule: 'payment' }).lean();
  const originalLinesBefore = await JournalLine.find({ journalEntryId: originalJournalBefore?._id }).select('debit credit').lean();
  const originalDebit = originalLinesBefore.reduce((sum, line: any) => sum + Number(line.debit || 0), 0);
  const obligationBefore = await TaxObligation.findOne({ paymentId: payment?._id, taxType: 'VAT_ON_COMMISSION', reversalOf: null }).lean();
  const vatBefore = await VatRecord.findOne({ transactionId: String(payment?._id) }).lean();

  const first = await reversePaymentAccounting(String(payment?._id), { reason: 'first reversal' });
  assert(first.artifacts.journal === 'reversed', `first reversal journals, got ${first.artifacts.journal} ${first.errors.join('; ')}`);
  const reversalJournal = await JournalEntry.findOne({ sourceId: `${payment?._id}:reversal` }).lean();
  assert(Boolean(reversalJournal), 'first reversal stores one reversal journal');
  const originalAfter = await JournalEntry.findById(originalJournalBefore?._id).lean();
  assert(String(originalAfter?.reference) === String(originalJournalBefore?.reference) && originalAfter?.status === 'posted', 'reversal does not change the original journal reference or status');
  const originalLinesAfter = await JournalLine.find({ journalEntryId: originalJournalBefore?._id }).select('debit credit').lean();
  const originalDebitAfter = originalLinesAfter.reduce((sum, line: any) => sum + Number(line.debit || 0), 0);
  assert(originalDebitAfter === originalDebit, 'reversal does not change original journal amounts');

  const retry = await reversePaymentAccounting(String(payment?._id), { reason: 'retry reversal' });
  const reversalJournals = await JournalEntry.find({ sourceId: `${payment?._id}:reversal` }).lean();
  assert(retry.artifacts.journal === 'reversed', `retry reversal stays reversed, got ${retry.artifacts.journal} ${retry.errors.join('; ')}`);
  assert(reversalJournals.length === 1 && String(reversalJournals[0]._id) === String(reversalJournal?._id), 'retry does not create or replace the reversal journal');
  assert(String(reversalJournals[0].reference) === String(reversalJournal?.reference), 'retry does not change the reversal reference');

  const obligationAfter = await TaxObligation.findById(obligationBefore?._id).lean();
  const vatAfter = await VatRecord.findById(vatBefore?._id).lean();
  assert(Number(obligationAfter?.taxAmount) === Number(obligationBefore?.taxAmount), 'reversal keeps the original tax obligation amount');
  assert(Number(vatAfter?.vatCollected) === Number(vatBefore?.vatCollected), 'reversal keeps the VAT collection amount');

  const concurrent = await postedPayment(undefined, 'JRN-CONCURRENT');
  const concurrentResults = await Promise.all([
    reversePaymentAccounting(String(concurrent?._id), { reason: 'concurrent a' }),
    reversePaymentAccounting(String(concurrent?._id), { reason: 'concurrent b' })
  ]);
  const concurrentJournals = await JournalEntry.find({ sourceId: `${concurrent?._id}:reversal` }).lean();
  assert(concurrentResults.every((row) => row.artifacts.journal === 'reversed' || row.status === 'reversed' || row.status === 'already_reversed' || row.status === 'partial'), `concurrent reversals resolve, got ${concurrentResults.map((row) => row.status).join(',')}`);
  assert(concurrentJournals.length === 1, `concurrent reversals leave one journal, got ${concurrentJournals.length}`);

  const unrelated = await postedPayment(undefined, 'JRN-UNRELATED');
  await JournalEntry.collection.createIndex({ description: 1 }, { unique: true, name: 'test_only_unrelated_description' });
  const description = `Reversal of agent collection ${unrelated?.referenceNumber || unrelated?._id}`;
  const decoy = await JournalEntry.create({
    companyId: company._id,
    reference: `UNRELATED-${unrelated?._id}`,
    description,
    sourceModule: 'manual',
    sourceId: `unrelated:${unrelated?._id}`,
    status: 'posted',
    transactionDate: new Date()
  });
  let unrelatedThrew = false;
  try {
    await accountingIntegrationService.postReversalJournal(unrelated as any, { reason: 'unrelated index' });
  } catch (error: any) {
    unrelatedThrew = Number(error?.code) === 11000;
  }
  const decoyAfter = await JournalEntry.findById(decoy._id).lean();
  assert(unrelatedThrew, 'duplicate key on an unrelated journal index is propagated');
  assert(String(decoyAfter?.reference) === String(decoy.reference) && decoyAfter?.status === 'posted', 'unrelated collision does not overwrite the existing journal');
  assert(!(await JournalEntry.findOne({ sourceId: `${unrelated?._id}:reversal` }).lean()), 'unrelated collision does not invent a reversal journal');
  await JournalEntry.collection.dropIndex('test_only_unrelated_description');

  const missing = await postedPayment(undefined, 'JRN-MISSING');
  const blocker = await JournalEntry.create({
    companyId: company._id,
    reference: `REV-PAY-${missing?.referenceNumber}`,
    description: 'reference owned by a different journal',
    sourceModule: 'manual',
    sourceId: `not-the-reversal:${missing?._id}`,
    status: 'posted',
    transactionDate: new Date()
  });
  const blockerBefore = { reference: blocker.reference, status: blocker.status, sourceId: blocker.sourceId };
  let missingThrew = false;
  let missingReturned: string | undefined;
  try {
    missingReturned = await accountingIntegrationService.postReversalJournal(missing as any, { reason: 'missing reversal row' });
  } catch (error: any) {
    missingThrew = Number(error?.code) === 11000;
  }
  const blockerAfter = await JournalEntry.findById(blocker._id).lean();
  assert(missingThrew && missingReturned !== 'reversed', 'duplicate key without the expected reversal journal is propagated');
  assert(blockerAfter?.reference === blockerBefore.reference && blockerAfter?.sourceId === blockerBefore.sourceId && blockerAfter?.status === 'posted', 'missing reversal row does not overwrite the conflicting journal');

  const failed = await postedPayment('PHASE27_FAIL_JOURNAL', 'JRN-FAIL');
  const failedOriginal = await JournalEntry.findOne({ sourceId: String(failed?._id), sourceModule: 'payment' }).lean();
  const failedFirst = await reversePaymentAccounting(String(failed?._id), { reason: 'PHASE27_FAIL_JOURNAL' });
  assert(failedFirst.artifacts.journal === 'failed', `injected journal failure stays failed, got ${failedFirst.artifacts.journal}`);
  const failedRetry = await reversePaymentAccounting(String(failed?._id), { reason: 'safe retry' });
  const failedOriginalAfter = await JournalEntry.findById(failedOriginal?._id).lean();
  assert(failedRetry.artifacts.journal === 'reversed', `retry after failure posts the reversal, got ${failedRetry.artifacts.journal} ${failedRetry.errors.join('; ')}`);
  assert(String(failedOriginalAfter?.reference) === String(failedOriginal?.reference) && failedOriginalAfter?.status === 'posted', 'failed reversal and retry keep the original journal');

  notes.push('Database cases ran on local MongoDB. They do not verify Cosmos DB.');
  finish();
}

function finish() {
  if (failures.length) {
    console.error(failures.map((row) => `FAIL ${row}`).join('\n'));
    console.error(notes.join('\n'));
    process.exit(1);
  }
  console.log(['PASS reversal journal duplicate-key cases', ...notes].join('\n'));
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
