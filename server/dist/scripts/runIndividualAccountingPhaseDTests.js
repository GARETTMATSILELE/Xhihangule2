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
const taxClassificationService_1 = require("../services/taxClassificationService");
const taxMetadataTypes_1 = require("../services/tax/taxMetadataTypes");
const taxPeriodService_1 = require("../services/taxPeriodService");
const taxRuleRegistry_1 = require("../services/taxRuleRegistry");
function srcFile(rel) {
    return fs_1.default.readFileSync(path_1.default.join(__dirname, '..', '..', 'src', rel), 'utf8');
}
function rule(partial) {
    var _a, _b, _c;
    return {
        id: partial.id || 'rule-id',
        jurisdiction: 'ZW',
        taxType: partial.taxType,
        ruleCode: partial.ruleCode,
        version: (_a = partial.version) !== null && _a !== void 0 ? _a : 1,
        description: partial.description || partial.ruleCode,
        effectiveFrom: partial.effectiveFrom || new Date('2026-01-01T00:00:00.000Z'),
        effectiveTo: (_b = partial.effectiveTo) !== null && _b !== void 0 ? _b : null,
        rate: (_c = partial.rate) !== null && _c !== void 0 ? _c : 15,
        supplyTreatment: null,
        calculationMethod: 'STANDARD_PERCENT',
        sourceReference: partial.sourceReference || 'test',
        sourceDocument: null,
        notes: null,
        status: 'ACTIVE'
    };
}
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        const results = {};
        {
            assert_1.default.strictEqual((0, taxMetadataTypes_1.calendarPeriodKey)(new Date('2026-01-01T00:00:00.000Z')), '2026-01');
            assert_1.default.strictEqual((0, taxMetadataTypes_1.calendarPeriodKey)(new Date('2026-12-31T23:00:00.000Z')), '2026-12');
            assert_1.default.strictEqual((0, taxMetadataTypes_1.calendarPeriodKey)(new Date('2027-01-01T00:00:00.000Z')), '2027-01');
            const jan = (0, taxMetadataTypes_1.calendarPeriodBounds)('2026-01');
            assert_1.default.strictEqual(jan.periodStart.toISOString(), '2026-01-01T00:00:00.000Z');
            assert_1.default.strictEqual(jan.periodEnd.getUTCMonth(), 0);
            assert_1.default.strictEqual(jan.periodEnd.getUTCDate(), 31);
            const leap = (0, taxMetadataTypes_1.calendarPeriodBounds)('2024-02');
            assert_1.default.strictEqual(leap.periodEnd.getUTCDate(), 29);
            const nonLeap = (0, taxMetadataTypes_1.calendarPeriodBounds)('2025-02');
            assert_1.default.strictEqual(nonLeap.periodEnd.getUTCDate(), 28);
            results['Tax period keys follow transaction UTC date, including year and leap-year boundaries'] = 'PASS';
        }
        {
            assert_1.default.strictEqual((0, taxPeriodService_1.assignmentStatusForExistingPeriod)('OPEN'), 'ASSIGNED');
            assert_1.default.strictEqual((0, taxPeriodService_1.assignmentStatusForExistingPeriod)('REVIEW'), 'ASSIGNED');
            assert_1.default.strictEqual((0, taxPeriodService_1.assignmentStatusForExistingPeriod)('AMENDED'), 'ASSIGNED');
            assert_1.default.strictEqual((0, taxPeriodService_1.assignmentStatusForExistingPeriod)('FINALIZED'), 'PERIOD_CLOSED');
            assert_1.default.strictEqual((0, taxPeriodService_1.assignmentStatusForExistingPeriod)('LOCKED'), 'PERIOD_CLOSED');
            const resolver = srcFile('services/taxPeriodService.ts');
            const resolveFn = resolver.slice(resolver.indexOf('export async function resolveTaxPeriod'), resolver.indexOf('export async function resolveRelevantTaxPeriods'));
            assert_1.default.ok(!resolveFn.includes('TaxPeriod.create'));
            assert_1.default.ok(resolveFn.includes("status: 'PERIOD_REQUIRED'"));
            results['Closed and locked tax periods are explicit; missing periods are PERIOD_REQUIRED'] = 'PASS';
        }
        {
            const seeds = (0, taxRuleRegistry_1.systemTaxRuleSeeds)();
            const vat2026 = seeds.find((row) => row.ruleCode === 'ZW_VAT_STANDARD' && row.version === 2);
            const vatPrior = seeds.find((row) => row.ruleCode === 'ZW_VAT_STANDARD' && row.version === 1);
            const presumptive = seeds.find((row) => row.ruleCode === 'ZW_PRESUMPTIVE_RENTAL_PN08_2026');
            assert_1.default.ok((0, taxRuleRegistry_1.isRuleEffectiveOn)(vatPrior, new Date('2025-12-31T00:00:00.000Z')));
            assert_1.default.ok(!(0, taxRuleRegistry_1.isRuleEffectiveOn)(vatPrior, new Date('2026-01-01T00:00:00.000Z')));
            assert_1.default.ok((0, taxRuleRegistry_1.isRuleEffectiveOn)(vat2026, new Date('2026-01-01T00:00:00.000Z')));
            assert_1.default.ok(!(0, taxRuleRegistry_1.isRuleEffectiveOn)(vat2026, new Date('2025-12-31T00:00:00.000Z')));
            assert_1.default.ok((0, taxRuleRegistry_1.isRuleEffectiveOn)(presumptive, new Date('2026-09-17T00:00:00.000Z')));
            assert_1.default.ok(!(0, taxRuleRegistry_1.isRuleEffectiveOn)(presumptive, new Date('2025-12-01T00:00:00.000Z')));
            assert_1.default.ok(!(0, taxRuleRegistry_1.isRuleEffectiveOn)(Object.assign(Object.assign({}, vat2026), { status: 'INACTIVE' }), new Date('2026-09-17T00:00:00.000Z')));
            results['Tax-rule effective dates are independent of tax-period calendar keys'] = 'PASS';
        }
        {
            const commercial = (0, taxClassificationService_1.buildTaxClassification)({
                sourceKind: 'PAYMENT_RENT',
                transactionDate: new Date('2026-09-17T00:00:00.000Z'),
                vatRegistered: true,
                vatRegistrationEffectiveDate: '2026-01-01',
                rentalTaxRegime: 'ACCOUNTANT_REVIEW',
                incomeTaxRegistered: false,
                propertyUseClass: 'COMMERCIAL',
                vatSupplyTreatment: 'STANDARD_TAXABLE',
                rentalTaxTreatment: 'ACCOUNTANT_REVIEW',
                vatRule: rule({
                    id: 'rule-vat',
                    taxType: 'VAT',
                    ruleCode: 'ZW_VAT_STANDARD',
                    version: 2,
                    rate: 15.5,
                    sourceReference: 'Finance Act'
                })
            });
            assert_1.default.strictEqual(commercial.taxAmount, null);
            assert_1.default.strictEqual(commercial.taxableAmount, null);
            assert_1.default.strictEqual(commercial.vatAmount, null);
            assert_1.default.strictEqual(commercial.presumptiveTaxAmount, null);
            assert_1.default.strictEqual(commercial.incomeTaxAmount, null);
            assert_1.default.notStrictEqual(commercial.taxCalculationStatus, 'CALCULATED');
            assert_1.default.ok(commercial.taxTypesRelevant.includes('VAT'));
            assert_1.default.strictEqual(commercial.taxProfileSnapshot.vatSupplyTreatment, 'STANDARD_TAXABLE');
            const vatRef = commercial.taxRuleReferences.find((row) => row.taxType === 'VAT');
            assert_1.default.ok(vatRef);
            assert_1.default.strictEqual(vatRef.taxAmount, null);
            assert_1.default.strictEqual(vatRef.configuredRate, 15.5);
            assert_1.default.strictEqual(vatRef.ruleVersion, 2);
            results['Commercial VAT-registered rent stores rule metadata without calculating tax'] = 'PASS';
        }
        {
            const first = (0, taxClassificationService_1.buildTaxClassification)({
                sourceKind: 'PAYMENT_RENT',
                transactionDate: new Date('2026-03-15T00:00:00.000Z'),
                vatRegistered: true,
                rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
                incomeTaxRegistered: false,
                propertyUseClass: 'COMMERCIAL',
                vatSupplyTreatment: 'STANDARD_TAXABLE',
                rentalTaxTreatment: 'PRESUMPTIVE_RENTAL',
                ownerProfileVersion: 1
            });
            const later = (0, taxClassificationService_1.buildTaxClassification)({
                sourceKind: 'PAYMENT_RENT',
                transactionDate: new Date('2026-09-15T00:00:00.000Z'),
                vatRegistered: false,
                rentalTaxRegime: 'SELF_ASSESSMENT',
                incomeTaxRegistered: true,
                propertyUseClass: 'COMMERCIAL',
                vatSupplyTreatment: 'ACCOUNTANT_REVIEW',
                rentalTaxTreatment: 'SELF_ASSESSMENT',
                ownerProfileVersion: 2
            });
            assert_1.default.strictEqual(first.taxProfileSnapshot.vatRegistered, true);
            assert_1.default.strictEqual(first.taxProfileSnapshot.rentalTaxRegime, 'PRESUMPTIVE_RENTAL');
            assert_1.default.strictEqual(first.taxProfileSnapshot.ownerProfileVersion, 1);
            assert_1.default.strictEqual(later.taxProfileSnapshot.vatRegistered, false);
            assert_1.default.strictEqual(later.taxProfileSnapshot.rentalTaxRegime, 'SELF_ASSESSMENT');
            assert_1.default.strictEqual(later.taxProfileSnapshot.ownerProfileVersion, 2);
            assert_1.default.notStrictEqual(first.taxProfileSnapshot.rentalTaxRegime, later.taxProfileSnapshot.rentalTaxRegime);
            const snapshotModel = srcFile('models/TransactionTaxSnapshot.ts');
            assert_1.default.ok(snapshotModel.includes('Tax snapshots are immutable after posting'));
            assert_1.default.ok(snapshotModel.includes('cannot be updated in place'));
            results['Changing the live profile does not rewrite an earlier classification snapshot'] = 'PASS';
        }
        {
            const residential = (0, taxClassificationService_1.buildTaxClassification)({
                sourceKind: 'PAYMENT_RENT',
                transactionDate: new Date('2026-09-17T00:00:00.000Z'),
                vatRegistered: false,
                rentalTaxRegime: 'ACCOUNTANT_REVIEW',
                incomeTaxRegistered: false,
                propertyUseClass: 'RESIDENTIAL_DWELLING',
                vatSupplyTreatment: 'EXEMPT',
                rentalTaxTreatment: 'ACCOUNTANT_REVIEW'
            });
            assert_1.default.strictEqual(residential.vatTreatment, 'EXEMPT');
            assert_1.default.strictEqual(residential.taxCalculationStatus, 'REVIEW_REQUIRED');
            assert_1.default.strictEqual(residential.vatAmount, null);
            results['Residential treatment comes from the property profile, not a Phase D hard-code'] = 'PASS';
        }
        {
            const missingRule = (0, taxClassificationService_1.buildTaxClassification)({
                sourceKind: 'PAYMENT_RENT',
                transactionDate: new Date('2026-09-17T00:00:00.000Z'),
                vatRegistered: true,
                rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
                incomeTaxRegistered: false,
                propertyUseClass: 'COMMERCIAL',
                vatSupplyTreatment: 'STANDARD_TAXABLE',
                rentalTaxTreatment: 'PRESUMPTIVE_RENTAL'
            });
            assert_1.default.ok(missingRule.reviewReasons.includes('TAX_RULE_UNAVAILABLE'));
            assert_1.default.strictEqual(missingRule.vatAmount, null);
            results['Missing tax-rule references stay uncalculated and require review'] = 'PASS';
        }
        {
            const expense = (0, taxClassificationService_1.buildTaxClassification)({
                sourceKind: 'EXPENSE',
                transactionDate: new Date('2026-09-17T00:00:00.000Z'),
                vatRegistered: true,
                rentalTaxRegime: 'ACCOUNTANT_REVIEW',
                incomeTaxRegistered: false,
                propertyUseClass: 'COMMERCIAL',
                vatSupplyTreatment: 'STANDARD_TAXABLE',
                userDeductibility: 'ACCOUNTANT_REVIEW',
                userCapitalOrRevenue: 'REVENUE',
                vatRule: rule({ taxType: 'VAT', ruleCode: 'ZW_VAT_STANDARD', rate: 15.5 })
            });
            assert_1.default.strictEqual(expense.vatAmount, null);
            assert_1.default.ok(expense.reviewReasons.includes('MISSING_EXPENSE_CLASSIFICATION'));
            const capital = (0, taxClassificationService_1.buildTaxClassification)({
                sourceKind: 'CAPITAL',
                transactionDate: new Date('2026-09-17T00:00:00.000Z'),
                vatRegistered: false,
                rentalTaxRegime: 'ACCOUNTANT_REVIEW',
                incomeTaxRegistered: false,
                propertyUseClass: 'COMMERCIAL',
                userCapitalOrRevenue: 'CAPITAL'
            });
            assert_1.default.strictEqual(capital.capitalOrRevenue, 'CAPITAL');
            assert_1.default.strictEqual(capital.taxAmount, null);
            results['Expenses and capital receive metadata without input-VAT journals'] = 'PASS';
        }
        {
            const deposit = (0, taxClassificationService_1.buildTaxClassification)({
                sourceKind: 'PAYMENT_DEPOSIT',
                transactionDate: new Date('2026-09-17T00:00:00.000Z'),
                vatRegistered: true,
                rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
                incomeTaxRegistered: false,
                propertyUseClass: 'COMMERCIAL',
                vatSupplyTreatment: 'STANDARD_TAXABLE',
                rentalTaxTreatment: 'PRESUMPTIVE_RENTAL'
            });
            assert_1.default.strictEqual(deposit.taxCalculationStatus, 'NOT_APPLICABLE');
            assert_1.default.ok(!deposit.taxTypesRelevant.includes('PRESUMPTIVE_RENTAL_INCOME_TAX'));
            assert_1.default.strictEqual(deposit.vatAmount, null);
            results['Tenant deposits are not rental income and are not taxed in Phase D'] = 'PASS';
        }
        {
            const amounts = (0, taxMetadataTypes_1.uncalculatedTaxFields)();
            assert_1.default.strictEqual(amounts.taxAmount, null);
            assert_1.default.strictEqual(amounts.vatAmount, null);
            const metadata = srcFile('services/taxClassificationService.ts');
            const attach = srcFile('services/individualTaxMetadataService.ts');
            assert_1.default.ok(!metadata.includes('taxableAmount *'));
            assert_1.default.ok(!metadata.includes(' * rate'));
            assert_1.default.ok(!attach.includes('taxableAmount *'));
            assert_1.default.ok(!attach.includes('vatPayable'));
            assert_1.default.ok(!attach.includes('presumptiveTaxPayable'));
            assert_1.default.ok(!attach.includes('incomeTaxPayable'));
            assert_1.default.ok(attach.includes('TAX_METADATA_CREATED'));
            assert_1.default.ok(attach.includes('TAX_PERIOD_ASSIGNED'));
            assert_1.default.ok(attach.includes('TAX_RULE_RESOLVED'));
            assert_1.default.ok(attach.includes('TAX_PROFILE_SNAPSHOT_CREATED'));
            assert_1.default.ok(attach.includes('noAutomaticRepair: true') || attach.includes('detectionOnly: true'));
            results['Phase D does not calculate or post tax amounts'] = 'PASS';
        }
        {
            const orch = srcFile('services/paymentAccountingOrchestrator.ts');
            assert_1.default.ok(orch.includes('export async function postPaymentAccounting'));
            assert_1.default.ok(orch.includes('individualTaxMetadataService.safeAttachForPayment'));
            const accounting = srcFile('services/individualAccountingService.ts');
            assert_1.default.ok(accounting.includes('individualTaxMetadataService.attachForLandlordEntry'));
            assert_1.default.ok(!srcFile('services/individualTaxMetadataService.ts').includes('Payment.updateMany'));
            assert_1.default.ok(!srcFile('models/TransactionTaxSnapshot.ts').includes('taxAmount = taxableAmount'));
            results['Rent path unchanged; metadata attach is new-only and not a historical backfill'] = 'PASS';
        }
        {
            const routes = srcFile('routes/individualRoutes.ts');
            assert_1.default.ok(routes.includes("router.get('/tax/periods'"));
            assert_1.default.ok(routes.includes("router.post('/tax/periods'"));
            assert_1.default.ok(routes.includes("router.get('/tax/review'"));
            assert_1.default.ok(routes.includes('taxPeriodId'));
            assert_1.default.ok(routes.includes('taxCalculationStatus'));
            results['Tax period, review, and report-filter APIs exist'] = 'PASS';
        }
        console.log(JSON.stringify(results, null, 2));
        const failed = Object.values(results).filter((value) => value !== 'PASS');
        if (failed.length)
            throw new Error('Phase D tests failed');
        console.log('Phase D individual tax metadata tests: ALL PASS');
    });
}
run().catch((error) => {
    console.error(error);
    process.exit(1);
});
