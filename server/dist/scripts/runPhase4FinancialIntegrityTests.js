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
const paymentAccountingProjection_1 = require("../services/paymentAccountingProjection");
const commissionProjection_1 = require("../services/commissionProjection");
const VAT_RATE = 0.155;
function srcFile(rel) {
    return fs_1.default.readFileSync(path_1.default.join(__dirname, '..', '..', 'src', rel), 'utf8');
}
function sliceFn(src, startToken, endToken) {
    const start = src.indexOf(startToken);
    const end = src.indexOf(endToken, start + startToken.length);
    assert_1.default.ok(start >= 0 && end > start, `expected ${startToken} before ${endToken}`);
    return src.slice(start, end);
}
function snapshotEqualsCanonical(actual, expected) {
    assert_1.default.strictEqual(actual.totalCommission, expected.totalCommission);
    assert_1.default.strictEqual(actual.preaFee, expected.preaFee);
    assert_1.default.strictEqual(actual.agentShare, expected.agentShare);
    assert_1.default.strictEqual(actual.agencyShare, expected.agencyShare);
    assert_1.default.strictEqual(actual.vatOnCommission, expected.vatOnCommission);
    assert_1.default.strictEqual(actual.ownerAmount, expected.ownerAmount);
    assert_1.default.strictEqual(actual.commissionBase, expected.commissionBase);
    assert_1.default.strictEqual(actual.commissionGross, expected.commissionGross);
    assert_1.default.strictEqual(actual.commissionNet, expected.commissionNet);
    assert_1.default.strictEqual(actual.vatAmount, expected.vatAmount);
}
function paymentFromSnapshot(snapshot, extras) {
    return Object.assign({ _id: 'pay-phase4', status: 'completed', paymentType: 'rental', amount: snapshot.commissionBase, depositAmount: 0, levyAllocated: snapshot.levy || 0, isProvisional: false, isInSuspense: false, commissionDetails: snapshot, vatAmount: 0 }, extras);
}
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const paymentCtrl = srcFile('controllers/paymentController.ts');
        const agentCtrl = srcFile('controllers/agentController.ts');
        const webhookCtrl = srcFile('controllers/paymentWebhookController.ts');
        const commissionSvc = srcFile('services/commissionService.ts');
        const orchestrator = srcFile('services/paymentAccountingOrchestrator.ts');
        const recon = srcFile('services/paymentAccountingReconciliation.ts');
        const paymentModel = srcFile('models/Payment.ts');
        const immutability = srcFile('services/paymentFinancialImmutability.ts');
        const moneySrc = srcFile('utils/money.ts');
        const leaseCreate = sliceFn(paymentCtrl, 'export const createPayment = async', 'export const createPaymentAccountant');
        const accountantCreate = sliceFn(paymentCtrl, 'export const createPaymentAccountant = async', 'export const createSalesPaymentAccountant');
        const publicCreate = sliceFn(paymentCtrl, 'export const createPaymentPublic = async', 'export const getPaymentReceiptDownload');
        const finalizeFn = sliceFn(paymentCtrl, 'export const finalizeProvisionalPayment = async', 'export const getCombinedRemaining');
        const agentCreate = sliceFn(agentCtrl, 'export const createAgentPayment = async', 'export const updateAgentPayment = async');
        const salesCreate = sliceFn(paymentCtrl, 'export const createSalesPaymentAccountant = async', 'export const updatePayment = async');
        const postFn = sliceFn(orchestrator, 'export async function postPaymentAccounting', 'export async function reversePaymentAccounting');
        // ---------------------------------------------------------------------------
        // 4A — rental commission VAT: all live rental creates use calculateForProperty
        // ---------------------------------------------------------------------------
        assert_1.default.ok(commissionSvc.includes('vatOnCommission: false'), 'CommissionService.calculate remains VAT-off (sale wrapper)');
        for (const [label, body] of [
            ['lease', leaseCreate],
            ['accountant', accountantCreate],
            ['public', publicCreate],
            ['finalize', finalizeFn],
            ['agent', agentCreate]
        ]) {
            assert_1.default.ok(body.includes('calculateForProperty'), `${label} rental create uses calculateForProperty`);
            assert_1.default.ok(body.includes('vatOnCommission'), `${label} passes property VAT configuration`);
            assert_1.default.ok(body.includes('ensurePaymentAccountingPosted'), `${label} still posts via orchestrator`);
        }
        assert_1.default.ok(agentCreate.includes('isAgentRentalPayment'), 'agent rental/sale calculators stay branched');
        assert_1.default.ok(agentCreate.includes('CommissionService.calculate('), 'agent sale create retains VAT-off wrapper');
        assert_1.default.ok(salesCreate.includes('CommissionService.calculate('), 'sale create keeps sale calculator');
        assert_1.default.ok(!postFn.includes('calculateForProperty'), 'posting layer must not recalculate rental commission');
        assert_1.default.ok(!postFn.includes('calculatePropertyCommission'), 'posting layer must not call the rental calculator');
        assert_1.default.ok(postFn.includes('syncCommissionForPayment'), 'posting still projects from Payment snapshot');
        const vatOff = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
            grossRent: 1000,
            levy: 0,
            commissionPercentage: 15,
            vatOnCommission: false
        });
        assert_1.default.strictEqual(vatOff.commissionBase, 1000);
        assert_1.default.strictEqual(vatOff.totalCommission, 150);
        assert_1.default.strictEqual(vatOff.vatAmount, 0);
        assert_1.default.strictEqual(vatOff.commissionNet, 150);
        assert_1.default.strictEqual(vatOff.preaFee, 4.5);
        assert_1.default.strictEqual(vatOff.agentShare, 87.3);
        assert_1.default.strictEqual(vatOff.agencyShare, 58.2);
        assert_1.default.strictEqual(vatOff.ownerAmount, 850);
        const vatOn = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
            grossRent: 1000,
            levy: 0,
            commissionPercentage: 15,
            vatOnCommission: true,
            vatTreatment: 'exclusive',
            vatRate: VAT_RATE
        });
        assert_1.default.strictEqual(vatOn.commissionBase, 1000);
        assert_1.default.strictEqual(vatOn.totalCommission, 150);
        assert_1.default.strictEqual(vatOn.vatAmount, 23.25);
        assert_1.default.strictEqual(vatOn.commissionNet, 150);
        assert_1.default.strictEqual(vatOn.preaFee, 4.5);
        assert_1.default.strictEqual(vatOn.agentShare, 87.3);
        assert_1.default.strictEqual(vatOn.agencyShare, 58.2);
        assert_1.default.strictEqual(vatOn.ownerAmount, 826.75);
        assert_1.default.ok(vatOn.vatAmount > vatOff.vatAmount);
        assert_1.default.ok(vatOn.ownerAmount < vatOff.ownerAmount);
        const inclusive = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
            grossRent: 1000,
            levy: 0,
            commissionPercentage: 15,
            vatOnCommission: true,
            vatTreatment: 'inclusive',
            vatRate: VAT_RATE
        });
        assert_1.default.strictEqual(inclusive.commissionGross, 150);
        assert_1.default.strictEqual(inclusive.commissionNet, 129.87);
        assert_1.default.strictEqual(inclusive.vatAmount, 20.13);
        assert_1.default.strictEqual(inclusive.ownerAmount, 850);
        const withLevy = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
            grossRent: 1100,
            levy: 100,
            commissionPercentage: 15,
            vatOnCommission: false
        });
        assert_1.default.strictEqual(withLevy.commissionBase, 1000);
        assert_1.default.strictEqual(withLevy.totalCommission, 150);
        assert_1.default.strictEqual(withLevy.ownerPayable, 850);
        assert_1.default.strictEqual(withLevy.ownerAmount, 950);
        const levySnapshot = (0, propertyCommissionCalculator_1.applyLevyPassThroughToSnapshot)((0, propertyCommissionCalculator_1.calculatePropertyCommission)({
            grossRent: 1000,
            levy: 0,
            commissionPercentage: 15,
            vatOnCommission: false
        }), 1000, 100);
        assert_1.default.strictEqual(levySnapshot.levy, 100);
        assert_1.default.strictEqual(levySnapshot.totalCommission, 150, 'levy pass-through must not change commission');
        assert_1.default.strictEqual(levySnapshot.ownerAmount, 950);
        const canonicalVatOnSnapshot = (0, propertyCommissionCalculator_1.toPaymentCommissionSnapshot)(vatOn);
        snapshotEqualsCanonical(canonicalVatOnSnapshot, canonicalVatOnSnapshot);
        const projectedFromSnapshot = (0, paymentAccountingProjection_1.buildExpectedAccountingProjection)(paymentFromSnapshot(canonicalVatOnSnapshot, { amount: 1000, agentId: 'agent-1' }));
        assert_1.default.strictEqual(projectedFromSnapshot.amounts.ownerIncome, canonicalVatOnSnapshot.ownerAmount);
        assert_1.default.strictEqual(projectedFromSnapshot.amounts.agentCommission, canonicalVatOnSnapshot.agentShare);
        assert_1.default.strictEqual(projectedFromSnapshot.amounts.companyCommission, canonicalVatOnSnapshot.agencyShare);
        assert_1.default.strictEqual(projectedFromSnapshot.amounts.vat, canonicalVatOnSnapshot.vatOnCommission);
        const lanes = (0, commissionProjection_1.projectCommissionLanes)(paymentFromSnapshot(canonicalVatOnSnapshot, { agentId: 'agent-1' }));
        assert_1.default.strictEqual((_a = lanes[0]) === null || _a === void 0 ? void 0 : _a.amount, canonicalVatOnSnapshot.agentShare);
        // ---------------------------------------------------------------------------
        // 4B — commission rounding: 333.33 × 15% persists as 50.00
        // ---------------------------------------------------------------------------
        const roundingCanonical = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
            grossRent: 333.33,
            levy: 0,
            commissionPercentage: 15,
            vatOnCommission: false
        });
        const roundingFallback = (0, money_1.computeCommissionFallback)(333.33, 15);
        assert_1.default.strictEqual((0, money_1.roundMoney)((333.33 * 15) / 100), 50);
        assert_1.default.strictEqual(roundingCanonical.totalCommission, 50);
        assert_1.default.strictEqual(roundingFallback.totalCommission, 50);
        assert_1.default.strictEqual(roundingCanonical.preaFee, roundingFallback.preaFee);
        assert_1.default.strictEqual(roundingCanonical.agentShare, roundingFallback.agentShare);
        assert_1.default.strictEqual(roundingCanonical.agencyShare, roundingFallback.agencyShare);
        assert_1.default.strictEqual(roundingCanonical.ownerAmount, roundingFallback.ownerAmount);
        assert_1.default.strictEqual(roundingCanonical.preaFee, 1.5);
        assert_1.default.strictEqual(roundingCanonical.agentShare, 29.1);
        assert_1.default.strictEqual(roundingCanonical.agencyShare, 19.4);
        assert_1.default.strictEqual(roundingCanonical.ownerAmount, 283.33);
        assert_1.default.ok(moneySrc.includes('roundMoney((commissionBase * Number(commissionPercentage || 0)) / 100)'));
        const saleFallbackVat = (0, money_1.roundMoney)(roundingFallback.totalCommission * VAT_RATE);
        const saleOwner = (0, money_1.roundMoney)(333.33 - roundingFallback.totalCommission - saleFallbackVat);
        assert_1.default.strictEqual(saleFallbackVat, 7.75);
        assert_1.default.strictEqual(saleOwner, 275.58);
        assert_1.default.ok(salesCreate.includes('computeCommissionFallback'), 'sale catch path still uses fallback');
        assert_1.default.ok(salesCreate.includes('roundMoney(commissionBase * vatRate)'), 'sale VAT overlay remains exclusive roundMoney');
        // ---------------------------------------------------------------------------
        // 4C — webhook commission snapshot + idempotency
        // ---------------------------------------------------------------------------
        assert_1.default.ok(webhookCtrl.includes('WebhookEventReceipt'));
        assert_1.default.ok(webhookCtrl.includes("existingEvent?.status === 'processed'"));
        assert_1.default.ok(webhookCtrl.includes('Duplicate webhook ignored'));
        assert_1.default.ok(webhookCtrl.includes('calculateForProperty'), 'rental webhook create uses canonical calculator');
        assert_1.default.ok(webhookCtrl.includes('classifyPropertyFinancialKind'), 'webhook classifies from Property.rentalType');
        assert_1.default.ok(webhookCtrl.includes("rentalType === 'introduction'"));
        assert_1.default.ok(webhookCtrl.includes('validateSalePaymentCompleteness'), 'sale webhook validates completeness');
        assert_1.default.ok(webhookCtrl.includes("status: 'failed'"), 'incomplete sale webhook is not marked processed');
        assert_1.default.ok(!webhookCtrl.includes('zeroWebhookCommissionDetails'), 'Phase 5 rejects incomplete sales instead of zero-commission create');
        assert_1.default.ok(webhookCtrl.includes("paymentType: 'sale'"), 'classified sale webhook still creates sale Payments when complete');
        const webhookPost = sliceFn(webhookCtrl, "if (normalizedStatus === 'completed') {", 'await WebhookEventReceipt.updateOne');
        assert_1.default.ok(webhookPost.includes('ensurePaymentAccountingPosted'));
        assert_1.default.ok(!webhookPost.includes('calculateForProperty'), 'posting after webhook must not recalculate commission');
        const webhookReceiptModel = srcFile('models/WebhookEventReceipt.ts');
        assert_1.default.ok(webhookReceiptModel.includes('{ provider: 1, eventId: 1 }'));
        assert_1.default.ok(paymentModel.includes('externalProvider: 1, externalTransactionId: 1'));
        // ---------------------------------------------------------------------------
        // 4D — completed-payment immutability on save and query-update
        // ---------------------------------------------------------------------------
        const completed = { status: 'completed' };
        const provisional = { status: 'completed', isProvisional: true };
        for (const field of paymentFinancialImmutability_1.PAYMENT_FINANCIAL_FIELDS) {
            assert_1.default.throws(() => (0, paymentFinancialImmutability_1.assertCompletedPaymentFinanciallyImmutable)(completed, { [field]: 1 }), (err) => err.message === paymentFinancialImmutability_1.COMPLETED_PAYMENT_IMMUTABLE_MESSAGE, `save-style payload must reject ${field}`);
            assert_1.default.throws(() => (0, paymentFinancialImmutability_1.assertCompletedPaymentFinanciallyImmutable)(completed, { $set: { [field]: 1 } }), (err) => err.message === paymentFinancialImmutability_1.COMPLETED_PAYMENT_IMMUTABLE_MESSAGE, `query-update $set must reject ${field}`);
            assert_1.default.ok((0, paymentFinancialImmutability_1.financialFieldsInQueryUpdate)({ $set: { [field]: 1 } }).includes(field), `$set ${field} detected`);
        }
        assert_1.default.ok((0, paymentFinancialImmutability_1.financialFieldsInQueryUpdate)({ $set: { 'commissionDetails.agentShare': 9 } }).includes('commissionDetails'));
        assert_1.default.ok((0, paymentFinancialImmutability_1.financialFieldsInQueryUpdate)({ $unset: { vatAmount: 1 } }).includes('vatAmount'));
        assert_1.default.ok((0, paymentFinancialImmutability_1.financialFieldsInQueryUpdate)({ $inc: { amount: 1 } }).includes('amount'));
        assert_1.default.deepStrictEqual((0, paymentFinancialImmutability_1.financialFieldsInQueryUpdate)({ $set: { notes: 'ok' } }), []);
        assert_1.default.deepStrictEqual((0, paymentFinancialImmutability_1.financialFieldsPresentInPayload)({ notes: 'ok' }), []);
        assert_1.default.doesNotThrow(() => (0, paymentFinancialImmutability_1.assertCompletedPaymentFinanciallyImmutable)(completed, { notes: 'admin note' }));
        assert_1.default.doesNotThrow(() => (0, paymentFinancialImmutability_1.assertCompletedPaymentFinanciallyImmutable)(provisional, { amount: 50, vatAmount: 1 }));
        assert_1.default.strictEqual((0, paymentFinancialImmutability_1.isCompletedFinancialPayment)({ status: 'completed', isProvisional: true }), false);
        assert_1.default.ok(paymentModel.includes("pre('save'"));
        assert_1.default.ok(paymentModel.includes("findOneAndUpdate"));
        assert_1.default.ok(paymentModel.includes('financialFieldsInQueryUpdate'));
        assert_1.default.ok(paymentModel.includes('COMPLETED_PAYMENT_IMMUTABLE_MESSAGE'));
        assert_1.default.ok(immutability.includes("'paymentMethod'"));
        assert_1.default.ok(agentCtrl.includes('assertCompletedPaymentFinanciallyImmutable'));
        assert_1.default.ok(paymentCtrl.includes('COMPLETED_PAYMENT_IMMUTABLE_MESSAGE'));
        const reverseFn = sliceFn(paymentCtrl, 'export const reversePayment = async', 'export const finalizeProvisionalPayment');
        assert_1.default.ok(reverseFn.includes('reversalPaymentId') || reverseFn.includes('reversalOfPaymentId'));
        // ---------------------------------------------------------------------------
        // 4E — payment creation idempotency
        // ---------------------------------------------------------------------------
        assert_1.default.ok(leaseCreate.includes('idempotencyKey'));
        assert_1.default.ok(accountantCreate.includes('idempotencyKey'));
        assert_1.default.ok(publicCreate.includes('idempotencyKey'));
        assert_1.default.ok(agentCreate.includes('idempotencyKey'));
        assert_1.default.ok(salesCreate.includes('salesIdempotencyKey') || salesCreate.includes('idempotencyKey'));
        assert_1.default.ok(salesCreate.includes("req.headers['idempotency-key']"));
        assert_1.default.ok(paymentModel.includes('companyId: 1, idempotencyKey: 1'));
        assert_1.default.ok(webhookCtrl.includes("existingEvent?.status === 'processed'"));
        const ensureFn = sliceFn(recon, 'export async function ensurePaymentAccountingPosted', 'export async function refreshPaymentAccountingStatus');
        assert_1.default.ok(ensureFn.includes('postPaymentAccounting'));
        console.log('Phase 4 financial integrity tests passed');
        console.log(JSON.stringify({
            vatOff: {
                commissionBase: vatOff.commissionBase,
                commission: vatOff.totalCommission,
                vat: vatOff.vatAmount,
                net: vatOff.commissionNet,
                agentShare: vatOff.agentShare,
                agencyShare: vatOff.agencyShare,
                ownerAmount: vatOff.ownerAmount
            },
            vatOnExclusive: {
                commissionBase: vatOn.commissionBase,
                commission: vatOn.totalCommission,
                vat: vatOn.vatAmount,
                net: vatOn.commissionNet,
                agentShare: vatOn.agentShare,
                agencyShare: vatOn.agencyShare,
                ownerAmount: vatOn.ownerAmount
            },
            vatInclusive: {
                commissionGross: inclusive.commissionGross,
                commissionNet: inclusive.commissionNet,
                vat: inclusive.vatAmount,
                ownerAmount: inclusive.ownerAmount
            },
            rounding333: {
                totalCommission: roundingCanonical.totalCommission,
                preaFee: roundingCanonical.preaFee,
                agentShare: roundingCanonical.agentShare,
                agencyShare: roundingCanonical.agencyShare,
                ownerAmount: roundingCanonical.ownerAmount
            }
        }));
    });
}
run().catch((error) => {
    console.error(error);
    process.exit(1);
});
