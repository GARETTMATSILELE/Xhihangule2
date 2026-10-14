import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { calculatePropertyCommission } from '../services/propertyCommissionCalculator';
import { computeCommissionFallback, roundMoney } from '../utils/money';
import {
  assertCompletedPaymentFinanciallyImmutable,
  COMPLETED_PAYMENT_IMMUTABLE_MESSAGE
} from '../services/paymentFinancialImmutability';

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

const financialWriters = [
  'recordIncomeFromPayment',
  'syncCommissionForPayment',
  'postCompanyCommission',
  'ensureDepositLedgerFromPayment',
  'postPaymentAccounting',
  'ensurePaymentAccountingPosted',
  'repairPaymentAccounting'
];

async function run(): Promise<void> {
  const paymentCtrl = srcFile('controllers/paymentController.ts');
  const agentCtrl = srcFile('controllers/agentController.ts');
  const webhookCtrl = srcFile('controllers/paymentWebhookController.ts');
  const commissionSvc = srcFile('services/commissionService.ts');
  const orchestrator = srcFile('services/paymentAccountingOrchestrator.ts');
  const recon = srcFile('services/paymentAccountingReconciliation.ts');
  const agentSvc = srcFile('services/agentAccountService.ts');
  const agentAcctCtrl = srcFile('controllers/agentAccountController.ts');
  const propertyCtrl = srcFile('controllers/propertyAccountController.ts');
  const accountingCtrl = srcFile('controllers/accountingController.ts');
  const indexSrc = srcFile('index.ts');
  const paymentRoutes = srcFile('routes/paymentRoutes.ts');
  const accountantRoutes = srcFile('routes/accountantRoutes.ts');
  const paypalRoutes = srcFile('routes/paypalRoutes.ts');
  const authDb = srcFile('config/authDatabase.ts');
  const paymentModel = srcFile('models/Payment.ts');
  const immutability = srcFile('services/paymentFinancialImmutability.ts');

  // 1. Canonical rental calculator remains calculatePropertyCommission
  assert.ok(commissionSvc.includes('calculatePropertyCommission'));
  assert.ok(commissionSvc.includes('vatOnCommission: false'), 'CommissionService.calculate forces VAT off');
  assert.ok(commissionSvc.includes('return calculatePropertyCommission'));

  const leaseCreate = sliceFn(paymentCtrl, 'export const createPayment = async', 'export const createPaymentAccountant');
  assert.ok(leaseCreate.includes('CommissionService.calculateForProperty'));
  assert.ok(leaseCreate.includes('ensurePaymentAccountingPosted'));

  const accountantCreate = sliceFn(paymentCtrl, 'export const createPaymentAccountant = async', 'export const createSalesPaymentAccountant');
  assert.ok(accountantCreate.includes('CommissionService.calculateForProperty'));
  assert.ok(accountantCreate.includes('ensurePaymentAccountingPosted'));

  const publicCreate = sliceFn(paymentCtrl, 'export const createPaymentPublic = async', 'export const getPaymentReceiptDownload');
  assert.ok(publicCreate.includes('CommissionService.calculateForProperty'));
  assert.ok(publicCreate.includes('ensurePaymentAccountingPosted'));

  const finalizeFn = sliceFn(paymentCtrl, 'export const finalizeProvisionalPayment = async', 'export const getCombinedRemaining');
  assert.ok(finalizeFn.includes('CommissionService.calculateForProperty'));
  assert.ok(finalizeFn.includes('ensurePaymentAccountingPosted'));

  const salesCreate = sliceFn(paymentCtrl, 'export const createSalesPaymentAccountant = async', 'export const updatePayment = async');
  assert.ok(salesCreate.includes('CommissionService.calculate('));
  assert.ok(salesCreate.includes('ensurePaymentAccountingPosted'));
  assert.ok(salesCreate.includes('computeCommissionFallback'), 'sale path retains fallback; rounding is aligned to roundMoney');

  const agentCreate = sliceFn(agentCtrl, 'export const createAgentPayment = async', 'export const updateAgentPayment = async');
  assert.ok(agentCreate.includes('CommissionService'));
  assert.ok(agentCreate.includes('calculateForProperty'), 'agent rental create uses canonical calculator');
  assert.ok(agentCreate.includes('CommissionService.calculate('), 'agent sale create retains VAT-off wrapper');
  assert.ok(agentCreate.includes('ensurePaymentAccountingPosted'));

  const statusUpdate = sliceFn(paymentCtrl, 'export const updatePaymentStatus = async', 'export const reversePayment = async');
  assert.ok(statusUpdate.includes('ensurePaymentAccountingPosted'));
  assert.ok(statusUpdate.includes('COMPLETED_PAYMENT_IMMUTABLE_MESSAGE'));

  const webhookComplete = sliceFn(
    webhookCtrl,
    'if (normalizedStatus === \'completed\')',
    'await WebhookEventReceipt.updateOne'
  );
  assert.ok(webhookComplete.includes('ensurePaymentAccountingPosted'));

  const legacyPaymentServicePath = path.join(__dirname, '..', '..', 'src', 'services', 'paymentService.ts');
  assert.ok(!fs.existsSync(legacyPaymentServicePath), 'unmounted server paymentService.ts must remain deleted');

  // 2. Fallback now uses canonical roundMoney at the same commission-split stages
  const amount = 333.33;
  const pct = 15;
  const canonical = calculatePropertyCommission({
    grossRent: amount,
    levy: 0,
    commissionPercentage: pct,
    vatOnCommission: false
  });
  const fallback = computeCommissionFallback(amount, pct);
  assert.strictEqual(canonical.totalCommission, fallback.totalCommission, 'fallback must round like canonical');
  assert.strictEqual(canonical.preaFee, fallback.preaFee);
  assert.strictEqual(canonical.agentShare, fallback.agentShare);
  assert.strictEqual(canonical.agencyShare, fallback.agencyShare);
  assert.strictEqual(canonical.ownerAmount, fallback.ownerAmount);
  assert.strictEqual(canonical.totalCommission, roundMoney((amount * pct) / 100));

  const vatOn = calculatePropertyCommission({
    grossRent: 1000,
    levy: 0,
    commissionPercentage: 10,
    vatOnCommission: true,
    vatTreatment: 'exclusive',
    vatRate: 0.155
  });
  const vatOff = calculatePropertyCommission({
    grossRent: 1000,
    levy: 0,
    commissionPercentage: 10,
    vatOnCommission: false
  });
  assert.ok(vatOn.vatAmount > 0);
  assert.strictEqual(vatOff.vatAmount, 0);
  assert.notStrictEqual(vatOn.ownerAmount, vatOff.ownerAmount);

  // 3. One live accounting path: completion → ensure → post
  const ensureFn = sliceFn(recon, 'export async function ensurePaymentAccountingPosted', 'export async function refreshPaymentAccountingStatus');
  assert.ok(ensureFn.includes('postPaymentAccounting'));
  const postFn = sliceFn(orchestrator, 'export async function postPaymentAccounting', 'export async function reversePaymentAccounting');
  assert.ok(postFn.includes('recordIncomeFromPayment'));
  assert.ok(postFn.includes('syncCommissionForPayment'));
  assert.ok(postFn.includes('postCompanyCommission'));
  assert.ok(postFn.includes('syncPaymentReceived'));

  // 4. GET handlers must not mutate financial ledgers
  const getPaymentDetails = sliceFn(paymentCtrl, 'export const getPaymentDetails = async', 'export const getPaymentAccountingReconciliation');
  assertNotCalled('GET getPaymentDetails', getPaymentDetails, financialWriters);

  const getAccounting = sliceFn(paymentCtrl, 'export const getPaymentAccountingReconciliation = async', 'export const repairPaymentAccountingExplicit');
  assertNotCalled('GET payment accounting', getAccounting, [
    'recordIncomeFromPayment',
    'syncCommissionForPayment',
    'postCompanyCommission',
    'ensureDepositLedgerFromPayment',
    'postPaymentAccounting',
    'ensurePaymentAccountingPosted',
    'repairPaymentAccounting'
  ]);
  assert.ok(getAccounting.includes('reconcilePayment'), 'GET accounting remains detection-only');

  const getCompanyPayments = sliceFn(paymentCtrl, 'export const getCompanyPayments = async', 'export const getPaymentDetails = async');
  assertNotCalled('GET getCompanyPayments', getCompanyPayments, financialWriters);

  const getAgentPayments = sliceFn(agentCtrl, 'export const getAgentPayments = async', 'export const getAgentLevyPayments');
  assertNotCalled('GET getAgentPayments', getAgentPayments, financialWriters);

  const getProperty = sliceFn(propertyCtrl, 'export const getPropertyAccount = async', 'export const migrateLegacyLedgerTypes');
  assertNotCalled('GET getPropertyAccount', getProperty, financialWriters);

  const getAgentAccount = sliceFn(agentAcctCtrl, 'export const getAgentAccount = async', 'export const getCompanyAgentAccounts');
  assertNotCalled('GET getAgentAccount', getAgentAccount, financialWriters);

  const getIntegrity = srcFile('controllers/paymentAccountingIntegrityController.ts');
  assertNotCalled('GET accounting integrity', getIntegrity, financialWriters);

  const getDashboard = sliceFn(accountingCtrl, 'export const getDashboardSummary = async', 'export const getDashboardOutstanding');
  assertNotCalled('GET dashboard summary payment writers', getDashboard, [
    'recordIncomeFromPayment',
    'syncCommissionForPayment',
    'postCompanyCommission',
    'ensureDepositLedgerFromPayment',
    'postPaymentAccounting',
    'ensurePaymentAccountingPosted',
    'repairPaymentAccounting'
  ]);
  assert.ok(getDashboard.includes('initializeForCompany'), 'GET dashboard still seeds COA; operational, not payment reconstruction');

  // 5. Historical agent commission maintenance still uses orchestrator writer
  const syncCommissionFn = sliceFn(agentSvc, 'async syncCommissionTransactions(agentId: string)', 'async syncFromPayments');
  assert.ok(syncCommissionFn.includes('this.syncCommissionForPayment'));
  const syncFromPayments = sliceFn(agentSvc, 'async syncFromPayments(companyId: string)', 'async getAcknowledgementDocument');
  assert.ok(syncFromPayments.includes('this.syncCommissionTransactions'));
  const syncCtrl = sliceFn(agentAcctCtrl, 'export const syncAgentAccounts = async', 'export const syncAgentCommissions');
  assert.ok(syncCtrl.includes('requireExplicitMigrationConfirmation'));
  const syncOneCtrl = sliceFn(agentAcctCtrl, 'export const syncAgentCommissions = async', 'export const getAcknowledgementDocument');
  assert.ok(syncOneCtrl.includes('syncCommissionTransactions'));
  assert.ok(accountantRoutes.includes("router.post('/agent-accounts/sync'"));
  assert.ok(accountantRoutes.includes("router.post('/agent-accounts/:agentId/sync-commissions'"));

  // 6. Payment immutability remains intact
  assert.throws(
    () => assertCompletedPaymentFinanciallyImmutable({ status: 'completed' }, { amount: 1 }),
    (err: Error) => err.message === COMPLETED_PAYMENT_IMMUTABLE_MESSAGE
  );
  assert.doesNotThrow(() =>
    assertCompletedPaymentFinanciallyImmutable({ status: 'completed', isProvisional: true }, { amount: 1 })
  );
  const agentUpdate = sliceFn(agentCtrl, 'export const updateAgentPayment = async', 'export const getAgentPayments');
  assert.ok(agentUpdate.includes('assertCompletedPaymentFinanciallyImmutable'));
  assert.ok(agentUpdate.includes('calculateForProperty'), 'provisional agent amount edits use canonical rental calculator');
  assert.ok(agentUpdate.includes('payment.save()'), 'agent financial edits persist via document save');
  assert.ok(!agentUpdate.includes('totalCommission = (updateData.amount * commissionPercentage) / 100'));
  const updatePayment = sliceFn(paymentCtrl, 'export const updatePayment = async', 'export const getCompanyPayments');
  assert.ok(updatePayment.includes('COMPLETED_PAYMENT_IMMUTABLE_MESSAGE'));
  assert.ok(paymentModel.includes('COMPLETED_PAYMENT_IMMUTABLE_MESSAGE'));
  assert.ok(immutability.includes("'amount'"));
  assert.ok(immutability.includes("'currency'"));
  assert.ok(immutability.includes("'paymentDate'"));

  // 7. Duplicate posting is idempotent at the writer
  const syncForPayment = sliceFn(agentSvc, 'async syncCommissionForPayment(paymentId: string)', 'async reverseCommissionForPayment');
  assert.ok(syncForPayment.includes('isCommissionLaneAlreadyPosted'));
  assert.ok(syncForPayment.includes('continue'));

  // 8. Unmounted duplicates stay unmounted (do not delete in this phase)
  assert.ok(!indexSrc.includes('paypalRoutes'));
  assert.ok(!indexSrc.includes("app.use('/api/paypal'"));
  assert.ok(paypalRoutes.includes("router.post('/create-order'"));
  assert.ok(paymentRoutes.includes('createPayment'));
  assert.ok(!indexSrc.includes('connectAuthDatabase'));
  assert.ok(authDb.includes('AUTH_MONGODB_URI'));

  const srcRoot = path.join(__dirname, '..');
  const walkTs = (dir: string): string[] => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'scripts') continue;
        files.push(...walkTs(full));
      } else if (entry.name.endsWith('.ts')) files.push(full);
    }
    return files;
  };
  const importerHits = walkTs(srcRoot).filter((file) => {
    if (file.endsWith(`${path.sep}authDatabase.ts`)) return false;
    const text = fs.readFileSync(file, 'utf8');
    return (
      text.includes("from '../services/paymentService'")
      || text.includes("from './paymentService'")
      || text.includes("from '../config/authDatabase'")
      || text.includes("from './authDatabase'")
      || text.includes('connectAuthDatabase')
    );
  });
  assert.strictEqual(importerHits.length, 0, `unexpected importers: ${importerHits.join(', ')}`);

  const useSocketPath = path.join(__dirname, '..', '..', '..', 'client', 'src', 'hooks', 'useSocket.ts');
  assert.ok(!fs.existsSync(useSocketPath), 'unused useSocket.ts must remain deleted');
  const header = clientSrc('components/Layout/Header.tsx');
  const liveRefresh = clientSrc('hooks/usePropertyAccountLiveRefresh.ts');
  assert.ok(header.includes('initializeSocket'));
  assert.ok(liveRefresh.includes('initializeSocket'));

  console.log('Phase 3C duplicate consolidation tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
