import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { exclusiveVatOn } from '../services/tax/vatCalculation';
import { calculateCapitalGain, calculateCapitalGainsWithholding } from '../services/tax/cgtCalculation';
import { allocateRentalReceipt, allocationBalances } from '../services/tax/paymentAllocation';
import { buildAgentReceiptJournal, buildVatPaymentJournal } from '../services/tax/principalAgentJournal';
import { buildSettlementWaterfall } from '../services/tax/settlementWaterfall';
import { GL } from '../services/tax/chartAccounts';
import {
  buildTrustReconciliationReport,
  TRUST_RECON_SCOPE,
  trustReconciliationStatus
} from '../services/tax/trustReconciliation';
import { buildAllowedOrigins, isOriginAllowed } from '../config/corsOrigins';

function srcFile(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', '..', 'src', rel), 'utf8');
}

function clientFile(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', '..', '..', 'client', 'src', rel), 'utf8');
}

async function run(): Promise<void> {
  const results: Record<string, string> = {};

  {
    const vat = exclusiveVatOn(1000, 0.155);
    assert.strictEqual(vat.net, 1000);
    assert.strictEqual(vat.vatAmount, 155);
    assert.strictEqual(vat.gross, 1155);
    results['VAT $1,000 commission × 15.5% = $155'] = 'PASS';
  }

  {
    const TEST_CGT_RATE = 0.2;
    const cgt = calculateCapitalGain({
      salePrice: 200000,
      acquisitionCost: 120000,
      improvementCosts: 20000,
      qualifyingExpenses: 5000,
      cgtRate: TEST_CGT_RATE
    });
    assert.strictEqual(cgt.capitalGain, 55000);
    assert.strictEqual(cgt.cgtAmount, 11000);
    assert.strictEqual(cgt.calculationBasis, 'CAPITAL_GAIN');
    const cgwt = calculateCapitalGainsWithholding({
      saleConsideration: 200000,
      cgwtRate: 0.15,
      applicability: 'APPLICABLE'
    });
    assert.notStrictEqual(cgwt.cgwtAmount, cgt.cgtAmount);
    assert.strictEqual(cgwt.cgwtAmount, 30000);
    const waterfall = buildSettlementWaterfall({
      grossSaleProceeds: 200000,
      cgwt: cgwt.cgwtAmount,
      agencyCommission: 10000,
      vatOnCommission: 1550
    });
    assert.ok(waterfall.steps.some((s) => s.type === 'CAPITAL_GAINS_WITHHOLDING_TAX'));
    assert.ok(!waterfall.steps.some((s) => s.type === 'CAPITAL_GAINS_TAX'));
    results['CGT $55,000 gain × 20% test rate; CGWT independent'] = 'PASS';
  }

  {
    const allocation = allocateRentalReceipt({
      amount: 1050,
      rent: 1000,
      levy: 50,
      commissionBase: 1000,
      commissionNet: 150,
      vatOnCommission: 23.25
    });
    assert.ok(allocationBalances(allocation));
    assert.strictEqual(allocation.commissionBase, 1000);
    assert.strictEqual(allocation.commissionNet, 150);
    assert.strictEqual(allocation.vatOnCommission, 23.25);
    assert.strictEqual(allocation.ownerPayable, 826.75);
    assert.strictEqual(allocation.levyPayable, 50);
    assert.strictEqual(allocation.companyRevenue, 150);
    assert.strictEqual(allocation.trustLiability, 876.75);
    const journal = buildAgentReceiptJournal({
      paymentType: 'rental',
      amount: allocation.grossAmount,
      ownerAmount: allocation.ownerPayable,
      commissionNet: allocation.commissionNet,
      vatAmount: allocation.vatOnCommission,
      levyAmount: allocation.levyPayable
    });
    assert.strictEqual(journal.companyRevenue, 150);
    assert.strictEqual(journal.ownerLiability, 826.75);
    assert.strictEqual(journal.levyLiability, 50);
    assert.ok(journal.lines.some((l) => l.accountCode === GL.TRUST_BANK && l.debit === 1050));
    assert.ok(journal.lines.some((l) => l.accountCode === GL.AGENCY_REVENUE && l.credit === 150));
    assert.ok(journal.lines.some((l) => l.accountCode === GL.VAT_PAYABLE && l.credit === 23.25));
    assert.ok(journal.lines.some((l) => l.accountCode === GL.OWNER_PAYABLE && l.credit === 826.75));
    assert.ok(journal.lines.some((l) => l.accountCode === GL.LEVY_PAYABLE && l.credit === 50));
    assert.ok(!journal.lines.some((l) => l.accountCode === GL.AGENCY_REVENUE && Number(l.credit || 0) === 1050));
    results['Rent $1,000 + levy $50 canonical = GL'] = 'PASS';
  }

  {
    const sale = buildAgentReceiptJournal({
      paymentType: 'sale',
      amount: 200000,
      ownerAmount: 188450,
      commissionNet: 10000,
      vatAmount: 1550
    });
    assert.ok(sale.lines.some((l) => l.accountCode === GL.TRUST_BANK && l.debit === 200000));
    assert.ok(sale.lines.some((l) => l.accountCode === GL.SALES_COMMISSION_REVENUE && l.credit === 10000));
    assert.ok(sale.lines.some((l) => l.accountCode === GL.SELLER_PAYABLE && l.credit === 188450));
    assert.ok(!sale.lines.some((l) => l.accountCode === GL.SALES_COMMISSION_REVENUE && Number(l.credit || 0) === 200000));
    results['Sale proceeds remain trust; company revenue is fee'] = 'PASS';
  }

  {
    assert.strictEqual(GL.TRUST_BANK, '1003');
    assert.strictEqual(GL.OWNER_PAYABLE, '2103');
    assert.strictEqual(GL.SELLER_PAYABLE, '2104');
    assert.strictEqual(GL.ZIMRA_WITHHOLDING, '2105');
    assert.strictEqual(GL.TENANT_DEPOSITS, '2106');
    assert.strictEqual(GL.LEVY_PAYABLE, '2107');
    const balanced = buildTrustReconciliationReport({
      trustBank: 1000,
      ownerPayable: 400,
      sellerPayable: 300,
      zimraWithholding: 100,
      tenantDeposits: 150,
      levyPayable: 50
    });
    assert.strictEqual(balanced.scope, 'PARTIAL');
    assert.strictEqual(balanced.scope, TRUST_RECON_SCOPE);
    assert.strictEqual(balanced.difference, 0);
    assert.strictEqual(balanced.status, 'BALANCED_WITHIN_SCOPE');
    assert.notStrictEqual(balanced.status, 'RECONCILED');
    const exception = buildTrustReconciliationReport({
      trustBank: 1000,
      ownerPayable: 400,
      sellerPayable: 300,
      zimraWithholding: 0,
      tenantDeposits: 0,
      levyPayable: 0
    });
    assert.strictEqual(exception.status, 'RECONCILIATION_EXCEPTION');
    assert.strictEqual(trustReconciliationStatus(0), 'BALANCED_WITHIN_SCOPE');
    assert.strictEqual(trustReconciliationStatus(12.5), 'RECONCILIATION_EXCEPTION');
    results['Trust 1003 vs 2103-2107 PARTIAL statuses'] = 'PASS';
  }

  {
    const exact = buildVatPaymentJournal({ amount: 100, allocatedAmount: 100, unallocatedAmount: 0 });
    assert.ok(exact.some((l) => l.accountCode === GL.VAT_PAYABLE && l.debit === 100));
    const partial = buildVatPaymentJournal({ amount: 40, allocatedAmount: 40, unallocatedAmount: 0 });
    assert.ok(partial.some((l) => l.accountCode === GL.VAT_PAYABLE && l.debit === 40));
    const overpay = buildVatPaymentJournal({ amount: 12000, allocatedAmount: 10000, unallocatedAmount: 2000 });
    assert.ok(overpay.some((l) => l.accountCode === GL.VAT_PAYABLE && l.debit === 10000));
    assert.ok(overpay.some((l) => l.accountCode === GL.TAX_PREPAYMENT && l.debit === 2000));
    const zimra = srcFile('services/zimraPaymentService.ts');
    assert.ok(zimra.includes('plus unallocated'));
    assert.ok(zimra.includes('must equal the payment amount'));
    assert.ok(!/attachTaxPaymentReceipt[\s\S]*status:\s*'PAID'/.test(zimra));
    assert.ok(zimra.includes('row.receiptFileName = input.fileName'));
    results['ZIMRA allocation identity + receipt ≠ PAID'] = 'PASS';
  }

  {
    const vatReturn = srcFile('services/vatReturnService.ts');
    assert.ok(vatReturn.includes('TaxObligation.find'));
    assert.ok(vatReturn.includes('obligationOutputVat'));
    assert.ok(vatReturn.includes('glOutputVatForPeriod'));
    assert.ok(vatReturn.includes('GL.VAT_PAYABLE'));
    assert.ok(!vatReturn.includes('VatRecord.vatAmount'));
    results['VAT return from TaxObligation vs GL 2101'] = 'PASS';
  }

  {
    const dash = srcFile('controllers/taxComplianceController.ts');
    assert.ok(dash.includes("scope: 'PARTIAL'"));
    assert.ok(!dash.includes("status: Math.abs(trustDifference) <= 0.005 ? 'RECONCILED'"));
    const ui = clientFile('pages/AccountantDashboard/TaxCompliancePage.tsx');
    assert.ok(ui.includes('TRUST RECONCILIATION SCOPE'));
    assert.ok(ui.includes('BALANCED WITHIN SCOPE'));
    assert.ok(ui.includes('RECONCILIATION EXCEPTION'));
    assert.ok(ui.includes('not a full trust-account reconciliation'));
    assert.ok(ui.includes('Owner rental funds (2103)'));
    assert.ok(ui.includes('Seller proceeds (2104)'));
    assert.ok(ui.includes('Tax withheld (2105)'));
    assert.ok(ui.includes('Tenant deposits (2106)'));
    assert.ok(ui.includes('Levies (2107)'));
    assert.ok(ui.includes('Buyer deposits held only in sales subledgers'));
    assert.ok(ui.includes('Maintenance funds'));
    assert.ok(ui.includes('Unallocated receipts'));
    assert.ok(ui.includes('Other refundable balances'));
    assert.ok(ui.includes('Per-owner historical rental subledgers'));
    assert.ok(ui.includes('External lawyer/escrow/developer custody'));
    assert.ok(ui.includes('NO LIVE VAT OBLIGATIONS'));
    assert.ok(ui.includes('No live Capital Gains Tax obligation'));
    assert.ok(!ui.includes('FULL TRUST ACCOUNT RECONCILIATION'));
    results['Tax Compliance UI PARTIAL + empty VAT labels'] = 'PASS';
  }

  {
    const sellerUi = clientFile('components/trust-accounts/SellerSettlementPanel.tsx');
    assert.ok(sellerUi.includes('LEGACY CGT DEDUCTION'));
    const integrity = srcFile('services/taxIntegrityService.ts');
    assert.ok(integrity.includes('detectionOnly: true'));
    assert.ok(integrity.includes('repaired: false'));
    assert.ok(integrity.includes('LEGACY_CGT_CALCULATION'));
    assert.ok(integrity.includes('Never repairs') || integrity.includes('detection only') || integrity.includes('Detection only'));
    const settings = clientFile('pages/AccountantDashboard/SettingsPage.tsx');
    assert.ok(settings.includes('VAT NOT ACTIVE'));
    results['Legacy CGT label + no auto historical repair'] = 'PASS';
  }

  {
    const fiscal = srcFile('services/fiscalizationService.ts');
    assert.ok(fiscal.includes("status: 'NOT_FISCALISED'"));
    const invoiceUi = clientFile('components/InvoicePrint.tsx');
    assert.ok(invoiceUi.includes('TAX INVOICE — NOT FISCALISED'));
    results['Fiscalisation NOT_FISCALISED (FDMS not claimed)'] = 'PASS';
  }

  {
    const routes = srcFile('routes/accountingRoutes.ts');
    assert.ok(routes.includes("router.post('/tax-integrity/run', isAccountant, runCompanyTaxIntegrity)"));
    assert.ok(routes.includes("router.get('/tax-compliance', canViewCommissions, getTaxComplianceDashboard)"));
    const roles = srcFile('middleware/roles.ts');
    assert.ok(roles.includes("throw new AppError('Authentication required', 401)"));
    assert.ok(roles.includes("throw new AppError('Access denied. Accountant role required.', 403)"));
    const integration = srcFile('services/accountingIntegrationService.ts');
    assert.ok(integration.includes('allocateRentalReceipt'));
    const calculator = srcFile('services/propertyCommissionCalculator.ts');
    assert.ok(calculator.includes('allocateRentalReceipt'));
    results['Authz + canonical allocation used by GL path'] = 'PASS';
  }

  {
    const dev = buildAllowedOrigins({ NODE_ENV: 'development', CLIENT_URL: 'http://localhost:3000' } as NodeJS.ProcessEnv);
    assert.ok(dev.includes('http://localhost:3000'));
    assert.ok(!dev.includes('*'));
    assert.strictEqual(isOriginAllowed('http://localhost:3000', dev), true);
    assert.strictEqual(isOriginAllowed('https://evil.example', dev), false);
    const corsSrc = srcFile('index.ts');
    assert.ok(!corsSrc.includes("origin: '*'"));
    assert.ok(corsSrc.includes('isOriginAllowed'));
    assert.ok(corsSrc.includes("phase: '9'") || corsSrc.includes("phase: '8.2'"));
    results['CORS allowlist (no *) + Phase 8.2 boot marker'] = 'PASS';
  }

  console.log(JSON.stringify({ phase: '8.3', results }, null, 2));
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
