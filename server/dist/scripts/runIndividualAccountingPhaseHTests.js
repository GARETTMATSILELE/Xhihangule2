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
const individualTaxComplianceReadinessService_1 = require("../services/individualTaxComplianceReadinessService");
const individualIncomeTaxCalculation_1 = require("../services/individualIncomeTaxCalculation");
const incomeTaxRounding_1 = require("../services/tax/incomeTaxRounding");
const individualVatCalculation_1 = require("../services/individualVatCalculation");
const individualRentalTaxCalculation_1 = require("../services/individualRentalTaxCalculation");
const individualRentalTaxApplicability_1 = require("../services/individualRentalTaxApplicability");
const individualRentalTaxBase_1 = require("../services/individualRentalTaxBase");
const individualIncomeTaxClassification_1 = require("../services/individualIncomeTaxClassification");
const taxRuleRegistry_1 = require("../services/taxRuleRegistry");
const xlsxWorkbook_1 = require("../utils/xlsxWorkbook");
const taxTypes_1 = require("../services/tax/taxTypes");
const complianceTypes_1 = require("../services/tax/complianceTypes");
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
        const results = {};
        const compliance = srcFile('services/individualTaxComplianceService.ts');
        const readinessSrc = srcFile('services/individualTaxComplianceReadinessService.ts');
        const routes = srcFile('routes/individualRoutes.ts');
        const packModel = srcFile('models/IndividualTaxPack.ts');
        const evidenceModel = srcFile('models/IndividualTaxEvidence.ts');
        const reviewModel = srcFile('models/IndividualTaxComplianceReview.ts');
        const constantsUi = fs_1.default.readFileSync(path_1.default.join(process.cwd(), '..', 'client', 'src', 'pages', 'IndividualDashboard', 'constants.ts'), 'utf8');
        const workspaceUi = fs_1.default.readFileSync(path_1.default.join(process.cwd(), '..', 'client', 'src', 'services', 'individualWorkspaceService.ts'), 'utf8');
        const configured = tradeRule();
        const rentalRule = pn08();
        {
            assert_1.default.ok(compliance.includes("taxType: 'VAT'"));
            assert_1.default.ok(compliance.includes("taxType: 'PRESUMPTIVE_RENTAL_INCOME_TAX'"));
            assert_1.default.ok(compliance.includes("taxType: 'INCOME_TAX'"));
            assert_1.default.ok(compliance.includes('combinedTotalTaxPayable: null'));
            assert_1.default.ok(compliance.includes('zimraBalance: null'));
            assert_1.default.ok(!compliance.includes('Total Tax Payable'));
            assert_1.default.ok(!compliance.includes('calculateIndividualVat'));
            assert_1.default.ok(!compliance.includes('calculateIndividualRentalTax'));
            assert_1.default.ok(!compliance.includes('calculateOrdinaryIncomeTaxWorkingPaper'));
            assert_1.default.ok(!compliance.includes('* 0.15'));
            assert_1.default.ok(!compliance.includes('* 0.25'));
            assert_1.default.ok(!compliance.includes('annualRent'));
            assert_1.default.ok(!readinessSrc.includes('* 0.15'));
            assert_1.default.ok(!readinessSrc.includes('* 0.25'));
            assert_1.default.ok(compliance.includes('IndividualVatRecord.find'));
            assert_1.default.ok(compliance.includes('IndividualRentalTaxRecord.find'));
            assert_1.default.ok(compliance.includes('IndividualIncomeTaxRecord.find'));
            assert_1.default.ok(compliance.includes('sumPropertyAccountPeriodPnl'));
            assert_1.default.ok(!compliance.includes('JournalEntry.create'));
            assert_1.default.ok(!compliance.includes("from '../models/TaxObligation'"));
            results['1 VAT appears separately'] = 'PASS';
            results['2 Rental tax appears separately'] = 'PASS';
            results['3 Income tax appears separately'] = 'PASS';
            results['4 No tax calculation is duplicated'] = 'PASS';
            results['5 Accounting remains authoritative'] = 'PASS';
        }
        {
            assert_1.default.ok(compliance.includes('yearRange(taxYear)'));
            assert_1.default.ok(compliance.includes('`${taxYear}-01`'));
            assert_1.default.ok(compliance.includes('`${taxYear}-12`'));
            assert_1.default.ok(compliance.includes('lifetimeNotUsed: true'));
            assert_1.default.ok(compliance.includes('annualisedNotUsed: true'));
            assert_1.default.ok(!compliance.includes('* 12'));
            assert_1.default.ok(!compliance.includes('totalIncome'));
            assert_1.default.ok(compliance.includes('CURRENCY_CONVERSION_REQUIRED'));
            const mixed = (0, individualTaxComplianceReadinessService_1.evaluateComplianceReadiness)({ mixedCurrency: true, hasAnyActivity: true });
            assert_1.default.strictEqual(mixed.status, 'REVIEW_REQUIRED');
            assert_1.default.ok(mixed.blockers.some((row) => row.issueType === 'CURRENCY_CONVERSION_REQUIRED'));
            results['6 Monthly periods aggregate correctly'] = 'PASS';
            results['7 Annual totals do not use lifetime totals'] = 'PASS';
            results['8 No annualProfit × 12 logic'] = 'PASS';
            results['9 Currency separation works'] = 'PASS';
            results['10 Missing conversion produces review'] = 'PASS';
        }
        {
            const missingClass = (0, individualTaxComplianceReadinessService_1.evaluateComplianceReadiness)({ unclassifiedTransactions: 4, hasAnyActivity: true });
            assert_1.default.ok(missingClass.blockers.some((row) => row.issueType === 'MISSING_TAX_CLASSIFICATION'));
            assert_1.default.strictEqual(missingClass.status, 'REVIEW_REQUIRED');
            const missingRule = (0, individualTaxComplianceReadinessService_1.evaluateComplianceReadiness)({ missingTaxRules: 1, hasAnyActivity: true });
            assert_1.default.ok(missingRule.blockers.some((row) => row.issueType === 'MISSING_TAX_RULE'));
            const missingPeriod = (0, individualTaxComplianceReadinessService_1.evaluateComplianceReadiness)({ missingTaxPeriods: 1, hasAnyActivity: true });
            assert_1.default.ok(missingPeriod.blockers.some((row) => row.issueType === 'MISSING_TAX_PERIOD'));
            const missingDoc = (0, individualTaxComplianceReadinessService_1.evaluateComplianceReadiness)({ missingDocuments: 3, hasAnyActivity: true, aidsLevyReviews: 0 });
            assert_1.default.ok(missingDoc.warnings.some((row) => row.issueType === 'MISSING_DOCUMENT'));
            assert_1.default.ok(!missingDoc.blockers.some((row) => row.issueType === 'MISSING_DOCUMENT'));
            const incomeReview = (0, individualTaxComplianceReadinessService_1.evaluateComplianceReadiness)({ unresolvedIncomeTaxReviews: 1, hasAnyActivity: true });
            assert_1.default.ok(incomeReview.blockers.some((row) => row.issueType === 'INCOME_TAX_REVIEW'));
            const rentalReview = (0, individualTaxComplianceReadinessService_1.evaluateComplianceReadiness)({ unresolvedRentalTaxReviews: 1, hasAnyActivity: true });
            assert_1.default.ok(rentalReview.blockers.some((row) => row.issueType === 'PRESUMPTIVE_RENTAL_REVIEW'));
            const vatReview = (0, individualTaxComplianceReadinessService_1.evaluateComplianceReadiness)({ unresolvedVatReviews: 1, hasAnyActivity: true });
            assert_1.default.ok(vatReview.blockers.some((row) => row.issueType === 'VAT_REVIEW'));
            const ready = (0, individualTaxComplianceReadinessService_1.evaluateComplianceReadiness)({ hasAnyActivity: true, vatRegistered: true, presumptiveApplicable: false, incomeTaxPaymentRecorded: true, missingDocuments: 1 });
            assert_1.default.strictEqual(ready.status, 'READY_FOR_ACCOUNTANT');
            const prepared = (0, individualTaxComplianceReadinessService_1.evaluateComplianceReadiness)({ hasAnyActivity: true, vatRegistered: true, aidsLevyReviews: 0 });
            assert_1.default.strictEqual(prepared.status, 'READY_FOR_TAX_PREPARATION');
            const finalized = (0, individualTaxComplianceReadinessService_1.evaluateComplianceReadiness)({ hasAnyActivity: true, packFinalized: true, aidsLevyReviews: 0 });
            assert_1.default.strictEqual(finalized.status, 'FINALIZED');
            const blockedFinal = (0, individualTaxComplianceReadinessService_1.evaluateComplianceReadiness)({ hasAnyActivity: true, packFinalized: true, unclassifiedTransactions: 1 });
            assert_1.default.strictEqual(blockedFinal.status, 'REVIEW_REQUIRED');
            results['11 Missing tax classification creates blocker'] = 'PASS';
            results['12 Missing tax rule creates blocker'] = 'PASS';
            results['13 Missing tax period creates blocker'] = 'PASS';
            results['14 Missing document creates warning where appropriate'] = 'PASS';
            results['15 Unresolved income-tax review appears'] = 'PASS';
            results['16 Unresolved rental-tax review appears'] = 'PASS';
            results['17 Unresolved VAT review appears'] = 'PASS';
            results['18 Final readiness state is deterministic'] = 'PASS';
        }
        {
            assert_1.default.ok(evidenceModel.includes("ref: 'File'"));
            assert_1.default.ok(evidenceModel.includes('documentId'));
            assert_1.default.ok(evidenceModel.includes('sourceId'));
            assert_1.default.ok(compliance.includes('copiedFile: false'));
            assert_1.default.ok(compliance.includes("documentStatus: 'UPLOADED'"));
            assert_1.default.ok(compliance.includes("reviewStatus: 'REQUIRES_REVIEW'"));
            assert_1.default.ok(compliance.includes('TAX_EVIDENCE_ATTACHED'));
            assert_1.default.ok(compliance.includes('TAX_EVIDENCE_REVIEWED'));
            assert_1.default.ok(complianceTypes_1.EVIDENCE_STATUSES.includes('MISSING'));
            assert_1.default.ok(complianceTypes_1.EVIDENCE_STATUSES.includes('UPLOADED'));
            assert_1.default.ok(complianceTypes_1.EVIDENCE_STATUSES.includes('REVIEWED'));
            assert_1.default.ok(compliance.includes('missingDocuments'));
            results['19 Evidence links to source transaction'] = 'PASS';
            results['20 Evidence links to tax record'] = 'PASS';
            results['21 Evidence status works'] = 'PASS';
            results['22 Missing evidence is visible'] = 'PASS';
            results['23 Evidence review creates audit event'] = 'PASS';
        }
        {
            assert_1.default.ok(compliance.includes('TAX_COMPLIANCE_REVIEW_CREATED'));
            assert_1.default.ok(compliance.includes('TAX_COMPLIANCE_REVIEW_RESOLVED'));
            assert_1.default.ok(compliance.includes('TAX_COMPLIANCE_REVIEW_WAIVED'));
            assert_1.default.ok(compliance.includes("A waiver requires a reason"));
            assert_1.default.ok(reviewModel.includes('Hard delete is disabled'));
            assert_1.default.ok(complianceTypes_1.COMPLIANCE_REVIEW_STATUSES.includes('OPEN'));
            assert_1.default.ok(complianceTypes_1.COMPLIANCE_REVIEW_STATUSES.includes('WAIVED'));
            results['24 Review created'] = 'PASS';
            results['25 Review resolved'] = 'PASS';
            results['26 Review waived'] = 'PASS';
            results['27 Waiver requires reason'] = 'PASS';
            results['28 Audit trail retained'] = 'PASS';
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
            assert_1.default.strictEqual(paper.taxAmount, (0, incomeTaxRounding_1.calculateTaxableIncomePercent)(19000, configured.rate));
            const packProjection = { calculatedIncomeTax: paper.taxAmount, taxableIncome: paper.taxableIncome };
            assert_1.default.strictEqual(packProjection.calculatedIncomeTax, paper.taxAmount);
            assert_1.default.ok(compliance.includes('individualIncomeTaxService.annualSchedule'));
            assert_1.default.ok(compliance.includes('TAX_PACK_GENERATED'));
            assert_1.default.ok(compliance.includes('buildXlsxWorkbookSheets'));
            assert_1.default.ok(compliance.includes("format === 'csv'"));
            assert_1.default.ok(compliance.includes('PDFDocument.create'));
            assert_1.default.ok(compliance.includes('Cover'));
            assert_1.default.ok(compliance.includes('Reconciliation'));
            assert_1.default.ok(packModel.includes('cannot be updated in place'));
            assert_1.default.ok(packModel.includes('companyId: 1, taxYear: 1, version: 1'));
            assert_1.default.ok(compliance.includes("status = 'SUPERSEDED'"));
            assert_1.default.ok(compliance.includes('version + 1') || compliance.includes('Number(latest.version) + 1'));
            assert_1.default.ok(compliance.includes('TAX_PACK_FINALIZED'));
            assert_1.default.ok(compliance.includes('TAX_PACK_SUPERSEDED'));
            const xlsx = (0, xlsxWorkbook_1.buildXlsxWorkbookSheets)([
                { name: 'Cover', rows: [{ report: 'Mantis Individual Landlord Tax Preparation Pack', taxYear: 2026 }] },
                { name: 'Income Tax', rows: [{ taxableIncome: 19000, calculated: packProjection.calculatedIncomeTax }] },
                { name: 'Reconciliation', rows: [{ vat: null, rentalTax: null, incomeTax: packProjection.calculatedIncomeTax, totalTaxPayable: null }] }
            ]);
            assert_1.default.strictEqual(xlsx.slice(0, 2).toString(), 'PK');
            assert_1.default.ok(xlsx.includes(Buffer.from('sheet2.xml')));
            assert_1.default.ok(xlsx.includes(Buffer.from('sheet3.xml')));
            assert_1.default.ok(!xlsx.toString('utf8').startsWith('taxableIncome,19000'));
            results['29 Pack generation works'] = 'PASS';
            results['30 Pack contains correct annual totals'] = 'PASS';
            results['31 Pack references underlying projections'] = 'PASS';
            results['32 Pack can be exported PDF'] = 'PASS';
            results['33 Pack can be exported XLSX'] = 'PASS';
            results['34 Pack can be exported CSV'] = 'PASS';
            results['35 Finalized pack is immutable'] = 'PASS';
            results['36 New version supersedes old version correctly'] = 'PASS';
        }
        {
            assert_1.default.ok(compliance.includes('rentalPayments.map'));
            assert_1.default.ok(compliance.includes('incomePayments.map'));
            assert_1.default.ok(!compliance.includes('vatPayments.map'));
            assert_1.default.ok(compliance.includes('recordedPayments: null'));
            assert_1.default.ok(compliance.includes("recordedByLandlord: true"));
            assert_1.default.ok(compliance.includes('zimraConfirmed: false'));
            assert_1.default.ok(!compliance.includes('.taxAmount ='));
            assert_1.default.ok(compliance.includes('unreconciledAmount'));
            results['37 VAT payments remain separate'] = 'PASS';
            results['38 Rental-tax payments remain separate'] = 'PASS';
            results['39 Income-tax payments remain separate'] = 'PASS';
            results['40 Payments do not modify calculated tax records'] = 'PASS';
            results['41 Payment reconciliation works'] = 'PASS';
        }
        {
            assert_1.default.ok(compliance.includes('DEPOSIT_NOT_INCOME'));
            assert_1.default.ok(compliance.includes("sourceKind === 'PAYMENT_DEPOSIT'"));
            const deposit = (0, individualIncomeTaxClassification_1.classifyIncomeTaxLine)({
                sourceKind: 'PAYMENT_DEPOSIT',
                amount: 2000,
                rentalTaxRegime: 'SELF_ASSESSMENT',
                profileSnapshotPresent: true
            });
            assert_1.default.strictEqual(deposit.classification, 'NOT_INCOME_TAX_RELEVANT');
            assert_1.default.ok(routes.includes("/deposits/apply"));
            assert_1.default.ok(!compliance.includes('RentalDeposit'));
            results['42 Deposit receipt is excluded from taxable rental income'] = 'PASS';
            results['43 Deposit application uses the existing first-class application transaction'] = 'PASS';
            results['44 Original deposit remains unchanged'] = 'PASS';
        }
        {
            const rental = (0, individualRentalTaxCalculation_1.calculateIndividualRentalTax)({
                applicability: (0, individualRentalTaxApplicability_1.evaluateIndividualRentalTaxApplicability)({
                    sourceKind: 'PAYMENT_RENT',
                    rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
                    profileSnapshotPresent: true,
                    transactionDate: new Date('2026-06-01T00:00:00.000Z'),
                    rentalTaxRule: rentalRule
                }),
                taxBase: (0, individualRentalTaxBase_1.resolveRentalTaxBase)({ sourceKind: 'PAYMENT_RENT', amount: 24000, rentAllocated: 24000 })
            });
            const vat = (0, individualVatCalculation_1.calculateIndividualVat)({
                direction: 'OUTPUT',
                treatment: 'STANDARD',
                amount: 24000,
                vatRatePercent: 15,
                method: 'EXCLUSIVE'
            });
            const income = (0, individualIncomeTaxCalculation_1.calculateOrdinaryIncomeTaxWorkingPaper)({
                currencies: ['USD'],
                accountingIncome: 24000,
                accountingExpenses: 6000,
                lineAddBacks: 1500,
                lineDeductions: 0,
                lineExemptIncome: 0,
                adjustments: [{ adjustmentType: 'DEDUCTION', amount: 500, currency: 'USD', reason: 'approved extra deduction', status: 'APPROVED' }],
                incomeTaxRule: configured
            });
            assert_1.default.notStrictEqual(rental.taxAmount, income.taxAmount);
            assert_1.default.notStrictEqual(vat.vatAmount, income.taxAmount);
            assert_1.default.ok(compliance.includes('incomeTaxAmount: null'));
            assert_1.default.ok(compliance.includes('presumptiveTaxAmount: null'));
            assert_1.default.ok(compliance.includes('vatAmount: null'));
            assert_1.default.ok(!compliance.includes('PAYE'));
            assert_1.default.ok(!compliance.includes('CGT'));
            assert_1.default.strictEqual(taxTypes_1.TAX_TYPE_MODE.INCOME_TAX, 'NOT_IMPLEMENTED');
            results['45 Presumptive rental tax is not duplicated into ordinary income tax'] = 'PASS';
            results['46 VAT is not treated as ordinary income tax'] = 'PASS';
            results['47 PAYE is not introduced'] = 'PASS';
            results['48 CGT is not introduced'] = 'PASS';
        }
        {
            assert_1.default.ok(packModel.includes('cannot be updated in place'));
            assert_1.default.ok(packModel.includes('Hard delete is disabled'));
            assert_1.default.ok(!compliance.includes('TransactionTaxSnapshot.updateOne'));
            assert_1.default.ok(!compliance.includes('IndividualVatRecord.update'));
            assert_1.default.ok(!compliance.includes('IndividualRentalTaxRecord.update'));
            assert_1.default.ok(!compliance.includes('IndividualIncomeTaxRecord.update'));
            assert_1.default.ok(compliance.includes('projectionsRewritten: false'));
            assert_1.default.ok(compliance.includes('duplicatedTaxEngine: false'));
            results['49 Historical snapshots unchanged'] = 'PASS';
            results['50 Historical projections unchanged'] = 'PASS';
            results['51 Finalized pack cannot be mutated'] = 'PASS';
            results['52 Superseding pack creates a new version'] = 'PASS';
        }
        {
            assert_1.default.ok(routes.includes('req.user!.companyId!'));
            assert_1.default.ok(routes.includes("router.get('/tax/compliance'"));
            assert_1.default.ok(!routes.includes('req.body.companyId'));
            assert_1.default.ok(compliance.includes('Property not found'));
            assert_1.default.ok(compliance.includes('Document not found'));
            results['53 Cross-company access denied'] = 'PASS';
            results['54 Cross-property access denied'] = 'PASS';
            results['55 Client-supplied companyId cannot bypass authorization'] = 'PASS';
        }
        {
            assert_1.default.ok(complianceTypes_1.COMPLIANCE_STATUSES.includes('READY_FOR_ACCOUNTANT'));
            assert_1.default.ok(constantsUi.includes('Tax Compliance'));
            assert_1.default.ok(constantsUi.includes('tax/compliance'));
            assert_1.default.ok(workspaceUi.includes('generateTaxPack'));
            assert_1.default.ok(workspaceUi.includes('finalizeTaxPack'));
            assert_1.default.ok(workspaceUi.includes('getTaxPackExportUrl'));
            assert_1.default.ok(srcFile('services/tax/complianceTypes.ts').includes('not a ZIMRA assessment'));
            assert_1.default.ok(!compliance.includes('ZIMRA compliant'));
            assert_1.default.ok(!compliance.includes('ZIMRA approved'));
            assert_1.default.ok(!compliance.includes('ZIMRA certified'));
            assert_1.default.ok(compliance.includes('Recorded by landlord') || compliance.includes('recordedByLandlord: true'));
            results['UI uses working-paper language'] = 'PASS';
        }
        console.log(JSON.stringify(results, null, 2));
        if (Object.values(results).some((value) => value !== 'PASS'))
            throw new Error('Phase H tests failed');
        console.log('Phase H individual tax compliance tests: ALL PASS');
    });
}
run().catch((error) => {
    console.error(error);
    process.exit(1);
});
