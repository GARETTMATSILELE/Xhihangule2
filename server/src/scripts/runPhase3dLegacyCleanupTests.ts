import assert from 'assert';
import fs from 'fs';
import path from 'path';

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
  const recon = srcFile('services/paymentAccountingReconciliation.ts');
  const orchestrator = srcFile('services/paymentAccountingOrchestrator.ts');
  const propertyCtrl = srcFile('controllers/propertyAccountController.ts');
  const accountantRoutes = srcFile('routes/accountantRoutes.ts');
  const indexSrc = srcFile('index.ts');
  const workerSrc = srcFile('worker.ts');
  const paypalRoutes = srcFile('routes/paypalRoutes.ts');
  const authDb = srcFile('config/authDatabase.ts');
  const clientMergeSvc = clientSrc('services/propertyAccountService.ts');
  const clientDetail = clientSrc('pages/AccountantDashboard/PropertyAccountDetailPage.tsx');

  // 1. Legacy unmounted paymentService is absent; mounted completion still uses orchestrator
  const legacyPaymentService = path.join(__dirname, '..', '..', 'src', 'services', 'paymentService.ts');
  assert.ok(!fs.existsSync(legacyPaymentService), 'server/src/services/paymentService.ts must be deleted');
  assert.ok(!indexSrc.includes("from './services/paymentService'"));
  assert.ok(!indexSrc.includes("from './services/paymentService.ts'"));
  assert.ok(!workerSrc.includes('paymentService'));

  const accountantCreate = sliceFn(paymentCtrl, 'export const createPaymentAccountant = async', 'export const createSalesPaymentAccountant');
  assert.ok(accountantCreate.includes('ensurePaymentAccountingPosted'));
  const leaseCreate = sliceFn(paymentCtrl, 'export const createPayment = async', 'export const createPaymentAccountant');
  assert.ok(leaseCreate.includes('ensurePaymentAccountingPosted'));
  const agentCreate = sliceFn(agentCtrl, 'export const createAgentPayment = async', 'export const updateAgentPayment = async');
  assert.ok(agentCreate.includes('ensurePaymentAccountingPosted'));
  const salesCreate = sliceFn(paymentCtrl, 'export const createSalesPaymentAccountant = async', 'export const updatePayment = async');
  assert.ok(salesCreate.includes('ensurePaymentAccountingPosted'));
  const statusUpdate = sliceFn(paymentCtrl, 'export const updatePaymentStatus = async', 'export const reversePayment = async');
  assert.ok(statusUpdate.includes('ensurePaymentAccountingPosted'));
  const webhookComplete = sliceFn(
    webhookCtrl,
    "if (normalizedStatus === 'completed')",
    'await WebhookEventReceipt.updateOne'
  );
  assert.ok(webhookComplete.includes('ensurePaymentAccountingPosted'));

  const ensureFn = sliceFn(recon, 'export async function ensurePaymentAccountingPosted', 'export async function refreshPaymentAccountingStatus');
  assert.ok(ensureFn.includes('postPaymentAccounting'));
  const postFn = sliceFn(orchestrator, 'export async function postPaymentAccounting', 'export async function reversePaymentAccounting');
  assert.ok(postFn.includes('recordIncomeFromPayment'));
  assert.ok(postFn.includes('syncCommissionForPayment'));
  assert.ok(postFn.includes('postCompanyCommission'));
  assert.ok(!indexSrc.includes('function postPaymentAccounting'));

  // 2. Duplicate reconcile/merge Case B controls
  const reconFn = sliceFn(propertyCtrl, 'export const reconcilePropertyDuplicates = async', 'export const syncPropertyAccounts');
  assert.ok(reconFn.includes('requireExplicitMigrationConfirmation'));
  assert.ok(reconFn.includes('startMigrationAudit'));
  assert.ok(reconFn.includes('finishMigrationAudit'));
  assert.ok(reconFn.includes('maintenance:property_reconcile_duplicates'));
  assert.ok(reconFn.indexOf('requireExplicitMigrationConfirmation') < reconFn.indexOf('reconcilePropertyLedgerDuplicates(propertyId)'));

  const mergeBody = propertyCtrl.slice(propertyCtrl.indexOf('export const mergePropertyAccountDuplicatesForProperty'));
  assert.ok(mergeBody.includes('requireExplicitMigrationConfirmation'));
  assert.ok(mergeBody.includes('startMigrationAudit'));
  assert.ok(mergeBody.includes('finishMigrationAudit'));
  assert.ok(mergeBody.includes('maintenance:property_merge_duplicates'));
  assert.ok(mergeBody.indexOf('requireExplicitMigrationConfirmation') < mergeBody.indexOf('mergeDuplicateAccounts'));

  assert.ok(accountantRoutes.includes("router.post('/property-accounts/:propertyId/reconcile-duplicates'"));
  assert.ok(accountantRoutes.includes("router.post('/property-accounts/:propertyId/merge-duplicates'"));
  assert.ok(!accountantRoutes.includes("router.get('/property-accounts/:propertyId/reconcile-duplicates'"));
  assert.ok(!accountantRoutes.includes("router.get('/property-accounts/:propertyId/merge-duplicates'"));
  assert.ok(accountantRoutes.includes('canViewCommissions, reconcilePropertyDuplicates'));
  assert.ok(accountantRoutes.includes('canViewCommissions, mergePropertyAccountDuplicatesForProperty'));

  const guard = srcFile('services/financialMigrationGuard.ts');
  const confirmFn = sliceFn(guard, 'export function requireExplicitMigrationConfirmation', 'export async function startMigrationAudit');
  assert.ok(confirmFn.includes('req.body?.confirm === true'));
  assert.ok(confirmFn.includes("if (!confirm || !reason)"));
  assert.ok(confirmFn.includes('400'));
  const wouldAllowMutation = (body: { confirm?: unknown; reason?: unknown }) => {
    const confirm = body.confirm === true;
    const reason = String(body.reason || '').trim();
    return Boolean(confirm && reason);
  };
  assert.strictEqual(wouldAllowMutation({}), false, 'missing confirm blocks mutation');
  assert.strictEqual(wouldAllowMutation({ confirm: true, reason: '   ' }), false, 'empty reason blocks mutation');
  assert.strictEqual(wouldAllowMutation({ confirm: true, reason: 'merge duplicate ledgers' }), true, 'confirm+reason permits the call');

  assert.ok(clientMergeSvc.includes('confirm: opts.confirm'));
  assert.ok(clientMergeSvc.includes('reason: opts.reason'));
  assert.ok(clientDetail.includes('window.confirm'));
  assert.ok(clientDetail.includes('window.prompt'));
  assert.ok(clientDetail.includes('mergeDuplicatesForProperty(propertyId, {'));

  // 3. GET property/payment surfaces do not reconstruct Payment accounting
  const getProperty = sliceFn(propertyCtrl, 'export const getPropertyAccount = async', 'export const migrateLegacyLedgerTypes');
  assertNotCalled('GET getPropertyAccount', getProperty, financialWriters);
  assert.ok(!getProperty.includes('reconcilePropertyLedgerDuplicates('));
  assert.ok(!getProperty.includes('mergeDuplicateAccounts('));

  const getDetails = sliceFn(paymentCtrl, 'export const getPaymentDetails = async', 'export const getPaymentAccountingReconciliation');
  assertNotCalled('GET getPaymentDetails', getDetails, financialWriters);

  const getAccounting = sliceFn(paymentCtrl, 'export const getPaymentAccountingReconciliation = async', 'export const repairPaymentAccountingExplicit');
  assertNotCalled('GET payment accounting', getAccounting, financialWriters.filter((n) => n !== 'repairPaymentAccounting'));
  assert.ok(!getAccounting.includes('repairPaymentAccounting('));
  assert.ok(getAccounting.includes('reconcilePayment'));

  // 4. Auth database: repo evidence only — file retained, no in-repo callers
  assert.ok(fs.existsSync(path.join(__dirname, '..', '..', 'src', 'config', 'authDatabase.ts')));
  assert.ok(authDb.includes('AUTH_MONGODB_URI'));
  assert.ok(!indexSrc.includes('connectAuthDatabase'));
  assert.ok(!workerSrc.includes('connectAuthDatabase'));
  assert.ok(!indexSrc.includes('AUTH_MONGODB_URI'));

  // 5. PayPal remains unmounted (product surface retained)
  assert.ok(!indexSrc.includes('paypalRoutes'));
  assert.ok(!indexSrc.includes("app.use('/api/paypal'"));
  assert.ok(paypalRoutes.includes("router.post('/create-order'"));
  assert.ok(indexSrc.includes('paypal.com'));

  // 6. No second live accounting engine
  assert.ok(ensureFn.includes('await postPaymentAccounting'));
  assert.ok(!accountantCreate.includes('recordIncomeFromPayment('));
  assert.ok(!leaseCreate.includes('recordIncomeFromPayment('));

  console.log('Phase 3D legacy cleanup tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
