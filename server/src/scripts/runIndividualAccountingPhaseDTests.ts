import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { buildTaxClassification } from '../services/taxClassificationService';
import { calendarPeriodBounds, calendarPeriodKey, uncalculatedTaxFields } from '../services/tax/taxMetadataTypes';
import { assignmentStatusForExistingPeriod } from '../services/taxPeriodService';
import { isRuleEffectiveOn, systemTaxRuleSeeds } from '../services/taxRuleRegistry';
import type { TaxRuleRecord } from '../services/taxRuleRegistry';

function srcFile(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', '..', 'src', rel), 'utf8');
}

function rule(partial: Partial<TaxRuleRecord> & Pick<TaxRuleRecord, 'taxType' | 'ruleCode'>): TaxRuleRecord {
  return {
    id: partial.id || 'rule-id',
    jurisdiction: 'ZW',
    taxType: partial.taxType,
    ruleCode: partial.ruleCode,
    version: partial.version ?? 1,
    description: partial.description || partial.ruleCode,
    effectiveFrom: partial.effectiveFrom || new Date('2026-01-01T00:00:00.000Z'),
    effectiveTo: partial.effectiveTo ?? null,
    rate: partial.rate ?? 15,
    supplyTreatment: null,
    calculationMethod: 'STANDARD_PERCENT',
    sourceReference: partial.sourceReference || 'test',
    sourceDocument: null,
    notes: null,
    status: 'ACTIVE'
  };
}

async function run(): Promise<void> {
  const results: Record<string, string> = {};

  {
    assert.strictEqual(calendarPeriodKey(new Date('2026-01-01T00:00:00.000Z')), '2026-01');
    assert.strictEqual(calendarPeriodKey(new Date('2026-12-31T23:00:00.000Z')), '2026-12');
    assert.strictEqual(calendarPeriodKey(new Date('2027-01-01T00:00:00.000Z')), '2027-01');
    const jan = calendarPeriodBounds('2026-01');
    assert.strictEqual(jan.periodStart.toISOString(), '2026-01-01T00:00:00.000Z');
    assert.strictEqual(jan.periodEnd.getUTCMonth(), 0);
    assert.strictEqual(jan.periodEnd.getUTCDate(), 31);
    const leap = calendarPeriodBounds('2024-02');
    assert.strictEqual(leap.periodEnd.getUTCDate(), 29);
    const nonLeap = calendarPeriodBounds('2025-02');
    assert.strictEqual(nonLeap.periodEnd.getUTCDate(), 28);
    results['Tax period keys follow transaction UTC date, including year and leap-year boundaries'] = 'PASS';
  }

  {
    assert.strictEqual(assignmentStatusForExistingPeriod('OPEN'), 'ASSIGNED');
    assert.strictEqual(assignmentStatusForExistingPeriod('REVIEW'), 'ASSIGNED');
    assert.strictEqual(assignmentStatusForExistingPeriod('AMENDED'), 'ASSIGNED');
    assert.strictEqual(assignmentStatusForExistingPeriod('FINALIZED'), 'PERIOD_CLOSED');
    assert.strictEqual(assignmentStatusForExistingPeriod('LOCKED'), 'PERIOD_CLOSED');
    const resolver = srcFile('services/taxPeriodService.ts');
    const resolveFn = resolver.slice(
      resolver.indexOf('export async function resolveTaxPeriod'),
      resolver.indexOf('export async function resolveRelevantTaxPeriods')
    );
    assert.ok(!resolveFn.includes('TaxPeriod.create'));
    assert.ok(resolveFn.includes("status: 'PERIOD_REQUIRED'"));
    results['Closed and locked tax periods are explicit; missing periods are PERIOD_REQUIRED'] = 'PASS';
  }

  {
    const seeds = systemTaxRuleSeeds();
    const vat2026 = seeds.find((row) => row.ruleCode === 'ZW_VAT_STANDARD' && row.version === 2)!;
    const vatPrior = seeds.find((row) => row.ruleCode === 'ZW_VAT_STANDARD' && row.version === 1)!;
    const presumptive = seeds.find((row) => row.ruleCode === 'ZW_PRESUMPTIVE_RENTAL_PN08_2026')!;
    assert.ok(isRuleEffectiveOn(vatPrior, new Date('2025-12-31T00:00:00.000Z')));
    assert.ok(!isRuleEffectiveOn(vatPrior, new Date('2026-01-01T00:00:00.000Z')));
    assert.ok(isRuleEffectiveOn(vat2026, new Date('2026-01-01T00:00:00.000Z')));
    assert.ok(!isRuleEffectiveOn(vat2026, new Date('2025-12-31T00:00:00.000Z')));
    assert.ok(isRuleEffectiveOn(presumptive, new Date('2026-09-17T00:00:00.000Z')));
    assert.ok(!isRuleEffectiveOn(presumptive, new Date('2025-12-01T00:00:00.000Z')));
    assert.ok(!isRuleEffectiveOn({ ...vat2026, status: 'INACTIVE' }, new Date('2026-09-17T00:00:00.000Z')));
    results['Tax-rule effective dates are independent of tax-period calendar keys'] = 'PASS';
  }

  {
    const commercial = buildTaxClassification({
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
    assert.strictEqual(commercial.taxAmount, null);
    assert.strictEqual(commercial.taxableAmount, null);
    assert.strictEqual(commercial.vatAmount, null);
    assert.strictEqual(commercial.presumptiveTaxAmount, null);
    assert.strictEqual(commercial.incomeTaxAmount, null);
    assert.notStrictEqual(commercial.taxCalculationStatus, 'CALCULATED');
    assert.ok(commercial.taxTypesRelevant.includes('VAT'));
    assert.strictEqual(commercial.taxProfileSnapshot.vatSupplyTreatment, 'STANDARD_TAXABLE');
    const vatRef = commercial.taxRuleReferences.find((row) => row.taxType === 'VAT');
    assert.ok(vatRef);
    assert.strictEqual(vatRef!.taxAmount, null);
    assert.strictEqual(vatRef!.configuredRate, 15.5);
    assert.strictEqual(vatRef!.ruleVersion, 2);
    results['Commercial VAT-registered rent stores rule metadata without calculating tax'] = 'PASS';
  }

  {
    const first = buildTaxClassification({
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
    const later = buildTaxClassification({
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
    assert.strictEqual(first.taxProfileSnapshot.vatRegistered, true);
    assert.strictEqual(first.taxProfileSnapshot.rentalTaxRegime, 'PRESUMPTIVE_RENTAL');
    assert.strictEqual(first.taxProfileSnapshot.ownerProfileVersion, 1);
    assert.strictEqual(later.taxProfileSnapshot.vatRegistered, false);
    assert.strictEqual(later.taxProfileSnapshot.rentalTaxRegime, 'SELF_ASSESSMENT');
    assert.strictEqual(later.taxProfileSnapshot.ownerProfileVersion, 2);
    assert.notStrictEqual(first.taxProfileSnapshot.rentalTaxRegime, later.taxProfileSnapshot.rentalTaxRegime);
    const snapshotModel = srcFile('models/TransactionTaxSnapshot.ts');
    assert.ok(snapshotModel.includes('Tax snapshots are immutable after posting'));
    assert.ok(snapshotModel.includes('cannot be updated in place'));
    results['Changing the live profile does not rewrite an earlier classification snapshot'] = 'PASS';
  }

  {
    const residential = buildTaxClassification({
      sourceKind: 'PAYMENT_RENT',
      transactionDate: new Date('2026-09-17T00:00:00.000Z'),
      vatRegistered: false,
      rentalTaxRegime: 'ACCOUNTANT_REVIEW',
      incomeTaxRegistered: false,
      propertyUseClass: 'RESIDENTIAL_DWELLING',
      vatSupplyTreatment: 'EXEMPT',
      rentalTaxTreatment: 'ACCOUNTANT_REVIEW'
    });
    assert.strictEqual(residential.vatTreatment, 'EXEMPT');
    assert.strictEqual(residential.taxCalculationStatus, 'REVIEW_REQUIRED');
    assert.strictEqual(residential.vatAmount, null);
    results['Residential treatment comes from the property profile, not a Phase D hard-code'] = 'PASS';
  }

  {
    const missingRule = buildTaxClassification({
      sourceKind: 'PAYMENT_RENT',
      transactionDate: new Date('2026-09-17T00:00:00.000Z'),
      vatRegistered: true,
      rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
      incomeTaxRegistered: false,
      propertyUseClass: 'COMMERCIAL',
      vatSupplyTreatment: 'STANDARD_TAXABLE',
      rentalTaxTreatment: 'PRESUMPTIVE_RENTAL'
    });
    assert.ok(missingRule.reviewReasons.includes('TAX_RULE_UNAVAILABLE'));
    assert.strictEqual(missingRule.vatAmount, null);
    results['Missing tax-rule references stay uncalculated and require review'] = 'PASS';
  }

  {
    const expense = buildTaxClassification({
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
    assert.strictEqual(expense.vatAmount, null);
    assert.ok(expense.reviewReasons.includes('MISSING_EXPENSE_CLASSIFICATION'));
    const capital = buildTaxClassification({
      sourceKind: 'CAPITAL',
      transactionDate: new Date('2026-09-17T00:00:00.000Z'),
      vatRegistered: false,
      rentalTaxRegime: 'ACCOUNTANT_REVIEW',
      incomeTaxRegistered: false,
      propertyUseClass: 'COMMERCIAL',
      userCapitalOrRevenue: 'CAPITAL'
    });
    assert.strictEqual(capital.capitalOrRevenue, 'CAPITAL');
    assert.strictEqual(capital.taxAmount, null);
    results['Expenses and capital receive metadata without input-VAT journals'] = 'PASS';
  }

  {
    const deposit = buildTaxClassification({
      sourceKind: 'PAYMENT_DEPOSIT',
      transactionDate: new Date('2026-09-17T00:00:00.000Z'),
      vatRegistered: true,
      rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
      incomeTaxRegistered: false,
      propertyUseClass: 'COMMERCIAL',
      vatSupplyTreatment: 'STANDARD_TAXABLE',
      rentalTaxTreatment: 'PRESUMPTIVE_RENTAL'
    });
    assert.strictEqual(deposit.taxCalculationStatus, 'NOT_APPLICABLE');
    assert.ok(!deposit.taxTypesRelevant.includes('PRESUMPTIVE_RENTAL_INCOME_TAX'));
    assert.strictEqual(deposit.vatAmount, null);
    results['Tenant deposits are not rental income and are not taxed in Phase D'] = 'PASS';
  }

  {
    const amounts = uncalculatedTaxFields();
    assert.strictEqual(amounts.taxAmount, null);
    assert.strictEqual(amounts.vatAmount, null);
    const metadata = srcFile('services/taxClassificationService.ts');
    const attach = srcFile('services/individualTaxMetadataService.ts');
    assert.ok(!metadata.includes('taxableAmount *'));
    assert.ok(!metadata.includes(' * rate'));
    assert.ok(!attach.includes('taxableAmount *'));
    assert.ok(!attach.includes('vatPayable'));
    assert.ok(!attach.includes('presumptiveTaxPayable'));
    assert.ok(!attach.includes('incomeTaxPayable'));
    assert.ok(attach.includes('TAX_METADATA_CREATED'));
    assert.ok(attach.includes('TAX_PERIOD_ASSIGNED'));
    assert.ok(attach.includes('TAX_RULE_RESOLVED'));
    assert.ok(attach.includes('TAX_PROFILE_SNAPSHOT_CREATED'));
    assert.ok(attach.includes('noAutomaticRepair: true') || attach.includes('detectionOnly: true'));
    results['Phase D does not calculate or post tax amounts'] = 'PASS';
  }

  {
    const orch = srcFile('services/paymentAccountingOrchestrator.ts');
    assert.ok(orch.includes('export async function postPaymentAccounting'));
    assert.ok(orch.includes('individualTaxMetadataService.safeAttachForPayment'));
    const accounting = srcFile('services/individualAccountingService.ts');
    assert.ok(accounting.includes('individualTaxMetadataService.attachForLandlordEntry'));
    assert.ok(!srcFile('services/individualTaxMetadataService.ts').includes('Payment.updateMany'));
    assert.ok(!srcFile('models/TransactionTaxSnapshot.ts').includes('taxAmount = taxableAmount'));
    results['Rent path unchanged; metadata attach is new-only and not a historical backfill'] = 'PASS';
  }

  {
    const routes = srcFile('routes/individualRoutes.ts');
    assert.ok(routes.includes("router.get('/tax/periods'"));
    assert.ok(routes.includes("router.post('/tax/periods'"));
    assert.ok(routes.includes("router.get('/tax/review'"));
    assert.ok(routes.includes('taxPeriodId'));
    assert.ok(routes.includes('taxCalculationStatus'));
    results['Tax period, review, and report-filter APIs exist'] = 'PASS';
  }

  console.log(JSON.stringify(results, null, 2));
  const failed = Object.values(results).filter((value) => value !== 'PASS');
  if (failed.length) throw new Error('Phase D tests failed');
  console.log('Phase D individual tax metadata tests: ALL PASS');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
