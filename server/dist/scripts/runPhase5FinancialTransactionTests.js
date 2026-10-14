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
const commissionProjection_1 = require("../services/commissionProjection");
const salePaymentCompleteness_1 = require("../services/salePaymentCompleteness");
const introductionCommissionService_1 = require("../services/introductionCommissionService");
const outstandingLeaseCalculation_1 = require("../services/outstandingLeaseCalculation");
const paymentFinancialImmutability_1 = require("../services/paymentFinancialImmutability");
function srcFile(rel) {
    return fs_1.default.readFileSync(path_1.default.join(__dirname, '..', '..', 'src', rel), 'utf8');
}
function sliceFn(src, startToken, endToken) {
    const start = src.indexOf(startToken);
    const end = src.indexOf(endToken, start + startToken.length);
    assert_1.default.ok(start >= 0 && end > start, `expected ${startToken} before ${endToken}`);
    return src.slice(start, end);
}
function introSnapshot(rentAllocated, alreadyConsumed, levyAllocated = 0, oneMonthRent = 1000) {
    const allocation = (0, introductionCommissionService_1.computeIntroductionAllocation)({
        rentAllocated,
        levyAllocated,
        oneMonthRent,
        alreadyConsumed
    });
    const calculated = (0, introductionCommissionService_1.snapshotFromIntroductionAllocation)(allocation, {
        vatOnCommission: false,
        preaPercentOfTotal: 0.03,
        agentPercentOfRemaining: 0.6,
        agencyPercentOfRemaining: 0.4
    });
    const snapshot = (0, introductionCommissionService_1.applyIntroductionOwnerRemainder)(calculated, allocation);
    return { allocation, snapshot, result: calculated };
}
function paymentFromIntro(snapshot, extras) {
    var _a, _b;
    return Object.assign({ _id: 'pay-phase5', status: 'completed', paymentType: 'rental', amount: Number((_a = extras === null || extras === void 0 ? void 0 : extras.amount) !== null && _a !== void 0 ? _a : snapshot.commissionBase), depositAmount: Number((_b = extras === null || extras === void 0 ? void 0 : extras.depositAmount) !== null && _b !== void 0 ? _b : 0), levyAllocated: snapshot.levy || 0, isProvisional: false, isInSuspense: false, commissionDetails: snapshot, agentId: 'agent-1', vatAmount: 0 }, extras);
}
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const paymentCtrl = srcFile('controllers/paymentController.ts');
        const agentCtrl = srcFile('controllers/agentController.ts');
        const webhookCtrl = srcFile('controllers/paymentWebhookController.ts');
        const orchestrator = srcFile('services/paymentAccountingOrchestrator.ts');
        const recon = srcFile('services/paymentAccountingReconciliation.ts');
        const accountantRoutes = srcFile('routes/accountantRoutes.ts');
        const webhookRoutes = srcFile('routes/webhookRoutes.ts');
        const kpiSrc = srcFile('services/dashboardKpiService.ts');
        const salesCreate = sliceFn(paymentCtrl, 'export const createSalesPaymentAccountant = async', 'export const updatePayment = async');
        const updatePayment = sliceFn(paymentCtrl, 'export const updatePayment = async', 'export const getCompanyPayments');
        const accountantCreate = sliceFn(paymentCtrl, 'export const createPaymentAccountant = async', 'export const createSalesPaymentAccountant');
        const leaseCreate = sliceFn(paymentCtrl, 'export const createPayment = async', 'export const createPaymentAccountant');
        const publicCreate = sliceFn(paymentCtrl, 'export const createPaymentPublic = async', 'export const getPaymentReceiptDownload');
        const finalizeFn = sliceFn(paymentCtrl, 'export const finalizeProvisionalPayment = async', 'export const getCombinedRemaining');
        const agentCreate = sliceFn(agentCtrl, 'export const createAgentPayment = async', 'export const updateAgentPayment = async');
        const agentUpdate = sliceFn(agentCtrl, 'export const updateAgentPayment = async', 'export const getAgentPayments');
        const postFn = sliceFn(orchestrator, 'export async function postPaymentAccounting', 'export async function reversePaymentAccounting');
        const results = {};
        // ---------------------------------------------------------------------------
        // TEST GROUP 1 — sale completeness
        // ---------------------------------------------------------------------------
        const completeSale = (0, salePaymentCompleteness_1.validateSalePaymentCompleteness)({
            amount: 250000,
            commissionDetails: {
                totalCommission: 12500,
                agentShare: 7275,
                agencyShare: 4850,
                preaFee: 375
            }
        });
        assert_1.default.strictEqual(completeSale.ok, true, 'complete sale is accepted');
        const missingPrice = (0, salePaymentCompleteness_1.validateSalePaymentCompleteness)({
            commissionDetails: { totalCommission: 12500, agentShare: 7275, agencyShare: 4850 }
        });
        assert_1.default.strictEqual(missingPrice.ok, false);
        assert_1.default.ok(missingPrice.missing.includes('salePrice'));
        const missingCommission = (0, salePaymentCompleteness_1.validateSalePaymentCompleteness)({
            amount: 250000,
            commissionDetails: { agentShare: 7275, agencyShare: 4850 }
        });
        assert_1.default.strictEqual(missingCommission.ok, false);
        assert_1.default.ok(missingCommission.missing.includes('commissionDetails.totalCommission'));
        const missingAgent = (0, salePaymentCompleteness_1.validateSalePaymentCompleteness)({
            amount: 250000,
            commissionDetails: { totalCommission: 12500, agencyShare: 4850 }
        });
        assert_1.default.strictEqual(missingAgent.ok, false);
        assert_1.default.ok(missingAgent.missing.includes('commissionDetails.agentShare'));
        const missingAgency = (0, salePaymentCompleteness_1.validateSalePaymentCompleteness)({
            amount: 250000,
            commissionDetails: { totalCommission: 12500, agentShare: 7275 }
        });
        assert_1.default.strictEqual(missingAgency.ok, false);
        assert_1.default.ok(missingAgency.missing.includes('commissionDetails.agencyShare'));
        const multipleMissing = (0, salePaymentCompleteness_1.validateSalePaymentCompleteness)({
            amount: 0,
            commissionDetails: {}
        });
        assert_1.default.strictEqual(multipleMissing.ok, false);
        assert_1.default.ok(multipleMissing.missing.includes('salePrice'));
        assert_1.default.ok(multipleMissing.missing.includes('commissionDetails.totalCommission'));
        assert_1.default.ok(multipleMissing.missing.includes('commissionDetails.agentShare'));
        assert_1.default.ok(multipleMissing.missing.includes('commissionDetails.agencyShare'));
        assert_1.default.ok(multipleMissing.missing.length >= 4, 'lists ALL missing fields');
        const errorBody = (0, salePaymentCompleteness_1.salePaymentIncompleteResponse)(multipleMissing.missing);
        assert_1.default.strictEqual(errorBody.code, salePaymentCompleteness_1.SALE_PAYMENT_INCOMPLETE_CODE);
        assert_1.default.strictEqual(errorBody.success, false);
        assert_1.default.deepStrictEqual(errorBody.missing, multipleMissing.missing);
        assert_1.default.ok(salesCreate.includes('validateSalePaymentCompleteness'));
        assert_1.default.ok(salesCreate.includes('salePaymentIncompleteResponse'));
        assert_1.default.ok(accountantRoutes.includes("router.post('/sales-payments'"));
        assert_1.default.ok(updatePayment.includes('validateSalePaymentCompleteness'));
        assert_1.default.ok(agentCreate.includes('validateSalePaymentCompleteness'));
        results['Sale completeness'] = 'PASS';
        // ---------------------------------------------------------------------------
        // TEST GROUP 2 — sale webhook reject / retry / duplicate
        // ---------------------------------------------------------------------------
        assert_1.default.strictEqual((0, salePaymentCompleteness_1.classifyPropertyFinancialKind)('sale'), 'sale');
        assert_1.default.strictEqual((0, salePaymentCompleteness_1.classifyPropertyFinancialKind)('management'), 'rental');
        assert_1.default.strictEqual((0, salePaymentCompleteness_1.classifyPropertyFinancialKind)('introduction'), 'rental');
        assert_1.default.strictEqual((0, salePaymentCompleteness_1.classifyPropertyFinancialKind)(''), 'unknown');
        assert_1.default.strictEqual((0, salePaymentCompleteness_1.classifyPropertyFinancialKind)('warehouse'), 'unknown');
        assert_1.default.ok(webhookCtrl.includes('classifyPropertyFinancialKind'));
        assert_1.default.ok(webhookCtrl.includes('validateSalePaymentCompleteness'));
        assert_1.default.ok(webhookCtrl.includes("status: 'failed'"));
        assert_1.default.ok(webhookCtrl.includes("existingEvent?.status === 'processed'"));
        assert_1.default.ok(!webhookCtrl.includes('zeroWebhookCommissionDetails'));
        assert_1.default.ok(webhookRoutes.includes("router.post('/payment-confirmation'"));
        const incompleteSaleWebhook = (0, salePaymentCompleteness_1.validateSalePaymentCompleteness)({
            amount: 0,
            commissionDetails: { totalCommission: 0, agentShare: 0, agencyShare: 0 }
        });
        assert_1.default.strictEqual(incompleteSaleWebhook.ok, false);
        assert_1.default.ok(incompleteSaleWebhook.missing.includes('salePrice'));
        assert_1.default.ok(incompleteSaleWebhook.missing.includes('commissionDetails.totalCommission'));
        const correctedSale = (0, salePaymentCompleteness_1.validateSalePaymentCompleteness)({
            amount: 250000,
            commissionDetails: {
                totalCommission: 12500,
                agentShare: 7275,
                agencyShare: 4850
            }
        });
        assert_1.default.strictEqual(correctedSale.ok, true);
        const duplicateCorrectedStillValid = (0, salePaymentCompleteness_1.validateSalePaymentCompleteness)({
            amount: 250000,
            commissionDetails: {
                totalCommission: 12500,
                agentShare: 7275,
                agencyShare: 4850
            }
        });
        assert_1.default.strictEqual(duplicateCorrectedStillValid.ok, true);
        assert_1.default.ok(webhookCtrl.includes('Duplicate webhook ignored'));
        results['Sale webhook rejection'] = 'PASS';
        results['Sale webhook retry'] = 'PASS';
        // ---------------------------------------------------------------------------
        // TEST GROUP 3 — introduction
        // ---------------------------------------------------------------------------
        const scenarioA = introSnapshot(1000, 0, 0);
        assert_1.default.strictEqual(scenarioA.allocation.introThisPayment, 1000);
        assert_1.default.strictEqual(scenarioA.allocation.ownerRent, 0);
        assert_1.default.strictEqual(scenarioA.snapshot.totalCommission, 1000);
        assert_1.default.strictEqual(scenarioA.snapshot.commissionBase, 1000);
        assert_1.default.strictEqual(scenarioA.snapshot.ownerAmount, 0);
        assert_1.default.strictEqual(scenarioA.allocation.satisfied, true);
        results['Introduction deposit + rent'] = 'PASS';
        const scenarioB = introSnapshot(1000, 1000, 0);
        assert_1.default.strictEqual(scenarioB.allocation.introThisPayment, 0);
        assert_1.default.strictEqual(scenarioB.allocation.ownerRent, 1000);
        assert_1.default.strictEqual(scenarioB.snapshot.totalCommission, 0);
        assert_1.default.strictEqual(scenarioB.snapshot.ownerAmount, 1000);
        results['Introduction second month'] = 'PASS';
        const scenarioC = introSnapshot(3000, 0, 0);
        assert_1.default.strictEqual(scenarioC.allocation.introThisPayment, 1000);
        assert_1.default.strictEqual(scenarioC.allocation.ownerRent, 2000);
        assert_1.default.strictEqual(scenarioC.snapshot.totalCommission, 1000);
        assert_1.default.strictEqual(scenarioC.snapshot.ownerAmount, 2000);
        results['Introduction advance'] = 'PASS';
        const scenarioDRent = introSnapshot(3000, 0, 0);
        assert_1.default.strictEqual(scenarioDRent.allocation.introThisPayment, 1000);
        assert_1.default.strictEqual(scenarioDRent.allocation.ownerRent, 2000);
        const depositOnlyConsumed = (0, introductionCommissionService_1.introductionConsumedFromPayments)([
            { amount: 0, depositAmount: 1000, commissionDetails: { totalCommission: 0, commissionBase: 0 } }
        ]);
        assert_1.default.strictEqual(depositOnlyConsumed, 0, 'deposit is never consumed as introduction commission');
        const scenarioE1 = introSnapshot(600, 0);
        const scenarioE2 = introSnapshot(400, scenarioE1.allocation.introThisPayment);
        assert_1.default.strictEqual(scenarioE1.allocation.introThisPayment, 600);
        assert_1.default.strictEqual(scenarioE1.allocation.satisfied, false);
        assert_1.default.strictEqual(scenarioE2.allocation.introThisPayment, 400);
        assert_1.default.strictEqual(scenarioE2.allocation.satisfied, true);
        const scenarioE3 = introSnapshot(1000, 1000);
        assert_1.default.strictEqual(scenarioE3.snapshot.totalCommission, 0);
        assert_1.default.strictEqual(scenarioE3.snapshot.ownerAmount, 1000);
        results['Introduction partial payment'] = 'PASS';
        const scenarioF = introSnapshot(1000, 0, 100);
        assert_1.default.strictEqual(scenarioF.allocation.introThisPayment, 1000);
        assert_1.default.strictEqual(scenarioF.snapshot.levy, 100);
        assert_1.default.strictEqual(scenarioF.snapshot.totalCommission, 1000);
        assert_1.default.strictEqual(scenarioF.snapshot.ownerAmount, 100);
        results['Introduction levy'] = 'PASS';
        const duplicatePayments = [
            { amount: 1000, depositAmount: 0, commissionDetails: { totalCommission: 1000, commissionBase: 1000 } },
            { amount: 1000, depositAmount: 0, commissionDetails: { totalCommission: 1000, commissionBase: 1000 } }
        ];
        const consumedOnceFromOneDoc = (0, introductionCommissionService_1.introductionConsumedFromPayments)([duplicatePayments[0]]);
        assert_1.default.strictEqual(consumedOnceFromOneDoc, 1000);
        const secondAlloc = (0, introductionCommissionService_1.computeIntroductionAllocation)({
            rentAllocated: 1000,
            oneMonthRent: 1000,
            alreadyConsumed: consumedOnceFromOneDoc
        });
        assert_1.default.strictEqual(secondAlloc.introThisPayment, 0);
        results['Introduction idempotency'] = 'PASS';
        for (const [label, body] of [
            ['accountant', accountantCreate],
            ['lease', leaseCreate],
            ['public', publicCreate],
            ['finalize', finalizeFn],
            ['agent', agentCreate],
            ['webhook', webhookCtrl]
        ]) {
            assert_1.default.ok(body.includes('prepareIntroductionRentalCommission') || body.includes('buildIntroductionRentalCommission'), `${label} uses introduction commission-once`);
        }
        assert_1.default.ok(!accountantCreate.includes('priorCount'), 'accountant no longer uses first-payment count for introduction');
        assert_1.default.ok(!finalizeFn.includes('priorCount'), 'finalize no longer uses first-payment count for introduction');
        // ---------------------------------------------------------------------------
        // TEST GROUP 4 — outstanding balances
        // ---------------------------------------------------------------------------
        const firstMonth = new Date(2026, 0, 1);
        const currentFirstMonth = new Date(2026, 0, 1);
        const currentThirdMonth = new Date(2026, 2, 1);
        const leaseEnd = new Date(2026, 11, 1);
        const beforeIntro = (0, outstandingLeaseCalculation_1.computeOutstandingForLease)({
            rentalType: 'introduction',
            leaseStart: firstMonth,
            leaseEnd,
            currentMonthStart: currentFirstMonth,
            cutoverDate: null,
            paidKeys: new Set(),
            monthlyAmount: 1000,
            introductionRemaining: 1000,
            mode: 'rent'
        });
        assert_1.default.strictEqual(beforeIntro.totalAmount, 1000);
        assert_1.default.strictEqual(beforeIntro.missingCount, 1);
        const afterIntroSameMonth = (0, outstandingLeaseCalculation_1.computeOutstandingForLease)({
            rentalType: 'introduction',
            leaseStart: firstMonth,
            leaseEnd,
            currentMonthStart: currentFirstMonth,
            cutoverDate: null,
            paidKeys: new Set(['2026-1']),
            monthlyAmount: 1000,
            introductionRemaining: 0,
            mode: 'rent'
        });
        assert_1.default.strictEqual(afterIntroSameMonth.totalAmount, 0, 'future months are not due in the introduction month');
        const afterIntroLaterUnpaid = (0, outstandingLeaseCalculation_1.computeOutstandingForLease)({
            rentalType: 'introduction',
            leaseStart: firstMonth,
            leaseEnd,
            currentMonthStart: currentThirdMonth,
            cutoverDate: null,
            paidKeys: new Set(['2026-1']),
            monthlyAmount: 1000,
            introductionRemaining: 0,
            mode: 'rent'
        });
        assert_1.default.strictEqual(afterIntroLaterUnpaid.totalAmount, 2000, 'later unpaid months become ordinary owner rent');
        assert_1.default.ok(!afterIntroLaterUnpaid.labels[0].includes('Jan') || afterIntroLaterUnpaid.missingCount === 2);
        const advanceCovered = (0, outstandingLeaseCalculation_1.computeOutstandingForLease)({
            rentalType: 'introduction',
            leaseStart: firstMonth,
            leaseEnd,
            currentMonthStart: currentThirdMonth,
            cutoverDate: null,
            paidKeys: new Set(['2026-1', '2026-2', '2026-3']),
            monthlyAmount: 1000,
            introductionRemaining: 0,
            mode: 'rent'
        });
        assert_1.default.strictEqual(advanceCovered.totalAmount, 0);
        const levyBefore = (0, outstandingLeaseCalculation_1.computeOutstandingForLease)({
            rentalType: 'introduction',
            leaseStart: firstMonth,
            leaseEnd,
            currentMonthStart: currentFirstMonth,
            cutoverDate: null,
            paidKeys: new Set(),
            monthlyAmount: 100,
            introductionRemaining: 1000,
            mode: 'levy'
        });
        assert_1.default.strictEqual(levyBefore.totalAmount, 100);
        assert_1.default.strictEqual(levyBefore.missingCount, 1);
        const levyAfterSameMonth = (0, outstandingLeaseCalculation_1.computeOutstandingForLease)({
            rentalType: 'introduction',
            leaseStart: firstMonth,
            leaseEnd,
            currentMonthStart: currentFirstMonth,
            cutoverDate: null,
            paidKeys: new Set(['2026-1']),
            monthlyAmount: 100,
            introductionRemaining: 0,
            mode: 'levy'
        });
        assert_1.default.strictEqual(levyAfterSameMonth.totalAmount, 0);
        assert_1.default.ok(kpiSrc.includes('computeOutstandingForLease'));
        assert_1.default.ok(kpiSrc.includes('introductionRemainingByKey'));
        assert_1.default.ok(srcFile('services/outstandingLeaseCalculation.ts').includes('introductionSatisfied'));
        results['Outstanding rental'] = 'PASS';
        results['Outstanding levy'] = 'PASS';
        const managementUnchanged = (0, outstandingLeaseCalculation_1.computeOutstandingForLease)({
            rentalType: 'management',
            leaseStart: firstMonth,
            leaseEnd,
            currentMonthStart: currentThirdMonth,
            cutoverDate: null,
            paidKeys: new Set(['2026-1']),
            monthlyAmount: 1000
        });
        assert_1.default.strictEqual(managementUnchanged.totalAmount, 2000, 'management outstanding is unchanged');
        // ---------------------------------------------------------------------------
        // TEST GROUP 5 — agent update
        // ---------------------------------------------------------------------------
        assert_1.default.ok(agentUpdate.includes('calculateForProperty'));
        assert_1.default.ok(agentUpdate.includes('prepareIntroductionRentalCommission') || agentUpdate.includes('buildIntroductionRentalCommission'));
        assert_1.default.ok(agentUpdate.includes('vatOnCommission'));
        assert_1.default.ok(agentUpdate.includes('payment.save()'));
        assert_1.default.ok(agentUpdate.includes('assertCompletedPaymentFinanciallyImmutable'));
        assert_1.default.ok(!agentUpdate.includes('findByIdAndUpdate'));
        assert_1.default.throws(() => (0, paymentFinancialImmutability_1.assertCompletedPaymentFinanciallyImmutable)({ status: 'completed' }, { amount: 1200 }), (err) => err.message === paymentFinancialImmutability_1.COMPLETED_PAYMENT_IMMUTABLE_MESSAGE);
        assert_1.default.doesNotThrow(() => (0, paymentFinancialImmutability_1.assertCompletedPaymentFinanciallyImmutable)({ status: 'completed', isProvisional: true }, { amount: 1200 }));
        const recalc = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
            grossRent: 1200,
            levy: 0,
            commissionPercentage: 15,
            vatOnCommission: true,
            vatTreatment: 'exclusive',
            vatRate: 0.155
        });
        assert_1.default.strictEqual(recalc.totalCommission, 180);
        assert_1.default.strictEqual(recalc.vatAmount, 27.9);
        assert_1.default.strictEqual(recalc.ownerAmount, 992.1);
        results['Agent update'] = 'PASS';
        // ---------------------------------------------------------------------------
        // TEST GROUP 6 — accounting projection matches Payment snapshot
        // ---------------------------------------------------------------------------
        const introPay = paymentFromIntro(scenarioA.snapshot, { amount: 1000, depositAmount: 1000 });
        const expectedA = (0, paymentAccountingProjection_1.buildExpectedAccountingProjection)(introPay);
        assert_1.default.strictEqual(expectedA.amounts.agentCommission, scenarioA.snapshot.agentShare);
        assert_1.default.strictEqual(expectedA.amounts.companyCommission, scenarioA.snapshot.agencyShare);
        assert_1.default.strictEqual(expectedA.amounts.ownerIncome, scenarioA.snapshot.ownerAmount);
        const lanesA = (0, commissionProjection_1.projectCommissionLanes)(introPay);
        assert_1.default.strictEqual((_a = lanesA[0]) === null || _a === void 0 ? void 0 : _a.amount, scenarioA.snapshot.agentShare);
        const laterPay = paymentFromIntro(scenarioB.snapshot, { amount: 1000 });
        const expectedB = (0, paymentAccountingProjection_1.buildExpectedAccountingProjection)(laterPay);
        assert_1.default.strictEqual(expectedB.amounts.ownerIncome, 1000);
        assert_1.default.strictEqual(expectedB.amounts.agentCommission, 0);
        const advancePay = paymentFromIntro(scenarioC.snapshot, { amount: 3000, advanceMonthsPaid: 3 });
        const expectedC = (0, paymentAccountingProjection_1.buildExpectedAccountingProjection)(advancePay);
        assert_1.default.strictEqual(expectedC.amounts.ownerIncome, 2000);
        assert_1.default.strictEqual(expectedC.amounts.agentCommission, scenarioC.snapshot.agentShare);
        const levyPay = paymentFromIntro(scenarioF.snapshot, { amount: 1100, levyAllocated: 100 });
        const expectedF = (0, paymentAccountingProjection_1.buildExpectedAccountingProjection)(levyPay);
        assert_1.default.strictEqual(scenarioF.snapshot.ownerAmount, 100, 'levy remains on the Payment owner snapshot');
        assert_1.default.strictEqual(expectedF.amounts.ownerIncome, 0, 'levy is pass-through, not owner rental income');
        assert_1.default.ok(postFn.includes('syncCommissionForPayment'));
        assert_1.default.ok(!postFn.includes('calculateForProperty'));
        assert_1.default.ok(!postFn.includes('buildIntroductionRentalCommission'));
        assert_1.default.ok(recon.includes('ensurePaymentAccountingPosted'));
        assert_1.default.ok(accountantCreate.includes('ensurePaymentAccountingPosted') || paymentCtrl.includes('ensurePaymentAccountingPosted'));
        results['Accounting projection'] = 'PASS';
        // ---------------------------------------------------------------------------
        // Architecture / webhook / routes
        // ---------------------------------------------------------------------------
        assert_1.default.strictEqual((0, salePaymentCompleteness_1.classifyPropertyFinancialKind)('sale'), 'sale');
        assert_1.default.ok(salesCreate.includes('status: \'completed\'') || salesCreate.includes("status: 'completed'"));
        results['Phase 5 financial transaction tests'] = 'PASS';
        console.log('Phase 5 financial transaction tests passed');
        console.log(JSON.stringify({
            salePriceField: 'Payment.amount',
            commissionField: 'commissionDetails.totalCommission',
            requiredSplits: ['commissionDetails.agentShare', 'commissionDetails.agencyShare'],
            introductionFirstMonth: {
                commission: scenarioA.snapshot.totalCommission,
                owner: scenarioA.snapshot.ownerAmount
            },
            introductionSecondMonth: {
                commission: scenarioB.snapshot.totalCommission,
                owner: scenarioB.snapshot.ownerAmount
            },
            introductionAdvance: {
                commission: scenarioC.snapshot.totalCommission,
                owner: scenarioC.snapshot.ownerAmount
            },
            results
        }, null, 2));
    });
}
run().catch((error) => {
    console.error(error);
    process.exit(1);
});
