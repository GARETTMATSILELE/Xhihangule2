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
const commissionProjection_1 = require("../services/commissionProjection");
function srcFile(rel) {
    return fs_1.default.readFileSync(path_1.default.join(__dirname, '..', '..', 'src', rel), 'utf8');
}
function clientSrc(rel) {
    return fs_1.default.readFileSync(path_1.default.join(__dirname, '..', '..', '..', 'client', 'src', rel), 'utf8');
}
function sliceFn(src, startToken, endToken) {
    const start = src.indexOf(startToken);
    const end = src.indexOf(endToken, start + startToken.length);
    assert_1.default.ok(start >= 0 && end > start, `expected ${startToken} before ${endToken}`);
    return src.slice(start, end);
}
function assertNotCalled(label, body, names) {
    for (const name of names) {
        assert_1.default.ok(!body.includes(`${name}(`), `${label} must not call ${name}(`);
    }
}
const historicalCommissionWriters = [
    'syncFromPayments',
    'syncCommissionTransactions',
    'backfillMissingForAgent',
    'syncCommissionForPayment'
];
const financialArtifactWriters = [
    'postPaymentAccounting',
    'recordIncomeFromPayment',
    'postCompanyCommission',
    'syncCommissionForPayment',
    'syncCommissionTransactions',
    'syncFromPayments',
    'ensureDepositLedgerFromPayment',
    'JournalEntry.create',
    'VatRecord.updateOne',
    'RentalDeposit.findOneAndUpdate',
    'runPropertyLedgerMaintenance',
    'reconcilePropertyLedgerDuplicates'
];
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        const agentSvc = srcFile('services/agentAccountService.ts');
        const agentCtrl = srcFile('controllers/agentAccountController.ts');
        const orchestrator = srcFile('services/paymentAccountingOrchestrator.ts');
        const scheduled = srcFile('services/scheduledSyncService.ts');
        const integrity = srcFile('services/paymentAccountingIntegrity.ts');
        const integrityCtrl = srcFile('controllers/paymentAccountingIntegrityController.ts');
        const indexSrc = srcFile('index.ts');
        const workerSrc = srcFile('worker.ts');
        const runtimeSrc = srcFile('config/runtimeRole.ts');
        const sysAdminCtrl = srcFile('controllers/systemAdminController.ts');
        const ledgerEvent = srcFile('services/ledgerEventService.ts');
        const projection = srcFile('services/commissionProjection.ts');
        const accountantRoutes = srcFile('routes/accountantRoutes.ts');
        const jobsTrust = srcFile('jobs/trustReconciliationJob.ts');
        const recon = srcFile('services/paymentAccountingReconciliation.ts');
        const uiDetail = clientSrc('pages/AccountantDashboard/AgentAccountDetailPage.tsx');
        const clientAgent = clientSrc('services/agentAccountService.ts');
        const getAgentFn = sliceFn(agentSvc, 'async getAgentAccount(agentId: string)', 'async getCompanyAgentAccounts');
        const syncCommissionFn = sliceFn(agentSvc, 'async syncCommissionTransactions(agentId: string)', 'async syncFromPayments');
        const syncForPaymentFn = sliceFn(agentSvc, 'async syncCommissionForPayment(paymentId: string)', 'async reverseCommissionForPayment');
        const addCommissionFn = sliceFn(agentSvc, 'async addCommission(agentId: string', 'async addPenalty');
        const syncCtrl = sliceFn(agentCtrl, 'export const syncAgentAccounts', 'export const syncAgentCommissions');
        const syncOneCtrl = sliceFn(agentCtrl, 'export const syncAgentCommissions', 'export const getAcknowledgementDocument');
        const getAgentCtrl = sliceFn(agentCtrl, 'export const getAgentAccount', 'export const getCompanyAgentAccounts');
        const bootFn = sliceFn(indexSrc, 'const initializeDatabaseBackedServices', 'const scheduleDatabaseReconnect');
        const ledgerMaintCtrl = sliceFn(sysAdminCtrl, 'export const ledgerMaintenance', 'export const fullSync');
        const integrityPass = sliceFn(integrity, 'export async function runPaymentAccountingIntegrityPass', 'export type AccountingIntegritySummary');
        // --- No automatic historical agent commission sync ---
        assertNotCalled('scheduledSyncService', scheduled, historicalCommissionWriters);
        assertNotCalled('trustReconciliationJob', jobsTrust, historicalCommissionWriters);
        assertNotCalled('index.ts boot', bootFn, historicalCommissionWriters);
        assertNotCalled('worker.ts', workerSrc, historicalCommissionWriters);
        assert_1.default.ok(!scheduled.includes('syncFromPayments('));
        assert_1.default.ok(!scheduled.includes('backfillMissingForAgent('));
        // --- GET agent account does not write commissions ---
        assertNotCalled('GET getAgentAccount service', getAgentFn, [
            'syncCommissionTransactions',
            'backfillMissingForAgent',
            'syncCommissionForPayment',
            'addCommission',
            'syncFromPayments'
        ]);
        assert_1.default.ok(!getAgentFn.includes('.save('), 'GET getAgentAccount must not save');
        assertNotCalled('GET getAgentAccount controller', getAgentCtrl, [
            'syncCommissionTransactions',
            'backfillMissingForAgent',
            'syncCommissionForPayment'
        ]);
        // --- Integrity scan does not write agent commissions ---
        assertNotCalled('integrity pass', integrityPass, historicalCommissionWriters);
        assertNotCalled('integrity controller', integrityCtrl, historicalCommissionWriters);
        assert_1.default.ok(!integrity.includes('syncCommissionTransactions'));
        assert_1.default.ok(!integrity.includes('syncFromPayments'));
        // --- Repair/recon detect-only paths do not bulk-sync agents ---
        assert_1.default.ok(!recon.includes('syncFromPayments('));
        assert_1.default.ok(!recon.includes('syncCommissionTransactions('));
        // --- Payment is source of truth; no second commission engine ---
        assert_1.default.ok(syncForPaymentFn.includes('shouldPostAgentCommission'));
        assert_1.default.ok(syncForPaymentFn.includes('projectCommissionLanes'));
        assert_1.default.ok(projection.includes('details.agentShare') || projection.includes('commissionDetails'));
        assert_1.default.ok(syncCommissionFn.includes('this.syncCommissionForPayment'));
        assert_1.default.ok(!syncCommissionFn.includes('account.transactions.push'));
        assert_1.default.ok(!syncCommissionFn.includes('account.transactions ='));
        assert_1.default.ok(!syncCommissionFn.includes('applicableAmount'), 'maintenance path must not extract commission independently');
        const postFn = sliceFn(orchestrator, 'export async function postPaymentAccounting', 'export async function reversePaymentAccounting');
        assert_1.default.ok(postFn.includes('agentAccountService.syncCommissionForPayment'));
        const rental = {
            _id: 'pay-rental-1',
            paymentType: 'rental',
            agentId: 'agent-1',
            commissionDetails: { agentShare: 50, agencyShare: 40, totalCommission: 90, ownerAmount: 910 }
        };
        const rentalLanes = (0, commissionProjection_1.projectCommissionLanes)(rental);
        assert_1.default.strictEqual(rentalLanes.length, 1);
        assert_1.default.strictEqual(rentalLanes[0].amount, 50, 'commission amount must come from Payment.commissionDetails.agentShare');
        assert_1.default.strictEqual(rentalLanes[0].agentId, 'agent-1');
        assert_1.default.strictEqual(rentalLanes[0].reference, 'pay-rental-1');
        const sale = {
            _id: 'pay-sale-1',
            paymentType: 'sale',
            agentId: 'agent-1',
            commissionDetails: {
                agentShare: 100,
                agentSplit: {
                    ownerUserId: 'agent-1',
                    collaboratorUserId: 'agent-2',
                    ownerAgentShare: 60,
                    collaboratorAgentShare: 40
                }
            }
        };
        const saleLanes = (0, commissionProjection_1.projectCommissionLanes)(sale);
        assert_1.default.strictEqual(saleLanes.length, 2);
        assert_1.default.strictEqual(saleLanes[0].amount, 60);
        assert_1.default.strictEqual(saleLanes[1].amount, 40);
        assert_1.default.ok(saleLanes.every((l) => l.amount !== 100 || l.role !== 'agent'), 'sale split must not also post undifferentiated agentShare');
        // Orchestrator and maintenance use the same lane amounts
        assert_1.default.ok(postFn.includes('syncCommissionForPayment'));
        assert_1.default.ok(syncCommissionFn.includes('syncCommissionForPayment'));
        // --- No duplicate commission / no overwrite ---
        assert_1.default.ok(addCommissionFn.includes("Duplicate commission paymentId"));
        assert_1.default.ok(addCommissionFn.includes("Duplicate commission reference"));
        assert_1.default.ok(syncForPaymentFn.includes('isCommissionLaneAlreadyPosted'));
        assert_1.default.ok(!addCommissionFn.includes('t.amount ='), 'addCommission must not overwrite existing amounts');
        const txs = [];
        const wouldInsert = (paymentId, reference, amount) => {
            const role = (0, commissionProjection_1.inferCommissionRoleFromReference)(reference);
            if (txs.some((t) => t.type === 'commission' &&
                String(t.paymentId || '') === paymentId &&
                (0, commissionProjection_1.inferCommissionRoleFromReference)(String(t.reference || '')) === role)) {
                return false;
            }
            if (txs.some((t) => t.type === 'commission' && t.reference === reference))
                return false;
            txs.push({ type: 'commission', paymentId, reference, amount });
            return true;
        };
        assert_1.default.strictEqual(wouldInsert('pay-rental-1', 'pay-rental-1', 50), true);
        assert_1.default.strictEqual(wouldInsert('pay-rental-1', 'pay-rental-1', 50), false);
        assert_1.default.strictEqual(wouldInsert('pay-rental-1', 'pay-rental-1', 99), false, 'must not insert or overwrite when amount differs');
        assert_1.default.strictEqual(txs.length, 1);
        assert_1.default.strictEqual(txs[0].amount, 50);
        // --- Case B: explicit confirmation, reason, audit; accountant UI preserved ---
        assert_1.default.ok(syncCtrl.includes('requireExplicitMigrationConfirmation'));
        assert_1.default.ok(syncCtrl.includes('startMigrationAudit'));
        assert_1.default.ok(syncOneCtrl.includes('requireExplicitMigrationConfirmation'));
        assert_1.default.ok(syncOneCtrl.includes('startMigrationAudit'));
        assert_1.default.ok(accountantRoutes.includes("router.post('/agent-accounts/sync', isAccountant"));
        assert_1.default.ok(accountantRoutes.includes("router.post('/agent-accounts/:agentId/sync-commissions', isAccountant"));
        assert_1.default.ok(uiDetail.includes('handleSyncCommissions'));
        assert_1.default.ok(uiDetail.includes('window.confirm'));
        assert_1.default.ok(uiDetail.includes('window.prompt'));
        assert_1.default.ok(clientAgent.includes('confirm: opts.confirm'));
        assert_1.default.ok(clientAgent.includes('reason: opts.reason'));
        // --- Startup must not execute historical financial ledger mutation ---
        assert_1.default.ok(!bootFn.includes('runPropertyLedgerMaintenance('), 'production startup must not run ledger maintenance');
        assert_1.default.ok(!bootFn.includes('reconcilePropertyLedgerDuplicates('));
        assert_1.default.ok(!bootFn.includes('ledger_maintenance_v1'));
        assert_1.default.ok(!indexSrc.includes('runPropertyLedgerMaintenance('));
        assert_1.default.ok(!workerSrc.includes('runPropertyLedgerMaintenance('));
        assert_1.default.ok(bootFn.includes('historical ledger mutation is admin/CLI only'));
        assertNotCalled('index.ts boot financial artifacts', bootFn, [
            'postPaymentAccounting',
            'recordIncomeFromPayment',
            'postCompanyCommission',
            'syncCommissionForPayment',
            'syncCommissionTransactions',
            'syncFromPayments',
            'ensureDepositLedgerFromPayment',
            'JournalEntry.create',
            'VatRecord.updateOne',
            'RentalDeposit.findOneAndUpdate'
        ]);
        assertNotCalled('worker.ts financial artifacts', workerSrc, financialArtifactWriters.filter((n) => n !== 'JournalEntry.create'));
        assert_1.default.ok(!workerSrc.includes('JournalEntry.create'));
        assert_1.default.ok(!workerSrc.includes('VatRecord'));
        assert_1.default.ok(!workerSrc.includes('RentalDeposit'));
        // Flag must not silently re-enable financial mutation at boot
        assert_1.default.ok(runtimeSrc.includes('runStartupMaintenance'));
        assert_1.default.ok(!bootFn.includes('runtimeFeatures.runStartupMaintenance'));
        // Explicit admin path retained with confirmation + dry-run
        assert_1.default.ok(ledgerMaintCtrl.includes('requireSystemAdmin'));
        assert_1.default.ok(ledgerMaintCtrl.includes('requireExplicitMigrationConfirmation'));
        assert_1.default.ok(ledgerMaintCtrl.includes('runPropertyLedgerMaintenance'));
        assert_1.default.ok(ledgerMaintCtrl.includes('dryRun'));
        assert_1.default.ok(srcFile('routes/systemAdminRoutes.ts').includes("router.post('/maintenance/ledger'"));
        // LedgerEvent retry still uses orchestrator (not a second commission engine)
        assert_1.default.ok(ledgerEvent.includes('postPaymentAccounting'));
        console.log('Phase 2.1 agent commission and startup lockdown tests passed');
    });
}
run().catch((error) => {
    console.error(error);
    process.exit(1);
});
