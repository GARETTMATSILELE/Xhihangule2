import { MongoClient } from 'mongodb';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';

const OUT = new URL('./phase3-summary.json', import.meta.url);

function redact(value) {
  return String(value || '')
    .replace(/mongodb(?:\+srv)?:\/\/[^\s'"]+/gi, '[redacted-uri]')
    .replace(/AccountKey=[^;\s'"]+/gi, 'AccountKey=[redacted]')
    .replace(/[A-Za-z0-9_\-]{20,}={0,2}/g, (token) => (token.length > 40 ? '[redacted-token]' : token));
}

function readJson(file) {
  const path = file instanceof URL ? file : new URL(file, import.meta.url);
  const raw = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  unlinkSync(path);
  return JSON.parse(raw);
}

function describe(uri) {
  if (!uri || !String(uri).trim()) return { present: false };
  const match = String(uri).match(/^mongodb(?:\+srv)?:\/\/(?:[^@\s]+)@([^\/:?\s]+)(?::(\d+))?\/([^?\s]*)/i);
  if (!match) return { present: true, parseable: false };
  const host = match[1];
  return {
    present: true,
    parseable: true,
    host,
    port: match[2] || null,
    database: match[3] || '',
    cosmosMongo: /\.mongo\.cosmos\.azure\.com$/i.test(host),
    account: host.split('.')[0]
  };
}

function id(value) {
  if (value == null) return '';
  if (typeof value === 'object' && value._bsontype === 'ObjectId') return value.toHexString();
  return String(value);
}

function money(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function domainOf(payment) {
  const snapshot = String(payment.transactionDomain || '').trim().toUpperCase();
  if (snapshot === 'RENTAL' || snapshot === 'SALE') return snapshot;
  const type = String(payment.paymentType || '').trim().toLowerCase();
  if (type === 'sale') return 'SALE';
  if (type === 'rental' || type === 'introduction') return 'RENTAL';
  return null;
}

function sourceModule(payment) {
  const domain = domainOf(payment);
  if (domain === 'SALE') return 'sale';
  if (domain === 'RENTAL') return 'payment';
  return null;
}

function receiptRef(payment) {
  const reference = String(payment.referenceNumber || '').trim();
  return `PAY-${reference || id(payment._id)}`;
}

function reversed(payment) {
  return Boolean(payment.reversalOfPaymentId)
    || String(payment.status || '') === 'reversed'
    || String(payment.reversalState || '') === 'reversed';
}

function depositOnly(payment) {
  return Number(payment.depositAmount || 0) > 0 && Number(payment.amount || 0) <= 0;
}

function journalExpected(payment) {
  if (String(payment.status || '') !== 'completed') return false;
  if (reversed(payment)) return false;
  if (Number(payment.amount || 0) <= 0) return false;
  if (depositOnly(payment)) return false;
  if (payment.isProvisional === true) return false;
  return sourceModule(payment) != null;
}

function loadSettings(file) {
  const rows = readJson(file);
  const map = {};
  for (const row of rows) map[row.name] = row.value;
  return map;
}

async function main() {
  const cosmosAccounts = readJson('./cosmos.json');
  const api = loadSettings('./api-settings.json');
  const worker = loadSettings('./worker-settings.json');
  const mainUri = api.MONGODB_URI || api.MONGODB_URI_PROPERTY || api.AZURE_COSMOS_CONNECTIONSTRING;
  const accountingUri = api.ACCOUNTING_DB_URI;
  const mainDesc = describe(mainUri);
  const accountingDesc = describe(accountingUri);
  const workerMain = describe(worker.MONGODB_URI || worker.MONGODB_URI_PROPERTY || worker.AZURE_COSMOS_CONNECTIONSTRING);
  const workerAccounting = describe(worker.ACCOUNTING_DB_URI);

  if (!mainUri || !accountingUri) {
    throw new Error(`Missing production URI settings. main=${Boolean(mainUri)} accounting=${Boolean(accountingUri)}`);
  }

  const client = new MongoClient(mainUri, { retryWrites: false, serverSelectionTimeoutMS: 25000, socketTimeoutMS: 120000 });
  const accountingClient = new MongoClient(accountingUri, { retryWrites: false, serverSelectionTimeoutMS: 25000, socketTimeoutMS: 120000 });
  await client.connect();
  await accountingClient.connect();
  const db = client.db(mainDesc.database || undefined);
  const adb = accountingClient.db(accountingDesc.database || undefined);

  const [mainCollections, accountingCollections] = await Promise.all([
    db.listCollections({}, { nameOnly: true }).toArray(),
    adb.listCollections({}, { nameOnly: true }).toArray()
  ]);
  const mainNames = mainCollections.map((c) => c.name).sort();
  const accountingNames = accountingCollections.map((c) => c.name).sort();

  const companies = await db.collection('companies').find({}, { projection: { name: 1, companyName: 1, tradingName: 1 } }).toArray();
  const companyName = new Map(companies.map((c) => [id(c._id), c.name || c.companyName || c.tradingName || id(c._id)]));

  const payments = await db.collection('payments').find(
    { status: 'completed' },
    {
      projection: {
        companyId: 1, amount: 1, depositAmount: 1, status: 1, referenceNumber: 1, paymentType: 1,
        transactionDomain: 1, paymentDate: 1, commissionDetails: 1, vatAmount: 1, levyAllocated: 1,
        rentAllocated: 1, accountingComplete: 1, accountingStatus: 1, reversalOfPaymentId: 1,
        reversalPaymentId: 1, reversalState: 1, isProvisional: 1, vatIncluded: 1
      }
    }
  ).toArray();

  const journals = await db.collection('journalentries').find(
    { status: 'posted' },
    { projection: { companyId: 1, reference: 1, sourceModule: 1, sourceId: 1, status: 1, transactionDate: 1 } }
  ).toArray();

  const lineSums = await db.collection('journallines').aggregate([
    { $group: { _id: '$journalEntryId', debit: { $sum: '$debit' }, credit: { $sum: '$credit' }, lines: { $sum: 1 } } }
  ], { allowDiskUse: true }).toArray();
  const lineByJournal = new Map(lineSums.map((row) => [id(row._id), { debit: money(row.debit), credit: money(row.credit), lines: row.lines }]));

  const periods = await db.collection('accountingperiods').find(
    {},
    { projection: { companyId: 1, periodStart: 1, periodEnd: 1, status: 1 } }
  ).toArray();
  const periodsByCompany = new Map();
  for (const period of periods) {
    const key = id(period.companyId);
    if (!periodsByCompany.has(key)) periodsByCompany.set(key, []);
    periodsByCompany.get(key).push(period);
  }

  const journalEvents = await db.collection('ledgerevents').aggregate([
    { $match: { type: 'journal' } },
    { $group: { _id: { companyId: '$companyId', status: '$status' }, count: { $sum: 1 } } }
  ]).toArray();

  const failedSync = await db.collection('accountingeventlogs').aggregate([
    { $match: { eventType: 'payment_sync_failed', success: false } },
    { $group: { _id: '$companyId', count: { $sum: 1 } } }
  ]).toArray();

  const [ownerIds, companyIds, agentIds] = await Promise.all([
    adb.collection('propertyaccounts').distinct('transactions.paymentId'),
    adb.collection('companyaccounts').distinct('transactions.paymentId'),
    adb.collection('agentaccounts').distinct('transactions.paymentId')
  ]);
  const ownerSet = new Set(ownerIds.map(id));
  const companySet = new Set(companyIds.map(id));
  const agentSet = new Set(agentIds.map(id));

  const bySource = new Map();
  const byRef = new Map();
  for (const journal of journals) {
    const key = `${id(journal.companyId)}|${journal.sourceModule}|${String(journal.sourceId || '')}`;
    if (!bySource.has(key)) bySource.set(key, []);
    bySource.get(key).push(journal);
    const refKey = `${id(journal.companyId)}|${String(journal.reference || '')}`;
    if (!byRef.has(refKey)) byRef.set(refKey, []);
    byRef.get(refKey).push(journal);
  }

  const duplicateRefs = [];
  for (const [key, rows] of byRef) {
    if (!key.includes('|PAY-') || rows.length < 2) continue;
    const sourceIds = [...new Set(rows.map((row) => String(row.sourceId || '')))];
    duplicateRefs.push({
      companyId: key.split('|')[0],
      reference: key.slice(key.indexOf('|') + 1),
      count: rows.length,
      sourceIds
    });
  }

  function periodStatus(companyId, date) {
    const list = periodsByCompany.get(companyId) || [];
    if (!date || list.length === 0) return 'UNMANAGED';
    const when = new Date(date).getTime();
    const hit = list.find((period) => new Date(period.periodStart).getTime() <= when && when <= new Date(period.periodEnd).getTime());
    if (!hit) return 'UNMANAGED';
    if (hit.status === 'OPEN' || hit.status === 'CLOSED' || hit.status === 'SOFT_CLOSED') return hit.status;
    return 'UNMANAGED';
  }

  const companiesReport = new Map();
  function bucket(companyId) {
    if (!companiesReport.has(companyId)) {
      companiesReport.set(companyId, {
        companyId,
        name: companyName.get(companyId) || companyId,
        completed: 0,
        completedAmount: 0,
        validReceiptJournals: 0,
        missingReceiptJournals: 0,
        missingAmount: 0,
        pendingJournalEvents: 0,
        failedJournalEvents: 0,
        failedSyncEvents: 0,
        duplicateReceiptReferences: 0,
        crossPaymentReferenceMismatches: 0,
        missingOwnerProjection: 0,
        missingCompanyProjection: 0,
        missingAgentProjection: 0,
        unbalancedJournals: 0,
        closedPeriodExceptions: 0,
        softClosedPeriodExceptions: 0,
        reversedPayments: 0,
        incompleteAccounting: 0,
        depositOnly: 0,
        depositCombined: 0,
        ownerIncome: 0,
        agentCommission: 0,
        companyCommission: 0,
        prea: 0,
        vat: 0,
        levy: 0,
        eligibleAmount: 0,
        classes: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0 }
      });
    }
    return companiesReport.get(companyId);
  }

  const eventByCompany = new Map();
  for (const row of journalEvents) {
    const companyId = id(row._id.companyId);
    if (!eventByCompany.has(companyId)) eventByCompany.set(companyId, {});
    eventByCompany.get(companyId)[row._id.status] = row.count;
  }
  const syncByCompany = new Map(failedSync.map((row) => [id(row._id), row.count]));

  let unbalancedExisting = 0;
  for (const journal of journals) {
    if (journal.sourceModule !== 'payment' && journal.sourceModule !== 'sale' && journal.sourceModule !== 'commission') continue;
    const sums = lineByJournal.get(id(journal._id));
    if (!sums || Math.abs(sums.debit - sums.credit) > 0.009 || sums.lines === 0) {
      unbalancedExisting += 1;
      bucket(id(journal.companyId)).unbalancedJournals += 1;
    }
  }

  const targetCompany = '68af4d4b614bce39d4d8b6bb';
  let original = null;
  const missing = [];
  const reconciliation = {
    payments: 0,
    paymentAmount: 0,
    ownerIncome: 0,
    agentCommission: 0,
    companyCommission: 0,
    prea: 0,
    vat: 0,
    levy: 0,
    depositAmount: 0,
    storedSnapshotGap: 0,
    eligible: []
  };

  for (const payment of payments) {
    const companyId = id(payment.companyId);
    const row = bucket(companyId);
    const amount = money(payment.amount);
    const details = payment.commissionDetails || {};
    const owner = money(details.ownerAmount);
    const agent = money(details.agentShare);
    const agency = money(details.agencyShare);
    const prea = money(details.preaFee);
    const vat = money(Number(details.vatOnCommission || 0) + Number(details.vatAmount || 0) + Number(payment.vatAmount || 0));
    const levy = money(details.levy ?? payment.levyAllocated ?? 0);
    row.completed += 1;
    row.completedAmount = money(row.completedAmount + amount);
    row.ownerIncome = money(row.ownerIncome + owner);
    row.agentCommission = money(row.agentCommission + agent);
    row.companyCommission = money(row.companyCommission + agency);
    row.prea = money(row.prea + prea);
    row.vat = money(row.vat + vat);
    row.levy = money(row.levy + levy);
    reconciliation.payments += 1;
    reconciliation.paymentAmount = money(reconciliation.paymentAmount + amount);
    reconciliation.ownerIncome = money(reconciliation.ownerIncome + owner);
    reconciliation.agentCommission = money(reconciliation.agentCommission + agent);
    reconciliation.companyCommission = money(reconciliation.companyCommission + agency);
    reconciliation.prea = money(reconciliation.prea + prea);
    reconciliation.vat = money(reconciliation.vat + vat);
    reconciliation.levy = money(reconciliation.levy + levy);
    reconciliation.depositAmount = money(reconciliation.depositAmount + Number(payment.depositAmount || 0));
    const parts = money(owner + agent + agency + prea + vat + levy);
    if (Math.abs(parts - amount) > 0.02 && amount > 0) reconciliation.storedSnapshotGap = money(reconciliation.storedSnapshotGap + (amount - parts));

    if (reversed(payment)) row.reversedPayments += 1;
    if (payment.accountingComplete === false || ['pending', 'partial', 'failed', 'incomplete'].includes(String(payment.accountingStatus || ''))) {
      row.incompleteAccounting += 1;
    }
    if (depositOnly(payment)) row.depositOnly += 1;
    if (Number(payment.depositAmount || 0) > 0 && amount > 0) row.depositCombined += 1;

    const pid = id(payment._id);
    const moduleName = sourceModule(payment);
    const reference = receiptRef(payment);
    const own = moduleName ? (bySource.get(`${companyId}|${moduleName}|${pid}`) || [])[0] : null;
    const refRows = byRef.get(`${companyId}|${reference}`) || [];
    const collision = refRows.find((journal) => String(journal.sourceId || '') !== pid && !String(journal.sourceId || '').startsWith(`${pid}:`));
    const expected = journalExpected(payment);
    if (own) row.validReceiptJournals += 1;

    const ownerMissing = expected && !ownerSet.has(pid);
    const companyMissing = expected && agency > 0 && !companySet.has(pid);
    const agentMissing = expected && agent > 0 && !agentSet.has(pid);
    if (ownerMissing) row.missingOwnerProjection += 1;
    if (companyMissing) row.missingCompanyProjection += 1;
    if (agentMissing) row.missingAgentProjection += 1;

    const period = periodStatus(companyId, payment.paymentDate);
    if (expected && period === 'CLOSED') row.closedPeriodExceptions += 1;
    if (expected && period === 'SOFT_CLOSED') row.softClosedPeriodExceptions += 1;

    if (String(payment.referenceNumber || '') === 'RCPT-2541DC-2026-07' || (companyId === targetCompany && String(payment.referenceNumber || '').includes('2541DC'))) {
      const commissionJournal = (bySource.get(`${companyId}|commission|${pid}:commission`) || [])[0] || null;
      original = {
        paymentId: pid,
        companyId,
        referenceNumber: payment.referenceNumber || null,
        status: payment.status,
        amount,
        depositAmount: money(payment.depositAmount),
        paymentType: payment.paymentType || null,
        transactionDomain: payment.transactionDomain || null,
        paymentDate: payment.paymentDate || null,
        commissionRate: details.commissionRate ?? null,
        preaFee: details.preaFee ?? null,
        commissionNet: details.commissionNet ?? null,
        totalCommission: details.totalCommission ?? null,
        agentShare: details.agentShare ?? null,
        agencyShare: details.agencyShare ?? null,
        ownerAmount: details.ownerAmount ?? null,
        vatIncluded: payment.vatIncluded ?? null,
        vatTreatment: details.vatTreatment ?? null,
        vatRate: details.vatRate ?? null,
        vatOnCommission: details.vatOnCommission ?? null,
        vatAmount: details.vatAmount ?? null,
        paymentVatAmount: payment.vatAmount ?? null,
        levy: details.levy ?? null,
        levyAllocated: payment.levyAllocated ?? null,
        accountingComplete: payment.accountingComplete ?? null,
        accountingStatus: payment.accountingStatus ?? null,
        reversalState: payment.reversalState ?? null,
        reversalOfPaymentId: id(payment.reversalOfPaymentId) || null,
        reversalPaymentId: id(payment.reversalPaymentId) || null,
        receiptJournal: own ? { id: id(own._id), reference: own.reference, sourceId: own.sourceId, sourceModule: own.sourceModule, lines: lineByJournal.get(id(own._id)) || null } : null,
        commissionJournal: commissionJournal ? { id: id(commissionJournal._id), reference: commissionJournal.reference, sourceId: commissionJournal.sourceId, lines: lineByJournal.get(id(commissionJournal._id)) || null } : null,
        periodStatus: period,
        referenceCollision: collision ? { journalId: id(collision._id), sourceId: collision.sourceId, reference: collision.reference } : null
      };
    }

    if (!expected || own) continue;
    row.missingReceiptJournals += 1;
    row.missingAmount = money(row.missingAmount + amount);
    if (collision) row.crossPaymentReferenceMismatches += 1;

    const commissionNet = money(details.commissionNet ?? details.totalCommission ?? 0);
    const storedPartsPresent = details.ownerAmount != null && details.agentShare != null && details.agencyShare != null && details.preaFee != null;
    const balancedPreview = amount > 0 && Math.abs(money(owner + commissionNet + vat + (domainOf(payment) === 'SALE' ? 0 : levy)) - amount) <= 0.02;
    let klass = 'A';
    const reasons = [];
    if (!storedPartsPresent || !moduleName) { klass = 'G'; reasons.push('stored snapshot incomplete'); }
    else if (reversed(payment)) { klass = 'F'; reasons.push('reversed'); }
    else if (collision) { klass = 'C'; reasons.push('reference belongs to another payment'); }
    else if (period === 'CLOSED' || period === 'SOFT_CLOSED') { klass = 'D'; reasons.push(period); }
    else if (!balancedPreview) { klass = 'E'; reasons.push('stored lines do not balance to payment amount'); }
    else if (ownerMissing || companyMissing || agentMissing) { klass = 'B'; reasons.push('projection missing'); }
    else { reasons.push('stored snapshot balances and no receipt journal exists'); }
    row.classes[klass] += 1;
    if (klass === 'A') row.eligibleAmount = money(row.eligibleAmount + amount);
    missing.push({
      class: klass,
      reasons,
      paymentId: pid,
      companyId,
      company: row.name,
      referenceNumber: payment.referenceNumber || null,
      receiptReference: reference,
      amount,
      owner,
      agent,
      agency,
      prea,
      commissionNet,
      vat,
      levy,
      period,
      depositAmount: money(payment.depositAmount),
      paymentType: payment.paymentType || null
    });
  }

  for (const [companyId, counts] of eventByCompany) {
    const row = bucket(companyId);
    row.pendingJournalEvents = (counts.pending || 0) + (counts.processing || 0);
    row.failedJournalEvents = counts.failed || 0;
  }
  for (const [companyId, count] of syncByCompany) bucket(companyId).failedSyncEvents = count;
  for (const dup of duplicateRefs) bucket(dup.companyId).duplicateReceiptReferences += 1;

  const companyRows = [...companiesReport.values()].sort((a, b) => b.missingAmount - a.missingAmount);
  const classTotals = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0 };
  for (const item of missing) classTotals[item.class] += 1;

  const summary = {
    connection: {
      subscription: 'Azure subscription 1',
      subscriptionId: '1ea90a1b-248d-47c7-bfe0-c023fbc68f8d',
      app: 'mantisafrica',
      worker: 'mantisafrica-worker',
      resourceGroup: 'Xhihangule',
      nodeEnv: api.NODE_ENV || null,
      workerNodeEnv: worker.NODE_ENV || null,
      cosmosAccounts,
      main: mainDesc,
      accounting: accountingDesc,
      workerMainMatches: workerMain.host === mainDesc.host && workerMain.database === mainDesc.database,
      workerAccountingMatches: workerAccounting.host === accountingDesc.host && workerAccounting.database === accountingDesc.database,
      mainCollectionsPresent: ['companies', 'payments', 'journalentries', 'journallines', 'accountingeventlogs', 'ledgerevents', 'accountingperiods'].filter((name) => mainNames.includes(name)),
      accountingCollectionsPresent: ['propertyaccounts', 'companyaccounts', 'agentaccounts'].filter((name) => accountingNames.includes(name)),
      companyCount: companies.length,
      targetCompanyPresent: companyName.has(targetCompany)
    },
    totals: {
      companies: companyRows.length,
      completedPayments: payments.length,
      missingJournals: missing.length,
      missingAmount: money(missing.reduce((sum, item) => sum + item.amount, 0)),
      validReceiptJournals: companyRows.reduce((sum, row) => sum + row.validReceiptJournals, 0),
      unbalancedExisting,
      duplicateReceiptReferences: duplicateRefs.length,
      classTotals
    },
    companies: companyRows,
    original,
    missing,
    duplicateRefs: duplicateRefs.slice(0, 50),
    reconciliation: {
      ...reconciliation,
      eligible: undefined,
      eligibleCount: missing.filter((item) => item.class === 'A').length,
      eligibleAmount: money(missing.filter((item) => item.class === 'A').reduce((sum, item) => sum + item.amount, 0))
    }
  };

  writeFileSync(OUT, JSON.stringify(summary));
  console.log(JSON.stringify({
    ok: true,
    db: mainDesc.database,
    accountingDb: accountingDesc.database,
    host: mainDesc.host,
    companies: companies.length,
    completed: payments.length,
    missing: missing.length,
    targetCompanyPresent: companyName.has(targetCompany),
    originalFound: Boolean(original)
  }));
  await client.close();
  await accountingClient.close();
}

main().catch((error) => {
  console.error(redact(error && error.stack || error));
  process.exit(1);
});
