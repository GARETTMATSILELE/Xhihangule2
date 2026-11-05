"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const accountingPeriodService_1 = require("../services/accountingPeriodService");
const journalRecoveryAssessment_1 = require("../services/journalRecoveryAssessment");
const periodService = fs_1.default.readFileSync(path_1.default.join(__dirname, '../services/accountingPeriodService.ts'), 'utf8');
const repair = fs_1.default.readFileSync(path_1.default.join(__dirname, '../services/paymentAccountingReconciliation.ts'), 'utf8');
const trust = fs_1.default.readFileSync(path_1.default.join(__dirname, '../services/trustAccountService.ts'), 'utf8');
const owner = fs_1.default.readFileSync(path_1.default.join(__dirname, '../services/propertyAccountService.ts'), 'utf8');
const controls = fs_1.default.readFileSync(path_1.default.join(__dirname, '../services/financialControlsService.ts'), 'utf8');
assert_1.default.strictEqual((0, accountingPeriodService_1.rangesOverlap)(new Date('2026-01-01'), new Date('2026-02-01'), new Date('2026-01-15'), new Date('2026-03-01')), true);
assert_1.default.strictEqual((0, accountingPeriodService_1.rangesOverlap)(new Date('2026-01-01'), new Date('2026-02-01'), new Date('2026-02-01'), new Date('2026-03-01')), false);
const january = (0, accountingPeriodService_1.utcMonthBounds)(new Date('2026-01-15T00:00:00.000Z'));
assert_1.default.deepStrictEqual((0, accountingPeriodService_1.calendarPeriodIdentity)(january.periodStart, january.periodEnd), { financialYear: 2026, period: 1 });
assert_1.default.strictEqual((0, accountingPeriodService_1.decidePeriodPosting)(null).code, 'PERIOD_NOT_ESTABLISHED');
assert_1.default.strictEqual((0, accountingPeriodService_1.decidePeriodPosting)(null).allowed, false);
assert_1.default.strictEqual((0, accountingPeriodService_1.decidePeriodPosting)('OPEN').allowed, true);
assert_1.default.strictEqual((0, accountingPeriodService_1.decidePeriodPosting)('CLOSED').allowed, false);
assert_1.default.strictEqual((0, accountingPeriodService_1.decidePeriodPosting)('SOFT_CLOSED').allowed, false);
assert_1.default.strictEqual((0, accountingPeriodService_1.decidePeriodPosting)('SOFT_CLOSED', 'accountant adjustment').code, 'SOFT_CLOSED_OVERRIDE');
const base = {
    missingJournal: true,
    journalPresent: false,
    referenceCollision: false,
    otherCompanyReference: false,
    reversed: false,
    companyMatches: true,
    journalBalanced: true,
    otherMismatches: []
};
assert_1.default.strictEqual((0, journalRecoveryAssessment_1.assessControlledRecovery)(Object.assign(Object.assign({}, base), { periodStatus: 'OPEN' })).eligible, true);
assert_1.default.strictEqual((0, journalRecoveryAssessment_1.assessControlledRecovery)(Object.assign(Object.assign({}, base), { periodStatus: 'UNMANAGED' })).eligible, false);
assert_1.default.ok((0, journalRecoveryAssessment_1.assessControlledRecovery)(Object.assign(Object.assign({}, base), { periodStatus: 'UNMANAGED' })).blockers.includes('period_not_established'));
const readyInput = {
    periodStatus: 'OPEN',
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
const ready = (0, journalRecoveryAssessment_1.classifyRecoveryApproval)(readyInput);
assert_1.default.strictEqual(ready.readyForApproval, true);
assert_1.default.strictEqual(ready.exceptionClass, 'READY FOR RECOVERY');
const missingPeriod = (0, journalRecoveryAssessment_1.classifyRecoveryApproval)(Object.assign(Object.assign({}, readyInput), { periodStatus: 'UNMANAGED' }));
assert_1.default.strictEqual(missingPeriod.readyForApproval, false);
assert_1.default.strictEqual(missingPeriod.exceptionClass, 'PERIOD VERIFICATION');
const variance = (0, journalRecoveryAssessment_1.classifyRecoveryApproval)({
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
assert_1.default.strictEqual(variance.exceptionClass, 'HISTORICAL VARIANCE');
assert_1.default.strictEqual(variance.readyForApproval, false);
assert_1.default.ok(periodService.includes('PERIOD_NOT_ESTABLISHED'));
assert_1.default.ok(!periodService.slice(periodService.indexOf('export async function ensureCurrentOpenPeriod'), periodService.indexOf('export async function ensurePeriodIdentityIndex')).includes('AccountingPeriod.create'));
assert_1.default.ok(repair.includes("assessment.checks.periodStatus !== 'OPEN'"));
assert_1.default.ok(trust.includes('assertPeriodAllowsPosting'));
assert_1.default.ok(owner.includes('assertPeriodAllowsPosting'));
assert_1.default.ok(fs_1.default.readFileSync(path_1.default.join(__dirname, '../services/accountingIntegrationService.ts'), 'utf8').includes('assertPeriodAllowsPosting'));
assert_1.default.ok(fs_1.default.readFileSync(path_1.default.join(__dirname, '../services/agentAccountService.ts'), 'utf8').includes('assertPeriodAllowsPosting'));
assert_1.default.ok(fs_1.default.readFileSync(path_1.default.join(__dirname, '../services/companyAccountExpenseService.ts'), 'utf8').includes('assertPeriodAllowsPosting'));
assert_1.default.ok(!controls.includes('ensureCurrentOpenPeriod'));
console.log('accounting period governance tests passed');
