/**
 * Phase 3 owner-money waterfall. Uses the statement builder and the same DTO
 * for the text and CSV exports. Does not open a database or rewrite history.
 */
import assert from 'assert';
import { OwnerStatementBuilder } from '../reporting/builders';
import { ExportEngine } from '../reporting/exports';
import { TemplateEngine } from '../reporting/templates';
import { CanonicalLedgerEntry } from '../reporting/ledger';
import { PaymentCommissionSnapshot, ReportingReadModels } from '../reporting/readModels';
import { explainOwnerWaterfall } from '../reporting/ownerWaterfall';

const companyId = 'company-phase3';
const propertyId = 'property-phase3';

const readModels = (entries: CanonicalLedgerEntry[], snapshots: PaymentCommissionSnapshot[]): ReportingReadModels => ({
  owner: { async getOwnerForProperty() { return { id: 'owner-1', displayName: 'Owner' }; } },
  property: { async getProperty() { return { id: propertyId, name: 'Example House', address: 'Harare' }; } },
  ledger: { async getLedgerEntries() { return entries; } },
  payment: {
    async getPaymentTraceReferences() { return {}; },
    async getPropertyCommissionSnapshots() { return snapshots; }
  },
  lease: { async getLeaseContext() { return undefined; } },
  maintenance: { async getMaintenanceContext() { return { notes: [] }; } },
  inspection: { async getInspectionContext() { return { notes: [] }; } },
  trust: { async getTrustContext() { return undefined; } }
});

const income = (paymentId: string, credit: number): CanonicalLedgerEntry => ({
  entryId: `income-${paymentId}`,
  sourceSystem: 'property_account',
  sourceModel: 'PropertyAccount.transactions',
  sourceId: paymentId,
  companyId,
  propertyId,
  eventType: 'RENT',
  direction: 'credit',
  amount: credit,
  debit: 0,
  credit,
  currency: 'USD',
  status: 'completed',
  effectiveDate: new Date('2026-10-01T00:00:00.000Z'),
  metadata: { paymentId, referenceNumber: 'P3-1000' }
});

async function main() {
  const levyCase = explainOwnerWaterfall({
    grossAmount: 1000,
    commissionAmount: 100,
    levyAmount: 100,
    vatOnCommission: 15.5,
    vatRate: 0.155,
    recordedOwnerAmount: 784.5
  });
  assert.strictEqual(levyCase.netOwnerAmount, 784.5);
  assert.strictEqual(levyCase.reviewRequired, false);
  assert.strictEqual(levyCase.vatOnCommission, 15.5);

  const noLevy = explainOwnerWaterfall({
    grossAmount: 1000,
    commissionAmount: 100,
    levyAmount: 0,
    vatOnCommission: 15.5,
    recordedOwnerAmount: 884.5
  });
  assert.strictEqual(noLevy.netOwnerAmount, 884.5);

  const noVat = explainOwnerWaterfall({
    grossAmount: 1000,
    commissionAmount: 100,
    levyAmount: 0,
    vatOnCommission: 0,
    vatRate: 0,
    recordedOwnerAmount: 900
  });
  assert.strictEqual(noVat.vatOnCommission, 0);
  assert.strictEqual(noVat.netOwnerAmount, 900);

  const historical = explainOwnerWaterfall({
    grossAmount: 1000,
    commissionAmount: 100,
    levyAmount: 0,
    vatOnCommission: 15.5,
    vatRate: 0.155,
    recordedOwnerAmount: 884.5
  });
  assert.strictEqual(historical.vatRate, 0.155);
  assert.notStrictEqual(historical.vatOnCommission, 50);

  const mismatch = explainOwnerWaterfall({
    grossAmount: 1000,
    commissionAmount: 100,
    levyAmount: 100,
    vatOnCommission: 15.5,
    recordedOwnerAmount: 684.5
  });
  assert.strictEqual(mismatch.reviewRequired, true);
  assert.strictEqual(mismatch.netOwnerAmount, 784.5);
  assert.strictEqual(mismatch.recordedOwnerAmount, 684.5);

  const snapshot: PaymentCommissionSnapshot = {
    paymentId: 'pay-1',
    paymentDate: new Date('2026-10-01T00:00:00.000Z'),
    referenceNumber: 'P3-1000',
    grossRent: 1000,
    levy: 100,
    commission: 100,
    vatOnCommission: 15.5,
    vatRate: 0.155,
    ownerPayable: 784.5
  };
  const builder = new OwnerStatementBuilder(readModels([income('pay-1', 784.5)], [snapshot]));
  const dto = await builder.build({
    companyId,
    propertyId,
    ledgerType: 'rental',
    period: { startDate: '2026-10-01', endDate: '2026-10-31', label: '2026-10' },
    generatedBy: 'phase3'
  });
  assert.strictEqual(dto.ledger, 'rental');
  assert.strictEqual(dto.ownerMoneyWaterfall?.grossAmount.amount, 1000);
  assert.strictEqual(dto.ownerMoneyWaterfall?.commissionAmount.amount, 100);
  assert.strictEqual(dto.ownerMoneyWaterfall?.levyAmount.amount, 100);
  assert.strictEqual(dto.ownerMoneyWaterfall?.vatOnCommission.amount, 15.5);
  assert.strictEqual(dto.ownerMoneyWaterfall?.netOwnerAmount.amount, 784.5);
  assert.strictEqual(dto.ownerMoneyWaterfall?.reviewRequired, false);
  assert.strictEqual(dto.trustLedger[0].paymentId, 'pay-1');
  assert.strictEqual(dto.trustLedger[0].ownerWaterfall?.netOwnerAmount.amount, 784.5);

  const text = new TemplateEngine().renderOwnerStatementText(dto);
  assert.ok(text.includes('1000.00'));
  assert.ok(text.includes('100.00'));
  assert.ok(text.includes('15.50'));
  assert.ok(text.includes('784.50'));
  assert.ok(text.includes('Less VAT on Commission'));

  const csv = (await new ExportEngine().exportOwnerStatement(dto, 'csv')).buffer.toString('utf8');
  assert.ok(csv.includes('1000'));
  assert.ok(csv.includes('15.5'));
  assert.ok(csv.includes('784.5'));

  const sale = await builder.build({
    companyId,
    propertyId,
    ledgerType: 'sale',
    period: { startDate: '2026-10-01', endDate: '2026-10-31', label: '2026-10' }
  });
  assert.strictEqual(sale.ledger, 'sale');

  console.log('Phase 3 accounting trust tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
