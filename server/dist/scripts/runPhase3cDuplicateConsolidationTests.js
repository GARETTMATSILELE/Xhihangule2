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
const propertyCommissionCalculator_1 = require("../services/propertyCommissionCalculator");
const money_1 = require("../utils/money");
const paymentFinancialImmutability_1 = require("../services/paymentFinancialImmutability");
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
        assert_1.default.ok(commissionSvc.includes('calculatePropertyCommission'));
        assert_1.default.ok(commissionSvc.includes('vatOnCommission: false'), 'CommissionService.calculate forces VAT off');
        assert_1.default.ok(commissionSvc.includes('return calculatePropertyCommission'));
        const leaseCreate = sliceFn(paymentCtrl, 'export const createPayment = async', 'export const createPaymentAccountant');
        assert_1.default.ok(leaseCreate.includes('CommissionService.calculateForProperty'));
        assert_1.default.ok(leaseCreate.includes('ensurePaymentAccountingPosted'));
        const accountantCreate = sliceFn(paymentCtrl, 'export const createPaymentAccountant = async', 'export const createSalesPaymentAccountant');
        assert_1.default.ok(accountantCreate.includes('CommissionService.calculateForProperty'));
        assert_1.default.ok(accountantCreate.includes('ensurePaymentAccountingPosted'));
        const publicCreate = sliceFn(paymentCtrl, 'export const createPaymentPublic = async', 'export const getPaymentReceiptDownload');
        assert_1.default.ok(publicCreate.includes('CommissionService.calculateForProperty'));
        assert_1.default.ok(publicCreate.includes('ensurePaymentAccountingPosted'));
        const finalizeFn = sliceFn(paymentCtrl, 'export const finalizeProvisionalPayment = async', 'export const getCombinedRemaining');
        assert_1.default.ok(finalizeFn.includes('CommissionService.calculateForProperty'));
        assert_1.default.ok(finalizeFn.includes('ensurePaymentAccountingPosted'));
        const salesCreate = sliceFn(paymentCtrl, 'export const createSalesPaymentAccountant = async', 'export const updatePayment = async');
        assert_1.default.ok(salesCreate.includes('CommissionService.calculate('));
        assert_1.default.ok(salesCreate.includes('ensurePaymentAccountingPosted'));
        assert_1.default.ok(salesCreate.includes('computeCommissionFallback'), 'sale path retains fallback; rounding is aligned to roundMoney');
        const agentCreate = sliceFn(agentCtrl, 'export const createAgentPayment = async', 'export const updateAgentPayment = async');
        assert_1.default.ok(agentCreate.includes('CommissionService'));
        assert_1.default.ok(agentCreate.includes('calculateForProperty'), 'agent rental create uses canonical calculator');
        assert_1.default.ok(agentCreate.includes('CommissionService.calculate('), 'agent sale create retains VAT-off wrapper');
        assert_1.default.ok(agentCreate.includes('ensurePaymentAccountingPosted'));
        const statusUpdate = sliceFn(paymentCtrl, 'export const updatePaymentStatus = async', 'export const reversePayment = async');
        assert_1.default.ok(statusUpdate.includes('ensurePaymentAccountingPosted'));
        assert_1.default.ok(statusUpdate.includes('COMPLETED_PAYMENT_IMMUTABLE_MESSAGE'));
        const webhookComplete = sliceFn(webhookCtrl, 'if (normalizedStatus === \'completed\')', 'await WebhookEventReceipt.updateOne');
        assert_1.default.ok(webhookComplete.includes('ensurePaymentAccountingPosted'));
        const legacyPaymentServicePath = path_1.default.join(__dirname, '..', '..', 'src', 'services', 'paymentService.ts');
        assert_1.default.ok(!fs_1.default.existsSync(legacyPaymentServicePath), 'unmounted server paymentService.ts must remain deleted');
        // 2. Fallback now uses canonical roundMoney at the same commission-split stages
        const amount = 333.33;
        const pct = 15;
        const canonical = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
            grossRent: amount,
            levy: 0,
            commissionPercentage: pct,
            vatOnCommission: false
        });
        const fallback = (0, money_1.computeCommissionFallback)(amount, pct);
        assert_1.default.strictEqual(canonical.totalCommission, fallback.totalCommission, 'fallback must round like canonical');
        assert_1.default.strictEqual(canonical.preaFee, fallback.preaFee);
        assert_1.default.strictEqual(canonical.agentShare, fallback.agentShare);
        assert_1.default.strictEqual(canonical.agencyShare, fallback.agencyShare);
        assert_1.default.strictEqual(canonical.ownerAmount, fallback.ownerAmount);
        assert_1.default.strictEqual(canonical.totalCommission, (0, money_1.roundMoney)((amount * pct) / 100));
        const vatOn = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
            grossRent: 1000,
            levy: 0,
            commissionPercentage: 10,
            vatOnCommission: true,
            vatTreatment: 'exclusive',
            vatRate: 0.155
        });
        const vatOff = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
            grossRent: 1000,
            levy: 0,
            commissionPercentage: 10,
            vatOnCommission: false
        });
        assert_1.default.ok(vatOn.vatAmount > 0);
        assert_1.default.strictEqual(vatOff.vatAmount, 0);
        assert_1.default.notStrictEqual(vatOn.ownerAmount, vatOff.ownerAmount);
        // 3. One live accounting path: completion → ensure → post
        const ensureFn = sliceFn(recon, 'export async function ensurePaymentAccountingPosted', 'export async function refreshPaymentAccountingStatus');
        assert_1.default.ok(ensureFn.includes('postPaymentAccounting'));
        const postFn = sliceFn(orchestrator, 'export async function postPaymentAccounting', 'export async function reversePaymentAccounting');
        assert_1.default.ok(postFn.includes('recordIncomeFromPayment'));
        assert_1.default.ok(postFn.includes('syncCommissionForPayment'));
        assert_1.default.ok(postFn.includes('postCompanyCommission'));
        assert_1.default.ok(postFn.includes('syncPaymentReceived'));
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
        assert_1.default.ok(getAccounting.includes('reconcilePayment'), 'GET accounting remains detection-only');
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
        assert_1.default.ok(getDashboard.includes('initializeForCompany'), 'GET dashboard still seeds COA; operational, not payment reconstruction');
        // 5. Historical agent commission maintenance still uses orchestrator writer
        const syncCommissionFn = sliceFn(agentSvc, 'async syncCommissionTransactions(agentId: string)', 'async syncFromPayments');
        assert_1.default.ok(syncCommissionFn.includes('this.syncCommissionForPayment'));
        const syncFromPayments = sliceFn(agentSvc, 'async syncFromPayments(companyId: string)', 'async getAcknowledgementDocument');
        assert_1.default.ok(syncFromPayments.includes('this.syncCommissionTransactions'));
        const syncCtrl = sliceFn(agentAcctCtrl, 'export const syncAgentAccounts = async', 'export const syncAgentCommissions');
        assert_1.default.ok(syncCtrl.includes('requireExplicitMigrationConfirmation'));
        const syncOneCtrl = sliceFn(agentAcctCtrl, 'export const syncAgentCommissions = async', 'export const getAcknowledgementDocument');
        assert_1.default.ok(syncOneCtrl.includes('syncCommissionTransactions'));
        assert_1.default.ok(accountantRoutes.includes("router.post('/agent-accounts/sync'"));
        assert_1.default.ok(accountantRoutes.includes("router.post('/agent-accounts/:agentId/sync-commissions'"));
        // 6. Payment immutability remains intact
        assert_1.default.throws(() => (0, paymentFinancialImmutability_1.assertCompletedPaymentFinanciallyImmutable)({ status: 'completed' }, { amount: 1 }), (err) => err.message === paymentFinancialImmutability_1.COMPLETED_PAYMENT_IMMUTABLE_MESSAGE);
        assert_1.default.doesNotThrow(() => (0, paymentFinancialImmutability_1.assertCompletedPaymentFinanciallyImmutable)({ status: 'completed', isProvisional: true }, { amount: 1 }));
        const agentUpdate = sliceFn(agentCtrl, 'export const updateAgentPayment = async', 'export const getAgentPayments');
        assert_1.default.ok(agentUpdate.includes('assertCompletedPaymentFinanciallyImmutable'));
        assert_1.default.ok(agentUpdate.includes('calculateForProperty'), 'provisional agent amount edits use canonical rental calculator');
        assert_1.default.ok(agentUpdate.includes('payment.save()'), 'agent financial edits persist via document save');
        assert_1.default.ok(!agentUpdate.includes('totalCommission = (updateData.amount * commissionPercentage) / 100'));
        const updatePayment = sliceFn(paymentCtrl, 'export const updatePayment = async', 'export const getCompanyPayments');
        assert_1.default.ok(updatePayment.includes('COMPLETED_PAYMENT_IMMUTABLE_MESSAGE'));
        assert_1.default.ok(paymentModel.includes('COMPLETED_PAYMENT_IMMUTABLE_MESSAGE'));
        assert_1.default.ok(immutability.includes("'amount'"));
        assert_1.default.ok(immutability.includes("'currency'"));
        assert_1.default.ok(immutability.includes("'paymentDate'"));
        // 7. Duplicate posting is idempotent at the writer
        const syncForPayment = sliceFn(agentSvc, 'async syncCommissionForPayment(paymentId: string)', 'async reverseCommissionForPayment');
        assert_1.default.ok(syncForPayment.includes('isCommissionLaneAlreadyPosted'));
        assert_1.default.ok(syncForPayment.includes('continue'));
        // 8. Unmounted duplicates stay unmounted (do not delete in this phase)
        assert_1.default.ok(!indexSrc.includes('paypalRoutes'));
        assert_1.default.ok(!indexSrc.includes("app.use('/api/paypal'"));
        assert_1.default.ok(paypalRoutes.includes("router.post('/create-order'"));
        assert_1.default.ok(paymentRoutes.includes('createPayment'));
        assert_1.default.ok(!indexSrc.includes('connectAuthDatabase'));
        assert_1.default.ok(authDb.includes('AUTH_MONGODB_URI'));
        const srcRoot = path_1.default.join(__dirname, '..');
        const walkTs = (dir) => {
            const entries = fs_1.default.readdirSync(dir, { withFileTypes: true });
            const files = [];
            for (const entry of entries) {
                const full = path_1.default.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (entry.name === 'scripts')
                        continue;
                    files.push(...walkTs(full));
                }
                else if (entry.name.endsWith('.ts'))
                    files.push(full);
            }
            return files;
        };
        const importerHits = walkTs(srcRoot).filter((file) => {
            if (file.endsWith(`${path_1.default.sep}authDatabase.ts`))
                return false;
            const text = fs_1.default.readFileSync(file, 'utf8');
            return (text.includes("from '../services/paymentService'")
                || text.includes("from './paymentService'")
                || text.includes("from '../config/authDatabase'")
                || text.includes("from './authDatabase'")
                || text.includes('connectAuthDatabase'));
        });
        assert_1.default.strictEqual(importerHits.length, 0, `unexpected importers: ${importerHits.join(', ')}`);
        const useSocketPath = path_1.default.join(__dirname, '..', '..', '..', 'client', 'src', 'hooks', 'useSocket.ts');
        assert_1.default.ok(!fs_1.default.existsSync(useSocketPath), 'unused useSocket.ts must remain deleted');
        const header = clientSrc('components/Layout/Header.tsx');
        const liveRefresh = clientSrc('hooks/usePropertyAccountLiveRefresh.ts');
        assert_1.default.ok(header.includes('initializeSocket'));
        assert_1.default.ok(liveRefresh.includes('initializeSocket'));
        console.log('Phase 3C duplicate consolidation tests passed');
    });
}
run().catch((error) => {
    console.error(error);
    process.exit(1);
});
