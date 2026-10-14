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
const individualVatCalculation_1 = require("../services/individualVatCalculation");
const individualRentalTaxCalculation_1 = require("../services/individualRentalTaxCalculation");
const individualRentalTaxApplicability_1 = require("../services/individualRentalTaxApplicability");
const individualRentalTaxBase_1 = require("../services/individualRentalTaxBase");
const individualIncomeTaxCalculation_1 = require("../services/individualIncomeTaxCalculation");
const incomeTaxRounding_1 = require("../services/tax/incomeTaxRounding");
const rentalTaxRounding_1 = require("../services/tax/rentalTaxRounding");
const individualTaxComplianceReadinessService_1 = require("../services/individualTaxComplianceReadinessService");
const taxRuleRegistry_1 = require("../services/taxRuleRegistry");
const individualAccountingCategories_1 = require("../services/individualAccountingCategories");
const taxAmountAggregation_1 = require("../services/tax/taxAmountAggregation");
const xlsxWorkbook_1 = require("../utils/xlsxWorkbook");
const taxTypes_1 = require("../services/tax/taxTypes");
function srcFile(rel) {
    return fs_1.default.readFileSync(path_1.default.join(__dirname, '..', '..', 'src', rel), 'utf8');
}
function clientFile(rel) {
    return fs_1.default.readFileSync(path_1.default.join(process.cwd(), '..', 'client', 'src', rel), 'utf8');
}
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
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        const results = {};
        const accounting = srcFile('services/individualAccountingService.ts');
        const orch = srcFile('services/paymentAccountingOrchestrator.ts');
        const compliance = srcFile('services/individualTaxComplianceService.ts');
        const readinessSrc = srcFile('services/individualTaxComplianceReadinessService.ts');
        const vatService = srcFile('services/individualVatService.ts');
        const rentalService = srcFile('services/individualRentalTaxService.ts');
        const incomeService = srcFile('services/individualIncomeTaxService.ts');
        const indexes = srcFile('models/indexes.ts');
        const routes = srcFile('routes/individualRoutes.ts');
        const errorHandler = srcFile('middleware/errorHandler.ts');
        const packModel = srcFile('models/IndividualTaxPack.ts');
        const vatModel = srcFile('models/IndividualVatRecord.ts');
        const rentalModel = srcFile('models/IndividualRentalTaxRecord.ts');
        const incomeModel = srcFile('models/IndividualIncomeTaxRecord.ts');
        const snapshotModel = srcFile('models/TransactionTaxSnapshot.ts');
        const vatUi = clientFile('pages/IndividualDashboard/pages/VatCentrePage.tsx');
        const rentalUi = clientFile('pages/IndividualDashboard/pages/RentalTaxCentrePage.tsx');
        const incomeUi = clientFile('pages/IndividualDashboard/pages/IncomeTaxCentrePage.tsx');
        const complianceUi = clientFile('pages/IndividualDashboard/pages/TaxComplianceCentrePage.tsx');
        const rentalRule = pn08();
        const configured = tradeRule();
        {
            assert_1.default.ok(orch.includes('export async function postPaymentAccounting'));
            assert_1.default.ok(srcFile('services/paymentAccountingReconciliation.ts').includes('ensurePaymentAccountingPosted'));
            assert_1.default.ok(accounting.includes('LandlordFinancialTransaction.create'));
            assert_1.default.ok(accounting.includes('ensureTaxOverlay'));
            assert_1.default.ok(accounting.includes('accounting remains valid'));
            assert_1.default.ok(orch.includes('safeAttachForPayment'));
            results['Architecture accounting remains authoritative'] = 'PASS';
            results['Fail-soft tax overlay after accounting'] = 'PASS';
        }
        {
            assert_1.default.ok(!compliance.includes('calculateIndividualVat'));
            assert_1.default.ok(!compliance.includes('calculateIndividualRentalTax'));
            assert_1.default.ok(!compliance.includes('calculateOrdinaryIncomeTaxWorkingPaper'));
            assert_1.default.ok(compliance.includes('IndividualVatRecord.find'));
            assert_1.default.ok(compliance.includes('IndividualRentalTaxRecord.find'));
            assert_1.default.ok(compliance.includes('IndividualIncomeTaxRecord.find'));
            assert_1.default.ok(compliance.includes('annualSchedule'));
            results['Pack consumes stored projections'] = 'PASS';
        }
        {
            const notRegistered = (0, individualVatCalculation_1.calculateIndividualVat)({
                direction: 'OUTPUT',
                treatment: 'NOT_VAT_REGISTERED',
                amount: 2000,
                vatRatePercent: 15.5,
                method: 'EXCLUSIVE'
            });
            assert_1.default.strictEqual(notRegistered.calculationStatus, 'NOT_APPLICABLE');
            assert_1.default.strictEqual(notRegistered.vatAmount, null);
            const exempt = (0, individualVatCalculation_1.calculateIndividualVat)({
                direction: 'OUTPUT',
                treatment: 'EXEMPT',
                amount: 2000,
                vatRatePercent: 15.5,
                method: 'EXCLUSIVE'
            });
            assert_1.default.strictEqual(exempt.treatment, 'EXEMPT');
            assert_1.default.strictEqual(exempt.vatAmount, 0);
            const missingEvidence = (0, individualVatCalculation_1.calculateIndividualVat)({
                direction: 'INPUT',
                treatment: 'STANDARD',
                amount: 100,
                vatRatePercent: 15.5,
                method: 'EXCLUSIVE',
                inputVatEligibility: 'RECOVERABLE'
            });
            assert_1.default.strictEqual(missingEvidence.calculationStatus, 'REVIEW_REQUIRED');
            assert_1.default.strictEqual(missingEvidence.vatAmount, null);
            assert_1.default.ok(missingEvidence.reviewReasons.includes('MISSING_SUPPLIER_VAT_NUMBER'));
            assert_1.default.strictEqual(notRegistered.incomeTaxAmount, null);
            assert_1.default.strictEqual(notRegistered.presumptiveTaxAmount, null);
            results['VAT not registered is not zero'] = 'PASS';
            results['VAT exempt remains calculated zero'] = 'PASS';
            results['Missing supplier VAT evidence is review'] = 'PASS';
        }
        {
            const applicability = (0, individualRentalTaxApplicability_1.evaluateIndividualRentalTaxApplicability)({
                sourceKind: 'PAYMENT_RENT',
                rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
                rentalTaxTreatment: 'PRESUMPTIVE_RENTAL',
                propertyUseClass: 'COMMERCIAL',
                profileSnapshotPresent: true,
                transactionDate: '2026-09-17',
                rentalTaxRule: rentalRule
            });
            const taxBase = (0, individualRentalTaxBase_1.resolveRentalTaxBase)({
                sourceKind: 'PAYMENT_RENT',
                amount: 2000,
                category: 'RENTAL_INCOME'
            });
            const calc = (0, individualRentalTaxCalculation_1.calculateIndividualRentalTax)({ applicability, taxBase });
            assert_1.default.strictEqual(applicability.taxRuleCode, 'ZW_PRESUMPTIVE_RENTAL_PN08_2026');
            assert_1.default.strictEqual(calc.taxAmount, (0, rentalTaxRounding_1.calculateGrossRentalPercent)(2000, Number(rentalRule.rate)));
            assert_1.default.strictEqual(calc.taxAmount, 300);
            assert_1.default.ok(!srcFile('services/individualRentalTaxCalculation.ts').includes('* 0.15'));
            const residential = (0, individualRentalTaxApplicability_1.evaluateIndividualRentalTaxApplicability)({
                sourceKind: 'PAYMENT_RENT',
                rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
                propertyUseClass: 'RESIDENTIAL_DWELLING',
                profileSnapshotPresent: true,
                rentalTaxRule: rentalRule
            });
            assert_1.default.strictEqual(residential.status, 'NOT_APPLICABLE');
            const mixed = (0, individualRentalTaxApplicability_1.evaluateIndividualRentalTaxApplicability)({
                sourceKind: 'PAYMENT_RENT',
                rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
                propertyUseClass: 'MIXED_USE',
                profileSnapshotPresent: true,
                rentalTaxRule: rentalRule
            });
            assert_1.default.strictEqual(mixed.status, 'REVIEW_REQUIRED');
            const deposit = (0, individualRentalTaxApplicability_1.evaluateIndividualRentalTaxApplicability)({
                sourceKind: 'PAYMENT_DEPOSIT',
                rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
                propertyUseClass: 'COMMERCIAL',
                profileSnapshotPresent: true,
                rentalTaxRule: rentalRule
            });
            assert_1.default.strictEqual(deposit.status, 'NOT_APPLICABLE');
            results['Phase F commercial PN08 golden case'] = 'PASS';
            results['Residential not liable under configured rule'] = 'PASS';
            results['Mixed-use requires review'] = 'PASS';
            results['Deposit is not rental income'] = 'PASS';
        }
        {
            const paper = (0, individualIncomeTaxCalculation_1.calculateOrdinaryIncomeTaxWorkingPaper)({
                currencies: ['USD'],
                accountingIncome: 24000,
                accountingExpenses: 6000,
                lineAddBacks: 1500,
                lineDeductions: 0,
                lineExemptIncome: 0,
                adjustments: [{ adjustmentType: 'DEDUCTION', amount: 500, currency: 'USD', reason: 'approved extra deduction', status: 'APPROVED' }],
                incomeTaxRule: configured
            });
            assert_1.default.strictEqual(paper.taxableIncome, 19000);
            assert_1.default.strictEqual(paper.taxAmount, (0, incomeTaxRounding_1.calculateTaxableIncomePercent)(19000, Number(configured.rate)));
            assert_1.default.ok(!srcFile('services/individualIncomeTaxCalculation.ts').includes('* 0.25'));
            assert_1.default.strictEqual(paper.vatAmount, null);
            assert_1.default.strictEqual(paper.presumptiveTaxAmount, null);
            results['Phase G taxable income 19000'] = 'PASS';
            results['Income tax uses configured rule not a literal'] = 'PASS';
        }
        {
            const mixed = (0, individualIncomeTaxCalculation_1.calculateOrdinaryIncomeTaxWorkingPaper)({
                currencies: ['USD', 'ZWG'],
                accountingIncome: 1000,
                accountingExpenses: 0,
                lineAddBacks: 0,
                lineDeductions: 0,
                lineExemptIncome: 0,
                incomeTaxRule: configured
            });
            assert_1.default.strictEqual(mixed.calculationStatus, 'REVIEW_REQUIRED');
            assert_1.default.ok(mixed.reviewReasons.includes('CURRENCY_CONVERSION_REQUIRED'));
            assert_1.default.strictEqual(mixed.taxAmount, null);
            results['Mixed currency does not invent FX'] = 'PASS';
        }
        {
            const incomplete = (0, taxAmountAggregation_1.sumCompleteTaxAmounts)([
                { calculationStatus: 'CALCULATED', vatAmount: 100 },
                { calculationStatus: 'REVIEW_REQUIRED', vatAmount: null }
            ], (row) => row.vatAmount);
            assert_1.default.strictEqual(incomplete, null);
            const complete = (0, taxAmountAggregation_1.sumCompleteTaxAmounts)([
                { calculationStatus: 'CALCULATED', vatAmount: 100 },
                { calculationStatus: 'NOT_APPLICABLE', vatAmount: null },
                { calculationStatus: 'CALCULATED', vatAmount: 50 }
            ], (row) => row.vatAmount);
            assert_1.default.strictEqual(complete, 150);
            assert_1.default.strictEqual((0, taxAmountAggregation_1.netFromNullable)(null, 10), null);
            assert_1.default.strictEqual((0, taxAmountAggregation_1.netFromNullable)(20, 5), 15);
            results['Null tax amounts are not coerced to zero'] = 'PASS';
        }
        {
            const ownership = (0, individualTaxComplianceReadinessService_1.evaluateComplianceReadiness)({ hasAnyActivity: true, ownershipUnclear: true });
            assert_1.default.strictEqual(ownership.status, 'REVIEW_REQUIRED');
            assert_1.default.ok(ownership.blockers.some((row) => row.issueType === 'OWNERSHIP_ALLOCATION_UNCLEAR'));
            assert_1.default.ok(compliance.includes('ownerShareIncome: ownership === 100 ? pnl.income : null'));
            results['Joint ownership is REVIEW_REQUIRED'] = 'PASS';
            results['Ownership is not used to invent a taxable share'] = 'PASS';
        }
        {
            const capital = (0, individualAccountingCategories_1.classifyLandlordCategory)('CAPITAL_IMPROVEMENT');
            assert_1.default.strictEqual(capital.sourceKind, 'CAPITAL');
            assert_1.default.strictEqual(capital.accountingTreatment, 'CAPITAL');
            assert_1.default.strictEqual(capital.deductibility, 'CAPITAL');
            const depositCat = (0, individualAccountingCategories_1.classifyLandlordCategory)('TENANT_DEPOSIT');
            assert_1.default.strictEqual(depositCat.sourceKind, 'LIABILITY');
            const application = (0, individualAccountingCategories_1.classifyLandlordCategory)('DEPOSIT_APPLICATION');
            assert_1.default.strictEqual(application.accountingTreatment, 'PROPERTY_INCOME');
            results['Capital is not ordinary expense'] = 'PASS';
            results['Deposit is not income until applied'] = 'PASS';
        }
        {
            assert_1.default.ok(accounting.includes("throw new AppError('Application exceeds remaining deposit', 400)"));
            assert_1.default.ok(accounting.includes("throw new AppError('rentalDepositId is required to apply a deposit to rent', 400)"));
            assert_1.default.ok(accounting.includes("type: 'payout'"));
            assert_1.default.ok(accounting.includes('APPLY-${String(application._id)}') || accounting.includes('APPLY-${'));
            assert_1.default.ok(accounting.includes('original deposit was not mutated') || accounting.includes('original deposit remains unchanged') || accounting.includes('Original deposit receipt'));
            results['Deposit application cannot exceed remaining balance'] = 'PASS';
            results['Deposit application payout is idempotent'] = 'PASS';
        }
        {
            assert_1.default.ok(accounting.includes('code === 11000'));
            assert_1.default.ok(accounting.includes('idempotencyKey'));
            assert_1.default.ok(vatModel.includes('unique: true'));
            assert_1.default.ok(rentalModel.includes('unique: true'));
            assert_1.default.ok(incomeModel.includes('unique: true'));
            assert_1.default.ok(packModel.includes("index({ companyId: 1, taxYear: 1, version: 1 }, { unique: true })"));
            assert_1.default.ok(compliance.includes('error?.code === 11000'));
            assert_1.default.ok(compliance.includes('IndividualTaxPack.create'));
            const createIdx = compliance.indexOf('const created = await IndividualTaxPack.create');
            const supersedeIdx = compliance.indexOf("latest.status = 'SUPERSEDED'");
            assert_1.default.ok(createIdx > 0 && supersedeIdx > createIdx);
            results['Idempotent financial writes'] = 'PASS';
            results['Concurrent pack generation uses unique version'] = 'PASS';
            results['Pack create-then-supersede race'] = 'PASS';
        }
        {
            assert_1.default.ok(snapshotModel.includes('cannot be updated in place'));
            assert_1.default.ok(vatModel.includes('cannot be updated in place'));
            assert_1.default.ok(rentalModel.includes('cannot be updated in place'));
            assert_1.default.ok(incomeModel.includes('cannot be updated in place'));
            assert_1.default.ok(packModel.includes('cannot be updated in place'));
            assert_1.default.ok(packModel.includes('Hard delete is disabled'));
            results['Immutability hooks remain'] = 'PASS';
        }
        {
            assert_1.default.ok(indexes.includes("name: 'TransactionTaxSnapshot'"));
            assert_1.default.ok(indexes.includes("name: 'TaxPeriod'"));
            assert_1.default.ok(indexes.includes("name: 'TaxRule'"));
            assert_1.default.ok(indexes.includes("name: 'IndividualVatRecord'"));
            assert_1.default.ok(indexes.includes("name: 'IndividualRentalTaxRecord'"));
            assert_1.default.ok(indexes.includes("name: 'IndividualIncomeTaxRecord'"));
            assert_1.default.ok(indexes.includes("name: 'IndividualTaxPack'"));
            assert_1.default.ok(indexes.includes("name: 'IndividualTaxEvidence'"));
            assert_1.default.ok(indexes.includes("name: 'LandlordFinancialTransaction'"));
            results['Phase D-H indexes are created at startup'] = 'PASS';
        }
        {
            assert_1.default.ok(!vatUi.includes('outputVat || 0'));
            assert_1.default.ok(!rentalUi.includes('calculatedRentalTax || 0'));
            assert_1.default.ok(vatUi.includes("value == null ? 'not calculated'"));
            assert_1.default.ok(rentalUi.includes("value == null ? 'not calculated'"));
            assert_1.default.ok(incomeUi.includes("value == null ? 'not calculated'"));
            assert_1.default.ok(complianceUi.includes("value == null ? 'not calculated'"));
            results['UI does not display null tax as $0'] = 'PASS';
        }
        {
            assert_1.default.ok(!compliance.includes("page.drawText(String(text || '').slice(0, 108)"));
            assert_1.default.ok(compliance.includes('const wrap = (text: string, maxChars: number)'));
            assert_1.default.ok(compliance.includes("line('Adjustments', 12, true)"));
            assert_1.default.ok(compliance.includes("line('Recorded tax payments', 12, true)"));
            assert_1.default.ok(compliance.includes("line('Evidence status', 12, true)"));
            assert_1.default.ok(!vatService.includes('text.slice(0, 110)'));
            const xlsx = (0, xlsxWorkbook_1.buildXlsxWorkbookSheets)([
                { name: 'Cover', rows: [{ field: 'Report', value: 'pack' }] },
                { name: 'VAT', rows: [{ outputVat: null, status: 'NOT_CALCULATED' }] },
                { name: 'Rental Tax', rows: [{ calculated: 300 }] },
                { name: 'Income Tax', rows: [{ calculated: 4750 }] }
            ]);
            assert_1.default.ok(xlsx.slice(0, 2).toString() === 'PK');
            assert_1.default.ok(xlsx.includes(Buffer.from('xl/worksheets/sheet1.xml')));
            assert_1.default.ok(xlsx.includes(Buffer.from('xl/worksheets/sheet4.xml')));
            results['PDF wraps instead of truncating'] = 'PASS';
            results['XLSX is OOXML not CSV'] = 'PASS';
        }
        {
            assert_1.default.ok(compliance.includes("paymentStatus: 'NOT_RECORDED'"));
            assert_1.default.ok(compliance.includes('recordedPayments: null'));
            assert_1.default.ok(compliance.includes('unreconciled: null'));
            assert_1.default.ok(compliance.includes('combinedTotalTaxPayable: null'));
            assert_1.default.ok(compliance.includes('zimraBalance: null'));
            assert_1.default.ok(!compliance.includes('ZIMRA payable'));
            assert_1.default.ok(!compliance.includes('ZIMRA confirmed'));
            assert_1.default.ok(!compliance.includes('ZIMRA compliant'));
            assert_1.default.ok(!complianceUi.includes('ZIMRA payable'));
            results['VAT payments are not recorded'] = 'PASS';
            results['No fabricated combined ZIMRA payable'] = 'PASS';
        }
        {
            assert_1.default.ok(!compliance.includes('PAYE'));
            assert_1.default.ok(!incomeService.includes('PAYE'));
            assert_1.default.ok(!srcFile('services/individualIncomeTaxCalculation.ts').includes('PAYE'));
            assert_1.default.ok(!srcFile('services/individualIncomeTaxCalculation.ts').includes('employment tax'));
            assert_1.default.strictEqual(taxTypes_1.TAX_TYPE_MODE.INCOME_TAX, 'NOT_IMPLEMENTED');
            assert_1.default.ok(readinessSrc.includes('AIDS levy is not included'));
            results['PAYE is not used for landlord income tax'] = 'PASS';
            results['AIDS levy remains review-only'] = 'PASS';
        }
        {
            assert_1.default.ok(routes.includes('req.user!.companyId!'));
            assert_1.default.ok(!routes.includes('req.body.companyId'));
            assert_1.default.ok(compliance.includes("File.findOne({ _id: asObjectId(input.documentId), companyId: asObjectId(input.companyId) })"));
            assert_1.default.ok(compliance.includes("Evidence not found"));
            assert_1.default.ok(errorHandler.includes("process.env.NODE_ENV === 'development'"));
            assert_1.default.ok(errorHandler.includes('stack: err.stack'));
            results['Company scoping is server-side'] = 'PASS';
            results['Evidence files are company-scoped'] = 'PASS';
            results['Stack traces are development-only'] = 'PASS';
        }
        {
            assert_1.default.ok(incomeService.includes('incompleteMonths'));
            assert_1.default.ok(incomeService.includes('papers.some((row) => row.accountingProfit == null)'));
            assert_1.default.ok(!incomeService.includes('* 12'));
            assert_1.default.ok(compliance.includes('lifetimeNotUsed: true'));
            results['Annual income tax identifies incomplete months'] = 'PASS';
        }
        {
            const missingPeriod = (0, individualTaxComplianceReadinessService_1.evaluateComplianceReadiness)({ hasAnyActivity: true, missingTaxPeriods: 1 });
            assert_1.default.ok(missingPeriod.blockers.some((row) => row.issueType === 'MISSING_TAX_PERIOD'));
            const closed = srcFile('services/taxPeriodService.ts');
            assert_1.default.ok(closed.includes('PERIOD_CLOSED') || closed.includes('FINALIZED') || closed.includes('LOCKED'));
            assert_1.default.ok(!srcFile('services/taxPeriodService.ts').includes('autoCreate') && !srcFile('services/taxPeriodService.ts').includes('createIfMissing'));
            results['Missing tax period is explicit'] = 'PASS';
        }
        {
            assert_1.default.ok(!accounting.includes('JournalEntry.create'));
            assert_1.default.ok(!compliance.includes("from '../models/TaxObligation'"));
            assert_1.default.ok(!vatService.includes('commissionVat'));
            results['Agency accounting unmodified'] = 'PASS';
            results['No competing ledger'] = 'PASS';
        }
        console.log(JSON.stringify(results, null, 2));
        if (Object.values(results).some((value) => value !== 'PASS'))
            throw new Error('Phase I tests failed');
        console.log('Phase I individual production-readiness tests: ALL PASS');
    });
}
run().catch((error) => {
    console.error(error);
    process.exit(1);
});
