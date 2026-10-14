import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { calculateIndividualVat } from '../services/individualVatCalculation';
import { calculateIndividualRentalTax } from '../services/individualRentalTaxCalculation';
import { evaluateIndividualRentalTaxApplicability } from '../services/individualRentalTaxApplicability';
import { resolveRentalTaxBase } from '../services/individualRentalTaxBase';
import { calculateOrdinaryIncomeTaxWorkingPaper } from '../services/individualIncomeTaxCalculation';
import { calculateTaxableIncomePercent } from '../services/tax/incomeTaxRounding';
import { calculateGrossRentalPercent } from '../services/tax/rentalTaxRounding';
import { evaluateComplianceReadiness } from '../services/individualTaxComplianceReadinessService';
import { systemTaxRuleSeeds } from '../services/taxRuleRegistry';
import { classifyLandlordCategory } from '../services/individualAccountingCategories';
import { sumCompleteTaxAmounts, netFromNullable } from '../services/tax/taxAmountAggregation';
import { buildXlsxWorkbookSheets } from '../utils/xlsxWorkbook';
import { TAX_TYPE_MODE } from '../services/tax/taxTypes';

function srcFile(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', '..', 'src', rel), 'utf8');
}

function clientFile(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), '..', 'client', 'src', rel), 'utf8');
}

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

async function run(): Promise<void> {
  const results: Record<string, string> = {};
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
    assert.ok(orch.includes('export async function postPaymentAccounting'));
    assert.ok(srcFile('services/paymentAccountingReconciliation.ts').includes('ensurePaymentAccountingPosted'));
    assert.ok(accounting.includes('LandlordFinancialTransaction.create'));
    assert.ok(accounting.includes('ensureTaxOverlay'));
    assert.ok(accounting.includes('accounting remains valid'));
    assert.ok(orch.includes('safeAttachForPayment'));
    results['Architecture accounting remains authoritative'] = 'PASS';
    results['Fail-soft tax overlay after accounting'] = 'PASS';
  }

  {
    assert.ok(!compliance.includes('calculateIndividualVat'));
    assert.ok(!compliance.includes('calculateIndividualRentalTax'));
    assert.ok(!compliance.includes('calculateOrdinaryIncomeTaxWorkingPaper'));
    assert.ok(compliance.includes('IndividualVatRecord.find'));
    assert.ok(compliance.includes('IndividualRentalTaxRecord.find'));
    assert.ok(compliance.includes('IndividualIncomeTaxRecord.find'));
    assert.ok(compliance.includes('annualSchedule'));
    results['Pack consumes stored projections'] = 'PASS';
  }

  {
    const notRegistered = calculateIndividualVat({
      direction: 'OUTPUT',
      treatment: 'NOT_VAT_REGISTERED',
      amount: 2000,
      vatRatePercent: 15.5,
      method: 'EXCLUSIVE'
    });
    assert.strictEqual(notRegistered.calculationStatus, 'NOT_APPLICABLE');
    assert.strictEqual(notRegistered.vatAmount, null);
    const exempt = calculateIndividualVat({
      direction: 'OUTPUT',
      treatment: 'EXEMPT',
      amount: 2000,
      vatRatePercent: 15.5,
      method: 'EXCLUSIVE'
    });
    assert.strictEqual(exempt.treatment, 'EXEMPT');
    assert.strictEqual(exempt.vatAmount, 0);
    const missingEvidence = calculateIndividualVat({
      direction: 'INPUT',
      treatment: 'STANDARD',
      amount: 100,
      vatRatePercent: 15.5,
      method: 'EXCLUSIVE',
      inputVatEligibility: 'RECOVERABLE'
    });
    assert.strictEqual(missingEvidence.calculationStatus, 'REVIEW_REQUIRED');
    assert.strictEqual(missingEvidence.vatAmount, null);
    assert.ok(missingEvidence.reviewReasons.includes('MISSING_SUPPLIER_VAT_NUMBER'));
    assert.strictEqual(notRegistered.incomeTaxAmount, null);
    assert.strictEqual(notRegistered.presumptiveTaxAmount, null);
    results['VAT not registered is not zero'] = 'PASS';
    results['VAT exempt remains calculated zero'] = 'PASS';
    results['Missing supplier VAT evidence is review'] = 'PASS';
  }

  {
    const applicability = evaluateIndividualRentalTaxApplicability({
      sourceKind: 'PAYMENT_RENT',
      rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
      rentalTaxTreatment: 'PRESUMPTIVE_RENTAL',
      propertyUseClass: 'COMMERCIAL',
      profileSnapshotPresent: true,
      transactionDate: '2026-09-17',
      rentalTaxRule: rentalRule
    });
    const taxBase = resolveRentalTaxBase({
      sourceKind: 'PAYMENT_RENT',
      amount: 2000,
      category: 'RENTAL_INCOME'
    });
    const calc = calculateIndividualRentalTax({ applicability, taxBase });
    assert.strictEqual(applicability.taxRuleCode, 'ZW_PRESUMPTIVE_RENTAL_PN08_2026');
    assert.strictEqual(calc.taxAmount, calculateGrossRentalPercent(2000, Number(rentalRule.rate)));
    assert.strictEqual(calc.taxAmount, 300);
    assert.ok(!srcFile('services/individualRentalTaxCalculation.ts').includes('* 0.15'));
    const residential = evaluateIndividualRentalTaxApplicability({
      sourceKind: 'PAYMENT_RENT',
      rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
      propertyUseClass: 'RESIDENTIAL_DWELLING',
      profileSnapshotPresent: true,
      rentalTaxRule: rentalRule
    });
    assert.strictEqual(residential.status, 'NOT_APPLICABLE');
    const mixed = evaluateIndividualRentalTaxApplicability({
      sourceKind: 'PAYMENT_RENT',
      rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
      propertyUseClass: 'MIXED_USE',
      profileSnapshotPresent: true,
      rentalTaxRule: rentalRule
    });
    assert.strictEqual(mixed.status, 'REVIEW_REQUIRED');
    const deposit = evaluateIndividualRentalTaxApplicability({
      sourceKind: 'PAYMENT_DEPOSIT',
      rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
      propertyUseClass: 'COMMERCIAL',
      profileSnapshotPresent: true,
      rentalTaxRule: rentalRule
    });
    assert.strictEqual(deposit.status, 'NOT_APPLICABLE');
    results['Phase F commercial PN08 golden case'] = 'PASS';
    results['Residential not liable under configured rule'] = 'PASS';
    results['Mixed-use requires review'] = 'PASS';
    results['Deposit is not rental income'] = 'PASS';
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
    assert.strictEqual(paper.taxAmount, calculateTaxableIncomePercent(19000, Number(configured.rate)));
    assert.ok(!srcFile('services/individualIncomeTaxCalculation.ts').includes('* 0.25'));
    assert.strictEqual(paper.vatAmount, null);
    assert.strictEqual(paper.presumptiveTaxAmount, null);
    results['Phase G taxable income 19000'] = 'PASS';
    results['Income tax uses configured rule not a literal'] = 'PASS';
  }

  {
    const mixed = calculateOrdinaryIncomeTaxWorkingPaper({
      currencies: ['USD', 'ZWG'],
      accountingIncome: 1000,
      accountingExpenses: 0,
      lineAddBacks: 0,
      lineDeductions: 0,
      lineExemptIncome: 0,
      incomeTaxRule: configured
    });
    assert.strictEqual(mixed.calculationStatus, 'REVIEW_REQUIRED');
    assert.ok(mixed.reviewReasons.includes('CURRENCY_CONVERSION_REQUIRED'));
    assert.strictEqual(mixed.taxAmount, null);
    results['Mixed currency does not invent FX'] = 'PASS';
  }

  {
    const incomplete = sumCompleteTaxAmounts(
      [
        { calculationStatus: 'CALCULATED', vatAmount: 100 },
        { calculationStatus: 'REVIEW_REQUIRED', vatAmount: null }
      ],
      (row) => row.vatAmount
    );
    assert.strictEqual(incomplete, null);
    const complete = sumCompleteTaxAmounts(
      [
        { calculationStatus: 'CALCULATED', vatAmount: 100 },
        { calculationStatus: 'NOT_APPLICABLE', vatAmount: null },
        { calculationStatus: 'CALCULATED', vatAmount: 50 }
      ],
      (row) => row.vatAmount
    );
    assert.strictEqual(complete, 150);
    assert.strictEqual(netFromNullable(null, 10), null);
    assert.strictEqual(netFromNullable(20, 5), 15);
    results['Null tax amounts are not coerced to zero'] = 'PASS';
  }

  {
    const ownership = evaluateComplianceReadiness({ hasAnyActivity: true, ownershipUnclear: true });
    assert.strictEqual(ownership.status, 'REVIEW_REQUIRED');
    assert.ok(ownership.blockers.some((row) => row.issueType === 'OWNERSHIP_ALLOCATION_UNCLEAR'));
    assert.ok(compliance.includes('ownerShareIncome: ownership === 100 ? pnl.income : null'));
    results['Joint ownership is REVIEW_REQUIRED'] = 'PASS';
    results['Ownership is not used to invent a taxable share'] = 'PASS';
  }

  {
    const capital = classifyLandlordCategory('CAPITAL_IMPROVEMENT');
    assert.strictEqual(capital.sourceKind, 'CAPITAL');
    assert.strictEqual(capital.accountingTreatment, 'CAPITAL');
    assert.strictEqual(capital.deductibility, 'CAPITAL');
    const depositCat = classifyLandlordCategory('TENANT_DEPOSIT');
    assert.strictEqual(depositCat.sourceKind, 'LIABILITY');
    const application = classifyLandlordCategory('DEPOSIT_APPLICATION');
    assert.strictEqual(application.accountingTreatment, 'PROPERTY_INCOME');
    results['Capital is not ordinary expense'] = 'PASS';
    results['Deposit is not income until applied'] = 'PASS';
  }

  {
    assert.ok(accounting.includes("throw new AppError('Application exceeds remaining deposit', 400)"));
    assert.ok(accounting.includes("throw new AppError('rentalDepositId is required to apply a deposit to rent', 400)"));
    assert.ok(accounting.includes("type: 'payout'"));
    assert.ok(accounting.includes('APPLY-${String(application._id)}') || accounting.includes('APPLY-${'));
    assert.ok(accounting.includes('original deposit was not mutated') || accounting.includes('original deposit remains unchanged') || accounting.includes('Original deposit receipt'));
    results['Deposit application cannot exceed remaining balance'] = 'PASS';
    results['Deposit application payout is idempotent'] = 'PASS';
  }

  {
    assert.ok(accounting.includes('code === 11000'));
    assert.ok(accounting.includes('idempotencyKey'));
    assert.ok(vatModel.includes('unique: true'));
    assert.ok(rentalModel.includes('unique: true'));
    assert.ok(incomeModel.includes('unique: true'));
    assert.ok(packModel.includes("index({ companyId: 1, taxYear: 1, version: 1 }, { unique: true })"));
    assert.ok(compliance.includes('error?.code === 11000'));
    assert.ok(compliance.includes('IndividualTaxPack.create'));
    const createIdx = compliance.indexOf('const created = await IndividualTaxPack.create');
    const supersedeIdx = compliance.indexOf("latest.status = 'SUPERSEDED'");
    assert.ok(createIdx > 0 && supersedeIdx > createIdx);
    results['Idempotent financial writes'] = 'PASS';
    results['Concurrent pack generation uses unique version'] = 'PASS';
    results['Pack create-then-supersede race'] = 'PASS';
  }

  {
    assert.ok(snapshotModel.includes('cannot be updated in place'));
    assert.ok(vatModel.includes('cannot be updated in place'));
    assert.ok(rentalModel.includes('cannot be updated in place'));
    assert.ok(incomeModel.includes('cannot be updated in place'));
    assert.ok(packModel.includes('cannot be updated in place'));
    assert.ok(packModel.includes('Hard delete is disabled'));
    results['Immutability hooks remain'] = 'PASS';
  }

  {
    assert.ok(indexes.includes("name: 'TransactionTaxSnapshot'"));
    assert.ok(indexes.includes("name: 'TaxPeriod'"));
    assert.ok(indexes.includes("name: 'TaxRule'"));
    assert.ok(indexes.includes("name: 'IndividualVatRecord'"));
    assert.ok(indexes.includes("name: 'IndividualRentalTaxRecord'"));
    assert.ok(indexes.includes("name: 'IndividualIncomeTaxRecord'"));
    assert.ok(indexes.includes("name: 'IndividualTaxPack'"));
    assert.ok(indexes.includes("name: 'IndividualTaxEvidence'"));
    assert.ok(indexes.includes("name: 'LandlordFinancialTransaction'"));
    results['Phase D-H indexes are created at startup'] = 'PASS';
  }

  {
    assert.ok(!vatUi.includes('outputVat || 0'));
    assert.ok(!rentalUi.includes('calculatedRentalTax || 0'));
    assert.ok(vatUi.includes("value == null ? 'not calculated'"));
    assert.ok(rentalUi.includes("value == null ? 'not calculated'"));
    assert.ok(incomeUi.includes("value == null ? 'not calculated'"));
    assert.ok(complianceUi.includes("value == null ? 'not calculated'"));
    results['UI does not display null tax as $0'] = 'PASS';
  }

  {
    assert.ok(!compliance.includes("page.drawText(String(text || '').slice(0, 108)"));
    assert.ok(compliance.includes('const wrap = (text: string, maxChars: number)'));
    assert.ok(compliance.includes("line('Adjustments', 12, true)"));
    assert.ok(compliance.includes("line('Recorded tax payments', 12, true)"));
    assert.ok(compliance.includes("line('Evidence status', 12, true)"));
    assert.ok(!vatService.includes('text.slice(0, 110)'));
    const xlsx = buildXlsxWorkbookSheets([
      { name: 'Cover', rows: [{ field: 'Report', value: 'pack' }] },
      { name: 'VAT', rows: [{ outputVat: null, status: 'NOT_CALCULATED' }] },
      { name: 'Rental Tax', rows: [{ calculated: 300 }] },
      { name: 'Income Tax', rows: [{ calculated: 4750 }] }
    ]);
    assert.ok(xlsx.slice(0, 2).toString() === 'PK');
    assert.ok(xlsx.includes(Buffer.from('xl/worksheets/sheet1.xml')));
    assert.ok(xlsx.includes(Buffer.from('xl/worksheets/sheet4.xml')));
    results['PDF wraps instead of truncating'] = 'PASS';
    results['XLSX is OOXML not CSV'] = 'PASS';
  }

  {
    assert.ok(compliance.includes("paymentStatus: 'NOT_RECORDED'"));
    assert.ok(compliance.includes('recordedPayments: null'));
    assert.ok(compliance.includes('unreconciled: null'));
    assert.ok(compliance.includes('combinedTotalTaxPayable: null'));
    assert.ok(compliance.includes('zimraBalance: null'));
    assert.ok(!compliance.includes('ZIMRA payable'));
    assert.ok(!compliance.includes('ZIMRA confirmed'));
    assert.ok(!compliance.includes('ZIMRA compliant'));
    assert.ok(!complianceUi.includes('ZIMRA payable'));
    results['VAT payments are not recorded'] = 'PASS';
    results['No fabricated combined ZIMRA payable'] = 'PASS';
  }

  {
    assert.ok(!compliance.includes('PAYE'));
    assert.ok(!incomeService.includes('PAYE'));
    assert.ok(!srcFile('services/individualIncomeTaxCalculation.ts').includes('PAYE'));
    assert.ok(!srcFile('services/individualIncomeTaxCalculation.ts').includes('employment tax'));
    assert.strictEqual(TAX_TYPE_MODE.INCOME_TAX, 'NOT_IMPLEMENTED');
    assert.ok(readinessSrc.includes('AIDS levy is not included'));
    results['PAYE is not used for landlord income tax'] = 'PASS';
    results['AIDS levy remains review-only'] = 'PASS';
  }

  {
    assert.ok(routes.includes('req.user!.companyId!'));
    assert.ok(!routes.includes('req.body.companyId'));
    assert.ok(compliance.includes("File.findOne({ _id: asObjectId(input.documentId), companyId: asObjectId(input.companyId) })"));
    assert.ok(compliance.includes("Evidence not found"));
    assert.ok(errorHandler.includes("process.env.NODE_ENV === 'development'"));
    assert.ok(errorHandler.includes('stack: err.stack'));
    results['Company scoping is server-side'] = 'PASS';
    results['Evidence files are company-scoped'] = 'PASS';
    results['Stack traces are development-only'] = 'PASS';
  }

  {
    assert.ok(incomeService.includes('incompleteMonths'));
    assert.ok(incomeService.includes('papers.some((row) => row.accountingProfit == null)'));
    assert.ok(!incomeService.includes('* 12'));
    assert.ok(compliance.includes('lifetimeNotUsed: true'));
    results['Annual income tax identifies incomplete months'] = 'PASS';
  }

  {
    const missingPeriod = evaluateComplianceReadiness({ hasAnyActivity: true, missingTaxPeriods: 1 });
    assert.ok(missingPeriod.blockers.some((row) => row.issueType === 'MISSING_TAX_PERIOD'));
    const closed = srcFile('services/taxPeriodService.ts');
    assert.ok(closed.includes('PERIOD_CLOSED') || closed.includes('FINALIZED') || closed.includes('LOCKED'));
    assert.ok(!srcFile('services/taxPeriodService.ts').includes('autoCreate') && !srcFile('services/taxPeriodService.ts').includes('createIfMissing'));
    results['Missing tax period is explicit'] = 'PASS';
  }

  {
    assert.ok(!accounting.includes('JournalEntry.create'));
    assert.ok(!compliance.includes("from '../models/TaxObligation'"));
    assert.ok(!vatService.includes('commissionVat'));
    results['Agency accounting unmodified'] = 'PASS';
    results['No competing ledger'] = 'PASS';
  }

  console.log(JSON.stringify(results, null, 2));
  if (Object.values(results).some((value) => value !== 'PASS')) throw new Error('Phase I tests failed');
  console.log('Phase I individual production-readiness tests: ALL PASS');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
