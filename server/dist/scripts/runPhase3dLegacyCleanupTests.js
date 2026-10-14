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
const financialWriters = [
    'recordIncomeFromPayment',
    'syncCommissionForPayment',
    'postCompanyCommission',
    'ensureDepositLedgerFromPayment',
    'postPaymentAccounting',
    'ensurePaymentAccountingPosted',
    'repairPaymentAccounting'
];
function run() {
    return __awaiter(this, void 0, void 0, function* () {
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
        const legacyPaymentService = path_1.default.join(__dirname, '..', '..', 'src', 'services', 'paymentService.ts');
        assert_1.default.ok(!fs_1.default.existsSync(legacyPaymentService), 'server/src/services/paymentService.ts must be deleted');
        assert_1.default.ok(!indexSrc.includes("from './services/paymentService'"));
        assert_1.default.ok(!indexSrc.includes("from './services/paymentService.ts'"));
        assert_1.default.ok(!workerSrc.includes('paymentService'));
        const accountantCreate = sliceFn(paymentCtrl, 'export const createPaymentAccountant = async', 'export const createSalesPaymentAccountant');
        assert_1.default.ok(accountantCreate.includes('ensurePaymentAccountingPosted'));
        const leaseCreate = sliceFn(paymentCtrl, 'export const createPayment = async', 'export const createPaymentAccountant');
        assert_1.default.ok(leaseCreate.includes('ensurePaymentAccountingPosted'));
        const agentCreate = sliceFn(agentCtrl, 'export const createAgentPayment = async', 'export const updateAgentPayment = async');
        assert_1.default.ok(agentCreate.includes('ensurePaymentAccountingPosted'));
        const salesCreate = sliceFn(paymentCtrl, 'export const createSalesPaymentAccountant = async', 'export const updatePayment = async');
        assert_1.default.ok(salesCreate.includes('ensurePaymentAccountingPosted'));
        const statusUpdate = sliceFn(paymentCtrl, 'export const updatePaymentStatus = async', 'export const reversePayment = async');
        assert_1.default.ok(statusUpdate.includes('ensurePaymentAccountingPosted'));
        const webhookComplete = sliceFn(webhookCtrl, "if (normalizedStatus === 'completed')", 'await WebhookEventReceipt.updateOne');
        assert_1.default.ok(webhookComplete.includes('ensurePaymentAccountingPosted'));
        const ensureFn = sliceFn(recon, 'export async function ensurePaymentAccountingPosted', 'export async function refreshPaymentAccountingStatus');
        assert_1.default.ok(ensureFn.includes('postPaymentAccounting'));
        const postFn = sliceFn(orchestrator, 'export async function postPaymentAccounting', 'export async function reversePaymentAccounting');
        assert_1.default.ok(postFn.includes('recordIncomeFromPayment'));
        assert_1.default.ok(postFn.includes('syncCommissionForPayment'));
        assert_1.default.ok(postFn.includes('postCompanyCommission'));
        assert_1.default.ok(!indexSrc.includes('function postPaymentAccounting'));
        // 2. Duplicate reconcile/merge Case B controls
        const reconFn = sliceFn(propertyCtrl, 'export const reconcilePropertyDuplicates = async', 'export const syncPropertyAccounts');
        assert_1.default.ok(reconFn.includes('requireExplicitMigrationConfirmation'));
        assert_1.default.ok(reconFn.includes('startMigrationAudit'));
        assert_1.default.ok(reconFn.includes('finishMigrationAudit'));
        assert_1.default.ok(reconFn.includes('maintenance:property_reconcile_duplicates'));
        assert_1.default.ok(reconFn.indexOf('requireExplicitMigrationConfirmation') < reconFn.indexOf('reconcilePropertyLedgerDuplicates(propertyId)'));
        const mergeBody = propertyCtrl.slice(propertyCtrl.indexOf('export const mergePropertyAccountDuplicatesForProperty'));
        assert_1.default.ok(mergeBody.includes('requireExplicitMigrationConfirmation'));
        assert_1.default.ok(mergeBody.includes('startMigrationAudit'));
        assert_1.default.ok(mergeBody.includes('finishMigrationAudit'));
        assert_1.default.ok(mergeBody.includes('maintenance:property_merge_duplicates'));
        assert_1.default.ok(mergeBody.indexOf('requireExplicitMigrationConfirmation') < mergeBody.indexOf('mergeDuplicateAccounts'));
        assert_1.default.ok(accountantRoutes.includes("router.post('/property-accounts/:propertyId/reconcile-duplicates'"));
        assert_1.default.ok(accountantRoutes.includes("router.post('/property-accounts/:propertyId/merge-duplicates'"));
        assert_1.default.ok(!accountantRoutes.includes("router.get('/property-accounts/:propertyId/reconcile-duplicates'"));
        assert_1.default.ok(!accountantRoutes.includes("router.get('/property-accounts/:propertyId/merge-duplicates'"));
        assert_1.default.ok(accountantRoutes.includes('canViewCommissions, reconcilePropertyDuplicates'));
        assert_1.default.ok(accountantRoutes.includes('canViewCommissions, mergePropertyAccountDuplicatesForProperty'));
        const guard = srcFile('services/financialMigrationGuard.ts');
        const confirmFn = sliceFn(guard, 'export function requireExplicitMigrationConfirmation', 'export async function startMigrationAudit');
        assert_1.default.ok(confirmFn.includes('req.body?.confirm === true'));
        assert_1.default.ok(confirmFn.includes("if (!confirm || !reason)"));
        assert_1.default.ok(confirmFn.includes('400'));
        const wouldAllowMutation = (body) => {
            const confirm = body.confirm === true;
            const reason = String(body.reason || '').trim();
            return Boolean(confirm && reason);
        };
        assert_1.default.strictEqual(wouldAllowMutation({}), false, 'missing confirm blocks mutation');
        assert_1.default.strictEqual(wouldAllowMutation({ confirm: true, reason: '   ' }), false, 'empty reason blocks mutation');
        assert_1.default.strictEqual(wouldAllowMutation({ confirm: true, reason: 'merge duplicate ledgers' }), true, 'confirm+reason permits the call');
        assert_1.default.ok(clientMergeSvc.includes('confirm: opts.confirm'));
        assert_1.default.ok(clientMergeSvc.includes('reason: opts.reason'));
        assert_1.default.ok(clientDetail.includes('window.confirm'));
        assert_1.default.ok(clientDetail.includes('window.prompt'));
        assert_1.default.ok(clientDetail.includes('mergeDuplicatesForProperty(propertyId, {'));
        // 3. GET property/payment surfaces do not reconstruct Payment accounting
        const getProperty = sliceFn(propertyCtrl, 'export const getPropertyAccount = async', 'export const migrateLegacyLedgerTypes');
        assertNotCalled('GET getPropertyAccount', getProperty, financialWriters);
        assert_1.default.ok(!getProperty.includes('reconcilePropertyLedgerDuplicates('));
        assert_1.default.ok(!getProperty.includes('mergeDuplicateAccounts('));
        const getDetails = sliceFn(paymentCtrl, 'export const getPaymentDetails = async', 'export const getPaymentAccountingReconciliation');
        assertNotCalled('GET getPaymentDetails', getDetails, financialWriters);
        const getAccounting = sliceFn(paymentCtrl, 'export const getPaymentAccountingReconciliation = async', 'export const repairPaymentAccountingExplicit');
        assertNotCalled('GET payment accounting', getAccounting, financialWriters.filter((n) => n !== 'repairPaymentAccounting'));
        assert_1.default.ok(!getAccounting.includes('repairPaymentAccounting('));
        assert_1.default.ok(getAccounting.includes('reconcilePayment'));
        // 4. Auth database: repo evidence only — file retained, no in-repo callers
        assert_1.default.ok(fs_1.default.existsSync(path_1.default.join(__dirname, '..', '..', 'src', 'config', 'authDatabase.ts')));
        assert_1.default.ok(authDb.includes('AUTH_MONGODB_URI'));
        assert_1.default.ok(!indexSrc.includes('connectAuthDatabase'));
        assert_1.default.ok(!workerSrc.includes('connectAuthDatabase'));
        assert_1.default.ok(!indexSrc.includes('AUTH_MONGODB_URI'));
        // 5. PayPal remains unmounted (product surface retained)
        assert_1.default.ok(!indexSrc.includes('paypalRoutes'));
        assert_1.default.ok(!indexSrc.includes("app.use('/api/paypal'"));
        assert_1.default.ok(paypalRoutes.includes("router.post('/create-order'"));
        assert_1.default.ok(indexSrc.includes('paypal.com'));
        // 6. No second live accounting engine
        assert_1.default.ok(ensureFn.includes('await postPaymentAccounting'));
        assert_1.default.ok(!accountantCreate.includes('recordIncomeFromPayment('));
        assert_1.default.ok(!leaseCreate.includes('recordIncomeFromPayment('));
        console.log('Phase 3D legacy cleanup tests passed');
    });
}
run().catch((error) => {
    console.error(error);
    process.exit(1);
});
