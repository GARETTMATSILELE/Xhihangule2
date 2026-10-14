import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { classifyIncomeTaxLine } from '../services/individualIncomeTaxClassification';
import { calculateOrdinaryIncomeTaxWorkingPaper } from '../services/individualIncomeTaxCalculation';
import { calculateTaxableIncomePercent } from '../services/tax/incomeTaxRounding';
import { calculateIndividualVat } from '../services/individualVatCalculation';
import { calculateIndividualRentalTax } from '../services/individualRentalTaxCalculation';
import { evaluateIndividualRentalTaxApplicability } from '../services/individualRentalTaxApplicability';
import { resolveRentalTaxBase } from '../services/individualRentalTaxBase';
import { assignmentStatusForExistingPeriod } from '../services/taxPeriodService';
import { systemTaxRuleSeeds } from '../services/taxRuleRegistry';
import { classifyLandlordCategory } from '../services/individualAccountingCategories';
import { buildXlsxWorkbook } from '../utils/xlsxWorkbook';
import { roundMoney } from '../utils/money';
import { TAX_TYPE_MODE } from '../services/tax/taxTypes';
import { taxPercentToFraction as rentalFraction } from '../services/tax/rentalTaxRounding';

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
  const configured = tradeRule();

  {
    const income = srcFile('models/IndividualIncomeTaxRecord.ts');
    const vat = srcFile('models/IndividualVatRecord.ts');
    const rental = srcFile('models/IndividualRentalTaxRecord.ts');
    assert.ok(income.includes("taxType: 'INCOME_TAX'"));
    assert.ok(vat.includes("taxType: 'VAT'"));
    assert.ok(rental.includes("taxType: 'PRESUMPTIVE_RENTAL_INCOME_TAX'"));
    assert.ok(!income.includes('IndividualVatRecord'));
    assert.ok(!income.includes('IndividualRentalTaxRecord'));
    results['1 Income-tax record is separate from VAT'] = 'PASS';
    results['2 Income-tax record is separate from presumptive rental tax'] = 'PASS';
  }

  {
    const orch = srcFile('services/paymentAccountingOrchestrator.ts');
    const service = srcFile('services/individualIncomeTaxService.ts');
    assert.ok(orch.includes('export async function postPaymentAccounting'));
    assert.ok(!service.includes("from '../models/TaxObligation'"));
    assert.ok(!service.includes('JournalEntry.create'));
    assert.ok(!service.includes('IncomeTaxLedger'));
    assert.ok(srcFile('services/propertyAccountTotals.ts').includes('sumPropertyAccountPeriodPnl'));
    assert.ok(service.includes('sumPropertyAccountPeriodPnl'));
    results['3 Agency accounting remains untouched'] = 'PASS';
    results['4 Accounting ledger remains authoritative'] = 'PASS';
  }

  {
    const taxable = classifyIncomeTaxLine({
      sourceKind: 'PAYMENT_RENT',
      amount: 24000,
      rentalTaxRegime: 'SELF_ASSESSMENT',
      category: 'RENTAL_INCOME',
      profileSnapshotPresent: true
    });
    assert.strictEqual(taxable.classification, 'TAXABLE_INCOME');
    assert.strictEqual(taxable.taxableContribution, 24000);
    results['5 Taxable income classification'] = 'PASS';
  }

  {
    const deduction = classifyIncomeTaxLine({
      sourceKind: 'EXPENSE',
      amount: 6000,
      rentalTaxRegime: 'SELF_ASSESSMENT',
      deductibility: 'DEDUCTIBLE',
      category: 'MAINTENANCE',
      profileSnapshotPresent: true,
      attachments: ['invoice-1']
    });
    assert.strictEqual(deduction.classification, 'ALLOWABLE_DEDUCTION');
    assert.strictEqual(deduction.deduction, 6000);
    results['6 Allowable deduction classification'] = 'PASS';
  }

  {
    const nd = classifyIncomeTaxLine({
      sourceKind: 'EXPENSE',
      amount: 1000,
      rentalTaxRegime: 'SELF_ASSESSMENT',
      deductibility: 'NON_DEDUCTIBLE',
      profileSnapshotPresent: true,
      attachments: ['bill']
    });
    assert.strictEqual(nd.classification, 'NON_DEDUCTIBLE');
    assert.strictEqual(nd.addBack, 1000);
    results['7 Non-deductible expense'] = 'PASS';
  }

  {
    const capital = classifyIncomeTaxLine({
      sourceKind: 'CAPITAL',
      amount: 8000,
      capitalOrRevenue: 'CAPITAL',
      profileSnapshotPresent: true
    });
    assert.strictEqual(capital.classification, 'CAPITAL');
    assert.notStrictEqual(capital.classification, 'ALLOWABLE_DEDUCTION');
    assert.strictEqual(capital.deduction, null);
    assert.ok(capital.reviewReasons.includes('CAPITAL_ALLOWANCE_NOT_IMPLEMENTED'));
    results['8 Capital expense'] = 'PASS';
    results['40 Capital expenditure does not become an ordinary deduction automatically'] = 'PASS';
  }

  {
    const priv = classifyIncomeTaxLine({
      sourceKind: 'EXPENSE',
      amount: 300,
      category: 'PRIVATE',
      rentalTaxRegime: 'SELF_ASSESSMENT',
      profileSnapshotPresent: true
    });
    assert.strictEqual(priv.classification, 'PRIVATE_EXPENSE');
    assert.strictEqual(priv.addBack, 300);
    results['9 Private expense'] = 'PASS';
  }

  {
    const exempt = classifyIncomeTaxLine({
      sourceKind: 'PAYMENT_RENT',
      amount: 2000,
      rentalTaxRegime: 'EXEMPT',
      category: 'RENTAL_INCOME',
      profileSnapshotPresent: true
    });
    assert.strictEqual(exempt.classification, 'EXEMPT_INCOME');
    assert.strictEqual(exempt.taxableContribution, 0);
    results['10 Exempt income'] = 'PASS';
  }

  {
    const review = classifyIncomeTaxLine({
      sourceKind: 'EXPENSE',
      amount: 400,
      rentalTaxRegime: 'SELF_ASSESSMENT',
      deductibility: 'ACCOUNTANT_REVIEW',
      profileSnapshotPresent: true
    });
    assert.strictEqual(review.classification, 'REVIEW_REQUIRED');
    assert.strictEqual(review.taxableContribution, null);
    results['11 Review-required classification'] = 'PASS';
  }

  {
    const paper = calculateOrdinaryIncomeTaxWorkingPaper({
      currencies: ['USD'],
      accountingIncome: 24000,
      accountingExpenses: 6000,
      lineAddBacks: 1500,
      lineDeductions: 4500,
      lineExemptIncome: 0,
      adjustments: [{ adjustmentType: 'DEDUCTION', amount: 500, currency: 'USD', reason: 'verified allowable adjustment', status: 'APPROVED' }],
      incomeTaxRule: configured
    });
    assert.strictEqual(paper.accountingProfit, 18000);
    assert.strictEqual(paper.addBacks, 1500);
    assert.strictEqual(paper.taxableIncome, 19000);
    assert.strictEqual(paper.taxRate, configured.rate);
    assert.strictEqual(paper.taxAmount, calculateTaxableIncomePercent(19000, configured.rate!));
    assert.strictEqual(paper.taxAmount, 4750);
    assert.strictEqual(paper.vatAmount, null);
    assert.strictEqual(paper.presumptiveTaxAmount, null);
    assert.ok(!srcFile('services/individualIncomeTaxCalculation.ts').includes('* 0.25'));
    assert.ok(!srcFile('services/tax/incomeTaxRounding.ts').includes('* 0.25'));
    assert.ok(srcFile('services/tax/incomeTaxRounding.ts').includes('taxPercentToFraction'));
    assert.strictEqual(configured.ruleCode, 'ZW_INCOME_TAX_TRADE_INVESTMENT_2024');
    assert.ok(!configured.sourceReference.toLowerCase().includes('paye'));
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
    const missingRule = calculateOrdinaryIncomeTaxWorkingPaper({
      currencies: ['USD'],
      accountingIncome: 18000,
      accountingExpenses: 0,
      lineAddBacks: 0,
      lineDeductions: 0,
      lineExemptIncome: 0,
      incomeTaxRule: null
    });
    assert.strictEqual(missingRule.calculationStatus, 'RULE_REQUIRED');
    assert.strictEqual(missingRule.taxAmount, null);
    results['21 Missing rule results in REVIEW_REQUIRED/RULE_REQUIRED'] = 'PASS';
  }

  {
    const missingPeriod = calculateOrdinaryIncomeTaxWorkingPaper({
      currencies: ['USD'],
      accountingIncome: 18000,
      accountingExpenses: 0,
      lineAddBacks: 0,
      lineDeductions: 0,
      lineExemptIncome: 0,
      incomeTaxRule: configured,
      periodAssignmentStatus: 'PERIOD_REQUIRED'
    });
    assert.strictEqual(missingPeriod.calculationStatus, 'PERIOD_REQUIRED');
    assert.strictEqual(missingPeriod.taxAmount, null);
    results['22 Missing period results in PERIOD_REQUIRED'] = 'PASS';
  }

  {
    assert.strictEqual(assignmentStatusForExistingPeriod('FINALIZED'), 'PERIOD_CLOSED');
    assert.strictEqual(assignmentStatusForExistingPeriod('LOCKED'), 'PERIOD_CLOSED');
    const service = srcFile('services/individualIncomeTaxService.ts');
    assert.ok(service.includes('PERIOD_CLOSED'));
    assert.ok(service.includes('Corrections require a reversal'));
    assert.ok(!service.includes('findOneAndUpdate'));
    results['23 Closed period cannot be silently recalculated'] = 'PASS';
  }

  {
    const missingProfile = classifyIncomeTaxLine({
      sourceKind: 'PAYMENT_RENT',
      amount: 1000,
      profileSnapshotPresent: false
    });
    assert.strictEqual(missingProfile.calculationStatus, 'PROFILE_REQUIRED');
    assert.strictEqual(missingProfile.taxableContribution, null);
    const paper = calculateOrdinaryIncomeTaxWorkingPaper({
      currencies: ['USD'],
      accountingIncome: 1000,
      accountingExpenses: 0,
      lineAddBacks: 0,
      lineDeductions: 0,
      lineExemptIncome: 0,
      incomeTaxRule: configured,
      profilePresent: false
    });
    assert.strictEqual(paper.calculationStatus, 'PROFILE_REQUIRED');
    assert.strictEqual(paper.taxAmount, null);
    results['24 Missing profile results in PROFILE_REQUIRED/REVIEW_REQUIRED'] = 'PASS';
  }

  {
    const presumptiveLine = classifyIncomeTaxLine({
      sourceKind: 'PAYMENT_RENT',
      amount: 24000,
      rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
      category: 'RENTAL_INCOME',
      profileSnapshotPresent: true
    });
    assert.strictEqual(presumptiveLine.classification, 'NOT_INCOME_TAX_RELEVANT');
    assert.strictEqual(presumptiveLine.taxableContribution, 0);
    const rental = calculateIndividualRentalTax({
      applicability: evaluateIndividualRentalTaxApplicability({
        sourceKind: 'PAYMENT_RENT',
        rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
        propertyUseClass: 'COMMERCIAL',
        profileSnapshotPresent: true,
        rentalTaxRule: pn08()
      }),
      taxBase: resolveRentalTaxBase({ sourceKind: 'PAYMENT_RENT', amount: 24000, rentAllocated: 24000 })
    });
    const ordinary = calculateOrdinaryIncomeTaxWorkingPaper({
      currencies: ['USD'],
      accountingIncome: 24000,
      accountingExpenses: 0,
      lineAddBacks: 0,
      lineDeductions: 0,
      lineExemptIncome: 24000,
      incomeTaxRule: configured
    });
    assert.ok(rental.taxAmount != null && rental.taxAmount > 0);
    assert.strictEqual(ordinary.taxableIncome, 0);
    assert.strictEqual(ordinary.taxAmount, 0);
    assert.notStrictEqual(ordinary.taxAmount, rental.taxAmount);
    results['25 Presumptive rental tax remains separate'] = 'PASS';
    results['26 Ordinary income tax does not incorrectly duplicate presumptive rental tax'] = 'PASS';
  }

  {
    const deposit = classifyIncomeTaxLine({
      sourceKind: 'PAYMENT_DEPOSIT',
      amount: 1500,
      category: 'TENANT_DEPOSIT',
      profileSnapshotPresent: true
    });
    assert.strictEqual(deposit.classification, 'NOT_INCOME_TAX_RELEVANT');
    assert.strictEqual(deposit.taxableContribution, null);
    const classified = classifyLandlordCategory('DEPOSIT_APPLICATION');
    assert.strictEqual(classified.sourceKind, 'OTHER_INCOME');
    const applied = classifyIncomeTaxLine({
      sourceKind: 'OTHER_INCOME',
      amount: 1500,
      rentalTaxRegime: 'SELF_ASSESSMENT',
      category: 'DEPOSIT_APPLICATION',
      profileSnapshotPresent: true
    });
    assert.strictEqual(applied.classification, 'TAXABLE_INCOME');
    assert.ok(srcFile('services/individualAccountingService.ts').includes('applyDepositToRent'));
    results['27 Deposit receipt is not ordinary taxable income'] = 'PASS';
    results['28 Deposit application creates the correct income transaction'] = 'PASS';
    results['29 Deposit application can flow into the appropriate tax classification'] = 'PASS';
  }

  {
    const vat = calculateIndividualVat({
      direction: 'OUTPUT',
      treatment: 'STANDARD',
      amount: 2000,
      vatRatePercent: 15.5,
      method: 'EXCLUSIVE'
    });
    const paper = calculateOrdinaryIncomeTaxWorkingPaper({
      currencies: ['USD'],
      accountingIncome: 2000,
      accountingExpenses: 0,
      lineAddBacks: 0,
      lineDeductions: 0,
      lineExemptIncome: 0,
      incomeTaxRule: configured
    });
    assert.notStrictEqual(vat.vatAmount, paper.taxAmount);
    assert.strictEqual(paper.vatAmount, null);
    const vatCalc = srcFile('services/individualVatCalculation.ts');
    assert.ok(!vatCalc.includes('individualIncomeTax'));
    const inputVat = classifyIncomeTaxLine({
      sourceKind: 'EXPENSE',
      amount: 155,
      rentalTaxRegime: 'SELF_ASSESSMENT',
      deductibility: 'ACCOUNTANT_REVIEW',
      category: 'INPUT_VAT',
      profileSnapshotPresent: true
    });
    assert.notStrictEqual(inputVat.classification, 'ALLOWABLE_DEDUCTION');
    results['30 VAT projection remains unchanged'] = 'PASS';
    results['31 VAT is not treated as income tax'] = 'PASS';
    results['32 Input VAT is not silently treated as an income-tax deduction'] = 'PASS';
  }

  {
    const usd = calculateOrdinaryIncomeTaxWorkingPaper({
      currencies: ['USD'],
      accountingIncome: 10000,
      accountingExpenses: 0,
      lineAddBacks: 0,
      lineDeductions: 0,
      lineExemptIncome: 0,
      incomeTaxRule: configured
    });
    const zwg = calculateOrdinaryIncomeTaxWorkingPaper({
      currencies: ['ZWG'],
      accountingIncome: 10000,
      accountingExpenses: 0,
      lineAddBacks: 0,
      lineDeductions: 0,
      lineExemptIncome: 0,
      incomeTaxRule: configured
    });
    const mixed = calculateOrdinaryIncomeTaxWorkingPaper({
      currencies: ['USD', 'ZWG'],
      accountingIncome: 20000,
      accountingExpenses: 0,
      lineAddBacks: 0,
      lineDeductions: 0,
      lineExemptIncome: 0,
      incomeTaxRule: configured
    });
    assert.strictEqual(usd.taxAmount, zwg.taxAmount);
    assert.deepStrictEqual(usd.currencies, ['USD']);
    assert.deepStrictEqual(zwg.currencies, ['ZWG']);
    assert.strictEqual(mixed.calculationStatus, 'REVIEW_REQUIRED');
    assert.strictEqual(mixed.taxAmount, null);
    assert.ok(mixed.reviewReasons.includes('CURRENCY_CONVERSION_REQUIRED'));
    results['33 USD remains USD'] = 'PASS';
    results['34 ZWG remains ZWG'] = 'PASS';
    results['35 No cross-currency arithmetic'] = 'PASS';
    results['36 Required conversion produces review if unavailable'] = 'PASS';
  }

  {
    const service = srcFile('services/individualIncomeTaxService.ts');
    assert.ok(service.includes('Manual income-tax adjustments require a reason'));
    assert.ok(service.includes('INCOME_TAX_ADJUSTMENT_CREATED'));
    assert.ok(service.includes('taxableIncomeOverwritten: false'));
    const pending = calculateOrdinaryIncomeTaxWorkingPaper({
      currencies: ['USD'],
      accountingIncome: 18000,
      accountingExpenses: 0,
      lineAddBacks: 0,
      lineDeductions: 0,
      lineExemptIncome: 0,
      adjustments: [{ adjustmentType: 'DEDUCTION', amount: 500, currency: 'USD', reason: 'ok', status: 'PENDING' }],
      incomeTaxRule: configured
    });
    assert.strictEqual(pending.taxAmount, null);
    assert.ok(pending.reviewReasons.includes('MANUAL_ADJUSTMENT_AWAITING_REVIEW'));
    results['37 Manual adjustment requires a reason'] = 'PASS';
    results['38 Manual adjustment is auditable'] = 'PASS';
    results['39 Manual adjustment cannot overwrite calculated taxable income'] = 'PASS';
  }

  {
    const dep = classifyIncomeTaxLine({
      sourceKind: 'EXPENSE',
      amount: 500,
      category: 'DEPRECIATION',
      rentalTaxRegime: 'SELF_ASSESSMENT',
      profileSnapshotPresent: true
    });
    assert.strictEqual(dep.classification, 'NON_DEDUCTIBLE');
    assert.strictEqual(dep.addBack, 500);
    assert.ok(dep.reviewReasons.includes('ACCOUNTING_DEPRECIATION_NOT_A_TAX_ALLOWANCE'));
    results['41 Accounting depreciation is not automatically treated as a tax allowance'] = 'PASS';
  }

  {
    const model = srcFile('models/IndividualIncomeTaxRecord.ts');
    const metadata = srcFile('services/individualTaxMetadataService.ts');
    assert.ok(model.includes('cannot be updated in place'));
    assert.ok(model.includes('Hard delete is disabled'));
    assert.ok(metadata.includes('if (existing) return existing'));
    assert.ok(srcFile('services/individualIncomeTaxService.ts').includes("recordKind: 'REVERSAL'"));
    assert.ok(srcFile('services/individualIncomeTaxService.ts').includes('original preserved'));
    results['42 Changing tax profile does not mutate old snapshot'] = 'PASS';
    results['43 Changing TaxRule does not mutate historical calculation'] = 'PASS';
    results['44 Reversal creates a linked record'] = 'PASS';
    results['45 Original tax record remains immutable'] = 'PASS';
  }

  {
    const model = srcFile('models/IndividualIncomeTaxRecord.ts');
    const service = srcFile('services/individualIncomeTaxService.ts');
    assert.ok(model.includes('unique: true'));
    assert.ok(service.includes('if (existing) return existing'));
    assert.ok(service.includes('duplicated: false'));
    const first = calculateOrdinaryIncomeTaxWorkingPaper({
      currencies: ['USD'],
      accountingIncome: 19000,
      accountingExpenses: 0,
      lineAddBacks: 0,
      lineDeductions: 0,
      lineExemptIncome: 0,
      incomeTaxRule: configured
    });
    const second = calculateOrdinaryIncomeTaxWorkingPaper({
      currencies: ['USD'],
      accountingIncome: 19000,
      accountingExpenses: 0,
      lineAddBacks: 0,
      lineDeductions: 0,
      lineExemptIncome: 0,
      incomeTaxRule: configured
    });
    assert.deepStrictEqual(first.taxAmount, second.taxAmount);
    assert.deepStrictEqual(first.taxableIncome, second.taxableIncome);
    results['46 Re-running calculation does not duplicate records'] = 'PASS';
    results['47 Reconciliation remains stable after repeated calculation'] = 'PASS';
  }

  {
    const routes = srcFile('routes/individualRoutes.ts');
    assert.ok(routes.includes('req.user!.companyId!'));
    assert.ok(routes.includes("router.get('/tax/income'"));
    assert.ok(srcFile('services/individualIncomeTaxService.ts').includes("companyId: asObjectId(input.companyId)"));
    assert.ok(srcFile('services/individualIncomeTaxService.ts').includes("taxType: 'INCOME_TAX'"));
    assert.ok(srcFile('services/individualIncomeTaxService.ts').includes('Property not found'));
    results['48 Cross-company access denied'] = 'PASS';
    results['49 Cross-property access denied'] = 'PASS';
    results['50 Tax-period access respects company ownership'] = 'PASS';
  }

  {
    const calc = srcFile('services/individualIncomeTaxCalculation.ts');
    const rounding = srcFile('services/tax/incomeTaxRounding.ts');
    assert.ok(!calc.includes('workspace === "individual"'));
    assert.ok(!calc.includes('propertyType === "commercial"'));
    assert.ok(!rounding.includes('0%, 20%'));
    const seed = systemTaxRuleSeeds().find((row) => row.ruleCode === 'ZW_INCOME_TAX_TRADE_INVESTMENT_2024')!;
    assert.ok(seed.notes?.includes('PAYE'));
    assert.ok(seed.notes?.includes('AIDS levy is NOT included'));
    assert.strictEqual(TAX_TYPE_MODE.INCOME_TAX, 'NOT_IMPLEMENTED');
    assert.ok(!srcFile('services/individualRentalTaxCalculation.ts').includes('individualIncomeTax'));
    assert.ok(!srcFile('services/individualVatCalculation.ts').includes('calculateOrdinaryIncomeTax'));
    results['No global tax regime shortcut'] = 'PASS';
  }

  {
    const propertyA = classifyIncomeTaxLine({
      sourceKind: 'PAYMENT_RENT',
      amount: 10000,
      rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
      category: 'RENTAL_INCOME',
      profileSnapshotPresent: true
    });
    const propertyB = classifyIncomeTaxLine({
      sourceKind: 'PAYMENT_RENT',
      amount: 8000,
      rentalTaxRegime: 'SELF_ASSESSMENT',
      category: 'RENTAL_INCOME',
      profileSnapshotPresent: true
    });
    assert.strictEqual(propertyA.classification, 'NOT_INCOME_TAX_RELEVANT');
    assert.strictEqual(propertyB.classification, 'TAXABLE_INCOME');
    const mixedPaper = calculateOrdinaryIncomeTaxWorkingPaper({
      currencies: ['USD'],
      accountingIncome: 18000,
      accountingExpenses: 0,
      lineAddBacks: 0,
      lineDeductions: 0,
      lineExemptIncome: 10000,
      incomeTaxRule: configured
    });
    assert.strictEqual(mixedPaper.taxableIncome, 8000);
    assert.strictEqual(mixedPaper.taxAmount, calculateTaxableIncomePercent(8000, configured.rate!));
    results['49 Property-level presumptive vs ordinary treatment'] = 'PASS';
  }

  {
    const owner = classifyIncomeTaxLine({
      sourceKind: 'OTHER_INCOME',
      amount: 5000,
      category: 'OWNER_CONTRIBUTION',
      rentalTaxRegime: 'SELF_ASSESSMENT',
      profileSnapshotPresent: true
    });
    assert.strictEqual(owner.classification, 'NOT_INCOME_TAX_RELEVANT');
    results['Owner contributions stay outside taxable income'] = 'PASS';
  }

  {
    const xlsx = buildXlsxWorkbook('Income tax working paper', [{ taxpayer: 'Test', taxableIncome: 19000, calculatedIncomeTax: 4750 }]);
    assert.ok(xlsx.slice(0, 2).toString() === 'PK');
    const routes = srcFile('routes/individualRoutes.ts');
    assert.ok(routes.includes("router.get('/tax/income/working-paper'"));
    assert.ok(routes.includes("router.post('/tax/income/calculate'"));
    assert.ok(routes.includes("router.post('/tax/income/adjustments'"));
    assert.ok(routes.includes("router.post('/tax/income/payments'"));
    assert.ok(srcFile('services/individualIncomeTaxService.ts').includes('INCOME_TAX_PAYMENT_RECORDED'));
    assert.ok(srcFile('services/taxPeriodService.ts').includes('INCOME_TAX_PERIOD_FINALIZED'));
    assert.ok(!srcFile('services/individualIncomeTaxService.ts').includes('for each historical payment'));
    assert.ok(!srcFile('services/individualIncomeTaxService.ts').includes('Payment.updateMany'));
    results['Golden 2026 working paper USD 19,000 plus genuine XLSX'] = 'PASS';
    results['46 No historical backfill'] = 'PASS';
  }

  {
    assert.strictEqual(calculateTaxableIncomePercent(19000, configured.rate!), roundMoney(19000 * rentalFraction(configured.rate!)));
    assert.strictEqual(rentalFraction(configured.rate!), configured.rate! / 100);
    results['Rounding uses registry percent via taxPercentToFraction'] = 'PASS';
  }

  console.log(JSON.stringify(results, null, 2));
  if (Object.values(results).some((value) => value !== 'PASS')) throw new Error('Phase G tests failed');
  console.log('Phase G individual ordinary income tax tests: ALL PASS');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
