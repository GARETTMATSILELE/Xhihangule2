import { MongoClient, ObjectId } from 'mongodb';
import { readFileSync, unlinkSync } from 'node:fs';

function redact(value) {
  return String(value || '').replace(/mongodb(?:\+srv)?:\/\/[^\s'"]+/gi, '[redacted-uri]');
}

const raw = readFileSync(new URL('./api-settings.json', import.meta.url), 'utf8').replace(/^\uFEFF/, '');
unlinkSync(new URL('./api-settings.json', import.meta.url));
const settings = {};
for (const row of JSON.parse(raw)) settings[row.name] = row.value;
const match = String(settings.MONGODB_URI).match(/^mongodb(?:\+srv)?:\/\/(?:[^@\s]+)@([^\/:?\s]+)\/([^?\s]*)/i);
const client = new MongoClient(settings.MONGODB_URI, { retryWrites: false, serverSelectionTimeoutMS: 25000 });
await client.connect();
const db = client.db(match[2]);
const company = await db.collection('companies').findOne(
  { _id: new ObjectId('68af4d4b614bce39dd48b6bb') },
  { projection: { name: 1, 'commissionConfig.vatPercentOnCommission': 1, 'commissionConfig.preaPercentOfTotal': 1, 'commissionConfig.agentPercentOfRemaining': 1, 'commissionConfig.agencyPercentOfRemaining': 1, taxProfile: 1, 'fiscalConfig.enabled': 1, receivablesCutover: 1, vatNumber: 1 } }
);
const lines = await db.collection('journallines').find({ journalEntryId: new ObjectId('69a687642e2608304493632e') }).project({ accountId: 1, debit: 1, credit: 1 }).toArray();
const accountIds = lines.map((line) => line.accountId).filter(Boolean);
const accounts = await db.collection('chartofaccounts').find({ _id: { $in: accountIds } }).project({ code: 1, name: 1 }).toArray();
const byAccount = new Map(accounts.map((account) => [String(account._id), account]));
console.log(JSON.stringify({
  name: company?.name || null,
  vatPercentOnCommission: company?.commissionConfig?.vatPercentOnCommission ?? null,
  preaPercentOfTotal: company?.commissionConfig?.preaPercentOfTotal ?? null,
  agentPercentOfRemaining: company?.commissionConfig?.agentPercentOfRemaining ?? null,
  agencyPercentOfRemaining: company?.commissionConfig?.agencyPercentOfRemaining ?? null,
  taxProfile: company?.taxProfile || null,
  fiscalisationEnabled: company?.fiscalConfig?.enabled ?? null,
  receivablesCutover: company?.receivablesCutover || null,
  vatNumberPresent: Boolean(company?.vatNumber),
  journalLines: lines.map((line) => ({
    code: byAccount.get(String(line.accountId))?.code || null,
    name: byAccount.get(String(line.accountId))?.name || null,
    debit: line.debit,
    credit: line.credit
  }))
}));
await client.close();
process.on('uncaughtException', (error) => {
  console.error(redact(error.stack || error));
});
