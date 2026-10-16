/**
 * Reversal and original tax-obligation idempotency on a disposable database.
 * Does not open the application database.
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
import { CommissionService } from '../services/commissionService';
import { toPaymentCommissionSnapshot } from '../services/propertyCommissionCalculator';
import { commissionVatFlagsFromPolicy, resolveCommissionVatPolicy } from '../services/vatPolicyService';
import { ensureSystemTaxRules } from '../services/taxRuleRegistry';
import { ensurePaymentAccountingPosted } from '../services/paymentAccountingReconciliation';
import { reversePaymentAccounting } from '../services/paymentAccountingOrchestrator';
import { reversePaymentTaxObligations, upsertPaymentTaxObligation } from '../services/taxObligationService';
import { accountingConnection } from '../config/database';

const DB = process.env.VAT_REVERSAL_DB || 'mongodb://127.0.0.1:27017/vat_reversal_idempotency_test';
const ACCOUNTING_DB = process.env.VAT_REVERSAL_ACCOUNTING_DB || 'mongodb://127.0.0.1:27017/vat_reversal_idempotency_accounting';
const PAYMENT_DATE = new Date('2026-10-13T10:00:00.000Z');
const failures: string[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) failures.push(message);
}

async function main() {
  process.env.MANTIS_TEST_SEAM = '1';
  await mongoose.connect(DB);
  await mongoose.connection.dropDatabase();
  await accountingConnection.openUri(ACCOUNTING_DB);
  await accountingConnection.dropDatabase();
  await ensureSystemTaxRules();
  await TaxObligation.collection.createIndex(
    { companyId: 1, paymentId: 1, taxType: 1, reversalOf: 1 },
    { unique: true, sparse: true, name: 'companyId_1_paymentId_1_taxType_1_reversalOf_1' }
  );
  await TaxObligation.collection.createIndex(
    { companyId: 1, paymentId: 1, taxType: 1 },
    {
      unique: true,
      name: 'companyId_1_paymentId_1_taxType_1_original',
      partialFilterExpression: { reversalOf: null, paymentId: { $type: 'objectId' } }
    }
  );

  const user = await User.create({
    email: 'vat-reversal@example.test',
    password: 'test-pass-1',
    firstName: 'Reversal',
    lastName: 'Tester',
    role: 'admin',
    roles: ['admin'],
    isActive: true,
    sessionVersion: 1
  });
  const company = await Company.create({
    name: 'Reversal Idempotency Co',
    address: '1 Test Street',
    phone: '0770000041',
    email: 'reversal-co@example.test',
    registrationNumber: 'REV-IDEMP-1',
    tinNumber: 'REV-IDEMP-TIN',
    country: 'Zimbabwe',
    ownerId: user._id,
    taxProfile: { vatRegistered: true, vatNumber: 'ZW-REV', vatRegistrationEffectiveDate: new Date('2020-01-01T00:00:00.000Z') }
  });
  const property = await Property.create({
    companyId: company._id,
    ownerId: user._id,
    name: 'Reversal House',
    address: '1 Reversal Road',
    rentalType: 'management',
    rent: 1800,
    commission: 15,
    vatOnCommission: true,
    vatCommissionTreatment: 'exclusive'
  });
  const tenant = await Tenant.create({
    firstName: 'Reversal',
    lastName: 'Tenant',
    email: 'reversal-tenant@example.test',
    phone: '0771111141',
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

  async function postedPayment(notes?: string) {
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
      rentalPeriodMonth: Math.floor(Math.random() * 12) + 1,
      rentalPeriodYear: 2024 + Math.floor(Math.random() * 2),
      transactionDomain: 'RENTAL',
      commissionFinalized: true,
      accountingStatus: 'pending',
      accountingComplete: false,
      applyVatOnCommission: flags.vatOnCommission,
      vatOnCommissionRate: flags.vatRate,
      vatCommissionTreatment: flags.vatTreatment,
      commissionDetails: toPaymentCommissionSnapshot(calc),
      notes,
      idempotencyKey: `rev:${new mongoose.Types.ObjectId().toString()}`
    });
    await ensurePaymentAccountingPosted(String(payment._id), { createdBy: String(user._id) });
    return payment;
  }

  const payment = await postedPayment();
  const originalBefore = await TaxObligation.findOne({ paymentId: payment._id, taxType: 'VAT_ON_COMMISSION', reversalOf: null }).lean();
  assert(Number(originalBefore?.taxAmount) === 41.85 && originalBefore?.status === 'PAYABLE', `original obligation is 41.85 PAYABLE, got ${originalBefore?.taxAmount} ${originalBefore?.status}`);

  const first = await reversePaymentAccounting(String(payment._id), { reason: 'idempotency reversal' });
  assert(first.artifacts.tax === 'reversed' && first.artifacts.vatRecord === 'reversed', `first reversal posted tax and VAT, got ${first.artifacts.tax} ${first.artifacts.vatRecord} ${first.errors.join('; ')}`);
  const originalAfter = await TaxObligation.findById(originalBefore?._id).lean();
  const reversalRows = await TaxObligation.find({ paymentId: payment._id, taxType: 'VAT_ON_COMMISSION', reversalOf: originalBefore?._id }).lean();
  assert(reversalRows.length === 1, `first reversal creates one reversal, got ${reversalRows.length}`);
  assert(originalAfter?.status === 'REVERSED' && Number(originalAfter?.taxAmount) === 41.85, 'first reversal keeps the original amount and marks it reversed');
  assert(String(originalAfter?.reversalOf || '') === '', 'the original remains distinguishable from the reversal');
  assert(String(reversalRows[0].reversalOf) === String(originalBefore?._id), 'the reversal points at the original');

  const vatBeforeRetry = await VatRecord.countDocuments({ transactionId: String(payment._id) });
  const journalsBeforeRetry = await JournalEntry.countDocuments({ sourceId: { $in: [String(payment._id), `${payment._id}:reversal`] } });
  const second = await reversePaymentAccounting(String(payment._id), { reason: 'idempotency reversal retry' });
  const reversalAfterRetry = await TaxObligation.find({ paymentId: payment._id, taxType: 'VAT_ON_COMMISSION', reversalOf: originalBefore?._id }).lean();
  const originalAfterRetry = await TaxObligation.findById(originalBefore?._id).lean();
  assert(second.artifacts.tax === 'reversed', `retry reversal stays reversed, got ${second.artifacts.tax} ${second.errors.join('; ')}`);
  assert(reversalAfterRetry.length === 1 && String(reversalAfterRetry[0]._id) === String(reversalRows[0]._id), 'retry returns the existing reversal');
  assert(Number(reversalAfterRetry[0].taxAmount) === Number(reversalRows[0].taxAmount) && reversalAfterRetry[0].status === reversalRows[0].status, 'retry does not change the reversal amount or status');
  assert(Number(originalAfterRetry?.taxAmount) === 41.85 && originalAfterRetry?.status === 'REVERSED', 'retry does not change the original amount or status');
  assert(await VatRecord.countDocuments({ transactionId: String(payment._id) }) === vatBeforeRetry, 'retry does not add a VAT collection record');
  assert(await JournalEntry.countDocuments({ sourceId: { $in: [String(payment._id), `${payment._id}:reversal`] } }) === journalsBeforeRetry, 'retry does not add an accounting journal');

  const concurrentPayment = await postedPayment();
  const concurrentOriginal = await TaxObligation.findOne({ paymentId: concurrentPayment._id, taxType: 'VAT_ON_COMMISSION', reversalOf: null }).lean();
  const concurrentResults = await Promise.all([
    reversePaymentTaxObligations({ companyId: String(company._id), paymentId: String(concurrentPayment._id), reason: 'concurrent a' }),
    reversePaymentTaxObligations({ companyId: String(company._id), paymentId: String(concurrentPayment._id), reason: 'concurrent b' })
  ]);
  const concurrentReversals = await TaxObligation.find({ reversalOf: concurrentOriginal?._id }).lean();
  const concurrentOriginalAfter = await TaxObligation.findById(concurrentOriginal?._id).lean();
  assert(concurrentResults.every((result) => result === 'reversed'), `concurrent reversals both resolve, got ${concurrentResults.join(',')}`);
  assert(concurrentReversals.length === 1, `concurrent reversals leave one reversal, got ${concurrentReversals.length}`);
  assert(Number(concurrentOriginalAfter?.taxAmount) === 41.85 && concurrentOriginalAfter?.status === 'REVERSED', 'concurrent reversal keeps the original amount');

  const unrelatedPayment = await postedPayment();
  const unrelatedOriginal = await TaxObligation.findOne({ paymentId: unrelatedPayment._id, taxType: 'VAT_ON_COMMISSION', reversalOf: null }).lean();
  const decoyReversalOf = new mongoose.Types.ObjectId();
  await TaxObligation.collection.insertOne({
    companyId: company._id,
    paymentId: new mongoose.Types.ObjectId(),
    taxType: 'VAT_OUTPUT',
    transactionId: `${unrelatedPayment._id}:reversal`,
    reversalOf: decoyReversalOf,
    taxAmount: 5,
    taxableAmount: 10,
    taxRate: 0.155,
    taxPeriod: '2026-10',
    transactionDate: PAYMENT_DATE,
    status: 'REVERSED',
    entityType: 'payment',
    calculationBasis: 'UNRELATED_INDEX',
    calculatedAt: new Date()
  });
  await TaxObligation.collection.createIndex({ transactionId: 1 }, { unique: true, name: 'transactionId_unique_probe' });
  let unrelatedThrew = false;
  try {
    await reversePaymentTaxObligations({ companyId: String(company._id), paymentId: String(unrelatedPayment._id), reason: 'unrelated index' });
  } catch (error: any) {
    unrelatedThrew = Number(error?.code) === 11000;
  }
  const unrelatedOriginalAfter = await TaxObligation.findById(unrelatedOriginal?._id).lean();
  const unrelatedReversals = await TaxObligation.countDocuments({ reversalOf: unrelatedOriginal?._id });
  assert(unrelatedThrew, 'an unrelated duplicate-key error is not treated as a successful reversal');
  assert(unrelatedOriginalAfter?.status === 'PAYABLE' && Number(unrelatedOriginalAfter?.taxAmount) === 41.85, 'the failed reversal leaves the original unchanged');
  assert(unrelatedReversals === 0, 'the failed reversal does not leave a reversal for that original');
  await TaxObligation.collection.dropIndex('transactionId_unique_probe');
  await TaxObligation.deleteOne({ calculationBasis: 'UNRELATED_INDEX' });
  const recovered = await reversePaymentTaxObligations({ companyId: String(company._id), paymentId: String(unrelatedPayment._id), reason: 'retry after unrelated failure' });
  assert(recovered === 'reversed', 'a failed reversal can be retried after the conflicting key is gone');
  assert(await TaxObligation.countDocuments({ reversalOf: unrelatedOriginal?._id }) === 1, 'the retry creates one reversal');

  const seamPayment = await postedPayment('PHASE28_FAIL_TAX');
  const seamOriginal = await TaxObligation.findOne({ paymentId: seamPayment._id, taxType: 'VAT_ON_COMMISSION', reversalOf: null }).lean();
  let seamThrew = false;
  try {
    await reversePaymentTaxObligations({ companyId: String(company._id), paymentId: String(seamPayment._id), notes: 'PHASE28_FAIL_TAX', reason: 'seam' });
  } catch (error: any) {
    seamThrew = String(error?.message || '').includes('PHASE28_FAIL_TAX');
  }
  assert(seamThrew, 'an injected reversal failure is surfaced');
  assert((await TaxObligation.findById(seamOriginal?._id).lean())?.status === 'PAYABLE', 'the injected failure does not mark the original reversed');
  const seamRetry = await reversePaymentTaxObligations({ companyId: String(company._id), paymentId: String(seamPayment._id), notes: 'PHASE28_FAIL_TAX', reason: 'seam retry' });
  assert(seamRetry === 'reversed' && await TaxObligation.countDocuments({ reversalOf: seamOriginal?._id }) === 1, 'the same reversal succeeds on the next attempt');

  const raceCompany = company._id;
  const racePayment = new mongoose.Types.ObjectId();
  const raceBase = {
    companyId: String(raceCompany),
    taxType: 'VAT_ON_COMMISSION' as const,
    paymentId: String(racePayment),
    taxPeriod: '2026-10',
    transactionDate: PAYMENT_DATE,
    currency: 'USD',
    taxableAmount: 270,
    taxRate: 0.155,
    calculationBasis: 'ORIGINAL_RACE'
  };
  const raceIds = await Promise.all([
    upsertPaymentTaxObligation({ ...raceBase, taxAmount: 41.85 }),
    upsertPaymentTaxObligation({ ...raceBase, taxAmount: 77 })
  ]);
  const raceRows = await TaxObligation.find({ paymentId: racePayment, taxType: 'VAT_ON_COMMISSION', reversalOf: null }).lean();
  const raceRetry = await upsertPaymentTaxObligation({ ...raceBase, taxAmount: 99.99 });
  const raceAfter = await TaxObligation.findById(raceIds[0]).lean();
  assert(raceRows.length === 1 && String(raceIds[0]) === String(raceIds[1]), `concurrent originals collapse to one row, got ${raceRows.length}`);
  assert(String(raceRetry) === String(raceRows[0]._id) && Number(raceAfter?.taxAmount) === Number(raceRows[0].taxAmount), 'a later original upsert does not overwrite the stored amount');

  const clashJournal = `clash-${new mongoose.Types.ObjectId().toString()}`;
  await TaxObligation.collection.createIndex(
    { journalEntryId: 1 },
    { unique: true, sparse: true, name: 'journalEntryId_unique_probe' }
  );
  await TaxObligation.collection.insertOne({
    companyId: company._id,
    paymentId: new mongoose.Types.ObjectId(),
    taxType: 'VAT_OUTPUT',
    reversalOf: null,
    taxAmount: 1,
    taxableAmount: 1,
    taxRate: 0,
    taxPeriod: '2026-10',
    transactionDate: PAYMENT_DATE,
    status: 'PAYABLE',
    entityType: 'payment',
    calculationBasis: 'UNRELATED_ORIGINAL',
    journalEntryId: clashJournal,
    calculatedAt: new Date()
  });
  const clashPayment = new mongoose.Types.ObjectId();
  let clashThrew = false;
  try {
    await upsertPaymentTaxObligation({
      ...raceBase,
      paymentId: String(clashPayment),
      taxAmount: 41.85,
      calculationBasis: 'NEW_ORIGINAL',
      journalEntryId: clashJournal
    });
  } catch (error: any) {
    clashThrew = Number(error?.code) === 11000;
  }
  assert(clashThrew, 'a duplicate-key error from another index is not treated as an existing original');
  assert(await TaxObligation.countDocuments({ paymentId: clashPayment }) === 0, 'the rejected original was not saved');

  if (failures.length) {
    console.error(failures.join('\n'));
    throw new Error(`${failures.length} reversal idempotency assertion(s) failed`);
  }
  console.log('VAT reversal idempotency tests passed');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.dropDatabase().catch(() => undefined);
    await accountingConnection.dropDatabase().catch(() => undefined);
    await mongoose.disconnect().catch(() => undefined);
    await accountingConnection.close().catch(() => undefined);
  });
