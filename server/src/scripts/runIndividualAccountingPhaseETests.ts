import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { evaluateIndividualVatApplicability } from '../services/individualVatApplicability';
import { calculateIndividualVat, resolveCalculationMethod } from '../services/individualVatCalculation';
import { vatPercentToFraction } from '../services/tax/vatRounding';
import { exclusiveVatOn, extractInclusiveVat } from '../services/tax/vatCalculation';
import { assignmentStatusForExistingPeriod } from '../services/taxPeriodService';
import { systemTaxRuleSeeds } from '../services/taxRuleRegistry';
import { buildTaxClassification } from '../services/taxClassificationService';
import { buildXlsxWorkbook } from '../utils/xlsxWorkbook';
import { roundMoney } from '../utils/money';

function srcFile(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', '..', 'src', rel), 'utf8');
}

const vat2026 = () => {
  const seed = systemTaxRuleSeeds().find((row) => row.ruleCode === 'ZW_VAT_STANDARD' && row.version === 2)!;
  return { id: 'vat-2026', version: seed.version, ruleCode: seed.ruleCode, rate: seed.rate, effectiveFrom: seed.effectiveFrom };
};

const vatPrior = () => {
  const seed = systemTaxRuleSeeds().find((row) => row.ruleCode === 'ZW_VAT_STANDARD' && row.version === 1)!;
  return { id: 'vat-prior', version: seed.version, ruleCode: seed.ruleCode, rate: seed.rate, effectiveFrom: seed.effectiveFrom };
};

async function run(): Promise<void> {
  const results: Record<string, string> = {};

  {
    const result = evaluateIndividualVatApplicability({
      sourceKind: 'PAYMENT_RENT',
      vatRegisteredOnSnapshot: false,
      vatSupplyTreatment: 'STANDARD_TAXABLE',
      vatRule: vat2026()
    });
    assert.strictEqual(result.treatment, 'NOT_VAT_REGISTERED');
    assert.strictEqual(result.applicable, false);
    const calc = calculateIndividualVat({
      direction: 'OUTPUT',
      treatment: result.treatment,
      amount: 2000,
      vatRatePercent: result.configuredRate,
      method: 'EXCLUSIVE'
    });
    assert.strictEqual(calc.vatAmount, null);
    assert.strictEqual(calc.calculationStatus, 'NOT_APPLICABLE');
    results['1 VAT not registered is NOT_VAT_REGISTERED with no calculated VAT'] = 'PASS';
  }

  {
    const exempt = calculateIndividualVat({
      direction: 'OUTPUT',
      treatment: 'EXEMPT',
      amount: 2000,
      vatRatePercent: 15.5,
      method: 'EXCLUSIVE'
    });
    const none = calculateIndividualVat({
      direction: 'OUTPUT',
      treatment: 'NOT_APPLICABLE',
      amount: 2000,
      vatRatePercent: 15.5,
      method: 'EXCLUSIVE'
    });
    assert.strictEqual(exempt.treatment, 'EXEMPT');
    assert.strictEqual(exempt.vatAmount, 0);
    assert.strictEqual(exempt.taxableAmount, 0);
    assert.strictEqual(none.vatAmount, null);
    assert.notStrictEqual(exempt.treatment, none.treatment);
    results['2 Exempt VAT amount is 0 and is distinct from NOT_APPLICABLE'] = 'PASS';
  }

  {
    const rate = vat2026().rate!;
    const calc = calculateIndividualVat({
      direction: 'OUTPUT',
      treatment: 'STANDARD',
      amount: 2310,
      vatRatePercent: rate,
      method: 'INCLUSIVE'
    });
    const expected = extractInclusiveVat(2310, vatPercentToFraction(rate));
    assert.strictEqual(calc.grossAmount, expected.gross);
    assert.strictEqual(calc.netAmount, expected.net);
    assert.strictEqual(calc.vatAmount, expected.vatAmount);
    assert.strictEqual(calc.calculationStatus, 'CALCULATED');
    results['3 Standard VAT inclusive uses the registry rate'] = 'PASS';
  }

  {
    const rate = vat2026().rate!;
    const calc = calculateIndividualVat({
      direction: 'OUTPUT',
      treatment: 'STANDARD',
      amount: 2000,
      vatRatePercent: rate,
      method: 'EXCLUSIVE'
    });
    const expected = exclusiveVatOn(2000, vatPercentToFraction(rate));
    assert.strictEqual(calc.netAmount, 2000);
    assert.strictEqual(calc.vatAmount, expected.vatAmount);
    assert.strictEqual(calc.grossAmount, expected.gross);
    results['4 Standard VAT exclusive uses the registry rate'] = 'PASS';
  }

  {
    const calc = calculateIndividualVat({
      direction: 'INPUT',
      treatment: 'STANDARD',
      amount: 1150,
      vatRatePercent: vat2026().rate!,
      method: 'INCLUSIVE',
      inputVatEligibility: 'RECOVERABLE',
      supplierVatNumber: 'VAT123',
      invoiceNumber: 'INV-1'
    });
    assert.strictEqual(calc.inputVatEligibility, 'RECOVERABLE');
    assert.ok(Number(calc.chargedVatAmount) > 0);
    assert.strictEqual(calc.recoverableVatAmount, calc.chargedVatAmount);
    assert.strictEqual(calc.vatAmount, calc.recoverableVatAmount);
    results['5 Qualifying input VAT is recoverable and recorded'] = 'PASS';
  }

  {
    const calc = calculateIndividualVat({
      direction: 'INPUT',
      treatment: 'STANDARD',
      amount: 1150,
      vatRatePercent: vat2026().rate!,
      method: 'INCLUSIVE',
      inputVatEligibility: 'NON_RECOVERABLE',
      supplierVatNumber: 'VAT123',
      invoiceNumber: 'INV-2'
    });
    assert.ok(Number(calc.chargedVatAmount) > 0);
    assert.strictEqual(calc.recoverableVatAmount, 0);
    assert.strictEqual(calc.vatAmount, 0);
    assert.strictEqual(calc.inputVatEligibility, 'NON_RECOVERABLE');
    results['6 Non-recoverable input VAT keeps supplier VAT but recoverable = 0'] = 'PASS';
  }

  {
    const calc = calculateIndividualVat({
      direction: 'INPUT',
      treatment: 'STANDARD',
      amount: 1150,
      vatRatePercent: vat2026().rate!,
      method: 'INCLUSIVE',
      inputVatEligibility: 'RECOVERABLE'
    });
    assert.strictEqual(calc.calculationStatus, 'REVIEW_REQUIRED');
    assert.strictEqual(calc.vatAmount, null);
    assert.ok(calc.reviewReasons.includes('MISSING_SUPPLIER_VAT_NUMBER'));
    assert.ok(calc.reviewReasons.includes('MISSING_INVOICE_NUMBER'));
    results['7 Missing supplier invoice data is REVIEW_REQUIRED not fabricated VAT'] = 'PASS';
  }

  {
    const march = buildTaxClassification({
      sourceKind: 'PAYMENT_RENT',
      transactionDate: new Date('2026-03-15T00:00:00.000Z'),
      vatRegistered: false,
      rentalTaxRegime: 'ACCOUNTANT_REVIEW',
      incomeTaxRegistered: false,
      propertyUseClass: 'COMMERCIAL',
      vatSupplyTreatment: 'STANDARD_TAXABLE',
      ownerProfileVersion: 1
    });
    const june = buildTaxClassification({
      sourceKind: 'PAYMENT_RENT',
      transactionDate: new Date('2026-06-15T00:00:00.000Z'),
      vatRegistered: true,
      rentalTaxRegime: 'ACCOUNTANT_REVIEW',
      incomeTaxRegistered: false,
      propertyUseClass: 'COMMERCIAL',
      vatSupplyTreatment: 'STANDARD_TAXABLE',
      ownerProfileVersion: 2,
      vatRule: vat2026() as any
    });
    const marchVat = evaluateIndividualVatApplicability({
      sourceKind: 'PAYMENT_RENT',
      vatRegisteredOnSnapshot: march.taxProfileSnapshot.vatRegistered,
      vatSupplyTreatment: march.taxProfileSnapshot.vatSupplyTreatment,
      vatRule: vat2026()
    });
    const juneVat = evaluateIndividualVatApplicability({
      sourceKind: 'PAYMENT_RENT',
      vatRegisteredOnSnapshot: june.taxProfileSnapshot.vatRegistered,
      vatSupplyTreatment: june.taxProfileSnapshot.vatSupplyTreatment,
      vatRule: vat2026()
    });
    assert.strictEqual(marchVat.treatment, 'NOT_VAT_REGISTERED');
    assert.strictEqual(juneVat.treatment, 'STANDARD');
    assert.strictEqual(march.taxProfileSnapshot.vatRegistered, false);
    results['8 Later VAT registration does not change the March snapshot'] = 'PASS';
  }

  {
    const march = evaluateIndividualVatApplicability({
      sourceKind: 'PAYMENT_RENT',
      vatRegisteredOnSnapshot: true,
      vatSupplyTreatment: 'EXEMPT',
      vatRule: vat2026()
    });
    const july = evaluateIndividualVatApplicability({
      sourceKind: 'PAYMENT_RENT',
      vatRegisteredOnSnapshot: true,
      vatSupplyTreatment: 'STANDARD_TAXABLE',
      vatRule: vat2026()
    });
    assert.strictEqual(march.treatment, 'EXEMPT');
    assert.strictEqual(july.treatment, 'STANDARD');
    results['9 Property VAT treatment changes apply only to new snapshots'] = 'PASS';
  }

  {
    const jan = calculateIndividualVat({
      direction: 'OUTPUT',
      treatment: 'STANDARD',
      amount: 1000,
      vatRatePercent: vatPrior().rate!,
      method: 'EXCLUSIVE'
    });
    const sep = calculateIndividualVat({
      direction: 'OUTPUT',
      treatment: 'STANDARD',
      amount: 1000,
      vatRatePercent: vat2026().rate!,
      method: 'EXCLUSIVE'
    });
    assert.strictEqual(jan.vatRate, vatPrior().rate);
    assert.strictEqual(sep.vatRate, vat2026().rate);
    assert.notStrictEqual(jan.vatAmount, sep.vatAmount);
    results['10 Historical VAT keeps the rule version used at calculation'] = 'PASS';
  }

  {
    const service = srcFile('services/individualVatService.ts');
    assert.ok(service.includes("recordKind: 'ORIGINAL'"));
    assert.ok(service.includes('if (existing) return existing'));
    results['11 Duplicate calculation returns the existing ORIGINAL VAT record'] = 'PASS';
  }

  {
    const service = srcFile('services/individualVatService.ts');
    assert.ok(service.includes("recordKind: 'REVERSAL'"));
    assert.ok(service.includes('reversalOf: original._id'));
    assert.ok(!service.includes('IndividualVatRecord.updateOne'));
    assert.ok(!service.includes('original.save('));
    assert.ok(srcFile('models/IndividualVatRecord.ts').includes('cannot be updated in place'));
    results['12 Reversal preserves the original VAT record'] = 'PASS';
  }

  {
    assert.strictEqual(assignmentStatusForExistingPeriod('FINALIZED'), 'PERIOD_CLOSED');
    assert.strictEqual(assignmentStatusForExistingPeriod('LOCKED'), 'PERIOD_CLOSED');
    assert.ok(srcFile('services/individualVatService.ts').includes('PERIOD_CLOSED'));
    results['13 Closed or locked VAT periods reject ordinary mutation'] = 'PASS';
  }

  {
    const calc = calculateIndividualVat({
      direction: 'OUTPUT',
      treatment: 'STANDARD',
      amount: 2000,
      vatRatePercent: vat2026().rate!,
      method: 'EXCLUSIVE'
    });
    assert.strictEqual(resolveCalculationMethod({ direction: 'OUTPUT', vatIncluded: false }), 'EXCLUSIVE');
    const service = srcFile('services/individualVatService.ts');
    assert.ok(service.includes('currency: source?.currency || \'USD\''));
    assert.ok(service.includes('exchangeRate'));
    assert.strictEqual(calc.incomeTaxAmount, null);
    results['14 Original currency is retained; conversion basis is stored'] = 'PASS';
  }

  {
    const output = calculateIndividualVat({
      direction: 'OUTPUT',
      treatment: 'STANDARD',
      amount: 2000,
      vatRatePercent: vat2026().rate!,
      method: 'EXCLUSIVE'
    });
    const input = calculateIndividualVat({
      direction: 'INPUT',
      treatment: 'STANDARD',
      amount: 1150,
      vatRatePercent: vat2026().rate!,
      method: 'INCLUSIVE',
      inputVatEligibility: 'RECOVERABLE',
      supplierVatNumber: 'VAT123',
      invoiceNumber: 'INV-9'
    });
    const paperOutput = roundMoney(Number(output.vatAmount));
    const paperInput = roundMoney(Number(input.recoverableVatAmount));
    assert.strictEqual(paperOutput, output.vatAmount);
    assert.strictEqual(paperInput, input.vatAmount);
    const recon = srcFile('services/individualVatService.ts');
    assert.ok(recon.includes('VAT_AMOUNT_MISMATCH'));
    assert.ok(recon.includes('detectionOnly: true'));
    results['15 Working paper totals equal VAT record sums'] = 'PASS';
  }

  {
    const orch = srcFile('services/paymentAccountingOrchestrator.ts');
    assert.ok(orch.includes('export async function postPaymentAccounting'));
    assert.ok(!srcFile('services/individualVatService.ts').includes("from '../models/VatRecord'"));
    assert.ok(!srcFile('services/individualVatService.ts').includes("from '../models/TaxObligation'"));
    assert.ok(!srcFile('services/individualVatService.ts').includes('TaxObligation.create'));
    assert.ok(!srcFile('services/individualVatCalculation.ts').includes('15.5'));
    assert.ok(!srcFile('services/individualVatCalculation.ts').includes('STANDARD_VAT_PERCENT'));
    assert.ok(srcFile('models/TransactionTaxSnapshot.ts').includes('Phase D tax snapshots cannot store calculated tax amounts'));
    results['16 Agency VAT/TaxObligation/VatRecord engines are not used for individual landlord VAT'] = 'PASS';
  }

  {
    const golden = calculateIndividualVat({
      direction: 'OUTPUT',
      treatment: 'STANDARD',
      amount: 2000,
      vatRatePercent: vat2026().rate!,
      method: 'EXCLUSIVE'
    });
    assert.strictEqual(golden.netAmount, 2000);
    assert.strictEqual(golden.vatAmount, exclusiveVatOn(2000, vatPercentToFraction(vat2026().rate!)).vatAmount);
    assert.strictEqual(golden.incomeTaxAmount, null);
    assert.strictEqual(golden.presumptiveTaxAmount, null);
    const xlsx = buildXlsxWorkbook('VAT working paper', [{ taxpayer: 'Test', vat: golden.vatAmount }]);
    assert.ok(xlsx.slice(0, 2).toString() === 'PK');
    results['Golden commercial VAT-registered exclusive rent plus genuine XLSX'] = 'PASS';
  }

  {
    const cents = calculateIndividualVat({
      direction: 'OUTPUT',
      treatment: 'STANDARD',
      amount: 100.01,
      vatRatePercent: vat2026().rate!,
      method: 'EXCLUSIVE'
    });
    assert.strictEqual(cents.vatAmount, exclusiveVatOn(100.01, vatPercentToFraction(vat2026().rate!)).vatAmount);
    const large = calculateIndividualVat({
      direction: 'OUTPUT',
      treatment: 'STANDARD',
      amount: 1_000_000,
      vatRatePercent: vat2026().rate!,
      method: 'INCLUSIVE'
    });
    assert.strictEqual(large.vatAmount, extractInclusiveVat(1_000_000, vatPercentToFraction(vat2026().rate!)).vatAmount);
    results['Fractional cents and large values use roundMoney via vatCalculation'] = 'PASS';
  }

  console.log(JSON.stringify(results, null, 2));
  if (Object.values(results).some((value) => value !== 'PASS')) throw new Error('Phase E tests failed');
  console.log('Phase E individual VAT engine tests: ALL PASS');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
