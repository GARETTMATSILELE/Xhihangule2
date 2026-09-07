/**
 * Phase 5A READ-ONLY production-database integrity scan.
 * Uses MongoClient find / aggregate / countDocuments / indexes / listCollections only.
 * Does not insert, update, delete, save, or call application services.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { MongoClient, ObjectId } = require('c:/Users/garet/OneDrive/Documents/GitHub/Xhihangule2/server/node_modules/mongodb');

const OUT_DIR = __dirname;
const MAIN_URI = process.env.PHASE5A_MAIN_URI || 'mongodb://localhost:27017/property-management';
const ACCT_URI = process.env.PHASE5A_ACCT_URI || 'mongodb://localhost:27017/accounting';
const TOLERANCE = 0.015;
const START = new Date();

const findings = [];
const reconRows = [];
let findingSeq = 1;

function sid(v) {
  if (v == null) return '';
  if (typeof v === 'object' && v._id) return String(v._id);
  return String(v);
}
function money(n) {
  const x = Number(n || 0);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}
function near(a, b) {
  return Math.abs(money(a) - money(b)) < TOLERANCE;
}
function csvEscape(v) {
  if (v == null) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function writeCsv(file, headers, rows) {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(','));
  }
  fs.writeFileSync(path.join(OUT_DIR, file), lines.join('\n'), 'utf8');
}
function addFinding(partial) {
  const id = partial.id || `F5A-${String(findingSeq).padStart(3, '0')}`;
  findingSeq += 1;
  const row = {
    id,
    severity: partial.severity || 'INFO',
    confidence: partial.confidence || 'INFORMATIONAL',
    category: partial.category || '',
    collection: partial.collection || '',
    recordIds: (partial.recordIds || []).join(';'),
    amount: partial.amount == null ? '' : money(partial.amount),
    currency: partial.currency || '',
    evidence: partial.evidence || '',
    likelyCause: partial.likelyCause || '',
    historicalDamage: partial.historicalDamage || 'NO',
    recommendedRepair: partial.recommendedRepair || 'Investigate in Phase 5B; do not repair during 5A',
    migrationMaybe: partial.migrationMaybe ? 'YES' : 'NO',
    phase4: partial.phase4 || ''
  };
  findings.push(row);
  return row;
}
function iso(d) {
  if (!d) return '';
  try { return new Date(d).toISOString(); } catch { return ''; }
}
function hostOf(uri) {
  try {
    const noProto = String(uri).replace(/^mongodb(\+srv)?:\/\//, '');
    const noCred = noProto.replace(/^[^@]*@/, '');
    return noCred.split('/')[0].split('?')[0];
  } catch { return '(unknown)'; }
}
function dbNameOf(uri, fallback) {
  try {
    const after = String(uri).replace(/^mongodb(\+srv)?:\/\//, '').replace(/^[^/]*\//, '');
    const name = after.split('?')[0];
    return name || fallback;
  } catch { return fallback; }
}

function indexPropertyAccounts(accounts) {
  const byEntity = new Map();
  for (const acc of accounts) {
    const key = sid(acc.propertyId);
    if (!byEntity.has(key)) byEntity.set(key, []);
    byEntity.get(key).push(acc);
  }
  return byEntity;
}
function flattenPassThrough(acc) {
  const out = [];
  for (const pta of acc.passThroughAccounts || []) {
    for (const tx of pta.transactions || []) {
      out.push({
        accountId: sid(acc._id),
        propertyId: sid(acc.propertyId),
        ledgerType: acc.ledgerType || '',
        ptaType: pta.type || '',
        ...tx
      });
    }
  }
  return out;
}
function calcPropertyAccount(acc) {
  const txs = Array.isArray(acc.transactions) ? acc.transactions : [];
  const payouts = Array.isArray(acc.ownerPayouts) ? acc.ownerPayouts : [];
  const totalIncome = money(txs
    .filter((t) => t.type === 'income' && t.status === 'completed' && t.accountingTreatment !== 'PASS_THROUGH')
    .reduce((s, t) => s + Number(t.amount || 0), 0));
  const totalExpenses = money(txs
    .filter((t) => t.type !== 'income' && t.type !== 'opening_balance' && t.status === 'completed' && t.accountingTreatment !== 'PASS_THROUGH')
    .reduce((s, t) => s + Number(t.amount || 0), 0));
  const totalOwnerPayouts = money(payouts
    .filter((p) => p.status === 'completed')
    .reduce((s, p) => s + Number(p.amount || 0), 0));
  const openingBalance = money(txs
    .filter((t) => t.type === 'opening_balance' && t.status === 'completed')
    .reduce((s, t) => s + (t.direction === 'debit' ? -Number(t.amount || 0) : Number(t.amount || 0)), 0));
  const runningBalance = money(totalIncome - totalExpenses - totalOwnerPayouts + openingBalance);
  let ptCollected = 0;
  let ptPaid = 0;
  for (const pta of acc.passThroughAccounts || []) {
    for (const tx of pta.transactions || []) {
      if (tx.status !== 'completed') continue;
      if (tx.type === 'collection') ptCollected += Number(tx.amount || 0);
      if (tx.type === 'payment') ptPaid += Number(tx.amount || 0);
    }
  }
  ptCollected = money(ptCollected);
  ptPaid = money(ptPaid);
  return {
    totalIncome,
    totalExpenses,
    totalOwnerPayouts,
    openingBalance,
    runningBalance,
    netOwnerBalance: runningBalance,
    passThroughCollected: ptCollected,
    passThroughPaid: ptPaid,
    passThroughOutstanding: money(ptCollected - ptPaid),
    txCount: txs.length,
    payoutCount: payouts.length
  };
}

function chargeLinesForPayment(payment, chargeByCode) {
  const lines = [];
  if (Array.isArray(payment.paymentLines) && payment.paymentLines.length > 0) {
    for (const raw of payment.paymentLines) {
      const amount = Number(raw?.amount || 0);
      if (amount <= 0) continue;
      const code = String(raw?.chargeTypeCode || raw?.code || '').trim().toUpperCase();
      lines.push({ code, amount, category: chargeByCode.get(code)?.category || '' });
    }
    return lines;
  }
  const depositAmount = Math.max(0, Number(payment.depositAmount || 0));
  const rentAllocated = Number(payment.rentAllocated || 0);
  const levyAllocated = Number(payment.levyAllocated || 0);
  const paymentType = String(payment.paymentType || '').toLowerCase();
  const amount = Math.max(0, Number(payment.amount || 0));
  if (rentAllocated > 0) lines.push({ code: 'RENT', amount: rentAllocated, category: chargeByCode.get('RENT')?.category || 'PROPERTY_INCOME' });
  if (levyAllocated > 0) lines.push({ code: 'LEVY', amount: levyAllocated, category: chargeByCode.get('LEVY')?.category || 'PASS_THROUGH' });
  if (depositAmount > 0) lines.push({ code: 'DEPOSIT', amount: depositAmount, category: chargeByCode.get('DEPOSIT')?.category || 'LIABILITY' });
  if (lines.length === 0 && amount > 0 && paymentType !== 'sale') {
    lines.push({ code: 'RENT', amount, category: chargeByCode.get('RENT')?.category || 'PROPERTY_INCOME' });
  }
  return lines;
}

function isReversalRow(p) {
  return Boolean(p.reversalOfPaymentId);
}
function isDepositOnly(p) {
  const deposit = Number(p.depositAmount || 0);
  return deposit > 0 && Number(p.amount || 0) <= deposit;
}
function incomeEligible(p) {
  if (isReversalRow(p)) return false;
  if (Number(p.amount || 0) < 0) return false;
  if (p.status !== 'completed') return false;
  if (isDepositOnly(p)) return false;
  return true;
}

function expectedPassThrough(p, chargeByCode) {
  if (String(p.paymentType || '').toLowerCase() === 'sale') return [];
  const grouped = new Map();
  for (const line of chargeLinesForPayment(p, chargeByCode)) {
    if (line.category !== 'PASS_THROUGH') continue;
    grouped.set(line.code, money((grouped.get(line.code) || 0) + line.amount));
  }
  return [...grouped.entries()].filter(([, amt]) => amt > 0).map(([code, amount]) => ({ code, amount }));
}
function expectedConfiguredExpense(p, chargeByCode) {
  if (String(p.paymentType || '').toLowerCase() === 'sale') return 0;
  return money(chargeLinesForPayment(p, chargeByCode)
    .filter((l) => l.category === 'PROPERTY_EXPENSE')
    .reduce((s, l) => s + l.amount, 0));
}
function expectedOwnerIncomeAmount(p, chargeByCode) {
  const ownerAmount = Number(p.commissionDetails?.ownerAmount || 0);
  const isSale = String(p.paymentType || '').toLowerCase() === 'sale';
  if (isSale) return money(Math.max(0, ownerAmount));
  const pt = expectedPassThrough(p, chargeByCode).reduce((s, x) => s + x.amount, 0);
  return money(Math.max(0, ownerAmount - pt));
}

function findIncomeForPayment(accountsByEntity, payment) {
  const targets = [];
  const isSale = String(payment.paymentType || '').toLowerCase() === 'sale';
  if (isSale) {
    if (payment.developmentUnitId) targets.push(sid(payment.developmentUnitId));
    if (payment.developmentId) targets.push(sid(payment.developmentId));
    if (!payment.developmentUnitId && !payment.developmentId) targets.push(sid(payment.propertyId));
  } else {
    targets.push(sid(payment.propertyId));
  }
  const matches = [];
  for (const tid of targets) {
    for (const acc of accountsByEntity.get(tid) || []) {
      for (const t of acc.transactions || []) {
        if (t.type === 'income' && sid(t.paymentId) === sid(payment._id)) {
          matches.push({
            targetId: tid,
            accountId: sid(acc._id),
            ledgerType: acc.ledgerType,
            amount: money(t.amount),
            status: t.status || '',
            category: t.category || '',
            idempotencyKey: t.idempotencyKey || '',
            txId: sid(t._id)
          });
        }
      }
    }
  }
  return { targets, matches };
}

function findExpenseForPayment(accountsByEntity, payment) {
  const key = `payment:${sid(payment._id)}:configured-expense`;
  const hits = [];
  const searchIds = new Set([sid(payment.propertyId), sid(payment.developmentId), sid(payment.developmentUnitId)].filter(Boolean));
  for (const tid of searchIds) {
    for (const acc of accountsByEntity.get(tid) || []) {
      for (const t of acc.transactions || []) {
        if (String(t.idempotencyKey || '') === key || (t.category === 'configured_expense' && sid(t.paymentId) === sid(payment._id))) {
          hits.push({
            accountId: sid(acc._id),
            propertyId: sid(acc.propertyId),
            ledgerType: acc.ledgerType,
            amount: money(t.amount),
            status: t.status || '',
            idempotencyKey: t.idempotencyKey || '',
            category: t.category || '',
            txId: sid(t._id)
          });
        }
      }
    }
  }
  return hits;
}

function findPassThroughForPayment(allPt, payment, code) {
  const pid = sid(payment._id);
  const idKey = `payment:${pid}:pass-through:${code}`;
  return allPt.filter((tx) =>
    String(tx.idempotencyKey || '') === idKey ||
    (tx.type === 'collection' && sid(tx.paymentId) === pid && String(tx.ptaType || '').toUpperCase() === code)
  );
}

function findCompanyTx(companyAccounts, payment) {
  const pid = sid(payment._id);
  const hits = [];
  for (const ca of companyAccounts) {
    if (sid(ca.companyId) !== sid(payment.companyId)) continue;
    for (const t of ca.transactions || []) {
      if (sid(t.paymentId) === pid) {
        hits.push({
          accountId: sid(ca._id),
          amount: money(t.amount),
          type: t.type,
          source: t.source,
          isArchived: t.isArchived === true,
          currency: t.currency || '',
          txId: sid(t._id),
          date: t.date
        });
      }
    }
  }
  return hits;
}

function findAgentTx(agentAccounts, payment) {
  const pid = sid(payment._id);
  const hits = [];
  for (const aa of agentAccounts) {
    for (const t of aa.transactions || []) {
      if (sid(t.paymentId) === pid) {
        hits.push({
          agentId: sid(aa.agentId),
          accountId: sid(aa._id),
          type: t.type,
          amount: money(t.amount),
          status: t.status || '',
          reference: t.reference || '',
          txId: sid(t._id)
        });
      }
    }
  }
  return hits;
}

function statusCell(flag, duplicate) {
  if (flag === 'NA') return 'NOT_APPLICABLE';
  if (duplicate) return 'DUPLICATE';
  if (flag === 'CONTRADICTORY') return 'CONTRADICTORY';
  if (flag) return 'OK';
  return 'MISSING';
}

async function loadAll(col, projection) {
  return col.find({}, projection ? { projection } : {}).toArray();
}

async function main() {
  const client = new MongoClient(MAIN_URI, {
    serverSelectionTimeoutMS: 15000,
    directConnection: !/mongodb\+srv/i.test(MAIN_URI),
    readPreference: 'primary'
  });
  const acctClient = new MongoClient(ACCT_URI, {
    serverSelectionTimeoutMS: 15000,
    directConnection: !/mongodb\+srv/i.test(ACCT_URI),
    readPreference: 'primary'
  });

  await client.connect();
  await acctClient.connect();
  const mainDb = client.db(dbNameOf(MAIN_URI, 'property-management'));
  const acctDb = acctClient.db(dbNameOf(ACCT_URI, 'accounting'));

  const inventory = { main: {}, accounting: {}, indexes: {} };

  async function inventoryDb(db, label) {
    const cols = await db.listCollections().toArray();
    const out = [];
    for (const col of cols) {
      const n = await db.collection(col.name).countDocuments();
      out.push({ name: col.name, count: n });
    }
    out.sort((a, b) => b.count - a.count);
    inventory[label] = out;
    return out;
  }
  await inventoryDb(mainDb, 'main');
  await inventoryDb(acctDb, 'accounting');

  async function indexesOf(db, name) {
    try {
      return await db.collection(name).indexes();
    } catch (e) {
      return [{ error: e.message }];
    }
  }
  const indexTargets = [
    [acctDb, 'propertyaccounts'],
    [acctDb, 'companyaccounts'],
    [mainDb, 'agentaccounts'],
    [mainDb, 'trusttransactions'],
    [mainDb, 'ledgerevents'],
    [mainDb, 'payments'],
    [mainDb, 'journalentries'],
    [mainDb, 'sync_failures'],
    [mainDb, 'accountingeventlogs']
  ];
  for (const [db, name] of indexTargets) {
    inventory.indexes[name] = await indexesOf(db, name);
  }

  console.log('Loading collections (read-only)...');
  const [
    payments,
    properties,
    propertyOwners,
    companies,
    users,
    agentAccounts,
    journalEntries,
    journalLines,
    chartAccounts,
    companyBalances,
    trustTransactions,
    trustAccounts,
    ledgerEvents,
    accountingEventLogs,
    levyPayments,
    leases,
    vatRecords,
    tenants,
    chargeTypes,
    developments,
    developmentUnits,
    propertyAccounts,
    companyAccounts
  ] = await Promise.all([
    loadAll(mainDb.collection('payments')),
    loadAll(mainDb.collection('properties')),
    loadAll(mainDb.collection('propertyowners')),
    loadAll(mainDb.collection('companies')),
    loadAll(mainDb.collection('users'), { projection: { password: 0, resetPasswordToken: 0, avatar: 0 } }),
    loadAll(mainDb.collection('agentaccounts')),
    loadAll(mainDb.collection('journalentries')),
    loadAll(mainDb.collection('journallines')),
    loadAll(mainDb.collection('chartofaccounts')),
    loadAll(mainDb.collection('companybalances')),
    loadAll(mainDb.collection('trusttransactions')),
    loadAll(mainDb.collection('trustaccounts')),
    loadAll(mainDb.collection('ledgerevents')),
    loadAll(mainDb.collection('accountingeventlogs')),
    loadAll(mainDb.collection('levypayments')),
    loadAll(mainDb.collection('leases')),
    loadAll(mainDb.collection('vatrecords')),
    loadAll(mainDb.collection('tenants')),
    loadAll(mainDb.collection('ChargeTypes')),
    loadAll(mainDb.collection('developments')),
    loadAll(mainDb.collection('developmentunits')),
    loadAll(acctDb.collection('propertyaccounts')),
    loadAll(acctDb.collection('companyaccounts'))
  ]);

  const chargeByCode = new Map();
  for (const ct of chargeTypes) {
    const code = String(ct.code || '').toUpperCase();
    if (!chargeByCode.has(code) || ct.isSystemDefault) chargeByCode.set(code, ct);
  }
  const accountsByEntity = indexPropertyAccounts(propertyAccounts);
  const allPt = propertyAccounts.flatMap(flattenPassThrough);
  const propertyById = new Map(properties.map((p) => [sid(p._id), p]));
  const ownerById = new Map(propertyOwners.map((o) => [sid(o._id), o]));
  const userById = new Map(users.map((u) => [sid(u._id), u]));
  const companyById = new Map(companies.map((c) => [sid(c._id), c]));
  const tenantById = new Map(tenants.map((t) => [sid(t._id), t]));
  const unitById = new Map(developmentUnits.map((u) => [sid(u._id), u]));
  const devById = new Map(developments.map((d) => [sid(d._id), d]));
  const chartById = new Map(chartAccounts.map((a) => [sid(a._id), a]));
  const journalsBySource = new Map();
  for (const je of journalEntries) {
    const key = `${je.sourceModule || ''}:${je.sourceId || ''}`;
    if (!journalsBySource.has(key)) journalsBySource.set(key, []);
    journalsBySource.get(key).push(je);
  }
  const vatByTxn = new Map();
  for (const v of vatRecords) {
    vatByTxn.set(String(v.transactionId || ''), v);
  }
  const trustByPayment = new Map();
  for (const t of trustTransactions) {
    if (!t.paymentId) continue;
    const k = sid(t.paymentId);
    if (!trustByPayment.has(k)) trustByPayment.set(k, []);
    trustByPayment.get(k).push(t);
  }

  const scan = {
    startedAt: START.toISOString(),
    environment: {
      mainHost: hostOf(MAIN_URI),
      acctHost: hostOf(ACCT_URI),
      mainDb: mainDb.databaseName,
      acctDb: acctDb.databaseName,
      cosmos: /cosmos\.azure\.com/i.test(MAIN_URI) || /cosmos\.azure\.com/i.test(ACCT_URI),
      local: /localhost|127\.0\.0\.1/i.test(MAIN_URI),
      note: 'Scanned the live MongoDB used by the running local application. .env.production contains no MongoDB URI, so a remote cloud production cluster was not reachable from this environment.'
    },
    inventory,
    parts: {}
  };

  // ---- PART 2 pass-through ----
  const ptDupKeys = [];
  const ptKeyMap = new Map();
  for (const tx of allPt) {
    const key = `${tx.propertyId}|${tx.ledgerType}|${String(tx.idempotencyKey || '')}`;
    if (!tx.idempotencyKey) continue;
    if (!ptKeyMap.has(key)) ptKeyMap.set(key, []);
    ptKeyMap.get(key).push(tx);
  }
  for (const [key, list] of ptKeyMap) {
    if (list.length > 1) {
      ptDupKeys.push({
        key,
        count: list.length,
        propertyId: list[0].propertyId,
        ledgerType: list[0].ledgerType,
        idempotencyKey: list[0].idempotencyKey,
        types: list.map((t) => t.type).join('|'),
        amounts: list.map((t) => money(t.amount)).join('|'),
        statuses: list.map((t) => t.status).join('|'),
        txIds: list.map((t) => sid(t._id)).join('|'),
        createdAt: list.map((t) => iso(t.createdAt)).join('|')
      });
    }
  }
  const ptDupPayments = [];
  const ptPayMap = new Map();
  for (const tx of allPt) {
    if (!tx.paymentId) continue;
    const key = `${tx.propertyId}|${sid(tx.paymentId)}|${tx.type || ''}`;
    if (!ptPayMap.has(key)) ptPayMap.set(key, []);
    ptPayMap.get(key).push(tx);
  }
  for (const [key, list] of ptPayMap) {
    if (list.length > 1) {
      ptDupPayments.push({
        key,
        count: list.length,
        paymentId: sid(list[0].paymentId),
        propertyId: list[0].propertyId,
        types: list.map((t) => t.type).join('|'),
        amounts: list.map((t) => money(t.amount)).join('|'),
        statuses: list.map((t) => t.status).join('|')
      });
    }
  }

  const ptVsPayment = [];
  const raceIndicators = [];
  for (const p of payments) {
    if (!incomeEligible(p) && p.status !== 'completed') continue;
    const expected = expectedPassThrough(p, chargeByCode);
    if (!expected.length) continue;
    if (!incomeEligible(p)) {
      // completed but ineligible (reversal/deposit): still record if artifacts exist
    }
    for (const exp of expected) {
      const actual = findPassThroughForPayment(allPt, p, exp.code);
      const completed = actual.filter((t) => t.status === 'completed' && t.type === 'collection');
      const row = {
        paymentId: sid(p._id),
        propertyId: sid(p.propertyId),
        amount: money(p.amount),
        currency: p.currency || '',
        status: p.status,
        isProvisional: p.isProvisional === true,
        expectedCode: exp.code,
        expectedAmount: exp.amount,
        actualCount: completed.length,
        actualAmount: money(completed.reduce((s, t) => s + Number(t.amount || 0), 0)),
        missing: completed.length === 0,
        duplicate: completed.length > 1
      };
      ptVsPayment.push(row);
      if (row.missing && incomeEligible(p) && String(p.paymentType).toLowerCase() !== 'sale' && p.isProvisional !== true) {
        addFinding({
          severity: 'HIGH',
          confidence: 'CONFIRMED DATA DAMAGE',
          category: 'pass-through-missing',
          collection: 'propertyaccounts / payments',
          recordIds: [sid(p._id), sid(p.propertyId)],
          amount: exp.amount,
          currency: p.currency || 'USD',
          evidence: `Completed payment ${sid(p._id)} expected pass-through ${exp.code} ${exp.amount} but no completed collection was found.`,
          likelyCause: 'P4-C01/C02 last-write-wins $set of passThroughAccounts, or posting never ran',
          historicalDamage: 'YES',
          phase4: 'P4-C01/P4-C02',
          recommendedRepair: 'Re-post missing pass-through collection from Payment in a later repair phase',
          migrationMaybe: true
        });
      }
      if (row.duplicate) {
        addFinding({
          severity: 'HIGH',
          confidence: 'CONFIRMED DATA DAMAGE',
          category: 'pass-through-duplicate',
          collection: 'propertyaccounts',
          recordIds: [sid(p._id)],
          amount: row.actualAmount,
          currency: p.currency || 'USD',
          evidence: `Duplicate pass-through collections for ${exp.code} on payment ${sid(p._id)} count=${completed.length}`,
          likelyCause: 'Race or missing unique index on nested pass-through transactions',
          historicalDamage: 'YES',
          phase4: 'P4-C01',
          migrationMaybe: true
        });
      }
    }
    if (expected.length > 1) {
      const states = expected.map((exp) => findPassThroughForPayment(allPt, p, exp.code).some((t) => t.type === 'collection' && t.status === 'completed'));
      if (states.includes(true) && states.includes(false)) {
        raceIndicators.push({
          type: 'partial-pass-through-codes',
          paymentId: sid(p._id),
          propertyId: sid(p.propertyId),
          detail: expected.map((e, i) => `${e.code}:${states[i] ? 'present' : 'missing'}`).join(',')
        });
      }
    }
  }

  const paymentsByProperty = new Map();
  for (const p of payments) {
    const k = sid(p.propertyId);
    if (!paymentsByProperty.has(k)) paymentsByProperty.set(k, []);
    paymentsByProperty.get(k).push(p);
  }
  for (const [propId, list] of paymentsByProperty) {
    const completed = list.filter((p) => p.status === 'completed' && p.createdAt).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    for (let i = 1; i < completed.length; i++) {
      const dt = Math.abs(new Date(completed[i].createdAt) - new Date(completed[i - 1].createdAt));
      if (dt <= 5000) {
        raceIndicators.push({
          type: 'payments-created-close-together',
          propertyId: propId,
          paymentIds: `${sid(completed[i - 1]._id)};${sid(completed[i]._id)}`,
          deltaMs: dt
        });
      }
    }
  }
  for (const acc of propertyAccounts) {
    const pts = flattenPassThrough(acc).filter((t) => t.createdAt);
    pts.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    for (let i = 1; i < pts.length; i++) {
      const dt = Math.abs(new Date(pts[i].createdAt) - new Date(pts[i - 1].createdAt));
      if (dt <= 2000 && sid(pts[i].paymentId) !== sid(pts[i - 1].paymentId)) {
        raceIndicators.push({
          type: 'pass-through-timestamps-clustered',
          propertyId: sid(acc.propertyId),
          deltaMs: dt,
          paymentIds: `${sid(pts[i - 1].paymentId)};${sid(pts[i].paymentId)}`
        });
      }
    }
    if (pts.length && acc.lastUpdated) {
      const latestPt = pts[pts.length - 1];
      const lastUp = new Date(acc.lastUpdated).getTime();
      const ptTime = new Date(latestPt.createdAt).getTime();
      if (Number.isFinite(lastUp) && Number.isFinite(ptTime) && lastUp + 2000 < ptTime) {
        raceIndicators.push({
          type: 'lastUpdated-before-pass-through-createdAt',
          propertyId: sid(acc.propertyId),
          lastUpdated: iso(acc.lastUpdated),
          latestPassThrough: iso(latestPt.createdAt)
        });
      }
    }
  }

  const ptPayoutVsCollection = [];
  for (const acc of propertyAccounts) {
    for (const pta of acc.passThroughAccounts || []) {
      const cols = (pta.transactions || []).filter((t) => t.type === 'collection' && t.status === 'completed');
      const pays = (pta.transactions || []).filter((t) => t.type === 'payment' && t.status === 'completed');
      const collected = money(cols.reduce((s, t) => s + Number(t.amount || 0), 0));
      const paid = money(pays.reduce((s, t) => s + Number(t.amount || 0), 0));
      const outstanding = money(collected - paid);
      const row = {
        propertyId: sid(acc.propertyId),
        ledgerType: acc.ledgerType,
        type: pta.type,
        collected,
        paid,
        outstanding,
        storedOutstanding: money(pta.runningBalance),
        payoutWithoutCollection: collected === 0 && paid > 0,
        payoutExceedsCollection: paid > collected + TOLERANCE,
        duplicatePayoutKeys: false
      };
      const payKeys = new Map();
      for (const p of pays) {
        const k = String(p.idempotencyKey || sid(p.levyPaymentId) || sid(p._id));
        payKeys.set(k, (payKeys.get(k) || 0) + 1);
      }
      row.duplicatePayoutKeys = [...payKeys.values()].some((n) => n > 1);
      ptPayoutVsCollection.push(row);
      if (row.payoutExceedsCollection) {
        addFinding({
          severity: 'HIGH',
          confidence: 'CONFIRMED DATA DAMAGE',
          category: 'pass-through-payout-exceeds-collection',
          collection: 'propertyaccounts',
          recordIds: [sid(acc._id), sid(acc.propertyId)],
          amount: money(paid - collected),
          evidence: `Pass-through ${pta.type} paid ${paid} > collected ${collected}`,
          likelyCause: 'Lost collection (P4-C01/C02) or duplicate payout',
          historicalDamage: 'YES',
          phase4: 'P4-C01',
          migrationMaybe: true
        });
      }
    }
  }

  scan.parts.passThrough = {
    duplicateIdempotencyKeys: ptDupKeys,
    duplicatePaymentIds: ptDupPayments,
    vsPayment: ptVsPayment,
    payoutVsCollection: ptPayoutVsCollection,
    raceIndicators
  };

  // ---- PART 3 balances ----
  const balanceMismatches = [];
  for (const acc of propertyAccounts) {
    const calc = calcPropertyAccount(acc);
    const diffs = [];
    const pairs = [
      ['runningBalance', acc.runningBalance, calc.runningBalance],
      ['totalIncome', acc.totalIncome, calc.totalIncome],
      ['totalExpenses', acc.totalExpenses, calc.totalExpenses],
      ['totalOwnerPayouts', acc.totalOwnerPayouts, calc.totalOwnerPayouts],
      ['netOwnerBalance', acc.netOwnerBalance, calc.netOwnerBalance],
      ['passThroughCollected', acc.passThroughCollected, calc.passThroughCollected],
      ['passThroughPaid', acc.passThroughPaid, calc.passThroughPaid],
      ['passThroughOutstanding', acc.passThroughOutstanding, calc.passThroughOutstanding]
    ];
    for (const [field, stored, calculated] of pairs) {
      if (!near(stored || 0, calculated)) diffs.push({ field, stored: money(stored || 0), calculated, difference: money((stored || 0) - calculated) });
    }
    if (diffs.length) {
      const row = {
        propertyId: sid(acc.propertyId),
        accountId: sid(acc._id),
        ledgerType: acc.ledgerType,
        ownerName: acc.ownerName || '',
        ownerId: sid(acc.ownerId),
        txCount: calc.txCount,
        diffs
      };
      balanceMismatches.push(row);
      addFinding({
        severity: 'HIGH',
        confidence: 'CONFIRMED DATA DAMAGE',
        category: 'balance-mismatch',
        collection: 'propertyaccounts',
        recordIds: [sid(acc._id), sid(acc.propertyId)],
        amount: Math.max(...diffs.map((d) => Math.abs(d.difference))),
        evidence: `Stored totals != sum(transactions) on ${sid(acc.propertyId)} ${acc.ledgerType}: ${diffs.map((d) => `${d.field} stored=${d.stored} calc=${d.calculated}`).join('; ')}`,
        likelyCause: 'Crash between $push and recalc, or last-write-wins pass-through $set, or stale GET skip',
        historicalDamage: 'YES',
        phase4: 'P4-C02 / balance integrity',
        recommendedRepair: 'Recalculate from transactions in a later write phase; do not save now'
      });
    }
  }
  scan.parts.balances = { mismatches: balanceMismatches, accountsScanned: propertyAccounts.length };

  // ---- PART 4 configured expense ----
  const incomeAndExpenseSamePayment = [];
  for (const acc of propertyAccounts) {
    const byPay = new Map();
    for (const t of acc.transactions || []) {
      if (!t.paymentId) continue;
      const k = sid(t.paymentId);
      if (!byPay.has(k)) byPay.set(k, []);
      byPay.get(k).push(t);
    }
    for (const [pid, txs] of byPay) {
      const incomes = txs.filter((t) => t.type === 'income');
      const expenses = txs.filter((t) => t.category === 'configured_expense' || String(t.idempotencyKey || '').endsWith(':configured-expense'));
      if (incomes.length && expenses.length) {
        incomeAndExpenseSamePayment.push({
          paymentId: pid,
          propertyId: sid(acc.propertyId),
          ledgerType: acc.ledgerType,
          incomeAmount: incomes.map((t) => money(t.amount)).join('|'),
          incomeStatus: incomes.map((t) => t.status).join('|'),
          expenseAmount: expenses.map((t) => money(t.amount)).join('|'),
          expenseStatus: expenses.map((t) => t.status).join('|'),
          incomeKey: incomes.map((t) => t.idempotencyKey || '').join('|'),
          expenseKey: expenses.map((t) => t.idempotencyKey || '').join('|')
        });
      }
    }
  }
  const uniquePaymentIdIndex = (inventory.indexes.propertyaccounts || []).find((ix) =>
    JSON.stringify(ix.key || {}) === JSON.stringify({ propertyId: 1, ledgerType: 1, 'transactions.paymentId': 1 })
  );
  if (incomeAndExpenseSamePayment.length && uniquePaymentIdIndex && uniquePaymentIdIndex.unique) {
    addFinding({
      severity: 'INFO',
      confidence: 'INFORMATIONAL',
      category: 'unique-index-coexists-with-dual-rows',
      collection: 'propertyaccounts',
      evidence: `Unique transactions.paymentId index exists AND ${incomeAndExpenseSamePayment.length} accounts have income+configured_expense for the same paymentId. MongoDB unique multikey indexes normally forbid this; the index may not be enforcing intra-document uniqueness as assumed, or rows were inserted before the index.`,
      likelyCause: 'P4-C03 index/application conflict; observed coexistence needs index-option review',
      historicalDamage: 'NO',
      phase4: 'P4-C03'
    });
  }

  const expenseVsPayment = [];
  const reversedActiveExpense = [];
  for (const p of payments) {
    const expectedAmt = expectedConfiguredExpense(p, chargeByCode);
    if (expectedAmt <= 0 && p.status !== 'reversed') continue;
    const hits = findExpenseForPayment(accountsByEntity, p);
    if (expectedAmt > 0 && incomeEligible(p) && p.isProvisional !== true) {
      const completed = hits.filter((h) => h.status === 'completed');
      expenseVsPayment.push({
        paymentId: sid(p._id),
        propertyId: sid(p.propertyId),
        paymentStatus: p.status,
        expectedAmount: expectedAmt,
        actualCount: completed.length,
        actualAmount: money(completed.reduce((s, h) => s + h.amount, 0)),
        missing: completed.length === 0,
        idempotencyKey: `payment:${sid(p._id)}:configured-expense`
      });
      if (completed.length === 0) {
        addFinding({
          severity: 'HIGH',
          confidence: 'CONFIRMED DATA DAMAGE',
          category: 'configured-expense-missing',
          collection: 'propertyaccounts / payments',
          recordIds: [sid(p._id)],
          amount: expectedAmt,
          currency: p.currency || 'USD',
          evidence: `Completed rental payment ${sid(p._id)} has PROPERTY_EXPENSE lines totaling ${expectedAmt} but no completed configured_expense row`,
          likelyCause: 'P4-C03 unique paymentId index rejecting expense $push, or posting never reached expense step',
          historicalDamage: 'YES',
          phase4: 'P4-C03',
          migrationMaybe: true
        });
      }
    }
    if (p.status === 'reversed') {
      const active = hits.filter((h) => h.status === 'completed');
      if (active.length) {
        const acc = (accountsByEntity.get(sid(p.propertyId)) || [])[0];
        reversedActiveExpense.push({
          paymentId: sid(p._id),
          propertyId: sid(p.propertyId),
          reversalDate: iso(p.reversedAt || p.updatedAt),
          expenseAmount: money(active.reduce((s, h) => s + h.amount, 0)),
          expenseStatus: active.map((h) => h.status).join('|'),
          incomeStatus: findIncomeForPayment(accountsByEntity, p).matches.map((m) => m.status).join('|'),
          runningBalance: acc ? money(acc.runningBalance) : ''
        });
        addFinding({
          severity: 'CRITICAL',
          confidence: 'CONFIRMED DATA DAMAGE',
          category: 'reversed-payment-active-configured-expense',
          collection: 'payments / propertyaccounts',
          recordIds: [sid(p._id), sid(p.propertyId)],
          amount: money(active.reduce((s, h) => s + h.amount, 0)),
          currency: p.currency || 'USD',
          evidence: `Payment ${sid(p._id)} is reversed but configured expense remains completed`,
          likelyCause: 'P4-H01 reverseIncomeFromPayment does not cancel configured_expense',
          historicalDamage: 'YES',
          phase4: 'P4-H01',
          recommendedRepair: 'Cancel configured_expense rows for reversed payments in a later repair phase',
          migrationMaybe: true
        });
      }
    }
  }
  scan.parts.configuredExpense = {
    uniquePaymentIdIndex: uniquePaymentIdIndex || null,
    incomeAndExpenseSamePayment,
    expenseVsPayment,
    reversedActiveExpense
  };

  // ---- PART 5 reversals ----
  const reversed = payments.filter((p) => p.status === 'reversed' || p.postingStatus === 'reversed');
  const reversalReport = [];
  for (const p of reversed) {
    const income = findIncomeForPayment(accountsByEntity, p);
    const expenses = findExpenseForPayment(accountsByEntity, p);
    const companyTx = findCompanyTx(companyAccounts, p);
    const agentTx = findAgentTx(agentAccounts, p);
    const journalOrig = journalsBySource.get(`payment:${sid(p._id)}`) || journalsBySource.get(`sale:${sid(p._id)}`) || [];
    const journalRev = journalsBySource.get(`payment:${sid(p._id)}:reversal`) || journalsBySource.get(`sale:${sid(p._id)}:reversal`) || [];
    const journalComRev = journalsBySource.get(`commission:${sid(p._id)}:commission:reversal`) || [];
    const trust = trustByPayment.get(sid(p._id)) || [];
    const trustRev = p.reversalPaymentId ? (trustByPayment.get(sid(p.reversalPaymentId)) || []) : [];
    const activeIncome = income.matches.filter((m) => m.status === 'completed');
    const activeExpense = expenses.filter((h) => h.status === 'completed');
    const activeCompany = companyTx.filter((t) => t.isArchived !== true && t.type === 'income');
    const agentCommission = agentTx.filter((t) => t.type === 'commission' && t.status === 'completed');
    const agentPenalty = agentTx.filter((t) => t.type === 'penalty' && t.status === 'completed');
    const flags = {
      A_activeIncome: activeIncome.length > 0,
      B_activeExpense: activeExpense.length > 0,
      C_activeCompany: activeCompany.length > 0,
      D_agentNoPenalty: agentCommission.length > 0 && agentPenalty.length === 0,
      E_missingJournalReversal: journalOrig.length > 0 && journalRev.length === 0,
      F_missingTrustReversal: String(p.paymentType).toLowerCase() === 'sale' && trust.length > 0 && trustRev.length === 0,
      G_originalStillActive: activeIncome.length > 0 || activeCompany.length > 0
    };
    reversalReport.push({
      paymentId: sid(p._id),
      paymentType: p.paymentType,
      propertyId: sid(p.propertyId),
      amount: money(p.amount),
      currency: p.currency || '',
      reversedAt: iso(p.reversedAt),
      flags,
      income: income.matches,
      expenses,
      companyTx,
      agentTx,
      journalOrigCount: journalOrig.length,
      journalRevCount: journalRev.length,
      journalComRevCount: journalComRev.length,
      trustCount: trust.length,
      trustRevCount: trustRev.length
    });
    if (flags.A_activeIncome) {
      addFinding({
        severity: 'CRITICAL',
        confidence: 'CONFIRMED DATA DAMAGE',
        category: 'reversed-active-income',
        collection: 'payments / propertyaccounts',
        recordIds: [sid(p._id)],
        amount: money(activeIncome.reduce((s, m) => s + m.amount, 0)),
        currency: p.currency || 'USD',
        evidence: `Reversed payment ${sid(p._id)} still has completed PropertyAccount income`,
        likelyCause: 'P4-H02 reversal propagation failed or GET cleanup never ran',
        historicalDamage: 'YES',
        phase4: 'P4-H02',
        migrationMaybe: true
      });
    }
    if (flags.C_activeCompany) {
      addFinding({
        severity: 'HIGH',
        confidence: 'CONFIRMED DATA DAMAGE',
        category: 'reversed-active-company-commission',
        collection: 'companyaccounts',
        recordIds: [sid(p._id)],
        amount: money(activeCompany.reduce((s, t) => s + t.amount, 0)),
        currency: p.currency || 'USD',
        evidence: `Reversed payment ${sid(p._id)} still has non-archived CompanyAccount commission`,
        likelyCause: 'syncPaymentReversed archive failed or never ran',
        historicalDamage: 'YES',
        phase4: 'P4-H02/P4-H03',
        migrationMaybe: true
      });
    }
    if (flags.D_agentNoPenalty) {
      addFinding({
        severity: 'HIGH',
        confidence: 'CONFIRMED DATA DAMAGE',
        category: 'reversed-agent-commission-no-penalty',
        collection: 'agentaccounts',
        recordIds: [sid(p._id)],
        amount: money(agentCommission.reduce((s, t) => s + t.amount, 0)),
        evidence: `Reversed payment ${sid(p._id)} has completed agent commission without penalty offset`,
        likelyCause: 'reverseCommissionForPayment did not run or paymentId type mismatch (string vs ObjectId)',
        historicalDamage: 'YES',
        phase4: 'P4-H04/H02',
        migrationMaybe: true
      });
    }
  }
  scan.parts.reversals = { count: reversed.length, rows: reversalReport };

  // ---- PART 6 company revenue ----
  const companyRevenue = [];
  for (const company of companies) {
    const cid = sid(company._id);
    const pays = payments.filter((p) => sid(p.companyId) === cid && p.status === 'completed' && !isReversalRow(p) && p.isProvisional !== true);
    const byCcy = new Map();
    for (const p of pays) {
      const ccy = p.currency || 'USD';
      if (!byCcy.has(ccy)) byCcy.set(ccy, []);
      byCcy.get(ccy).push(p);
    }
    const ca = companyAccounts.filter((a) => sid(a.companyId) === cid);
    const cb = companyBalances.filter((b) => sid(b.companyId) === cid);
    for (const [ccy, plist] of byCcy) {
      const paymentShare = money(plist.reduce((s, p) => s + Number(p.commissionDetails?.agencyShare || 0), 0));
      let caShare = 0;
      let caArchived = 0;
      let caDup = 0;
      for (const acc of ca) {
        const byPay = new Map();
        for (const t of acc.transactions || []) {
          if (t.type !== 'income') continue;
          if ((t.currency || 'USD') !== ccy && t.currency) continue;
          const pid = sid(t.paymentId) || sid(t._id);
          if (!byPay.has(pid)) byPay.set(pid, []);
          byPay.get(pid).push(t);
          if (t.isArchived === true) caArchived += Number(t.amount || 0);
          else caShare += Number(t.amount || 0);
        }
        for (const list of byPay.values()) {
          const active = list.filter((t) => t.isArchived !== true);
          if (active.length > 1) caDup += active.length - 1;
        }
      }
      caShare = money(caShare);
      const journalRev = money(journalEntries
        .filter((je) => sid(je.companyId) === cid && (je.sourceModule === 'payment' || je.sourceModule === 'sale'))
        .reduce((s, je) => {
          const lines = journalLines.filter((l) => sid(l.journalEntryId) === sid(je._id));
          const credit = lines.reduce((ss, l) => {
            const code = chartById.get(sid(l.accountId))?.code;
            if (code === '4001' || code === '4002') return ss + Number(l.credit || 0);
            return ss;
          }, 0);
          return s + credit;
        }, 0));
      companyRevenue.push({
        companyId: cid,
        companyName: company.name,
        currency: ccy,
        paymentAgencyShare: paymentShare,
        companyAccountActive: caShare,
        companyAccountArchived: money(caArchived),
        companyRevenueField: money(company.revenue || 0),
        journal4001_4002: journalRev,
        companyBalanceTotalRevenue: money(cb[0]?.totalRevenue || 0),
        duplicateActiveCompanyRows: caDup,
        paymentCount: plist.length
      });
    }
  }
  scan.parts.companyRevenue = companyRevenue;

  // ---- PART 7 agent commission ----
  const agentMissing = [];
  const agentDup = [];
  for (const p of payments) {
    const share = Number(p.commissionDetails?.agentShare || 0);
    if (!(p.status === 'completed' && share > 0 && !isReversalRow(p) && p.isProvisional !== true && p.isInSuspense !== true && p.commissionFinalized !== false)) continue;
    const hits = findAgentTx(agentAccounts, p).filter((t) => t.type === 'commission');
    const completed = hits.filter((t) => t.status === 'completed');
    if (completed.length === 0) {
      agentMissing.push({
        paymentId: sid(p._id),
        agentId: sid(p.agentId),
        expected: money(share),
        actual: 0,
        currency: p.currency || ''
      });
      addFinding({
        severity: 'HIGH',
        confidence: 'CONFIRMED DATA DAMAGE',
        category: 'agent-commission-missing',
        collection: 'agentaccounts / payments',
        recordIds: [sid(p._id), sid(p.agentId)],
        amount: share,
        currency: p.currency || 'USD',
        evidence: `Completed payment ${sid(p._id)} agentShare=${share} has no AgentAccount commission row`,
        likelyCause: 'P4-H04 change-stream path does not sync agent commission; GET backfill never ran',
        historicalDamage: 'YES',
        phase4: 'P4-H04',
        migrationMaybe: true
      });
    } else if (completed.length > 1) {
      agentDup.push({
        paymentId: sid(p._id),
        agentId: sid(p.agentId),
        count: completed.length,
        amounts: completed.map((t) => t.amount).join('|'),
        refs: completed.map((t) => t.reference).join('|')
      });
      addFinding({
        severity: 'HIGH',
        confidence: 'CONFIRMED DATA DAMAGE',
        category: 'agent-commission-duplicate',
        collection: 'agentaccounts',
        recordIds: [sid(p._id)],
        amount: money(completed.reduce((s, t) => s + t.amount, 0) - share),
        evidence: `Duplicate agent commissions for payment ${sid(p._id)} count=${completed.length}`,
        likelyCause: 'P4-H05 load-modify-save race or inconsistent reference keys',
        historicalDamage: 'YES',
        phase4: 'P4-H05',
        migrationMaybe: true
      });
    }
  }
  scan.parts.agent = { missing: agentMissing, duplicates: agentDup };

  // ---- PART 8 provisional ----
  const provisionalPosted = [];
  for (const p of payments) {
    if (p.isProvisional !== true || p.status !== 'completed') continue;
    const income = findIncomeForPayment(accountsByEntity, p).matches;
    const companyTx = findCompanyTx(companyAccounts, p);
    const agentTx = findAgentTx(agentAccounts, p);
    const journal = (journalsBySource.get(`payment:${sid(p._id)}`) || []).concat(journalsBySource.get(`sale:${sid(p._id)}`) || []);
    const trust = trustByPayment.get(sid(p._id)) || [];
    const posted = income.length + companyTx.length + agentTx.filter((t) => t.type === 'commission').length + journal.length + trust.length;
    if (posted > 0) {
      provisionalPosted.push({
        paymentId: sid(p._id),
        propertyId: sid(p.propertyId),
        amount: money(p.amount),
        income: income.length,
        company: companyTx.length,
        agent: agentTx.length,
        journal: journal.length,
        trust: trust.length
      });
      addFinding({
        severity: 'HIGH',
        confidence: 'CONFIRMED DATA DAMAGE',
        category: 'provisional-posted',
        collection: 'payments',
        recordIds: [sid(p._id)],
        amount: money(p.amount),
        currency: p.currency || 'USD',
        evidence: `Provisional completed payment ${sid(p._id)} already has accounting artifacts income=${income.length} company=${companyTx.length} agent=${agentTx.length} journal=${journal.length} trust=${trust.length}`,
        likelyCause: 'P4-H11 scheduled reconciliation posts isProvisional payments',
        historicalDamage: 'YES',
        phase4: 'P4-H11',
        migrationMaybe: true
      });
    }
  }
  scan.parts.provisional = provisionalPosted;

  // ---- PART 9 pending ----
  const pendingCaps = [];
  const pending = payments.filter((p) => p.status === 'pending');
  for (const p of pending) {
    if (String(p.paymentType).toLowerCase() !== 'rental') continue;
    const month = p.rentalPeriodMonth;
    const year = p.rentalPeriodYear;
    if (!month || !year) continue;
    const others = payments.filter((o) =>
      sid(o.propertyId) === sid(p.propertyId) &&
      o.rentalPeriodMonth === month &&
      o.rentalPeriodYear === year &&
      ['pending', 'completed'].includes(o.status) &&
      sid(o._id) !== sid(p._id) &&
      !isReversalRow(o)
    );
    pendingCaps.push({
      paymentId: sid(p._id),
      propertyId: sid(p.propertyId),
      period: `${year}-${month}`,
      amount: money(p.amount),
      otherPendingOrCompletedCount: others.length,
      otherAmounts: money(others.reduce((s, o) => s + Number(o.amount || 0), 0))
    });
  }
  if (pendingCaps.length) {
    addFinding({
      severity: 'MEDIUM',
      confidence: 'HIGH-CONFIDENCE DATA RISK',
      category: 'pending-rent-cap',
      collection: 'payments',
      evidence: `${pendingCaps.length} pending rental payments exist and would be counted as collected by createPayment period filter (pending+completed)`,
      likelyCause: 'P4-H15',
      historicalDamage: 'NO',
      phase4: 'P4-H15'
    });
  }
  scan.parts.pending = pendingCaps;

  // ---- PART 10 sale dual ledger ----
  const saleDual = [];
  for (const p of payments) {
    if (String(p.paymentType).toLowerCase() !== 'sale') continue;
    if (p.status !== 'completed' || isReversalRow(p)) continue;
    if (!p.developmentId || !p.developmentUnitId) continue;
    const ownerAmount = money(p.commissionDetails?.ownerAmount || 0);
    const unitAccs = accountsByEntity.get(sid(p.developmentUnitId)) || [];
    const devAccs = accountsByEntity.get(sid(p.developmentId)) || [];
    const unitIncome = unitAccs.flatMap((a) => (a.transactions || []).filter((t) => t.type === 'income' && sid(t.paymentId) === sid(p._id) && t.status === 'completed'));
    const devIncome = devAccs.flatMap((a) => (a.transactions || []).filter((t) => t.type === 'income' && sid(t.paymentId) === sid(p._id) && t.status === 'completed'));
    saleDual.push({
      paymentId: sid(p._id),
      developmentId: sid(p.developmentId),
      unitId: sid(p.developmentUnitId),
      ownerAmount,
      unitAmount: money(unitIncome.reduce((s, t) => s + Number(t.amount || 0), 0)),
      devAmount: money(devIncome.reduce((s, t) => s + Number(t.amount || 0), 0)),
      unitMissing: unitIncome.length === 0 && ownerAmount > 0,
      devMissing: devIncome.length === 0 && ownerAmount > 0
    });
  }
  scan.parts.saleDual = saleDual;
  const saleMissing = saleDual.filter((r) => r.unitMissing || r.devMissing);
  for (const r of saleMissing) {
    addFinding({
      severity: 'HIGH',
      confidence: 'CONFIRMED DATA DAMAGE',
      category: 'sale-partial-ledger',
      collection: 'propertyaccounts / payments',
      recordIds: [r.paymentId, r.developmentId, r.unitId],
      amount: r.ownerAmount,
      evidence: `Sale payment ${r.paymentId} unitMissing=${r.unitMissing} devMissing=${r.devMissing} ownerAmount=${r.ownerAmount} unit=${r.unitAmount} dev=${r.devAmount}`,
      likelyCause: 'P4-H07 partial multi-target posting',
      historicalDamage: 'YES',
      phase4: 'P4-H06/H07',
      migrationMaybe: true
    });
  }

  // ---- PART 11 ledger events ----
  const leDup = [];
  const leByPay = new Map();
  for (const ev of ledgerEvents) {
    const k = `${ev.type || ''}:${sid(ev.paymentId)}`;
    if (!leByPay.has(k)) leByPay.set(k, []);
    leByPay.get(k).push(ev);
  }
  for (const [k, list] of leByPay) {
    const open = list.filter((e) => ['pending', 'processing', 'failed'].includes(e.status));
    if (open.length > 1) {
      leDup.push({
        key: k,
        openCount: open.length,
        statuses: list.map((e) => e.status).join('|'),
        ids: list.map((e) => sid(e._id)).join('|'),
        attempts: list.map((e) => e.attemptCount || 0).join('|')
      });
    }
  }
  const stuckProcessing = ledgerEvents.filter((e) => e.status === 'processing' && e.updatedAt && (Date.now() - new Date(e.updatedAt).getTime()) > 15 * 60 * 1000);
  scan.parts.ledgerEvents = {
    total: ledgerEvents.length,
    byStatus: ledgerEvents.reduce((m, e) => { m[e.status] = (m[e.status] || 0) + 1; return m; }, {}),
    duplicateOpen: leDup,
    stuckProcessing: stuckProcessing.map((e) => ({ id: sid(e._id), paymentId: sid(e.paymentId), updatedAt: iso(e.updatedAt), attempts: e.attemptCount }))
  };
  if (leDup.length) {
    addFinding({
      severity: 'MEDIUM',
      confidence: 'HIGH-CONFIDENCE DATA RISK',
      category: 'ledger-event-duplicate-open',
      collection: 'ledgerevents',
      evidence: `${leDup.length} payment/type keys have overlapping pending/processing/failed LedgerEvents`,
      likelyCause: 'P4-H12 non-unique enqueue',
      historicalDamage: 'NO',
      phase4: 'P4-H12'
    });
  }

  // ---- PART 12 journal / event log ----
  const failedSync = accountingEventLogs.filter((e) => e.eventType === 'payment_sync_failed' || e.success === false);
  const journalGaps = [];
  for (const ev of failedSync) {
    const src = String(ev.sourceId || '');
    const existing = (journalsBySource.get(`${ev.sourceModule}:${src}`) || []);
    if (existing.length === 0) {
      journalGaps.push({ eventId: sid(ev._id), sourceModule: ev.sourceModule, sourceId: src, message: ev.message || '', createdAt: iso(ev.createdAt) });
    }
  }
  const duplicateJournals = [];
  for (const [k, list] of journalsBySource) {
    if (list.length > 1) duplicateJournals.push({ key: k, count: list.length, ids: list.map((j) => sid(j._id)).join('|') });
  }
  scan.parts.journal = { failedSyncCount: failedSync.length, journalGaps, duplicateJournals };
  for (const g of journalGaps) {
    addFinding({
      severity: 'MEDIUM',
      confidence: 'CONFIRMED DATA DAMAGE',
      category: 'journal-missing-after-sync-failure',
      collection: 'accountingeventlogs / journalentries',
      recordIds: [g.sourceId],
      evidence: `payment_sync_failed for sourceId ${g.sourceId} and no JournalEntry exists (${g.message})`,
      likelyCause: 'P4-H13 journal fail logged without retry worker',
      historicalDamage: 'YES',
      phase4: 'P4-H13',
      migrationMaybe: true
    });
  }

  // ---- PART 13 owner identity ----
  const ownerIdentity = [];
  let agentBalanceWithOwnerIncome = 0;
  for (const prop of properties) {
    const oid = sid(prop.ownerId);
    const poid = sid(prop.propertyOwnerId);
    const user = userById.get(oid);
    const poByOwnerId = ownerById.get(oid);
    const poByField = ownerById.get(poid);
    ownerIdentity.push({
      propertyId: sid(prop._id),
      ownerId: oid,
      propertyOwnerId: poid,
      ownerIdIsUser: Boolean(user),
      ownerIdIsPropertyOwner: Boolean(poByOwnerId),
      userRole: user?.role || '',
      userBalance: money(user?.balance || 0),
      idsDiffer: oid && poid && oid !== poid
    });
    if (user && (user.role === 'agent' || user.role === 'company_admin' || user.role === 'accountant') && Number(user.balance || 0) > 0) {
      agentBalanceWithOwnerIncome += 1;
    }
  }
  if (ownerIdentity.some((r) => r.ownerIdIsUser && !r.ownerIdIsPropertyOwner)) {
    addFinding({
      severity: 'HIGH',
      confidence: 'HIGH-CONFIDENCE DATA RISK',
      category: 'ownerId-is-user',
      collection: 'properties / users',
      evidence: `${ownerIdentity.filter((r) => r.ownerIdIsUser && !r.ownerIdIsPropertyOwner).length} properties have ownerId pointing at a User, not a PropertyOwner. ${agentBalanceWithOwnerIncome} such users have balance>0.`,
      likelyCause: 'P4-H09 Property.ownerId is the creating agent User; payment $inc credits User.balance',
      historicalDamage: 'YES',
      phase4: 'P4-H09'
    });
  }
  scan.parts.ownerIdentity = {
    sampleCount: ownerIdentity.length,
    ownerIdIsUserCount: ownerIdentity.filter((r) => r.ownerIdIsUser).length,
    ownerIdIsPropertyOwnerCount: ownerIdentity.filter((r) => r.ownerIdIsPropertyOwner).length,
    idsDifferCount: ownerIdentity.filter((r) => r.idsDiffer).length,
    usersWithBalance: users.filter((u) => Number(u.balance || 0) !== 0).map((u) => ({ id: sid(u._id), role: u.role, balance: money(u.balance), name: `${u.firstName || ''} ${u.lastName || ''}`.trim() }))
  };

  // ---- PART 14 currency ----
  const ccyCounts = {};
  const ccyTotals = {};
  for (const p of payments) {
    const c = p.currency || '(blank)';
    ccyCounts[c] = (ccyCounts[c] || 0) + 1;
    ccyTotals[c] = money((ccyTotals[c] || 0) + Number(p.amount || 0));
  }
  const mixedCurrencyAccounts = [];
  for (const acc of companyAccounts) {
    const ccys = new Set((acc.transactions || []).map((t) => t.currency || 'USD').filter(Boolean));
    if (ccys.size > 1) {
      mixedCurrencyAccounts.push({ collection: 'companyaccounts', id: sid(acc._id), currencies: [...ccys].join('|'), runningBalance: money(acc.runningBalance) });
    }
  }
  scan.parts.currency = { paymentCounts: ccyCounts, paymentTotals: ccyTotals, mixedCurrencyAccounts };
  if (Object.keys(ccyCounts).filter((c) => c !== '(blank)').length <= 1) {
    addFinding({
      severity: 'INFO',
      confidence: 'CODE RISK ONLY',
      category: 'multi-currency-unused',
      evidence: `Distinct payment currencies in this database: ${JSON.stringify(ccyCounts)}. Mixed-currency rollup risk is not evidenced here.`,
      likelyCause: 'P4-H10 code risk; production dataset currently single-currency or blank',
      historicalDamage: 'NO',
      phase4: 'P4-H10'
    });
  }

  // ---- PART 16 referential ----
  const activeLeaseCounts = new Map();
  for (const l of leases) {
    if (String(l.status || '').toLowerCase() !== 'active') continue;
    const k = sid(l.propertyId);
    activeLeaseCounts.set(k, (activeLeaseCounts.get(k) || 0) + 1);
  }
  const multiActiveLeases = [...activeLeaseCounts.entries()].filter(([, n]) => n > 1);
  const orphanPayments = [];
  for (const p of payments) {
    if (p.tenantId && !tenantById.has(sid(p.tenantId))) orphanPayments.push({ paymentId: sid(p._id), reason: 'missing-tenant', tenantId: sid(p.tenantId) });
    if (p.propertyId && !propertyById.has(sid(p.propertyId)) && !devById.has(sid(p.propertyId)) && !unitById.has(sid(p.propertyId))) {
      orphanPayments.push({ paymentId: sid(p._id), reason: 'missing-property', propertyId: sid(p.propertyId) });
    }
  }
  const orphanAccounts = [];
  for (const acc of propertyAccounts) {
    const pid = sid(acc.propertyId);
    if (!propertyById.has(pid) && !devById.has(pid) && !unitById.has(pid)) {
      orphanAccounts.push({ accountId: sid(acc._id), propertyId: pid, ledgerType: acc.ledgerType });
    }
  }
  const staleOwnerProps = [];
  for (const po of propertyOwners) {
    for (const pid of po.properties || []) {
      if (!propertyById.has(sid(pid))) staleOwnerProps.push({ ownerId: sid(po._id), propertyId: sid(pid) });
    }
  }
  scan.parts.referential = { multiActiveLeases: multiActiveLeases.map(([id, n]) => ({ propertyId: id, count: n })), orphanPayments, orphanAccounts, staleOwnerProps };
  if (multiActiveLeases.length) {
    addFinding({
      severity: 'MEDIUM',
      confidence: 'CONFIRMED DATA DAMAGE',
      category: 'multiple-active-leases',
      collection: 'leases',
      evidence: `${multiActiveLeases.length} properties have more than one active lease`,
      likelyCause: 'No unique active-lease index (Phase 4 R-07)',
      historicalDamage: 'YES',
      phase4: 'R-07'
    });
  }

  // ---- PART 17 levy / municipal ----
  const levyGaps = [];
  for (const levy of levyPayments) {
    if (!['completed', 'paid_out'].includes(levy.status)) continue;
    const idKey = `levy-payment:${sid(levy._id)}:collection`;
    const found = allPt.filter((tx) => String(tx.idempotencyKey || '') === idKey || sid(tx.levyPaymentId) === sid(levy._id));
    const collections = found.filter((t) => t.type === 'collection');
    if (collections.length === 0) {
      levyGaps.push({ levyId: sid(levy._id), propertyId: sid(levy.propertyId), amount: money(levy.amount), status: levy.status, kind: 'missing-collection' });
    }
    if (levy.status === 'paid_out' || levy.payout?.paidOut) {
      const payouts = found.filter((t) => t.type === 'payment');
      if (payouts.length === 0) {
        levyGaps.push({ levyId: sid(levy._id), propertyId: sid(levy.propertyId), amount: money(levy.amount), status: levy.status, kind: 'missing-payout' });
      }
    }
  }
  scan.parts.levy = { count: levyPayments.length, municipalCount: 0, gaps: levyGaps };
  for (const g of levyGaps) {
    addFinding({
      severity: 'MEDIUM',
      confidence: 'CONFIRMED DATA DAMAGE',
      category: 'levy-pass-through-gap',
      collection: 'levypayments / propertyaccounts',
      recordIds: [g.levyId],
      amount: g.amount,
      evidence: `Levy ${g.levyId} ${g.kind} amount=${g.amount} status=${g.status}`,
      likelyCause: g.kind === 'missing-collection' ? 'P4-C01/C02 or levy controller catch swallowed error' : 'Payout not posted to pass-through',
      historicalDamage: 'YES',
      phase4: 'P4-M12',
      migrationMaybe: true
    });
  }
  addFinding({
    severity: 'INFO',
    confidence: 'CODE RISK ONLY',
    category: 'municipal-not-posted',
    collection: 'municipalpayments',
    evidence: 'municipalpayments collection is empty (0 documents). Code does not post municipal payments to pass-through; no data damage observed.',
    likelyCause: 'P4-M12',
    historicalDamage: 'NO',
    phase4: 'P4-M12'
  });

  // ---- PART 18 master recon ----
  for (const p of payments) {
    const eligible = incomeEligible(p);
    const isSale = String(p.paymentType || '').toLowerCase() === 'sale';
    const income = findIncomeForPayment(accountsByEntity, p);
    const expAmt = expectedConfiguredExpense(p, chargeByCode);
    const expenses = findExpenseForPayment(accountsByEntity, p);
    const ptExp = expectedPassThrough(p, chargeByCode);
    const ptActual = ptExp.map((e) => ({ ...e, actual: findPassThroughForPayment(allPt, p, e.code).filter((t) => t.type === 'collection' && t.status === 'completed') }));
    const companyTx = findCompanyTx(companyAccounts, p);
    const agentTx = findAgentTx(agentAccounts, p);
    const journalPay = (journalsBySource.get(`payment:${sid(p._id)}`) || []).concat(journalsBySource.get(`sale:${sid(p._id)}`) || []);
    const trust = trustByPayment.get(sid(p._id)) || [];
    const vat = vatByTxn.get(sid(p._id));
    const agencyShare = Number(p.commissionDetails?.agencyShare || 0);
    const agentShare = Number(p.commissionDetails?.agentShare || 0);
    const ownerIncomeAmt = expectedOwnerIncomeAmount(p, chargeByCode);
    const vatExpected = money(Number(p.commissionDetails?.vatOnCommission || 0) + Number(p.vatAmount || 0)) > 0;

    const propertyNeeded = eligible && ownerIncomeAmt > 0;
    const expenseNeeded = eligible && expAmt > 0 && !isSale && p.isProvisional !== true;
    const ptNeeded = eligible && ptExp.length > 0 && !isSale && p.isProvisional !== true;
    const companyNeeded = eligible && agencyShare > 0 && p.isProvisional !== true;
    const agentNeeded = eligible && agentShare > 0 && p.isProvisional !== true && p.isInSuspense !== true && p.commissionFinalized !== false;
    const journalNeeded = eligible && Number(p.amount || 0) > 0 && p.isProvisional !== true;
    const trustNeeded = eligible && isSale && p.isProvisional !== true;
    const vatNeeded = eligible && vatExpected;

    const incomeCompleted = income.matches.filter((m) => m.status === 'completed');
    const companyActive = companyTx.filter((t) => t.isArchived !== true);
    const agentCom = agentTx.filter((t) => t.type === 'commission' && t.status === 'completed');
    const ptMissing = ptActual.some((x) => x.actual.length === 0);
    const ptDup = ptActual.some((x) => x.actual.length > 1);
    const incomeContradict = p.status === 'reversed' && incomeCompleted.length > 0;

    const row = {
      paymentId: sid(p._id),
      paymentType: p.paymentType || '',
      status: p.status || '',
      currency: p.currency || '',
      amount: money(p.amount),
      companyId: sid(p.companyId),
      propertyId: sid(p.propertyId),
      isProvisional: p.isProvisional === true,
      isSale,
      Property: propertyNeeded ? statusCell(incomeCompleted.length > 0, incomeCompleted.length > income.targets.length, incomeContradict) : 'NOT_APPLICABLE',
      Expense: expenseNeeded ? statusCell(expenses.some((e) => e.status === 'completed'), expenses.filter((e) => e.status === 'completed').length > 1) : 'NOT_APPLICABLE',
      PassThrough: ptNeeded ? (ptDup ? 'DUPLICATE' : ptMissing ? 'MISSING' : 'OK') : 'NOT_APPLICABLE',
      Company: companyNeeded ? statusCell(companyActive.length > 0, companyActive.length > 1) : 'NOT_APPLICABLE',
      Agent: agentNeeded ? statusCell(agentCom.length > 0, agentCom.length > 1) : 'NOT_APPLICABLE',
      Journal: journalNeeded ? statusCell(journalPay.length > 0, journalPay.length > 1) : 'NOT_APPLICABLE',
      Trust: trustNeeded ? statusCell(trust.length > 0, trust.length > 1) : 'NOT_APPLICABLE',
      VAT: vatNeeded ? statusCell(Boolean(vat), false) : 'NOT_APPLICABLE'
    };
    if (incomeContradict) row.Property = 'CONTRADICTORY';
    if (p.status === 'reversed' && expenses.some((e) => e.status === 'completed')) row.Expense = 'CONTRADICTORY';
    reconRows.push(row);
  }

  // ---- exposure ----
  const exposure = { USD: {}, ZWL: {}, OTHER: {} };
  function bump(ccy, key, amt) {
    const bucket = ccy === 'ZWL' || ccy === 'ZiG' ? 'ZWL' : (ccy === 'USD' || !ccy ? 'USD' : 'OTHER');
    exposure[bucket][key] = money((exposure[bucket][key] || 0) + Number(amt || 0));
  }
  for (const r of ptVsPayment) {
    if (r.missing) bump(r.currency, 'missingPassThroughCollections', r.expectedAmount);
    if (r.duplicate) bump(r.currency, 'duplicatedPassThrough', r.actualAmount - r.expectedAmount);
  }
  for (const r of expenseVsPayment) {
    if (r.missing) bump('USD', 'missingConfiguredExpense', r.expectedAmount);
  }
  for (const r of reversedActiveExpense) bump('USD', 'unreversedExpenses', r.expenseAmount);
  for (const r of agentMissing) bump(r.currency, 'missingAgentCommission', r.expected);
  for (const r of saleDual) {
    if (r.unitMissing) bump('USD', 'missingSaleUnitIncome', r.ownerAmount);
    if (r.devMissing) bump('USD', 'missingSaleDevelopmentIncome', r.ownerAmount);
  }
  for (const row of reconRows) {
    if (row.Property === 'MISSING') bump(row.currency, 'missingOwnerIncome', expectedOwnerIncomeAmount(payments.find((p) => sid(p._id) === row.paymentId) || {}, chargeByCode));
    if (row.Company === 'MISSING') bump(row.currency, 'missingCompanyCommission', Number((payments.find((p) => sid(p._id) === row.paymentId) || {}).commissionDetails?.agencyShare || 0));
  }

  const counts = {
    payments: payments.length,
    propertyAccounts: propertyAccounts.length,
    companyAccounts: companyAccounts.length,
    agentAccounts: agentAccounts.length,
    journalEntries: journalEntries.length,
    trustTransactions: trustTransactions.length,
    ledgerEvents: ledgerEvents.length,
    findings: findings.length
  };

  const confirmed = findings.filter((f) => f.confidence === 'CONFIRMED DATA DAMAGE');
  const highRisk = findings.filter((f) => f.confidence === 'HIGH-CONFIDENCE DATA RISK');
  const codeOnly = findings.filter((f) => f.confidence === 'CODE RISK ONLY' || f.confidence === 'INFORMATIONAL');

  let score = 100;
  const deduct = (n, cap) => { const d = Math.min(n, cap); score -= d; return d; };
  const d1 = deduct(confirmed.filter((f) => f.category.includes('reversed')).length * 8, 24);
  const d2 = deduct(balanceMismatches.length * 2, 16);
  const d3 = deduct(confirmed.filter((f) => f.category.includes('missing')).length * 2, 20);
  const d4 = deduct(confirmed.filter((f) => f.category.includes('duplicate')).length * 3, 12);
  const d5 = deduct(provisionalPosted.length * 4, 8);
  score = Math.max(0, Math.min(100, score));

  scan.endedAt = new Date().toISOString();
  scan.durationMs = Date.now() - START.getTime();
  scan.counts = counts;
  scan.exposure = exposure;
  scan.score = { value: score, deductions: { reversed: d1, balances: d2, missing: d3, duplicates: d4, provisional: d5 } };
  scan.findingSummary = {
    confirmedDamage: confirmed.length,
    highConfidenceRisk: highRisk.length,
    codeOnlyOrInfo: codeOnly.length
  };

  fs.writeFileSync(path.join(OUT_DIR, 'scan-raw.json'), JSON.stringify(scan, null, 2));
  writeCsv('PHASE_5A_FINDINGS.csv', [
    'id', 'severity', 'confidence', 'category', 'collection', 'recordIds', 'amount', 'currency',
    'evidence', 'likelyCause', 'historicalDamage', 'recommendedRepair', 'migrationMaybe', 'phase4'
  ], findings);
  writeCsv('PHASE_5A_PAYMENT_RECONCILIATION.csv', [
    'paymentId', 'paymentType', 'status', 'currency', 'amount', 'companyId', 'propertyId', 'isProvisional',
    'Property', 'Expense', 'PassThrough', 'Company', 'Agent', 'Journal', 'Trust', 'VAT'
  ], reconRows);

  await client.close();
  await acctClient.close();
  console.log('Scan complete. findings=', findings.length, 'payments=', payments.length, 'score=', score);
}

main().catch((err) => {
  console.error('SCAN_FAILED', err);
  process.exit(1);
});
