import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { computePropertyAccountTotals, sumPropertyAccountPeriodPnl } from '../services/propertyAccountTotals';
import { classifyLandlordCategory, normalizeLandlordCategory } from '../services/individualAccountingCategories';
import { resolveReportingPeriod } from '../services/individualReportingPeriod';

function srcFile(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', '..', 'src', rel), 'utf8');
}

async function run(): Promise<void> {
  const results: Record<string, string> = {};

  {
    const orch = srcFile('services/paymentAccountingOrchestrator.ts');
    const workspace = srcFile('services/individualWorkspaceService.ts');
    assert.ok(orch.includes('export async function postPaymentAccounting'));
    assert.ok(workspace.includes('individualAccountingService.postEntry'));
    assert.ok(!workspace.includes('account.transactions.push'));
    assert.ok(!workspace.includes('await account.save()'));
    results['Rent orchestrator unchanged; expenses no longer push+save'] = 'PASS';
  }

  {
    const classified = classifyLandlordCategory(normalizeLandlordCategory('TENANT_DEPOSIT', 'LIABILITY'));
    assert.strictEqual(classified.accountingTreatment, 'LIABILITY');
    assert.strictEqual(classified.transactionCategory, 'DEPOSIT');
    assert.notStrictEqual(classified.ledgerType, 'income');
    results['Tenant deposit is liability, not income'] = 'PASS';
  }

  {
    const classified = classifyLandlordCategory('CAPITAL_IMPROVEMENT');
    assert.strictEqual(classified.accountingTreatment, 'CAPITAL');
    assert.strictEqual(classified.deductibility, 'CAPITAL');
    results['Capital improvement is not automatically deductible'] = 'PASS';
  }

  {
    const account = {
      transactions: [
        { type: 'income', amount: 1000, status: 'completed', accountingTreatment: 'PROPERTY_INCOME', date: new Date('2026-09-10') },
        { type: 'other', amount: 500, status: 'completed', accountingTreatment: 'LIABILITY', date: new Date('2026-09-10') },
        { type: 'other', amount: 2000, status: 'completed', accountingTreatment: 'CAPITAL', date: new Date('2026-09-10') },
        { type: 'expense', amount: 100, status: 'completed', accountingTreatment: 'PROPERTY_EXPENSE', date: new Date('2026-09-12') },
        { type: 'income', amount: 800, status: 'completed', accountingTreatment: 'PROPERTY_INCOME', date: new Date('2026-08-01') }
      ]
    };
    const totals = computePropertyAccountTotals(account);
    assert.strictEqual(totals.totalIncome, 1800);
    assert.strictEqual(totals.totalExpenses, 100);
    const september = sumPropertyAccountPeriodPnl(
      account.transactions,
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-10-01T00:00:00.000Z')
    );
    assert.strictEqual(september.income, 1000);
    assert.strictEqual(september.expenses, 100);
    assert.strictEqual(september.net, 900);
    results['P&L excludes deposits and capital; period filter is not lifetime'] = 'PASS';
  }

  {
    const period = resolveReportingPeriod('this_month', new Date(Date.UTC(2026, 8, 17)));
    assert.strictEqual(period.basis, 'this_month');
    assert.ok(period.label.includes('2026'));
    const ytd = resolveReportingPeriod('year_to_date', new Date(Date.UTC(2026, 8, 17)));
    assert.strictEqual(ytd.basis, 'year_to_date');
    assert.ok(ytd.start && ytd.start.getUTCMonth() === 0);
    results['Reporting periods are explicit'] = 'PASS';
  }

  {
    const workspace = srcFile('services/individualWorkspaceService.ts');
    assert.ok(!workspace.includes('annualProfit: netProfit * 12'));
    assert.ok(workspace.includes('annualisedRunRate'));
    assert.ok(workspace.includes('yearToDateProfit'));
    results['annualProfit * 12 removed'] = 'PASS';
  }

  {
    const service = srcFile('services/individualAccountingService.ts');
    assert.ok(service.includes('assertPeriodAllowsPosting'));
    assert.ok(service.includes('AccountingEventLog.create'));
    assert.ok(service.includes('appendManualLedgerTransaction'));
    results['Period gate, audit, and projection writer are used'] = 'PASS';
  }

  {
    const recon = srcFile('services/paymentAccountingReconciliation.ts');
    assert.ok(recon.includes('ensureDepositLedgerFromPayment'));
    results['Payment deposits still use rental deposit ledger'] = 'PASS';
  }

  console.log(JSON.stringify(results, null, 2));
  const failed = Object.values(results).filter((v) => v !== 'PASS');
  if (failed.length) {
    throw new Error('Phase B individual accounting tests failed');
  }
  console.log('Phase B individual accounting tests: ALL PASS');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
