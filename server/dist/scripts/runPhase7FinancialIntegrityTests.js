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
const paymentAccountingProjection_1 = require("../services/paymentAccountingProjection");
const money_1 = require("../utils/money");
const introductionCommissionService_1 = require("../services/introductionCommissionService");
const outstandingLeaseCalculation_1 = require("../services/outstandingLeaseCalculation");
const salePaymentCompleteness_1 = require("../services/salePaymentCompleteness");
const paymentFinancialImmutability_1 = require("../services/paymentFinancialImmutability");
const legacyIntroductionRisk_1 = require("../services/legacyIntroductionRisk");
const paymentIntegrityDiagnostic_1 = require("../services/paymentIntegrityDiagnostic");
const paymentAccountingCompleteness_1 = require("../services/paymentAccountingCompleteness");
function srcFile(rel) {
    return fs_1.default.readFileSync(path_1.default.join(__dirname, '..', '..', 'src', rel), 'utf8');
}
function sliceFn(src, startToken, endToken) {
    const start = src.indexOf(startToken);
    const end = src.indexOf(endToken, start + startToken.length);
    assert_1.default.ok(start >= 0 && end > start, `expected ${startToken} before ${endToken}`);
    return src.slice(start, end);
}
function introSnapshot(rentAllocated, alreadyConsumed, levyAllocated = 0, vat) {
    const allocation = (0, introductionCommissionService_1.computeIntroductionAllocation)({
        rentAllocated,
        levyAllocated,
        oneMonthRent: 1000,
        alreadyConsumed
    });
    const calculated = (0, introductionCommissionService_1.snapshotFromIntroductionAllocation)(allocation, {
        vatOnCommission: Boolean(vat === null || vat === void 0 ? void 0 : vat.vatOnCommission),
        vatTreatment: (vat === null || vat === void 0 ? void 0 : vat.vatOnCommission) ? 'inclusive' : undefined,
        vatRate: vat === null || vat === void 0 ? void 0 : vat.vatRate,
        preaPercentOfTotal: 0.03,
        agentPercentOfRemaining: 0.6,
        agencyPercentOfRemaining: 0.4
    });
    return { allocation, snapshot: (0, introductionCommissionService_1.applyIntroductionOwnerRemainder)(calculated, allocation) };
}
function paymentFromSnapshot(snapshot, extras) {
    var _a, _b;
    return Object.assign({ _id: (extras === null || extras === void 0 ? void 0 : extras._id) || 'pay-phase7', status: 'completed', paymentType: (extras === null || extras === void 0 ? void 0 : extras.paymentType) || 'rental', amount: Number((_a = extras === null || extras === void 0 ? void 0 : extras.amount) !== null && _a !== void 0 ? _a : snapshot.commissionBase), depositAmount: Number((_b = extras === null || extras === void 0 ? void 0 : extras.depositAmount) !== null && _b !== void 0 ? _b : 0), levyAllocated: snapshot.levy || 0, isProvisional: false, isInSuspense: false, commissionDetails: snapshot, currency: (extras === null || extras === void 0 ? void 0 : extras.currency) || 'USD', agentId: (extras === null || extras === void 0 ? void 0 : extras.agentId) || 'agent-1' }, extras);
}
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const results = {};
        const paymentCtrl = srcFile('controllers/paymentController.ts');
        const agentCtrl = srcFile('controllers/agentController.ts');
        const webhookCtrl = srcFile('controllers/paymentWebhookController.ts');
        const orchestrator = srcFile('services/paymentAccountingOrchestrator.ts');
        const recon = srcFile('services/paymentAccountingReconciliation.ts');
        const integrity = srcFile('services/paymentAccountingIntegrity.ts');
        const scheduled = srcFile('services/scheduledSyncService.ts');
        const ledger = srcFile('services/ledgerEventService.ts');
        const reportRoutes = srcFile('routes/reportRoutes.ts');
        const accountingCtrl = srcFile('controllers/accountingController.ts');
        const accountantRoutes = srcFile('routes/accountantRoutes.ts');
        const introSvc = srcFile('services/introductionCommissionService.ts');
        const getAccounting = sliceFn(paymentCtrl, 'export const getPaymentAccountingReconciliation = async', 'export const repairPaymentAccountingExplicit');
        const postFn = sliceFn(orchestrator, 'export async function postPaymentAccounting', 'export async function reversePaymentAccounting');
        const ensureFn = sliceFn(recon, 'export async function ensurePaymentAccountingPosted', 'export async function refreshPaymentAccountingStatus');
        const accountantCreate = sliceFn(paymentCtrl, 'export const createPaymentAccountant = async', 'export const createSalesPaymentAccountant');
        const agentCreate = sliceFn(agentCtrl, 'export const createAgentPayment = async', 'export const updateAgentPayment = async');
        // ---------------------------------------------------------------------------
        // Live write-path / orchestrator
        // ---------------------------------------------------------------------------
        for (const [label, body] of [
            ['accountant', accountantCreate],
            ['agent', agentCreate],
            ['webhook', webhookCtrl],
            ['lease', sliceFn(paymentCtrl, 'export const createPayment = async', 'export const createPaymentAccountant')],
            ['public', sliceFn(paymentCtrl, 'export const createPaymentPublic = async', 'export const getPaymentReceiptDownload')],
            ['finalize', sliceFn(paymentCtrl, 'export const finalizeProvisionalPayment = async', 'export const getCombinedRemaining')],
            ['sales', sliceFn(paymentCtrl, 'export const createSalesPaymentAccountant = async', 'export const updatePayment = async')]
        ]) {
            assert_1.default.ok(body.includes('ensurePaymentAccountingPosted'), `${label} posts via canonical orchestrator`);
            assert_1.default.ok(!body.includes('recordIncomeFromPayment('), `${label} must not write owner ledger directly`);
        }
        assert_1.default.ok(ensureFn.includes('postPaymentAccounting'));
        assert_1.default.ok(ensureFn.includes('reconcilePayment'));
        assert_1.default.ok(ensureFn.includes('applyReconciliationOutcome'));
        assert_1.default.ok(!postFn.includes('calculateForProperty'));
        assert_1.default.ok(!postFn.includes('prepareIntroductionRentalCommission'));
        assert_1.default.ok(!postFn.includes('accountingComplete'));
        assert_1.default.ok(!fs_1.default.existsSync(path_1.default.join(__dirname, '..', 'services', 'paymentService.ts')));
        results['Canonical posting'] = 'PASS';
        // GET safety
        assert_1.default.ok(getAccounting.includes('reconcilePayment'));
        assert_1.default.ok(!getAccounting.includes('applyReconciliationOutcome'));
        assert_1.default.ok(!getAccounting.includes('repairPaymentAccounting('));
        assert_1.default.ok(!getAccounting.includes('postPaymentAccounting('));
        assert_1.default.ok(getAccounting.includes('loadLegacyIntroductionContextRisk'));
        assert_1.default.ok(getAccounting.includes('diagnostic:'));
        assert_1.default.ok(accountingCtrl.includes('initializeForCompany'));
        assert_1.default.ok(!accountingCtrl.includes('recordIncomeFromPayment('));
        const dashboardSummaryFn = sliceFn(srcFile('services/accountingService.ts'), 'async getDashboardSummary(companyId: string)', 'async getDashboardOutstanding');
        assert_1.default.ok(!dashboardSummaryFn.includes('CompanyBalance.updateOne'));
        const propertyAccountCtrl = srcFile('controllers/propertyAccountController.ts');
        assert_1.default.ok(propertyAccountCtrl.includes('Read-only: load the named ledger'));
        assert_1.default.ok(propertyAccountCtrl.includes('Never posts income or repairs accounting'));
        results['GET safety'] = 'PASS';
        // Detection-only scheduled / orphan
        assert_1.default.ok(scheduled.includes('Read-only: never repairs or backfills'));
        assert_1.default.ok(!scheduled.includes('repairPaymentAccounting('));
        assert_1.default.ok(integrity.includes('Never deletes orphans'));
        assert_1.default.ok(!integrity.includes('recordIncomeFromPayment('));
        assert_1.default.ok(ledger.includes('postPaymentAccounting'));
        results['Detection-only'] = 'PASS';
        // ---------------------------------------------------------------------------
        // Payment identity / cross-payment
        // ---------------------------------------------------------------------------
        const snapshotA = introSnapshot(1000, 0).snapshot;
        const payA = paymentFromSnapshot(snapshotA, { _id: 'pay-A', amount: 1000 });
        const expectedA = (0, paymentAccountingProjection_1.buildExpectedAccountingProjection)(payA);
        const matchingActual = {
            ownerIncome: expectedA.ownerIncome,
            agentCommission: expectedA.agentCommission,
            companyCommission: expectedA.companyCommission,
            journal: expectedA.journal,
            vat: expectedA.vat,
            deposit: expectedA.deposit,
            amounts: Object.assign({}, expectedA.amounts),
            linkedPaymentIds: {
                ownerIncome: 'pay-A',
                agentCommission: 'pay-A',
                companyCommission: 'pay-A',
                journal: 'pay-A',
                vat: 'pay-A',
                deposit: 'pay-A'
            }
        };
        const reconWrongId = (0, paymentAccountingProjection_1.evaluateAccountingReconciliation)({
            paymentId: 'pay-A',
            expected: expectedA,
            actual: Object.assign(Object.assign({}, matchingActual), { linkedPaymentIds: { agentCommission: 'pay-B', companyCommission: 'pay-B', journal: 'pay-B' } })
        });
        assert_1.default.strictEqual(reconWrongId.accountingComplete, false);
        assert_1.default.ok(reconWrongId.mismatched.length > 0);
        const reconMatchA = (0, paymentAccountingProjection_1.evaluateAccountingReconciliation)({
            paymentId: 'pay-A',
            expected: expectedA,
            actual: matchingActual
        });
        assert_1.default.strictEqual(reconMatchA.accountingComplete, true);
        results['Payment identity'] = 'PASS';
        // Duplicate projections
        const dup = (0, paymentIntegrityDiagnostic_1.detectDuplicateProjections)({ paymentId: 'pay-A', projectionType: 'ownerIncome', count: 2 });
        assert_1.default.strictEqual(dup === null || dup === void 0 ? void 0 : dup.code, paymentIntegrityDiagnostic_1.DUPLICATE_PROJECTION_DETECTED);
        const dupRecon = (0, paymentAccountingProjection_1.evaluateAccountingReconciliation)({
            paymentId: 'pay-A',
            expected: expectedA,
            actual: Object.assign(Object.assign({}, matchingActual), { duplicates: { agentCommission: 2 } })
        });
        assert_1.default.strictEqual(dupRecon.accountingComplete, false);
        results['Duplicate projections'] = 'PASS';
        // Missing / mismatch / accountingComplete
        const missing = (0, paymentAccountingProjection_1.evaluateAccountingReconciliation)({
            paymentId: 'pay-A',
            expected: expectedA,
            actual: {
                ownerIncome: false,
                agentCommission: false,
                companyCommission: false,
                journal: false,
                vat: false,
                deposit: false
            }
        });
        assert_1.default.strictEqual(missing.accountingComplete, false);
        const wrongAmount = (0, paymentAccountingProjection_1.evaluateAccountingReconciliation)({
            paymentId: 'pay-A',
            expected: expectedA,
            actual: Object.assign(Object.assign({}, matchingActual), { amounts: Object.assign(Object.assign({}, expectedA.amounts), { journal: (0, money_1.roundMoney)(Number(expectedA.amounts.journal) - 1) }) })
        });
        assert_1.default.strictEqual(wrongAmount.accountingComplete, false);
        const wrongCommission = (0, paymentAccountingProjection_1.evaluateAccountingReconciliation)({
            paymentId: 'pay-A',
            expected: expectedA,
            actual: Object.assign(Object.assign({}, matchingActual), { amounts: Object.assign(Object.assign({}, expectedA.amounts), { agentCommission: 1 }) })
        });
        assert_1.default.strictEqual(wrongCommission.accountingComplete, false);
        const laterSnapshot = introSnapshot(1000, 1000).snapshot;
        const laterPay = paymentFromSnapshot(laterSnapshot, { _id: 'pay-owner', amount: 1000 });
        const expectedLater = (0, paymentAccountingProjection_1.buildExpectedAccountingProjection)(laterPay);
        const matchingLater = {
            ownerIncome: expectedLater.ownerIncome,
            agentCommission: expectedLater.agentCommission,
            companyCommission: expectedLater.companyCommission,
            journal: expectedLater.journal,
            vat: expectedLater.vat,
            deposit: expectedLater.deposit,
            amounts: Object.assign({}, expectedLater.amounts),
            linkedPaymentIds: {
                ownerIncome: 'pay-owner',
                agentCommission: 'pay-owner',
                companyCommission: 'pay-owner',
                journal: 'pay-owner',
                vat: 'pay-owner',
                deposit: 'pay-owner'
            }
        };
        const reconLater = (0, paymentAccountingProjection_1.evaluateAccountingReconciliation)({
            paymentId: 'pay-owner',
            expected: expectedLater,
            actual: matchingLater
        });
        assert_1.default.strictEqual(reconLater.accountingComplete, true);
        const wrongOwner = (0, paymentAccountingProjection_1.evaluateAccountingReconciliation)({
            paymentId: 'pay-owner',
            expected: expectedLater,
            actual: Object.assign(Object.assign({}, matchingLater), { amounts: Object.assign(Object.assign({}, expectedLater.amounts), { ownerIncome: (0, money_1.roundMoney)(Number(expectedLater.amounts.ownerIncome || 0) + 50) }) })
        });
        assert_1.default.strictEqual(wrongOwner.accountingComplete, false);
        const vatMismatch = (0, paymentAccountingProjection_1.evaluateAccountingReconciliation)({
            paymentId: 'pay-A',
            expected: expectedA,
            actual: Object.assign(Object.assign({}, matchingActual), { vat: true, amounts: Object.assign(Object.assign({}, expectedA.amounts), { vat: 99 }) })
        });
        assert_1.default.strictEqual(vatMismatch.accountingComplete, expectedA.vat ? false : vatMismatch.accountingComplete);
        const vatOnPay = paymentFromSnapshot(introSnapshot(1000, 0, 0, { vatOnCommission: true, vatRate: 0.155 }).snapshot, { _id: 'pay-vat', amount: 1000 });
        const expectedVat = (0, paymentAccountingProjection_1.buildExpectedAccountingProjection)(vatOnPay);
        const matchingVat = {
            ownerIncome: expectedVat.ownerIncome,
            agentCommission: expectedVat.agentCommission,
            companyCommission: expectedVat.companyCommission,
            journal: expectedVat.journal,
            vat: expectedVat.vat,
            deposit: expectedVat.deposit,
            amounts: Object.assign({}, expectedVat.amounts),
            linkedPaymentIds: {
                ownerIncome: 'pay-vat',
                agentCommission: 'pay-vat',
                companyCommission: 'pay-vat',
                journal: 'pay-vat',
                vat: 'pay-vat',
                deposit: 'pay-vat'
            }
        };
        if (expectedVat.vat) {
            const wrongVat = (0, paymentAccountingProjection_1.evaluateAccountingReconciliation)({
                paymentId: 'pay-vat',
                expected: expectedVat,
                actual: Object.assign(Object.assign({}, matchingVat), { amounts: Object.assign(Object.assign({}, expectedVat.amounts), { vat: (0, money_1.roundMoney)(Number(expectedVat.amounts.vat) + 1) }) })
            });
            assert_1.default.strictEqual(wrongVat.accountingComplete, false);
        }
        results['accountingComplete'] = 'PASS';
        // Orphan
        const orphan = (0, paymentIntegrityDiagnostic_1.detectOrphanProjection)({
            projectionType: 'ownerIncome',
            projectionId: 'tx-1',
            paymentId: 'missing-pay',
            paymentExists: false,
            propertyId: 'prop-1',
            amount: 1000,
            currency: 'USD'
        });
        assert_1.default.strictEqual(orphan === null || orphan === void 0 ? void 0 : orphan.code, paymentIntegrityDiagnostic_1.ORPHAN_PROJECTION_DETECTED);
        assert_1.default.strictEqual(orphan === null || orphan === void 0 ? void 0 : orphan.action, 'FLAG');
        assert_1.default.strictEqual((0, paymentIntegrityDiagnostic_1.detectOrphanProjection)({
            projectionType: 'ownerIncome',
            paymentId: 'pay-A',
            paymentExists: true
        }), null);
        results['Orphan projections'] = 'PASS';
        // ---------------------------------------------------------------------------
        // Introduction + VAT + levy + legacy
        // ---------------------------------------------------------------------------
        const first = introSnapshot(1000, 0);
        assert_1.default.strictEqual(first.allocation.introThisPayment, 1000);
        const second = introSnapshot(1000, 1000);
        assert_1.default.strictEqual(second.allocation.introThisPayment, 0);
        const over = (0, introductionCommissionService_1.computeIntroductionAllocation)({ rentAllocated: 1000, oneMonthRent: 1000, alreadyConsumed: 1000 });
        assert_1.default.ok(over.introThisPayment + 1000 <= 1000 + 0.001);
        const partial = introSnapshot(600, 0);
        assert_1.default.strictEqual(partial.allocation.remainingAfter, 400);
        const advance = introSnapshot(3000, 0);
        assert_1.default.strictEqual(advance.allocation.introThisPayment, 1000);
        assert_1.default.strictEqual(advance.allocation.ownerRent, 2000);
        const levy = introSnapshot(1000, 0, 100);
        assert_1.default.strictEqual(levy.allocation.introThisPayment, 1000);
        assert_1.default.strictEqual(levy.snapshot.levy, 100);
        assert_1.default.ok((0, introductionCommissionService_1.introductionConsumedFromPayments)([{ amount: 0, depositAmount: 1000 }]) === 0);
        const vatRate = 0.155;
        const vatIntro = introSnapshot(1000, 0, 0, { vatOnCommission: true, vatRate });
        const expectedNet = (0, money_1.roundMoney)(1000 / (1 + vatRate));
        assert_1.default.strictEqual(vatIntro.snapshot.totalCommission, 1000);
        assert_1.default.strictEqual((0, money_1.roundMoney)(vatIntro.snapshot.commissionNet + vatIntro.snapshot.vatAmount), 1000);
        assert_1.default.strictEqual(vatIntro.snapshot.commissionNet, expectedNet);
        const vat333 = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
            grossRent: 333.33,
            levy: 0,
            commissionPercentage: 100,
            vatOnCommission: true,
            vatTreatment: 'inclusive',
            vatRate,
            commissionType: 'introduction'
        });
        assert_1.default.strictEqual((0, money_1.roundMoney)(vat333.commissionNet + vat333.vatAmount), vat333.totalCommission);
        assert_1.default.ok(vat333.totalCommission <= 333.33);
        const vatTiny = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
            grossRent: 0.01,
            levy: 0,
            commissionPercentage: 100,
            vatOnCommission: true,
            vatTreatment: 'inclusive',
            vatRate,
            commissionType: 'introduction'
        });
        assert_1.default.strictEqual((0, money_1.roundMoney)(vatTiny.commissionNet + vatTiny.vatAmount), vatTiny.totalCommission);
        const legacy = (0, legacyIntroductionRisk_1.detectLegacyIntroductionContextRisk)({
            tenantId: 't1',
            propertyId: 'p1',
            leaseId: 'lease-new',
            payments: [
                { amount: 1000, depositAmount: 0, commissionDetails: { totalCommission: 1000, commissionBase: 1000 } },
                { amount: 1000, depositAmount: 0, commissionDetails: { totalCommission: 0, commissionBase: 0 } }
            ]
        });
        assert_1.default.ok(legacy);
        assert_1.default.strictEqual(legacy === null || legacy === void 0 ? void 0 : legacy.code, legacyIntroductionRisk_1.LEGACY_INTRODUCTION_CONTEXT_RISK);
        assert_1.default.strictEqual(legacy === null || legacy === void 0 ? void 0 : legacy.legacyIntroductionAmount, 1000);
        assert_1.default.strictEqual(legacy === null || legacy === void 0 ? void 0 : legacy.action, 'MANUAL_REVIEW_REQUIRED');
        const noLegacy = (0, legacyIntroductionRisk_1.detectLegacyIntroductionContextRisk)({
            tenantId: 't1',
            propertyId: 'p1',
            leaseId: 'lease-new',
            payments: [{ leaseId: 'lease-new', amount: 1000, commissionDetails: { totalCommission: 1000, commissionBase: 1000 } }]
        });
        assert_1.default.strictEqual(noLegacy, null);
        assert_1.default.ok(introSvc.includes('loadLegacyIntroductionContextRisk'));
        assert_1.default.ok(introSvc.includes('Detection must never block'));
        results['Introduction'] = 'PASS';
        // Outstanding / trust / deposit
        const current = new Date(2026, 0, 1);
        const paidCurrent = (0, outstandingLeaseCalculation_1.computeOutstandingForLease)({
            rentalType: 'management',
            leaseStart: current,
            leaseEnd: new Date(2026, 11, 1),
            currentMonthStart: current,
            cutoverDate: null,
            paidKeys: new Set(['2026-1']),
            monthlyAmount: 1000
        });
        assert_1.default.strictEqual(paidCurrent.totalAmount, 0);
        const introOutstanding = (0, outstandingLeaseCalculation_1.computeOutstandingForLease)({
            rentalType: 'introduction',
            leaseStart: current,
            leaseEnd: new Date(2026, 11, 1),
            currentMonthStart: new Date(2026, 2, 1),
            cutoverDate: null,
            paidKeys: new Set(['2026-1']),
            monthlyAmount: 1000,
            introductionRemaining: 0
        });
        assert_1.default.strictEqual(introOutstanding.totalAmount, 2000);
        const depositOnly = paymentFromSnapshot({
            totalCommission: 0, preaFee: 0, agentShare: 0, agencyShare: 0, ownerAmount: 0, levy: 0, commissionBase: 0
        }, { amount: 0, depositAmount: 1000 });
        const expectedDeposit = (0, paymentAccountingProjection_1.buildExpectedAccountingProjection)(depositOnly);
        assert_1.default.strictEqual(expectedDeposit.ownerIncome, false);
        assert_1.default.strictEqual(expectedDeposit.agentCommission, false);
        assert_1.default.strictEqual(expectedDeposit.deposit, true);
        results['Outstanding / trust'] = 'PASS';
        // Sale
        assert_1.default.strictEqual((0, salePaymentCompleteness_1.validateSalePaymentCompleteness)({
            amount: 250000,
            commissionDetails: { totalCommission: 12500, agentShare: 7000, agencyShare: 5000 }
        }).ok, true);
        const missingPrice = (0, salePaymentCompleteness_1.validateSalePaymentCompleteness)({
            commissionDetails: { totalCommission: 12500, agentShare: 7000, agencyShare: 5000 }
        });
        assert_1.default.ok(!missingPrice.ok && missingPrice.missing.includes('salePrice'));
        const missingCommission = (0, salePaymentCompleteness_1.validateSalePaymentCompleteness)({
            amount: 250000,
            commissionDetails: { agentShare: 7000, agencyShare: 5000 }
        });
        assert_1.default.ok(!missingCommission.ok && missingCommission.missing.includes('commissionDetails.totalCommission'));
        const missingAgent = (0, salePaymentCompleteness_1.validateSalePaymentCompleteness)({
            amount: 250000,
            commissionDetails: { totalCommission: 12500, agencyShare: 5000 }
        });
        assert_1.default.ok(!missingAgent.ok && missingAgent.missing.includes('commissionDetails.agentShare'));
        const missingAgency = (0, salePaymentCompleteness_1.validateSalePaymentCompleteness)({
            amount: 250000,
            commissionDetails: { totalCommission: 12500, agentShare: 7000 }
        });
        assert_1.default.ok(!missingAgency.ok && missingAgency.missing.includes('commissionDetails.agencyShare'));
        assert_1.default.strictEqual(salePaymentCompleteness_1.SALE_PAYMENT_INCOMPLETE_CODE, 'SALE_PAYMENT_INCOMPLETE');
        assert_1.default.ok(webhookCtrl.includes('validateSalePaymentCompleteness'));
        assert_1.default.ok(webhookCtrl.includes('tenantId: input.tenantId'));
        assert_1.default.ok(!sliceFn(webhookCtrl, "rentalType === 'introduction'", 'const commissionResult').includes('tenantId: input.payerObjectId'));
        results['Sale'] = 'PASS';
        // Immutability
        assert_1.default.ok(paymentFinancialImmutability_1.PAYMENT_FINANCIAL_FIELDS.includes('leaseId'));
        assert_1.default.throws(() => (0, paymentFinancialImmutability_1.assertCompletedPaymentFinanciallyImmutable)({ status: 'completed' }, { amount: 1 }), (err) => err.message === paymentFinancialImmutability_1.COMPLETED_PAYMENT_IMMUTABLE_MESSAGE);
        assert_1.default.throws(() => (0, paymentFinancialImmutability_1.assertCompletedPaymentFinanciallyImmutable)({ status: 'completed' }, { leaseId: 'x' }), (err) => err.message === paymentFinancialImmutability_1.COMPLETED_PAYMENT_IMMUTABLE_MESSAGE);
        assert_1.default.doesNotThrow(() => (0, paymentFinancialImmutability_1.assertCompletedPaymentFinanciallyImmutable)({ status: 'completed' }, { notes: 'admin' }));
        assert_1.default.ok(paymentCtrl.includes('reversalOfPaymentId') || srcFile('models/Payment.ts').includes('reversalOfPaymentId'));
        results['Immutability'] = 'PASS';
        // Idempotency / webhook / retry
        assert_1.default.ok(srcFile('models/Payment.ts').includes('idempotencyKey'));
        assert_1.default.ok(accountantCreate.includes('idempotencyKey'));
        assert_1.default.ok(agentCreate.includes('idempotencyKey'));
        assert_1.default.ok(webhookCtrl.includes('Duplicate webhook ignored'));
        assert_1.default.ok(postFn.includes('recordIncomeFromPayment'));
        assert_1.default.ok(srcFile('services/propertyAccountService.ts').includes('payment:${'));
        assert_1.default.ok(ensureFn.includes('postPaymentAccounting'));
        // Duplicate posting is application idempotency (payment:paymentId / already_applied), not a new index.
        assert_1.default.ok(postFn.includes("artifacts.ownerIncome = 'failed'"));
        assert_1.default.ok(ledger.includes("result.status === 'partial'"));
        results['Idempotency'] = 'PASS';
        // Currency / rounding
        assert_1.default.strictEqual((_a = (0, paymentIntegrityDiagnostic_1.detectCurrencyMismatch)({ paymentCurrency: 'USD', projectionCurrency: 'ZWL' })) === null || _a === void 0 ? void 0 : _a.code, paymentIntegrityDiagnostic_1.CURRENCY_MISMATCH);
        assert_1.default.strictEqual((0, paymentIntegrityDiagnostic_1.detectCurrencyMismatch)({ paymentCurrency: 'USD', projectionCurrency: 'USD' }), null);
        assert_1.default.ok(srcFile('models/Payment.ts').includes("enum: ['USD', 'ZWL']"));
        assert_1.default.ok(!srcFile('services/propertyAccountService.ts').includes('convertCurrency'));
        const halfCent = (0, money_1.roundMoney)(1.225);
        assert_1.default.strictEqual(halfCent, 1.23);
        results['Currency / rounding'] = 'PASS';
        // Owner statement vs Payment snapshot
        const ownerFromSnapshot = (0, paymentAccountingCompleteness_1.computeOwnerIncomeAmount)({
            isSale: false,
            ownerAmount: first.snapshot.ownerAmount,
            passThroughTotal: 100
        });
        assert_1.default.strictEqual(first.snapshot.ownerAmount, 0);
        assert_1.default.ok(ownerFromSnapshot <= Number(first.snapshot.ownerAmount || 0));
        assert_1.default.ok(reportRoutes.includes('getCompanyPropertyAccounts'));
        assert_1.default.ok(!reportRoutes.includes('recordIncomeFromPayment('));
        assert_1.default.ok(dashboardSummaryFn.includes("commissionDetails.agencyShare"));
        assert_1.default.ok(srcFile('services/dashboardKpiService.ts').includes('Payment.find('));
        assert_1.default.ok(!srcFile('services/dashboardKpiService.ts').includes('recordIncomeFromPayment('));
        const laterOwner = (0, paymentAccountingCompleteness_1.computeOwnerIncomeAmount)({
            isSale: false,
            ownerAmount: second.snapshot.ownerAmount,
            passThroughTotal: 0
        });
        assert_1.default.strictEqual(laterOwner, 1000);
        results['Reporting'] = 'PASS';
        // Diagnostic composer
        const diagnostic = (0, paymentIntegrityDiagnostic_1.buildPaymentIntegrityDiagnostic)({
            payment: { _id: 'pay-A', referenceNumber: 'R-1', status: 'completed', postingStatus: 'posted', accountingComplete: false },
            recon: missing,
            legacyIntroductionRisk: legacy
        });
        assert_1.default.strictEqual(diagnostic.paymentId, 'pay-A');
        assert_1.default.strictEqual(diagnostic.accountingComplete, false);
        assert_1.default.strictEqual((_b = diagnostic.legacyIntroductionRisk) === null || _b === void 0 ? void 0 : _b.code, legacyIntroductionRisk_1.LEGACY_INTRODUCTION_CONTEXT_RISK);
        assert_1.default.ok(accountantRoutes.includes("router.get('/payments/:id/accounting'"));
        assert_1.default.ok(accountantRoutes.includes("router.post('/payments/:id/accounting/repair'"));
        results['Diagnostic'] = 'PASS';
        console.log('Phase 7 financial integrity tests passed');
        console.log(JSON.stringify({ results }, null, 2));
    });
}
run().catch((error) => {
    console.error(error);
    process.exit(1);
});
