"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function srcFile(rel) {
    return fs_1.default.readFileSync(path_1.default.join(__dirname, '..', '..', 'src', rel), 'utf8');
}
function sliceFn(src, startToken, endToken) {
    const start = src.indexOf(startToken);
    const end = src.indexOf(endToken, start + startToken.length);
    assert_1.default.ok(start >= 0 && end > start, `expected ${startToken} before ${endToken}`);
    return src.slice(start, end);
}
const forbiddenWriters = [
    'recordIncomeFromPayment',
    'postPaymentAccounting',
    'repairPaymentAccounting',
    'postCompanyCommission',
    'enqueueOwnerIncomeEvent'
];
function assertNoForbiddenWriters(label, body, extra = []) {
    for (const name of [...forbiddenWriters, ...extra]) {
        assert_1.default.ok(!body.includes(`${name}(`), `${label} must not call ${name}(`);
    }
}
function run() {
    return __awaiter(this, void 0, void 0, function* () {
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
        const appTsx = fs_1.default.readFileSync(path_1.default.join(__dirname, '..', '..', '..', 'client', 'src', 'App.tsx'), 'utf8');
        // 1-2 Integrity job does not post or repair
        const integrityPass = sliceFn(integritySrc, 'export async function runPaymentAccountingIntegrityPass', 'export type AccountingIntegritySummary');
        assertNoForbiddenWriters('integrity pass', integrityPass, [
            'syncCommissionForPayment',
            'ensureDepositLedgerFromPayment',
            'enqueueEvent',
            'JournalEntry.create',
            'VatRecord.updateOne',
            'RentalDeposit.findOneAndUpdate'
        ]);
        assert_1.default.ok(integrityPass.includes('reconcilePayment'));
        assert_1.default.ok(integrityPass.includes('applyReconciliationOutcome'));
        // 3-4 Daily/monthly sync must not post historical accounting
        const syncAll = sliceFn(syncSrc, 'private async syncAllPayments', 'private async syncAllUsers');
        assertNoForbiddenWriters('syncAllPayments', syncAll, [
            'syncCommissionForPayment',
            'ensureDepositLedgerFromPayment',
            'enqueueEvent',
            'JournalEntry.create',
            'VatRecord.updateOne'
        ]);
        assert_1.default.ok(syncAll.includes('reconcilePayment'));
        assert_1.default.ok(syncAll.includes('applyReconciliationOutcome'));
        assert_1.default.ok(scheduledSrc.includes("name: 'daily_sync'"));
        assert_1.default.ok(scheduledSrc.includes("name: 'monthly_deep_sync'"));
        assert_1.default.ok(scheduledSrc.includes('performFullSync'));
        assert_1.default.ok(!scheduledSrc.includes('syncFromPayments('));
        assert_1.default.ok(!scheduledSrc.includes('backfillMissingForAgent('));
        assert_1.default.ok(!scheduledSrc.includes('syncCommissionForPayment('));
        // 5 /api/sync/reconcile/payment/:id cannot silently repair
        const verifyFn = sliceFn(syncSrc, 'private async verifyAndReconcilePaymentPosting', 'public async reconcilePaymentPosting');
        assertNoForbiddenWriters('verifyAndReconcilePaymentPosting', verifyFn, [
            'syncCommissionForPayment',
            'ensureDepositLedgerFromPayment',
            'enqueueEvent'
        ]);
        const reconcileCtrl = sliceFn(syncCtrl, 'export const reconcilePaymentPosting', 'export const archiveOrphanedPropertyAccounts');
        assert_1.default.ok(reconcileCtrl.includes('deprecated: true'));
        assert_1.default.ok(reconcileCtrl.includes('/accounting/repair'));
        assert_1.default.ok(syncRoutes.includes("router.post('/reconcile/payment/:paymentId'"));
        // 6 Property-account sync cannot be triggered by integrity
        assert_1.default.ok(!integritySrc.includes('syncPropertyAccountsWithPayments'));
        assert_1.default.ok(!integritySrc.includes("enqueue('sync_property_accounts'"));
        assert_1.default.ok(!scheduledSrc.includes('syncPropertyAccountsWithPayments'));
        assert_1.default.ok(accountantRoutes.includes('isAdminOrSystemAdmin, syncConcurrencyGuard, syncPropertyAccounts'));
        // 7 Journal backfill cannot be triggered automatically
        assert_1.default.ok(!integritySrc.includes('backfillFromExistingData'));
        assert_1.default.ok(!scheduledSrc.includes('backfillFromExistingData'));
        assert_1.default.ok(!syncSrc.includes('backfillFromExistingData'));
        assert_1.default.ok(accountingRoutes.includes("router.post('/migrations/backfill-balances', isSystemAdmin"));
        assert_1.default.ok(accountingCtrl.includes('requireExplicitMigrationConfirmation'));
        assert_1.default.ok(accountingCtrl.includes('isSystemAdminUser'));
        // 8 Weekly consistency cannot automatically create financial projections
        const weeklyFn = sliceFn(scheduledSrc, 'private async executeWeeklyConsistencyCheck', 'private async executeMonthlyDeepSync');
        assert_1.default.ok(!weeklyFn.includes('attemptConsistencyFixes'));
        assert_1.default.ok(!weeklyFn.includes('fixMissingPropertyAccounts'));
        assert_1.default.ok(!weeklyFn.includes('recordIncomeFromPayment('));
        assert_1.default.ok(weeklyFn.includes('detection-only'));
        // 9 LedgerEvent retry uses orchestrator
        const executeFn = sliceFn(ledgerSrc, 'private async execute(ev: ILedgerEvent)', 'private async repostLevyCollection');
        assert_1.default.ok(executeFn.includes("import('./paymentAccountingOrchestrator')"));
        assert_1.default.ok(executeFn.includes('postPaymentAccounting'));
        assert_1.default.ok(!syncAll.includes('enqueueOwnerIncomeEvent('));
        // 10 Repeated LedgerEvent processing uses paymentId + orchestrator (idempotent writer)
        assert_1.default.ok(ledgerSrc.includes('paymentId ? new mongoose.Types.ObjectId(paymentId)'));
        assert_1.default.ok(orchestratorSrc.includes('recordIncomeFromPayment'));
        // 11-13 Binary accountingComplete is tested in Phase 2C; lock the persist helper here
        assert_1.default.ok(reconSrc.includes('const accountingComplete = recon.accountingComplete'));
        assert_1.default.ok(reconSrc.includes('if (!payment || isHistoricalUntrackedPayment'));
        // 14 Manual repair remains explicitly authorised
        const repairFn = sliceFn(reconSrc, 'export async function repairPaymentAccounting', 'export async function ensurePaymentAccountingPosted');
        assert_1.default.ok(repairFn.includes('requires a non-empty reason'));
        assert_1.default.ok(repairFn.includes('postPaymentAccounting'));
        const repairCtrl = sliceFn(paymentCtrl, 'export const repairPaymentAccountingExplicit', 'export const updatePaymentStatus');
        assert_1.default.ok(repairCtrl.includes('confirm === true'));
        assert_1.default.ok(repairCtrl.includes('dryRun === false'));
        assert_1.default.ok(accountantRoutes.includes("router.post('/payments/:id/accounting/repair'"));
        // 15 GET endpoints remain side-effect free (property + payment details)
        const getPropertyFn = sliceFn(propertyCtrl, 'export const getPropertyAccount', 'export const migrateLegacyLedgerTypes');
        assertNoForbiddenWriters('GET getPropertyAccount', getPropertyFn);
        const getDetails = sliceFn(paymentCtrl, 'export const getPaymentDetails', 'export const getPaymentAccountingReconciliation');
        assert_1.default.ok(!getDetails.includes('postPaymentAccounting'));
        assert_1.default.ok(!getDetails.includes('repairPaymentAccounting'));
        // 16 Company isolation on repair
        assert_1.default.ok(repairCtrl.includes('companyId') && repairCtrl.includes('403'));
        // Trust job is detection-only (no payment.confirmed emit, no balance auto-repair)
        assert_1.default.ok(!trustJobSrc.includes("emitEvent('payment.confirmed'"));
        assert_1.default.ok(!trustJobSrc.includes('runningBalance: expected'));
        assert_1.default.ok(!trustJobSrc.includes('TrustTransaction.create'));
        assert_1.default.ok(trustJobSrc.includes('missingPostings'));
        // Scheduled ledger reconciliation must not silently repair/archive financial rows
        const ledgerReconFn = sliceFn(scheduledSrc, 'private async executeLedgerReconciliation', 'private async executeWeeklyConsistencyCheck');
        assert_1.default.ok(!ledgerReconFn.includes('reconcilePropertyLedgerDuplicates'));
        assert_1.default.ok(!ledgerReconFn.includes('collection.updateOne'));
        assert_1.default.ok(!ledgerReconFn.includes("isArchived': true"));
        assert_1.default.ok(ledgerReconFn.includes('detection-only'));
        // Property/development backfill require confirmation
        assert_1.default.ok(propertyCtrl.includes('requireExplicitMigrationConfirmation'));
        assert_1.default.ok(accountantRoutes.includes('isAdminOrSystemAdmin, ledgerEnsureConcurrencyGuard, ensureDevelopmentLedgers'));
        // Live accountant route wiring
        assert_1.default.ok(appTsx.includes("path=\"accounting-integrity\""));
        assert_1.default.ok(appTsx.includes('AccountingIntegrityPage'));
        // Change-stream live completion still uses orchestrator; poll does not reconstruct history
        assert_1.default.ok(syncSrc.includes('postPaymentAccounting'));
        const pollFn = sliceFn(syncSrc, 'private async pollPaymentChanges', 'private async pollPropertyChanges');
        assert_1.default.ok(!pollFn.includes('postPaymentAccounting('));
        assert_1.default.ok(!pollFn.includes('recordIncomeFromPayment('));
        console.log('Phase 2D write-path lockdown tests passed');
    });
}
run().catch((error) => {
    console.error(error);
    process.exit(1);
});
