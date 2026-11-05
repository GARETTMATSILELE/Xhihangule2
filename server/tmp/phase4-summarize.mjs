import { readFileSync } from 'node:fs';
const data = JSON.parse(readFileSync(new URL('./phase4-investigation.json', import.meta.url), 'utf8'));
const buckets = { exclusive15: [], exclusive155: [], other: [] };
for (const row of data.variance) {
  const key = row.matchesExclusive15 ? 'exclusive15' : row.matchesExclusive155 ? 'exclusive155' : 'other';
  buckets[key].push({
    paymentId: row.paymentId,
    referenceNumber: row.referenceNumber,
    type: row.paymentType,
    paymentDate: row.paymentDate,
    createdAt: row.createdAt,
    amount: row.amount,
    commission: row.totalCommission,
    commissionNet: row.commissionNet,
    commissionRate: row.commissionRate,
    owner: row.ownerAmount,
    gap: row.gap,
    agent: row.agentShare,
    agency: row.agencyShare,
    prea: row.preaFee,
    vatOnCommission: row.vatOnCommission,
    vatAmount: row.vatAmount,
    vatRate: row.vatRate,
    vatTreatment: row.vatTreatment,
    vatIncluded: row.vatIncluded,
    levy: row.levy,
    propertyName: row.propertyName,
    currentPropertyVatOnCommission: row.currentPropertyVatOnCommission,
    currentPropertyVatTreatment: row.currentPropertyVatTreatment
  });
}
const dates = data.variance.map((row) => String(row.paymentDate || '').slice(0, 10)).sort();
console.log(JSON.stringify({
  dateFirst: dates[0],
  dateLast: dates[dates.length - 1],
  before2026: data.variance.filter((row) => new Date(row.paymentDate) < new Date('2026-01-01')).length,
  from2026: data.variance.filter((row) => new Date(row.paymentDate) >= new Date('2026-01-01')).length,
  beforeCalculatorCommit: data.variance.filter((row) => new Date(row.createdAt) < new Date('2026-09-07')).length,
  vatFieldsZero: data.variance.filter((row) => Number(row.vatOnCommission || 0) === 0 && Number(row.vatAmount || 0) === 0 && (row.vatRate == null)).length,
  taxRates: data.taxRates,
  other: buckets.other,
  exclusive155: buckets.exclusive155,
  exclusive15Count: buckets.exclusive15.length,
  collisions: data.collisions,
  journalOwner: data.journalOwner,
  suffolkJournal: data.suffolkJournal,
  depositSummary: data.depositSummary,
  periodEvents: data.periodEvents
}, null, 2));
