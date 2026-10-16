/**
 * Isolated financial lifecycle checks against persisted records.
 * Uses disposable local databases. Does not verify Cosmos DB and does not
 * recalculate historical VAT independently of the stored payment snapshot.
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
import PropertyAccount from '../models/PropertyAccount';
import { CompanyAccount } from '../models/CompanyAccount';
import { CommissionService } from '../services/commissionService';
import { toPaymentCommissionSnapshot } from '../services/propertyCommissionCalculator';
import { centralVatRateBlock, commissionVatFlagsFromPolicy, resolveCommissionVatPolicy, stampVatDecision } from '../services/vatPolicyService';
import { ensureSystemTaxRules } from '../services/taxRuleRegistry';
import { ensureDepositLedgerFromPayment, ensurePaymentAccountingPosted, reconcilePayment } from '../services/paymentAccountingReconciliation';
import { RentalDeposit } from '../models/rentalDeposit';
import { reversePaymentAccounting } from '../services/paymentAccountingOrchestrator';
import { prepareVatReturn } from '../services/vatReturnService';
import { detectFinancialPostingGaps } from '../services/financialPostingGapService';
import { computeOwnerIncomeAmount } from '../services/paymentAccountingCompleteness';
import { FINANCIAL_UNIQUENESS } from '../services/financialUniquenessRegistry';
import { accountingConnection } from '../config/database';

const DB = process.env.FINANCIAL_CONSISTENCY_DB || 'mongodb://127.0.0.1:27017/mantis_financial_consistency_test';
const ACCOUNTING_DB = process.env.FINANCIAL_CONSISTENCY_ACCOUNTING_DB || 'mongodb://127.0.0.1:27017/mantis_financial_consistency_accounting';
const PAYMENT_DATE = new Date('2026-10-13T10:00:00.000Z');
const failures: string[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) failures.push(message);
}

async function main() {
  assert(FINANCIAL_UNIQUENESS.every((row) => row.productionEnforcement !== 'DECLARED_UNVERIFIED_ON_COSMOS' || row.limitation.length > 0), 'uniqueness registry states the Cosmos limitation');
  assert(FINANCIAL_UNIQUENESS.some((row) => row.collection === 'payment_sessions' && row.productionEnforcement === 'NOT_ENFORCED'), 'Paynow providerRef is not described as unique');
  process.env.MANTIS_TEST_SEAM = '1';
  process.env.NODE_ENV = 'development';
  try {
    await mongoose.connect(DB, { serverSelectionTimeoutMS: 4000 });
  } catch (error: any) {
    console.log(`INTEGRATION SKIPPED: local MongoDB unavailable (${error?.message || error}). Registry assertions ran. Not a Cosmos DB result.`);
    process.exit(failures.length ? 1 : 0);
  }
  await mongoose.connection.dropDatabase();
  await accountingConnection.openUri(ACCOUNTING_DB);
  await accountingConnection.dropDatabase();
  await ensureSystemTaxRules();
  await JournalEntry.syncIndexes();
  await TaxObligation.syncIndexes();
  await VatRecord.syncIndexes();

  const user = await User.create({
    email: 'consistency@example.test',
    password: 'test-pass-1',
    firstName: 'Consistency',
    lastName: 'Tester',
    role: 'admin',
    roles: ['admin'],
    isActive: true,
    sessionVersion: 1
  });
  const company = await Company.create({
    name: 'Consistency Co',
    address: '1 Consistency Street',
    phone: '0770000091',
    email: 'consistency-co@example.test',
    registrationNumber: 'CONS-1',
    tinNumber: 'CONS-TIN',
    country: 'Zimbabwe',
    ownerId: user._id,
    taxProfile: { vatRegistered: true, vatNumber: 'ZW-CONS', vatRegistrationEffectiveDate: new Date('2020-01-01T00:00:00.000Z') }
  });
  const otherCompany = await Company.create({
    name: 'Other Consistency Co',
    address: '2 Consistency Street',
    phone: '0770000092',
    email: 'other-consistency@example.test',
    registrationNumber: 'CONS-2',
    tinNumber: 'CONS-TIN-2',
    country: 'Zimbabwe',
    ownerId: user._id,
    taxProfile: { vatRegistered: false }
  });
  const exclusive = await Property.create({
    companyId: company._id, ownerId: user._id, name: 'Exclusive House', address: '1 Exclusive Road',
    rentalType: 'management', rent: 1800, commission: 15, vatOnCommission: true, vatCommissionTreatment: 'exclusive'
  });
  const inclusive = await Property.create({
    companyId: company._id, ownerId: user._id, name: 'Inclusive House', address: '1 Inclusive Road',
    rentalType: 'management', rent: 1800, commission: 15, vatOnCommission: true, vatCommissionTreatment: 'inclusive'
  });
  const tenant = await Tenant.create({
    firstName: 'Consistency', lastName: 'Tenant', email: 'consistency-tenant@example.test', phone: '0771111191',
    companyId: company._id, ownerId: user._id, status: 'Active'
  });

  async function snapshotFor(property: any, amount: number, levy = 0) {
    const policy = await resolveCommissionVatPolicy({
      companyId: String(company._id),
      paymentDate: PAYMENT_DATE,
      property,
      requestedVatOnCommission: Boolean(property.vatOnCommission),
      requestedTreatment: property.vatCommissionTreatment,
      commissionType: 'management'
    });
    const flags = commissionVatFlagsFromPolicy(policy);
    const calc = await CommissionService.calculateForProperty({
      companyId: company._id,
      grossRent: amount,
      levy,
      commissionPercentage: Number(property.commission || 0),
      vatOnCommission: flags.vatOnCommission,
      vatTreatment: flags.vatTreatment,
      vatRate: flags.vatRate,
      paymentDate: PAYMENT_DATE,
      commissionType: 'management'
    });
    return { policy, flags, snapshot: stampVatDecision(toPaymentCommissionSnapshot(calc), policy) };
  }

  let sequence = 0;
  async function post(input: {
    property: any;
    amount: number;
    depositAmount?: number;
    levy?: number;
    notes?: string;
    advanceMonthsPaid?: number;
    month?: number;
  }) {
    sequence += 1;
    const built = await snapshotFor(input.property, input.amount, input.levy || 0);
    const payment = await Payment.create({
      companyId: company._id,
      propertyId: input.property._id,
      tenantId: tenant._id,
      agentId: user._id,
      processedBy: user._id,
      propertyType: 'residential',
      amount: input.amount,
      depositAmount: input.depositAmount || 0,
      paymentType: 'rental',
      paymentMethod: 'bank_transfer',
      status: 'completed',
      paymentDate: PAYMENT_DATE,
      rentalPeriodMonth: input.month || sequence,
      rentalPeriodYear: 2026,
      advanceMonthsPaid: input.advanceMonthsPaid,
      transactionDomain: 'RENTAL',
      commissionFinalized: true,
      accountingStatus: 'pending',
      accountingComplete: false,
      applyVatOnCommission: built.flags.vatOnCommission,
      vatOnCommissionRate: built.flags.vatRate,
      vatCommissionTreatment: built.flags.vatTreatment,
      commissionDetails: built.snapshot,
      levyAllocated: input.levy || 0,
      referenceNumber: `CONS-${sequence}`,
      notes: input.notes,
      idempotencyKey: `cons:${new mongoose.Types.ObjectId().toString()}`
    });
    const posted = await ensurePaymentAccountingPosted(String(payment._id), { createdBy: String(user._id) });
    return { payment, built, posted };
  }

  async function journalDebit(paymentId: string) {
    const journal = await JournalEntry.findOne({ sourceId: paymentId, status: 'posted', sourceModule: 'payment' }).lean();
    if (!journal) return { journal: null, debit: 0 };
    const lines = await JournalLine.find({ journalEntryId: journal._id }).select('debit').lean();
    return { journal, debit: lines.reduce((sum, line: any) => sum + Number(line.debit || 0), 0) };
  }

  const normal = await post({ property: exclusive, amount: 1800, month: 1 });
  const normalJournal = await journalDebit(String(normal.payment._id));
  const normalObligation = await TaxObligation.findOne({ paymentId: normal.payment._id, taxType: 'VAT_ON_COMMISSION', reversalOf: null }).lean();
  const normalVat = await VatRecord.findOne({ transactionId: String(normal.payment._id) }).lean();
  const normalIncome = await PropertyAccount.findOne({ 'transactions.idempotencyKey': `payment:${normal.payment._id}` }).lean();
  const incomeTx = ((normalIncome as any)?.transactions || []).find((tx: any) => tx.idempotencyKey === `payment:${normal.payment._id}`);
  assert(normal.posted.accountingComplete === true, `normal rental accounting completes, got ${normal.posted.accountingStatus}`);
  assert(Math.abs(normalJournal.debit - 1800) < 0.02, `journal debit matches the payment amount, got ${normalJournal.debit}`);
  assert(Number(normalObligation?.taxAmount) === Number(normal.built.snapshot.vatAmount), 'obligation matches the stored VAT snapshot');
  assert(Number(normalVat?.vatCollected) === Number(normal.built.snapshot.vatAmount), 'VAT collection matches the stored VAT snapshot');
  assert(Number(incomeTx?.amount) === Number(normal.built.snapshot.ownerAmount), 'property account income matches the stored owner amount');
  assert(Boolean(normal.built.snapshot.vatDecision?.reason) && normal.built.snapshot.vatDecision?.registrationStatus === true, 'future snapshot stores the VAT decision evidence');
  assert(normal.built.snapshot.vatDecision?.treatment === 'exclusive', 'exclusive treatment is stored on the decision');

  const repeat = await ensurePaymentAccountingPosted(String(normal.payment._id), { createdBy: String(user._id) });
  assert(repeat.accountingComplete === true, 'repeated posting stays complete');
  assert(await JournalEntry.countDocuments({ sourceId: String(normal.payment._id), sourceModule: 'payment' }) === 1, 'repeated posting does not add a journal');
  assert(await TaxObligation.countDocuments({ paymentId: normal.payment._id, taxType: 'VAT_ON_COMMISSION', reversalOf: null }) === 1, 'repeated posting does not add an obligation');

  const concurrentPayment = await (async () => {
    const built = await snapshotFor(exclusive, 1800);
    const payment = await Payment.create({
      companyId: company._id, propertyId: exclusive._id, tenantId: tenant._id, agentId: user._id, processedBy: user._id,
      propertyType: 'residential', amount: 1800, depositAmount: 0, paymentType: 'rental', paymentMethod: 'bank_transfer',
      status: 'completed', paymentDate: PAYMENT_DATE, rentalPeriodMonth: 2, rentalPeriodYear: 2026, transactionDomain: 'RENTAL',
      commissionFinalized: true, accountingStatus: 'pending', accountingComplete: false, applyVatOnCommission: true,
      vatOnCommissionRate: built.flags.vatRate, vatCommissionTreatment: 'exclusive', commissionDetails: built.snapshot,
      referenceNumber: 'CONS-CONCURRENT', idempotencyKey: `cons:${new mongoose.Types.ObjectId().toString()}`
    });
    await Promise.all([
      ensurePaymentAccountingPosted(String(payment._id), { createdBy: String(user._id) }),
      ensurePaymentAccountingPosted(String(payment._id), { createdBy: String(user._id) })
    ]);
    return payment;
  })();
  assert(await JournalEntry.countDocuments({ sourceId: String(concurrentPayment._id), sourceModule: 'payment' }) === 1, 'concurrent posting leaves one journal');
  assert(await TaxObligation.countDocuments({ paymentId: concurrentPayment._id, taxType: 'VAT_ON_COMMISSION', reversalOf: null }) === 1, 'concurrent posting leaves one obligation');

  const partial = await post({ property: exclusive, amount: 900, month: 3 });
  const partialJournal = await journalDebit(String(partial.payment._id));
  assert(Math.abs(partialJournal.debit - 900) < 0.02, 'partial receipt journal uses the received amount');
  assert(Number((await TaxObligation.findOne({ paymentId: partial.payment._id, reversalOf: null }).lean())?.taxAmount) === Number(partial.built.snapshot.vatAmount), 'partial obligation matches its own snapshot');

  const advance = await post({ property: exclusive, amount: 3600, advanceMonthsPaid: 2, month: 4 });
  assert(await JournalEntry.countDocuments({ sourceId: String(advance.payment._id), sourceModule: 'payment' }) === 1, 'advance rent posts one journal');
  assert(Math.abs((await journalDebit(String(advance.payment._id))).debit - 3600) < 0.02, 'advance journal matches the receipt, not a second month');

  const depositBuilt = await snapshotFor(exclusive, 0);
  const depositPayment = await Payment.create({
    companyId: company._id, propertyId: exclusive._id, tenantId: tenant._id, agentId: user._id, processedBy: user._id,
    propertyType: 'residential', amount: 0, depositAmount: 500, paymentType: 'rental', paymentMethod: 'bank_transfer',
    status: 'completed', paymentDate: PAYMENT_DATE, rentalPeriodMonth: 5, rentalPeriodYear: 2026, transactionDomain: 'RENTAL',
    commissionFinalized: true, accountingStatus: 'pending', accountingComplete: false, commissionDetails: depositBuilt.snapshot,
    referenceNumber: 'CONS-DEPOSIT', idempotencyKey: `cons:${new mongoose.Types.ObjectId().toString()}`
  });
  await ensureDepositLedgerFromPayment(depositPayment);
  const depositPosted = await ensurePaymentAccountingPosted(String(depositPayment._id), { createdBy: String(user._id) });
  assert(await RentalDeposit.countDocuments({ paymentId: depositPayment._id, type: 'payment' }) === 1, 'deposit-only receipt stores one deposit ledger row');
  assert(!(await JournalEntry.findOne({ sourceId: String(depositPayment._id) }).lean()), 'deposit-only receipt does not create a rental journal');
  assert(depositPosted.accountingComplete === true, `deposit-only receipt is complete once the deposit ledger exists, got ${depositPosted.accountingStatus} missing ${depositPosted.recon.missing.join(',')}`);

  const levy = await post({ property: exclusive, amount: 1800, levy: 40, month: 6 });
  const levyIncome = await PropertyAccount.findOne({ 'transactions.idempotencyKey': `payment:${levy.payment._id}` }).lean();
  const levyTx = ((levyIncome as any)?.transactions || []).find((tx: any) => tx.idempotencyKey === `payment:${levy.payment._id}`);
  const expectedLevyOwner = computeOwnerIncomeAmount({
    isSale: false,
    ownerAmount: levy.built.snapshot.ownerAmount,
    passThroughTotal: 40
  });
  assert(Number(levyTx?.amount) === expectedLevyOwner, `levy receipt owner projection follows the stored owner amount less the levy pass-through, got ${levyTx?.amount} expected ${expectedLevyOwner}`);
  const companyAccount = await CompanyAccount.findOne({ companyId: company._id }).lean();
  const companyTx = ((companyAccount as any)?.transactions || []).find((tx: any) => String(tx.paymentId) === String(levy.payment._id) && tx.isArchived !== true && !tx.reversesPaymentId);
  assert(Number(companyTx?.amount) === Number(levy.built.snapshot.agencyShare), 'company commission projection matches the stored agency share');

  const inclusivePayment = await post({ property: inclusive, amount: 1800, month: 7 });
  assert(inclusivePayment.built.snapshot.vatDecision?.treatment === 'inclusive', 'inclusive treatment is stored');
  assert(Number((await TaxObligation.findOne({ paymentId: inclusivePayment.payment._id, reversalOf: null }).lean())?.taxAmount) === Number(inclusivePayment.built.snapshot.vatAmount), 'inclusive obligation matches the stored snapshot');

  const gap = await post({ property: exclusive, amount: 1800, notes: 'PHASE_FAIL_OBLIGATION_ONCE', month: 8 });
  assert(gap.posted.accountingComplete === false, 'failure after the journal and before the obligation stays incomplete');
  const gapJournalId = String((await JournalEntry.findOne({ sourceId: String(gap.payment._id), sourceModule: 'payment' }).lean())?._id);
  assert(Boolean(gapJournalId), 'the journal remains after the obligation failure');
  const recovered = await ensurePaymentAccountingPosted(String(gap.payment._id), { createdBy: String(user._id) });
  assert(recovered.accountingComplete === true, `retry after the obligation failure completes, got ${recovered.accountingStatus} ${recovered.recon?.missing?.join(',')}`);
  assert(String((await JournalEntry.findOne({ sourceId: String(gap.payment._id), sourceModule: 'payment' }).lean())?._id) === gapJournalId, 'retry does not replace the journal');

  const beforeReverse = await TaxObligation.findOne({ paymentId: normal.payment._id, reversalOf: null }).lean();
  const beforeVat = await VatRecord.findOne({ transactionId: String(normal.payment._id) }).lean();
  const reversed = await reversePaymentAccounting(String(normal.payment._id), { reason: 'consistency reversal' });
  assert(reversed.status === 'reversed' || reversed.status === 'already_reversed', `reversal completes, got ${reversed.status} ${reversed.errors.join('; ')}`);
  const afterReverse = await TaxObligation.findById(beforeReverse?._id).lean();
  const afterVat = await VatRecord.findById(beforeVat?._id).lean();
  assert(Number(afterReverse?.taxAmount) === Number(beforeReverse?.taxAmount) && afterReverse?.status === 'REVERSED', 'reversal preserves the obligation amount');
  assert(Number(afterVat?.vatCollected) === Number(beforeVat?.vatCollected), 'reversal preserves the VAT collection amount');

  const unregisteredPolicy = await resolveCommissionVatPolicy({
    companyId: String(otherCompany._id),
    paymentDate: PAYMENT_DATE,
    property: exclusive,
    requestedVatOnCommission: true,
    requestedTreatment: 'exclusive',
    commissionType: 'management'
  });
  assert(unregisteredPolicy.apply === false && unregisteredPolicy.decision.reason === 'company_not_vat_registered_on_date', 'missing registration withholds VAT and records the reason');
  assert(unregisteredPolicy.decision.registrationEffectiveDate == null, 'a missing registration date is not invented');
  const blocked = centralVatRateBlock({ reason: 'vat_rate_missing_on_transaction_date' });
  assert(blocked?.code === 'VAT_RATE_UNAVAILABLE', 'missing central VAT rate blocks the payment instead of posting zero VAT as if it were calculated');

  const otherGaps = await detectFinancialPostingGaps(String(otherCompany._id));
  assert(otherGaps.every((row) => row.companyId === String(otherCompany._id)), 'gap detection stays inside the requested company');
  const recon = await reconcilePayment(String(inclusivePayment.payment._id));
  assert(recon.accountingComplete === true, 'accountant reconciliation agrees the inclusive payment is complete');

  const obligationSum = (await TaxObligation.find({
    companyId: company._id,
    taxPeriod: '2026-10',
    taxType: { $in: ['VAT_OUTPUT', 'VAT_ON_COMMISSION'] },
    status: { $ne: 'REVERSED' }
  }).lean()).reduce((sum, row) => sum + Number(row.taxAmount || 0), 0);
  const vatReturn = await prepareVatReturn(String(company._id), '2026-10', String(user._id));
  assert(Math.abs(Number(vatReturn.outputVat || 0) - obligationSum) < 0.05, `VAT return output follows non-reversed obligations, return ${vatReturn.outputVat} obligations ${obligationSum}`);

  if (failures.length) {
    console.error(failures.map((row) => `FAIL ${row}`).join('\n'));
    process.exit(1);
  }
  console.log('PASS financial consistency cases on local MongoDB. Cosmos DB was not used. VAT return output is the filing-period working paper over non-reversed obligations; reversed snapshots stay on the original payment and are excluded from that return.');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
