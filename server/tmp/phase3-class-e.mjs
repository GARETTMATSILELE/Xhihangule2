import { readFileSync } from 'node:fs';
const data = JSON.parse(readFileSync(new URL('./phase3-summary.json', import.meta.url), 'utf8'));
const e = data.missing.filter((item) => item.class === 'E');
const rows = e.map((item) => {
  const commission = item.commissionNet;
  const covered = Math.round((item.owner + commission + item.vat + item.levy) * 100) / 100;
  const split = Math.round((item.agent + item.agency + item.prea) * 100) / 100;
  return {
    paymentId: item.paymentId,
    referenceNumber: item.referenceNumber,
    type: item.paymentType,
    amount: item.amount,
    covered,
    gap: Math.round((item.amount - covered) * 100) / 100,
    split,
    commission,
    splitGap: Math.round((commission - split) * 100) / 100,
    owner: item.owner,
    agent: item.agent,
    agency: item.agency,
    prea: item.prea,
    vat: item.vat,
    levy: item.levy,
    deposit: item.depositAmount
  };
});
const gapCounts = {};
for (const row of rows) gapCounts[String(row.gap)] = (gapCounts[String(row.gap)] || 0) + 1;
console.log(JSON.stringify({ count: rows.length, gapCounts, rows }, null, 2));
