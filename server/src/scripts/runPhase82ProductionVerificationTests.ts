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

async function run(): Promise<void> {
  const results: Record<string, string> = {};

  {
    const vat = exclusiveVatOn(1000, 0.155);
    assert.strictEqual(vat.vatAmount, 155);
    results['VAT 15.5% on $1,000 commission'] = 'PASS';
  }

  {
    const cgt = calculateCapitalGain({
      salePrice: 200000,
      acquisitionCost: 120000,
      improvementCosts: 20000,
      qualifyingExpenses: 5000,
      cgtRate: 0.2
    });
    assert.strictEqual(cgt.capitalGain, 55000);
    assert.strictEqual(cgt.cgtAmount, 11000);
    assert.strictEqual(cgt.salePrice, 200000);
    assert.strictEqual(cgt.acquisitionCost, 120000);
    assert.strictEqual(cgt.improvementCosts, 20000);
    assert.strictEqual(cgt.qualifyingExpenses, 5000);
    assert.strictEqual(cgt.calculationBasis, 'CAPITAL_GAIN');
    assert.strictEqual(cgt.isFinal, true);
    results['CGT snapshot $55,000 gain'] = 'PASS';
  }

  {
    const cgwt = calculateCapitalGainsWithholding({
      saleConsideration: 200000,
      cgwtRate: 0.15,
      applicability: 'APPLICABLE'
    });
    const waterfall = buildSettlementWaterfall({
      grossSaleProceeds: 200000,
      cgwt: cgwt.cgwtAmount,
      agencyCommission: 10000,
      vatOnCommission: 1550
    });
    assert.ok(waterfall.steps.some((s) => s.type === 'CAPITAL_GAINS_WITHHOLDING_TAX'));
    assert.ok(!waterfall.steps.some((s) => s.type === 'CAPITAL_GAINS_TAX'));
    results['CGWT withheld independently of CGT'] = 'PASS';
  }

  {
    const allocation = allocateRentalReceipt({
      amount: 1050,
      rent: 1000,
      levy: 50,
      commissionNet: 142.5,
      vatOnCommission: 22.09
    });
    assert.ok(allocationBalances(allocation));
    assert.strictEqual(allocation.levyPayable, 50);
    assert.strictEqual(allocation.ownerPayable, 835.41);
    assert.strictEqual(allocation.trustLiability, 885.41);
    const journal = buildAgentReceiptJournal({
      paymentType: 'rental',
      amount: allocation.grossAmount,
      ownerAmount: allocation.ownerPayable,
      commissionNet: allocation.commissionNet,
      vatAmount: allocation.vatOnCommission,
      levyAmount: allocation.levyPayable
    });
    assert.strictEqual(journal.levyLiability, 50);
    assert.strictEqual(journal.ownerLiability, 835.41);
    assert.ok(journal.lines.some((l) => l.accountCode === GL.LEVY_PAYABLE && l.credit === 50));
    results['Rent + levy canonical allocation'] = 'PASS';
  }

  {
    const overpay = buildVatPaymentJournal({ amount: 12000, allocatedAmount: 10000, unallocatedAmount: 2000 });
    assert.ok(overpay.some((l) => l.accountCode === GL.VAT_PAYABLE && l.debit === 10000));
    assert.ok(overpay.some((l) => l.accountCode === GL.TAX_PREPAYMENT && l.debit === 2000));
    results['ZIMRA overpayment unallocated'] = 'PASS';
  }

  {
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
    const exception = buildTrustReconciliationReport({
      trustBank: 1000,
      ownerPayable: 400,
      sellerPayable: 300,
      zimraWithholding: 0,
      tenantDeposits: 0,
      levyPayable: 0
    });
    assert.strictEqual(exception.status, 'RECONCILIATION_EXCEPTION');
    assert.strictEqual(trustReconciliationStatus(12.5), 'RECONCILIATION_EXCEPTION');
    assert.ok(balanced.excludedClientMoney.some((row) => /Buyer deposits/i.test(row)));
    results['Trust recon PARTIAL statuses'] = 'PASS';
  }

  {
    const dev = buildAllowedOrigins({ NODE_ENV: 'development', CLIENT_URL: 'http://localhost:3000' } as NodeJS.ProcessEnv);
    assert.ok(dev.includes('http://localhost:3000'));
    assert.ok(dev.includes('http://127.0.0.1:3000'));
    assert.ok(dev.includes('http://localhost:5000'));
    assert.ok(!dev.includes('*'));
    assert.strictEqual(isOriginAllowed('http://localhost:3000', dev), true);
    assert.strictEqual(isOriginAllowed('http://localhost:5000', dev), true);
    assert.strictEqual(isOriginAllowed('https://evil.example', dev), false);
    const prod = buildAllowedOrigins({ NODE_ENV: 'production', CLIENT_URL: 'https://mantisafrica.com' } as NodeJS.ProcessEnv);
    assert.ok(!prod.includes('http://localhost:5000'));
    const corsSrc = srcFile('index.ts');
    assert.ok(!corsSrc.includes("origin: '*'"));
    assert.ok(corsSrc.includes('isOriginAllowed'));
    results['CORS allowlist (no *)'] = 'PASS';
  }

  {
    const integrity = srcFile('services/taxIntegrityService.ts');
    assert.ok(integrity.includes('detectionOnly: true'));
    assert.ok(integrity.includes('repaired: false'));
    assert.ok(integrity.includes('recommendedAction'));
    assert.ok(integrity.includes("'INFO' | 'WARNING' | 'HIGH' | 'CRITICAL'"));
    assert.ok(integrity.includes('TRUST_SHORTFALL'));
    assert.ok(integrity.includes('TRUST_SURPLUS'));
    assert.ok(integrity.includes('LEGACY_CGT_CALCULATION'));
    assert.ok(!integrity.includes('automatically repair') || integrity.includes('Never repairs'));
    const note = srcFile('services/taxIntegrityService.ts');
    assert.ok(note.includes('intentionally different'));
    results['Integrity detection-only + GL 4001 note'] = 'PASS';
  }

  {
    const dash = srcFile('controllers/taxComplianceController.ts');
    assert.ok(dash.includes("scope: 'PARTIAL'"));
    assert.ok(dash.includes('excludedClientMoney'));
    assert.ok(!dash.includes("status: Math.abs(trustDifference) <= 0.005 ? 'RECONCILED'"));
    const settlement = srcFile('services/trustMatterService.ts');
    assert.ok(settlement.includes('not ZIMRA remittance'));
    const sellerUi = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', 'client', 'src', 'components', 'trust-accounts', 'SellerSettlementPanel.tsx'),
      'utf8'
    );
    assert.ok(sellerUi.includes('LEGACY CGT DEDUCTION'));
    results['Terminology and PARTIAL trust UI'] = 'PASS';
  }

  console.log(JSON.stringify({ phase: '8.2', results }, null, 2));
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
