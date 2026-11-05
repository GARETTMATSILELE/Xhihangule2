import { readFileSync } from 'node:fs';
const investigation = JSON.parse(readFileSync(new URL('./phase4-investigation.json', import.meta.url), 'utf8'));
const eligible = JSON.parse(readFileSync(new URL('./phase3-eligible.json', import.meta.url), 'utf8'));
const expected = new Map(eligible.inconsistent.map((item) => [item.paymentId, item]));
const rows = investigation.variance.map((row) => {
  const posted = expected.get(row.paymentId);
  const journalOwner = (posted?.receiptLines || []).filter((line) => line.accountCode === '2103' || line.accountCode === '2104').reduce((sum, line) => sum + line.credit, 0);
  const journalLevy = (posted?.receiptLines || []).filter((line) => line.accountCode === '2107').reduce((sum, line) => sum + line.credit, 0);
  const ownerGap = Math.round((row.ownerAmount - journalOwner) * 100) / 100;
  return {
    paymentId: row.paymentId,
    referenceNumber: row.referenceNumber,
    type: row.paymentType,
    paymentDate: String(row.paymentDate).slice(0, 10),
    createdAt: String(row.createdAt).slice(0, 10),
    amount: row.amount,
    commission: row.totalCommission,
    storedOwner: row.ownerAmount,
    journalOwner,
    ownerGap,
    journalLevy,
    formulaGap: row.gap,
    match15: row.matchesExclusive15,
    property: row.propertyName,
    vatOnCommission: row.vatOnCommission,
    vatRate: row.vatRate
  };
});
const fifteen = rows.filter((row) => row.match15);
const levy = rows.filter((row) => !row.match15 && Math.abs(row.ownerGap - row.journalLevy) <= 0.02 && row.journalLevy > 0);
const rest = rows.filter((row) => !fifteen.includes(row) && !levy.includes(row));
const byYear = {
  fifteenBefore2026: fifteen.filter((row) => row.paymentDate < '2026-01-01').length,
  fifteenFrom2026: fifteen.filter((row) => row.paymentDate >= '2026-01-01').length
};
console.log(JSON.stringify({ counts: { fifteen: fifteen.length, levy: levy.length, rest: rest.length }, byYear, levy, rest, fifteen: fifteen.map((row) => ({ paymentId: row.paymentId, referenceNumber: row.referenceNumber, paymentDate: row.paymentDate, amount: row.amount, commission: row.commission, storedOwner: row.storedOwner, formulaGap: row.formulaGap, property: row.property })) }, null, 2));
