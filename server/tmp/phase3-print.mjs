import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync(new URL('./phase3-summary.json', import.meta.url), 'utf8'));
const compactMissing = data.missing.map((item) => ({
  class: item.class,
  reasons: item.reasons,
  paymentId: item.paymentId,
  company: item.company,
  referenceNumber: item.referenceNumber,
  amount: item.amount,
  owner: item.owner,
  agent: item.agent,
  agency: item.agency,
  prea: item.prea,
  commissionNet: item.commissionNet,
  vat: item.vat,
  levy: item.levy,
  period: item.period,
  depositAmount: item.depositAmount,
  paymentType: item.paymentType
}));
console.log(JSON.stringify({
  connection: data.connection,
  totals: data.totals,
  companies: data.companies,
  original: data.original,
  reconciliation: data.reconciliation,
  duplicateRefs: data.duplicateRefs,
  missing: compactMissing
}, null, 2));
