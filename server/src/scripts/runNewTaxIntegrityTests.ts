import assert from 'assert';
import { assessNewTaxIntegrity } from '../services/tax/newTaxIntegrity';
import { buildTaxPosition } from '../services/tax/taxPosition';

const goLivePayment = {
  id: 'pay-new',
  kind: 'rental',
  status: 'completed',
  amount: 1900,
  paymentDate: '2026-10-13T10:07:58.777Z',
  vatOnCommission: 41.85,
  outputVat: 0,
  taxRate: 0.155,
  propertyId: 'unit-7'
};

const obligation = {
  id: 'obl-new',
  paymentId: 'pay-new',
  taxType: 'VAT_ON_COMMISSION',
  taxAmount: 41.85,
  status: 'PAYABLE',
  createdAt: '2026-10-13T10:08:37.111Z',
  taxPeriod: '2026-10',
  taxRate: 0.155,
  propertyId: 'unit-7'
};

const legacy = assessNewTaxIntegrity({
  sources: [
    goLivePayment,
    {
      id: 'pay-sept',
      kind: 'rental',
      status: 'completed',
      amount: 2000,
      paymentDate: '2026-09-14T13:20:30.391Z',
      vatOnCommission: 41.85,
      outputVat: 0,
      taxRate: 0.155,
      propertyId: 'unit-242'
    },
    {
      id: 'sale-old',
      kind: 'sale',
      status: 'completed',
      amount: 190000,
      paymentDate: '2026-02-23T00:00:00.000Z',
      vatOnCommission: 1274.89,
      outputVat: 25497.84,
      propertyId: 'chimes'
    }
  ],
  obligations: [obligation],
  gl: [
    { sourceId: 'pay-new', debit: 0, credit: 41.85 },
    { sourceId: 'pay-sept', debit: 0, credit: 41.85 },
    { sourceId: 'sale-old', debit: 0, credit: 26772.73 }
  ]
});

assert.strictEqual(legacy.status, 'RECONCILED');
assert.strictEqual(legacy.activeOutstanding, 41.85);
assert.strictEqual(legacy.newGlCreditNormal, 41.85);
assert.strictEqual(legacy.glDifference, 0);
assert.ok(legacy.legacyFindings.some((item) => item.sourceId === 'pay-sept'));
assert.ok(legacy.legacyFindings.some((item) => item.sourceId === 'sale-old'));
assert.ok(!legacy.findings.some((item) => item.code === 'MISSING_OBLIGATION'));

const position = buildTaxPosition({
  obligations: [{
    id: 'obl-new',
    taxType: 'VAT_ON_COMMISSION',
    propertyId: 'unit-7',
    propertyName: 'Unit 7',
    paymentId: 'pay-new',
    taxPeriod: '2026-10',
    taxAmount: 41.85,
    status: 'PAYABLE',
    transactionDate: '2026-10-13T10:07:58.777Z'
  }],
  payments: [{
    id: 'zimra',
    status: 'POSTED',
    amount: 20,
    paymentDate: '2026-10-20T00:00:00.000Z',
    allocations: [{ taxObligationId: 'obl-new', amount: 20, taxType: 'VAT_ON_COMMISSION' }]
  }],
  legacyRecords: [{ id: 'trust', taxType: 'VAT', propertyId: 'chimes', propertyName: 'Chimes', amount: 25497.84 }],
  glBalances: [{ code: '2101', balance: -41.85 }]
});
const commission = position.accounts.find((account) => account.taxType === 'VAT_ON_COMMISSION');
assert.strictEqual(commission?.outstanding, 21.85);
assert.ok(position.discrepancies.some((item) => item.kind === 'LEGACY_TRUST_RECORD_WITHOUT_OBLIGATION'));
assert.strictEqual(legacy.status, 'RECONCILED', 'legacy trust and pre-go-live journals do not fail the new period');

const missing = assessNewTaxIntegrity({
  sources: [
    goLivePayment,
    {
      ...goLivePayment,
      id: 'pay-gap',
      paymentDate: '2026-10-22T13:36:11.477Z',
      vatOnCommission: 41.85
    }
  ],
  obligations: [obligation],
  gl: [
    { sourceId: 'pay-new', debit: 0, credit: 41.85 },
    { sourceId: 'pay-gap', debit: 0, credit: 41.85 }
  ]
});
assert.strictEqual(missing.status, 'RECONCILIATION_REQUIRED');
assert.ok(missing.findings.some((item) => item.code === 'MISSING_OBLIGATION' && item.sourceId === 'pay-gap'));

const reversed = assessNewTaxIntegrity({
  sources: [{
    ...goLivePayment,
    id: 'pay-rev',
    status: 'completed'
  }],
  obligations: [
    { ...obligation, id: 'obl-rev', paymentId: 'pay-rev', status: 'REVERSED' },
    { ...obligation, id: 'obl-mirror', paymentId: 'pay-rev', status: 'REVERSED', reversalOf: 'obl-rev' }
  ],
  gl: [
    { sourceId: 'pay-rev', debit: 0, credit: 41.85 },
    { sourceId: 'pay-rev:reversal', debit: 41.85, credit: 0 }
  ]
});
assert.strictEqual(reversed.status, 'RECONCILED');
assert.strictEqual(reversed.activeOutstanding, 0);
assert.strictEqual(reversed.newGlCreditNormal, 0);

const duplicate = assessNewTaxIntegrity({
  sources: [goLivePayment],
  obligations: [obligation, { ...obligation, id: 'obl-dup' }],
  gl: [{ sourceId: 'pay-new', debit: 0, credit: 41.85 }]
});
assert.ok(duplicate.findings.some((item) => item.code === 'DUPLICATE_OBLIGATION'));
assert.notStrictEqual(duplicate.status, 'RECONCILED');

const isolated = assessNewTaxIntegrity({
  sources: [goLivePayment],
  obligations: [obligation],
  gl: [{ sourceId: 'pay-new', debit: 0, credit: 41.85 }]
});
assert.strictEqual(isolated.eligibleSources, 1);
assert.ok(!isolated.findings.some((item) => item.sourceId === 'other-company'));

console.log('New tax integrity tests passed.');
