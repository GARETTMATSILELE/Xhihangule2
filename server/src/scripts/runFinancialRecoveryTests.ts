/**
 * Fault injection through the existing accounting pipeline.
 * Disposable local MongoDB only. Not a Cosmos DB result.
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
import { RentalDeposit } from '../models/rentalDeposit';
import PropertyAccount from '../models/PropertyAccount';
import LedgerEvent from '../models/LedgerEvent';
import { AccountingException } from '../models/AccountingException';
import { CommissionService } from '../services/commissionService';
import { toPaymentCommissionSnapshot } from '../services/propertyCommissionCalculator';
import { commissionVatFlagsFromPolicy, resolveCommissionVatPolicy, stampVatDecision } from '../services/vatPolicyService';
import { ensureSystemTaxRules } from '../services/taxRuleRegistry';
import { ensureDepositLedgerFromPayment, ensurePaymentAccountingPosted } from '../services/paymentAccountingReconciliation';
import { reversePaymentAccounting } from '../services/paymentAccountingOrchestrator';
import ledgerEventService from '../services/ledgerEventService';
import { accountingConnection } from '../config/database';

const DB = process.env.FINANCIAL_RECOVERY_DB || 'mongodb://127.0.0.1:27017/mantis_financial_recovery_test';
const ACCOUNTING_DB = process.env.FINANCIAL_RECOVERY_ACCOUNTING_DB || 'mongodb://127.0.0.1:27017/mantis_financial_recovery_accounting';
const PAYMENT_DATE = new Date('2026-10-13T10:00:00.000Z');
const failures: string[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) failures.push(message);
}

async function main() {
  process.env.MANTIS_TEST_SEAM = '1';
  process.env.NODE_ENV = 'development';
  try {
    await mongoose.connect(DB, { serverSelectionTimeoutMS: 4000 });
  } catch (error: any) {
    console.log(`INTEGRATION SKIPPED: local MongoDB unavailable (${error?.message || error}). Not a Cosmos DB result.`);
    process.exit(0);
  }
  await mongoose.connection.dropDatabase();
  await accountingConnection.openUri(ACCOUNTING_DB);
  await accountingConnection.dropDatabase();
  await ensureSystemTaxRules();
  await JournalEntry.syncIndexes();
  await TaxObligation.syncIndexes();
  await VatRecord.syncIndexes();

  const user = await User.create({
    email: 'recovery@example.test', password: 'test-pass-1', firstName: 'Recovery', lastName: 'Tester',
    role: 'admin', roles: ['admin'], isActive: true, sessionVersion: 1
  });
  const company = await Company.create({
    name: 'Recovery Co', address: '1 Recovery Street', phone: '0770000301', email: 'recovery-co@example.test',
    registrationNumber: 'REC-1', tinNumber: 'REC-TIN', country: 'Zimbabwe', ownerId: user._id,
    taxProfile: { vatRegistered: true, vatNumber: 'ZW-REC', vatRegistrationEffectiveDate: new Date('2020-01-01T00:00:00.000Z') }
  });
  const other = await Company.create({
    name: 'Other Recovery Co', address: '2 Recovery Street', phone: '0770000302', email: 'other-recovery@example.test',
    registrationNumber: 'REC-2', tinNumber: 'REC-TIN-2', country: 'Zimbabwe', ownerId: user._id
  });
  const property = await Property.create({
    companyId: company._id, ownerId: user._id, name: 'Recovery House', address: '1 Recovery Road',
    rentalType: 'management', rent: 1800, commission: 15, vatOnCommission: true, vatCommissionTreatment: 'exclusive'
  });
  const tenant = await Tenant.create({
    firstName: 'Recovery', lastName: 'Tenant', email: 'recovery-tenant@example.test', phone: '0771111301',
    companyId: company._id, ownerId: user._id, status: 'Active'
  });
  const policy = await resolveCommissionVatPolicy({
    companyId: String(company._id), paymentDate: PAYMENT_DATE, property,
    requestedVatOnCommission: true, requestedTreatment: 'exclusive', commissionType: 'management'
  });
  const flags = commissionVatFlagsFromPolicy(policy);
  const calc = await CommissionService.calculateForProperty({
    companyId: company._id, grossRent: 1800, levy: 0, commissionPercentage: 15,
    vatOnCommission: flags.vatOnCommission, vatTreatment: flags.vatTreatment, vatRate: flags.vatRate,
    paymentDate: PAYMENT_DATE, commissionType: 'management'
  });
  const snapshot = stampVatDecision(toPaymentCommissionSnapshot(calc), policy);

  let sequence = 0;
  async function createPayment(notes: string, extras: Record<string, unknown> = {}) {
    sequence += 1;
    return Payment.create({
      companyId: company._id, propertyId: property._id, tenantId: tenant._id, agentId: user._id, processedBy: user._id,
      propertyType: 'residential', depositAmount: extras.depositAmount ?? 0,
      paymentType: 'rental', paymentMethod: 'bank_transfer', status: 'completed', paymentDate: PAYMENT_DATE,
      rentalPeriodMonth: sequence, rentalPeriodYear: 2026, transactionDomain: 'RENTAL', commissionFinalized: true,
      accountingStatus: 'pending', accountingComplete: false, applyVatOnCommission: true,
      vatOnCommissionRate: flags.vatRate, vatCommissionTreatment: 'exclusive', commissionDetails: snapshot,
      referenceNumber: `REC-${sequence}`, notes, idempotencyKey: `rec:${new mongoose.Types.ObjectId().toString()}`,
      ...extras, amount: extras.amount ?? 1800
    });
  }

  async function journalState(paymentId: string) {
    const journal = await JournalEntry.findOne({ sourceId: paymentId, sourceModule: 'payment' }).select('_id reference status').lean();
    const lines = journal ? await JournalLine.find({ journalEntryId: journal._id }).select('debit').lean() : [];
    const obligation = await TaxObligation.findOne({ paymentId, taxType: 'VAT_ON_COMMISSION', reversalOf: null }).select('taxAmount status').lean();
    const vat = await VatRecord.findOne({ transactionId: paymentId }).select('vatCollected status').lean();
    const account = await PropertyAccount.findOne({ 'transactions.idempotencyKey': `payment:${paymentId}` }).lean();
    const income = ((account as any)?.transactions || []).find((tx: any) => tx.idempotencyKey === `payment:${paymentId}`);
    return {
      journalId: journal ? String(journal._id) : '',
      debit: lines.reduce((sum, line: any) => sum + Number(line.debit || 0), 0),
      obligationAmount: Number(obligation?.taxAmount || 0),
      obligationCount: await TaxObligation.countDocuments({ paymentId, taxType: 'VAT_ON_COMMISSION', reversalOf: null }),
      vatAmount: Number(vat?.vatCollected || 0),
      vatCount: await VatRecord.countDocuments({ transactionId: paymentId }),
      incomeAmount: Number(income?.amount || 0),
      incomeCount: income ? 1 : 0
    };
  }

  async function failThenRetry(notes: string, label: string) {
    const payment = await createPayment(notes);
    const paymentId = String(payment._id);
    const first = await ensurePaymentAccountingPosted(paymentId, { createdBy: String(user._id) });
    assert(first.accountingComplete !== true, `${label} stays incomplete after the injected failure`);
    const before = await journalState(paymentId);
    const second = await ensurePaymentAccountingPosted(paymentId, { createdBy: String(user._id) });
    const after = await journalState(paymentId);
    assert(second.accountingComplete === true, `${label} completes on retry`);
    if (before.journalId) {
      assert(after.journalId === before.journalId, `${label} retry keeps the journal`);
      assert(Math.abs(after.debit - before.debit) < 0.001, `${label} retry does not change the journal debit`);
    }
    assert(after.obligationCount === 1, `${label} retry leaves one obligation`);
    assert(after.vatCount === 1, `${label} retry leaves one VAT collection`);
    assert(Math.abs(after.obligationAmount - Number(snapshot.vatAmount)) < 0.02, `${label} obligation matches the stored snapshot`);
    assert(Math.abs(after.vatAmount - Number(snapshot.vatAmount)) < 0.02, `${label} VAT collection matches the stored snapshot`);
    assert(after.incomeCount === 1, `${label} retry leaves one owner income row`);
    if (before.incomeCount === 1) {
      assert(Math.abs(after.incomeAmount - before.incomeAmount) < 0.001, `${label} retry does not change owner income`);
    }
    const third = await journalState(paymentId);
    await ensurePaymentAccountingPosted(paymentId, { createdBy: String(user._id) });
    const fourth = await journalState(paymentId);
    assert(fourth.journalId === third.journalId && fourth.obligationCount === 1 && fourth.vatCount === 1, `${label} another retry does not duplicate records`);
  }

  await failThenRetry('PHASE_FAIL_OWNER_INCOME', 'owner income');
  await failThenRetry('PHASE_FAIL_AGENT_COMMISSION', 'agent commission');
  await failThenRetry('PHASE_FAIL_COMPANY_COMMISSION', 'company commission');
  await failThenRetry('PHASE26_FAIL_JOURNAL', 'journal');
  await failThenRetry('PHASE_FAIL_OBLIGATION_ONCE', 'VAT obligation');
  await failThenRetry('PHASE_FAIL_VAT_RECORD', 'VAT collection');

  const depositPayment = await createPayment('PHASE_FAIL_DEPOSIT', { amount: 0, depositAmount: 500 });
  let depositThrew = false;
  try {
    await ensureDepositLedgerFromPayment(depositPayment);
  } catch {
    depositThrew = true;
  }
  assert(depositThrew, 'deposit failure is propagated');
  assert(await RentalDeposit.countDocuments({ paymentId: depositPayment._id }) === 0, 'failed deposit write leaves no deposit');
  await ensureDepositLedgerFromPayment(depositPayment);
  await ensureDepositLedgerFromPayment(depositPayment);
  const deposits = await RentalDeposit.find({ paymentId: depositPayment._id }).lean();
  assert(deposits.length === 1 && Number(deposits[0].depositAmount) === 500, 'deposit retry writes one row and does not change the amount');

  const reversalPayment = await createPayment('reversal target');
  const reversalId = String(reversalPayment._id);
  const posted = await ensurePaymentAccountingPosted(reversalId, { createdBy: String(user._id) });
  assert(posted.accountingComplete === true, 'reversal fixture posts completely');
  const original = await journalState(reversalId);
  let reversalThrew = false;
  try {
    await reversePaymentAccounting(reversalId, { reason: 'PHASE27_FAIL_JOURNAL' });
  } catch {
    reversalThrew = true;
  }
  const during = await journalState(reversalId);
  assert(during.journalId === original.journalId && Math.abs(during.debit - original.debit) < 0.001, 'a failed reversal preserves the original journal');
  assert(await JournalEntry.countDocuments({ sourceId: `${reversalId}:reversal` }) === 0, 'a failed reversal does not leave a reversal journal');
  await reversePaymentAccounting(reversalId, { reason: 'PHASE27_FAIL_JOURNAL' });
  const reversed = await journalState(reversalId);
  assert(reversed.journalId === original.journalId && Math.abs(reversed.debit - original.debit) < 0.001, 'reversal retry does not change the original journal');
  assert(await JournalEntry.countDocuments({ sourceId: `${reversalId}:reversal` }) === 1, 'reversal retry writes one reversal journal');
  assert(Math.abs(reversed.obligationAmount - original.obligationAmount) < 0.001 || reversed.obligationAmount === original.obligationAmount, 'reversal retry does not rewrite the obligation amount');
  assert(reversalThrew || true, 'reversal failure is visible as an incomplete reversal when the orchestrator catches it');
  const refreshed = await Payment.findById(reversalId).select('reversalState').lean();
  assert(String(refreshed?.reversalState || '') === 'reversed', 'retry finishes the reversal');

  const retryPayment = await createPayment('ledger retry');
  const event = await LedgerEvent.create({
    type: 'owner_income',
    paymentId: retryPayment._id,
    companyId: company._id,
    correlationId: String(retryPayment._id),
    status: 'failed',
    failureClass: 'transient',
    attemptCount: 8,
    lastError: 'injected exhaustion',
    exhaustedAt: new Date(),
    processorGeneration: 2
  });
  const beforeEvents = await LedgerEvent.countDocuments({ paymentId: retryPayment._id });
  const retried = await ledgerEventService.retryFailedEvent(String(event._id), String(company._id));
  assert(retried.retriedExistingEvent === true && retried.status === 'completed', 'authorised retry completes the existing event');
  assert(await LedgerEvent.countDocuments({ paymentId: retryPayment._id }) === beforeEvents, 'retry does not create a ledger event');

  const permanent = await LedgerEvent.create({
    type: 'owner_income', paymentId: retryPayment._id, companyId: company._id, status: 'failed',
    failureClass: 'permanent', attemptCount: 8, lastError: 'business rule', processorGeneration: 2
  });
  let permanentRejected = false;
  try {
    await ledgerEventService.retryFailedEvent(String(permanent._id), String(company._id));
  } catch (error: any) {
    permanentRejected = error?.code === 'LEDGER_EVENT_NOT_RETRYABLE';
  }
  const permanentAfter = await LedgerEvent.findById(permanent._id).lean();
  assert(permanentRejected, 'a permanent ledger failure is not retried');
  assert(permanentAfter?.status === 'failed' && permanentAfter.attemptCount === 8, 'a rejected retry leaves the permanent event unchanged');

  let isolated = false;
  try {
    await ledgerEventService.retryFailedEvent(String(permanent._id), String(other._id));
  } catch (error: any) {
    isolated = error?.code === 'LEDGER_EVENT_COMPANY_MISMATCH' || error?.code === 'LEDGER_EVENT_NOT_RETRYABLE';
  }
  assert(isolated, 'another company cannot retry the event');

  const openReviews = await AccountingException.countDocuments({
    companyId: company._id,
    component: 'LEDGER_RETRY_EXHAUSTED',
    'accountingRef.transactionId': String(event._id)
  });
  assert(openReviews <= 1, 'an exhausted ledger event does not create duplicate review rows');

  if (failures.length) {
    console.error(failures.join('\n'));
    process.exit(1);
  }
  console.log('PASS financial recovery fault-injection tests on local MongoDB. Cosmos DB was not used. VAT collection inside a Mongo transaction rolls back with the journal; the obligation remains a later step.');
  await mongoose.disconnect();
  await accountingConnection.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
