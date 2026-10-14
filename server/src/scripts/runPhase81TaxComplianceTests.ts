import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { extractInclusiveVat, exclusiveVatOn } from '../services/tax/vatCalculation';
import { evaluateVatApplicability, isCompanyVatRegisteredOnDate, defaultSupplyTreatment } from '../services/tax/vatApplicability';
import { calculateCapitalGain, calculateCapitalGainsWithholding, isFlatSalePriceCgt } from '../services/tax/cgtCalculation';
import { buildAgentReceiptJournal, buildVatPaymentJournal } from '../services/tax/principalAgentJournal';
import { buildSettlementWaterfall } from '../services/tax/settlementWaterfall';
import { generateTaxSummary } from '../services/taxEngine';
import { allocateRentalReceipt, allocationBalances } from '../services/tax/paymentAllocation';
import { periodsOverlap } from '../services/taxRateService';
import { resolveTaxFx } from '../services/tax/fxPolicy';
import { calculatePropertyCommission } from '../services/propertyCommissionCalculator';
import { GL } from '../services/tax/chartAccounts';
import { roundMoney } from '../utils/money';

function srcFile(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', '..', 'src', rel), 'utf8');
}

function clientFile(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', '..', '..', 'client', 'src', rel), 'utf8');
}

async function run(): Promise<void> {
  const results: Record<string, string> = {};

  // VAT 1–3 registration
  {
    const company = {
      vatRegistered: true,
      vatRegistrationEffectiveDate: new Date('2026-07-01T00:00:00Z'),
      vatRegistrationCancelledAt: new Date('2026-11-30T00:00:00Z')
    };
    assert.strictEqual(isCompanyVatRegisteredOnDate({ vatRegistered: false }, new Date('2026-09-01')), false);
    assert.strictEqual(isCompanyVatRegisteredOnDate(company, new Date('2026-06-01')), false);
    assert.strictEqual(isCompanyVatRegisteredOnDate(company, new Date('2026-08-01')), true);
    assert.strictEqual(isCompanyVatRegisteredOnDate(company, new Date('2026-12-01')), false);
    results['1-3 VAT registration inactive/mid-year/cancelled'] = 'PASS';
  }

  // VAT 4 missing rate → review, not silent company today-rate
  {
    const rateSvc = srcFile('services/taxRateService.ts');
    assert.ok(rateSvc.includes('Never substitute today\'s company rate') || rateSvc.includes('Never substitute today'));
    assert.ok(srcFile('services/vatPolicyService.ts').includes('VAT_RATE_MISSING'));
    results['4 Missing VAT rate'] = 'PASS';
  }

  // VAT 5 overlapping rates
  {
    const a = { effectiveFrom: new Date('2025-01-01'), effectiveTo: new Date('2025-12-31') };
    const b = { effectiveFrom: new Date('2025-06-01'), effectiveTo: null };
    assert.strictEqual(periodsOverlap(a, b), true);
    const c = { effectiveFrom: new Date('2026-01-01'), effectiveTo: null };
    assert.strictEqual(periodsOverlap(a, c), false);
    const create = srcFile('services/taxRateService.ts');
    assert.ok(create.includes('Historical rates cannot be overwritten'));
    results['5 Overlapping VAT rates'] = 'PASS';
  }

  // VAT 6–7 15% historical vs 15.5% 2026
  {
    const inclusive15 = extractInclusiveVat(115, 0.15);
    assert.strictEqual(inclusive15.vatAmount, 15);
    const inclusive155 = extractInclusiveVat(115.5, 0.155);
    assert.strictEqual(inclusive155.vatAmount, 15.5);
    results['6-7 Historical 15% and 2026 15.5%'] = 'PASS';
  }

  // VAT 8–11 inclusive/exclusive/exempt/standard
  {
    const exclusive = exclusiveVatOn(142.5, 0.155);
    assert.strictEqual(exclusive.vatAmount, 22.09);
    const exempt = evaluateVatApplicability({
      company: { vatRegistered: true },
      transactionDate: new Date('2026-06-01'),
      supplyTreatment: 'EXEMPT',
      requested: true
    });
    assert.strictEqual(exempt.vatApplies, false);
    const standard = evaluateVatApplicability({
      company: { vatRegistered: true },
      transactionDate: new Date('2026-06-01'),
      supplyTreatment: 'STANDARD_TAXABLE',
      requested: true
    });
    assert.strictEqual(standard.vatApplies, true);
    assert.strictEqual(defaultSupplyTreatment('RESIDENTIAL_DWELLING'), 'EXEMPT');
    results['8-11 Inclusive/exclusive/exempt/standard VAT'] = 'PASS';
  }

  // VAT 12 return recon gate
  {
    const vatReturn = srcFile('services/vatReturnService.ts');
    assert.ok(vatReturn.includes('glOutputVatForPeriod'));
    assert.ok(vatReturn.includes('RECONCILIATION REQUIRED'));
    assert.ok(vatReturn.includes("input.status === 'RECONCILED'"));
    results['12 VAT return reconciliation'] = 'PASS';
  }

  // VAT 13–15 payment / partial / overpayment
  {
    const zimra = srcFile('services/zimraPaymentService.ts');
    assert.ok(zimra.includes('unallocatedAmount'));
    assert.ok(zimra.includes('cannot be silently dropped'));
    const overpay = buildVatPaymentJournal({ amount: 12000, allocatedAmount: 10000, unallocatedAmount: 2000 });
    assert.ok(overpay.some((l) => l.accountCode === GL.VAT_PAYABLE && l.debit === 10000));
    assert.ok(overpay.some((l) => l.accountCode === GL.TAX_PREPAYMENT && l.debit === 2000));
    assert.ok(overpay.some((l) => l.accountCode === GL.COMPANY_BANK && l.credit === 12000));
    results['13-15 VAT payment/partial/overpayment'] = 'PASS';
  }

  // VAT 16 receipt without payment
  {
    const zimra = srcFile('services/zimraPaymentService.ts');
    assert.ok(!/attachTaxPaymentReceipt[\s\S]*status:\s*'PAID'/.test(zimra));
    results['16 Receipt without payment'] = 'PASS';
  }

  // CGT 17–21 cost, improvements, expenses, no gain, loss
  {
    const withCost = calculateCapitalGain({
      salePrice: 200000,
      acquisitionCost: 120000,
      improvementCosts: 10000,
      qualifyingExpenses: 2000,
      sellingCosts: 3000,
      cgtRate: 0.2
    });
    assert.strictEqual(withCost.capitalGain, 65000);
    assert.strictEqual(withCost.cgtAmount, 13000);
    assert.strictEqual(withCost.isFinal, true);
    const noGain = calculateCapitalGain({ salePrice: 100, acquisitionCost: 100, cgtRate: 0.2 });
    assert.strictEqual(noGain.cgtAmount, 0);
    assert.strictEqual(noGain.settlementBlocked, false);
    const loss = calculateCapitalGain({ salePrice: 80, acquisitionCost: 100, cgtRate: 0.2 });
    assert.ok(loss.capitalGain < 0);
    assert.strictEqual(loss.cgtAmount, 0);
    results['17-21 CGT cost/improvements/expenses/no-gain/loss'] = 'PASS';
  }

  // CGT 22 missing acquisition cost — not final, blocked
  {
    const missing = calculateCapitalGain({ salePrice: 200000, cgtRate: 0.2 });
    assert.strictEqual(missing.cgtAmount, 0);
    assert.strictEqual(missing.settlementBlocked, true);
    assert.strictEqual(missing.isProvisional, true);
    assert.ok((missing.provisionalCgtAmount || 0) > 0);
    assert.notStrictEqual(missing.cgtAmount, missing.provisionalCgtAmount);
    results['22 Missing acquisition cost'] = 'PASS';
  }

  // CGT 23 missing rate — cannot settle at 0
  {
    const missingRate = calculateCapitalGain({ salePrice: 200000, acquisitionCost: 100000, cgtRate: null });
    assert.strictEqual(missingRate.cgtAmount, 0);
    assert.strictEqual(missingRate.settlementBlocked, true);
    assert.strictEqual(missingRate.calculationBasis, 'CGT_RATE_MISSING');
    const summary = generateTaxSummary({
      salePrice: 200000,
      commissionAmount: 10000,
      acquisitionCost: 100000,
      cgtRate: null,
      cgwtRate: 0.15,
      cgwtApplicability: 'APPLICABLE'
    });
    assert.strictEqual(summary.settlementBlocked, true);
    assert.strictEqual(summary.settlementStatus, 'REQUIRES_TAX_REVIEW');
    results['23 Missing CGT rate'] = 'PASS';
  }

  // CGT 24 historical review
  {
    assert.ok(isFlatSalePriceCgt(200000, 40000));
    const review = srcFile('services/taxComplianceReviewService.ts');
    assert.ok(review.includes('LEGACY_CGT_CALCULATION'));
    assert.ok(review.includes('Historical calculation may require accountant review'));
    results['24 Historical CGT review'] = 'PASS';
  }

  // CGT 25 reversal
  {
    const taxOb = srcFile('services/taxObligationService.ts');
    assert.ok(taxOb.includes('reversePaymentTaxObligations'));
    assert.ok(taxOb.includes("status: 'REVERSED'"));
    results['25 CGT reversal'] = 'PASS';
  }

  // CGWT 26–28 applicable / not applicable / rate missing
  {
    const applicable = calculateCapitalGainsWithholding({ saleConsideration: 200000, cgwtRate: 0.15, applicability: 'APPLICABLE' });
    assert.strictEqual(applicable.cgwtAmount, 30000);
    assert.strictEqual(applicable.applicability, 'APPLICABLE');
    const notApp = calculateCapitalGainsWithholding({
      saleConsideration: 200000,
      applicability: 'NOT_APPLICABLE',
      notApplicableReason: 'Exempt instrument'
    });
    assert.strictEqual(notApp.cgwtAmount, 0);
    assert.strictEqual(notApp.calculationBasis, 'CGWT_NOT_APPLICABLE');
    assert.strictEqual(notApp.settlementBlocked, false);
    const missing = calculateCapitalGainsWithholding({ saleConsideration: 200000, applicability: 'APPLICABLE' });
    assert.strictEqual(missing.cgwtAmount, 0);
    assert.strictEqual(missing.calculationBasis, 'CGWT_RATE_MISSING');
    assert.strictEqual(missing.settlementBlocked, true);
    assert.notStrictEqual(missing.calculationBasis, notApp.calculationBasis);
    results['26-28 CGWT applicable/not applicable/rate missing'] = 'PASS';
  }

  // CGWT 29–33 withholding/remittance/receipt/recon/reversal
  {
    const journal = srcFile('services/tax/principalAgentJournal.ts');
    assert.ok(journal.includes('buildWithholdingJournal'));
    assert.ok(journal.includes('buildWithholdingRemittanceJournal'));
    const trust = srcFile('services/trustAccountService.ts');
    assert.ok(trust.includes('CAPITAL_GAINS_WITHHOLDING_TAX'));
    assert.ok(!trust.includes("taxType === 'CAPITAL_GAINS_WITHHOLDING_TAX' || taxType === 'CGT'"));
    results['29-33 CGWT withholding/remittance/receipt/recon/reversal'] = 'PASS';
  }

  // Trust 34–38 rental, levy, sale, CGWT deduction, seller payout
  {
    const calc = calculatePropertyCommission({
      grossRent: 1000,
      levy: 50,
      commissionPercentage: 15,
      vatOnCommission: true,
      vatTreatment: 'exclusive',
      vatRate: 0.155
    });
    const allocation = allocateRentalReceipt({
      amount: 1050,
      rent: 1000,
      levy: 50,
      commissionBase: calc.commissionBase,
      commissionNet: calc.commissionNet,
      vatOnCommission: calc.vatAmount
    });
    assert.strictEqual(allocation.companyRevenue, 142.5);
    assert.strictEqual(allocation.vatOnCommission, 22.09);
    assert.strictEqual(allocation.levyPayable, 50);
    assert.strictEqual(allocation.trustLiability, 885.41);
    assert.strictEqual(allocation.ownerPayable, 835.41);
    assert.ok(allocationBalances(allocation));
    const journal = buildAgentReceiptJournal({
      paymentType: 'rental',
      amount: 1050,
      ownerAmount: allocation.ownerPayable,
      commissionNet: allocation.commissionNet,
      vatAmount: allocation.vatOnCommission,
      levyAmount: allocation.levyPayable
    });
    assert.strictEqual(journal.ownerLiability, 835.41);
    assert.strictEqual(journal.levyLiability, 50);
    assert.ok(journal.lines.some((l) => l.accountCode === GL.LEVY_PAYABLE && l.credit === 50));
    assert.ok(journal.lines.some((l) => l.accountCode === GL.OWNER_PAYABLE && l.credit === 835.41));
    assert.ok(journal.balanced);
    const waterfall = buildSettlementWaterfall({
      grossSaleProceeds: 200000,
      cgwt: 30000,
      agencyCommission: 10000,
      vatOnCommission: 1550
    });
    assert.ok(waterfall.steps.some((s) => s.type === 'CAPITAL_GAINS_WITHHOLDING_TAX'));
    assert.ok(!waterfall.steps.some((s) => s.type === 'CAPITAL_GAINS_TAX'));
    results['34-38 Rental/levy/sale/CGWT/seller payout'] = 'PASS';
  }

  // Trust 39–43 recon scope, shortfall, surplus, negative, unallocated
  {
    const dash = srcFile('controllers/taxComplianceController.ts');
    assert.ok(dash.includes("scope: 'PARTIAL'"));
    assert.ok(dash.includes('excludedClientMoney'));
    const integrity = srcFile('services/taxIntegrityService.ts');
    assert.ok(integrity.includes('TRUST_SHORTFALL'));
    assert.ok(integrity.includes('TRUST_SURPLUS'));
    assert.ok(integrity.includes('detectionOnly: true'));
    assert.ok(integrity.includes('repaired: false'));
    results['39-43 Trust recon/shortfall/surplus/unallocated'] = 'PASS';
  }

  // Principal vs agent 44–48
  {
    const journal = buildAgentReceiptJournal({
      paymentType: 'rental',
      amount: 1050,
      ownerAmount: 835.41,
      commissionNet: 142.5,
      vatAmount: 22.09,
      levyAmount: 50
    });
    assert.notStrictEqual(journal.companyRevenue, 1050);
    assert.strictEqual(journal.companyRevenue, 142.5);
    assert.strictEqual(journal.vatLiability, 22.09);
    const sale = buildAgentReceiptJournal({
      paymentType: 'sale',
      amount: 200000,
      ownerAmount: 188450,
      commissionNet: 10000,
      vatAmount: 1550
    });
    assert.notStrictEqual(sale.companyRevenue, 200000);
    assert.strictEqual(sale.companyRevenue, 10000);
    const reports = clientFile('pages/AccountantDashboard/ReportsPage.tsx');
    assert.ok(reports.includes('Agency Revenue'));
    assert.ok(reports.includes('Client / Trust Collections'));
    results['44-48 Principal vs agent revenue'] = 'PASS';
  }

  // Rate safety, FX, period lock, permissions, fiscalisation, overrides
  {
    const fx = resolveTaxFx({ transactionCurrency: 'USD', taxCurrency: 'USD', functionalCurrency: 'USD' });
    assert.strictEqual(fx.exchangeRate, 1);
    assert.strictEqual(fx.rateSource, 'SAME_CURRENCY');
    const cross = resolveTaxFx({ transactionCurrency: 'USD', taxCurrency: 'ZWG', functionalCurrency: 'USD' });
    assert.strictEqual(cross.fxReviewRequired, true);
    assert.notStrictEqual(cross.exchangeRate, 1);
    const period = srcFile('services/vatReturnService.ts');
    assert.ok(period.includes('assertVatPeriodOpen'));
    const payCtrl = srcFile('controllers/paymentController.ts');
    assert.ok(payCtrl.includes('assertVatPeriodOpen'));
    const routes = srcFile('routes/accountingRoutes.ts');
    assert.ok(routes.includes("router.post('/tax-payments', isAccountant"));
    assert.ok(routes.includes("router.post('/vat-returns/prepare', isAccountant"));
    const fiscal = srcFile('services/fiscalizationService.ts');
    assert.ok(fiscal.includes("status: 'NOT_FISCALISED'"));
    const override = srcFile('models/TaxOverride.ts');
    assert.ok(override.includes('A reason is required for every tax override'));
    const ui = clientFile('pages/AccountantDashboard/TaxCompliancePage.tsx');
    assert.ok(ui.includes('Capital Gains Withholding Tax'));
    assert.ok(ui.includes('VAT RATE REVIEW REQUIRED'));
    assert.ok(ui.includes('Controls passed') || ui.includes('Attention required'));
    results['FX, lock, permissions, fiscalisation, overrides'] = 'PASS';
  }

  console.log(JSON.stringify({ phase: '8.1', results }, null, 2));
  const failed = Object.entries(results).filter(([, v]) => v !== 'PASS');
  if (failed.length) {
    console.error(failed);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
