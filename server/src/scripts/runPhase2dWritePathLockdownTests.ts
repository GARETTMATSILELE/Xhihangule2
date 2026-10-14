import assert from 'assert';
import fs from 'fs';
import path from 'path';

function srcFile(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', '..', 'src', rel), 'utf8');
}

function sliceFn(src: string, startToken: string, endToken: string): string {
  const start = src.indexOf(startToken);
  const end = src.indexOf(endToken, start + startToken.length);
  assert.ok(start >= 0 && end > start, `expected ${startToken} before ${endToken}`);
  return src.slice(start, end);
}

const forbiddenWriters = [
  'recordIncomeFromPayment',
  'postPaymentAccounting',
  'repairPaymentAccounting',
  'postCompanyCommission',
  'enqueueOwnerIncomeEvent'
];

function assertNoForbiddenWriters(label: string, body: string, extra: string[] = []) {
  for (const name of [...forbiddenWriters, ...extra]) {
    assert.ok(!body.includes(`${name}(`), `${label} must not call ${name}(`);
  }
}

async function run(): Promise<void> {
  const syncSrc = srcFile('services/databaseSyncService.ts');
  const scheduledSrc = srcFile('services/scheduledSyncService.ts');
  const integritySrc = srcFile('services/paymentAccountingIntegrity.ts');
  const reconSrc = srcFile('services/paymentAccountingReconciliation.ts');
  const orchestratorSrc = srcFile('services/paymentAccountingOrchestrator.ts');
  const ledgerSrc = srcFile('services/ledgerEventService.ts');
  const trustJobSrc = srcFile('jobs/trustReconciliationJob.ts');
  const syncCtrl = srcFile('controllers/syncController.ts');
  const syncRoutes = srcFile('routes/syncRoutes.ts');
  const accountantRoutes = srcFile('routes/accountantRoutes.ts');
  const accountingRoutes = srcFile('routes/accountingRoutes.ts');
  const accountingCtrl = srcFile('controllers/accountingController.ts');
  const propertyCtrl = srcFile('controllers/propertyAccountController.ts');
  const paymentCtrl = srcFile('controllers/paymentController.ts');
  const appTsx = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'client', 'src', 'App.tsx'),
    'utf8'
  );

  // 1-2 Integrity job does not post or repair
  const integrityPass = sliceFn(
    integritySrc,
    'export async function runPaymentAccountingIntegrityPass',
    'export type AccountingIntegritySummary'
  );
  assertNoForbiddenWriters('integrity pass', integrityPass, [
    'syncCommissionForPayment',
    'ensureDepositLedgerFromPayment',
    'enqueueEvent',
    'JournalEntry.create',
    'VatRecord.updateOne',
    'RentalDeposit.findOneAndUpdate'
  ]);
  assert.ok(integrityPass.includes('reconcilePayment'));
  assert.ok(integrityPass.includes('applyReconciliationOutcome'));

  // 3-4 Daily/monthly sync must not post historical accounting
  const syncAll = sliceFn(syncSrc, 'private async syncAllPayments', 'private async syncAllUsers');
  assertNoForbiddenWriters('syncAllPayments', syncAll, [
    'syncCommissionForPayment',
    'ensureDepositLedgerFromPayment',
    'enqueueEvent',
    'JournalEntry.create',
    'VatRecord.updateOne'
  ]);
  assert.ok(syncAll.includes('reconcilePayment'));
  assert.ok(syncAll.includes('applyReconciliationOutcome'));
  assert.ok(scheduledSrc.includes("name: 'daily_sync'"));
  assert.ok(scheduledSrc.includes("name: 'monthly_deep_sync'"));
  assert.ok(scheduledSrc.includes('performFullSync'));
  assert.ok(!scheduledSrc.includes('syncFromPayments('));
  assert.ok(!scheduledSrc.includes('backfillMissingForAgent('));
  assert.ok(!scheduledSrc.includes('syncCommissionForPayment('));

  // 5 /api/sync/reconcile/payment/:id cannot silently repair
  const verifyFn = sliceFn(
    syncSrc,
    'private async verifyAndReconcilePaymentPosting',
    'public async reconcilePaymentPosting'
  );
  assertNoForbiddenWriters('verifyAndReconcilePaymentPosting', verifyFn, [
    'syncCommissionForPayment',
    'ensureDepositLedgerFromPayment',
    'enqueueEvent'
  ]);
  const reconcileCtrl = sliceFn(
    syncCtrl,
    'export const reconcilePaymentPosting',
    'export const archiveOrphanedPropertyAccounts'
  );
  assert.ok(reconcileCtrl.includes('deprecated: true'));
  assert.ok(reconcileCtrl.includes('/accounting/repair'));
  assert.ok(syncRoutes.includes("router.post('/reconcile/payment/:paymentId'"));

  // 6 Property-account sync cannot be triggered by integrity
  assert.ok(!integritySrc.includes('syncPropertyAccountsWithPayments'));
  assert.ok(!integritySrc.includes("enqueue('sync_property_accounts'"));
  assert.ok(!scheduledSrc.includes('syncPropertyAccountsWithPayments'));
  assert.ok(accountantRoutes.includes('isAdminOrSystemAdmin, syncConcurrencyGuard, syncPropertyAccounts'));

  // 7 Journal backfill cannot be triggered automatically
  assert.ok(!integritySrc.includes('backfillFromExistingData'));
  assert.ok(!scheduledSrc.includes('backfillFromExistingData'));
  assert.ok(!syncSrc.includes('backfillFromExistingData'));
  assert.ok(accountingRoutes.includes("router.post('/migrations/backfill-balances', isSystemAdmin"));
  assert.ok(accountingCtrl.includes('requireExplicitMigrationConfirmation'));
  assert.ok(accountingCtrl.includes('isSystemAdminUser'));

  // 8 Weekly consistency cannot automatically create financial projections
  const weeklyFn = sliceFn(
    scheduledSrc,
    'private async executeWeeklyConsistencyCheck',
    'private async executeMonthlyDeepSync'
  );
  assert.ok(!weeklyFn.includes('attemptConsistencyFixes'));
  assert.ok(!weeklyFn.includes('fixMissingPropertyAccounts'));
  assert.ok(!weeklyFn.includes('recordIncomeFromPayment('));
  assert.ok(weeklyFn.includes('detection-only'));

  // 9 LedgerEvent retry uses orchestrator
  const executeFn = sliceFn(ledgerSrc, 'private async execute(ev: ILedgerEvent)', 'private async repostLevyCollection');
  assert.ok(executeFn.includes("import('./paymentAccountingOrchestrator')"));
  assert.ok(executeFn.includes('postPaymentAccounting'));
  assert.ok(!syncAll.includes('enqueueOwnerIncomeEvent('));

  // 10 Repeated LedgerEvent processing uses paymentId + orchestrator (idempotent writer)
  assert.ok(ledgerSrc.includes('paymentId ? new mongoose.Types.ObjectId(paymentId)'));
  assert.ok(orchestratorSrc.includes('recordIncomeFromPayment'));

  // 11-13 Binary accountingComplete is tested in Phase 2C; lock the persist helper here
  assert.ok(reconSrc.includes('const accountingComplete = recon.accountingComplete'));
  assert.ok(reconSrc.includes('if (!payment || isHistoricalUntrackedPayment'));

  // 14 Manual repair remains explicitly authorised
  const repairFn = sliceFn(
    reconSrc,
    'export async function repairPaymentAccounting',
    'export async function ensurePaymentAccountingPosted'
  );
  assert.ok(repairFn.includes('requires a non-empty reason'));
  assert.ok(repairFn.includes('postPaymentAccounting'));
  const repairCtrl = sliceFn(
    paymentCtrl,
    'export const repairPaymentAccountingExplicit',
    'export const updatePaymentStatus'
  );
  assert.ok(repairCtrl.includes('confirm === true'));
  assert.ok(repairCtrl.includes('dryRun === false'));
  assert.ok(accountantRoutes.includes("router.post('/payments/:id/accounting/repair'"));

  // 15 GET endpoints remain side-effect free (property + payment details)
  const getPropertyFn = sliceFn(
    propertyCtrl,
    'export const getPropertyAccount',
    'export const migrateLegacyLedgerTypes'
  );
  assertNoForbiddenWriters('GET getPropertyAccount', getPropertyFn);
  const getDetails = sliceFn(
    paymentCtrl,
    'export const getPaymentDetails',
    'export const getPaymentAccountingReconciliation'
  );
  assert.ok(!getDetails.includes('postPaymentAccounting'));
  assert.ok(!getDetails.includes('repairPaymentAccounting'));

  // 16 Company isolation on repair
  assert.ok(repairCtrl.includes('companyId') && repairCtrl.includes('403'));

  // Trust job is detection-only (no payment.confirmed emit, no balance auto-repair)
  assert.ok(!trustJobSrc.includes("emitEvent('payment.confirmed'"));
  assert.ok(!trustJobSrc.includes('runningBalance: expected'));
  assert.ok(!trustJobSrc.includes('TrustTransaction.create'));
  assert.ok(trustJobSrc.includes('missingPostings'));

  // Scheduled ledger reconciliation must not silently repair/archive financial rows
  const ledgerReconFn = sliceFn(
    scheduledSrc,
    'private async executeLedgerReconciliation',
    'private async executeWeeklyConsistencyCheck'
  );
  assert.ok(!ledgerReconFn.includes('reconcilePropertyLedgerDuplicates'));
  assert.ok(!ledgerReconFn.includes('collection.updateOne'));
  assert.ok(!ledgerReconFn.includes("isArchived': true"));
  assert.ok(ledgerReconFn.includes('detection-only'));

  // Property/development backfill require confirmation
  assert.ok(propertyCtrl.includes('requireExplicitMigrationConfirmation'));
  assert.ok(accountantRoutes.includes('isAdminOrSystemAdmin, ledgerEnsureConcurrencyGuard, ensureDevelopmentLedgers'));

  // Live accountant route wiring
  assert.ok(appTsx.includes("path=\"accounting-integrity\""));
  assert.ok(appTsx.includes('AccountingIntegrityPage'));

  // Change-stream live completion still uses orchestrator; poll does not reconstruct history
  assert.ok(syncSrc.includes('postPaymentAccounting'));
  const pollFn = sliceFn(syncSrc, 'private async pollPaymentChanges', 'private async pollPropertyChanges');
  assert.ok(!pollFn.includes('postPaymentAccounting('));
  assert.ok(!pollFn.includes('recordIncomeFromPayment('));

  console.log('Phase 2D write-path lockdown tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
