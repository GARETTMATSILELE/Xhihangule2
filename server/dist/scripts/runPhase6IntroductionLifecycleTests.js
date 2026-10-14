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
const introductionLeaseContext_1 = require("../services/introductionLeaseContext");
const outstandingLeaseCalculation_1 = require("../services/outstandingLeaseCalculation");
const salePaymentCompleteness_1 = require("../services/salePaymentCompleteness");
function srcFile(rel) {
    return fs_1.default.readFileSync(path_1.default.join(__dirname, '..', '..', 'src', rel), 'utf8');
}
function sliceFn(src, startToken, endToken) {
    const start = src.indexOf(startToken);
    const end = src.indexOf(endToken, start + startToken.length);
    assert_1.default.ok(start >= 0 && end > start, `expected ${startToken} before ${endToken}`);
    return src.slice(start, end);
}
function introSnapshot(rentAllocated, alreadyConsumed, levyAllocated = 0, oneMonthRent = 1000, vat) {
    const allocation = (0, introductionCommissionService_1.computeIntroductionAllocation)({
        rentAllocated,
        levyAllocated,
        oneMonthRent,
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
    const snapshot = (0, introductionCommissionService_1.applyIntroductionOwnerRemainder)(calculated, allocation);
    return { allocation, snapshot, result: calculated };
}
function paymentFromIntro(snapshot, extras) {
    var _a, _b;
    return Object.assign({ _id: 'pay-phase6', status: 'completed', paymentType: 'rental', amount: Number((_a = extras === null || extras === void 0 ? void 0 : extras.amount) !== null && _a !== void 0 ? _a : snapshot.commissionBase), depositAmount: Number((_b = extras === null || extras === void 0 ? void 0 : extras.depositAmount) !== null && _b !== void 0 ? _b : 0), levyAllocated: snapshot.levy || 0, isProvisional: false, isInSuspense: false, commissionDetails: snapshot, agentId: 'agent-1', vatAmount: 0 }, extras);
}
function usesCanonicalIntro(body) {
    return body.includes('prepareIntroductionRentalCommission');
}
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        const results = {};
        const introSvc = srcFile('services/introductionCommissionService.ts');
        const leaseCtx = srcFile('services/introductionLeaseContext.ts');
        const calculator = srcFile('services/propertyCommissionCalculator.ts');
        const paymentCtrl = srcFile('controllers/paymentController.ts');
        const agentCtrl = srcFile('controllers/agentController.ts');
        const webhookCtrl = srcFile('controllers/paymentWebhookController.ts');
        const kpiSrc = srcFile('services/dashboardKpiService.ts');
        const orchestrator = srcFile('services/paymentAccountingOrchestrator.ts');
        const recon = srcFile('services/paymentAccountingReconciliation.ts');
        const projection = srcFile('services/paymentAccountingProjection.ts');
        const scheduled = srcFile('services/scheduledSyncService.ts');
        const accountantCreate = sliceFn(paymentCtrl, 'export const createPaymentAccountant = async', 'export const createSalesPaymentAccountant');
        const leaseCreate = sliceFn(paymentCtrl, 'export const createPayment = async', 'export const createPaymentAccountant');
        const publicCreate = sliceFn(paymentCtrl, 'export const createPaymentPublic = async', 'export const getPaymentReceiptDownload');
        const finalizeFn = sliceFn(paymentCtrl, 'export const finalizeProvisionalPayment = async', 'export const getCombinedRemaining');
        const agentCreate = sliceFn(agentCtrl, 'export const createAgentPayment = async', 'export const updateAgentPayment = async');
        const agentUpdate = sliceFn(agentCtrl, 'export const updateAgentPayment = async', 'export const getAgentPayments');
        const postFn = sliceFn(orchestrator, 'export async function postPaymentAccounting', 'export async function reversePaymentAccounting');
        const ensureFn = sliceFn(recon, 'export async function ensurePaymentAccountingPosted', 'export async function refreshPaymentAccountingStatus');
        const webhookIntro = sliceFn(webhookCtrl, "rentalType === 'introduction'", 'const commissionResult = await CommissionService.calculateForProperty');
        // ---------------------------------------------------------------------------
        // Context / identity
        // ---------------------------------------------------------------------------
        assert_1.default.ok(leaseCtx.includes('tenantId + property + lease') || leaseCtx.includes('tenant + property + lease'));
        assert_1.default.ok(leaseCtx.includes(introductionLeaseContext_1.INTRODUCTION_LEASE_REQUIRED));
        assert_1.default.ok(leaseCtx.includes(introductionLeaseContext_1.INTRODUCTION_CONTEXT_INCOMPLETE));
        assert_1.default.ok(leaseCtx.includes(introductionLeaseContext_1.INTRODUCTION_CONTEXT_MISMATCH));
        assert_1.default.ok(leaseCtx.includes(introductionLeaseContext_1.INTRODUCTION_LEASE_NOT_APPLICABLE));
        assert_1.default.ok(leaseCtx.includes("missing.push('tenantId')"));
        assert_1.default.ok(leaseCtx.includes("missing.push('propertyId')"));
        assert_1.default.ok(leaseCtx.includes("mismatches.push('tenantId')"));
        assert_1.default.ok(leaseCtx.includes("mismatches.push('propertyId')"));
        assert_1.default.ok(leaseCtx.includes('candidates.length === 1'));
        assert_1.default.ok(!leaseCtx.includes('candidates[0]') || leaseCtx.includes('candidates.length === 1'));
        assert_1.default.ok(leaseCtx.includes('Do not use payerId') || leaseCtx.includes('payerId as the Introduction'));
        assert_1.default.ok(!leaseCtx.includes('tenantId: input.payerId'));
        assert_1.default.ok(!introSvc.includes('payerId'));
        assert_1.default.ok(introSvc.includes('leaseId: new mongoose.Types.ObjectId(String(input.leaseId))'));
        assert_1.default.strictEqual((0, introductionLeaseContext_1.introductionTargetFromLease)({ rentAmount: 1000 }, { rent: 900 }), 1000);
        assert_1.default.strictEqual((0, introductionLeaseContext_1.introductionTargetFromLease)({ monthlyRent: 1000 }, { rent: 900 }), 1000);
        assert_1.default.strictEqual((0, introductionLeaseContext_1.introductionTargetFromLease)({}, { rent: 1000 }), 1000);
        assert_1.default.strictEqual((0, introductionLeaseContext_1.introductionTargetFromLease)({ depositAmount: 2000, levy: 100 }, { rent: 1000 }), 1000);
        results['Introduction context codes'] = 'PASS';
        for (const [label, body] of [
            ['accountant', accountantCreate],
            ['lease', leaseCreate],
            ['public', publicCreate],
            ['finalize', finalizeFn],
            ['agent create', agentCreate],
            ['agent update', agentUpdate],
            ['webhook', webhookCtrl]
        ]) {
            assert_1.default.ok(usesCanonicalIntro(body), `${label} uses prepareIntroductionRentalCommission`);
        }
        assert_1.default.ok(!webhookIntro.includes('tenantId: input.payerObjectId'), 'webhook Introduction does not use payerId as tenant identity');
        assert_1.default.ok(webhookIntro.includes('tenantId: input.tenantId'));
        assert_1.default.ok(webhookIntro.includes('leaseId: input.leaseId'));
        results['Live Introduction paths'] = 'PASS';
        // ---------------------------------------------------------------------------
        // Lifecycle — VAT off, $1,000 rent
        // ---------------------------------------------------------------------------
        const first = introSnapshot(1000, 0);
        assert_1.default.strictEqual(first.allocation.introThisPayment, 1000);
        assert_1.default.strictEqual(first.allocation.ownerRent, 0);
        assert_1.default.strictEqual(first.snapshot.totalCommission, 1000);
        assert_1.default.strictEqual(first.snapshot.ownerAmount, 0);
        assert_1.default.strictEqual(first.snapshot.vatAmount, 0);
        const second = introSnapshot(1000, 1000);
        assert_1.default.strictEqual(second.allocation.introThisPayment, 0);
        assert_1.default.strictEqual(second.allocation.ownerRent, 1000);
        assert_1.default.strictEqual(second.snapshot.totalCommission, 0);
        assert_1.default.strictEqual(second.snapshot.ownerAmount, 1000);
        const third = introSnapshot(1000, 1000);
        assert_1.default.strictEqual(third.snapshot.totalCommission, 0);
        assert_1.default.strictEqual(third.snapshot.ownerAmount, 1000);
        const advance = introSnapshot(3000, 0);
        assert_1.default.strictEqual(advance.allocation.introThisPayment, 1000);
        assert_1.default.strictEqual(advance.allocation.ownerRent, 2000);
        assert_1.default.strictEqual(advance.snapshot.totalCommission, 1000);
        assert_1.default.strictEqual(advance.snapshot.ownerAmount, 2000);
        const depositOnlyConsumed = (0, introductionCommissionService_1.introductionConsumedFromPayments)([
            { amount: 0, depositAmount: 1000, commissionDetails: { totalCommission: 0, commissionBase: 0 } }
        ]);
        assert_1.default.strictEqual(depositOnlyConsumed, 0);
        const depositPlusRent = introSnapshot(1000, 0);
        assert_1.default.strictEqual(depositPlusRent.allocation.introThisPayment, 1000);
        assert_1.default.strictEqual(depositPlusRent.allocation.ownerRent, 0);
        const depositPlusAdvance = introSnapshot(3000, 0);
        assert_1.default.strictEqual(depositPlusAdvance.allocation.introThisPayment, 1000);
        assert_1.default.strictEqual(depositPlusAdvance.allocation.ownerRent, 2000);
        const partial1 = introSnapshot(600, 0);
        const partial2 = introSnapshot(400, 600);
        const afterPartial = introSnapshot(1000, 1000);
        assert_1.default.strictEqual(partial1.allocation.introThisPayment, 600);
        assert_1.default.strictEqual(partial1.allocation.remainingAfter, 400);
        assert_1.default.strictEqual(partial1.allocation.ownerRent, 0);
        assert_1.default.strictEqual(partial2.allocation.introThisPayment, 400);
        assert_1.default.strictEqual(partial2.allocation.remainingAfter, 0);
        assert_1.default.strictEqual(afterPartial.allocation.introThisPayment, 0);
        assert_1.default.strictEqual(afterPartial.allocation.ownerRent, 1000);
        const levyFirst = introSnapshot(1000, 0, 100);
        assert_1.default.strictEqual(levyFirst.allocation.introThisPayment, 1000);
        assert_1.default.strictEqual(levyFirst.snapshot.levy, 100);
        assert_1.default.strictEqual(levyFirst.snapshot.ownerAmount, 100);
        assert_1.default.ok((0, introductionCommissionService_1.introductionAllocationReconciles)({
            amount: 1100,
            introThisPayment: 1000,
            ownerRent: 0,
            levyAllocated: 100
        }));
        const levyAfter = introSnapshot(1000, 1000, 100);
        assert_1.default.strictEqual(levyAfter.allocation.introThisPayment, 0);
        assert_1.default.strictEqual(levyAfter.allocation.ownerRent, 1000);
        assert_1.default.strictEqual(levyAfter.snapshot.ownerAmount, 1100);
        assert_1.default.ok((0, introductionCommissionService_1.introductionAllocationReconciles)({
            amount: 1000,
            introThisPayment: 1000,
            ownerRent: 0,
            levyAllocated: 0
        }));
        assert_1.default.ok((0, introductionCommissionService_1.introductionAllocationReconciles)({
            amount: 3000,
            introThisPayment: 1000,
            ownerRent: 2000,
            levyAllocated: 0
        }));
        results['Introduction lifecycle VAT off'] = 'PASS';
        // ---------------------------------------------------------------------------
        // VAT inclusive — extract, do not add on top
        // ---------------------------------------------------------------------------
        const vatRate = 0.155;
        const expectedNet = (0, money_1.roundMoney)(1000 / (1 + vatRate));
        const expectedVat = (0, money_1.roundMoney)(1000 - expectedNet);
        const vatFirst = introSnapshot(1000, 0, 0, 1000, { vatOnCommission: true, vatRate });
        assert_1.default.strictEqual(vatFirst.snapshot.totalCommission, 1000, 'gross Introduction remains one month rent');
        assert_1.default.notStrictEqual(vatFirst.snapshot.totalCommission, (0, money_1.roundMoney)(1000 * (1 + vatRate)));
        assert_1.default.strictEqual(vatFirst.snapshot.commissionNet, expectedNet);
        assert_1.default.strictEqual(vatFirst.snapshot.vatAmount, expectedVat);
        assert_1.default.strictEqual((0, money_1.roundMoney)(vatFirst.snapshot.commissionNet + vatFirst.snapshot.vatAmount), vatFirst.snapshot.totalCommission);
        assert_1.default.strictEqual(vatFirst.snapshot.ownerAmount, 0);
        assert_1.default.strictEqual(vatFirst.snapshot.vatTreatment, 'inclusive');
        const exclusivePropertyWouldAdd = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
            grossRent: 1000,
            levy: 0,
            commissionPercentage: 100,
            vatOnCommission: true,
            vatTreatment: 'exclusive',
            vatRate,
            commissionType: 'introduction'
        });
        assert_1.default.strictEqual(exclusivePropertyWouldAdd.vatTreatment, 'inclusive');
        assert_1.default.strictEqual(exclusivePropertyWouldAdd.totalCommission, 1000);
        const managementExclusive = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
            grossRent: 1000,
            levy: 0,
            commissionPercentage: 15,
            vatOnCommission: true,
            vatTreatment: 'exclusive',
            vatRate
        });
        assert_1.default.strictEqual(managementExclusive.totalCommission, 150);
        assert_1.default.strictEqual(managementExclusive.vatAmount, (0, money_1.roundMoney)(150 * vatRate));
        const vatZero = introSnapshot(1000, 0, 0, 1000, { vatOnCommission: true, vatRate: 0 });
        assert_1.default.strictEqual(vatZero.snapshot.totalCommission, 1000);
        assert_1.default.strictEqual(vatZero.snapshot.vatAmount, 0);
        const vatDisabled = introSnapshot(1000, 0, 0, 1000, { vatOnCommission: false, vatRate });
        assert_1.default.strictEqual(vatDisabled.snapshot.totalCommission, 1000);
        assert_1.default.strictEqual(vatDisabled.snapshot.vatAmount, 0);
        const vatPartial = introSnapshot(600, 0, 0, 1000, { vatOnCommission: true, vatRate });
        const partialNet = (0, money_1.roundMoney)(600 / (1 + vatRate));
        const partialVat = (0, money_1.roundMoney)(600 - partialNet);
        assert_1.default.strictEqual(vatPartial.allocation.introThisPayment, 600);
        assert_1.default.strictEqual(vatPartial.snapshot.totalCommission, 600);
        assert_1.default.strictEqual(vatPartial.snapshot.commissionNet, partialNet);
        assert_1.default.strictEqual(vatPartial.snapshot.vatAmount, partialVat);
        assert_1.default.strictEqual((0, money_1.roundMoney)(vatPartial.snapshot.commissionNet + vatPartial.snapshot.vatAmount), 600);
        assert_1.default.strictEqual(vatPartial.snapshot.ownerAmount, 0);
        const vatAdvance = introSnapshot(3000, 0, 0, 1000, { vatOnCommission: true, vatRate });
        assert_1.default.strictEqual(vatAdvance.allocation.introThisPayment, 1000);
        assert_1.default.strictEqual(vatAdvance.allocation.ownerRent, 2000);
        assert_1.default.strictEqual(vatAdvance.snapshot.totalCommission, 1000);
        assert_1.default.strictEqual(vatAdvance.snapshot.vatAmount, expectedVat);
        assert_1.default.strictEqual(vatAdvance.snapshot.ownerAmount, 2000);
        const rounding = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
            grossRent: 1,
            levy: 0,
            commissionPercentage: 100,
            vatOnCommission: true,
            vatTreatment: 'inclusive',
            vatRate,
            commissionType: 'introduction'
        });
        assert_1.default.strictEqual((0, money_1.roundMoney)(rounding.commissionNet + rounding.vatAmount), rounding.totalCommission);
        results['VAT-inclusive Introduction'] = 'PASS';
        // ---------------------------------------------------------------------------
        // Identity across leases
        // ---------------------------------------------------------------------------
        const leaseAPayments = [
            { amount: 1000, depositAmount: 0, commissionDetails: { totalCommission: 1000, commissionBase: 1000 } }
        ];
        const stateA = (0, introductionCommissionService_1.deriveIntroductionState)({
            tenantId: 'tenant-1',
            propertyId: 'prop-1',
            leaseId: 'lease-a',
            introductionTarget: 1000,
            payments: leaseAPayments
        });
        const stateB = (0, introductionCommissionService_1.deriveIntroductionState)({
            tenantId: 'tenant-1',
            propertyId: 'prop-1',
            leaseId: 'lease-b',
            introductionTarget: 1000,
            payments: []
        });
        assert_1.default.strictEqual(stateA.satisfied, true);
        assert_1.default.strictEqual(stateA.introductionRemaining, 0);
        assert_1.default.strictEqual(stateB.satisfied, false);
        assert_1.default.strictEqual(stateB.introductionRemaining, 1000);
        const otherProperty = (0, introductionCommissionService_1.deriveIntroductionState)({
            tenantId: 'tenant-1',
            propertyId: 'prop-2',
            leaseId: 'lease-c',
            introductionTarget: 1000,
            payments: []
        });
        assert_1.default.strictEqual(otherProperty.introductionRemaining, 1000);
        const otherTenant = (0, introductionCommissionService_1.deriveIntroductionState)({
            tenantId: 'tenant-2',
            propertyId: 'prop-1',
            leaseId: 'lease-d',
            introductionTarget: 1000,
            payments: []
        });
        assert_1.default.strictEqual(otherTenant.introductionRemaining, 1000);
        results['Lease identity'] = 'PASS';
        // ---------------------------------------------------------------------------
        // Outstanding rental
        // ---------------------------------------------------------------------------
        const firstMonth = new Date(2026, 0, 1);
        const thirdMonth = new Date(2026, 2, 1);
        const leaseEnd = new Date(2026, 11, 1);
        const outstandingBefore = (0, outstandingLeaseCalculation_1.computeOutstandingForLease)({
            rentalType: 'introduction',
            leaseStart: firstMonth,
            leaseEnd,
            currentMonthStart: firstMonth,
            cutoverDate: null,
            paidKeys: new Set(),
            monthlyAmount: 1000,
            introductionRemaining: 400,
            mode: 'rent'
        });
        assert_1.default.strictEqual(outstandingBefore.totalAmount, 400);
        const outstandingAfter = (0, outstandingLeaseCalculation_1.computeOutstandingForLease)({
            rentalType: 'introduction',
            leaseStart: firstMonth,
            leaseEnd,
            currentMonthStart: thirdMonth,
            cutoverDate: null,
            paidKeys: new Set(['2026-1']),
            monthlyAmount: 1000,
            introductionRemaining: 0,
            mode: 'rent'
        });
        assert_1.default.strictEqual(outstandingAfter.totalAmount, 2000);
        const advanceCovered = (0, outstandingLeaseCalculation_1.computeOutstandingForLease)({
            rentalType: 'introduction',
            leaseStart: firstMonth,
            leaseEnd,
            currentMonthStart: thirdMonth,
            cutoverDate: null,
            paidKeys: new Set(['2026-1', '2026-2', '2026-3']),
            monthlyAmount: 1000,
            introductionRemaining: 0,
            mode: 'rent'
        });
        assert_1.default.strictEqual(advanceCovered.totalAmount, 0);
        assert_1.default.ok(kpiSrc.includes('${propertyId}:${tenantId}:${leaseId}') || kpiSrc.includes('propertyId}:${tenantId}:${leaseId}'));
        assert_1.default.ok(kpiSrc.includes('if (!propertyId || !tenantId || !leaseId) continue'));
        results['Outstanding rental'] = 'PASS';
        // ---------------------------------------------------------------------------
        // Accounting / reconciliation
        // ---------------------------------------------------------------------------
        const introPay = paymentFromIntro(first.snapshot, { amount: 1000, depositAmount: 1000, _id: 'pay-intro-owner0' });
        const expectedIntro = (0, paymentAccountingProjection_1.buildExpectedAccountingProjection)(introPay);
        assert_1.default.strictEqual(expectedIntro.amounts.ownerIncome, 0);
        const mismatchedOwner = (0, paymentAccountingProjection_1.evaluateAccountingReconciliation)({
            paymentId: 'pay-intro-owner0',
            expected: expectedIntro,
            actual: {
                ownerIncome: true,
                agentCommission: true,
                companyCommission: true,
                journal: true,
                vat: false,
                deposit: true,
                amounts: {
                    ownerIncome: 1000,
                    agentCommission: first.snapshot.agentShare,
                    companyCommission: first.snapshot.agencyShare,
                    journal: 1000,
                    deposit: 1000
                }
            }
        });
        assert_1.default.strictEqual(mismatchedOwner.accountingComplete, false);
        assert_1.default.ok(mismatchedOwner.mismatched.includes('ownerIncome'));
        const laterPay = paymentFromIntro(second.snapshot, { amount: 1000, _id: 'pay-owner-later' });
        const expectedLater = (0, paymentAccountingProjection_1.buildExpectedAccountingProjection)(laterPay);
        assert_1.default.strictEqual(expectedLater.amounts.ownerIncome, 1000);
        const matchedLater = (0, paymentAccountingProjection_1.evaluateAccountingReconciliation)({
            paymentId: 'pay-owner-later',
            expected: expectedLater,
            actual: {
                ownerIncome: true,
                agentCommission: false,
                companyCommission: false,
                journal: true,
                vat: false,
                deposit: false,
                amounts: { ownerIncome: 1000, journal: 1000 }
            }
        });
        assert_1.default.strictEqual(matchedLater.accountingComplete, true);
        const vatPay = paymentFromIntro(vatFirst.snapshot, { amount: 1000, _id: 'pay-vat' });
        const expectedVatProj = (0, paymentAccountingProjection_1.buildExpectedAccountingProjection)(vatPay);
        assert_1.default.ok(expectedVatProj.vat);
        const vatMismatch = (0, paymentAccountingProjection_1.evaluateAccountingReconciliation)({
            paymentId: 'pay-vat',
            expected: expectedVatProj,
            actual: {
                ownerIncome: false,
                agentCommission: true,
                companyCommission: true,
                journal: true,
                vat: true,
                deposit: false,
                amounts: {
                    agentCommission: vatFirst.snapshot.agentShare,
                    companyCommission: vatFirst.snapshot.agencyShare,
                    journal: 1000,
                    vat: (0, money_1.roundMoney)(expectedVat + 10)
                }
            }
        });
        assert_1.default.strictEqual(vatMismatch.accountingComplete, false);
        assert_1.default.ok(vatMismatch.mismatched.includes('vat'));
        const missingProj = (0, paymentAccountingProjection_1.evaluateAccountingReconciliation)({
            paymentId: 'pay-intro-owner0',
            expected: expectedIntro,
            actual: {
                ownerIncome: false,
                agentCommission: false,
                companyCommission: false,
                journal: false,
                vat: false,
                deposit: false
            }
        });
        assert_1.default.strictEqual(missingProj.accountingComplete, false);
        assert_1.default.ok(ensureFn.includes('postPaymentAccounting') || recon.includes('postPaymentAccounting'));
        assert_1.default.ok(!postFn.includes('calculateForProperty'));
        assert_1.default.ok(!postFn.includes('prepareIntroductionRentalCommission'));
        assert_1.default.ok(!postFn.includes('buildIntroductionRentalCommission'));
        assert_1.default.ok(accountantCreate.includes('ensurePaymentAccountingPosted'));
        assert_1.default.ok(agentCreate.includes('ensurePaymentAccountingPosted'));
        assert_1.default.ok(webhookCtrl.includes('ensurePaymentAccountingPosted'));
        assert_1.default.ok(recon.includes('repairPaymentAccounting'));
        assert_1.default.ok(!scheduled.includes('repairPaymentAccounting('));
        assert_1.default.ok(!introSvc.includes('Repair All'));
        assert_1.default.ok(!paymentCtrl.includes('scan all Payments'));
        results['Accounting integrity'] = 'PASS';
        // ---------------------------------------------------------------------------
        // Sale completeness remains
        // ---------------------------------------------------------------------------
        const incompleteSale = (0, salePaymentCompleteness_1.validateSalePaymentCompleteness)({
            amount: 250000,
            commissionDetails: { totalCommission: 0, agentShare: 0, agencyShare: 0 }
        });
        assert_1.default.strictEqual(incompleteSale.ok, false);
        assert_1.default.strictEqual(salePaymentCompleteness_1.SALE_PAYMENT_INCOMPLETE_CODE, 'SALE_PAYMENT_INCOMPLETE');
        assert_1.default.ok(webhookCtrl.includes('validateSalePaymentCompleteness'));
        assert_1.default.ok(agentCreate.includes('validateSalePaymentCompleteness'));
        assert_1.default.ok(accountantCreate.includes('validateSalePaymentCompleteness') || paymentCtrl.includes('validateSalePaymentCompleteness'));
        results['Sale completeness'] = 'PASS';
        // ---------------------------------------------------------------------------
        // Calculator is one engine; UI surfaces backend error
        // ---------------------------------------------------------------------------
        assert_1.default.ok(calculator.includes("commissionType === 'introduction'"));
        assert_1.default.ok(!calculator.includes('calculateIntroductionCommission2'));
        assert_1.default.ok(!introSvc.includes('calculateIntroductionCommission2'));
        const clientRoot = path_1.default.resolve(process.cwd(), '..', 'client', 'src');
        const paymentForm = fs_1.default.readFileSync(path_1.default.join(clientRoot, 'components', 'payments', 'PaymentForm.tsx'), 'utf8');
        assert_1.default.ok(paymentForm.includes('leaseId'));
        assert_1.default.ok(paymentForm.includes('matched.length === 1'));
        assert_1.default.ok(paymentForm.includes('The first lease is not chosen automatically'));
        const apiErrorUtil = fs_1.default.readFileSync(path_1.default.join(clientRoot, 'utils', 'paymentApiError.ts'), 'utf8');
        assert_1.default.ok(apiErrorUtil.includes('mismatches'));
        results['Single commission engine + UI'] = 'PASS';
        console.log('Phase 6 introduction lifecycle tests passed');
        console.log(JSON.stringify({
            identity: 'tenantId + propertyId + leaseId',
            vatInclusiveFormula: 'net = roundMoney(gross / (1 + vatRate)); vat = roundMoney(gross - net)',
            exampleVatOn1000At15_5: { net: expectedNet, vat: expectedVat, gross: 1000 },
            results
        }, null, 2));
    });
}
run().catch((error) => {
    console.error(error);
    process.exit(1);
});
