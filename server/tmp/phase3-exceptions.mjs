import { readFileSync } from 'node:fs';
const data = JSON.parse(readFileSync(new URL('./phase3-eligible.json', import.meta.url), 'utf8'));
const rows = data.inconsistent
  .map((item) => ({
    paymentId: item.paymentId,
    referenceNumber: item.referenceNumber,
    type: item.paymentType,
    amount: item.amount,
    storedOwner: item.owner,
    journalOwner: item.receiptLines.filter((line) => line.accountCode === '2103' || line.accountCode === '2104').reduce((sum, line) => sum + line.credit, 0),
    commission: item.commissionNet,
    vat: item.vat,
    levy: item.levy,
    agent: item.agent,
    agency: item.agency,
    prea: item.prea
  }))
  .sort((a, b) => b.amount - a.amount);
const total = rows.reduce((sum, item) => sum + item.amount, 0);
console.log(JSON.stringify({ count: rows.length, amount: Math.round(total * 100) / 100, largest: rows.slice(0, 8) }, null, 2));
