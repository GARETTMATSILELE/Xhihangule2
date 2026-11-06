import assert from 'assert';
import mongoose from 'mongoose';
import { AccountingPeriod } from '../models/AccountingPeriod';
import { AccountingEventLog } from '../models/AccountingEventLog';
import { isAccountant } from '../middleware/roles';
import { resolveAccountingDates } from '../services/accountingDatePolicy';
import {
  activateAccountingPeriod,
  assertPeriodActivationConfirmed,
  assertPeriodAllowsPosting,
  closeAccountingPeriod,
  ensureCurrentOpenPeriod,
  previewAccountingPeriod
} from '../services/accountingPeriodService';
import { classifyRecoveryApproval } from '../services/journalRecoveryAssessment';

const DB = process.env.PERIOD_CONCURRENCY_DB || 'mongodb://127.0.0.1:27017/mantis_period_concurrency_test';

function rejects(fn: () => Promise<unknown>, code: string) {
  return fn().then(
    () => assert.fail(`expected ${code}`),
    (error: any) => assert.strictEqual(error?.code, code)
  );
}

const historical = new Date('2025-09-04T00:00:00.000Z');
const postedAt = new Date('2026-11-05T12:00:00.000Z');
const bankDate = new Date('2026-11-06T08:00:00.000Z');
const preserved = resolveAccountingDates({
  originalTransactionDate: historical,
  bankPaymentDate: bankDate,
  postedAt
});
assert.strictEqual(preserved.originalTransactionDate?.toISOString(), historical.toISOString());
assert.strictEqual(preserved.accountingDate.toISOString(), historical.toISOString());
assert.strictEqual(preserved.bankPaymentDate?.toISOString(), bankDate.toISOString());
assert.strictEqual(preserved.postedAt.toISOString(), postedAt.toISOString());

const currentSettlement = resolveAccountingDates({
  accountingDate: postedAt,
  settlementDate: postedAt,
  bankPaymentDate: bankDate,
  postedAt
});
assert.strictEqual(currentSettlement.accountingDate.toISOString(), postedAt.toISOString());
assert.notStrictEqual(currentSettlement.accountingDate.toISOString(), bankDate.toISOString());

const november = previewAccountingPeriod(2026, 11);
assert.strictEqual(november.periodStart.toISOString().slice(0, 10), '2026-11-01');
assert.strictEqual(november.periodEnd.toISOString().slice(0, 10), '2026-11-30');
assert.throws(() => assertPeriodActivationConfirmed(false), (error: any) => error.code === 'PERIOD_CONFIRMATION_REQUIRED');

let denied = false;
try {
  isAccountant({ user: { role: 'agent', roles: ['agent'] } } as any, {} as any, () => undefined);
} catch (error: any) {
  denied = error?.statusCode === 403;
}
assert.strictEqual(denied, true);
let allowed = false;
isAccountant({ user: { role: 'accountant', roles: ['accountant'] } } as any, {} as any, () => {
  allowed = true;
});
assert.strictEqual(allowed, true);

const notReady = classifyRecoveryApproval({
  periodStatus: 'UNMANAGED',
  referenceCollision: false,
  historicalVariance: false,
  ownerMismatch: false,
  depositExpected: true,
  depositMissing: true,
  journalBalanced: true,
  reversed: false,
  journalMissing: true,
  companyMatches: true,
  projectionsValid: true
});
assert.strictEqual(notReady.readyForApproval, false);
assert.strictEqual(notReady.exceptionClass, 'DEPOSIT RECONCILIATION');

async function main() {
  if (DB.includes('property-manag') || DB.includes('cosmos') || DB.includes('mongocluster')) {
    console.error('Refusing to run period concurrency tests against an application database');
    process.exit(1);
  }
  try {
    await mongoose.connect(DB, { serverSelectionTimeoutMS: 4000, autoIndex: false } as any);
  } catch (error: any) {
    console.log(`INTEGRATION SKIPPED: local MongoDB unavailable (${error?.message || error}). Not a Cosmos DB result.`);
    process.exit(0);
  }
  await mongoose.connection.dropDatabase();
  const companyA = new mongoose.Types.ObjectId().toString();
  const companyB = new mongoose.Types.ObjectId().toString();
  const accountant = new mongoose.Types.ObjectId().toString();

  await rejects(
    () => activateAccountingPeriod({ companyId: companyA, financialYear: 2026, month: 11, createdBy: accountant, confirmed: false }),
    'PERIOD_CONFIRMATION_REQUIRED'
  );
  assert.strictEqual(await AccountingPeriod.countDocuments({ companyId: companyA }), 0);
  assert.strictEqual(await ensureCurrentOpenPeriod(companyA), null);

  const [first, second] = await Promise.all([
    activateAccountingPeriod({ companyId: companyA, financialYear: 2026, month: 11, createdBy: accountant, confirmed: true }),
    activateAccountingPeriod({ companyId: companyA, financialYear: 2026, month: 11, createdBy: accountant, confirmed: true })
  ]);
  const rows = await AccountingPeriod.find({ companyId: companyA, financialYear: 2026, month: 11 });
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(String(first.period._id), String(second.period._id));
  assert.strictEqual(Number(first.created) + Number(second.created), 1);
  assert.strictEqual(first.alreadyExisted || second.alreadyExisted, true);

  const otherCompany = await activateAccountingPeriod({
    companyId: companyB,
    financialYear: 2026,
    month: 11,
    createdBy: accountant,
    confirmed: true
  });
  assert.notStrictEqual(String(otherCompany.period.companyId), String(first.period.companyId));

  await closeAccountingPeriod({
    companyId: companyA,
    periodId: String(first.period._id),
    actorId: accountant,
    reason: 'Month closed for the concurrency test',
    status: 'CLOSED'
  });
  await rejects(
    () => assertPeriodAllowsPosting({ companyId: companyA, transactionDate: new Date('2026-11-15T00:00:00.000Z'), sourceModule: 'owner_payout' }),
    'PERIOD_CLOSED'
  );
  await rejects(
    () => assertPeriodAllowsPosting({ companyId: companyA, transactionDate: historical, sourceModule: 'owner_payout' }),
    'PERIOD_NOT_ESTABLISHED'
  );
  const historicalPeriod = await activateAccountingPeriod({
    companyId: companyA,
    financialYear: 2025,
    month: 9,
    createdBy: accountant,
    confirmed: true
  });
  assert.strictEqual(historicalPeriod.period.status, 'OPEN');
  await assertPeriodAllowsPosting({
    companyId: companyA,
    transactionDate: historical,
    sourceModule: 'owner_payout'
  });
  await closeAccountingPeriod({
    companyId: companyA,
    periodId: String(historicalPeriod.period._id),
    actorId: accountant,
    reason: 'Historical month stays closed',
    status: 'CLOSED'
  });
  await rejects(
    () => assertPeriodAllowsPosting({ companyId: companyA, transactionDate: historical, sourceModule: 'trust' }),
    'PERIOD_CLOSED'
  );

  const companyC = new mongoose.Types.ObjectId().toString();
  const currentDate = new Date();
  assert.strictEqual(await ensureCurrentOpenPeriod(companyC), null);
  assert.strictEqual(await AccountingPeriod.countDocuments({ companyId: companyC }), 0);
  const [autoA, autoB] = await Promise.all([
    assertPeriodAllowsPosting({ companyId: companyC, transactionDate: currentDate, sourceModule: 'payment', sourceId: 'auto-a' }),
    assertPeriodAllowsPosting({ companyId: companyC, transactionDate: currentDate, sourceModule: 'payment', sourceId: 'auto-b' })
  ]);
  assert.strictEqual(autoA.periodStatus, 'OPEN');
  assert.strictEqual(autoB.periodStatus, 'OPEN');
  const automaticRows = await AccountingPeriod.find({ companyId: companyC });
  assert.strictEqual(automaticRows.length, 1);
  assert.strictEqual(automaticRows[0].status, 'OPEN');
  assert.strictEqual(automaticRows[0].financialYear, currentDate.getUTCFullYear());
  assert.strictEqual(automaticRows[0].month, currentDate.getUTCMonth() + 1);
  const createdEvents = await AccountingEventLog.find({ companyId: companyC, eventType: 'period_created' });
  assert.strictEqual(createdEvents.length, 1);
  assert.strictEqual((createdEvents[0].metadata as any)?.automatic, true);
  await rejects(
    () => assertPeriodAllowsPosting({ companyId: companyC, transactionDate: historical, sourceModule: 'payment' }),
    'PERIOD_NOT_ESTABLISHED'
  );
  assert.strictEqual(await AccountingPeriod.countDocuments({ companyId: companyC, financialYear: 2025 }), 0);
  await closeAccountingPeriod({
    companyId: companyC,
    periodId: String(automaticRows[0]._id),
    actorId: accountant,
    reason: 'Soft close must still require a reason',
    status: 'SOFT_CLOSED'
  });
  await rejects(
    () => assertPeriodAllowsPosting({ companyId: companyC, transactionDate: currentDate, sourceModule: 'payment' }),
    'PERIOD_SOFT_CLOSED'
  );
  await assertPeriodAllowsPosting({
    companyId: companyC,
    transactionDate: currentDate,
    sourceModule: 'payment',
    overrideReason: 'Authorised current-month adjustment'
  });
  await closeAccountingPeriod({
    companyId: companyC,
    periodId: String(automaticRows[0]._id),
    actorId: accountant,
    reason: 'Closed current month must stay closed',
    status: 'CLOSED'
  });
  await rejects(
    () => assertPeriodAllowsPosting({ companyId: companyC, transactionDate: currentDate, sourceModule: 'payment' }),
    'PERIOD_CLOSED'
  );
  const closedCurrent = await AccountingPeriod.findById(automaticRows[0]._id);
  assert.strictEqual(closedCurrent?.status, 'CLOSED');

  const companyD = new mongoose.Types.ObjectId().toString();
  const previousMonth = new Date(Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth() - 1, 15));
  const previous = await activateAccountingPeriod({
    companyId: companyD,
    financialYear: previousMonth.getUTCFullYear(),
    month: previousMonth.getUTCMonth() + 1,
    createdBy: accountant,
    confirmed: true
  });
  await assertPeriodAllowsPosting({
    companyId: companyD,
    transactionDate: currentDate,
    sourceModule: 'payment',
    sourceId: 'rollover'
  });
  const rolled = await AccountingPeriod.find({ companyId: companyD }).sort({ periodStart: 1 });
  assert.strictEqual(rolled.length, 2);
  const stillOpenPrevious = rolled.find((row) => String(row._id) === String(previous.period._id));
  const establishedCurrent = rolled.find((row) => row.financialYear === currentDate.getUTCFullYear() && row.month === currentDate.getUTCMonth() + 1);
  assert.strictEqual(stillOpenPrevious?.status, 'OPEN');
  assert.strictEqual(establishedCurrent?.status, 'OPEN');
  assert.notStrictEqual(String(stillOpenPrevious?._id), String(establishedCurrent?._id));
  await assertPeriodAllowsPosting({
    companyId: companyD,
    transactionDate: previousMonth,
    sourceModule: 'payment'
  });
  assert.strictEqual(await AccountingPeriod.countDocuments({ companyId: companyB }), 1);
  assert.strictEqual(await AccountingPeriod.countDocuments({ companyId: companyD, financialYear: 2020 }), 0);

  await mongoose.disconnect();
  console.log('accounting period concurrency tests passed');
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
