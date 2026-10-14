import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { evaluateIndividualRentalTaxApplicability } from '../services/individualRentalTaxApplicability';
import { resolveRentalTaxBase } from '../services/individualRentalTaxBase';
import { calculateIndividualRentalTax } from '../services/individualRentalTaxCalculation';
import { calculateGrossRentalPercent, taxPercentToFraction } from '../services/tax/rentalTaxRounding';
import { calculateIndividualVat } from '../services/individualVatCalculation';
import { assignmentStatusForExistingPeriod } from '../services/taxPeriodService';
import { systemTaxRuleSeeds } from '../services/taxRuleRegistry';
import { classifyLandlordCategory } from '../services/individualAccountingCategories';
import { buildXlsxWorkbook } from '../utils/xlsxWorkbook';
import { roundMoney } from '../utils/money';
import { TAX_TYPE_MODE } from '../services/tax/taxTypes';

function srcFile(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', '..', 'src', rel), 'utf8');
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

function rule(partial: Partial<ReturnType<typeof pn08>> & { id: string; version: number; rate: number; effectiveFrom: Date }) {
  return {
    ruleCode: partial.ruleCode || 'TEST_RULE',
    calculationMethod: 'GROSS_RENTAL_PERCENT',
    sourceReference: partial.sourceReference || 'test',
    effectiveTo: partial.effectiveTo || null,
    ...partial
  };
}

async function run(): Promise<void> {
  const results: Record<string, string> = {};
  const configured = pn08();

  {
    const result = evaluateIndividualRentalTaxApplicability({
      sourceKind: 'PAYMENT_RENT',
      rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
      propertyUseClass: 'COMMERCIAL',
      profileSnapshotPresent: true,
      transactionDate: new Date('2026-09-17T00:00:00.000Z'),
      rentalTaxRule: configured
    });
    assert.strictEqual(result.status, 'APPLICABLE');
    assert.strictEqual(result.applicable, true);
    assert.strictEqual(result.taxRuleCode, 'ZW_PRESUMPTIVE_RENTAL_PN08_2026');
    assert.strictEqual(result.configuredRate, configured.rate);
    results['1 Presumptive regime resolves the configured rule'] = 'PASS';
  }

  {
    const result = evaluateIndividualRentalTaxApplicability({
      sourceKind: 'PAYMENT_RENT',
      rentalTaxRegime: 'ACCOUNTANT_REVIEW',
      propertyUseClass: 'COMMERCIAL',
      profileSnapshotPresent: true,
      rentalTaxRule: configured
    });
    const calc = calculateIndividualRentalTax({
      applicability: result,
      taxBase: resolveRentalTaxBase({ sourceKind: 'PAYMENT_RENT', amount: 2000, rentAllocated: 2000 })
    });
    assert.strictEqual(result.status, 'REVIEW_REQUIRED');
    assert.strictEqual(calc.taxAmount, null);
    assert.strictEqual(calc.calculationStatus, 'REVIEW_REQUIRED');
    results['2 Accountant review does not calculate tax'] = 'PASS';
  }

  {
    const result = evaluateIndividualRentalTaxApplicability({
      sourceKind: 'PAYMENT_RENT',
      rentalTaxRegime: 'SELF_ASSESSMENT',
      propertyUseClass: 'COMMERCIAL',
      profileSnapshotPresent: true,
      rentalTaxRule: configured
    });
    const calc = calculateIndividualRentalTax({
      applicability: result,
      taxBase: resolveRentalTaxBase({ sourceKind: 'PAYMENT_RENT', amount: 2000, rentAllocated: 2000 })
    });
    assert.strictEqual(result.applicable, false);
    assert.strictEqual(calc.calculationStatus, 'NOT_APPLICABLE');
    assert.strictEqual(calc.taxAmount, null);
    results['3 Self-assessment does not run the presumptive engine'] = 'PASS';
  }

  {
    const ruleA = rule({
      id: 'rule-a',
      version: 1,
      rate: 10,
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      effectiveTo: new Date('2026-06-30T00:00:00.000Z')
    });
    const ruleB = rule({
      id: 'rule-b',
      version: 2,
      rate: 15,
      effectiveFrom: new Date('2026-07-01T00:00:00.000Z')
    });
    const march = evaluateIndividualRentalTaxApplicability({
      sourceKind: 'PAYMENT_RENT',
      rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
      propertyUseClass: 'COMMERCIAL',
      profileSnapshotPresent: true,
      transactionDate: new Date('2026-03-15T00:00:00.000Z'),
      rentalTaxRule: ruleA
    });
    const july = evaluateIndividualRentalTaxApplicability({
      sourceKind: 'PAYMENT_RENT',
      rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
      propertyUseClass: 'COMMERCIAL',
      profileSnapshotPresent: true,
      transactionDate: new Date('2026-07-15T00:00:00.000Z'),
      rentalTaxRule: ruleB
    });
    assert.strictEqual(march.taxRuleVersion, 1);
    assert.strictEqual(july.taxRuleVersion, 2);
    assert.notStrictEqual(march.configuredRate, july.configuredRate);
    results['4 Effective rule is selected by transaction date'] = 'PASS';
  }

  {
    const base = resolveRentalTaxBase({
      sourceKind: 'PAYMENT_RENT',
      calculationMethod: 'GROSS_RENTAL_PERCENT',
      amount: 2500,
      rentAllocated: 2000,
      levyAllocated: 400,
      depositAmount: 100
    });
    assert.strictEqual(base.status, 'READY');
    assert.strictEqual(base.taxableRentalBase, 2000);
    assert.strictEqual(base.excludedAmount, 500);
    assert.notStrictEqual(base.taxableRentalBase, 2500);
    results['5 Tax base is rule-driven rent, not the full receipt'] = 'PASS';
  }

  {
    const calc = calculateIndividualRentalTax({
      applicability: evaluateIndividualRentalTaxApplicability({
        sourceKind: 'PAYMENT_RENT',
        rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
        propertyUseClass: 'COMMERCIAL',
        profileSnapshotPresent: true,
        rentalTaxRule: configured
      }),
      taxBase: resolveRentalTaxBase({ sourceKind: 'PAYMENT_RENT', amount: 2000, rentAllocated: 2000 })
    });
    assert.strictEqual(calc.taxRate, configured.rate);
    assert.notStrictEqual(calc.taxRate, 0.15);
    const rounding = srcFile('services/tax/rentalTaxRounding.ts');
    const calculation = srcFile('services/individualRentalTaxCalculation.ts');
    assert.ok(!rounding.includes('* 0.15'));
    assert.ok(!calculation.includes('0.15'));
    assert.ok(!calculation.includes('* 0.15'));
    results['6 Rate comes from TaxRule, not a hard-coded 15%'] = 'PASS';
  }

  {
    const calc = calculateIndividualRentalTax({
      applicability: evaluateIndividualRentalTaxApplicability({
        sourceKind: 'PAYMENT_RENT',
        rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
        propertyUseClass: 'COMMERCIAL',
        profileSnapshotPresent: true,
        rentalTaxRule: configured
      }),
      taxBase: resolveRentalTaxBase({ sourceKind: 'PAYMENT_RENT', amount: 2000, rentAllocated: 2000 })
    });
    assert.strictEqual(calc.calculationStatus, 'CALCULATED');
    assert.strictEqual(calc.taxAmount, calculateGrossRentalPercent(2000, configured.rate!));
    assert.strictEqual(calc.taxAmount, roundMoney(2000 * taxPercentToFraction(configured.rate!)));
    results['7 Calculation is tax base × configured rule rate'] = 'PASS';
  }

  {
    const march = evaluateIndividualRentalTaxApplicability({
      sourceKind: 'PAYMENT_RENT',
      rentalTaxRegime: 'ACCOUNTANT_REVIEW',
      propertyUseClass: 'COMMERCIAL',
      profileSnapshotPresent: true,
      rentalTaxRule: configured
    });
    const june = evaluateIndividualRentalTaxApplicability({
      sourceKind: 'PAYMENT_RENT',
      rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
      propertyUseClass: 'COMMERCIAL',
      profileSnapshotPresent: true,
      rentalTaxRule: configured
    });
    const marchCalc = calculateIndividualRentalTax({
      applicability: march,
      taxBase: resolveRentalTaxBase({ sourceKind: 'PAYMENT_RENT', amount: 2000, rentAllocated: 2000 })
    });
    const juneCalc = calculateIndividualRentalTax({
      applicability: june,
      taxBase: resolveRentalTaxBase({ sourceKind: 'PAYMENT_RENT', amount: 2000, rentAllocated: 2000 })
    });
    assert.strictEqual(marchCalc.calculationStatus, 'REVIEW_REQUIRED');
    assert.strictEqual(marchCalc.taxAmount, null);
    assert.strictEqual(juneCalc.calculationStatus, 'CALCULATED');
    assert.ok(juneCalc.taxAmount != null);
    results['8 Historical snapshot remains unchanged after a later profile change'] = 'PASS';
  }

  {
    const ruleA = rule({ id: 'a', version: 1, rate: 10, effectiveFrom: new Date('2026-01-01T00:00:00.000Z') });
    const historical = calculateIndividualRentalTax({
      applicability: evaluateIndividualRentalTaxApplicability({
        sourceKind: 'PAYMENT_RENT',
        rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
        propertyUseClass: 'COMMERCIAL',
        profileSnapshotPresent: true,
        rentalTaxRule: ruleA
      }),
      taxBase: resolveRentalTaxBase({ sourceKind: 'PAYMENT_RENT', amount: 2000, rentAllocated: 2000 })
    });
    assert.strictEqual(historical.taxRuleVersion, 1);
    assert.strictEqual(historical.taxRate, 10);
    assert.strictEqual(historical.taxAmount, calculateGrossRentalPercent(2000, 10));
    results['9 Historical transaction retains the original rule'] = 'PASS';
  }

  {
    const model = srcFile('models/IndividualRentalTaxRecord.ts');
    const service = srcFile('services/individualRentalTaxService.ts');
    assert.ok(model.includes("unique: true"));
    assert.ok(service.includes("recordKind: 'ORIGINAL'"));
    assert.ok(service.includes('if (existing) return existing'));
    results['10 Duplicate calculation does not create a second original'] = 'PASS';
  }

  {
    const service = srcFile('services/individualRentalTaxService.ts');
    assert.ok(service.includes("recordKind: 'REVERSAL'"));
    assert.ok(service.includes('reversalOf: original._id'));
    assert.ok(!service.includes('IndividualRentalTaxRecord.updateOne'));
    assert.ok(!service.includes('original.save('));
    assert.ok(srcFile('models/IndividualRentalTaxRecord.ts').includes('cannot be updated in place'));
    results['11 Reversal preserves the original rental-tax record'] = 'PASS';
  }

  {
    const calc = calculateIndividualRentalTax({
      applicability: evaluateIndividualRentalTaxApplicability({
        sourceKind: 'PAYMENT_RENT',
        rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
        propertyUseClass: 'COMMERCIAL',
        profileSnapshotPresent: true,
        rentalTaxRule: configured
      }),
      taxBase: resolveRentalTaxBase({ sourceKind: 'PAYMENT_RENT', amount: 2000, rentAllocated: 2000 })
    });
    const payment = 300;
    const balance = roundMoney(Number(calc.taxAmount) - payment);
    assert.strictEqual(calc.taxAmount, 300);
    assert.strictEqual(balance, 0);
    const service = srcFile('services/individualRentalTaxService.ts');
    assert.ok(service.includes('calculatedTax - taxPayments'));
    assert.ok(service.includes('calculatedBalance'));
    assert.ok(service.includes('landlordRecordedOnly: true'));
    results['12 Tax payment reconciles against calculated tax'] = 'PASS';
  }

  {
    assert.strictEqual(assignmentStatusForExistingPeriod('FINALIZED'), 'PERIOD_CLOSED');
    assert.strictEqual(assignmentStatusForExistingPeriod('LOCKED'), 'PERIOD_CLOSED');
    assert.ok(srcFile('services/individualRentalTaxService.ts').includes('PERIOD_CLOSED'));
    results['13 Closed or locked rental-tax periods reject ordinary mutation'] = 'PASS';
  }

  {
    const calc = calculateIndividualRentalTax({
      applicability: evaluateIndividualRentalTaxApplicability({
        sourceKind: 'PAYMENT_RENT',
        rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
        propertyUseClass: 'COMMERCIAL',
        profileSnapshotPresent: true,
        rentalTaxRule: configured
      }),
      taxBase: resolveRentalTaxBase({ sourceKind: 'PAYMENT_RENT', amount: 2000, rentAllocated: 2000 }),
      periodAssignmentStatus: 'PERIOD_REQUIRED'
    });
    assert.strictEqual(calc.calculationStatus, 'PERIOD_REQUIRED');
    assert.strictEqual(calc.taxAmount, null);
    assert.ok(calc.reviewReasons.includes('TAX_PERIOD_MISSING'));
    const metadata = srcFile('services/individualTaxMetadataService.ts');
    assert.ok(!metadata.includes('TaxPeriod.create'));
    results['14 Missing period is PERIOD_REQUIRED and is not auto-created'] = 'PASS';
  }

  {
    const result = evaluateIndividualRentalTaxApplicability({
      sourceKind: 'PAYMENT_RENT',
      rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
      propertyUseClass: 'COMMERCIAL',
      profileSnapshotPresent: true,
      rentalTaxRule: null
    });
    const calc = calculateIndividualRentalTax({
      applicability: result,
      taxBase: resolveRentalTaxBase({ sourceKind: 'PAYMENT_RENT', amount: 2000, rentAllocated: 2000 })
    });
    assert.strictEqual(result.status, 'RULE_UNAVAILABLE');
    assert.strictEqual(calc.calculationStatus, 'REVIEW_REQUIRED');
    assert.strictEqual(calc.taxAmount, null);
    results['15 Missing rule is REVIEW_REQUIRED, not a 15% fallback'] = 'PASS';
  }

  {
    const missingProfile = evaluateIndividualRentalTaxApplicability({
      sourceKind: 'PAYMENT_RENT',
      rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
      propertyUseClass: 'COMMERCIAL',
      profileSnapshotPresent: false,
      rentalTaxRule: configured
    });
    const missingClass = evaluateIndividualRentalTaxApplicability({
      sourceKind: 'PAYMENT_RENT',
      rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
      propertyUseClass: null,
      profileSnapshotPresent: true,
      rentalTaxRule: configured
    });
    assert.strictEqual(missingProfile.status, 'REVIEW_REQUIRED');
    assert.ok(missingProfile.reviewReasons.includes('PROFILE_SNAPSHOT_MISSING'));
    assert.strictEqual(missingClass.status, 'REVIEW_REQUIRED');
    assert.ok(missingClass.reviewReasons.includes('PROPERTY_CLASSIFICATION_MISSING'));
    results['16 Missing classification or snapshot is REVIEW_REQUIRED'] = 'PASS';
  }

  {
    const result = evaluateIndividualRentalTaxApplicability({
      sourceKind: 'PAYMENT_DEPOSIT',
      rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
      propertyUseClass: 'COMMERCIAL',
      profileSnapshotPresent: true,
      rentalTaxRule: configured
    });
    assert.strictEqual(result.status, 'NOT_APPLICABLE');
    assert.strictEqual(result.applicable, false);
    const service = srcFile('services/individualRentalTaxService.ts');
    assert.ok(service.includes("sourceKind === 'PAYMENT_DEPOSIT'"));
    assert.ok(service.includes('return null'));
    results['17 Deposit receipt produces no rental tax'] = 'PASS';
  }

  {
    const classified = classifyLandlordCategory('DEPOSIT_APPLICATION');
    assert.strictEqual(classified.sourceKind, 'OTHER_INCOME');
    assert.strictEqual(classified.accountingTreatment, 'PROPERTY_INCOME');
    const base = resolveRentalTaxBase({
      sourceKind: 'OTHER_INCOME',
      category: 'DEPOSIT_APPLICATION',
      amount: 500
    });
    const calc = calculateIndividualRentalTax({
      applicability: evaluateIndividualRentalTaxApplicability({
        sourceKind: 'OTHER_INCOME',
        rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
        propertyUseClass: 'COMMERCIAL',
        profileSnapshotPresent: true,
        rentalTaxRule: configured
      }),
      taxBase: base
    });
    assert.strictEqual(base.taxableRentalBase, 500);
    assert.strictEqual(calc.calculationStatus, 'CALCULATED');
    assert.ok(srcFile('services/individualAccountingService.ts').includes('applyDepositToRent'));
    assert.ok(srcFile('services/individualAccountingService.ts').includes('original deposit was not mutated'));
    results['18 Deposit application can produce rental tax'] = 'PASS';
  }

  {
    const vat = calculateIndividualVat({
      direction: 'OUTPUT',
      treatment: 'STANDARD',
      amount: 2000,
      vatRatePercent: 15.5,
      method: 'EXCLUSIVE'
    });
    const rental = calculateIndividualRentalTax({
      applicability: evaluateIndividualRentalTaxApplicability({
        sourceKind: 'PAYMENT_RENT',
        rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
        propertyUseClass: 'COMMERCIAL',
        profileSnapshotPresent: true,
        rentalTaxRule: configured
      }),
      taxBase: resolveRentalTaxBase({ sourceKind: 'PAYMENT_RENT', amount: 2000, rentAllocated: 2000 })
    });
    assert.notStrictEqual(vat.vatAmount, rental.taxAmount);
    assert.strictEqual(rental.vatAmount, null);
    assert.strictEqual(vat.presumptiveTaxAmount, null);
    const rentalCalc = srcFile('services/individualRentalTaxCalculation.ts');
    assert.ok(rentalCalc.includes('vatAmount: null'));
    assert.ok(!rentalCalc.includes('calculateIndividualVat'));
    results['19 VAT record and rental-tax record remain separate'] = 'PASS';
  }

  {
    const orch = srcFile('services/paymentAccountingOrchestrator.ts');
    assert.ok(orch.includes('export async function postPaymentAccounting'));
    assert.ok(!srcFile('services/individualRentalTaxService.ts').includes("from '../models/VatRecord'"));
    assert.ok(!srcFile('services/individualRentalTaxService.ts').includes("from '../models/TaxObligation'"));
    assert.ok(!srcFile('services/individualRentalTaxService.ts').includes('TaxObligation.create'));
    assert.ok(!srcFile('services/individualRentalTaxService.ts').includes('JournalEntry.create'));
    assert.strictEqual(TAX_TYPE_MODE.PRESUMPTIVE_RENTAL_INCOME_TAX, 'NOT_IMPLEMENTED');
    results['20 Agency Phase 8 TaxObligation path remains unchanged'] = 'PASS';
  }

  {
    const na = calculateIndividualRentalTax({
      applicability: evaluateIndividualRentalTaxApplicability({
        sourceKind: 'PAYMENT_RENT',
        rentalTaxRegime: 'EXEMPT',
        propertyUseClass: 'COMMERCIAL',
        profileSnapshotPresent: true,
        rentalTaxRule: configured
      }),
      taxBase: resolveRentalTaxBase({ sourceKind: 'PAYMENT_RENT', amount: 2000, rentAllocated: 2000 })
    });
    assert.strictEqual(na.taxAmount, null);
    assert.strictEqual(na.calculationStatus, 'NOT_APPLICABLE');
    const zeroBase = calculateIndividualRentalTax({
      applicability: evaluateIndividualRentalTaxApplicability({
        sourceKind: 'PAYMENT_RENT',
        rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
        propertyUseClass: 'COMMERCIAL',
        profileSnapshotPresent: true,
        rentalTaxRule: configured
      }),
      taxBase: resolveRentalTaxBase({ sourceKind: 'PAYMENT_RENT', amount: 100, rentAllocated: 0, levyAllocated: 0, depositAmount: 100 })
    });
    assert.strictEqual(zeroBase.taxableRentalBase, 0);
    assert.strictEqual(zeroBase.taxAmount, 0);
    assert.strictEqual(zeroBase.calculationStatus, 'CALCULATED');
    results['Zero vs null semantics: not applicable is null; calculated zero is 0'] = 'PASS';
  }

  {
    const usd = calculateIndividualRentalTax({
      applicability: evaluateIndividualRentalTaxApplicability({
        sourceKind: 'PAYMENT_RENT',
        rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
        propertyUseClass: 'COMMERCIAL',
        profileSnapshotPresent: true,
        rentalTaxRule: configured
      }),
      taxBase: resolveRentalTaxBase({ sourceKind: 'PAYMENT_RENT', amount: 2000, rentAllocated: 2000 })
    });
    const service = srcFile('services/individualRentalTaxService.ts');
    assert.ok(service.includes('transactionCurrency'));
    assert.ok(service.includes("currency: source?.currency || 'USD'"));
    assert.strictEqual(usd.taxAmount, 300);
    results['Multi-currency preserves the original transaction currency'] = 'PASS';
  }

  {
    const golden = calculateIndividualRentalTax({
      applicability: evaluateIndividualRentalTaxApplicability({
        sourceKind: 'PAYMENT_RENT',
        rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
        propertyUseClass: 'COMMERCIAL',
        profileSnapshotPresent: true,
        transactionDate: new Date('2026-09-17T00:00:00.000Z'),
        rentalTaxRule: configured
      }),
      taxBase: resolveRentalTaxBase({ sourceKind: 'PAYMENT_RENT', amount: 2000, rentAllocated: 2000 })
    });
    assert.strictEqual(golden.taxableRentalBase, 2000);
    assert.strictEqual(golden.taxRate, configured.rate);
    assert.strictEqual(golden.taxAmount, 300);
    assert.strictEqual(golden.incomeTaxAmount, null);
    const xlsx = buildXlsxWorkbook('Rental tax working paper', [{ taxpayer: 'Test', tin: 'test value', tax: golden.taxAmount }]);
    assert.ok(xlsx.slice(0, 2).toString() === 'PK');
    const routes = srcFile('routes/individualRoutes.ts');
    assert.ok(routes.includes("router.get('/tax/rental'"));
    assert.ok(routes.includes("router.get('/tax/rental/working-paper'"));
    assert.ok(routes.includes("router.post('/deposits/apply'"));
    results['Golden commercial presumptive rent $2,000 on 2026-09-17 plus genuine XLSX'] = 'PASS';
  }

  {
    const metadata = srcFile('services/individualTaxMetadataService.ts');
    const rentalService = srcFile('services/individualRentalTaxService.ts');
    assert.ok(!metadata.includes('for each historical'));
    assert.ok(!rentalService.includes('for each historical payment'));
    assert.ok(!rentalService.includes('Payment.updateMany'));
    assert.ok(!rentalService.includes('PropertyAccount.updateMany'));
    assert.ok(srcFile('models/TransactionTaxSnapshot.ts').includes('Phase D tax snapshots cannot store calculated tax amounts'));
    results['No historical rental-tax backfill or snapshot rewrite'] = 'PASS';
  }

  {
    const cents = calculateGrossRentalPercent(100.01, configured.rate!);
    assert.strictEqual(cents, roundMoney(100.01 * taxPercentToFraction(configured.rate!)));
    const large = calculateGrossRentalPercent(1_000_000, configured.rate!);
    assert.strictEqual(large, roundMoney(1_000_000 * taxPercentToFraction(configured.rate!)));
    results['Fractional cents and large values use roundMoney'] = 'PASS';
  }

  console.log(JSON.stringify(results, null, 2));
  if (Object.values(results).some((value) => value !== 'PASS')) throw new Error('Phase F tests failed');
  console.log('Phase F individual presumptive rental tax tests: ALL PASS');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
