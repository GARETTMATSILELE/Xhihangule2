import { MongoClient, ObjectId } from 'mongodb';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';

function redact(value) {
  return String(value || '').replace(/mongodb(?:\+srv)?:\/\/[^\s'"]+/gi, '[redacted-uri]');
}
function money(value) {
  const n = Number(value || 0);
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
function id(value) {
  if (value == null) return '';
  if (typeof value === 'object' && typeof value.toHexString === 'function') return value.toHexString();
  return String(value);
}
function near(a, b) {
  return Math.abs(money(a) - money(b)) <= 0.02;
}

const settingsRaw = readFileSync(new URL('./api-settings.json', import.meta.url), 'utf8').replace(/^\uFEFF/, '');
unlinkSync(new URL('./api-settings.json', import.meta.url));
const settings = {};
for (const row of JSON.parse(settingsRaw)) settings[row.name] = row.value;
const match = String(settings.MONGODB_URI).match(/^mongodb(?:\+srv)?:\/\/(?:[^@\s]+)@([^\/:?\s]+)\/([^?\s]*)/i);
const accountingMatch = String(settings.ACCOUNTING_DB_URI).match(/^mongodb(?:\+srv)?:\/\/(?:[^@\s]+)@([^\/:?\s]+)\/([^?\s]*)/i);
const data = JSON.parse(readFileSync(new URL('./phase3-eligible.json', import.meta.url), 'utf8'));
const varianceIds = data.inconsistent.map((item) => item.paymentId);
const eligibleIds = data.eligible.map((item) => item.paymentId);
const collisionIds = data.other.filter((item) => item.class === 'C').map((item) => item.paymentId);
const allIds = [...new Set([...varianceIds, ...eligibleIds, ...collisionIds, '69a687642e260830449362ec'])].map((value) => new ObjectId(value));

const main = new MongoClient(settings.MONGODB_URI, { retryWrites: false, serverSelectionTimeoutMS: 25000 });
const accounting = new MongoClient(settings.ACCOUNTING_DB_URI, { retryWrites: false, serverSelectionTimeoutMS: 25000 });
await main.connect();
await accounting.connect();
const db = main.db(match[2]);
const adb = accounting.db(accountingMatch[2]);

const payments = await db.collection('payments').find(
  { _id: { $in: allIds } },
  { projection: {
    companyId: 1, propertyId: 1, saleId: 1, referenceNumber: 1, amount: 1, depositAmount: 1,
    rentAllocated: 1, levyAllocated: 1, paymentDate: 1, createdAt: 1, paymentType: 1, status: 1,
    vatIncluded: 1, commissionDetails: 1, accountingComplete: 1, accountingStatus: 1
  } }
).toArray();
const byId = new Map(payments.map((payment) => [id(payment._id), payment]));
const propertyIds = [...new Set(payments.map((payment) => id(payment.propertyId)).filter(Boolean))].map((value) => new ObjectId(value));
const properties = await db.collection('properties').find(
  { _id: { $in: propertyIds } },
  { projection: { name: 1, title: 1, address: 1, vatOnCommission: 1, vatCommissionTreatment: 1, rentalType: 1 } }
).toArray();
const propertyById = new Map(properties.map((property) => [id(property._id), property]));
const company = await db.collection('companies').findOne({ _id: new ObjectId('68af4d4b614bce39dd48b6bb') });
const companyKeys = company ? Object.keys(company).sort() : [];
const taxRates = await db.collection('taxrates').find({}).project({ companyId: 1, taxType: 1, rate: 1, effectiveFrom: 1, effectiveTo: 1, isActive: 1, jurisdiction: 1 }).toArray();
const vatRecords = await db.collection('vatrecords').find({ sourceId: { $in: varianceIds } }).project({ sourceId: 1, vatCollected: 1, vatRate: 1, status: 1, sourceType: 1 }).toArray();
const depositRows = await db.collection('rentaldeposits').find({ paymentId: { $in: eligibleIds.map((value) => new ObjectId(value)) } }).project({ paymentId: 1, depositAmount: 1, type: 1, referenceNumber: 1, depositDate: 1 }).toArray();
const periodEvents = await db.collection('accountingeventlogs').find({ sourceModule: 'period' }).project({ eventType: 1, message: 1, createdAt: 1 }).limit(20).toArray();
const suffolkJournal = await db.collection('journalentries').findOne({ _id: new ObjectId('69a687642e2608304493632e') });
const suffolkLines = await db.collection('journallines').find({ journalEntryId: new ObjectId('69a687642e2608304493632e') }).project({ accountCode: 1, debit: 1, credit: 1 }).toArray();

const comparable = await db.collection('journalentries').aggregate([
  { $match: { companyId: new ObjectId('68af4d4b614bce39dd48b6bb'), sourceModule: { $in: ['payment', 'sale'] }, status: 'posted' } },
  { $limit: 400 },
  { $lookup: { from: 'journallines', localField: '_id', foreignField: 'journalEntryId', as: 'lines' } }
]).toArray();
const comparableVat = comparable.map((journal) => {
  const vat = (journal.lines || []).filter((line) => line.accountCode === '2101').reduce((sum, line) => sum + Number(line.credit || 0), 0);
  const revenue = (journal.lines || []).filter((line) => line.accountCode === '4001' || line.accountCode === '4002').reduce((sum, line) => sum + Number(line.credit || 0), 0);
  return { sourceId: journal.sourceId, date: journal.transactionDate, vat: money(vat), revenue: money(revenue) };
}).filter((row) => row.vat > 0 || row.revenue > 0);
const withVat = comparableVat.filter((row) => row.vat > 0).length;

function explain(payment) {
  const details = payment.commissionDetails || {};
  const amount = money(payment.amount);
  const commission = money(details.commissionNet ?? details.totalCommission ?? 0);
  const owner = money(details.ownerAmount);
  const gap = money(amount - commission - owner);
  const vat15 = money(commission * 0.15);
  const vat155 = money(commission * 0.155);
  const property = propertyById.get(id(payment.propertyId));
  return {
    paymentId: id(payment._id),
    referenceNumber: payment.referenceNumber || null,
    paymentType: payment.paymentType || null,
    paymentDate: payment.paymentDate || null,
    createdAt: payment.createdAt || null,
    amount,
    depositAmount: money(payment.depositAmount),
    rentAllocated: payment.rentAllocated ?? null,
    levyAllocated: payment.levyAllocated ?? null,
    commissionRate: details.commissionRate ?? null,
    totalCommission: details.totalCommission ?? null,
    commissionNet: details.commissionNet ?? null,
    commissionGross: details.commissionGross ?? null,
    ownerAmount: details.ownerAmount ?? null,
    agentShare: details.agentShare ?? null,
    agencyShare: details.agencyShare ?? null,
    preaFee: details.preaFee ?? null,
    vatOnCommission: details.vatOnCommission ?? null,
    vatAmount: details.vatAmount ?? null,
    vatRate: details.vatRate ?? null,
    vatTreatment: details.vatTreatment ?? null,
    vatIncluded: payment.vatIncluded ?? null,
    levy: details.levy ?? null,
    gap,
    matchesExclusive15: near(gap, vat15),
    matchesExclusive155: near(gap, vat155),
    exclusive15Owner: money(amount - commission - vat15),
    propertyId: id(payment.propertyId) || null,
    propertyName: property?.name || property?.title || null,
    currentPropertyVatOnCommission: property?.vatOnCommission ?? null,
    currentPropertyVatTreatment: property?.vatCommissionTreatment ?? null
  };
}

const variance = varianceIds.map((paymentId) => explain(byId.get(paymentId))).filter((row) => row.paymentId);
const deposits = eligibleIds.map((paymentId) => {
  const payment = byId.get(paymentId);
  const rows = depositRows.filter((row) => id(row.paymentId) === paymentId);
  return {
    paymentId,
    referenceNumber: payment?.referenceNumber || null,
    amount: money(payment?.amount),
    depositAmount: money(payment?.depositAmount),
    rentAllocated: payment?.rentAllocated ?? null,
    ledgerCount: rows.length,
    ledger: rows.map((row) => ({ type: row.type || 'payment', amount: money(row.depositAmount), referenceNumber: row.referenceNumber || null }))
  };
});
const depositSummary = {
  candidates: deposits.length,
  withDepositAmount: deposits.filter((row) => row.depositAmount > 0).length,
  depositAmountTotal: money(deposits.reduce((sum, row) => sum + row.depositAmount, 0)),
  withLedger: deposits.filter((row) => row.ledgerCount > 0).length,
  missingLedger: deposits.filter((row) => row.depositAmount > 0 && row.ledgerCount === 0).map((row) => ({ paymentId: row.paymentId, referenceNumber: row.referenceNumber, depositAmount: row.depositAmount, amount: row.amount })),
  ledgerWithoutDeposit: deposits.filter((row) => row.depositAmount === 0 && row.ledgerCount > 0).length
};
const collisions = collisionIds.map((paymentId) => {
  const payment = byId.get(paymentId);
  const property = propertyById.get(id(payment?.propertyId));
  return {
    paymentId,
    referenceNumber: payment?.referenceNumber || null,
    paymentDate: payment?.paymentDate || null,
    createdAt: payment?.createdAt || null,
    amount: money(payment?.amount),
    owner: payment?.commissionDetails?.ownerAmount ?? null,
    commission: payment?.commissionDetails?.totalCommission ?? null,
    propertyId: id(payment?.propertyId) || null,
    propertyName: property?.name || property?.title || null,
    saleId: id(payment?.saleId) || null
  };
});
const journalOwner = explain(byId.get('69a687642e260830449362ec'));

writeFileSync(new URL('./phase4-investigation.json', import.meta.url), JSON.stringify({
  variance,
  depositSummary,
  deposits: deposits.filter((row) => row.depositAmount > 0 || row.ledgerCount > 0),
  collisions,
  journalOwner,
  suffolkJournal: suffolkJournal ? { reference: suffolkJournal.reference, sourceId: suffolkJournal.sourceId, sourceModule: suffolkJournal.sourceModule, transactionDate: suffolkJournal.transactionDate, lines: suffolkLines } : null,
  taxRates,
  vatRecordCount: vatRecords.length,
  companyKeys,
  periodEvents,
  comparablePosted: comparableVat.length,
  comparableWithVatCredit: withVat
}, null, 2));
console.log(JSON.stringify({
  variance: variance.length,
  match15: variance.filter((row) => row.matchesExclusive15).length,
  match155: variance.filter((row) => row.matchesExclusive155).length,
  neither: variance.filter((row) => !row.matchesExclusive15 && !row.matchesExclusive155).length,
  depositSummary,
  collisions: collisions.length,
  vatRecordCount: vatRecords.length,
  taxRateCount: taxRates.length,
  comparablePosted: comparableVat.length,
  comparableWithVatCredit: withVat,
  periodEvents: periodEvents.length,
  companyKeys
}));
await main.close();
await accounting.close();
