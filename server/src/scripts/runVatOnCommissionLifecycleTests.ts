/**
 * VAT-on-commission lifecycle: second and later payments, advance rent,
 * idempotent reprocessing, reversals, and tax-report reconciliation.
 * Uses an isolated database. Does not touch the application database.
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
import { resolveCommissionVatPolicy, commissionVatFlagsFromPolicy, centralVatRateBlock } from '../services/vatPolicyService';
import { ensureSystemTaxRules } from '../services/taxRuleRegistry';
import { ensurePaymentAccountingPosted } from '../services/paymentAccountingReconciliation';
import { reversePaymentAccounting } from '../services/paymentAccountingOrchestrator';
import { prepareVatReturn } from '../services/vatReturnService';
import { detectVatOnCommissionExceptions } from '../services/taxIntegrityService';
import { AppError } from '../middleware/errorHandler';
import { accountingConnection } from '../config/database';

const DB = process.env.VAT_LIFECYCLE_DB || 'mongodb://127.0.0.1:27017/vat_commission_lifecycle_test';
const ACCOUNTING_DB = process.env.VAT_LIFECYCLE_ACCOUNTING_DB || 'mongodb://127.0.0.1:27017/vat_commission_lifecycle_accounting';
const PAYMENT_DATE = new Date('2026-10-13T10:00:00.000Z');
const PRIOR_RATE_DATE = new Date('2025-06-15T10:00:00.000Z');
const failures: string[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) failures.push(message);
}

function money(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

async function snapshotFor(property: any, companyId: string, amount: number, paymentDate = PAYMENT_DATE) {
  const policy = await resolveCommissionVatPolicy({
    companyId,
    paymentDate,
    property,
    requestedVatOnCommission: Boolean(property.vatOnCommission),
    requestedTreatment: property.vatCommissionTreatment,
    commissionType: 'management'
  });
  const flags = commissionVatFlagsFromPolicy(policy);
  const calc = await CommissionService.calculateForProperty({
    companyId,
    grossRent: amount,
    levy: 0,
    commissionPercentage: Number(property.commission || 0),
    vatOnCommission: flags.vatOnCommission,
    vatTreatment: flags.vatTreatment,
    vatRate: flags.vatRate,
    paymentDate,
    commissionType: 'management'
  });
  return { policy, flags, calc, snapshot: toPaymentCommissionSnapshot(calc) };
}

async function createCompletedPayment(input: {
  companyId: string;
  propertyId: string;
  tenantId: string;
  userId: string;
  amount: number;
  depositAmount?: number;
  periodMonth: number;
  periodYear: number;
  snapshot: any;
  flags: { vatOnCommission: boolean; vatRate: number; vatTreatment?: 'inclusive' | 'exclusive' };
  paymentDate?: Date;
}) {
  return Payment.create({
    companyId: input.companyId,
    propertyId: input.propertyId,
    tenantId: input.tenantId,
    agentId: input.userId,
    processedBy: input.userId,
    propertyType: 'residential',
    amount: input.amount,
    depositAmount: input.depositAmount || 0,
    paymentType: 'rental',
    paymentMethod: 'bank_transfer',
    status: 'completed',
    paymentDate: input.paymentDate || PAYMENT_DATE,
    rentalPeriodMonth: input.periodMonth,
    rentalPeriodYear: input.periodYear,
    transactionDomain: 'RENTAL',
    commissionFinalized: true,
    accountingStatus: 'pending',
    accountingComplete: false,
    applyVatOnCommission: input.flags.vatOnCommission,
    vatOnCommissionRate: input.flags.vatRate,
    vatCommissionTreatment: input.flags.vatTreatment,
    commissionDetails: input.snapshot,
    idempotencyKey: `vat-test:${new mongoose.Types.ObjectId().toString()}`
  });
}

async function obligation(paymentId: string) {
  return TaxObligation.find({
    paymentId,
    taxType: 'VAT_ON_COMMISSION',
    reversalOf: null
  }).lean();
}

async function main() {
  await mongoose.connect(DB);
  await mongoose.connection.dropDatabase();
  await accountingConnection.openUri(ACCOUNTING_DB);
  await accountingConnection.dropDatabase();
  await ensureSystemTaxRules();

  const user = await User.create({
    email: 'vat-lifecycle-user@example.test',
    password: 'test-pass-1',
    firstName: 'VAT',
    lastName: 'Lifecycle',
    role: 'admin',
    roles: ['admin'],
    isActive: true,
    sessionVersion: 1
  });

  const registered = await Company.create({
    name: 'VAT Lifecycle Registered',
    address: '1 Test Street',
    phone: '0770000001',
    email: 'vat-lifecycle@example.test',
    registrationNumber: 'VAT-LIFE-REG',
    tinNumber: 'VAT-LIFE-TIN',
    country: 'Zimbabwe',
    ownerId: user._id,
    taxProfile: { vatRegistered: true, vatNumber: 'ZW-VAT-TEST' }
  });
  const unregistered = await Company.create({
    name: 'VAT Lifecycle Unregistered',
    address: '2 Test Street',
    phone: '0770000002',
    email: 'vat-unregistered@example.test',
    registrationNumber: 'VAT-LIFE-UNREG',
    tinNumber: 'VAT-LIFE-UNREG-TIN',
    country: 'Zimbabwe',
    ownerId: user._id,
    taxProfile: { vatRegistered: false }
  });
  const noRate = await Company.create({
    name: 'VAT Lifecycle No Rate',
    address: '3 Test Street',
    phone: '0770000003',
    email: 'vat-norate@example.test',
    registrationNumber: 'VAT-LIFE-NORATE',
    tinNumber: 'VAT-LIFE-NORATE-TIN',
    country: 'France',
    ownerId: user._id,
    taxProfile: { vatRegistered: true }
  });

  async function makeProperty(companyId: mongoose.Types.ObjectId, name: string, commission: number, vatOn: boolean, treatment?: 'inclusive' | 'exclusive') {
    return Property.create({
      companyId,
      ownerId: user._id,
      name,
      address: `${name} Road`,
      rentalType: 'management',
      rent: 1800,
      commission,
      vatOnCommission: vatOn,
      vatCommissionTreatment: treatment
    });
  }

  const exclusive = await makeProperty(registered._id, 'Exclusive 15', 15, true, 'exclusive');
  const inclusive = await makeProperty(registered._id, 'Inclusive 10', 10, true, 'inclusive');
  const disabled = await makeProperty(registered._id, 'VAT Off', 15, false);
  const otherRate = await makeProperty(registered._id, 'Exclusive 12', 12, true, 'exclusive');
  const unregisteredProperty = await makeProperty(unregistered._id, 'Unregistered Property', 15, true, 'exclusive');
  const noRateProperty = await makeProperty(noRate._id, 'No Rate Property', 15, true, 'exclusive');

  async function makeTenant(companyId: mongoose.Types.ObjectId, email: string) {
    return Tenant.create({
      firstName: 'Test',
      lastName: 'Tenant',
      email,
      phone: '0771111111',
      companyId,
      ownerId: user._id,
      status: 'Active'
    });
  }
  const tenant = await makeTenant(registered._id, 'tenant-reg@example.test');
  const otherTenant = await makeTenant(unregistered._id, 'tenant-unreg@example.test');

  const firstSnap = await snapshotFor(exclusive, String(registered._id), 1800);
  const secondSnap = await snapshotFor(exclusive, String(registered._id), 1800);
  assert(firstSnap.policy.apply === true, 'registered exclusive policy applies');
  assert(firstSnap.policy.vatRate === 0.155, `central rate is 15.5% on the payment date, got ${firstSnap.policy.vatRate}`);
  assert(firstSnap.calc.commissionNet === 270, `commission is 270, got ${firstSnap.calc.commissionNet}`);
  assert(firstSnap.calc.vatAmount === 41.85, `VAT is 41.85, got ${firstSnap.calc.vatAmount}`);
  assert(firstSnap.calc.ownerAmount === 1488.15, `owner allocation is 1488.15, got ${firstSnap.calc.ownerAmount}`);
  assert(firstSnap.snapshot.vatOnCommission === 41.85, 'payment snapshot stores the VAT amount');
  assert(secondSnap.calc.vatAmount === 41.85, 'second calculation is independent and also 41.85');

  const prior = await snapshotFor(exclusive, String(registered._id), 1800, PRIOR_RATE_DATE);
  assert(prior.policy.vatRate === 0.15, `15% rate applies before 2026, got ${prior.policy.vatRate}`);
  assert(prior.calc.vatAmount === 40.5, `prior-rate VAT is 40.50, got ${prior.calc.vatAmount}`);

  const basePayment = {
    companyId: String(registered._id),
    propertyId: String(exclusive._id),
    tenantId: String(tenant._id),
    userId: String(user._id)
  };
  const first = await createCompletedPayment({
    ...basePayment,
    amount: 1800,
    periodMonth: 10,
    periodYear: 2026,
    snapshot: firstSnap.snapshot,
    flags: firstSnap.flags
  });
  const advance = await createCompletedPayment({
    ...basePayment,
    amount: 1800,
    periodMonth: 11,
    periodYear: 2026,
    snapshot: secondSnap.snapshot,
    flags: secondSnap.flags
  });
  const priorPayment = await createCompletedPayment({
    ...basePayment,
    amount: 1800,
    periodMonth: 6,
    periodYear: 2025,
    snapshot: prior.snapshot,
    flags: prior.flags,
    paymentDate: PRIOR_RATE_DATE
  });

  await ensurePaymentAccountingPosted(String(first._id));
  await ensurePaymentAccountingPosted(String(advance._id));
  await ensurePaymentAccountingPosted(String(advance._id));
  await ensurePaymentAccountingPosted(String(priorPayment._id));

  const firstStored = await Payment.findById(first._id).lean();
  const advanceStored = await Payment.findById(advance._id).lean();
  assert(Number((firstStored as any).commissionDetails.vatOnCommission) === 41.85, 'first persisted VAT is 41.85');
  assert(Number((advanceStored as any).commissionDetails.vatOnCommission) === 41.85, 'advance persisted VAT is 41.85');
  assert((firstStored as any).accountingComplete === true, `first accounting is complete (${(firstStored as any).accountingStatus} ${(firstStored as any).accountingLastError || ''})`);
  assert((advanceStored as any).accountingComplete === true, `advance accounting is complete (${(advanceStored as any).accountingStatus} ${(advanceStored as any).accountingLastError || ''})`);

  const firstObligations = await obligation(String(first._id));
  const advanceObligations = await obligation(String(advance._id));
  assert(firstObligations.length === 1 && Number(firstObligations[0].taxAmount) === 41.85, `first has one VAT obligation of 41.85, got ${firstObligations.length}`);
  assert(Object.prototype.hasOwnProperty.call(firstObligations[0], 'reversalOf'), 'original VAT obligation stores reversalOf null so the unique index covers it');
  assert(advanceObligations.length === 1 && Number(advanceObligations[0].taxAmount) === 41.85, 'advance has one VAT obligation of 41.85 after retry');
  assert(String(firstObligations[0].taxPeriod) === '2026-10', 'tax period follows the payment date');
  assert(String(advanceObligations[0].taxPeriod) === '2026-10', 'advance rent uses the payment date, not the November rental period');
  assert(String((await obligation(String(priorPayment._id)))[0]?.taxPeriod) === '2025-06', 'earlier rate payment uses its own payment date');

  const advanceVatRecords = await VatRecord.find({ transactionId: String(advance._id), sourceType: 'rental' });
  assert(advanceVatRecords.length === 1 && money(advanceVatRecords[0].vatCollected) === 41.85, 'advance has one VAT collection record');
  const advanceJournals = await JournalEntry.find({ sourceId: String(advance._id), sourceModule: 'payment', status: 'posted' });
  assert(advanceJournals.length === 1, `advance has one posted receipt journal, got ${advanceJournals.length}`);

  await Promise.all([
    ensurePaymentAccountingPosted(String(advance._id)),
    ensurePaymentAccountingPosted(String(advance._id))
  ]);
  assert((await obligation(String(advance._id))).length === 1, 'concurrent reprocessing does not duplicate the VAT obligation');

  const laterSnaps = await Promise.all([
    snapshotFor(exclusive, String(registered._id), 1800),
    snapshotFor(exclusive, String(registered._id), 1800)
  ]);
  const third = await createCompletedPayment({
    ...basePayment,
    amount: 1800,
    periodMonth: 12,
    periodYear: 2026,
    snapshot: laterSnaps[0].snapshot,
    flags: laterSnaps[0].flags
  });
  const fourth = await createCompletedPayment({
    ...basePayment,
    amount: 1800,
    periodMonth: 1,
    periodYear: 2027,
    snapshot: laterSnaps[1].snapshot,
    flags: laterSnaps[1].flags
  });
  await ensurePaymentAccountingPosted(String(third._id));
  await ensurePaymentAccountingPosted(String(fourth._id));
  assert((await obligation(String(third._id))).length === 1, 'third payment has its own VAT obligation');
  assert((await obligation(String(fourth._id))).length === 1, 'fourth payment has its own VAT obligation');

  const otherSnap = await snapshotFor(otherRate, String(registered._id), 1800);
  assert(otherSnap.calc.commissionNet === 216, `12% commission is 216, got ${otherSnap.calc.commissionNet}`);
  assert(otherSnap.calc.vatAmount === 33.48, `12% VAT is 33.48, got ${otherSnap.calc.vatAmount}`);
  const other = await createCompletedPayment({
    ...basePayment,
    propertyId: String(otherRate._id),
    amount: 1800,
    periodMonth: 10,
    periodYear: 2026,
    snapshot: otherSnap.snapshot,
    flags: otherSnap.flags
  });
  await ensurePaymentAccountingPosted(String(other._id));
  const otherObligation = await obligation(String(other._id));
  assert(otherObligation.length === 1 && Number(otherObligation[0].taxAmount) === 33.48, 'different property keeps its own VAT amount');

  const inclusiveSnap = await snapshotFor(inclusive, String(registered._id), 1800);
  assert(inclusiveSnap.calc.commissionGross === 180, `inclusive commission is 180, got ${inclusiveSnap.calc.commissionGross}`);
  assert(inclusiveSnap.calc.vatAmount === 24.16, `inclusive VAT extracted is 24.16, got ${inclusiveSnap.calc.vatAmount}`);
  assert(inclusiveSnap.calc.ownerAmount === 1620, `inclusive owner allocation stays 1620, got ${inclusiveSnap.calc.ownerAmount}`);
  const inclusivePayment = await createCompletedPayment({
    ...basePayment,
    propertyId: String(inclusive._id),
    amount: 1800,
    periodMonth: 10,
    periodYear: 2026,
    snapshot: inclusiveSnap.snapshot,
    flags: inclusiveSnap.flags
  });
  await ensurePaymentAccountingPosted(String(inclusivePayment._id));

  const disabledPolicy = await resolveCommissionVatPolicy({
    companyId: String(registered._id),
    paymentDate: PAYMENT_DATE,
    property: disabled,
    requestedVatOnCommission: false,
    commissionType: 'management'
  });
  assert(disabledPolicy.apply === false, 'property VAT flag off withholds VAT');
  const disabledFlags = commissionVatFlagsFromPolicy(disabledPolicy);
  const disabledCalc = await CommissionService.calculateForProperty({
    companyId: registered._id,
    grossRent: 1800,
    levy: 0,
    commissionPercentage: 15,
    vatOnCommission: disabledFlags.vatOnCommission,
    vatTreatment: disabledFlags.vatTreatment,
    vatRate: disabledFlags.vatRate,
    paymentDate: PAYMENT_DATE,
    commissionType: 'management'
  });
  assert(Number(disabledCalc.vatAmount || 0) === 0, 'disabled property VAT amount is 0');
  const disabledPayment = await createCompletedPayment({
    ...basePayment,
    propertyId: String(disabled._id),
    amount: 1800,
    periodMonth: 10,
    periodYear: 2026,
    snapshot: toPaymentCommissionSnapshot(disabledCalc),
    flags: disabledFlags
  });
  await ensurePaymentAccountingPosted(String(disabledPayment._id));
  assert((await obligation(String(disabledPayment._id))).length === 0, 'disabled property creates no VAT obligation');

  const deposit = await createCompletedPayment({
    ...basePayment,
    amount: 0,
    depositAmount: 1800,
    periodMonth: 10,
    periodYear: 2026,
    snapshot: {
      totalCommission: 0,
      preaFee: 0,
      agentShare: 0,
      agencyShare: 0,
      vatOnCommission: 0,
      ownerAmount: 0,
      commissionNet: 0,
      vatAmount: 0
    },
    flags: { vatOnCommission: false, vatRate: 0 }
  });
  await ensurePaymentAccountingPosted(String(deposit._id));
  assert((await obligation(String(deposit._id))).length === 0, 'deposit-only receipt creates no VAT-on-commission obligation');

  const unregisteredFirst = await snapshotFor(unregisteredProperty, String(unregistered._id), 1800);
  const unregisteredSecond = await snapshotFor(unregisteredProperty, String(unregistered._id), 1800);
  assert(unregisteredFirst.policy.apply === false && unregisteredSecond.policy.apply === false, 'unregistered company withholds VAT on every payment');
  assert(Number(unregisteredFirst.calc.vatAmount || 0) === 0 && Number(unregisteredSecond.calc.vatAmount || 0) === 0, 'unregistered snapshots store zero VAT independently');
  const unregisteredPayments = [];
  for (const snap of [unregisteredFirst, unregisteredSecond]) {
    const row = await createCompletedPayment({
      companyId: String(unregistered._id),
      propertyId: String(unregisteredProperty._id),
      tenantId: String(otherTenant._id),
      userId: String(user._id),
      amount: 1800,
      periodMonth: snap === unregisteredFirst ? 10 : 11,
      periodYear: 2026,
      snapshot: snap.snapshot,
      flags: snap.flags
    });
    await ensurePaymentAccountingPosted(String(row._id));
    unregisteredPayments.push(row);
  }
  assert((await obligation(String(unregisteredPayments[0]._id))).length === 0, 'first unregistered payment has no VAT obligation');
  assert((await obligation(String(unregisteredPayments[1]._id))).length === 0, 'second unregistered payment has no VAT obligation');

  const missingRatePolicy = await resolveCommissionVatPolicy({
    companyId: String(noRate._id),
    paymentDate: PAYMENT_DATE,
    property: noRateProperty,
    requestedVatOnCommission: true,
    requestedTreatment: 'exclusive',
    commissionType: 'management'
  });
  assert(missingRatePolicy.apply === false && missingRatePolicy.reason === 'vat_rate_missing_on_transaction_date', 'missing central rate does not become zero VAT');
  assert(Boolean(centralVatRateBlock(missingRatePolicy)), 'missing central rate blocks the payment save');
  let missingRateThrew = false;
  try {
    await CommissionService.calculateForProperty({
      companyId: noRate._id,
      grossRent: 1800,
      levy: 0,
      commissionPercentage: 15,
      vatOnCommission: true,
      vatTreatment: 'exclusive',
      paymentDate: PAYMENT_DATE,
      commissionType: 'management'
    });
  } catch (error) {
    missingRateThrew = error instanceof AppError;
  }
  assert(missingRateThrew, 'calculation refuses to save when the central rate is missing');

  const reversal = await reversePaymentAccounting(String(advance._id), { reason: 'lifecycle test reversal' });
  assert(reversal.artifacts.tax === 'reversed', `reversal reverses the VAT obligation, got ${reversal.artifacts.tax} ${reversal.errors.join('; ')}`);
  assert(reversal.artifacts.vatRecord === 'reversed', `reversal marks the VAT collection record reversed, got ${reversal.artifacts.vatRecord}`);
  const reversalRows = await TaxObligation.find({ paymentId: advance._id, taxType: 'VAT_ON_COMMISSION' }).lean();
  assert(reversalRows.length === 2, `reversal keeps the original and adds one counter-entry, got ${reversalRows.length}`);
  assert(reversalRows.every((row) => row.status === 'REVERSED'), 'both VAT obligations are reversed');
  const reversedRecord = await VatRecord.findOne({ transactionId: String(advance._id) }).lean();
  assert(reversedRecord?.status === 'reversed', 'VAT collection status is reversed');
  assert(money(Number(reversedRecord?.vatCollected || 0)) === 41.85, 'reversed collection keeps the original amount');
  await ensurePaymentAccountingPosted(String(advance._id));
  const afterRetry = await VatRecord.find({ transactionId: String(advance._id) });
  assert(afterRetry.length === 1 && afterRetry[0].status === 'reversed', 'retry after reversal does not reopen the VAT collection');
  assert((await TaxObligation.find({ paymentId: advance._id, taxType: 'VAT_ON_COMMISSION' })).length === 2, 'retry after reversal does not add another obligation');

  const octoberReturn = await prepareVatReturn(String(registered._id), '2026-10');
  const octoberVat = money(41.85 + 41.85 + 41.85 + 33.48 + 24.16);
  assert(money(Number(octoberReturn.vatOnCommission)) === octoberVat, `October VAT return commission VAT is ${octoberVat}, got ${octoberReturn.vatOnCommission}`);
  const juneReturn = await prepareVatReturn(String(registered._id), '2025-06');
  assert(money(Number(juneReturn.vatOnCommission)) === 40.5, `June 2025 return uses the 15% snapshot, got ${juneReturn.vatOnCommission}`);

  const activeOctober = await TaxObligation.find({
    companyId: registered._id,
    taxType: 'VAT_ON_COMMISSION',
    taxPeriod: '2026-10',
    status: { $nin: ['REVERSED', 'VOID'] },
    reversalOf: null
  }).lean();
  const obligationSum = money(activeOctober.reduce((sum, row) => sum + Number(row.taxAmount || 0), 0));
  assert(obligationSum === octoberVat, `active October obligations sum to ${octoberVat}, got ${obligationSum}`);

  const otherCompanyReturn = await prepareVatReturn(String(unregistered._id), '2026-10');
  assert(money(Number(otherCompanyReturn.vatOnCommission)) === 0, 'company isolation keeps the other company at zero');

  const exceptions = await detectVatOnCommissionExceptions(String(registered._id));
  const criticalBeforeGap = exceptions.filter((row) => row.severity === 'CRITICAL');
  assert(criticalBeforeGap.length === 0, `controlled dataset has no critical VAT exceptions, got ${criticalBeforeGap.map((row) => row.issueType).join(',')}`);

  const gapSnap = toPaymentCommissionSnapshot({
    ...firstSnap.calc,
    vatAmount: 0,
    vatOnCommission: false,
    vatRate: undefined,
    ownerAmount: 1530,
    ownerPayable: 1530,
    totalDeductions: 270
  });
  gapSnap.vatOnCommission = 0;
  gapSnap.vatAmount = 0;
  const gap = await createCompletedPayment({
    ...basePayment,
    amount: 1800,
    periodMonth: 10,
    periodYear: 2026,
    snapshot: gapSnap,
    flags: { vatOnCommission: true, vatRate: 0.155, vatTreatment: 'exclusive' }
  });
  const gapPost = await ensurePaymentAccountingPosted(String(gap._id));
  const gapStored = await Payment.findById(gap._id).lean();
  assert(gapPost.accountingComplete === false, 'eligible payment with a zero VAT snapshot is not marked fully accounted');
  assert(Number((gapStored as any).commissionDetails.vatOnCommission) === 0, 'the missing snapshot is not rewritten');
  const gapFindings = await detectVatOnCommissionExceptions(String(registered._id));
  assert(gapFindings.some((row) => row.issueType === 'MISSING_VAT_ON_ELIGIBLE_COMMISSION' && row.transaction === String(gap._id)), 'integrity detects the missing VAT snapshot');

  const chargedWhileUnregistered = await createCompletedPayment({
    companyId: String(unregistered._id),
    propertyId: String(unregisteredProperty._id),
    tenantId: String(otherTenant._id),
    userId: String(user._id),
    amount: 1800,
    periodMonth: 10,
    periodYear: 2026,
    snapshot: firstSnap.snapshot,
    flags: firstSnap.flags
  });
  const unregisteredFindings = await detectVatOnCommissionExceptions(String(unregistered._id));
  assert(
    unregisteredFindings.some((row) => row.issueType === 'VAT_CHARGED_WHILE_COMPANY_NOT_REGISTERED' && row.transaction === String(chargedWhileUnregistered._id)),
    'integrity detects VAT stored for an unregistered company without rewriting it'
  );

  const evidence = {
    first: String(first._id),
    advance: String(advance._id),
    third: String(third._id),
    fourth: String(fourth._id),
    other: String(other._id),
    inclusive: String(inclusivePayment._id),
    prior: String(priorPayment._id),
    octoberVat,
    juneVat: 40.5,
    obligationSum,
    advanceObligationsAfterReversal: reversalRows.length
  };
  console.log(`EVIDENCE ${JSON.stringify(evidence)}`);

  if (failures.length) {
    console.error(failures.map((row) => `FAIL ${row}`).join('\n'));
    process.exitCode = 1;
  } else {
    console.log('VAT on commission lifecycle tests passed');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.dropDatabase().catch(() => undefined);
    await accountingConnection.dropDatabase().catch(() => undefined);
    await accountingConnection.close().catch(() => undefined);
    await mongoose.disconnect().catch(() => undefined);
  });
