import assert from 'assert';
import { OwnerStatementBuilder } from '../builders';
import { ExportEngine } from '../exports';
import { CanonicalLedgerEntry, LedgerQuery } from '../ledger';
import { ReportingReadModels } from '../readModels';

const companyId = 'company-1';
const propertyId = 'property-1';
const currency = 'USD';

const entry = (input: Partial<CanonicalLedgerEntry> & Pick<CanonicalLedgerEntry, 'entryId' | 'eventType' | 'debit' | 'credit' | 'effectiveDate'>): CanonicalLedgerEntry => ({
  sourceSystem: 'property_account',
  sourceModel: 'PropertyAccount.transactions',
  sourceId: input.entryId,
  companyId,
  propertyId,
  direction: input.debit > 0 ? 'debit' : 'credit',
  amount: input.debit > 0 ? input.debit : input.credit,
  currency,
  status: 'completed',
  ...input
});

const ledgerEntries: CanonicalLedgerEntry[] = [
  entry({
    entryId: 'rent-1',
    eventType: 'RENT',
    debit: 0,
    credit: 1000,
    effectiveDate: new Date('2026-08-01T00:00:00.000Z'),
    metadata: { description: 'Rent received', referenceNumber: 'R-1' }
  }),
  entry({
    entryId: 'maintenance-1',
    eventType: 'MAINTENANCE',
    debit: 100,
    credit: 0,
    effectiveDate: new Date('2026-08-05T00:00:00.000Z'),
    metadata: { description: 'Maintenance repair', referenceNumber: 'M-1' }
  }),
  entry({
    entryId: 'payout-1',
    eventType: 'OWNER_PAYOUT',
    debit: 600,
    credit: 0,
    effectiveDate: new Date('2026-08-10T00:00:00.000Z'),
    metadata: { description: 'Owner payout', referenceNumber: 'P-1' }
  })
];

const readModels: ReportingReadModels = {
  owner: {
    async getOwnerForProperty() {
      return { id: 'owner-1', displayName: 'Owner One' };
    }
  },
  property: {
    async getProperty() {
      return { id: propertyId, name: 'Test Property', address: '1 Test Road' };
    }
  },
  ledger: {
    async getLedgerEntries(_query: LedgerQuery) {
      return ledgerEntries;
    }
  },
  payment: {
    async getPaymentTraceReferences() {
      return {};
    },
    async getPropertyCommissionSnapshots() {
      return [];
    }
  },
  lease: {
    async getLeaseContext() {
      return { monthlyRent: 1000, nextDueDate: '2026-09-01' };
    }
  },
  maintenance: {
    async getMaintenanceContext() {
      return { notes: ['Repair completed.'] };
    }
  },
  inspection: {
    async getInspectionContext() {
      return { notes: ['No inspection issues.'] };
    }
  },
  trust: {
    async getTrustContext() {
      return undefined;
    }
  }
};

export async function runReportingReconciliationTests(): Promise<void> {
  const builder = new OwnerStatementBuilder(readModels);
  const dto = await builder.build({
    companyId,
    propertyId,
    ledgerType: 'rental',
    companyName: 'Mantis Test',
    generatedBy: 'tester',
    period: {
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      label: '2026-08'
    }
  });

  assert.strictEqual(dto.executiveSummary.totalFundsReceived.amount, 1000, 'Executive summary funds received should equal ledger credits.');
  assert.strictEqual(dto.executiveSummary.totalDeductions.amount, 100, 'Executive summary deductions should equal non-payout ledger debits.');
  assert.strictEqual(dto.executiveSummary.ownerPaid.amount, 600, 'Owner paid should equal owner payout ledger debits.');
  assert.strictEqual(dto.executiveSummary.closingTrustBalance.amount, 300, 'Closing balance should equal credits less all debits.');
  assert.strictEqual(dto.cashFlow.closingBalance.amount, dto.executiveSummary.closingTrustBalance.amount, 'Cash flow and summary closing balance should match.');
  assert.strictEqual(dto.trustPosition.closingBalanceHeld.amount, dto.executiveSummary.closingTrustBalance.amount, 'Trust position must reconcile to summary closing balance.');
  assert.strictEqual(dto.trustLedger[dto.trustLedger.length - 1].runningBalance.amount, dto.executiveSummary.closingTrustBalance.amount, 'Final running balance must match closing balance.');
  assert.strictEqual(dto.reconciliation.status, 'passed', 'Report reconciliation should pass for balanced fixture.');

  const exportEngine = new ExportEngine();
  const json = await exportEngine.exportOwnerStatement(dto, 'json');
  const exportedDto = JSON.parse(json.buffer.toString('utf8'));
  assert.strictEqual(exportedDto.executiveSummary.closingTrustBalance.amount, dto.executiveSummary.closingTrustBalance.amount, 'JSON export totals must match DTO totals.');

  const csv = await exportEngine.exportOwnerStatement(dto, 'csv');
  assert.ok(csv.buffer.toString('utf8').includes('Balance'), 'CSV export should contain ledger balance column.');
  assert.ok(csv.buffer.toString('utf8').includes('Rent Amount'), 'CSV export should contain rent amount column.');
  assert.ok(!csv.buffer.toString('utf8').includes('Status'), 'Printed statement CSV should not include a status column.');

  const excel = await exportEngine.exportOwnerStatement(dto, 'excel');
  assert.ok(excel.buffer.toString('utf8').includes('Executive Summary'), 'Excel export should contain summary worksheet.');

  const pdf = await exportEngine.exportOwnerStatement(dto, 'pdf');
  const { PDFDocument } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.load(pdf.buffer);
  const { width, height } = pdfDoc.getPage(0).getSize();
  assert.ok(Math.abs(width - 841.89) < 1 && Math.abs(height - 595.28) < 1, `PDF page should be A4 landscape, got ${width} x ${height}`);
  assert.ok(pdfDoc.getPageCount() >= 1, 'PDF should contain the statement page.');

  const longDto = {
    ...dto,
    trustLedger: Array.from({ length: 40 }, () => dto.trustLedger).flat()
  };
  const longPdf = await exportEngine.exportOwnerStatement(longDto, 'pdf');
  const longDoc = await PDFDocument.load(longPdf.buffer);
  assert.ok(longDoc.getPageCount() > 1, `A long statement should continue onto another A4 page, got ${longDoc.getPageCount()}`);
  const longSize = longDoc.getPage(1).getSize();
  assert.ok(Math.abs(longSize.width - 841.89) < 1 && Math.abs(longSize.height - 595.28) < 1, 'Continuation pages should stay A4 landscape.');
}

