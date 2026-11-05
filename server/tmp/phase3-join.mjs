import { readFileSync, writeFileSync } from 'node:fs';

const summary = JSON.parse(readFileSync(new URL('./phase3-summary.json', import.meta.url), 'utf8'));
const dry = JSON.parse(readFileSync(new URL('./phase3-dryrun.json', import.meta.url), 'utf8'));
const stored = new Map(summary.missing.map((item) => [item.paymentId, item]));

function line(lines, code, side) {
  return Math.round(lines.filter((item) => item.accountCode === code).reduce((sum, item) => sum + Number(item[side] || 0), 0) * 100) / 100;
}

const eligible = [];
const inconsistent = [];
const other = [];
for (const row of dry.results) {
  const snap = stored.get(row.paymentId);
  if (row.class !== 'A' || !row.expected) {
    other.push({ ...row, referenceNumber: snap?.referenceNumber || null, company: snap?.company || null, amount: snap?.amount ?? null });
    continue;
  }
  const lines = row.expected.receiptLines;
  const ownerCredit = line(lines, '2103', 'credit') + line(lines, '2104', 'credit');
  const commissionCredit = line(lines, '4001', 'credit') + line(lines, '4002', 'credit');
  const vatCredit = line(lines, '2101', 'credit');
  const levyCredit = line(lines, '2107', 'credit');
  const trustDebit = line(lines, '1003', 'debit');
  const agentDebit = row.expected.commissionJournal.reduce((sum, item) => sum + Number(item.debit || 0), 0);
  const diffs = [];
  const near = (a, b) => Math.abs(a - b) <= 0.02;
  if (!near(trustDebit, snap.amount)) diffs.push('trust');
  if (!near(ownerCredit, snap.owner)) diffs.push('owner');
  if (!near(commissionCredit, snap.commissionNet)) diffs.push('commission');
  if (!near(vatCredit, snap.vat)) diffs.push('vat');
  if (!near(levyCredit, snap.levy)) diffs.push('levy');
  if (!near(agentDebit, snap.agent)) diffs.push('agent');
  if (!near(row.expected.receiptDebit, row.expected.receiptCredit)) diffs.push('balance');
  const entry = {
    paymentId: row.paymentId,
    company: snap.company,
    companyId: snap.companyId,
    referenceNumber: snap.referenceNumber,
    amount: snap.amount,
    owner: snap.owner,
    agent: snap.agent,
    agency: snap.agency,
    prea: snap.prea,
    commissionNet: snap.commissionNet,
    vat: snap.vat,
    levy: snap.levy,
    depositAmount: snap.depositAmount,
    paymentType: snap.paymentType,
    receiptReference: row.expected.receiptReference,
    commissionReference: row.expected.commissionReference,
    receiptLines: row.expected.receiptLines,
    commissionJournal: row.expected.commissionJournal,
    blockers: row.blockers,
    diffs
  };
  if (diffs.length) inconsistent.push(entry);
  else eligible.push(entry);
}

const byCompany = {};
for (const item of eligible) {
  if (!byCompany[item.company]) byCompany[item.company] = { count: 0, amount: 0, owner: 0, agent: 0, agency: 0, prea: 0, vat: 0, levy: 0 };
  const row = byCompany[item.company];
  row.count += 1;
  for (const key of ['amount', 'owner', 'agent', 'agency', 'prea', 'vat', 'levy']) {
    row[key] = Math.round((row[key] + item[key]) * 100) / 100;
  }
}
const sum = (rows, key) => Math.round(rows.reduce((total, item) => total + Number(item[key] || 0), 0) * 100) / 100;
writeFileSync(new URL('./phase3-eligible.json', import.meta.url), JSON.stringify({ eligible, inconsistent, other }, null, 2));
console.log(JSON.stringify({
  dryClasses: dry.classes,
  integrity: dry.integrity,
  original: dry.original,
  eligible: eligible.length,
  inconsistent: inconsistent.length,
  inconsistentDiffs: inconsistent.reduce((acc, item) => { acc[item.diffs.join('+') || 'none'] = (acc[item.diffs.join('+')] || 0) + 1; return acc; }, {}),
  other: other.map((item) => ({ class: item.class, paymentId: item.paymentId, referenceNumber: item.referenceNumber, amount: item.amount, blockers: item.blockers, error: item.error, missing: item.missing, mismatched: item.mismatched })),
  eligibleByCompany: byCompany,
  eligibleTotals: {
    amount: sum(eligible, 'amount'),
    owner: sum(eligible, 'owner'),
    agent: sum(eligible, 'agent'),
    agency: sum(eligible, 'agency'),
    prea: sum(eligible, 'prea'),
    vat: sum(eligible, 'vat'),
    levy: sum(eligible, 'levy')
  }
}, null, 2));
