/**
 * Isolated Azure Cosmos DB MongoDB API compatibility harness.
 *
 * This file does not connect unless every safety check passes.
 * It never reads MONGODB_URI or ACCOUNTING_DB_URI as the target.
 * It never drops a database or collection.
 * Credentials are not printed.
 *
 * Missing prerequisites leave every test UNVERIFIED and exit 2.
 * A disposable Cosmos run exits 0 only when every test PASSes.
 * Any FAIL exits 1. Any remaining UNVERIFIED exits 2.
 * Local MongoDB output is not a Cosmos pass.
 */
import { spawn, type ChildProcess } from 'child_process';
import { randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';

type Status = 'PASS' | 'FAIL' | 'UNVERIFIED';
type Result = {
  id: string;
  status: Status;
  operation: string;
  response: string;
  assertions: string;
  limitation?: string;
};

const TEST_IDS = [
  '01-metadata',
  '02-partition-keys-and-indexes',
  '03-unique-lock-index',
  '04-partial-reversal-index',
  '05-concurrent-lock-acquisition',
  '06-heartbeat-ownership',
  '07-expired-lock-recovery',
  '08-old-owner-release',
  '09-overlapping-advances',
  '10-concurrent-controllers',
  '11-currency-and-lease-isolation',
  '12-duplicate-reversal',
  '13-reversal-idempotency',
  '14-transaction-or-code-20',
  '15-throttling',
  '16-process-termination',
  '17-main-and-accounting-connections',
] as const;

const CONFIRMATION = 'CREATE-DISPOSABLE-INDEXES-AND-TEST-RECORDS';
const PRODUCTION_URI_KEYS = [
  'MONGODB_URI',
  'MONGODB_URI_PROPERTY',
  'CUSTOMCONNSTR_MONGODB_URI',
  'CUSTOMCONNSTR_MONGODB_URI_PROPERTY',
  'AZURE_COSMOS_CONNECTIONSTRING',
  'ACCOUNTING_DB_URI',
  'MONGODB_URI_ACCOUNTING',
  'CUSTOMCONNSTR_ACCOUNTING_DB_URI',
  'CUSTOMCONNSTR_MONGODB_URI_ACCOUNTING',
];
const MAIN_DB_PATTERN = /^mantis_cosmos_lock_test_[a-z0-9]{6,32}$/;
const ACCT_DB_PATTERN = /^mantis_cosmos_lock_acct_[a-z0-9]{6,32}$/;

const results: Result[] = [];

function redact(value: string): string {
  return value.replace(/mongodb(\+srv)?:\/\/[^\s'"]+/gi, '[redacted-uri]').slice(0, 500);
}

function describeError(error: unknown): string {
  const err = error as { code?: unknown; codeName?: unknown; message?: unknown; writeErrors?: Array<{ code?: unknown }> } | null;
  const nested = err?.writeErrors?.[0]?.code;
  return redact(`code=${String(err?.code ?? nested ?? '')} name=${String(err?.codeName ?? '')} ${String(err?.message || error || '')}`);
}

function emit(row: Result) {
  results.push(row);
  console.log(`${row.status} ${row.id}`);
  console.log(`  operation: ${row.operation}`);
  console.log(`  response: ${row.response}`);
  console.log(`  assertions: ${row.assertions}`);
  if (row.limitation) console.log(`  limitation: ${row.limitation}`);
}

function markAll(status: Status, response: string, limitation: string) {
  for (const id of TEST_IDS) {
    emit({
      id,
      status,
      operation: 'not executed',
      response,
      assertions: 'no persisted records were inspected',
      limitation,
    });
  }
}

type ParsedUri = { host: string; db: string };

function parseMongoUri(raw: string): ParsedUri | null {
  try {
    const parsed = new URL(raw.trim());
    const db = decodeURIComponent(parsed.pathname.replace(/^\//, '').split('/')[0] || '').toLowerCase();
    return { host: parsed.hostname.toLowerCase(), db };
  } catch {
    return null;
  }
}

function isCosmosHost(host: string): boolean {
  return host.endsWith('.mongo.cosmos.azure.com') || host.endsWith('.mongocluster.cosmos.azure.com');
}

function identitiesFromText(text: string): ParsedUri[] {
  const found: ParsedUri[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!match || !PRODUCTION_URI_KEYS.includes(match[1])) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    const parsed = parseMongoUri(value);
    if (parsed) found.push(parsed);
  }
  return found;
}

function discoveredProductionTargets(): ParsedUri[] {
  const found: ParsedUri[] = [];
  for (const key of PRODUCTION_URI_KEYS) {
    const value = process.env[key];
    if (!value) continue;
    const parsed = parseMongoUri(value);
    if (parsed) found.push(parsed);
  }
  const files = [
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../../.env.local'),
    path.resolve(__dirname, '../../.env.production'),
    path.resolve(__dirname, '../../../.env'),
    path.resolve(__dirname, '../../../.env.production'),
  ];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    found.push(...identitiesFromText(fs.readFileSync(file, 'utf8')));
  }
  return found;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function blankEmailProviders() {
  for (const key of [
    'SMTP_HOST', 'SMTP_HOST_MANTIS', 'SMTP_USER', 'SMTP_USER_MANTIS', 'SMTP_PASS', 'SMTP_PASS_MANTIS',
    'RESEND_API_KEY', 'RESEND_API_KEY_MANTIS', 'SENDGRID_API_KEY', 'SENDGRID_API_KEY_MANTIS',
    'MAILGUN_API_KEY', 'MAILGUN_API_KEY_MANTIS', 'MAILGUN_DOMAIN', 'MAILGUN_DOMAIN_MANTIS',
    'MAILTRAP_API_TOKEN', 'MAILTRAP_API_TOKEN_MANTIS', 'EMAIL_STRICT', 'EMAIL_REQUIRE_PROVIDER',
  ]) delete process.env[key];
}

async function countCollection(db: mongoose.mongo.Db, name: string): Promise<number> {
  const existing = await db.listCollections({ name }).toArray();
  if (!existing.length) return 0;
  return db.collection(name).countDocuments();
}

async function main() {
  const mode = process.env.COSMOS_ISOLATED_TEST === '1';
  const confirmation = process.env.COSMOS_ISOLATED_CONFIRM === CONFIRMATION;
  const mainUri = String(process.env.COSMOS_ISOLATED_URI || '').trim();
  const accountingUri = String(process.env.COSMOS_ISOLATED_ACCOUNTING_URI || '').trim();
  const declaredMainDb = String(process.env.COSMOS_ISOLATED_DB_NAME || '').trim().toLowerCase();
  const declaredAccountingDb = String(process.env.COSMOS_ISOLATED_ACCOUNTING_DB_NAME || '').trim().toLowerCase();
  const declaredProductionHost = String(process.env.COSMOS_PRODUCTION_ACCOUNT_HOST || '').trim().toLowerCase();

  if (!mode || !confirmation || !mainUri || !accountingUri || !declaredMainDb || !declaredAccountingDb || !declaredProductionHost) {
    markAll(
      'UNVERIFIED',
      'safety gate closed before any connection',
      'Set COSMOS_ISOLATED_TEST=1, COSMOS_ISOLATED_CONFIRM=' + CONFIRMATION +
        ', COSMOS_ISOLATED_URI, COSMOS_ISOLATED_ACCOUNTING_URI, COSMOS_ISOLATED_DB_NAME, ' +
        'COSMOS_ISOLATED_ACCOUNTING_DB_NAME, and COSMOS_PRODUCTION_ACCOUNT_HOST. ' +
        'The harness does not fall back to MONGODB_URI or ACCOUNTING_DB_URI.'
    );
    process.exit(2);
  }

  const main = parseMongoUri(mainUri);
  const accounting = parseMongoUri(accountingUri);
  if (!main || !accounting) {
    markAll('UNVERIFIED', 'isolated URI could not be parsed', 'The connection string was not printed.');
    process.exit(2);
  }
  if (mainUri === accountingUri || main.db === accounting.db) {
    markAll('UNVERIFIED', 'main and accounting targets are not separate', 'Identical URIs or database names were rejected.');
    process.exit(2);
  }
  if (!isCosmosHost(main.host) || !isCosmosHost(accounting.host) || main.host !== accounting.host) {
    markAll('UNVERIFIED', 'target host is not one disposable Cosmos MongoDB API account', `host checked without printing credentials`);
    process.exit(2);
  }
  if (!MAIN_DB_PATTERN.test(main.db) || !ACCT_DB_PATTERN.test(accounting.db) || main.db !== declaredMainDb || accounting.db !== declaredAccountingDb) {
    markAll('UNVERIFIED', 'database name is not the required disposable identity', 'Both the URI path and the matching COSMOS_ISOLATED_*_DB_NAME must be mantis_cosmos_lock_test_<suffix> and mantis_cosmos_lock_acct_<suffix>.');
    process.exit(2);
  }
  if (/prod|live|production/.test(main.db) || /prod|live|production/.test(accounting.db)) {
    markAll('UNVERIFIED', 'database name looks like a production database', 'The harness aborted before connecting.');
    process.exit(2);
  }

  const discovered = discoveredProductionTargets().filter((target) => isCosmosHost(target.host));
  const discoveredHosts = [...new Set(discovered.map((target) => target.host))];
  if (!discoveredHosts.length || !discoveredHosts.includes(declaredProductionHost) || !isCosmosHost(declaredProductionHost)) {
    markAll(
      'UNVERIFIED',
      'production Cosmos host could not be positively identified for rejection',
      'COSMOS_PRODUCTION_ACCOUNT_HOST must be a Cosmos host already present in the process environment or a local env file. The harness will not guess which account is production.'
    );
    process.exit(2);
  }
  if (main.host === declaredProductionHost || discoveredHosts.includes(main.host)) {
    markAll('UNVERIFIED', 'isolated host matches a known production Cosmos host', 'No connection was opened.');
    process.exit(2);
  }
  for (const target of discovered) {
    if (target.host === main.host && (target.db === main.db || target.db === accounting.db)) {
      markAll('UNVERIFIED', 'isolated database matches a configured application database', 'No connection was opened.');
      process.exit(2);
    }
  }

  for (const key of PRODUCTION_URI_KEYS) delete process.env[key];
  blankEmailProviders();
  process.env.NODE_ENV = 'development';

  const [{ accountingConnection }, coverage, controllers, agentController] = await Promise.all([
    import('../config/database'),
    import('../services/rentalPeriodCoverage'),
    import('../controllers/paymentController'),
    import('../controllers/agentController'),
  ]);
  const [
    { Company },
    { User },
    { Property },
    { Tenant },
    { Lease },
    { Payment },
    { PropertyOwner },
    { OwnerRentNotice },
    { EventDedupRecord },
    { JournalEntry },
    { JournalLine },
    { TaxObligation },
    { VatRecord },
    propertyAccountModule,
    { CompanyAccount },
  ] = await Promise.all([
    import('../models/Company'),
    import('../models/User'),
    import('../models/Property'),
    import('../models/Tenant'),
    import('../models/Lease'),
    import('../models/Payment'),
    import('../models/PropertyOwner'),
    import('../models/OwnerRentNotice'),
    import('../models/EventDedupRecord'),
    import('../models/JournalEntry'),
    import('../models/JournalLine'),
    import('../models/TaxObligation'),
    import('../models/VatRecord'),
    import('../models/PropertyAccount'),
    import('../models/CompanyAccount'),
  ]);

  const options = {
    autoIndex: false,
    autoCreate: false,
    retryWrites: false,
    serverSelectionTimeoutMS: 20000,
  } as mongoose.ConnectOptions;
  await mongoose.connect(mainUri, options);
  await accountingConnection.openUri(accountingUri, options);

  const mainDbName = mongoose.connection.db?.databaseName || '';
  const accountingDbName = accountingConnection.db?.databaseName || '';
  const seenHost = String(mongoose.connection.host || '').toLowerCase();
  if (mainDbName.toLowerCase() !== main.db || accountingDbName.toLowerCase() !== accounting.db || !seenHost.includes(main.host)) {
    await mongoose.disconnect().catch(() => undefined);
    await accountingConnection.close().catch(() => undefined);
    markAll('UNVERIFIED', 'connected identity did not match the declared disposable target', `mainDb=${mainDbName} accountingDb=${accountingDbName}`);
    process.exit(2);
  }

  const runId = randomBytes(4).toString('hex');
  const holdOnly = process.env.COSMOS_LOCK_HARNESS_ROLE === 'hold-lock';

  try {
    const unrelated = await unrelatedData(mongoose.connection.db!, accountingConnection.db!);
    if (unrelated) {
      markAll('UNVERIFIED', 'disposable database contains unrelated data', unrelated + ' No database or collection was deleted.');
      return;
    }
    if (holdOnly) {
      const key = String(process.env.COSMOS_LOCK_HOLD_KEY || '');
      if (!key.startsWith('cosmos-lock-harness:')) {
        console.log('hold-lock refused an unexpected key');
        return;
      }
      const release = await coverage.acquireRentalPeriodGuard(key);
      console.log('LOCK_HELD');
      await new Promise<void>((resolve) => {
        const stop = () => { void release().finally(() => resolve()); };
        process.on('SIGTERM', stop);
        process.on('SIGINT', stop);
      });
      return;
    }

    await runTests({
      runId,
      coverage,
      controllers,
      agentController,
      Company,
      User,
      Property,
      Tenant,
      Lease,
      Payment,
      PropertyOwner,
      OwnerRentNotice,
      EventDedupRecord,
      JournalEntry,
      JournalLine,
      TaxObligation,
      VatRecord,
      PropertyAccount: propertyAccountModule.default,
      CompanyAccount,
      accountingConnection,
    });
  } finally {
    await mongoose.disconnect().catch(() => undefined);
    await accountingConnection.close().catch(() => undefined);
  }

  const failed = results.some((row) => row.status === 'FAIL');
  const unverified = results.some((row) => row.status === 'UNVERIFIED');
  console.log(`cosmos-lock-compatibility executed=${results.length} fail=${results.filter((row) => row.status === 'FAIL').length} unverified=${results.filter((row) => row.status === 'UNVERIFIED').length}`);
  console.log('Cosmos compatibility is not claimed unless every test above is PASS.');
  process.exit(failed ? 1 : unverified ? 2 : 0);
}

async function unrelatedData(mainDb: mongoose.mongo.Db, accountingDb: mongoose.mongo.Db): Promise<string | null> {
  const paymentCount = await countCollection(mainDb, 'payments');
  const companyCount = await countCollection(mainDb, 'companies');
  if (companyCount === 0 && paymentCount === 0) return null;
  const companies = companyCount
    ? await mainDb.collection('companies').find({}, { projection: { name: 1 } }).toArray()
    : [];
  const foreign = companies.filter((company) => !String(company.name || '').startsWith('Cosmos Lock Harness '));
  if (foreign.length || (paymentCount > 0 && companies.length === 0)) {
    return `payments=${paymentCount} companies=${companyCount} unrelatedCompanies=${foreign.length}`;
  }
  const accountingPayments = await countCollection(accountingDb, 'payments');
  if (accountingPayments > 0) return `accounting connection already has payments=${accountingPayments}`;
  return null;
}

type App = {
  runId: string;
  coverage: typeof import('../services/rentalPeriodCoverage');
  controllers: typeof import('../controllers/paymentController');
  agentController: typeof import('../controllers/agentController');
  Company: any;
  User: any;
  Property: any;
  Tenant: any;
  Lease: any;
  Payment: any;
  PropertyOwner: any;
  OwnerRentNotice: any;
  EventDedupRecord: any;
  JournalEntry: any;
  JournalLine: any;
  TaxObligation: any;
  VatRecord: any;
  PropertyAccount: any;
  CompanyAccount: any;
  accountingConnection: mongoose.Connection;
};

async function runTests(app: App) {
  const db = mongoose.connection.db!;
  const accountingDb = app.accountingConnection.db!;
  let buildInfo = '';
  try {
    const info = await db.command({ buildInfo: 1 });
    buildInfo = redact(JSON.stringify({ version: info.version, modules: info.modules, ok: info.ok }));
  } catch (error) {
    buildInfo = describeError(error);
  }
  const names = (await db.listCollections().toArray()).map((collection) => collection.name).sort();
  const accountingNames = (await accountingDb.listCollections().toArray()).map((collection) => collection.name).sort();
  emit({
    id: '01-metadata',
    status: mongoose.connection.db?.databaseName && app.accountingConnection.db?.databaseName ? 'PASS' : 'FAIL',
    operation: 'buildInfo and listCollections on both connections',
    response: `buildInfo=${buildInfo} mainCollections=${names.join(',') || '(none)'} accountingCollections=${accountingNames.join(',') || '(none)'}`,
    assertions: `main=${mongoose.connection.db?.databaseName} accounting=${app.accountingConnection.db?.databaseName}`,
  });

  const partitionMain = await readPartition(db, 'payments');
  const partitionLock = await readPartition(db, 'eventdeduprecords');
  const partitionJournal = await readPartition(db, 'journalentries');
  const partitionAccounting = await readPartition(accountingDb, 'propertyaccounts');
  const partitionKnown = [partitionMain, partitionLock, partitionJournal, partitionAccounting].every((item) => item.key);
  emit({
    id: '02-partition-keys-and-indexes',
    status: partitionKnown ? 'PASS' : 'UNVERIFIED',
    operation: "customAction GetCollection for payments, eventdeduprecords, journalentries, and propertyaccounts",
    response: JSON.stringify({
      payments: partitionMain,
      eventdeduprecords: partitionLock,
      journalentries: partitionJournal,
      propertyaccounts: partitionAccounting,
    }),
    assertions: partitionKnown
      ? 'each response included a partition or shard key'
      : 'no partition key was inferred',
    limitation: partitionKnown ? undefined : 'The server did not return a partition key. Index alignment with the partition key remains unverified.',
  });

  await guarded('03-unique-lock-index', 'unique lock index', () => testUniqueLock(app));
  await guarded('04-partial-reversal-index', 'partial reversal index', () => testReversalIndex(app));
  await guarded('05-concurrent-lock-acquisition', 'concurrent acquire', () => testConcurrentAcquire(app));
  await guarded('06-heartbeat-ownership', 'heartbeat', () => testHeartbeat(app));
  await guarded('07-expired-lock-recovery', 'expired lock recovery', () => testExpiry(app));

  const indexError = await ensureRuntimeIndexes(app);
  const fixtures = await createFixtures(app);
  if (!fixtures) {
    for (const id of ['09-overlapping-advances', '10-concurrent-controllers', '11-currency-and-lease-isolation', '12-duplicate-reversal', '13-reversal-idempotency']) {
      emit({
        id,
        status: 'FAIL',
        operation: 'create test company, property, tenant, and lease',
        response: 'fixture creation failed',
        assertions: 'no payment counts were accepted',
        limitation: indexError || undefined,
      });
    }
  } else {
    await guarded('09-overlapping-advances', 'overlapping advances', () => testAdvances(app, fixtures));
    await guarded('10-concurrent-controllers', 'concurrent controllers', () => testControllers(app, fixtures));
    await guarded('11-currency-and-lease-isolation', 'currency and lease isolation', () => testIsolation(app, fixtures));
    await guarded('12-duplicate-reversal', 'duplicate reversal', () => testReversal(app, fixtures));
    await cleanupFixtures(app, fixtures);
  }

  await guarded('14-transaction-or-code-20', 'transaction or code 20', () => testTransaction(app));
  await guarded('15-throttling', 'throttling', () => testThrottle(app));
  await guarded('16-process-termination', 'process termination', () => testProcessKill(app));
  await guarded('17-main-and-accounting-connections', 'connection consistency', () => testConnections(app));
  for (const id of TEST_IDS) {
    if (!results.some((row) => row.id === id)) {
      emit({
        id,
        status: 'FAIL',
        operation: 'missing result',
        response: indexError || 'the test did not record a result',
        assertions: 'no persisted-record assertion was recorded',
      });
    }
  }
}

async function guarded(id: string, operation: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (error) {
    if (!results.some((row) => row.id === id)) {
      emit({
        id,
        status: 'FAIL',
        operation,
        response: describeError(error),
        assertions: 'the operation threw before the persisted-record assertion',
      });
    }
  }
}

async function ensureRuntimeIndexes(app: App): Promise<string | null> {
  try {
    await app.Payment.collection.createIndex(
      { companyId: 1, idempotencyKey: 1 },
      { unique: true, name: 'companyId_1_idempotencyKey_1', partialFilterExpression: { idempotencyKey: { $exists: true, $type: 'string' } } }
    );
    await app.Payment.collection.createIndex(
      { companyId: 1, referenceNumber: 1 },
      {
        unique: true,
        name: 'companyId_1_referenceNumber_1',
        partialFilterExpression: { referenceNumber: { $exists: true, $type: 'string', $gt: '' } },
      }
    );
    await app.JournalEntry.collection.createIndex({ companyId: 1, reference: 1 }, { unique: true, name: 'companyId_1_reference_1' });
    await app.JournalEntry.collection.createIndex(
      { companyId: 1, sourceModule: 1, sourceId: 1 },
      { unique: true, sparse: true, name: 'companyId_1_sourceModule_1_sourceId_1' }
    );
    return null;
  } catch (error) {
    return describeError(error);
  }
}

async function readPartition(db: mongoose.mongo.Db, collection: string): Promise<{ key?: string; error?: string; indexes?: string[] }> {
  try {
    const result = await db.command({ customAction: 'GetCollection', collection });
    const key = result?.shardKey || result?.partitionKey || result?.collection?.shardKey || result?.indexes?.shardKey;
    const indexes = await db.collection(collection).indexes().catch(() => []);
    return {
      key: key ? JSON.stringify(key) : undefined,
      indexes: (indexes as Array<{ name?: string }>).map((index) => String(index.name)),
    };
  } catch (error) {
    let indexes: string[] = [];
    try {
      indexes = (await db.collection(collection).indexes()).map((index) => String(index.name));
    } catch {
      indexes = [];
    }
    return { error: describeError(error), indexes };
  }
}

async function testUniqueLock(app: App) {
  const eventId = `cosmos-lock-harness:${app.runId}:unique`;
  try {
    const created = await app.EventDedupRecord.collection.createIndex(
      { scope: 1, eventId: 1 },
      { unique: true, name: 'scope_1_eventId_1' }
    );
    await app.EventDedupRecord.create({
      scope: app.coverage.RENTAL_PERIOD_GUARD_SCOPE,
      eventId,
      status: 'processed',
      processedAt: new Date(),
      ownerToken: 'first',
    });
    let duplicate = '';
    try {
      await app.EventDedupRecord.create({
        scope: app.coverage.RENTAL_PERIOD_GUARD_SCOPE,
        eventId,
        status: 'processed',
        processedAt: new Date(),
        ownerToken: 'second',
      });
      duplicate = 'second insert succeeded';
    } catch (error) {
      duplicate = describeError(error);
    }
    const count = await app.EventDedupRecord.countDocuments({ scope: app.coverage.RENTAL_PERIOD_GUARD_SCOPE, eventId });
    emit({
      id: '03-unique-lock-index',
      status: count === 1 && duplicate.includes('code=11000') ? 'PASS' : 'FAIL',
      operation: 'createIndex {scope,eventId} unique, then two EventDedupRecord.create calls',
      response: `createIndex=${String(created)} duplicate=${duplicate}`,
      assertions: `lockRows=${count} expected=1 and duplicate code 11000`,
    });
  } catch (error) {
    emit({
      id: '03-unique-lock-index',
      status: 'FAIL',
      operation: 'createIndex {scope,eventId} unique',
      response: describeError(error),
      assertions: 'unique lock index was not enforced',
    });
  } finally {
    await app.EventDedupRecord.deleteMany({ eventId });
  }
}

async function testReversalIndex(app: App) {
  const reference = `COSMOSLOCK${app.runId}IDX`;
  try {
    const created = await app.Payment.collection.createIndex(
      { reversalOfPaymentId: 1 },
      {
        name: 'one_full_reversal_per_payment',
        unique: true,
        partialFilterExpression: { reversalOfPaymentId: { $exists: true }, amount: { $lt: 0 } },
      }
    );
    const originalId = new mongoose.Types.ObjectId();
    const base = {
      companyId: new mongoose.Types.ObjectId(),
      propertyId: new mongoose.Types.ObjectId(),
      tenantId: new mongoose.Types.ObjectId(),
      agentId: new mongoose.Types.ObjectId(),
      propertyType: 'residential',
      paymentType: 'rental',
      paymentMethod: 'cash',
      status: 'completed',
      postingStatus: 'posted',
      paymentDate: new Date('2034-01-15T00:00:00.000Z'),
      rentalPeriodMonth: 1,
      rentalPeriodYear: 2034,
      currency: 'USD',
      transactionDomain: 'RENTAL',
      commissionDetails: { totalCommission: 0, preaFee: 0, agentShare: 0, agencyShare: 0, ownerAmount: 10 },
    };
    await app.Payment.create({ ...base, amount: 10, referenceNumber: `${reference}-P`, depositAmount: 0 });
    await app.Payment.create({
      ...base,
      amount: -10,
      referenceNumber: `${reference}-R1`,
      reversalOfPaymentId: originalId,
      depositAmount: 0,
    });
    let duplicate = '';
    try {
      await app.Payment.create({
        ...base,
        amount: -10,
        referenceNumber: `${reference}-R2`,
        reversalOfPaymentId: originalId,
        depositAmount: 0,
      });
      duplicate = 'second negative REV succeeded';
    } catch (error) {
      duplicate = describeError(error);
    }
    const positive = await app.Payment.create({
      ...base,
      amount: 10,
      referenceNumber: `${reference}-C`,
      reversalOfPaymentId: originalId,
      isCorrectionEntry: true,
      status: 'pending',
      postingStatus: 'draft',
      depositAmount: 0,
    });
    const negatives = await app.Payment.countDocuments({ reversalOfPaymentId: originalId, amount: { $lt: 0 } });
    emit({
      id: '04-partial-reversal-index',
      status: negatives === 1 && duplicate.includes('code=11000') && positive ? 'PASS' : 'FAIL',
      operation: 'createIndex one_full_reversal_per_payment, two negative REV inserts, one positive correction',
      response: `createIndex=${String(created)} duplicate=${duplicate}`,
      assertions: `negativeReversals=${negatives} expected=1; positive correction persisted=${Boolean(positive)}`,
    });
  } catch (error) {
    emit({
      id: '04-partial-reversal-index',
      status: 'FAIL',
      operation: 'create partial unique reversal index and duplicate REV insert',
      response: describeError(error),
      assertions: 'one negative REV was not enforced',
    });
  } finally {
    await app.Payment.deleteMany({ referenceNumber: new RegExp(`^${reference}`) });
  }
}

async function testConcurrentAcquire(app: App) {
  const key = `cosmos-lock-harness:${app.runId}:race`;
  let busy = '';
  let secondRelease: (() => Promise<void>) | null = null;
  const first = await app.coverage.acquireRentalPeriodGuard(key, { heartbeatMs: 0, waitMs: 500 });
  try {
    secondRelease = await app.coverage.acquireRentalPeriodGuard(key, { heartbeatMs: 0, waitMs: 200 });
    busy = 'second acquire succeeded';
  } catch (error) {
    busy = describeError(error);
  }
  const owners = await app.EventDedupRecord.countDocuments({ scope: app.coverage.RENTAL_PERIOD_GUARD_SCOPE, eventId: key });
  emit({
    id: '05-concurrent-lock-acquisition',
    status: owners === 1 && busy.includes('RENTAL_PERIOD_BUSY') ? 'PASS' : 'FAIL',
    operation: 'two acquireRentalPeriodGuard calls for one key',
    response: busy,
    assertions: `lockRows=${owners} expected=1`,
  });
  await first();
  if (secondRelease) await secondRelease();
}

async function testHeartbeat(app: App) {
  const key = `cosmos-lock-harness:${app.runId}:beat`;
  const release = await app.coverage.acquireRentalPeriodGuard(key, { leaseMs: 80, heartbeatMs: 25, waitMs: 500 });
  const before = await app.EventDedupRecord.findOne({ scope: app.coverage.RENTAL_PERIOD_GUARD_SCOPE, eventId: key }).lean();
  await sleep(190);
  let intruder = '';
  try {
    const extra = await app.coverage.acquireRentalPeriodGuard(key, { heartbeatMs: 0, waitMs: 100 });
    intruder = 'intruder acquired';
    await extra();
  } catch (error) {
    intruder = describeError(error);
  }
  const after = await app.EventDedupRecord.findOne({ scope: app.coverage.RENTAL_PERIOD_GUARD_SCOPE, eventId: key }).lean();
  emit({
    id: '06-heartbeat-ownership',
    status: String(before?.ownerToken || '') !== '' && String(before?.ownerToken) === String(after?.ownerToken) && intruder.includes('RENTAL_PERIOD_BUSY') ? 'PASS' : 'FAIL',
    operation: 'acquireRentalPeriodGuard with heartbeat, then a second acquire after the lease interval',
    response: intruder,
    assertions: `ownerUnchanged=${String(before?.ownerToken) === String(after?.ownerToken)}`,
  });
  await release();
}

async function testExpiry(app: App) {
  const key = `cosmos-lock-harness:${app.runId}:expire`;
  const first = await app.coverage.acquireRentalPeriodGuard(key, { heartbeatMs: 0, leaseMs: 60000, waitMs: 500 });
  const oldToken = String((await app.EventDedupRecord.findOne({ scope: app.coverage.RENTAL_PERIOD_GUARD_SCOPE, eventId: key }).lean())?.ownerToken || '');
  await app.EventDedupRecord.updateOne(
    { scope: app.coverage.RENTAL_PERIOD_GUARD_SCOPE, eventId: key, ownerToken: oldToken },
    { $set: { processedAt: new Date(Date.now() - 1000) } }
  );
  const second = await app.coverage.acquireRentalPeriodGuard(key, { heartbeatMs: 0, leaseMs: 60000, waitMs: 1000 });
  const current = String((await app.EventDedupRecord.findOne({ scope: app.coverage.RENTAL_PERIOD_GUARD_SCOPE, eventId: key }).lean())?.ownerToken || '');
  await first();
  const afterOldRelease = String((await app.EventDedupRecord.findOne({ scope: app.coverage.RENTAL_PERIOD_GUARD_SCOPE, eventId: key }).lean())?.ownerToken || '');
  emit({
    id: '07-expired-lock-recovery',
    status: current !== '' && current !== oldToken ? 'PASS' : 'FAIL',
    operation: 'expire processedAt, then acquireRentalPeriodGuard',
    response: `oldTokenKept=${current === oldToken}`,
    assertions: `newOwner=${current !== oldToken}`,
  });
  emit({
    id: '08-old-owner-release',
    status: afterOldRelease === current && current !== '' ? 'PASS' : 'FAIL',
    operation: 'previous owner release after takeover',
    response: `tokenAfterOldRelease=${afterOldRelease === current}`,
    assertions: `ownerRemains=${afterOldRelease === current}`,
  });
  await second();
}

type Fixtures = {
  company: any;
  property: any;
  tenant: any;
  lease: any;
  otherLease: any;
  admin: any;
  agent: any;
  owner: any;
};

async function createFixtures(app: App): Promise<Fixtures | null> {
  try {
    const admin = await app.User.create({
      email: `cosmos-lock-admin-${app.runId}@example.test`,
      password: 'test-pass-1',
      firstName: 'Cosmos',
      lastName: 'Admin',
      role: 'admin',
      roles: ['admin', 'accountant'],
      isActive: true,
      sessionVersion: 1,
    });
    const agent = await app.User.create({
      email: `cosmos-lock-agent-${app.runId}@example.test`,
      password: 'test-pass-1',
      firstName: 'Cosmos',
      lastName: 'Agent',
      role: 'agent',
      roles: ['agent'],
      isActive: true,
      sessionVersion: 1,
    });
    const company = await app.Company.create({
      name: `Cosmos Lock Harness ${app.runId}`,
      address: '1 Harness Street',
      phone: '0770000099',
      email: `cosmos-lock-${app.runId}@example.test`,
      registrationNumber: `CLK${app.runId}`,
      tinNumber: `CLKTIN${app.runId}`,
      country: 'Zimbabwe',
      ownerId: admin._id,
      workspaceType: 'agency',
    });
    const property = await app.Property.create({
      companyId: company._id,
      ownerId: admin._id,
      agentId: agent._id,
      name: `Harness House ${app.runId}`,
      address: '1 Harness Road',
      rentalType: 'management',
      rent: 100,
      commission: 0,
      vatOnCommission: false,
    });
    const tenant = await app.Tenant.create({
      firstName: 'Harness',
      lastName: 'Tenant',
      email: `cosmos-lock-tenant-${app.runId}@example.test`,
      phone: '0771111199',
      companyId: company._id,
      ownerId: admin._id,
      status: 'Active',
    });
    const lease = await app.Lease.create({
      propertyId: property._id,
      tenantId: tenant._id,
      companyId: company._id,
      ownerId: admin._id,
      startDate: new Date('2034-01-01T00:00:00.000Z'),
      endDate: new Date('2034-12-31T00:00:00.000Z'),
      rentAmount: 100,
      depositAmount: 0,
      status: 'active',
    });
    const otherLease = await app.Lease.create({
      propertyId: property._id,
      tenantId: tenant._id,
      companyId: company._id,
      ownerId: admin._id,
      startDate: new Date('2035-01-01T00:00:00.000Z'),
      endDate: new Date('2035-12-31T00:00:00.000Z'),
      rentAmount: 100,
      depositAmount: 0,
      status: 'active',
    });
    const owner = await app.PropertyOwner.create({
      email: `cosmos-lock-owner-${app.runId}@example.test`,
      password: 'test-pass-1',
      firstName: 'Harness',
      lastName: 'Owner',
      phone: '0772222299',
      companyId: company._id,
      properties: [property._id],
      active: true,
    });
    return { company, property, tenant, lease, otherLease, admin, agent, owner };
  } catch (error) {
    console.log(`fixture error: ${describeError(error)}`);
    return null;
  }
}

function adminUser(fixtures: Fixtures) {
  return {
    userId: String(fixtures.admin._id),
    companyId: String(fixtures.company._id),
    role: 'admin',
    roles: ['admin', 'accountant'],
  };
}

function leaseRequest(app: App, fixtures: Fixtures, month: number, year: number, extra: Record<string, unknown> = {}) {
  return {
    user: adminUser(fixtures),
    body: {
      leaseId: String(fixtures.lease._id),
      amount: 100,
      paymentDate: '2034-03-20',
      paymentMethod: 'cash',
      status: 'completed',
      rentalPeriodMonth: month,
      rentalPeriodYear: year,
      currency: 'USD',
      idempotencyKey: `cosmos:${app.runId}:${year}:${month}:${new mongoose.Types.ObjectId().toString()}`,
      ...extra,
    },
  };
}

async function invoke(handler: any, req: any) {
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) { this.statusCode = code; return this; },
    json(body: any) { this.body = body; return this; },
  };
  try {
    await handler(req, res);
  } catch (error) {
    if (res.body === undefined) {
      res.statusCode = 500;
      res.body = { message: describeError(error) };
    }
  }
  return res;
}

async function ledgerState(app: App, companyId: unknown) {
  const lines = await app.JournalLine.find({ companyId }).select('debit credit').lean();
  const debit = lines.reduce((sum: number, line: { debit?: number }) => sum + Number(line.debit || 0), 0);
  const credit = lines.reduce((sum: number, line: { credit?: number }) => sum + Number(line.credit || 0), 0);
  const journals = await app.JournalEntry.countDocuments({ companyId });
  const vatRows = await app.VatRecord.find({ companyId }).select('vatCollected vatPaid status').lean();
  const vatReversal = vatRows
    .filter((row: { status?: string }) => row.status === 'reversed')
    .reduce((sum: number, row: { vatCollected?: number; vatPaid?: number }) => sum + Number(row.vatCollected || 0) + Number(row.vatPaid || 0), 0);
  const taxRows = await app.TaxObligation.find({ companyId }).select('status reversalOf').lean();
  const property = await app.PropertyAccount.findOne({ companyId }).select('netOwnerBalance runningBalance transactions').lean();
  const company = await app.CompanyAccount.findOne({ companyId }).select('runningBalance totalIncome transactions').lean();
  const reversalNotices = await app.OwnerRentNotice.countDocuments({ companyId, idempotencyKey: /^owner-rent-reversal:/ });
  const rentNotices = await app.OwnerRentNotice.countDocuments({ companyId, idempotencyKey: /^owner-rent-payment:/ });
  return {
    journals,
    debit: Number(debit.toFixed(2)),
    credit: Number(credit.toFixed(2)),
    vatRows: vatRows.length,
    vatReversal: Number(vatReversal.toFixed(2)),
    tax: taxRows.map((row: { status?: string; reversalOf?: unknown }) => `${row.status}${row.reversalOf ? ':reversal' : ''}`).join(',') || 'none',
    taxCount: taxRows.length,
    propertyFound: Boolean(property),
    ownerBalance: property ? Number(property.netOwnerBalance || 0) : null,
    propertyTransactions: Array.isArray(property?.transactions) ? property.transactions.length : 0,
    companyFound: Boolean(company),
    companyBalance: company ? Number(company.runningBalance || 0) : null,
    reversalNotices,
    rentNotices,
  };
}

async function snapshot(app: App, fixtures: Fixtures, month: number, year: number) {
  const companyId = fixtures.company._id;
  const payments = await app.Payment.countDocuments({
    companyId,
    rentalPeriodMonth: month,
    rentalPeriodYear: year,
    amount: { $gt: 0 },
    reversalOfPaymentId: { $exists: false },
  });
  const coverage = await app.coverage.sumRentCoverageForPeriod({
    companyId,
    propertyId: fixtures.property._id,
    tenantId: fixtures.tenant._id,
    rentalPeriodMonth: month,
    rentalPeriodYear: year,
  });
  const journals = await app.JournalEntry.countDocuments({ companyId });
  const notices = await app.OwnerRentNotice.countDocuments({ companyId });
  const vat = await app.VatRecord.countDocuments({ companyId });
  const tax = await app.TaxObligation.countDocuments({ companyId });
  return { payments, coverage, journals, notices, vat, tax };
}

async function testAdvances(app: App, fixtures: Fixtures) {
  const left = leaseRequest(app, fixtures, 5, 2034, {
    amount: 200,
    advanceMonthsPaid: 2,
    advancePeriodStart: { month: 5, year: 2034 },
    advancePeriodEnd: { month: 6, year: 2034 },
  });
  const right = leaseRequest(app, fixtures, 6, 2034, {
    amount: 200,
    advanceMonthsPaid: 2,
    advancePeriodStart: { month: 6, year: 2034 },
    advancePeriodEnd: { month: 7, year: 2034 },
  });
  const [a, b] = await Promise.all([
    invoke(app.controllers.createPayment, left),
    invoke(app.controllers.createPayment, right),
  ]);
  const advances = await app.Payment.countDocuments({
    companyId: fixtures.company._id,
    rentalPeriodYear: 2034,
    advanceMonthsPaid: { $gt: 1 },
    amount: { $gt: 0 },
  });
  const june = await app.coverage.sumRentCoverageForPeriod({
    companyId: fixtures.company._id,
    propertyId: fixtures.property._id,
    tenantId: fixtures.tenant._id,
    rentalPeriodMonth: 6,
    rentalPeriodYear: 2034,
  });
  const books = await ledgerState(app, fixtures.company._id);
  emit({
    id: '09-overlapping-advances',
    status: advances === 1 && june === 100 ? 'PASS' : 'FAIL',
    operation: 'two concurrent createPayment advance ranges',
    response: `statuses=${a.statusCode}/${b.statusCode} ${redact(String(a.body?.message || ''))} ${redact(String(b.body?.message || ''))}`,
    assertions: `advancePayments=${advances} juneCoverage=${june} journals=${books.journals} debit=${books.debit} credit=${books.credit} vatReversal=${books.vatReversal} tax=${books.tax} ownerBalance=${String(books.ownerBalance)} reversalNotices=${books.reversalNotices}`,
  });
}

async function testControllers(app: App, fixtures: Fixtures) {
  const pairs: Array<[string, number, any, any]> = [
    ['lease', 1, app.controllers.createPayment, leaseRequest(app, fixtures, 1, 2034)],
    ['public', 2, app.controllers.createPaymentPublic, leaseRequest(app, fixtures, 2, 2034)],
    ['accountant', 3, app.controllers.createPaymentAccountant, {
      user: adminUser(fixtures),
      body: {
        propertyId: String(fixtures.property._id),
        tenantId: String(fixtures.tenant._id),
        agentId: String(fixtures.agent._id),
        amount: 100,
        paymentDate: '2034-03-20',
        paymentMethod: 'cash',
        paymentType: 'rental',
        rentalPeriodMonth: 3,
        rentalPeriodYear: 2034,
        currency: 'USD',
        idempotencyKey: `cosmos-acc:${app.runId}:${new mongoose.Types.ObjectId().toString()}`,
      },
    }],
    ['agent', 4, app.agentController.createAgentPayment, {
      user: { userId: String(fixtures.agent._id), companyId: String(fixtures.company._id), role: 'agent', roles: ['agent'] },
      headers: {},
      body: {
        propertyId: String(fixtures.property._id),
        tenantId: String(fixtures.tenant._id),
        amount: 100,
        paymentDate: '2034-03-20',
        paymentMethod: 'cash',
        paymentType: 'rental',
        status: 'completed',
        rentalPeriodMonth: 4,
        rentalPeriodYear: 2034,
        currency: 'USD',
        idempotencyKey: `cosmos-agent:${app.runId}:${new mongoose.Types.ObjectId().toString()}`,
      },
    }],
  ];
  const details: string[] = [];
  let pass = true;
  for (const [label, month, handler, request] of pairs) {
    const other = JSON.parse(JSON.stringify(request));
    other.body.idempotencyKey = `${request.body.idempotencyKey}:b`;
    const [a, b] = await Promise.all([invoke(handler, request), invoke(handler, other)]);
    const snap = await snapshot(app, fixtures, month, 2034);
    details.push(`${label} http=${a.statusCode}/${b.statusCode} payments=${snap.payments} coverage=${snap.coverage} journals=${snap.journals} notices=${snap.notices} vat=${snap.vat} tax=${snap.tax}`);
    if (snap.payments !== 1 || snap.coverage !== 100) pass = false;
  }
  emit({
    id: '10-concurrent-controllers',
    status: pass ? 'PASS' : 'FAIL',
    operation: 'concurrent createPayment, createPaymentPublic, createPaymentAccountant, and createAgentPayment',
    response: details.join(' | '),
    assertions: 'each path persisted exactly one positive payment and coverage 100',
  });
}

async function testIsolation(app: App, fixtures: Fixtures) {
  const omittedLease = {
    user: adminUser(fixtures),
    body: {
      propertyId: String(fixtures.property._id),
      tenantId: String(fixtures.tenant._id),
      agentId: String(fixtures.agent._id),
      amount: 100,
      paymentDate: '2034-08-20',
      paymentMethod: 'cash',
      paymentType: 'rental',
      rentalPeriodMonth: 8,
      rentalPeriodYear: 2034,
      currency: 'USD',
      idempotencyKey: `cosmos-nolease:${app.runId}`,
    },
  };
  const withLease = leaseRequest(app, fixtures, 8, 2034);
  const [leaseResult, omittedResult] = await Promise.all([
    invoke(app.controllers.createPayment, withLease),
    invoke(app.controllers.createPaymentAccountant, omittedLease),
  ]);
  const omittedSnap = await snapshot(app, fixtures, 8, 2034);
  const usd = await invoke(app.controllers.createPayment, leaseRequest(app, fixtures, 9, 2034, { currency: 'USD' }));
  const zwl = await invoke(app.controllers.createPayment, leaseRequest(app, fixtures, 9, 2034, { currency: 'ZWL' }));
  const usdCoverage = await app.coverage.sumRentCoverageForPeriod({
    companyId: fixtures.company._id,
    propertyId: fixtures.property._id,
    tenantId: fixtures.tenant._id,
    rentalPeriodMonth: 9,
    rentalPeriodYear: 2034,
    currency: 'USD',
  });
  const zwlCoverage = await app.coverage.sumRentCoverageForPeriod({
    companyId: fixtures.company._id,
    propertyId: fixtures.property._id,
    tenantId: fixtures.tenant._id,
    rentalPeriodMonth: 9,
    rentalPeriodYear: 2034,
    currency: 'ZWL',
  });
  const secondLease = await invoke(app.controllers.createPayment, leaseRequest(app, fixtures, 10, 2034, { leaseId: String(fixtures.otherLease._id) }));
  const firstLease = await invoke(app.controllers.createPayment, leaseRequest(app, fixtures, 10, 2034));
  const leasePayments = await app.Payment.countDocuments({
    companyId: fixtures.company._id,
    rentalPeriodMonth: 10,
    rentalPeriodYear: 2034,
    amount: { $gt: 0 },
  });
  const storedCurrencies = (await app.Payment.find({
    companyId: fixtures.company._id,
    rentalPeriodMonth: 9,
    rentalPeriodYear: 2034,
    amount: { $gt: 0 },
  }).select('currency').lean()).map((row: { currency?: string }) => String(row.currency || '')).sort();
  const pass = omittedSnap.payments === 1
    && usd.statusCode === 201
    && zwl.statusCode === 201
    && usdCoverage === 100
    && zwlCoverage === 100
    && storedCurrencies.join(',') === 'USD,ZWL'
    && leasePayments === 2;
  emit({
    id: '11-currency-and-lease-isolation',
    status: pass ? 'PASS' : 'FAIL',
    operation: 'concurrent omitted-lease create, sequential USD and ZWL creates, two known leases',
    response: `omitted=${leaseResult.statusCode}/${omittedResult.statusCode} usd=${usd.statusCode} zwl=${zwl.statusCode} leases=${firstLease.statusCode}/${secondLease.statusCode}`,
    assertions: `omittedPayments=${omittedSnap.payments} usdCoverage=${usdCoverage} zwlCoverage=${zwlCoverage} storedCurrencies=${storedCurrencies.join(',') || '(none)'} knownLeasePayments=${leasePayments}`,
  });
}

async function testReversal(app: App, fixtures: Fixtures) {
  const created = await invoke(app.controllers.createPayment, leaseRequest(app, fixtures, 11, 2034));
  const paymentId = created.body?.payment?._id;
  if (!paymentId) {
    emit({
      id: '12-duplicate-reversal',
      status: 'FAIL',
      operation: 'createPayment before reversePayment',
      response: `status=${created.statusCode} ${redact(String(created.body?.message || ''))}`,
      assertions: 'no original payment was persisted',
    });
    emit({
      id: '13-reversal-idempotency',
      status: 'FAIL',
      operation: 'not executed because the original payment was not created',
      response: 'skipped',
      assertions: 'no reversal records inspected',
    });
    return;
  }
  const originalBefore = await app.Payment.findById(paymentId).lean();
  const request = {
    user: adminUser(fixtures),
    params: { id: String(paymentId) },
    body: { reason: 'cosmos harness duplicate receipt' },
  };
  const [first, second] = await Promise.all([
    invoke(app.controllers.reversePayment, request),
    invoke(app.controllers.reversePayment, { ...request, body: { reason: 'cosmos harness duplicate receipt' } }),
  ]);
  const negatives = await app.Payment.countDocuments({ companyId: fixtures.company._id, reversalOfPaymentId: paymentId, amount: { $lt: 0 } });
  const corrections = await app.Payment.countDocuments({ companyId: fixtures.company._id, referenceNumber: new RegExp('^CORR-'), isCorrectionEntry: true });
  const originalAfter = await app.Payment.findById(paymentId).lean();
  const books = await ledgerState(app, fixtures.company._id);
  const amountUnchanged = Number(originalAfter?.amount) === Number(originalBefore?.amount)
    && Number(originalAfter?.commissionDetails?.totalCommission || 0) === Number(originalBefore?.commissionDetails?.totalCommission || 0);
  const reversed = String(originalAfter?.reversalState || '') === 'reversed';
  const balanced = books.journals > 0 && books.debit > 0 && Math.abs(books.debit - books.credit) < 0.009;
  const firstSettled = negatives === 1
    && corrections === 1
    && amountUnchanged
    && reversed
    && balanced
    && books.vatReversal === 0
    && books.taxCount === 0
    && books.propertyFound
    && books.ownerBalance === 0
    && (books.companyBalance === null || books.companyBalance === 0)
    && books.reversalNotices === 1;
  emit({
    id: '12-duplicate-reversal',
    status: firstSettled ? 'PASS' : 'FAIL',
    operation: 'two concurrent reversePayment calls',
    response: `statuses=${first.statusCode}/${second.statusCode} ${redact(String(first.body?.message || first.body?.outcome || ''))}`,
    assertions: `negativeReversals=${negatives} corrections=${corrections} amountUnchanged=${amountUnchanged} reversalState=${String(originalAfter?.reversalState || '')} journals=${books.journals} debit=${books.debit} credit=${books.credit} vatReversal=${books.vatReversal} tax=${books.tax} ownerBalance=${String(books.ownerBalance)} companyBalance=${String(books.companyBalance)} reversalNotices=${books.reversalNotices} rentNotices=${books.rentNotices}`,
  });
  const retry = await invoke(app.controllers.reversePayment, request);
  const afterNegatives = await app.Payment.countDocuments({ companyId: fixtures.company._id, reversalOfPaymentId: paymentId, amount: { $lt: 0 } });
  const afterCorrections = await app.Payment.countDocuments({ companyId: fixtures.company._id, referenceNumber: new RegExp('^CORR-'), isCorrectionEntry: true });
  const afterBooks = await ledgerState(app, fixtures.company._id);
  const afterOriginal = await app.Payment.findById(paymentId).lean();
  const stable = afterNegatives === negatives
    && afterCorrections === corrections
    && afterBooks.journals === books.journals
    && afterBooks.debit === books.debit
    && afterBooks.credit === books.credit
    && afterBooks.vatReversal === books.vatReversal
    && afterBooks.taxCount === books.taxCount
    && afterBooks.ownerBalance === books.ownerBalance
    && afterBooks.companyBalance === books.companyBalance
    && afterBooks.reversalNotices === books.reversalNotices
    && Number(afterOriginal?.amount) === Number(originalBefore?.amount);
  emit({
    id: '13-reversal-idempotency',
    status: firstSettled && stable ? 'PASS' : 'FAIL',
    operation: 'repeat reversePayment for the same original',
    response: `status=${retry.statusCode} outcome=${redact(String(retry.body?.outcome || retry.body?.message || ''))}`,
    assertions: `rev=${afterNegatives} corr=${afterCorrections} journals=${afterBooks.journals} debit=${afterBooks.debit} credit=${afterBooks.credit} vatReversal=${afterBooks.vatReversal} tax=${afterBooks.tax} ownerBalance=${String(afterBooks.ownerBalance)} reversalNotices=${afterBooks.reversalNotices}`,
  });
}

async function testTransaction(app: App) {
  const markerId = `cosmos-lock-harness:${app.runId}:tx`;
  let mode = '';
  try {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await app.EventDedupRecord.create([{
          scope: 'cosmos-lock-harness-tx',
          eventId: markerId,
          status: 'processed',
          ownerToken: 'tx',
          processedAt: new Date(),
        }], { session });
      });
      mode = 'transaction-committed';
    } catch (error) {
      const err = error as { code?: unknown; message?: unknown };
      const unsupported = Number(err?.code) === 20 || /transaction numbers are only allowed/i.test(String(err?.message || ''));
      mode = unsupported ? `code-20 ${describeError(error)}` : `transaction-error ${describeError(error)}`;
      if (unsupported) {
        await app.EventDedupRecord.create({
          scope: 'cosmos-lock-harness-tx',
          eventId: markerId,
          status: 'processed',
          ownerToken: 'sequential',
          processedAt: new Date(),
        });
      }
    } finally {
      await session.endSession();
    }
    const count = await app.EventDedupRecord.countDocuments({ scope: 'cosmos-lock-harness-tx', eventId: markerId });
    emit({
      id: '14-transaction-or-code-20',
      status: count === 1 && (mode === 'transaction-committed' || mode.startsWith('code-20')) ? 'PASS' : 'FAIL',
      operation: 'mongoose session.withTransaction insert, with the application code-20 sequential fallback',
      response: mode,
      assertions: `markerRows=${count} expected=1`,
      limitation: 'This uses the same session API as reversePayment. It does not rewrite historical journals.',
    });
  } catch (error) {
    emit({
      id: '14-transaction-or-code-20',
      status: 'FAIL',
      operation: 'startSession',
      response: describeError(error),
      assertions: 'no transaction result was recorded',
    });
  } finally {
    await app.EventDedupRecord.deleteMany({ scope: 'cosmos-lock-harness-tx', eventId: markerId });
  }
}

async function testThrottle(app: App) {
  const key = `cosmos-lock-harness:${app.runId}:throttle`;
  let sawThrottle = false;
  let last = '';
  const release = await app.coverage.acquireRentalPeriodGuard(key, { heartbeatMs: 0, waitMs: 300 });
  await Promise.all([0, 1, 2, 3].map(async () => {
    try {
      const extra = await app.coverage.acquireRentalPeriodGuard(key, { heartbeatMs: 0, waitMs: 200 });
      await extra();
      last = 'acquire succeeded';
    } catch (error) {
      last = describeError(error);
      if (last.includes('code=16500') || last.includes('code=429')) sawThrottle = true;
    }
  }));
  await release();
  emit({
    id: '15-throttling',
    status: sawThrottle ? 'PASS' : 'UNVERIFIED',
    operation: 'concurrent acquireRentalPeriodGuard while one owner is held',
    response: last,
    assertions: sawThrottle ? 'a 16500 or 429 response was observed from the driver' : 'no 16500 or 429 was returned',
    limitation: sawThrottle ? undefined : 'The harness does not inject a synthetic throttle and does not change account throughput.',
  });
}

async function testProcessKill(app: App) {
  const key = `cosmos-lock-harness:${app.runId}:killed`;
  const child = spawn(process.execPath, ['-r', 'ts-node/register/transpile-only', path.resolve(__dirname, 'runCosmosLockCompatibilityTests.ts')], {
    env: {
      ...process.env,
      COSMOS_LOCK_HARNESS_ROLE: 'hold-lock',
      COSMOS_LOCK_HOLD_KEY: key,
    },
    cwd: path.resolve(__dirname, '../..'),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const ready = await waitForLock(app, key, child);
  if (!ready) {
    child.kill('SIGKILL');
    emit({
      id: '16-process-termination',
      status: 'FAIL',
      operation: 'spawn a child that holds acquireRentalPeriodGuard, then kill it',
      response: 'child did not report the lock',
      assertions: 'recovery was not attempted',
    });
    return;
  }
  child.kill('SIGKILL');
  await sleep(app.coverage.RENTAL_GUARD_DEFAULTS.leaseMs + 10000);
  let recovered = '';
  let release: (() => Promise<void>) | null = null;
  try {
    release = await app.coverage.acquireRentalPeriodGuard(key);
    recovered = 'acquired';
  } catch (error) {
    recovered = describeError(error);
  }
  const rows = await app.EventDedupRecord.countDocuments({ scope: app.coverage.RENTAL_PERIOD_GUARD_SCOPE, eventId: key });
  emit({
    id: '16-process-termination',
    status: recovered === 'acquired' && rows === 1 ? 'PASS' : 'FAIL',
    operation: 'kill the holder and acquire after the 60 second lease',
    response: recovered,
    assertions: `lockRows=${rows} expected=1 after recovery`,
  });
  if (release) await release();
}

function waitForLock(app: App, key: string, child: ChildProcess): Promise<boolean> {
  if (child.exitCode !== null) return Promise.resolve(false);
  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    let poll: ReturnType<typeof setInterval>;
    const finish = (held: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(poll);
      resolve(held);
    };
    timer = setTimeout(() => finish(false), 30000);
    poll = setInterval(() => {
      void app.EventDedupRecord.findOne({ scope: app.coverage.RENTAL_PERIOD_GUARD_SCOPE, eventId: key }).lean()
        .then((row: unknown) => { if (row) finish(true); })
        .catch(() => undefined);
    }, 500);
    child.once('exit', () => finish(false));
  });
}

async function testConnections(app: App) {
  const marker = `cosmos-lock-harness:${app.runId}:connection`;
  await app.EventDedupRecord.create({
    scope: 'cosmos-lock-harness-connection',
    eventId: marker,
    status: 'processed',
    ownerToken: 'main',
    processedAt: new Date(),
  });
  const onMain = await app.EventDedupRecord.countDocuments({ scope: 'cosmos-lock-harness-connection', eventId: marker });
  const onAccounting = await app.accountingConnection.collection('eventdeduprecords').countDocuments({
    scope: 'cosmos-lock-harness-connection',
    eventId: marker,
  }).catch(() => 0);
  const sameDb = mongoose.connection.db?.databaseName === app.accountingConnection.db?.databaseName;
  emit({
    id: '17-main-and-accounting-connections',
    status: !sameDb && onMain === 1 && onAccounting === 0 ? 'PASS' : 'FAIL',
    operation: 'insert a harness marker on the main connection and read it from the accounting connection',
    response: `mainDb=${mongoose.connection.db?.databaseName} accountingDb=${app.accountingConnection.db?.databaseName}`,
    assertions: `mainRows=${onMain} accountingRows=${onAccounting} databasesDiffer=${!sameDb}`,
  });
  await app.EventDedupRecord.deleteMany({ scope: 'cosmos-lock-harness-connection', eventId: marker });
}

async function cleanupFixtures(app: App, fixtures: Fixtures) {
  const company = await app.Company.findById(fixtures.company._id).select('name registrationNumber').lean();
  if (!company || String(company.name) !== `Cosmos Lock Harness ${app.runId}` || String(company.registrationNumber) !== `CLK${app.runId}`) {
    console.log('Cleanup skipped because the company identity did not match this run. No database was dropped.');
    return;
  }
  const companyId = fixtures.company._id;
  const owned = [
    app.Payment,
    app.OwnerRentNotice,
    app.JournalEntry,
    app.JournalLine,
    app.VatRecord,
    app.TaxObligation,
    app.Lease,
    app.PropertyOwner,
    app.Tenant,
    app.Property,
  ];
  for (const model of owned) {
    await model.collection.deleteMany({ companyId });
  }
  await app.EventDedupRecord.collection.deleteMany({
    scope: app.coverage.RENTAL_PERIOD_GUARD_SCOPE,
    eventId: new RegExp(`^${String(companyId)}:`),
  });
  await app.EventDedupRecord.collection.deleteMany({
    eventId: new RegExp(`^cosmos-lock-harness:${app.runId}`),
  });
  await app.PropertyAccount.collection.deleteMany({ companyId });
  await app.CompanyAccount.collection.deleteMany({ companyId });
  await app.Company.collection.deleteMany({ _id: companyId, name: `Cosmos Lock Harness ${app.runId}` });
  await app.User.collection.deleteMany({ email: new RegExp(`cosmos-lock-(admin|agent)-${app.runId}@example\\.test$`) });
}

main().catch(async (error) => {
  console.log(`FAIL harness ${describeError(error)}`);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
