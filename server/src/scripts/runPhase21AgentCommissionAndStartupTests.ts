import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { projectCommissionLanes, inferCommissionRoleFromReference } from '../services/commissionProjection';

function srcFile(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', '..', 'src', rel), 'utf8');
}

function clientSrc(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', '..', '..', 'client', 'src', rel), 'utf8');
}

function sliceFn(src: string, startToken: string, endToken: string): string {
  const start = src.indexOf(startToken);
  const end = src.indexOf(endToken, start + startToken.length);
  assert.ok(start >= 0 && end > start, `expected ${startToken} before ${endToken}`);
  return src.slice(start, end);
}

function assertNotCalled(label: string, body: string, names: string[]): void {
  for (const name of names) {
    assert.ok(!body.includes(`${name}(`), `${label} must not call ${name}(`);
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

async function run(): Promise<void> {
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
  const ledgerMaintCtrl = sliceFn(
    sysAdminCtrl,
    'export const ledgerMaintenance',
    'export const fullSync'
  );
  const integrityPass = sliceFn(
    integrity,
    'export async function runPaymentAccountingIntegrityPass',
    'export type AccountingIntegritySummary'
  );

  // --- No automatic historical agent commission sync ---
  assertNotCalled('scheduledSyncService', scheduled, historicalCommissionWriters);
  assertNotCalled('trustReconciliationJob', jobsTrust, historicalCommissionWriters);
  assertNotCalled('index.ts boot', bootFn, historicalCommissionWriters);
  assertNotCalled('worker.ts', workerSrc, historicalCommissionWriters);
  assert.ok(!scheduled.includes('syncFromPayments('));
  assert.ok(!scheduled.includes('backfillMissingForAgent('));

  // --- GET agent account does not write commissions ---
  assertNotCalled('GET getAgentAccount service', getAgentFn, [
    'syncCommissionTransactions',
    'backfillMissingForAgent',
    'syncCommissionForPayment',
    'addCommission',
    'syncFromPayments'
  ]);
  assert.ok(!getAgentFn.includes('.save('), 'GET getAgentAccount must not save');
  assertNotCalled('GET getAgentAccount controller', getAgentCtrl, [
    'syncCommissionTransactions',
    'backfillMissingForAgent',
    'syncCommissionForPayment'
  ]);

  // --- Integrity scan does not write agent commissions ---
  assertNotCalled('integrity pass', integrityPass, historicalCommissionWriters);
  assertNotCalled('integrity controller', integrityCtrl, historicalCommissionWriters);
  assert.ok(!integrity.includes('syncCommissionTransactions'));
  assert.ok(!integrity.includes('syncFromPayments'));

  // --- Repair/recon detect-only paths do not bulk-sync agents ---
  assert.ok(!recon.includes('syncFromPayments('));
  assert.ok(!recon.includes('syncCommissionTransactions('));

  // --- Payment is source of truth; no second commission engine ---
  assert.ok(syncForPaymentFn.includes('shouldPostAgentCommission'));
  assert.ok(syncForPaymentFn.includes('projectCommissionLanes'));
  assert.ok(projection.includes('details.agentShare') || projection.includes('commissionDetails'));
  assert.ok(syncCommissionFn.includes('this.syncCommissionForPayment'));
  assert.ok(!syncCommissionFn.includes('account.transactions.push'));
  assert.ok(!syncCommissionFn.includes('account.transactions ='));
  assert.ok(!syncCommissionFn.includes('applicableAmount'), 'maintenance path must not extract commission independently');

  const postFn = sliceFn(orchestrator, 'export async function postPaymentAccounting', 'export async function reversePaymentAccounting');
  assert.ok(postFn.includes('agentAccountService.syncCommissionForPayment'));

  const rental = {
    _id: 'pay-rental-1',
    paymentType: 'rental',
    agentId: 'agent-1',
    commissionDetails: { agentShare: 50, agencyShare: 40, totalCommission: 90, ownerAmount: 910 }
  };
  const rentalLanes = projectCommissionLanes(rental);
  assert.strictEqual(rentalLanes.length, 1);
  assert.strictEqual(rentalLanes[0].amount, 50, 'commission amount must come from Payment.commissionDetails.agentShare');
  assert.strictEqual(rentalLanes[0].agentId, 'agent-1');
  assert.strictEqual(rentalLanes[0].reference, 'pay-rental-1');

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
  const saleLanes = projectCommissionLanes(sale);
  assert.strictEqual(saleLanes.length, 2);
  assert.strictEqual(saleLanes[0].amount, 60);
  assert.strictEqual(saleLanes[1].amount, 40);
  assert.ok(
    saleLanes.every((l) => l.amount !== 100 || l.role !== 'agent'),
    'sale split must not also post undifferentiated agentShare'
  );

  // Orchestrator and maintenance use the same lane amounts
  assert.ok(postFn.includes('syncCommissionForPayment'));
  assert.ok(syncCommissionFn.includes('syncCommissionForPayment'));

  // --- No duplicate commission / no overwrite ---
  assert.ok(addCommissionFn.includes("Duplicate commission paymentId"));
  assert.ok(addCommissionFn.includes("Duplicate commission reference"));
  assert.ok(syncForPaymentFn.includes('isCommissionLaneAlreadyPosted'));
  assert.ok(!addCommissionFn.includes('t.amount ='), 'addCommission must not overwrite existing amounts');

  type Tx = { type: string; paymentId?: string; reference?: string; amount: number };
  const txs: Tx[] = [];
  const wouldInsert = (paymentId: string, reference: string, amount: number): boolean => {
    const role = inferCommissionRoleFromReference(reference);
    if (
      txs.some(
        (t) =>
          t.type === 'commission' &&
          String(t.paymentId || '') === paymentId &&
          inferCommissionRoleFromReference(String(t.reference || '')) === role
      )
    ) {
      return false;
    }
    if (txs.some((t) => t.type === 'commission' && t.reference === reference)) return false;
    txs.push({ type: 'commission', paymentId, reference, amount });
    return true;
  };
  assert.strictEqual(wouldInsert('pay-rental-1', 'pay-rental-1', 50), true);
  assert.strictEqual(wouldInsert('pay-rental-1', 'pay-rental-1', 50), false);
  assert.strictEqual(wouldInsert('pay-rental-1', 'pay-rental-1', 99), false, 'must not insert or overwrite when amount differs');
  assert.strictEqual(txs.length, 1);
  assert.strictEqual(txs[0].amount, 50);

  // --- Case B: explicit confirmation, reason, audit; accountant UI preserved ---
  assert.ok(syncCtrl.includes('requireExplicitMigrationConfirmation'));
  assert.ok(syncCtrl.includes('startMigrationAudit'));
  assert.ok(syncOneCtrl.includes('requireExplicitMigrationConfirmation'));
  assert.ok(syncOneCtrl.includes('startMigrationAudit'));
  assert.ok(accountantRoutes.includes("router.post('/agent-accounts/sync', isAccountant"));
  assert.ok(accountantRoutes.includes("router.post('/agent-accounts/:agentId/sync-commissions', isAccountant"));
  assert.ok(uiDetail.includes('handleSyncCommissions'));
  assert.ok(uiDetail.includes('window.confirm'));
  assert.ok(uiDetail.includes('window.prompt'));
  assert.ok(clientAgent.includes('confirm: opts.confirm'));
  assert.ok(clientAgent.includes('reason: opts.reason'));

  // --- Startup must not execute historical financial ledger mutation ---
  assert.ok(!bootFn.includes('runPropertyLedgerMaintenance('), 'production startup must not run ledger maintenance');
  assert.ok(!bootFn.includes('reconcilePropertyLedgerDuplicates('));
  assert.ok(!bootFn.includes('ledger_maintenance_v1'));
  assert.ok(!indexSrc.includes('runPropertyLedgerMaintenance('));
  assert.ok(!workerSrc.includes('runPropertyLedgerMaintenance('));
  assert.ok(bootFn.includes('historical ledger mutation is admin/CLI only'));

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
  assert.ok(!workerSrc.includes('JournalEntry.create'));
  assert.ok(!workerSrc.includes('VatRecord'));
  assert.ok(!workerSrc.includes('RentalDeposit'));

  // Flag must not silently re-enable financial mutation at boot
  assert.ok(runtimeSrc.includes('runStartupMaintenance'));
  assert.ok(!bootFn.includes('runtimeFeatures.runStartupMaintenance'));

  // Explicit admin path retained with confirmation + dry-run
  assert.ok(ledgerMaintCtrl.includes('requireSystemAdmin'));
  assert.ok(ledgerMaintCtrl.includes('requireExplicitMigrationConfirmation'));
  assert.ok(ledgerMaintCtrl.includes('runPropertyLedgerMaintenance'));
  assert.ok(ledgerMaintCtrl.includes('dryRun'));
  assert.ok(srcFile('routes/systemAdminRoutes.ts').includes("router.post('/maintenance/ledger'"));

  // LedgerEvent retry still uses orchestrator (not a second commission engine)
  assert.ok(ledgerEvent.includes('postPaymentAccounting'));

  console.log('Phase 2.1 agent commission and startup lockdown tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
