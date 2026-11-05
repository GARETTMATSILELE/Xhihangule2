import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  calendarPeriodIdentity,
  decidePeriodPosting,
  rangesOverlap,
  utcMonthBounds
} from '../services/accountingPeriodService';
import { assessControlledRecovery, classifyRecoveryApproval } from '../services/journalRecoveryAssessment';

const periodService = fs.readFileSync(path.join(__dirname, '../services/accountingPeriodService.ts'), 'utf8');
const repair = fs.readFileSync(path.join(__dirname, '../services/paymentAccountingReconciliation.ts'), 'utf8');
const trust = fs.readFileSync(path.join(__dirname, '../services/trustAccountService.ts'), 'utf8');
const owner = fs.readFileSync(path.join(__dirname, '../services/propertyAccountService.ts'), 'utf8');
const controls = fs.readFileSync(path.join(__dirname, '../services/financialControlsService.ts'), 'utf8');

assert.strictEqual(rangesOverlap(
  new Date('2026-01-01'),
  new Date('2026-02-01'),
  new Date('2026-01-15'),
  new Date('2026-03-01')
), true);
assert.strictEqual(rangesOverlap(
  new Date('2026-01-01'),
  new Date('2026-02-01'),
  new Date('2026-02-01'),
  new Date('2026-03-01')
), false);

const january = utcMonthBounds(new Date('2026-01-15T00:00:00.000Z'));
assert.deepStrictEqual(calendarPeriodIdentity(january.periodStart, january.periodEnd), { financialYear: 2026, period: 1 });

assert.strictEqual(decidePeriodPosting(null).code, 'PERIOD_NOT_ESTABLISHED');
assert.strictEqual(decidePeriodPosting(null).allowed, false);
assert.strictEqual(decidePeriodPosting('OPEN').allowed, true);
assert.strictEqual(decidePeriodPosting('CLOSED').allowed, false);
assert.strictEqual(decidePeriodPosting('SOFT_CLOSED').allowed, false);
assert.strictEqual(decidePeriodPosting('SOFT_CLOSED', 'accountant adjustment').code, 'SOFT_CLOSED_OVERRIDE');

const base = {
  missingJournal: true,
  journalPresent: false,
  referenceCollision: false,
  otherCompanyReference: false,
  reversed: false,
  companyMatches: true,
  journalBalanced: true,
  otherMismatches: [] as string[]
};
assert.strictEqual(assessControlledRecovery({ ...base, periodStatus: 'OPEN' }).eligible, true);
assert.strictEqual(assessControlledRecovery({ ...base, periodStatus: 'UNMANAGED' }).eligible, false);
assert.ok(assessControlledRecovery({ ...base, periodStatus: 'UNMANAGED' }).blockers.includes('period_not_established'));

const readyInput = {
  periodStatus: 'OPEN' as const,
  referenceCollision: false,
  historicalVariance: false,
  ownerMismatch: false,
  depositExpected: false,
  depositMissing: false,
  journalBalanced: true,
  reversed: false,
  journalMissing: true,
  companyMatches: true,
  projectionsValid: true
};
const ready = classifyRecoveryApproval(readyInput);
assert.strictEqual(ready.readyForApproval, true);
assert.strictEqual(ready.exceptionClass, 'READY FOR RECOVERY');

const missingPeriod = classifyRecoveryApproval({ ...readyInput, periodStatus: 'UNMANAGED' });
assert.strictEqual(missingPeriod.readyForApproval, false);
assert.strictEqual(missingPeriod.exceptionClass, 'PERIOD VERIFICATION');

const variance = classifyRecoveryApproval({
  periodStatus: 'OPEN',
  referenceCollision: false,
  historicalVariance: true,
  ownerMismatch: false,
  depositExpected: false,
  depositMissing: false,
  journalBalanced: true,
  reversed: false,
  journalMissing: true,
  companyMatches: true,
  projectionsValid: true
});
assert.strictEqual(variance.exceptionClass, 'HISTORICAL VARIANCE');
assert.strictEqual(variance.readyForApproval, false);

assert.ok(periodService.includes('PERIOD_NOT_ESTABLISHED'));
assert.ok(!periodService.slice(periodService.indexOf('export async function ensureCurrentOpenPeriod'), periodService.indexOf('export async function ensurePeriodIdentityIndex')).includes('AccountingPeriod.create'));
assert.ok(repair.includes("assessment.checks.periodStatus !== 'OPEN'"));
assert.ok(trust.includes('assertPeriodAllowsPosting'));
assert.ok(owner.includes('assertPeriodAllowsPosting'));
assert.ok(fs.readFileSync(path.join(__dirname, '../services/accountingIntegrationService.ts'), 'utf8').includes('assertPeriodAllowsPosting'));
assert.ok(fs.readFileSync(path.join(__dirname, '../services/agentAccountService.ts'), 'utf8').includes('assertPeriodAllowsPosting'));
assert.ok(fs.readFileSync(path.join(__dirname, '../services/companyAccountExpenseService.ts'), 'utf8').includes('assertPeriodAllowsPosting'));
assert.ok(!controls.includes('ensureCurrentOpenPeriod'));

console.log('accounting period governance tests passed');
