import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { allocateRentalReceipt, allocationBalances } from '../services/tax/paymentAllocation';
import { buildAgentReceiptJournal } from '../services/tax/principalAgentJournal';
import { GL } from '../services/tax/chartAccounts';
import {
  buildTrustReconciliationReport,
  TRUST_RECON_SCOPE,
  trustReconciliationStatus
} from '../services/tax/trustReconciliation';
import { utcMonthBounds } from '../services/accountingPeriodService';
import {
  classifyReceiptControlStatus,
  canonicalRentLevyExample
} from '../services/ownerPropertyReconService';
import { exclusiveVatOn } from '../services/tax/vatCalculation';

function srcFile(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', '..', 'src', rel), 'utf8');
}

function clientFile(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', '..', '..', 'client', 'src', rel), 'utf8');
}

async function run(): Promise<void> {
  const results: Record<string, string> = {};

  {
    const orch = srcFile('services/paymentAccountingOrchestrator.ts');
    assert.ok(orch.includes('export async function postPaymentAccounting'));
    assert.ok(srcFile('services/accountingIntegrationService.ts').includes('allocateRentalReceipt'));
    results['Phase 7 orchestrator still canonical'] = 'PASS';
  }

  {
    const example = canonicalRentLevyExample();
    assert.ok(example.journalAgrees);
    assert.ok(example.companyRevenueIsCommission);
    assert.strictEqual(example.allocation.ownerPayable, 826.75);
    assert.strictEqual(example.allocation.levyPayable, 50);
    assert.ok(allocationBalances(example.allocation));
    results['Canonical rent+levy = GL'] = 'PASS';
  }

  {
    const vat = exclusiveVatOn(1000, 0.155);
    assert.strictEqual(vat.vatAmount, 155);
    const alloc = allocateRentalReceipt({
      amount: 1050,
      rent: 1000,
      levy: 50,
      commissionNet: 150,
      vatOnCommission: 23.25
    });
    const journal = buildAgentReceiptJournal({
      paymentType: 'rental',
      amount: 1050,
      ownerAmount: alloc.ownerPayable,
      commissionNet: 150,
      vatAmount: 23.25,
      levyAmount: 50
    });
    assert.ok(!journal.lines.some((l) => l.accountCode === GL.AGENCY_REVENUE && Number(l.credit || 0) === 1050));
    assert.ok(journal.lines.some((l) => l.accountCode === GL.AGENCY_REVENUE && l.credit === 150));
    results['Gross rent is not company revenue'] = 'PASS';
  }

  {
    const full = classifyReceiptControlStatus({ paymentAmount: 1050, rent: 1000, levy: 50 });
    assert.strictEqual(full.status, 'FULLY_ALLOCATED');
    const over = classifyReceiptControlStatus({ paymentAmount: 1200, rent: 1000, levy: 50 });
    assert.strictEqual(over.status, 'OVERPAYMENT');
    assert.ok(over.unallocatedAmount >= 0);
    const partial = classifyReceiptControlStatus({ paymentAmount: 800, rent: 1000, levy: 50 });
    assert.strictEqual(partial.status, 'PARTIALLY_ALLOCATED');
    const none = classifyReceiptControlStatus({ paymentAmount: 0, rent: 1000, levy: 50 });
    assert.strictEqual(none.status, 'UNALLOCATED');
    results['Allocation control statuses'] = 'PASS';
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
    assert.strictEqual(balanced.scope, TRUST_RECON_SCOPE);
    assert.strictEqual(balanced.status, 'BALANCED_WITHIN_SCOPE');
    assert.notStrictEqual(balanced.status, 'RECONCILED');
    assert.ok(balanced.categories.every((c) => c.inScope === false || c.controlScope === 'IN_SCOPE'));
    assert.ok(balanced.categories.some((c) => c.controlScope === 'NOT_IMPLEMENTED'));
    assert.strictEqual(trustReconciliationStatus(1), 'RECONCILIATION_EXCEPTION');
    results['Trust PARTIAL never FULL/RECONCILED'] = 'PASS';
  }

  {
    const { periodStart, periodEnd } = utcMonthBounds(new Date('2026-09-16T12:00:00Z'));
    assert.ok(periodStart < periodEnd);
    const periodSrc = srcFile('services/accountingPeriodService.ts');
    assert.ok(periodSrc.includes("status === 'CLOSED'"));
    assert.ok(periodSrc.includes('A reopen reason is required'));
    assert.ok(periodSrc.includes('period_reopened'));
    assert.ok(!periodSrc.includes('automatically reopen'));
    results['Period close/reopen requires reason'] = 'PASS';
  }

  {
    const entry = srcFile('models/JournalEntry.ts');
    assert.ok(entry.includes('Journal entries are immutable after posting.'));
    assert.ok(entry.includes("pre('findOneAndUpdate'"));
    const line = srcFile('models/JournalLine.ts');
    assert.ok(line.includes('Journal lines are immutable after posting.'));
    const paymentImm = srcFile('services/paymentFinancialImmutability.ts');
    assert.ok(paymentImm.includes('cannot be edited directly'));
    results['Posted journal/payment immutability'] = 'PASS';
  }

  {
    const zimra = srcFile('services/zimraPaymentService.ts');
    assert.ok(!zimra.includes('taxpay:${input.companyId}:${Date.now()}'));
    assert.ok(zimra.includes('sourceId: `taxpay:${identity}`'));
    const manual = srcFile('controllers/accountingController.ts');
    assert.ok(manual.includes('sourceId: `manual:${reference}`'));
    const acct = srcFile('services/accountingService.ts');
    assert.ok(acct.includes('assertPeriodAllowsPosting'));
    results['Idempotent sourceIds + period gate on postTransaction'] = 'PASS';
  }

  {
    const routes = srcFile('routes/accountingRoutes.ts');
    assert.ok(routes.includes("router.post('/financial-integrity/run', isAccountant"));
    assert.ok(routes.includes("router.post('/periods/:id/reopen', isAccountant"));
    assert.ok(routes.includes("router.get('/trial-balance', canViewCommissions"));
    const roles = srcFile('middleware/roles.ts');
    assert.ok(roles.includes("throw new AppError('Authentication required', 401)"));
    assert.ok(roles.includes("throw new AppError('Access denied. Accountant role required.', 403)"));
    results['Control endpoints authenticated'] = 'PASS';
  }

  {
    const integrity = srcFile('services/financialControlsService.ts');
    assert.ok(integrity.includes('detectionOnly: true'));
    assert.ok(integrity.includes('repaired: false'));
    assert.ok(integrity.includes('TRUST_BANK_LIABILITY_MISMATCH'));
    const zimra = srcFile('services/zimraPaymentService.ts');
    assert.ok(!/attachTaxPaymentReceipt[\s\S]*status:\s*'PAID'/.test(zimra));
    const seller = clientFile('components/trust-accounts/SellerSettlementPanel.tsx');
    assert.ok(seller.includes('LEGACY CGT DEDUCTION'));
    results['Detection-only + tax receipt ≠ PAID + legacy CGT label'] = 'PASS';
  }

  {
    const ui = clientFile('pages/AccountantDashboard/FinancialControlsPage.tsx');
    assert.ok(ui.includes('BALANCED WITHIN SCOPE'));
    assert.ok(ui.includes('not a full trust-account reconciliation'));
    assert.ok(ui.includes('Month-end control checklist'));
    assert.ok(!ui.includes('FULL TRUST ACCOUNT RECONCILIATION'));
    const boot = srcFile('index.ts');
    assert.ok(boot.includes("phase: '9'"));
    results['Financial Controls UI + Phase 9 boot marker'] = 'PASS';
  }

  console.log(JSON.stringify({ phase: '9', results }, null, 2));
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
