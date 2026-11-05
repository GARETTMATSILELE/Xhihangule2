import { MongoClient, ObjectId } from 'mongodb';
import { readFileSync, writeFileSync } from 'node:fs';

function redact(value) {
  return String(value || '').replace(/mongodb(?:\+srv)?:\/\/[^\s'"]+/gi, '[redacted-uri]');
}

function describe(uri) {
  const match = String(uri).match(/^mongodb(?:\+srv)?:\/\/(?:[^@\s]+)@([^\/:?\s]+)\/([^?\s]*)/i);
  return { host: match[1], database: match[2] };
}

function id(value) {
  if (value == null) return '';
  if (typeof value === 'object' && typeof value.toHexString === 'function') return value.toHexString();
  return String(value);
}

function money(value) {
  const n = Number(value || 0);
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const raw = readFileSync(new URL('./api-settings.json', import.meta.url), 'utf8').replace(/^\uFEFF/, '');
const settings = {};
for (const row of JSON.parse(raw)) settings[row.name] = row.value;
const mainUri = settings.MONGODB_URI;
const accountingUri = settings.ACCOUNTING_DB_URI;
const mainDesc = describe(mainUri);
const accountingDesc = describe(accountingUri);
const main = new MongoClient(mainUri, { retryWrites: false, serverSelectionTimeoutMS: 25000 });
const accounting = new MongoClient(accountingUri, { retryWrites: false, serverSelectionTimeoutMS: 25000 });
await main.connect();
await accounting.connect();
const db = main.db(mainDesc.database);
const adb = accounting.db(accountingDesc.database);

const [mainNames, accountingNames] = await Promise.all([
  db.listCollections({}, { nameOnly: true }).toArray(),
  adb.listCollections({}, { nameOnly: true }).toArray()
]);
const names = {
  main: mainNames.map((c) => c.name).sort(),
  accounting: accountingNames.map((c) => c.name).sort()
};

async function paymentIds(database, collection) {
  if (!names[database === db ? 'main' : 'accounting'].includes(collection) && !(await database.listCollections({ name: collection }).hasNext())) {
    return { present: false, count: 0 };
  }
  const ids = await database.collection(collection).distinct('transactions.paymentId');
  return { present: true, count: ids.length };
}

const agentMain = names.main.includes('agentaccounts')
  ? { present: true, count: (await db.collection('agentaccounts').distinct('transactions.paymentId')).length }
  : { present: false, count: 0 };
const agentAccounting = names.accounting.includes('agentaccounts')
  ? { present: true, count: (await adb.collection('agentaccounts').distinct('transactions.paymentId')).length }
  : { present: false, count: 0 };

const companies = await db.collection('companies').find({}, { projection: { name: 1, companyName: 1, tradingName: 1, status: 1 } }).toArray();
const payments = await db.collection('payments').find(
  { status: 'completed' },
  { projection: { companyId: 1, amount: 1, depositAmount: 1, commissionDetails: 1, vatAmount: 1, levyAllocated: 1, referenceNumber: 1, paymentType: 1 } }
).toArray();
const byCompany = new Map(companies.map((c) => [id(c._id), { companyId: id(c._id), name: c.name || c.companyName || c.tradingName || id(c._id), status: c.status || null, completed: 0, amount: 0 }]));
let identity = { checked: 0, balanced: 0, unbalanced: 0, unbalancedAmount: 0, commissionSplitMismatch: 0, vatStored: 0, gapEqualsFifteenPercent: 0 };
const unbalancedSamples = [];
for (const payment of payments) {
  const companyId = id(payment.companyId);
  if (!byCompany.has(companyId)) byCompany.set(companyId, { companyId, name: companyId, status: 'missing-company-document', completed: 0, amount: 0 });
  const row = byCompany.get(companyId);
  row.completed += 1;
  row.amount = money(row.amount + Number(payment.amount || 0));
  const details = payment.commissionDetails || {};
  const amount = money(payment.amount);
  const owner = money(details.ownerAmount);
  const commission = money(details.commissionNet ?? details.totalCommission ?? 0);
  const vat = money(Number(details.vatOnCommission || 0) + Number(details.vatAmount || 0) + Number(payment.vatAmount || 0));
  const levy = money(details.levy ?? payment.levyAllocated ?? 0);
  const covered = money(owner + commission + vat + levy);
  const split = money(Number(details.agentShare || 0) + Number(details.agencyShare || 0) + Number(details.preaFee || 0));
  identity.checked += 1;
  if (vat > 0) identity.vatStored += 1;
  if (Math.abs(split - commission) > 0.02) identity.commissionSplitMismatch += 1;
  if (Math.abs(covered - amount) <= 0.02) identity.balanced += 1;
  else {
    identity.unbalanced += 1;
    identity.unbalancedAmount = money(identity.unbalancedAmount + amount);
    const gap = money(amount - covered);
    if (commission > 0 && Math.abs(gap - money(commission * 0.15)) <= 0.05) identity.gapEqualsFifteenPercent += 1;
    if (unbalancedSamples.length < 12) {
      unbalancedSamples.push({ paymentId: id(payment._id), referenceNumber: payment.referenceNumber || null, amount, covered, gap, commission, vat, levy, owner, split });
    }
  }
}

const originalId = new ObjectId('6a54dfbd0c6fad277e2541dc');
const suppliedCompany = '68af4d4b614bce39d4d8b6bb';
const actualCompany = '68af4d4b614bce39dd48b6bb';
const [suppliedCompanyDoc, actualCompanyDoc, suffolkJournals, originalEvents, originalLogs, periodCount] = await Promise.all([
  db.collection('companies').findOne({ _id: new ObjectId(suppliedCompany) }, { projection: { name: 1 } }),
  db.collection('companies').findOne({ _id: new ObjectId(actualCompany) }, { projection: { name: 1 } }),
  db.collection('journalentries').find({ reference: 'PAY-Jacobs Suffolk - 41 Suffolk road - Unit 1' }, { projection: { companyId: 1, sourceId: 1, sourceModule: 1, reference: 1, status: 1 } }).toArray(),
  db.collection('ledgerevents').find({ paymentId: originalId }, { projection: { type: 1, status: 1, lastError: 1, failureClass: 1, createdAt: 1 } }).toArray(),
  db.collection('accountingeventlogs').find({ sourceId: '6a54dfbd0c6fad277e2541dc' }, { projection: { eventType: 1, success: 1, message: 1, createdAt: 1 } }).toArray(),
  db.collection('accountingperiods').countDocuments()
]);

async function projection(database, collection, paymentId) {
  const doc = await database.collection(collection).findOne(
    { 'transactions.paymentId': paymentId },
    { projection: { 'transactions.$': 1 } }
  );
  const tx = doc?.transactions?.[0];
  return tx ? { present: true, type: tx.type || null, amount: tx.amount ?? null, status: tx.status || null } : { present: false };
}

const owner = await projection(adb, 'propertyaccounts', originalId);
const company = await projection(adb, 'companyaccounts', originalId);
const agent = names.main.includes('agentaccounts')
  ? await projection(db, 'agentaccounts', originalId)
  : { present: false, collection: 'absent' };

const result = {
  collections: names,
  agentMain,
  agentAccounting,
  companies: [...byCompany.values()].sort((a, b) => b.completed - a.completed),
  suppliedCompanyFound: Boolean(suppliedCompanyDoc),
  actualCompanyName: actualCompanyDoc?.name || null,
  identity,
  unbalancedSamples,
  suffolkJournals: suffolkJournals.map((j) => ({ id: id(j._id), companyId: id(j.companyId), sourceId: j.sourceId, sourceModule: j.sourceModule, status: j.status })),
  originalEvents,
  originalLogs,
  periodCount,
  originalProjections: { owner, company, agent }
};
writeFileSync(new URL('./phase3-correct.json', import.meta.url), JSON.stringify(result, null, 2));
console.log(JSON.stringify({
  mainCollections: names.main.length,
  accountingCollections: names.accounting.length,
  agentMain,
  agentAccounting,
  companies: result.companies.length,
  identity,
  periodCount,
  suppliedCompanyFound: result.suppliedCompanyFound,
  suffolkJournals: result.suffolkJournals.length,
  originalProjections: result.originalProjections,
  originalEvents: originalEvents.length,
  originalLogs: originalLogs.length
}));
await main.close();
await accounting.close();
process.exit(0);
