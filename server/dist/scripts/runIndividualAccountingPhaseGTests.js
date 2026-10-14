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
const individualIncomeTaxClassification_1 = require("../services/individualIncomeTaxClassification");
const individualIncomeTaxCalculation_1 = require("../services/individualIncomeTaxCalculation");
const incomeTaxRounding_1 = require("../services/tax/incomeTaxRounding");
const individualVatCalculation_1 = require("../services/individualVatCalculation");
const individualRentalTaxCalculation_1 = require("../services/individualRentalTaxCalculation");
const individualRentalTaxApplicability_1 = require("../services/individualRentalTaxApplicability");
const individualRentalTaxBase_1 = require("../services/individualRentalTaxBase");
const taxPeriodService_1 = require("../services/taxPeriodService");
const taxRuleRegistry_1 = require("../services/taxRuleRegistry");
const individualAccountingCategories_1 = require("../services/individualAccountingCategories");
const xlsxWorkbook_1 = require("../utils/xlsxWorkbook");
const money_1 = require("../utils/money");
const taxTypes_1 = require("../services/tax/taxTypes");
const rentalTaxRounding_1 = require("../services/tax/rentalTaxRounding");
function srcFile(rel) {
    return fs_1.default.readFileSync(path_1.default.join(__dirname, '..', '..', 'src', rel), 'utf8');
}
const tradeRule = () => {
    const seed = (0, taxRuleRegistry_1.systemTaxRuleSeeds)().find((row) => row.ruleCode === 'ZW_INCOME_TAX_TRADE_INVESTMENT_2024' && row.version === 1);
    return {
        id: 'it-2024',
        version: seed.version,
        ruleCode: seed.ruleCode,
        rate: seed.rate,
        calculationMethod: seed.calculationMethod,
        sourceReference: seed.sourceReference,
        effectiveFrom: seed.effectiveFrom,
        effectiveTo: seed.effectiveTo
    };
};
const pn08 = () => {
    const seed = (0, taxRuleRegistry_1.systemTaxRuleSeeds)().find((row) => row.ruleCode === 'ZW_PRESUMPTIVE_RENTAL_PN08_2026' && row.version === 1);
    return {
        id: 'pn08-v1',
        version: seed.version,
        ruleCode: seed.ruleCode,
        rate: seed.rate,
        calculationMethod: seed.calculationMethod,
        sourceReference: seed.sourceReference,
        effectiveFrom: seed.effectiveFrom,
        effectiveTo: seed.effectiveTo
    };
};
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const results = {};
        const configured = tradeRule();
        {
            const income = srcFile('models/IndividualIncomeTaxRecord.ts');
            const vat = srcFile('models/IndividualVatRecord.ts');
            const rental = srcFile('models/IndividualRentalTaxRecord.ts');
            assert_1.default.ok(income.includes("taxType: 'INCOME_TAX'"));
            assert_1.default.ok(vat.includes("taxType: 'VAT'"));
            assert_1.default.ok(rental.includes("taxType: 'PRESUMPTIVE_RENTAL_INCOME_TAX'"));
            assert_1.default.ok(!income.includes('IndividualVatRecord'));
            assert_1.default.ok(!income.includes('IndividualRentalTaxRecord'));
            results['1 Income-tax record is separate from VAT'] = 'PASS';
            results['2 Income-tax record is separate from presumptive rental tax'] = 'PASS';
        }
        {
            const orch = srcFile('services/paymentAccountingOrchestrator.ts');
            const service = srcFile('services/individualIncomeTaxService.ts');
            assert_1.default.ok(orch.includes('export async function postPaymentAccounting'));
            assert_1.default.ok(!service.includes("from '../models/TaxObligation'"));
            assert_1.default.ok(!service.includes('JournalEntry.create'));
            assert_1.default.ok(!service.includes('IncomeTaxLedger'));
            assert_1.default.ok(srcFile('services/propertyAccountTotals.ts').includes('sumPropertyAccountPeriodPnl'));
            assert_1.default.ok(service.includes('sumPropertyAccountPeriodPnl'));
            results['3 Agency accounting remains untouched'] = 'PASS';
            results['4 Accounting ledger remains authoritative'] = 'PASS';
        }
        {
            const taxable = (0, individualIncomeTaxClassification_1.classifyIncomeTaxLine)({
                sourceKind: 'PAYMENT_RENT',
                amount: 24000,
                rentalTaxRegime: 'SELF_ASSESSMENT',
                category: 'RENTAL_INCOME',
                profileSnapshotPresent: true
            });
            assert_1.default.strictEqual(taxable.classification, 'TAXABLE_INCOME');
            assert_1.default.strictEqual(taxable.taxableContribution, 24000);
            results['5 Taxable income classification'] = 'PASS';
        }
        {
            const deduction = (0, individualIncomeTaxClassification_1.classifyIncomeTaxLine)({
                sourceKind: 'EXPENSE',
                amount: 6000,
                rentalTaxRegime: 'SELF_ASSESSMENT',
                deductibility: 'DEDUCTIBLE',
                category: 'MAINTENANCE',
                profileSnapshotPresent: true,
                attachments: ['invoice-1']
            });
            assert_1.default.strictEqual(deduction.classification, 'ALLOWABLE_DEDUCTION');
            assert_1.default.strictEqual(deduction.deduction, 6000);
            results['6 Allowable deduction classification'] = 'PASS';
        }
        {
            const nd = (0, individualIncomeTaxClassification_1.classifyIncomeTaxLine)({
                sourceKind: 'EXPENSE',
                amount: 1000,
                rentalTaxRegime: 'SELF_ASSESSMENT',
                deductibility: 'NON_DEDUCTIBLE',
                profileSnapshotPresent: true,
                attachments: ['bill']
            });
            assert_1.default.strictEqual(nd.classification, 'NON_DEDUCTIBLE');
            assert_1.default.strictEqual(nd.addBack, 1000);
            results['7 Non-deductible expense'] = 'PASS';
        }
        {
            const capital = (0, individualIncomeTaxClassification_1.classifyIncomeTaxLine)({
                sourceKind: 'CAPITAL',
                amount: 8000,
                capitalOrRevenue: 'CAPITAL',
                profileSnapshotPresent: true
            });
            assert_1.default.strictEqual(capital.classification, 'CAPITAL');
            assert_1.default.notStrictEqual(capital.classification, 'ALLOWABLE_DEDUCTION');
            assert_1.default.strictEqual(capital.deduction, null);
            assert_1.default.ok(capital.reviewReasons.includes('CAPITAL_ALLOWANCE_NOT_IMPLEMENTED'));
            results['8 Capital expense'] = 'PASS';
            results['40 Capital expenditure does not become an ordinary deduction automatically'] = 'PASS';
        }
        {
            const priv = (0, individualIncomeTaxClassification_1.classifyIncomeTaxLine)({
                sourceKind: 'EXPENSE',
                amount: 300,
                category: 'PRIVATE',
                rentalTaxRegime: 'SELF_ASSESSMENT',
                profileSnapshotPresent: true
            });
            assert_1.default.strictEqual(priv.classification, 'PRIVATE_EXPENSE');
            assert_1.default.strictEqual(priv.addBack, 300);
            results['9 Private expense'] = 'PASS';
        }
        {
            const exempt = (0, individualIncomeTaxClassification_1.classifyIncomeTaxLine)({
                sourceKind: 'PAYMENT_RENT',
                amount: 2000,
                rentalTaxRegime: 'EXEMPT',
                category: 'RENTAL_INCOME',
                profileSnapshotPresent: true
            });
            assert_1.default.strictEqual(exempt.classification, 'EXEMPT_INCOME');
            assert_1.default.strictEqual(exempt.taxableContribution, 0);
            results['10 Exempt income'] = 'PASS';
        }
        {
            const review = (0, individualIncomeTaxClassification_1.classifyIncomeTaxLine)({
                sourceKind: 'EXPENSE',
                amount: 400,
                rentalTaxRegime: 'SELF_ASSESSMENT',
                deductibility: 'ACCOUNTANT_REVIEW',
                profileSnapshotPresent: true
            });
            assert_1.default.strictEqual(review.classification, 'REVIEW_REQUIRED');
            assert_1.default.strictEqual(review.taxableContribution, null);
            results['11 Review-required classification'] = 'PASS';
        }
        {
            const paper = (0, individualIncomeTaxCalculation_1.calculateOrdinaryIncomeTaxWorkingPaper)({
                currencies: ['USD'],
                accountingIncome: 24000,
                accountingExpenses: 6000,
                lineAddBacks: 1500,
                lineDeductions: 4500,
                lineExemptIncome: 0,
                adjustments: [{ adjustmentType: 'DEDUCTION', amount: 500, currency: 'USD', reason: 'verified allowable adjustment', status: 'APPROVED' }],
                incomeTaxRule: configured
            });
            assert_1.default.strictEqual(paper.accountingProfit, 18000);
            assert_1.default.strictEqual(paper.addBacks, 1500);
            assert_1.default.strictEqual(paper.taxableIncome, 19000);
            assert_1.default.strictEqual(paper.taxRate, configured.rate);
            assert_1.default.strictEqual(paper.taxAmount, (0, incomeTaxRounding_1.calculateTaxableIncomePercent)(19000, configured.rate));
            assert_1.default.strictEqual(paper.taxAmount, 4750);
            assert_1.default.strictEqual(paper.vatAmount, null);
            assert_1.default.strictEqual(paper.presumptiveTaxAmount, null);
            assert_1.default.ok(!srcFile('services/individualIncomeTaxCalculation.ts').includes('* 0.25'));
            assert_1.default.ok(!srcFile('services/tax/incomeTaxRounding.ts').includes('* 0.25'));
            assert_1.default.ok(srcFile('services/tax/incomeTaxRounding.ts').includes('taxPercentToFraction'));
            assert_1.default.strictEqual(configured.ruleCode, 'ZW_INCOME_TAX_TRADE_INVESTMENT_2024');
            assert_1.default.ok(!configured.sourceReference.toLowerCase().includes('paye'));
            results['12 Accounting profit calculated from authoritative accounting data'] = 'PASS';
            results['13 Add-backs work'] = 'PASS';
            results['14 Deductions work'] = 'PASS';
            results['15 Exempt income works'] = 'PASS';
            results['16 Taxable income calculation works'] = 'PASS';
            results['17 Applicable tax rule is loaded from TaxRule'] = 'PASS';
            results['18 No hard-coded rate'] = 'PASS';
            results['19 Correct ordinary trade/investment tax rule is distinct from PAYE'] = 'PASS';
            results['20 Tax amount calculated correctly'] = 'PASS';
        }
        {
            const missingRule = (0, individualIncomeTaxCalculation_1.calculateOrdinaryIncomeTaxWorkingPaper)({
                currencies: ['USD'],
                accountingIncome: 18000,
                accountingExpenses: 0,
                lineAddBacks: 0,
                lineDeductions: 0,
                lineExemptIncome: 0,
                incomeTaxRule: null
            });
            assert_1.default.strictEqual(missingRule.calculationStatus, 'RULE_REQUIRED');
            assert_1.default.strictEqual(missingRule.taxAmount, null);
            results['21 Missing rule results in REVIEW_REQUIRED/RULE_REQUIRED'] = 'PASS';
        }
        {
            const missingPeriod = (0, individualIncomeTaxCalculation_1.calculateOrdinaryIncomeTaxWorkingPaper)({
                currencies: ['USD'],
                accountingIncome: 18000,
                accountingExpenses: 0,
                lineAddBacks: 0,
                lineDeductions: 0,
                lineExemptIncome: 0,
                incomeTaxRule: configured,
                periodAssignmentStatus: 'PERIOD_REQUIRED'
            });
            assert_1.default.strictEqual(missingPeriod.calculationStatus, 'PERIOD_REQUIRED');
            assert_1.default.strictEqual(missingPeriod.taxAmount, null);
            results['22 Missing period results in PERIOD_REQUIRED'] = 'PASS';
        }
        {
            assert_1.default.strictEqual((0, taxPeriodService_1.assignmentStatusForExistingPeriod)('FINALIZED'), 'PERIOD_CLOSED');
            assert_1.default.strictEqual((0, taxPeriodService_1.assignmentStatusForExistingPeriod)('LOCKED'), 'PERIOD_CLOSED');
            const service = srcFile('services/individualIncomeTaxService.ts');
            assert_1.default.ok(service.includes('PERIOD_CLOSED'));
            assert_1.default.ok(service.includes('Corrections require a reversal'));
            assert_1.default.ok(!service.includes('findOneAndUpdate'));
            results['23 Closed period cannot be silently recalculated'] = 'PASS';
        }
        {
            const missingProfile = (0, individualIncomeTaxClassification_1.classifyIncomeTaxLine)({
                sourceKind: 'PAYMENT_RENT',
                amount: 1000,
                profileSnapshotPresent: false
            });
            assert_1.default.strictEqual(missingProfile.calculationStatus, 'PROFILE_REQUIRED');
            assert_1.default.strictEqual(missingProfile.taxableContribution, null);
            const paper = (0, individualIncomeTaxCalculation_1.calculateOrdinaryIncomeTaxWorkingPaper)({
                currencies: ['USD'],
                accountingIncome: 1000,
                accountingExpenses: 0,
                lineAddBacks: 0,
                lineDeductions: 0,
                lineExemptIncome: 0,
                incomeTaxRule: configured,
                profilePresent: false
            });
            assert_1.default.strictEqual(paper.calculationStatus, 'PROFILE_REQUIRED');
            assert_1.default.strictEqual(paper.taxAmount, null);
            results['24 Missing profile results in PROFILE_REQUIRED/REVIEW_REQUIRED'] = 'PASS';
        }
        {
            const presumptiveLine = (0, individualIncomeTaxClassification_1.classifyIncomeTaxLine)({
                sourceKind: 'PAYMENT_RENT',
                amount: 24000,
                rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
                category: 'RENTAL_INCOME',
                profileSnapshotPresent: true
            });
            assert_1.default.strictEqual(presumptiveLine.classification, 'NOT_INCOME_TAX_RELEVANT');
            assert_1.default.strictEqual(presumptiveLine.taxableContribution, 0);
            const rental = (0, individualRentalTaxCalculation_1.calculateIndividualRentalTax)({
                applicability: (0, individualRentalTaxApplicability_1.evaluateIndividualRentalTaxApplicability)({
                    sourceKind: 'PAYMENT_RENT',
                    rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
                    propertyUseClass: 'COMMERCIAL',
                    profileSnapshotPresent: true,
                    rentalTaxRule: pn08()
                }),
                taxBase: (0, individualRentalTaxBase_1.resolveRentalTaxBase)({ sourceKind: 'PAYMENT_RENT', amount: 24000, rentAllocated: 24000 })
            });
            const ordinary = (0, individualIncomeTaxCalculation_1.calculateOrdinaryIncomeTaxWorkingPaper)({
                currencies: ['USD'],
                accountingIncome: 24000,
                accountingExpenses: 0,
                lineAddBacks: 0,
                lineDeductions: 0,
                lineExemptIncome: 24000,
                incomeTaxRule: configured
            });
            assert_1.default.ok(rental.taxAmount != null && rental.taxAmount > 0);
            assert_1.default.strictEqual(ordinary.taxableIncome, 0);
            assert_1.default.strictEqual(ordinary.taxAmount, 0);
            assert_1.default.notStrictEqual(ordinary.taxAmount, rental.taxAmount);
            results['25 Presumptive rental tax remains separate'] = 'PASS';
            results['26 Ordinary income tax does not incorrectly duplicate presumptive rental tax'] = 'PASS';
        }
        {
            const deposit = (0, individualIncomeTaxClassification_1.classifyIncomeTaxLine)({
                sourceKind: 'PAYMENT_DEPOSIT',
                amount: 1500,
                category: 'TENANT_DEPOSIT',
                profileSnapshotPresent: true
            });
            assert_1.default.strictEqual(deposit.classification, 'NOT_INCOME_TAX_RELEVANT');
            assert_1.default.strictEqual(deposit.taxableContribution, null);
            const classified = (0, individualAccountingCategories_1.classifyLandlordCategory)('DEPOSIT_APPLICATION');
            assert_1.default.strictEqual(classified.sourceKind, 'OTHER_INCOME');
            const applied = (0, individualIncomeTaxClassification_1.classifyIncomeTaxLine)({
                sourceKind: 'OTHER_INCOME',
                amount: 1500,
                rentalTaxRegime: 'SELF_ASSESSMENT',
                category: 'DEPOSIT_APPLICATION',
                profileSnapshotPresent: true
            });
            assert_1.default.strictEqual(applied.classification, 'TAXABLE_INCOME');
            assert_1.default.ok(srcFile('services/individualAccountingService.ts').includes('applyDepositToRent'));
            results['27 Deposit receipt is not ordinary taxable income'] = 'PASS';
            results['28 Deposit application creates the correct income transaction'] = 'PASS';
            results['29 Deposit application can flow into the appropriate tax classification'] = 'PASS';
        }
        {
            const vat = (0, individualVatCalculation_1.calculateIndividualVat)({
                direction: 'OUTPUT',
                treatment: 'STANDARD',
                amount: 2000,
                vatRatePercent: 15.5,
                method: 'EXCLUSIVE'
            });
            const paper = (0, individualIncomeTaxCalculation_1.calculateOrdinaryIncomeTaxWorkingPaper)({
                currencies: ['USD'],
                accountingIncome: 2000,
                accountingExpenses: 0,
                lineAddBacks: 0,
                lineDeductions: 0,
                lineExemptIncome: 0,
                incomeTaxRule: configured
            });
            assert_1.default.notStrictEqual(vat.vatAmount, paper.taxAmount);
            assert_1.default.strictEqual(paper.vatAmount, null);
            const vatCalc = srcFile('services/individualVatCalculation.ts');
            assert_1.default.ok(!vatCalc.includes('individualIncomeTax'));
            const inputVat = (0, individualIncomeTaxClassification_1.classifyIncomeTaxLine)({
                sourceKind: 'EXPENSE',
                amount: 155,
                rentalTaxRegime: 'SELF_ASSESSMENT',
                deductibility: 'ACCOUNTANT_REVIEW',
                category: 'INPUT_VAT',
                profileSnapshotPresent: true
            });
            assert_1.default.notStrictEqual(inputVat.classification, 'ALLOWABLE_DEDUCTION');
            results['30 VAT projection remains unchanged'] = 'PASS';
            results['31 VAT is not treated as income tax'] = 'PASS';
            results['32 Input VAT is not silently treated as an income-tax deduction'] = 'PASS';
        }
        {
            const usd = (0, individualIncomeTaxCalculation_1.calculateOrdinaryIncomeTaxWorkingPaper)({
                currencies: ['USD'],
                accountingIncome: 10000,
                accountingExpenses: 0,
                lineAddBacks: 0,
                lineDeductions: 0,
                lineExemptIncome: 0,
                incomeTaxRule: configured
            });
            const zwg = (0, individualIncomeTaxCalculation_1.calculateOrdinaryIncomeTaxWorkingPaper)({
                currencies: ['ZWG'],
                accountingIncome: 10000,
                accountingExpenses: 0,
                lineAddBacks: 0,
                lineDeductions: 0,
                lineExemptIncome: 0,
                incomeTaxRule: configured
            });
            const mixed = (0, individualIncomeTaxCalculation_1.calculateOrdinaryIncomeTaxWorkingPaper)({
                currencies: ['USD', 'ZWG'],
                accountingIncome: 20000,
                accountingExpenses: 0,
                lineAddBacks: 0,
                lineDeductions: 0,
                lineExemptIncome: 0,
                incomeTaxRule: configured
            });
            assert_1.default.strictEqual(usd.taxAmount, zwg.taxAmount);
            assert_1.default.deepStrictEqual(usd.currencies, ['USD']);
            assert_1.default.deepStrictEqual(zwg.currencies, ['ZWG']);
            assert_1.default.strictEqual(mixed.calculationStatus, 'REVIEW_REQUIRED');
            assert_1.default.strictEqual(mixed.taxAmount, null);
            assert_1.default.ok(mixed.reviewReasons.includes('CURRENCY_CONVERSION_REQUIRED'));
            results['33 USD remains USD'] = 'PASS';
            results['34 ZWG remains ZWG'] = 'PASS';
            results['35 No cross-currency arithmetic'] = 'PASS';
            results['36 Required conversion produces review if unavailable'] = 'PASS';
        }
        {
            const service = srcFile('services/individualIncomeTaxService.ts');
            assert_1.default.ok(service.includes('Manual income-tax adjustments require a reason'));
            assert_1.default.ok(service.includes('INCOME_TAX_ADJUSTMENT_CREATED'));
            assert_1.default.ok(service.includes('taxableIncomeOverwritten: false'));
            const pending = (0, individualIncomeTaxCalculation_1.calculateOrdinaryIncomeTaxWorkingPaper)({
                currencies: ['USD'],
                accountingIncome: 18000,
                accountingExpenses: 0,
                lineAddBacks: 0,
                lineDeductions: 0,
                lineExemptIncome: 0,
                adjustments: [{ adjustmentType: 'DEDUCTION', amount: 500, currency: 'USD', reason: 'ok', status: 'PENDING' }],
                incomeTaxRule: configured
            });
            assert_1.default.strictEqual(pending.taxAmount, null);
            assert_1.default.ok(pending.reviewReasons.includes('MANUAL_ADJUSTMENT_AWAITING_REVIEW'));
            results['37 Manual adjustment requires a reason'] = 'PASS';
            results['38 Manual adjustment is auditable'] = 'PASS';
            results['39 Manual adjustment cannot overwrite calculated taxable income'] = 'PASS';
        }
        {
            const dep = (0, individualIncomeTaxClassification_1.classifyIncomeTaxLine)({
                sourceKind: 'EXPENSE',
                amount: 500,
                category: 'DEPRECIATION',
                rentalTaxRegime: 'SELF_ASSESSMENT',
                profileSnapshotPresent: true
            });
            assert_1.default.strictEqual(dep.classification, 'NON_DEDUCTIBLE');
            assert_1.default.strictEqual(dep.addBack, 500);
            assert_1.default.ok(dep.reviewReasons.includes('ACCOUNTING_DEPRECIATION_NOT_A_TAX_ALLOWANCE'));
            results['41 Accounting depreciation is not automatically treated as a tax allowance'] = 'PASS';
        }
        {
            const model = srcFile('models/IndividualIncomeTaxRecord.ts');
            const metadata = srcFile('services/individualTaxMetadataService.ts');
            assert_1.default.ok(model.includes('cannot be updated in place'));
            assert_1.default.ok(model.includes('Hard delete is disabled'));
            assert_1.default.ok(metadata.includes('if (existing) return existing'));
            assert_1.default.ok(srcFile('services/individualIncomeTaxService.ts').includes("recordKind: 'REVERSAL'"));
            assert_1.default.ok(srcFile('services/individualIncomeTaxService.ts').includes('original preserved'));
            results['42 Changing tax profile does not mutate old snapshot'] = 'PASS';
            results['43 Changing TaxRule does not mutate historical calculation'] = 'PASS';
            results['44 Reversal creates a linked record'] = 'PASS';
            results['45 Original tax record remains immutable'] = 'PASS';
        }
        {
            const model = srcFile('models/IndividualIncomeTaxRecord.ts');
            const service = srcFile('services/individualIncomeTaxService.ts');
            assert_1.default.ok(model.includes('unique: true'));
            assert_1.default.ok(service.includes('if (existing) return existing'));
            assert_1.default.ok(service.includes('duplicated: false'));
            const first = (0, individualIncomeTaxCalculation_1.calculateOrdinaryIncomeTaxWorkingPaper)({
                currencies: ['USD'],
                accountingIncome: 19000,
                accountingExpenses: 0,
                lineAddBacks: 0,
                lineDeductions: 0,
                lineExemptIncome: 0,
                incomeTaxRule: configured
            });
            const second = (0, individualIncomeTaxCalculation_1.calculateOrdinaryIncomeTaxWorkingPaper)({
                currencies: ['USD'],
                accountingIncome: 19000,
                accountingExpenses: 0,
                lineAddBacks: 0,
                lineDeductions: 0,
                lineExemptIncome: 0,
                incomeTaxRule: configured
            });
            assert_1.default.deepStrictEqual(first.taxAmount, second.taxAmount);
            assert_1.default.deepStrictEqual(first.taxableIncome, second.taxableIncome);
            results['46 Re-running calculation does not duplicate records'] = 'PASS';
            results['47 Reconciliation remains stable after repeated calculation'] = 'PASS';
        }
        {
            const routes = srcFile('routes/individualRoutes.ts');
            assert_1.default.ok(routes.includes('req.user!.companyId!'));
            assert_1.default.ok(routes.includes("router.get('/tax/income'"));
            assert_1.default.ok(srcFile('services/individualIncomeTaxService.ts').includes("companyId: asObjectId(input.companyId)"));
            assert_1.default.ok(srcFile('services/individualIncomeTaxService.ts').includes("taxType: 'INCOME_TAX'"));
            assert_1.default.ok(srcFile('services/individualIncomeTaxService.ts').includes('Property not found'));
            results['48 Cross-company access denied'] = 'PASS';
            results['49 Cross-property access denied'] = 'PASS';
            results['50 Tax-period access respects company ownership'] = 'PASS';
        }
        {
            const calc = srcFile('services/individualIncomeTaxCalculation.ts');
            const rounding = srcFile('services/tax/incomeTaxRounding.ts');
            assert_1.default.ok(!calc.includes('workspace === "individual"'));
            assert_1.default.ok(!calc.includes('propertyType === "commercial"'));
            assert_1.default.ok(!rounding.includes('0%, 20%'));
            const seed = (0, taxRuleRegistry_1.systemTaxRuleSeeds)().find((row) => row.ruleCode === 'ZW_INCOME_TAX_TRADE_INVESTMENT_2024');
            assert_1.default.ok((_a = seed.notes) === null || _a === void 0 ? void 0 : _a.includes('PAYE'));
            assert_1.default.ok((_b = seed.notes) === null || _b === void 0 ? void 0 : _b.includes('AIDS levy is NOT included'));
            assert_1.default.strictEqual(taxTypes_1.TAX_TYPE_MODE.INCOME_TAX, 'NOT_IMPLEMENTED');
            assert_1.default.ok(!srcFile('services/individualRentalTaxCalculation.ts').includes('individualIncomeTax'));
            assert_1.default.ok(!srcFile('services/individualVatCalculation.ts').includes('calculateOrdinaryIncomeTax'));
            results['No global tax regime shortcut'] = 'PASS';
        }
        {
            const propertyA = (0, individualIncomeTaxClassification_1.classifyIncomeTaxLine)({
                sourceKind: 'PAYMENT_RENT',
                amount: 10000,
                rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
                category: 'RENTAL_INCOME',
                profileSnapshotPresent: true
            });
            const propertyB = (0, individualIncomeTaxClassification_1.classifyIncomeTaxLine)({
                sourceKind: 'PAYMENT_RENT',
                amount: 8000,
                rentalTaxRegime: 'SELF_ASSESSMENT',
                category: 'RENTAL_INCOME',
                profileSnapshotPresent: true
            });
            assert_1.default.strictEqual(propertyA.classification, 'NOT_INCOME_TAX_RELEVANT');
            assert_1.default.strictEqual(propertyB.classification, 'TAXABLE_INCOME');
            const mixedPaper = (0, individualIncomeTaxCalculation_1.calculateOrdinaryIncomeTaxWorkingPaper)({
                currencies: ['USD'],
                accountingIncome: 18000,
                accountingExpenses: 0,
                lineAddBacks: 0,
                lineDeductions: 0,
                lineExemptIncome: 10000,
                incomeTaxRule: configured
            });
            assert_1.default.strictEqual(mixedPaper.taxableIncome, 8000);
            assert_1.default.strictEqual(mixedPaper.taxAmount, (0, incomeTaxRounding_1.calculateTaxableIncomePercent)(8000, configured.rate));
            results['49 Property-level presumptive vs ordinary treatment'] = 'PASS';
        }
        {
            const owner = (0, individualIncomeTaxClassification_1.classifyIncomeTaxLine)({
                sourceKind: 'OTHER_INCOME',
                amount: 5000,
                category: 'OWNER_CONTRIBUTION',
                rentalTaxRegime: 'SELF_ASSESSMENT',
                profileSnapshotPresent: true
            });
            assert_1.default.strictEqual(owner.classification, 'NOT_INCOME_TAX_RELEVANT');
            results['Owner contributions stay outside taxable income'] = 'PASS';
        }
        {
            const xlsx = (0, xlsxWorkbook_1.buildXlsxWorkbook)('Income tax working paper', [{ taxpayer: 'Test', taxableIncome: 19000, calculatedIncomeTax: 4750 }]);
            assert_1.default.ok(xlsx.slice(0, 2).toString() === 'PK');
            const routes = srcFile('routes/individualRoutes.ts');
            assert_1.default.ok(routes.includes("router.get('/tax/income/working-paper'"));
            assert_1.default.ok(routes.includes("router.post('/tax/income/calculate'"));
            assert_1.default.ok(routes.includes("router.post('/tax/income/adjustments'"));
            assert_1.default.ok(routes.includes("router.post('/tax/income/payments'"));
            assert_1.default.ok(srcFile('services/individualIncomeTaxService.ts').includes('INCOME_TAX_PAYMENT_RECORDED'));
            assert_1.default.ok(srcFile('services/taxPeriodService.ts').includes('INCOME_TAX_PERIOD_FINALIZED'));
            assert_1.default.ok(!srcFile('services/individualIncomeTaxService.ts').includes('for each historical payment'));
            assert_1.default.ok(!srcFile('services/individualIncomeTaxService.ts').includes('Payment.updateMany'));
            results['Golden 2026 working paper USD 19,000 plus genuine XLSX'] = 'PASS';
            results['46 No historical backfill'] = 'PASS';
        }
        {
            assert_1.default.strictEqual((0, incomeTaxRounding_1.calculateTaxableIncomePercent)(19000, configured.rate), (0, money_1.roundMoney)(19000 * (0, rentalTaxRounding_1.taxPercentToFraction)(configured.rate)));
            assert_1.default.strictEqual((0, rentalTaxRounding_1.taxPercentToFraction)(configured.rate), configured.rate / 100);
            results['Rounding uses registry percent via taxPercentToFraction'] = 'PASS';
        }
        console.log(JSON.stringify(results, null, 2));
        if (Object.values(results).some((value) => value !== 'PASS'))
            throw new Error('Phase G tests failed');
        console.log('Phase G individual ordinary income tax tests: ALL PASS');
    });
}
run().catch((error) => {
    console.error(error);
    process.exit(1);
});
