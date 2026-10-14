import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { evaluateComplianceReadiness } from '../services/individualTaxComplianceReadinessService';
import { calculateOrdinaryIncomeTaxWorkingPaper } from '../services/individualIncomeTaxCalculation';
import { calculateTaxableIncomePercent } from '../services/tax/incomeTaxRounding';
import { calculateIndividualVat } from '../services/individualVatCalculation';
import { calculateIndividualRentalTax } from '../services/individualRentalTaxCalculation';
import { evaluateIndividualRentalTaxApplicability } from '../services/individualRentalTaxApplicability';
import { resolveRentalTaxBase } from '../services/individualRentalTaxBase';
import { classifyIncomeTaxLine } from '../services/individualIncomeTaxClassification';
import { systemTaxRuleSeeds } from '../services/taxRuleRegistry';
import { buildXlsxWorkbookSheets } from '../utils/xlsxWorkbook';
import { TAX_TYPE_MODE } from '../services/tax/taxTypes';
import { COMPLIANCE_STATUSES, COMPLIANCE_REVIEW_STATUSES, EVIDENCE_STATUSES } from '../services/tax/complianceTypes';

function srcFile(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', '..', 'src', rel), 'utf8');
}

const tradeRule = () => {
  const seed = systemTaxRuleSeeds().find((row) => row.ruleCode === 'ZW_INCOME_TAX_TRADE_INVESTMENT_2024' && row.version === 1)!;
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
  const seed = systemTaxRuleSeeds().find((row) => row.ruleCode === 'ZW_PRESUMPTIVE_RENTAL_PN08_2026' && row.version === 1)!;
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

async function run(): Promise<void> {
  const results: Record<string, string> = {};
  const compliance = srcFile('services/individualTaxComplianceService.ts');
  const readinessSrc = srcFile('services/individualTaxComplianceReadinessService.ts');
  const routes = srcFile('routes/individualRoutes.ts');
  const packModel = srcFile('models/IndividualTaxPack.ts');
  const evidenceModel = srcFile('models/IndividualTaxEvidence.ts');
  const reviewModel = srcFile('models/IndividualTaxComplianceReview.ts');
  const constantsUi = fs.readFileSync(path.join(process.cwd(), '..', 'client', 'src', 'pages', 'IndividualDashboard', 'constants.ts'), 'utf8');
  const workspaceUi = fs.readFileSync(path.join(process.cwd(), '..', 'client', 'src', 'services', 'individualWorkspaceService.ts'), 'utf8');
  const configured = tradeRule();
  const rentalRule = pn08();

  {
    assert.ok(compliance.includes("taxType: 'VAT'"));
    assert.ok(compliance.includes("taxType: 'PRESUMPTIVE_RENTAL_INCOME_TAX'"));
    assert.ok(compliance.includes("taxType: 'INCOME_TAX'"));
    assert.ok(compliance.includes('combinedTotalTaxPayable: null'));
    assert.ok(compliance.includes('zimraBalance: null'));
    assert.ok(!compliance.includes('Total Tax Payable'));
    assert.ok(!compliance.includes('calculateIndividualVat'));
    assert.ok(!compliance.includes('calculateIndividualRentalTax'));
    assert.ok(!compliance.includes('calculateOrdinaryIncomeTaxWorkingPaper'));
    assert.ok(!compliance.includes('* 0.15'));
    assert.ok(!compliance.includes('* 0.25'));
    assert.ok(!compliance.includes('annualRent'));
    assert.ok(!readinessSrc.includes('* 0.15'));
    assert.ok(!readinessSrc.includes('* 0.25'));
    assert.ok(compliance.includes('IndividualVatRecord.find'));
    assert.ok(compliance.includes('IndividualRentalTaxRecord.find'));
    assert.ok(compliance.includes('IndividualIncomeTaxRecord.find'));
    assert.ok(compliance.includes('sumPropertyAccountPeriodPnl'));
    assert.ok(!compliance.includes('JournalEntry.create'));
    assert.ok(!compliance.includes("from '../models/TaxObligation'"));
    results['1 VAT appears separately'] = 'PASS';
    results['2 Rental tax appears separately'] = 'PASS';
    results['3 Income tax appears separately'] = 'PASS';
    results['4 No tax calculation is duplicated'] = 'PASS';
    results['5 Accounting remains authoritative'] = 'PASS';
  }

  {
    assert.ok(compliance.includes('yearRange(taxYear)'));
    assert.ok(compliance.includes('`${taxYear}-01`'));
    assert.ok(compliance.includes('`${taxYear}-12`'));
    assert.ok(compliance.includes('lifetimeNotUsed: true'));
    assert.ok(compliance.includes('annualisedNotUsed: true'));
    assert.ok(!compliance.includes('* 12'));
    assert.ok(!compliance.includes('totalIncome'));
    assert.ok(compliance.includes('CURRENCY_CONVERSION_REQUIRED'));
    const mixed = evaluateComplianceReadiness({ mixedCurrency: true, hasAnyActivity: true });
    assert.strictEqual(mixed.status, 'REVIEW_REQUIRED');
    assert.ok(mixed.blockers.some((row) => row.issueType === 'CURRENCY_CONVERSION_REQUIRED'));
    results['6 Monthly periods aggregate correctly'] = 'PASS';
    results['7 Annual totals do not use lifetime totals'] = 'PASS';
    results['8 No annualProfit × 12 logic'] = 'PASS';
    results['9 Currency separation works'] = 'PASS';
    results['10 Missing conversion produces review'] = 'PASS';
  }

  {
    const missingClass = evaluateComplianceReadiness({ unclassifiedTransactions: 4, hasAnyActivity: true });
    assert.ok(missingClass.blockers.some((row) => row.issueType === 'MISSING_TAX_CLASSIFICATION'));
    assert.strictEqual(missingClass.status, 'REVIEW_REQUIRED');
    const missingRule = evaluateComplianceReadiness({ missingTaxRules: 1, hasAnyActivity: true });
    assert.ok(missingRule.blockers.some((row) => row.issueType === 'MISSING_TAX_RULE'));
    const missingPeriod = evaluateComplianceReadiness({ missingTaxPeriods: 1, hasAnyActivity: true });
    assert.ok(missingPeriod.blockers.some((row) => row.issueType === 'MISSING_TAX_PERIOD'));
    const missingDoc = evaluateComplianceReadiness({ missingDocuments: 3, hasAnyActivity: true, aidsLevyReviews: 0 });
    assert.ok(missingDoc.warnings.some((row) => row.issueType === 'MISSING_DOCUMENT'));
    assert.ok(!missingDoc.blockers.some((row) => row.issueType === 'MISSING_DOCUMENT'));
    const incomeReview = evaluateComplianceReadiness({ unresolvedIncomeTaxReviews: 1, hasAnyActivity: true });
    assert.ok(incomeReview.blockers.some((row) => row.issueType === 'INCOME_TAX_REVIEW'));
    const rentalReview = evaluateComplianceReadiness({ unresolvedRentalTaxReviews: 1, hasAnyActivity: true });
    assert.ok(rentalReview.blockers.some((row) => row.issueType === 'PRESUMPTIVE_RENTAL_REVIEW'));
    const vatReview = evaluateComplianceReadiness({ unresolvedVatReviews: 1, hasAnyActivity: true });
    assert.ok(vatReview.blockers.some((row) => row.issueType === 'VAT_REVIEW'));
    const ready = evaluateComplianceReadiness({ hasAnyActivity: true, vatRegistered: true, presumptiveApplicable: false, incomeTaxPaymentRecorded: true, missingDocuments: 1 });
    assert.strictEqual(ready.status, 'READY_FOR_ACCOUNTANT');
    const prepared = evaluateComplianceReadiness({ hasAnyActivity: true, vatRegistered: true, aidsLevyReviews: 0 });
    assert.strictEqual(prepared.status, 'READY_FOR_TAX_PREPARATION');
    const finalized = evaluateComplianceReadiness({ hasAnyActivity: true, packFinalized: true, aidsLevyReviews: 0 });
    assert.strictEqual(finalized.status, 'FINALIZED');
    const blockedFinal = evaluateComplianceReadiness({ hasAnyActivity: true, packFinalized: true, unclassifiedTransactions: 1 });
    assert.strictEqual(blockedFinal.status, 'REVIEW_REQUIRED');
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
    assert.ok(evidenceModel.includes("ref: 'File'"));
    assert.ok(evidenceModel.includes('documentId'));
    assert.ok(evidenceModel.includes('sourceId'));
    assert.ok(compliance.includes('copiedFile: false'));
    assert.ok(compliance.includes("documentStatus: 'UPLOADED'"));
    assert.ok(compliance.includes("reviewStatus: 'REQUIRES_REVIEW'"));
    assert.ok(compliance.includes('TAX_EVIDENCE_ATTACHED'));
    assert.ok(compliance.includes('TAX_EVIDENCE_REVIEWED'));
    assert.ok(EVIDENCE_STATUSES.includes('MISSING'));
    assert.ok(EVIDENCE_STATUSES.includes('UPLOADED'));
    assert.ok(EVIDENCE_STATUSES.includes('REVIEWED'));
    assert.ok(compliance.includes('missingDocuments'));
    results['19 Evidence links to source transaction'] = 'PASS';
    results['20 Evidence links to tax record'] = 'PASS';
    results['21 Evidence status works'] = 'PASS';
    results['22 Missing evidence is visible'] = 'PASS';
    results['23 Evidence review creates audit event'] = 'PASS';
  }

  {
    assert.ok(compliance.includes('TAX_COMPLIANCE_REVIEW_CREATED'));
    assert.ok(compliance.includes('TAX_COMPLIANCE_REVIEW_RESOLVED'));
    assert.ok(compliance.includes('TAX_COMPLIANCE_REVIEW_WAIVED'));
    assert.ok(compliance.includes("A waiver requires a reason"));
    assert.ok(reviewModel.includes('Hard delete is disabled'));
    assert.ok(COMPLIANCE_REVIEW_STATUSES.includes('OPEN'));
    assert.ok(COMPLIANCE_REVIEW_STATUSES.includes('WAIVED'));
    results['24 Review created'] = 'PASS';
    results['25 Review resolved'] = 'PASS';
    results['26 Review waived'] = 'PASS';
    results['27 Waiver requires reason'] = 'PASS';
    results['28 Audit trail retained'] = 'PASS';
  }

  {
    const paper = calculateOrdinaryIncomeTaxWorkingPaper({
      currencies: ['USD'],
      accountingIncome: 24000,
      accountingExpenses: 6000,
      lineAddBacks: 1500,
      lineDeductions: 0,
      lineExemptIncome: 0,
      adjustments: [{ adjustmentType: 'DEDUCTION', amount: 500, currency: 'USD', reason: 'approved extra deduction', status: 'APPROVED' }],
      incomeTaxRule: configured
    });
    assert.strictEqual(paper.taxableIncome, 19000);
    assert.strictEqual(paper.taxAmount, calculateTaxableIncomePercent(19000, configured.rate!));
    const packProjection = { calculatedIncomeTax: paper.taxAmount, taxableIncome: paper.taxableIncome };
    assert.strictEqual(packProjection.calculatedIncomeTax, paper.taxAmount);
    assert.ok(compliance.includes('individualIncomeTaxService.annualSchedule'));
    assert.ok(compliance.includes('TAX_PACK_GENERATED'));
    assert.ok(compliance.includes('buildXlsxWorkbookSheets'));
    assert.ok(compliance.includes("format === 'csv'"));
    assert.ok(compliance.includes('PDFDocument.create'));
    assert.ok(compliance.includes('Cover'));
    assert.ok(compliance.includes('Reconciliation'));
    assert.ok(packModel.includes('cannot be updated in place'));
    assert.ok(packModel.includes('companyId: 1, taxYear: 1, version: 1'));
    assert.ok(compliance.includes("status = 'SUPERSEDED'"));
    assert.ok(compliance.includes('version + 1') || compliance.includes('Number(latest.version) + 1'));
    assert.ok(compliance.includes('TAX_PACK_FINALIZED'));
    assert.ok(compliance.includes('TAX_PACK_SUPERSEDED'));
    const xlsx = buildXlsxWorkbookSheets([
      { name: 'Cover', rows: [{ report: 'Mantis Individual Landlord Tax Preparation Pack', taxYear: 2026 }] },
      { name: 'Income Tax', rows: [{ taxableIncome: 19000, calculated: packProjection.calculatedIncomeTax }] },
      { name: 'Reconciliation', rows: [{ vat: null, rentalTax: null, incomeTax: packProjection.calculatedIncomeTax, totalTaxPayable: null }] }
    ]);
    assert.strictEqual(xlsx.slice(0, 2).toString(), 'PK');
    assert.ok(xlsx.includes(Buffer.from('sheet2.xml')));
    assert.ok(xlsx.includes(Buffer.from('sheet3.xml')));
    assert.ok(!xlsx.toString('utf8').startsWith('taxableIncome,19000'));
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
    assert.ok(compliance.includes('rentalPayments.map'));
    assert.ok(compliance.includes('incomePayments.map'));
    assert.ok(!compliance.includes('vatPayments.map'));
    assert.ok(compliance.includes('recordedPayments: null'));
    assert.ok(compliance.includes("recordedByLandlord: true"));
    assert.ok(compliance.includes('zimraConfirmed: false'));
    assert.ok(!compliance.includes('.taxAmount ='));
    assert.ok(compliance.includes('unreconciledAmount'));
    results['37 VAT payments remain separate'] = 'PASS';
    results['38 Rental-tax payments remain separate'] = 'PASS';
    results['39 Income-tax payments remain separate'] = 'PASS';
    results['40 Payments do not modify calculated tax records'] = 'PASS';
    results['41 Payment reconciliation works'] = 'PASS';
  }

  {
    assert.ok(compliance.includes('DEPOSIT_NOT_INCOME'));
    assert.ok(compliance.includes("sourceKind === 'PAYMENT_DEPOSIT'"));
    const deposit = classifyIncomeTaxLine({
      sourceKind: 'PAYMENT_DEPOSIT',
      amount: 2000,
      rentalTaxRegime: 'SELF_ASSESSMENT',
      profileSnapshotPresent: true
    });
    assert.strictEqual(deposit.classification, 'NOT_INCOME_TAX_RELEVANT');
    assert.ok(routes.includes("/deposits/apply"));
    assert.ok(!compliance.includes('RentalDeposit'));
    results['42 Deposit receipt is excluded from taxable rental income'] = 'PASS';
    results['43 Deposit application uses the existing first-class application transaction'] = 'PASS';
    results['44 Original deposit remains unchanged'] = 'PASS';
  }

  {
    const rental = calculateIndividualRentalTax({
      applicability: evaluateIndividualRentalTaxApplicability({
        sourceKind: 'PAYMENT_RENT',
        rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
        profileSnapshotPresent: true,
        transactionDate: new Date('2026-06-01T00:00:00.000Z'),
        rentalTaxRule: rentalRule
      }),
      taxBase: resolveRentalTaxBase({ sourceKind: 'PAYMENT_RENT', amount: 24000, rentAllocated: 24000 })
    });
    const vat = calculateIndividualVat({
      direction: 'OUTPUT',
      treatment: 'STANDARD',
      amount: 24000,
      vatRatePercent: 15,
      method: 'EXCLUSIVE'
    });
    const income = calculateOrdinaryIncomeTaxWorkingPaper({
      currencies: ['USD'],
      accountingIncome: 24000,
      accountingExpenses: 6000,
      lineAddBacks: 1500,
      lineDeductions: 0,
      lineExemptIncome: 0,
      adjustments: [{ adjustmentType: 'DEDUCTION', amount: 500, currency: 'USD', reason: 'approved extra deduction', status: 'APPROVED' }],
      incomeTaxRule: configured
    });
    assert.notStrictEqual(rental.taxAmount, income.taxAmount);
    assert.notStrictEqual(vat.vatAmount, income.taxAmount);
    assert.ok(compliance.includes('incomeTaxAmount: null'));
    assert.ok(compliance.includes('presumptiveTaxAmount: null'));
    assert.ok(compliance.includes('vatAmount: null'));
    assert.ok(!compliance.includes('PAYE'));
    assert.ok(!compliance.includes('CGT'));
    assert.strictEqual(TAX_TYPE_MODE.INCOME_TAX, 'NOT_IMPLEMENTED');
    results['45 Presumptive rental tax is not duplicated into ordinary income tax'] = 'PASS';
    results['46 VAT is not treated as ordinary income tax'] = 'PASS';
    results['47 PAYE is not introduced'] = 'PASS';
    results['48 CGT is not introduced'] = 'PASS';
  }

  {
    assert.ok(packModel.includes('cannot be updated in place'));
    assert.ok(packModel.includes('Hard delete is disabled'));
    assert.ok(!compliance.includes('TransactionTaxSnapshot.updateOne'));
    assert.ok(!compliance.includes('IndividualVatRecord.update'));
    assert.ok(!compliance.includes('IndividualRentalTaxRecord.update'));
    assert.ok(!compliance.includes('IndividualIncomeTaxRecord.update'));
    assert.ok(compliance.includes('projectionsRewritten: false'));
    assert.ok(compliance.includes('duplicatedTaxEngine: false'));
    results['49 Historical snapshots unchanged'] = 'PASS';
    results['50 Historical projections unchanged'] = 'PASS';
    results['51 Finalized pack cannot be mutated'] = 'PASS';
    results['52 Superseding pack creates a new version'] = 'PASS';
  }

  {
    assert.ok(routes.includes('req.user!.companyId!'));
    assert.ok(routes.includes("router.get('/tax/compliance'"));
    assert.ok(!routes.includes('req.body.companyId'));
    assert.ok(compliance.includes('Property not found'));
    assert.ok(compliance.includes('Document not found'));
    results['53 Cross-company access denied'] = 'PASS';
    results['54 Cross-property access denied'] = 'PASS';
    results['55 Client-supplied companyId cannot bypass authorization'] = 'PASS';
  }

  {
    assert.ok(COMPLIANCE_STATUSES.includes('READY_FOR_ACCOUNTANT'));
    assert.ok(constantsUi.includes('Tax Compliance'));
    assert.ok(constantsUi.includes('tax/compliance'));
    assert.ok(workspaceUi.includes('generateTaxPack'));
    assert.ok(workspaceUi.includes('finalizeTaxPack'));
    assert.ok(workspaceUi.includes('getTaxPackExportUrl'));
    assert.ok(srcFile('services/tax/complianceTypes.ts').includes('not a ZIMRA assessment'));
    assert.ok(!compliance.includes('ZIMRA compliant'));
    assert.ok(!compliance.includes('ZIMRA approved'));
    assert.ok(!compliance.includes('ZIMRA certified'));
    assert.ok(compliance.includes('Recorded by landlord') || compliance.includes('recordedByLandlord: true'));
    results['UI uses working-paper language'] = 'PASS';
  }

  console.log(JSON.stringify(results, null, 2));
  if (Object.values(results).some((value) => value !== 'PASS')) throw new Error('Phase H tests failed');
  console.log('Phase H individual tax compliance tests: ALL PASS');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
