"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const propertyCommissionCalculator_1 = require("../services/propertyCommissionCalculator");
const vatPolicyService_1 = require("../services/vatPolicyService");
const vatApplicability_1 = require("../services/tax/vatApplicability");
const taxRateService_1 = require("../services/taxRateService");
const VAT_RATE = 0.155;
const nearlyEqual = (actual, expected, digits = 2) => {
    const factor = Math.pow(10, digits);
    assert_1.default.strictEqual(Math.round(actual * factor) / factor, Math.round(expected * factor) / factor);
};
const run = () => {
    const levyExclusive = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
        grossRent: 1100,
        levy: 100,
        commissionPercentage: 10,
        vatOnCommission: true,
        vatTreatment: 'exclusive',
        vatRate: VAT_RATE
    });
    nearlyEqual(levyExclusive.commissionBase, 1000);
    nearlyEqual(levyExclusive.commissionGross, 100);
    nearlyEqual(levyExclusive.vatAmount, 15.5);
    nearlyEqual(levyExclusive.ownerPayable, 884.5);
    const noLevyExclusive = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
        grossRent: 1100,
        levy: 0,
        commissionPercentage: 10,
        vatOnCommission: true,
        vatTreatment: 'exclusive',
        vatRate: VAT_RATE
    });
    nearlyEqual(noLevyExclusive.commissionGross, 110);
    nearlyEqual(noLevyExclusive.vatAmount, 17.05);
    nearlyEqual(noLevyExclusive.ownerPayable, 972.95);
    const levyOff = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
        grossRent: 1100,
        levy: 100,
        commissionPercentage: 10,
        vatOnCommission: false,
        vatRate: VAT_RATE
    });
    nearlyEqual(levyOff.commissionBase, 1000);
    nearlyEqual(levyOff.commissionGross, 100);
    nearlyEqual(levyOff.vatAmount, 0);
    nearlyEqual(levyOff.ownerPayable, 900);
    const noLevyOff = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
        grossRent: 1100,
        levy: 0,
        commissionPercentage: 10,
        vatOnCommission: false,
        vatRate: VAT_RATE
    });
    nearlyEqual(noLevyOff.commissionGross, 110);
    nearlyEqual(noLevyOff.vatAmount, 0);
    nearlyEqual(noLevyOff.ownerPayable, 990);
    const inclusive = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
        grossRent: 1000,
        levy: 0,
        commissionPercentage: 10,
        vatOnCommission: true,
        vatTreatment: 'inclusive',
        vatRate: VAT_RATE
    });
    nearlyEqual(inclusive.commissionGross, 100);
    nearlyEqual(inclusive.commissionNet, 86.58);
    nearlyEqual(inclusive.vatAmount, 13.42);
    nearlyEqual(inclusive.ownerPayable, 900);
    const january = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
        grossRent: 1100,
        levy: 100,
        commissionPercentage: 10,
        vatOnCommission: true,
        vatTreatment: 'exclusive',
        vatRate: 0.155
    });
    const afterRateChange = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
        grossRent: 1100,
        levy: 100,
        commissionPercentage: 10,
        vatOnCommission: true,
        vatTreatment: 'exclusive',
        vatRate: 0.16
    });
    nearlyEqual(january.vatRate || 0, 0.155);
    nearlyEqual(january.vatAmount, 15.5);
    nearlyEqual(afterRateChange.vatRate || 0, 0.16);
    nearlyEqual(afterRateChange.vatAmount, 16);
    assert_1.default.notStrictEqual(january.vatAmount, afterRateChange.vatAmount);
    const legacyProperty = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
        grossRent: 1100,
        levy: 100,
        commissionPercentage: 10
    });
    nearlyEqual(legacyProperty.vatAmount, 0);
    nearlyEqual(legacyProperty.ownerPayable, 900);
    assert_1.default.strictEqual(legacyProperty.vatOnCommission, false);
    const paymentDate = new Date('2026-10-13T00:00:00.000Z');
    const datedRates = [
        { rate: 15, effectiveFrom: new Date('2026-01-01T00:00:00.000Z'), effectiveTo: new Date('2026-09-13T00:00:00.000Z') },
        { rate: 15.5, effectiveFrom: new Date('2026-09-14T00:00:00.000Z'), effectiveTo: new Date('2026-10-31T00:00:00.000Z') },
        { rate: 16, effectiveFrom: new Date('2026-11-01T00:00:00.000Z'), effectiveTo: null }
    ];
    const octoberRate = (0, taxRateService_1.selectRateEffectiveOn)(datedRates, paymentDate);
    const novemberPaymentRate = (0, taxRateService_1.selectRateEffectiveOn)(datedRates, new Date('2026-11-01T00:00:00.000Z'));
    assert_1.default.strictEqual(octoberRate === null || octoberRate === void 0 ? void 0 : octoberRate.rate, 15.5);
    assert_1.default.strictEqual(novemberPaymentRate === null || novemberPaymentRate === void 0 ? void 0 : novemberPaymentRate.rate, 16);
    assert_1.default.strictEqual((0, taxRateService_1.selectRateEffectiveOn)(datedRates, new Date('2025-12-31T00:00:00.000Z')), undefined);
    const registeredOnPaymentDate = {
        vatRegistered: true,
        vatRegistrationEffectiveDate: '2026-09-14'
    };
    const applicability = (0, vatApplicability_1.evaluateVatApplicability)({
        company: registeredOnPaymentDate,
        transactionDate: paymentDate,
        supplyTreatment: 'STANDARD_TAXABLE',
        useClass: 'AGENCY_COMMISSION',
        requested: true
    });
    assert_1.default.strictEqual(applicability.vatApplies, true);
    const eligibleFlags = (0, vatPolicyService_1.commissionVatFlagsFromPolicy)({
        apply: applicability.vatApplies,
        treatment: 'COMMISSION_VAT_EXCLUSIVE',
        vatRate: Number(octoberRate === null || octoberRate === void 0 ? void 0 : octoberRate.rate) / 100
    });
    const chargeVat = (label) => {
        assert_1.default.ok(label === 'current-month' || label === 'advance-month');
        return (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
            grossRent: 1800,
            levy: 0,
            commissionPercentage: 15,
            vatOnCommission: eligibleFlags.vatOnCommission,
            vatTreatment: eligibleFlags.vatTreatment,
            vatRate: eligibleFlags.vatRate
        });
    };
    const currentMonth = chargeVat('current-month');
    const advanceMonth = chargeVat('advance-month');
    for (const result of [currentMonth, advanceMonth]) {
        nearlyEqual(result.commissionGross, 270);
        nearlyEqual(result.vatAmount, 41.85);
        nearlyEqual(result.ownerPayable, 1488.15);
        const persisted = (0, propertyCommissionCalculator_1.applyLevyPassThroughToSnapshot)(result, 1800, 100);
        nearlyEqual(persisted.vatOnCommission, 41.85);
        nearlyEqual(persisted.vatAmount, 41.85);
        nearlyEqual(persisted.totalCommission, 270);
        nearlyEqual(persisted.levy, 100);
        nearlyEqual(persisted.ownerAmount, 1588.15);
        const repeated = (0, propertyCommissionCalculator_1.applyLevyPassThroughToSnapshot)(result, 1800, 100);
        assert_1.default.deepStrictEqual(repeated, persisted);
    }
    assert_1.default.strictEqual(currentMonth.vatAmount, advanceMonth.vatAmount);
    const notRegistered = (0, vatApplicability_1.evaluateVatApplicability)({
        company: { vatRegistered: false },
        transactionDate: paymentDate,
        supplyTreatment: 'STANDARD_TAXABLE',
        useClass: 'AGENCY_COMMISSION',
        requested: true
    });
    assert_1.default.strictEqual(notRegistered.vatApplies, false);
    assert_1.default.strictEqual(notRegistered.reviewRequired, true);
    assert_1.default.strictEqual(notRegistered.reviewReason, 'VAT_CHARGED_WHILE_COMPANY_NOT_REGISTERED');
    const withheld = (0, vatPolicyService_1.commissionVatFlagsFromPolicy)({
        apply: notRegistered.vatApplies,
        treatment: 'NONE',
        vatRate: 0
    });
    assert_1.default.strictEqual(withheld.vatOnCommission, false);
    const withheldCurrent = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
        grossRent: 1800,
        levy: 0,
        commissionPercentage: 15,
        vatOnCommission: withheld.vatOnCommission,
        vatRate: withheld.vatRate
    });
    const withheldAdvance = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
        grossRent: 1800,
        levy: 0,
        commissionPercentage: 15,
        vatOnCommission: withheld.vatOnCommission,
        vatRate: withheld.vatRate
    });
    nearlyEqual(withheldCurrent.vatAmount, 0);
    nearlyEqual(withheldAdvance.vatAmount, 0);
    nearlyEqual(withheldCurrent.commissionGross, 270);
    nearlyEqual(withheldCurrent.ownerPayable, 1530);
    const disabled = (0, vatApplicability_1.evaluateVatApplicability)({
        company: registeredOnPaymentDate,
        transactionDate: paymentDate,
        supplyTreatment: 'STANDARD_TAXABLE',
        useClass: 'AGENCY_COMMISSION',
        requested: false
    });
    assert_1.default.strictEqual(disabled.vatApplies, false);
    assert_1.default.strictEqual(disabled.reviewRequired, false);
    const disabledFlags = (0, vatPolicyService_1.commissionVatFlagsFromPolicy)({ apply: false, treatment: 'NONE', vatRate: 0.155 });
    const disabledResult = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
        grossRent: 1800,
        levy: 0,
        commissionPercentage: 15,
        vatOnCommission: disabledFlags.vatOnCommission,
        vatRate: disabledFlags.vatRate
    });
    nearlyEqual(disabledResult.vatAmount, 0);
    nearlyEqual(disabledResult.ownerPayable, 1530);
    const inclusiveFlags = (0, vatPolicyService_1.commissionVatFlagsFromPolicy)({
        apply: true,
        treatment: 'COMMISSION_VAT_INCLUSIVE',
        vatRate: 0.155
    });
    const inclusiveRent = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
        grossRent: 1800,
        levy: 0,
        commissionPercentage: 15,
        vatOnCommission: inclusiveFlags.vatOnCommission,
        vatTreatment: inclusiveFlags.vatTreatment,
        vatRate: inclusiveFlags.vatRate
    });
    nearlyEqual(inclusiveRent.commissionGross, 270);
    nearlyEqual(inclusiveRent.vatAmount, 36.23);
    nearlyEqual(inclusiveRent.ownerPayable, 1530);
    assert_1.default.notStrictEqual(Math.round(inclusiveRent.ownerPayable * 100), 148815);
    assert_1.default.strictEqual((0, vatApplicability_1.isCompanyVatRegisteredOnDate)({
        vatRegistered: true,
        vatRegistrationEffectiveDate: '2026-11-01'
    }, paymentDate), false);
    assert_1.default.strictEqual((0, vatApplicability_1.evaluateVatApplicability)({
        company: { vatRegistered: true, vatRegistrationEffectiveDate: '2026-11-01' },
        transactionDate: paymentDate,
        supplyTreatment: 'STANDARD_TAXABLE',
        requested: true
    }).vatApplies, false);
    const laterRateFlags = (0, vatPolicyService_1.commissionVatFlagsFromPolicy)({
        apply: true,
        treatment: 'COMMISSION_VAT_EXCLUSIVE',
        vatRate: Number(novemberPaymentRate === null || novemberPaymentRate === void 0 ? void 0 : novemberPaymentRate.rate) / 100
    });
    const laterRate = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
        grossRent: 1800,
        levy: 0,
        commissionPercentage: 15,
        vatOnCommission: laterRateFlags.vatOnCommission,
        vatTreatment: laterRateFlags.vatTreatment,
        vatRate: laterRateFlags.vatRate
    });
    nearlyEqual(laterRate.vatAmount, 43.2);
    assert_1.default.notStrictEqual(laterRate.vatAmount, currentMonth.vatAmount);
    const serverRoot = path_1.default.resolve(__dirname, '../..');
    const repoRoot = path_1.default.resolve(serverRoot, '..');
    const read = (relativePath) => fs_1.default.readFileSync(path_1.default.join(repoRoot, relativePath), 'utf8');
    const paymentController = read('server/src/controllers/paymentController.ts');
    const agentController = read('server/src/controllers/agentController.ts');
    const webhookController = read('server/src/controllers/paymentWebhookController.ts');
    const policySource = read('server/src/services/vatPolicyService.ts');
    const calculatorSource = read('server/src/services/propertyCommissionCalculator.ts');
    const postingSource = read('server/src/services/paymentAccountingReconciliation.ts');
    const displaySource = read('client/src/pages/AccountantDashboard/PropertyAccountDetailPage.tsx');
    const historicalIds = ['6ace0324c450bcc97524003c', '6ace0e18f4e4f25bbaddd77c'];
    for (const source of [paymentController, agentController, webhookController, policySource, calculatorSource]) {
        for (const id of historicalIds) {
            assert_1.default.strictEqual(source.includes(id), false);
        }
        assert_1.default.strictEqual(source.includes('vatOnCommission: Boolean(('), false);
    }
    assert_1.default.strictEqual(policySource.includes('rentalPeriod'), false);
    assert_1.default.strictEqual(calculatorSource.includes('rentalPeriod'), false);
    const slice = (source, start, end) => {
        const from = source.indexOf(start);
        const to = source.indexOf(end, from + start.length);
        assert_1.default.ok(from >= 0 && to > from, `${start} slice`);
        return source.slice(from, to);
    };
    for (const [start, end] of [
        ['export const createPayment =', 'export const createPaymentAccountant'],
        ['export const createPaymentAccountant =', 'export const createSalesPaymentAccountant'],
        ['export const createPaymentPublic =', 'export const finalizeProvisionalPayment']
    ]) {
        const body = slice(paymentController, start, end);
        const idempotency = body.indexOf('idempotencyKey');
        const policy = body.indexOf('resolveCommissionVatPolicy');
        assert_1.default.ok(idempotency >= 0 && policy > idempotency, `${start} resolves VAT after the idempotency check`);
        assert_1.default.ok(body.includes('commissionVatFlagsFromPolicy'));
    }
    const finalize = slice(paymentController, 'export const finalizeProvisionalPayment', 'export const ');
    const provisionalGuard = finalize.indexOf('Payment is not provisional');
    const finalizePolicy = finalize.indexOf('resolveCommissionVatPolicy');
    assert_1.default.ok(provisionalGuard >= 0 && finalizePolicy > provisionalGuard);
    const agentUpdate = agentController.slice(agentController.indexOf('assertCompletedPaymentFinanciallyImmutable'));
    assert_1.default.ok(agentUpdate.indexOf('resolveCommissionVatPolicy') > 0);
    assert_1.default.ok(postingSource.includes('idempotencyKey: `payment:${paymentId}`'));
    assert_1.default.ok(displaySource.includes('moneyOrDash(breakdown?.vatOnCommission, format)'));
    assert_1.default.strictEqual(displaySource.includes('0.155'), false);
    assert_1.default.strictEqual(displaySource.includes('vatOnCommission *'), false);
    console.log('vat on commission tests passed');
};
run();
