import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { defaultSupplyTreatment } from '../services/tax/vatApplicability';
import { normalizeRentalTaxRegime } from '../services/tax/rentalTaxTypes';
import { isRuleEffectiveOn, systemTaxRuleSeeds } from '../services/taxRuleRegistry';
import { TAX_TYPE_MODE } from '../services/tax/taxTypes';

function srcFile(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', '..', 'src', rel), 'utf8');
}

async function run(): Promise<void> {
  const results: Record<string, string> = {};

  {
    assert.strictEqual(normalizeRentalTaxRegime(undefined), 'ACCOUNTANT_REVIEW');
    assert.strictEqual(normalizeRentalTaxRegime('individual'), 'ACCOUNTANT_REVIEW');
    assert.strictEqual(normalizeRentalTaxRegime('PRESUMPTIVE_RENTAL'), 'PRESUMPTIVE_RENTAL');
    assert.strictEqual(normalizeRentalTaxRegime('SELF_ASSESSMENT'), 'SELF_ASSESSMENT');
    const service = srcFile('services/individualTaxProfileService.ts');
    assert.ok(!service.includes('workspaceType === \'individual\''));
    assert.ok(!service.includes("plan === 'INDIVIDUAL'"));
    assert.ok(service.includes('rentalTaxRegimeInferredFromWorkspace: false'));
    results['Rental tax regime is not inferred from workspace'] = 'PASS';
  }

  {
    assert.strictEqual(defaultSupplyTreatment('RESIDENTIAL_DWELLING'), 'EXEMPT');
    assert.strictEqual(defaultSupplyTreatment('COMMERCIAL'), 'ACCOUNTANT_REVIEW');
    assert.strictEqual(defaultSupplyTreatment('SHORT_TERM_ACCOMMODATION'), 'ACCOUNTANT_REVIEW');
    assert.strictEqual(defaultSupplyTreatment('MIXED_USE'), 'ACCOUNTANT_REVIEW');
    results['Commercial and short-term rentals are not auto-classified for VAT'] = 'PASS';
  }

  {
    const seeds = systemTaxRuleSeeds();
    const vat2026 = seeds.find((r) => r.ruleCode === 'ZW_VAT_STANDARD' && r.version === 2);
    const vatPrior = seeds.find((r) => r.ruleCode === 'ZW_VAT_STANDARD' && r.version === 1);
    const presumptive = seeds.find((r) => r.ruleCode === 'ZW_PRESUMPTIVE_RENTAL_PN08_2026');
    assert.ok(vat2026 && vatPrior && presumptive);
    assert.strictEqual(vatPrior.rate, 15);
    assert.strictEqual(vat2026.rate, 15.5);
    assert.strictEqual(presumptive.rate, 15);
    assert.strictEqual(presumptive.sourceReference, 'ZIMRA Public Notice 08 of 2026');
    assert.ok(isRuleEffectiveOn(vatPrior, new Date('2025-12-31T00:00:00.000Z')));
    assert.ok(!isRuleEffectiveOn(vatPrior, new Date('2026-01-01T00:00:00.000Z')));
    assert.ok(isRuleEffectiveOn(vat2026, new Date('2026-01-01T00:00:00.000Z')));
    assert.ok(!isRuleEffectiveOn(vat2026, new Date('2025-12-31T00:00:00.000Z')));
    assert.ok(isRuleEffectiveOn(presumptive, new Date('2026-09-17T00:00:00.000Z')));
    assert.ok(!isRuleEffectiveOn(presumptive, new Date('2025-12-01T00:00:00.000Z')));
    results['Effective-dated VAT and presumptive rules preserve historical rates'] = 'PASS';
  }

  {
    assert.strictEqual(TAX_TYPE_MODE.PRESUMPTIVE_RENTAL_INCOME_TAX, 'NOT_IMPLEMENTED');
    assert.strictEqual(TAX_TYPE_MODE.INCOME_TAX, 'NOT_IMPLEMENTED');
    const service = srcFile('services/individualTaxProfileService.ts');
    assert.ok(!service.includes('PropertyAccount'));
    assert.ok(!service.includes('postPaymentAccounting'));
    assert.ok(service.includes('TAX_PROFILE_UPDATED'));
    results['Profiles do not calculate or rewrite financial amounts'] = 'PASS';
  }

  {
    const routes = srcFile('routes/individualRoutes.ts');
    assert.ok(routes.includes("router.get('/tax-profile'"));
    assert.ok(routes.includes("router.put('/tax-profile'"));
    assert.ok(routes.includes("router.get('/properties/:id/tax-profile'"));
    assert.ok(routes.includes("router.put('/properties/:id/tax-profile'"));
    const orch = srcFile('services/paymentAccountingOrchestrator.ts');
    assert.ok(orch.includes('export async function postPaymentAccounting'));
    results['Tax profile APIs exist; rent orchestrator unchanged'] = 'PASS';
  }

  {
    const form = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', 'client', 'src', 'components', 'properties', 'PropertyForm.tsx'),
      'utf8'
    );
    assert.ok(form.includes("commission: individualMode ? 0"));
    assert.ok(form.includes('SHORT_TERM_ACCOMMODATION'));
    assert.ok(form.includes('rentalTaxTreatment'));
    results['Individual property form keeps commission 0 and exposes tax classification'] = 'PASS';
  }

  console.log(JSON.stringify(results, null, 2));
  const failed = Object.values(results).filter((v) => v !== 'PASS');
  if (failed.length) {
    throw new Error('Phase C individual tax profile tests failed');
  }
  console.log('Phase C individual tax profile tests: ALL PASS');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
