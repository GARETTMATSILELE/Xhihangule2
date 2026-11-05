import { readFileSync } from 'node:fs';
const data = JSON.parse(readFileSync(new URL('./phase4-investigation.json', import.meta.url), 'utf8'));
const rows = data.deposits || [];
const compared = rows.filter((row) => row.depositAmount > 0);
const matched = compared.filter((row) => {
  const paid = row.ledger.filter((item) => item.type !== 'payout').reduce((sum, item) => sum + item.amount, 0);
  return Math.abs(paid - row.depositAmount) <= 0.02;
});
const mismatched = compared.filter((row) => !matched.includes(row)).map((row) => ({
  paymentId: row.paymentId,
  referenceNumber: row.referenceNumber,
  depositAmount: row.depositAmount,
  ledger: row.ledger
}));
console.log(JSON.stringify({
  withDeposit: compared.length,
  ledgerAmountMatches: matched.length,
  mismatched
}, null, 2));
