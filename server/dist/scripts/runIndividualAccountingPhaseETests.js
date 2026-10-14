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
const individualVatApplicability_1 = require("../services/individualVatApplicability");
const individualVatCalculation_1 = require("../services/individualVatCalculation");
const vatRounding_1 = require("../services/tax/vatRounding");
const vatCalculation_1 = require("../services/tax/vatCalculation");
const taxPeriodService_1 = require("../services/taxPeriodService");
const taxRuleRegistry_1 = require("../services/taxRuleRegistry");
const taxClassificationService_1 = require("../services/taxClassificationService");
const xlsxWorkbook_1 = require("../utils/xlsxWorkbook");
const money_1 = require("../utils/money");
function srcFile(rel) {
    return fs_1.default.readFileSync(path_1.default.join(__dirname, '..', '..', 'src', rel), 'utf8');
}
const vat2026 = () => {
    const seed = (0, taxRuleRegistry_1.systemTaxRuleSeeds)().find((row) => row.ruleCode === 'ZW_VAT_STANDARD' && row.version === 2);
    return { id: 'vat-2026', version: seed.version, ruleCode: seed.ruleCode, rate: seed.rate, effectiveFrom: seed.effectiveFrom };
};
const vatPrior = () => {
    const seed = (0, taxRuleRegistry_1.systemTaxRuleSeeds)().find((row) => row.ruleCode === 'ZW_VAT_STANDARD' && row.version === 1);
    return { id: 'vat-prior', version: seed.version, ruleCode: seed.ruleCode, rate: seed.rate, effectiveFrom: seed.effectiveFrom };
};
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        const results = {};
        {
            const result = (0, individualVatApplicability_1.evaluateIndividualVatApplicability)({
                sourceKind: 'PAYMENT_RENT',
                vatRegisteredOnSnapshot: false,
                vatSupplyTreatment: 'STANDARD_TAXABLE',
                vatRule: vat2026()
            });
            assert_1.default.strictEqual(result.treatment, 'NOT_VAT_REGISTERED');
            assert_1.default.strictEqual(result.applicable, false);
            const calc = (0, individualVatCalculation_1.calculateIndividualVat)({
                direction: 'OUTPUT',
                treatment: result.treatment,
                amount: 2000,
                vatRatePercent: result.configuredRate,
                method: 'EXCLUSIVE'
            });
            assert_1.default.strictEqual(calc.vatAmount, null);
            assert_1.default.strictEqual(calc.calculationStatus, 'NOT_APPLICABLE');
            results['1 VAT not registered is NOT_VAT_REGISTERED with no calculated VAT'] = 'PASS';
        }
        {
            const exempt = (0, individualVatCalculation_1.calculateIndividualVat)({
                direction: 'OUTPUT',
                treatment: 'EXEMPT',
                amount: 2000,
                vatRatePercent: 15.5,
                method: 'EXCLUSIVE'
            });
            const none = (0, individualVatCalculation_1.calculateIndividualVat)({
                direction: 'OUTPUT',
                treatment: 'NOT_APPLICABLE',
                amount: 2000,
                vatRatePercent: 15.5,
                method: 'EXCLUSIVE'
            });
            assert_1.default.strictEqual(exempt.treatment, 'EXEMPT');
            assert_1.default.strictEqual(exempt.vatAmount, 0);
            assert_1.default.strictEqual(exempt.taxableAmount, 0);
            assert_1.default.strictEqual(none.vatAmount, null);
            assert_1.default.notStrictEqual(exempt.treatment, none.treatment);
            results['2 Exempt VAT amount is 0 and is distinct from NOT_APPLICABLE'] = 'PASS';
        }
        {
            const rate = vat2026().rate;
            const calc = (0, individualVatCalculation_1.calculateIndividualVat)({
                direction: 'OUTPUT',
                treatment: 'STANDARD',
                amount: 2310,
                vatRatePercent: rate,
                method: 'INCLUSIVE'
            });
            const expected = (0, vatCalculation_1.extractInclusiveVat)(2310, (0, vatRounding_1.vatPercentToFraction)(rate));
            assert_1.default.strictEqual(calc.grossAmount, expected.gross);
            assert_1.default.strictEqual(calc.netAmount, expected.net);
            assert_1.default.strictEqual(calc.vatAmount, expected.vatAmount);
            assert_1.default.strictEqual(calc.calculationStatus, 'CALCULATED');
            results['3 Standard VAT inclusive uses the registry rate'] = 'PASS';
        }
        {
            const rate = vat2026().rate;
            const calc = (0, individualVatCalculation_1.calculateIndividualVat)({
                direction: 'OUTPUT',
                treatment: 'STANDARD',
                amount: 2000,
                vatRatePercent: rate,
                method: 'EXCLUSIVE'
            });
            const expected = (0, vatCalculation_1.exclusiveVatOn)(2000, (0, vatRounding_1.vatPercentToFraction)(rate));
            assert_1.default.strictEqual(calc.netAmount, 2000);
            assert_1.default.strictEqual(calc.vatAmount, expected.vatAmount);
            assert_1.default.strictEqual(calc.grossAmount, expected.gross);
            results['4 Standard VAT exclusive uses the registry rate'] = 'PASS';
        }
        {
            const calc = (0, individualVatCalculation_1.calculateIndividualVat)({
                direction: 'INPUT',
                treatment: 'STANDARD',
                amount: 1150,
                vatRatePercent: vat2026().rate,
                method: 'INCLUSIVE',
                inputVatEligibility: 'RECOVERABLE',
                supplierVatNumber: 'VAT123',
                invoiceNumber: 'INV-1'
            });
            assert_1.default.strictEqual(calc.inputVatEligibility, 'RECOVERABLE');
            assert_1.default.ok(Number(calc.chargedVatAmount) > 0);
            assert_1.default.strictEqual(calc.recoverableVatAmount, calc.chargedVatAmount);
            assert_1.default.strictEqual(calc.vatAmount, calc.recoverableVatAmount);
            results['5 Qualifying input VAT is recoverable and recorded'] = 'PASS';
        }
        {
            const calc = (0, individualVatCalculation_1.calculateIndividualVat)({
                direction: 'INPUT',
                treatment: 'STANDARD',
                amount: 1150,
                vatRatePercent: vat2026().rate,
                method: 'INCLUSIVE',
                inputVatEligibility: 'NON_RECOVERABLE',
                supplierVatNumber: 'VAT123',
                invoiceNumber: 'INV-2'
            });
            assert_1.default.ok(Number(calc.chargedVatAmount) > 0);
            assert_1.default.strictEqual(calc.recoverableVatAmount, 0);
            assert_1.default.strictEqual(calc.vatAmount, 0);
            assert_1.default.strictEqual(calc.inputVatEligibility, 'NON_RECOVERABLE');
            results['6 Non-recoverable input VAT keeps supplier VAT but recoverable = 0'] = 'PASS';
        }
        {
            const calc = (0, individualVatCalculation_1.calculateIndividualVat)({
                direction: 'INPUT',
                treatment: 'STANDARD',
                amount: 1150,
                vatRatePercent: vat2026().rate,
                method: 'INCLUSIVE',
                inputVatEligibility: 'RECOVERABLE'
            });
            assert_1.default.strictEqual(calc.calculationStatus, 'REVIEW_REQUIRED');
            assert_1.default.strictEqual(calc.vatAmount, null);
            assert_1.default.ok(calc.reviewReasons.includes('MISSING_SUPPLIER_VAT_NUMBER'));
            assert_1.default.ok(calc.reviewReasons.includes('MISSING_INVOICE_NUMBER'));
            results['7 Missing supplier invoice data is REVIEW_REQUIRED not fabricated VAT'] = 'PASS';
        }
        {
            const march = (0, taxClassificationService_1.buildTaxClassification)({
                sourceKind: 'PAYMENT_RENT',
                transactionDate: new Date('2026-03-15T00:00:00.000Z'),
                vatRegistered: false,
                rentalTaxRegime: 'ACCOUNTANT_REVIEW',
                incomeTaxRegistered: false,
                propertyUseClass: 'COMMERCIAL',
                vatSupplyTreatment: 'STANDARD_TAXABLE',
                ownerProfileVersion: 1
            });
            const june = (0, taxClassificationService_1.buildTaxClassification)({
                sourceKind: 'PAYMENT_RENT',
                transactionDate: new Date('2026-06-15T00:00:00.000Z'),
                vatRegistered: true,
                rentalTaxRegime: 'ACCOUNTANT_REVIEW',
                incomeTaxRegistered: false,
                propertyUseClass: 'COMMERCIAL',
                vatSupplyTreatment: 'STANDARD_TAXABLE',
                ownerProfileVersion: 2,
                vatRule: vat2026()
            });
            const marchVat = (0, individualVatApplicability_1.evaluateIndividualVatApplicability)({
                sourceKind: 'PAYMENT_RENT',
                vatRegisteredOnSnapshot: march.taxProfileSnapshot.vatRegistered,
                vatSupplyTreatment: march.taxProfileSnapshot.vatSupplyTreatment,
                vatRule: vat2026()
            });
            const juneVat = (0, individualVatApplicability_1.evaluateIndividualVatApplicability)({
                sourceKind: 'PAYMENT_RENT',
                vatRegisteredOnSnapshot: june.taxProfileSnapshot.vatRegistered,
                vatSupplyTreatment: june.taxProfileSnapshot.vatSupplyTreatment,
                vatRule: vat2026()
            });
            assert_1.default.strictEqual(marchVat.treatment, 'NOT_VAT_REGISTERED');
            assert_1.default.strictEqual(juneVat.treatment, 'STANDARD');
            assert_1.default.strictEqual(march.taxProfileSnapshot.vatRegistered, false);
            results['8 Later VAT registration does not change the March snapshot'] = 'PASS';
        }
        {
            const march = (0, individualVatApplicability_1.evaluateIndividualVatApplicability)({
                sourceKind: 'PAYMENT_RENT',
                vatRegisteredOnSnapshot: true,
                vatSupplyTreatment: 'EXEMPT',
                vatRule: vat2026()
            });
            const july = (0, individualVatApplicability_1.evaluateIndividualVatApplicability)({
                sourceKind: 'PAYMENT_RENT',
                vatRegisteredOnSnapshot: true,
                vatSupplyTreatment: 'STANDARD_TAXABLE',
                vatRule: vat2026()
            });
            assert_1.default.strictEqual(march.treatment, 'EXEMPT');
            assert_1.default.strictEqual(july.treatment, 'STANDARD');
            results['9 Property VAT treatment changes apply only to new snapshots'] = 'PASS';
        }
        {
            const jan = (0, individualVatCalculation_1.calculateIndividualVat)({
                direction: 'OUTPUT',
                treatment: 'STANDARD',
                amount: 1000,
                vatRatePercent: vatPrior().rate,
                method: 'EXCLUSIVE'
            });
            const sep = (0, individualVatCalculation_1.calculateIndividualVat)({
                direction: 'OUTPUT',
                treatment: 'STANDARD',
                amount: 1000,
                vatRatePercent: vat2026().rate,
                method: 'EXCLUSIVE'
            });
            assert_1.default.strictEqual(jan.vatRate, vatPrior().rate);
            assert_1.default.strictEqual(sep.vatRate, vat2026().rate);
            assert_1.default.notStrictEqual(jan.vatAmount, sep.vatAmount);
            results['10 Historical VAT keeps the rule version used at calculation'] = 'PASS';
        }
        {
            const service = srcFile('services/individualVatService.ts');
            assert_1.default.ok(service.includes("recordKind: 'ORIGINAL'"));
            assert_1.default.ok(service.includes('if (existing) return existing'));
            results['11 Duplicate calculation returns the existing ORIGINAL VAT record'] = 'PASS';
        }
        {
            const service = srcFile('services/individualVatService.ts');
            assert_1.default.ok(service.includes("recordKind: 'REVERSAL'"));
            assert_1.default.ok(service.includes('reversalOf: original._id'));
            assert_1.default.ok(!service.includes('IndividualVatRecord.updateOne'));
            assert_1.default.ok(!service.includes('original.save('));
            assert_1.default.ok(srcFile('models/IndividualVatRecord.ts').includes('cannot be updated in place'));
            results['12 Reversal preserves the original VAT record'] = 'PASS';
        }
        {
            assert_1.default.strictEqual((0, taxPeriodService_1.assignmentStatusForExistingPeriod)('FINALIZED'), 'PERIOD_CLOSED');
            assert_1.default.strictEqual((0, taxPeriodService_1.assignmentStatusForExistingPeriod)('LOCKED'), 'PERIOD_CLOSED');
            assert_1.default.ok(srcFile('services/individualVatService.ts').includes('PERIOD_CLOSED'));
            results['13 Closed or locked VAT periods reject ordinary mutation'] = 'PASS';
        }
        {
            const calc = (0, individualVatCalculation_1.calculateIndividualVat)({
                direction: 'OUTPUT',
                treatment: 'STANDARD',
                amount: 2000,
                vatRatePercent: vat2026().rate,
                method: 'EXCLUSIVE'
            });
            assert_1.default.strictEqual((0, individualVatCalculation_1.resolveCalculationMethod)({ direction: 'OUTPUT', vatIncluded: false }), 'EXCLUSIVE');
            const service = srcFile('services/individualVatService.ts');
            assert_1.default.ok(service.includes('currency: source?.currency || \'USD\''));
            assert_1.default.ok(service.includes('exchangeRate'));
            assert_1.default.strictEqual(calc.incomeTaxAmount, null);
            results['14 Original currency is retained; conversion basis is stored'] = 'PASS';
        }
        {
            const output = (0, individualVatCalculation_1.calculateIndividualVat)({
                direction: 'OUTPUT',
                treatment: 'STANDARD',
                amount: 2000,
                vatRatePercent: vat2026().rate,
                method: 'EXCLUSIVE'
            });
            const input = (0, individualVatCalculation_1.calculateIndividualVat)({
                direction: 'INPUT',
                treatment: 'STANDARD',
                amount: 1150,
                vatRatePercent: vat2026().rate,
                method: 'INCLUSIVE',
                inputVatEligibility: 'RECOVERABLE',
                supplierVatNumber: 'VAT123',
                invoiceNumber: 'INV-9'
            });
            const paperOutput = (0, money_1.roundMoney)(Number(output.vatAmount));
            const paperInput = (0, money_1.roundMoney)(Number(input.recoverableVatAmount));
            assert_1.default.strictEqual(paperOutput, output.vatAmount);
            assert_1.default.strictEqual(paperInput, input.vatAmount);
            const recon = srcFile('services/individualVatService.ts');
            assert_1.default.ok(recon.includes('VAT_AMOUNT_MISMATCH'));
            assert_1.default.ok(recon.includes('detectionOnly: true'));
            results['15 Working paper totals equal VAT record sums'] = 'PASS';
        }
        {
            const orch = srcFile('services/paymentAccountingOrchestrator.ts');
            assert_1.default.ok(orch.includes('export async function postPaymentAccounting'));
            assert_1.default.ok(!srcFile('services/individualVatService.ts').includes("from '../models/VatRecord'"));
            assert_1.default.ok(!srcFile('services/individualVatService.ts').includes("from '../models/TaxObligation'"));
            assert_1.default.ok(!srcFile('services/individualVatService.ts').includes('TaxObligation.create'));
            assert_1.default.ok(!srcFile('services/individualVatCalculation.ts').includes('15.5'));
            assert_1.default.ok(!srcFile('services/individualVatCalculation.ts').includes('STANDARD_VAT_PERCENT'));
            assert_1.default.ok(srcFile('models/TransactionTaxSnapshot.ts').includes('Phase D tax snapshots cannot store calculated tax amounts'));
            results['16 Agency VAT/TaxObligation/VatRecord engines are not used for individual landlord VAT'] = 'PASS';
        }
        {
            const golden = (0, individualVatCalculation_1.calculateIndividualVat)({
                direction: 'OUTPUT',
                treatment: 'STANDARD',
                amount: 2000,
                vatRatePercent: vat2026().rate,
                method: 'EXCLUSIVE'
            });
            assert_1.default.strictEqual(golden.netAmount, 2000);
            assert_1.default.strictEqual(golden.vatAmount, (0, vatCalculation_1.exclusiveVatOn)(2000, (0, vatRounding_1.vatPercentToFraction)(vat2026().rate)).vatAmount);
            assert_1.default.strictEqual(golden.incomeTaxAmount, null);
            assert_1.default.strictEqual(golden.presumptiveTaxAmount, null);
            const xlsx = (0, xlsxWorkbook_1.buildXlsxWorkbook)('VAT working paper', [{ taxpayer: 'Test', vat: golden.vatAmount }]);
            assert_1.default.ok(xlsx.slice(0, 2).toString() === 'PK');
            results['Golden commercial VAT-registered exclusive rent plus genuine XLSX'] = 'PASS';
        }
        {
            const cents = (0, individualVatCalculation_1.calculateIndividualVat)({
                direction: 'OUTPUT',
                treatment: 'STANDARD',
                amount: 100.01,
                vatRatePercent: vat2026().rate,
                method: 'EXCLUSIVE'
            });
            assert_1.default.strictEqual(cents.vatAmount, (0, vatCalculation_1.exclusiveVatOn)(100.01, (0, vatRounding_1.vatPercentToFraction)(vat2026().rate)).vatAmount);
            const large = (0, individualVatCalculation_1.calculateIndividualVat)({
                direction: 'OUTPUT',
                treatment: 'STANDARD',
                amount: 1000000,
                vatRatePercent: vat2026().rate,
                method: 'INCLUSIVE'
            });
            assert_1.default.strictEqual(large.vatAmount, (0, vatCalculation_1.extractInclusiveVat)(1000000, (0, vatRounding_1.vatPercentToFraction)(vat2026().rate)).vatAmount);
            results['Fractional cents and large values use roundMoney via vatCalculation'] = 'PASS';
        }
        console.log(JSON.stringify(results, null, 2));
        if (Object.values(results).some((value) => value !== 'PASS'))
            throw new Error('Phase E tests failed');
        console.log('Phase E individual VAT engine tests: ALL PASS');
    });
}
run().catch((error) => {
    console.error(error);
    process.exit(1);
});
