import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { extractInclusiveVat, exclusiveVatOn, commissionVatFromTreatment } from '../services/tax/vatCalculation';
import { evaluateVatApplicability, isCompanyVatRegisteredOnDate, defaultSupplyTreatment } from '../services/tax/vatApplicability';
import { calculateCapitalGain, calculateCapitalGainsWithholding, isFlatSalePriceCgt } from '../services/tax/cgtCalculation';
import { buildAgentReceiptJournal, buildVatPaymentJournal, buildWithholdingJournal, buildWithholdingRemittanceJournal } from '../services/tax/principalAgentJournal';
import { buildSettlementWaterfall } from '../services/tax/settlementWaterfall';
import { generateTaxSummary } from '../services/taxEngine';
import { GL } from '../services/tax/chartAccounts';
import { calculatePropertyCommission } from '../services/propertyCommissionCalculator';
import { roundMoney } from '../utils/money';

function srcFile(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', '..', 'src', rel), 'utf8');
}

async function run(): Promise<void> {
  const results: Record<string, string> = {};

  // VAT inclusive / exclusive
  {
    const inclusive = extractInclusiveVat(115.5, 0.155);
    assert.strictEqual(inclusive.net, 100);
    assert.strictEqual(inclusive.vatAmount, 15.5);
    const exclusive = exclusiveVatOn(142.5, 0.155);
    assert.strictEqual(exclusive.vatAmount, 22.09);
    const inclCommission = commissionVatFromTreatment({
      commission: 1000,
      vatRate: 0.155,
      treatment: 'COMMISSION_VAT_INCLUSIVE'
    });
    assert.strictEqual(roundMoney(inclCommission.commissionNet + inclCommission.vatAmount), 1000);
    results['VAT inclusive/exclusive math'] = 'PASS';
  }

  // Historical 15% vs 2026 15.5% is rate-table driven (no hardcoded payment default)
  {
    const paymentCtrl = srcFile('controllers/paymentController.ts');
    assert.ok(!paymentCtrl.includes('?? 0.155'), 'sale VAT must not default to hardcoded 0.155');
    const taxEngineSrc = srcFile('services/taxEngine/index.ts');
    assert.ok(!taxEngineSrc.includes('cgtRate: 0.2'), 'tax engine must not default CGT to 20% of sale price');
    assert.ok(!taxEngineSrc.includes('salePrice *'), 'tax engine must not multiply sale price for CGT');
    results['No hardcoded 15.5% / 20% CGT'] = 'PASS';
  }

  // Company VAT registration
  {
    const company = {
      vatRegistered: true,
      vatRegistrationEffectiveDate: new Date('2026-03-01T00:00:00Z'),
      vatRegistrationCancelledAt: new Date('2026-08-31T00:00:00Z')
    };
    assert.strictEqual(isCompanyVatRegisteredOnDate(company, new Date('2026-02-01T00:00:00Z')), false);
    assert.strictEqual(isCompanyVatRegisteredOnDate(company, new Date('2026-04-01T00:00:00Z')), true);
    assert.strictEqual(isCompanyVatRegisteredOnDate(company, new Date('2026-09-01T00:00:00Z')), false);
    const unregistered = evaluateVatApplicability({
      company: { vatRegistered: false },
      transactionDate: new Date('2026-06-01'),
      supplyTreatment: 'STANDARD_TAXABLE',
      requested: true
    });
    assert.strictEqual(unregistered.vatApplies, false);
    assert.strictEqual(unregistered.reviewRequired, true);
    results['VAT registration window'] = 'PASS';
  }

  // Property classification
  {
    assert.strictEqual(defaultSupplyTreatment('RESIDENTIAL_DWELLING'), 'EXEMPT');
    assert.strictEqual(defaultSupplyTreatment('AGENCY_COMMISSION'), 'STANDARD_TAXABLE');
    const commercial = evaluateVatApplicability({
      company: { vatRegistered: true },
      transactionDate: new Date(),
      supplyTreatment: 'ACCOUNTANT_REVIEW',
      useClass: 'COMMERCIAL',
      requested: true
    });
    assert.strictEqual(commercial.vatApplies, false);
    assert.ok(commercial.reviewRequired);
    results['Property VAT classification'] = 'PASS';
  }

  // Rental exclusive VAT example from spec
  {
    const result = calculatePropertyCommission({
      grossRent: 1000,
      levy: 50,
      commissionPercentage: 15,
      vatOnCommission: true,
      vatTreatment: 'exclusive',
      vatRate: 0.155
    });
    assert.strictEqual(result.commissionBase, 950);
    assert.strictEqual(result.commissionNet, 142.5);
    assert.strictEqual(result.vatAmount, 22.09);
    assert.strictEqual(result.ownerAmount, 835.41);
    const journal = buildAgentReceiptJournal({
      paymentType: 'rental',
      amount: 1050,
      ownerAmount: result.ownerAmount,
      commissionNet: result.commissionNet,
      vatAmount: result.vatAmount
    });
    assert.strictEqual(journal.companyRevenue, 142.5);
    assert.strictEqual(journal.vatLiability, 22.09);
    assert.strictEqual(journal.ownerLiability, 885.41);
    assert.notStrictEqual(journal.companyRevenue, 1050);
    assert.ok(journal.lines.some((l) => l.accountCode === GL.TRUST_BANK && l.debit === 1050));
    assert.ok(journal.lines.some((l) => l.accountCode === GL.AGENCY_REVENUE && l.credit === 142.5));
    assert.ok(journal.balanced);
    results['Principal vs agent rental journal'] = 'PASS';
  }

  // CGT from capital gain, not sale price
  {
    const gain = calculateCapitalGain({
      salePrice: 200000,
      acquisitionCost: 120000,
      improvementCosts: 10000,
      sellingCosts: 5000,
      cgtRate: 0.2
    });
    assert.strictEqual(gain.capitalGain, 65000);
    assert.strictEqual(gain.cgtAmount, 13000);
    assert.notStrictEqual(gain.cgtAmount, 40000);
    assert.ok(!isFlatSalePriceCgt(200000, gain.cgtAmount));
    const missing = calculateCapitalGain({ salePrice: 200000, cgtRate: 0.2 });
    assert.strictEqual(missing.cgtAmount, 0);
    assert.strictEqual(missing.reviewRequired, true);
    const loss = calculateCapitalGain({ salePrice: 100, acquisitionCost: 150, cgtRate: 0.2 });
    assert.ok(loss.capitalGain < 0);
    assert.strictEqual(loss.cgtAmount, 0);
    const zero = calculateCapitalGain({ salePrice: 100, acquisitionCost: 100, cgtRate: 0.2 });
    assert.strictEqual(zero.cgtAmount, 0);
    results['CGT from capital gain'] = 'PASS';
  }

  // CGWT independent of CGT
  {
    const cgwt = calculateCapitalGainsWithholding({ saleConsideration: 200000, cgwtRate: 0.15 });
    const cgt = calculateCapitalGain({
      salePrice: 200000,
      acquisitionCost: 120000,
      cgtRate: 0.2
    });
    assert.strictEqual(cgwt.cgwtAmount, 30000);
    assert.notStrictEqual(cgwt.cgwtAmount, cgt.cgtAmount);
    const unconfigured = calculateCapitalGainsWithholding({ saleConsideration: 200000 });
    assert.strictEqual(unconfigured.cgwtAmount, 0);
    assert.ok(unconfigured.reviewRequired);
    results['CGT withholding separate'] = 'PASS';
  }

  // Settlement waterfall does not deduct final CGT
  {
    const waterfall = buildSettlementWaterfall({
      grossSaleProceeds: 200000,
      saleVat: 0,
      cgwt: 30000,
      agencyCommission: 10000,
      vatOnCommission: 1550
    });
    assert.strictEqual(waterfall.sellerNetProceeds, 158450);
    assert.ok(!waterfall.steps.some((s) => s.type === 'CAPITAL_GAINS_TAX'));
    assert.ok(waterfall.steps.some((s) => s.type === 'CAPITAL_GAINS_WITHHOLDING_TAX'));
    const summary = generateTaxSummary({
      salePrice: 200000,
      commissionAmount: 10000,
      vatOnCommissionAmount: 1550,
      acquisitionCost: 120000,
      cgtRate: 0.2,
      cgwtRate: 0.15
    });
    assert.strictEqual(summary.cgt.cgtAmount, 16000);
    assert.strictEqual(summary.cgwt.cgwtAmount, 30000);
    assert.notStrictEqual(summary.sellerNetPayout, roundMoney(200000 - summary.cgt.cgtAmount - 10000 - 1550));
    results['Settlement waterfall'] = 'PASS';
  }

  // VAT payment clears 2101
  {
    const lines = buildVatPaymentJournal({ amount: 3500 });
    assert.deepStrictEqual(lines[0], { accountCode: GL.VAT_PAYABLE, debit: 3500 });
    assert.deepStrictEqual(lines[1], { accountCode: GL.COMPANY_BANK, credit: 3500 });
    const withhold = buildWithholdingJournal({ amount: 30000, fromPayableAccount: GL.SELLER_PAYABLE });
    assert.ok(withhold.some((l) => l.accountCode === GL.ZIMRA_WITHHOLDING && l.credit === 30000));
    const remit = buildWithholdingRemittanceJournal({ amount: 30000 });
    assert.ok(remit.some((l) => l.accountCode === GL.ZIMRA_WITHHOLDING && l.debit === 30000));
    assert.ok(remit.some((l) => l.accountCode === GL.TRUST_BANK && l.credit === 30000));
    results['VAT / withholding GL movement'] = 'PASS';
  }

  // Orchestrator still canonical
  {
    const orch = srcFile('services/paymentAccountingOrchestrator.ts');
    assert.ok(orch.includes('syncPaymentReceived'));
    assert.ok(orch.includes('postCompanyCommission'));
    const integration = srcFile('services/accountingIntegrationService.ts');
    assert.ok(integration.includes('buildAgentReceiptJournal'));
    assert.ok(integration.includes('upsertPaymentTaxObligation'));
    assert.ok(integration.includes('Agent collection'));
    assert.ok(!integration.includes("accountCode: '1001', debit"));
    results['Orchestrator + agent journal wiring'] = 'PASS';
  }

  // Fiscalisation not claimed from local QR
  {
    const fiscal = srcFile('services/fiscalizationService.ts');
    assert.ok(fiscal.includes("status: 'NOT_FISCALISED'"));
    assert.ok(fiscal.includes('FDMS integration is not implemented'));
    const zimra = srcFile('services/zimraPaymentService.ts');
    assert.ok(zimra.includes('attachTaxPaymentReceipt'));
    assert.ok(!/attachTaxPaymentReceipt[\s\S]*status:\s*'PAID'/.test(zimra), 'receipt upload must not mark tax paid');
    results['Fiscalisation not falsely claimed'] = 'PASS';
  }

  // Dated 15.5% seed exists for new rate tables
  {
    const rateSvc = srcFile('services/taxRateService.ts');
    assert.ok(rateSvc.includes('STANDARD_VAT_PERCENT_FROM_2026'));
    assert.ok(rateSvc.includes('STANDARD_VAT_PERCENT_BEFORE_2026'));
    const vatCalc = srcFile('services/tax/vatCalculation.ts');
    assert.ok(vatCalc.includes('15.5'));
    results['Dated VAT rate seed'] = 'PASS';
  }

  // UI does not hardcode sample PAYE/VAT/corporate figures; compliance page exists
  {
    const reports = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'client', 'src', 'pages', 'AccountantDashboard', 'ReportsPage.tsx'), 'utf8');
    assert.ok(!reports.includes('currency(620)'), 'PAYE sample figure must be removed');
    assert.ok(!reports.includes('currency(1450)'), 'VAT sample figure must be removed');
    assert.ok(!reports.includes('currency(2100)'), 'Corporate tax sample figure must be removed');
    const taxPage = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'client', 'src', 'pages', 'AccountantDashboard', 'TaxCompliancePage.tsx'), 'utf8');
    assert.ok(taxPage.includes('Record ZIMRA payment'));
    assert.ok(taxPage.includes('does not file returns with ZIMRA'));
    results['Hardcoded tax report data'] = 'PASS';
  }

  {
    const doc = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'PHASE8_TAX_TRUST_COMPLIANCE.md'), 'utf8');
    assert.ok(doc.includes('submit the return to ZIMRA'));
    assert.ok(doc.includes('NOT IMPLEMENTED'));
    results['Compliance documentation'] = 'PASS';
  }

  console.log(JSON.stringify({ phase: 8, results }, null, 2));
  const failed = Object.values(results).filter((v) => v !== 'PASS');
  if (failed.length) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
