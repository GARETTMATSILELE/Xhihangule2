'use strict';
const fs = require('fs');
const path = require('path');

const a = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'phase-5a', 'scan-raw.json'), 'utf8'));
const b = JSON.parse(fs.readFileSync(path.join(__dirname, 'scan-raw.json'), 'utf8'));

function invMap(inv) {
  const m = {};
  for (const row of inv || []) m[row.name] = row.count;
  return m;
}
function idxSig(indexes) {
  if (!indexes) return [];
  return indexes.map((i) => i.name + ':' + JSON.stringify(i.key || i.error || i)).sort();
}

const aMain = invMap(a.inventory.main);
const bMain = invMap(b.inventory.main);
const aAcct = invMap(a.inventory.accounting);
const bAcct = invMap(b.inventory.accounting);

const collectionDelta = [];
const names = new Set([...Object.keys(aMain), ...Object.keys(bMain), ...Object.keys(aAcct), ...Object.keys(bAcct)]);
for (const n of [...names].sort()) {
  const av = (aMain[n] != null ? aMain[n] : aAcct[n]);
  const bv = (bMain[n] != null ? bMain[n] : bAcct[n]);
  if (av !== bv) collectionDelta.push({ name: n, phase5a: av, phase5b5: bv, delta: (bv || 0) - (av || 0) });
}

const metrics = {
  payments: [a.counts.payments, b.counts.payments],
  propertyAccounts: [a.counts.propertyAccounts, b.counts.propertyAccounts],
  companyAccounts: [a.counts.companyAccounts, b.counts.companyAccounts],
  agentAccounts: [a.counts.agentAccounts, b.counts.agentAccounts],
  journalEntries: [a.counts.journalEntries, b.counts.journalEntries],
  trustTransactions: [a.counts.trustTransactions, b.counts.trustTransactions],
  ledgerEvents: [a.counts.ledgerEvents, b.counts.ledgerEvents],
  pendingLedgerEvents: [a.parts.ledgerEvents.byStatus.pending, b.parts.ledgerEvents.byStatus.pending],
  processingLedgerEvents: [a.parts.ledgerEvents.byStatus.processing || 0, b.parts.ledgerEvents.byStatus.processing || 0],
  balanceMismatches: [a.parts.balances.mismatches.length, b.parts.balances.mismatches.length],
  reversedSaleCount: [a.parts.reversals.count, b.parts.reversals.count],
  reversedLeftovers: [
    (a.parts.reversals.rows || []).filter((r) => r.incomeCompleted || r.companyActive || r.agentNoPenalty).length,
    (b.parts.reversals.rows || []).filter((r) => r.incomeCompleted || r.companyActive || r.agentNoPenalty).length
  ],
  missingOwnerIncome: [a.exposure.USD.missingOwnerIncome, b.exposure.USD.missingOwnerIncome],
  missingAgentCommission: [a.exposure.USD.missingAgentCommission, b.exposure.USD.missingAgentCommission],
  levyGaps: [a.parts.levy.gaps.length, b.parts.levy.gaps.length],
  findings: [a.counts.findings, b.counts.findings],
  score: [a.score.value, b.score.value]
};

// index compare
const idxNames = new Set([
  ...Object.keys(a.inventory.indexes || {}),
  ...Object.keys(b.inventory.indexes || {})
]);
const indexDelta = [];
for (const n of idxNames) {
  const as = JSON.stringify(idxSig(a.inventory.indexes[n]));
  const bs = JSON.stringify(idxSig(b.inventory.indexes[n]));
  if (as !== bs) indexDelta.push({ collection: n, phase5a: idxSig(a.inventory.indexes[n]), phase5b5: idxSig(b.inventory.indexes[n]) });
}

const leftoverA = (a.parts.reversals.rows || []).filter((r) => r.incomeCompleted);
const leftoverB = (b.parts.reversals.rows || []).filter((r) => r.incomeCompleted);

const out = {
  environment5b5: b.environment,
  metrics,
  collectionDelta,
  indexDelta,
  leftoverIncomePaymentIds: {
    phase5a: leftoverA.map((r) => r.paymentId),
    phase5b5: leftoverB.map((r) => r.paymentId)
  },
  pendingEventCount: {
    phase5a: (a.parts.ledgerEvents.pending || a.parts.pending || []).length,
    byStatusA: a.parts.ledgerEvents.byStatus,
    byStatusB: b.parts.ledgerEvents.byStatus
  }
};

fs.writeFileSync(path.join(__dirname, 'compare-summary.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
