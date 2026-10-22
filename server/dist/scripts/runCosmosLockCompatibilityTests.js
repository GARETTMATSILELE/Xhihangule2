"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
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
const child_process_1 = require("child_process");
const crypto_1 = require("crypto");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const mongoose_1 = __importDefault(require("mongoose"));
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
];
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
const results = [];
function redact(value) {
    return value.replace(/mongodb(\+srv)?:\/\/[^\s'"]+/gi, '[redacted-uri]').slice(0, 500);
}
function describeError(error) {
    var _a, _b, _c, _d, _e;
    const err = error;
    const nested = (_b = (_a = err === null || err === void 0 ? void 0 : err.writeErrors) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.code;
    return redact(`code=${String((_d = (_c = err === null || err === void 0 ? void 0 : err.code) !== null && _c !== void 0 ? _c : nested) !== null && _d !== void 0 ? _d : '')} name=${String((_e = err === null || err === void 0 ? void 0 : err.codeName) !== null && _e !== void 0 ? _e : '')} ${String((err === null || err === void 0 ? void 0 : err.message) || error || '')}`);
}
function emit(row) {
    results.push(row);
    console.log(`${row.status} ${row.id}`);
    console.log(`  operation: ${row.operation}`);
    console.log(`  response: ${row.response}`);
    console.log(`  assertions: ${row.assertions}`);
    if (row.limitation)
        console.log(`  limitation: ${row.limitation}`);
}
function markAll(status, response, limitation) {
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
function parseMongoUri(raw) {
    try {
        const parsed = new URL(raw.trim());
        const db = decodeURIComponent(parsed.pathname.replace(/^\//, '').split('/')[0] || '').toLowerCase();
        return { host: parsed.hostname.toLowerCase(), db };
    }
    catch (_a) {
        return null;
    }
}
function isCosmosHost(host) {
    return host.endsWith('.mongo.cosmos.azure.com') || host.endsWith('.mongocluster.cosmos.azure.com');
}
function identitiesFromText(text) {
    const found = [];
    for (const line of text.split(/\r?\n/)) {
        const match = line.match(/^\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=\s*(.*)$/);
        if (!match || !PRODUCTION_URI_KEYS.includes(match[1]))
            continue;
        let value = match[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        const parsed = parseMongoUri(value);
        if (parsed)
            found.push(parsed);
    }
    return found;
}
function discoveredProductionTargets() {
    const found = [];
    for (const key of PRODUCTION_URI_KEYS) {
        const value = process.env[key];
        if (!value)
            continue;
        const parsed = parseMongoUri(value);
        if (parsed)
            found.push(parsed);
    }
    const files = [
        path_1.default.resolve(__dirname, '../../.env'),
        path_1.default.resolve(__dirname, '../../.env.local'),
        path_1.default.resolve(__dirname, '../../.env.production'),
        path_1.default.resolve(__dirname, '../../../.env'),
        path_1.default.resolve(__dirname, '../../../.env.production'),
    ];
    for (const file of files) {
        if (!fs_1.default.existsSync(file))
            continue;
        found.push(...identitiesFromText(fs_1.default.readFileSync(file, 'utf8')));
    }
    return found;
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function blankEmailProviders() {
    for (const key of [
        'SMTP_HOST', 'SMTP_HOST_MANTIS', 'SMTP_USER', 'SMTP_USER_MANTIS', 'SMTP_PASS', 'SMTP_PASS_MANTIS',
        'RESEND_API_KEY', 'RESEND_API_KEY_MANTIS', 'SENDGRID_API_KEY', 'SENDGRID_API_KEY_MANTIS',
        'MAILGUN_API_KEY', 'MAILGUN_API_KEY_MANTIS', 'MAILGUN_DOMAIN', 'MAILGUN_DOMAIN_MANTIS',
        'MAILTRAP_API_TOKEN', 'MAILTRAP_API_TOKEN_MANTIS', 'EMAIL_STRICT', 'EMAIL_REQUIRE_PROVIDER',
    ])
        delete process.env[key];
}
function countCollection(db, name) {
    return __awaiter(this, void 0, void 0, function* () {
        const existing = yield db.listCollections({ name }).toArray();
        if (!existing.length)
            return 0;
        return db.collection(name).countDocuments();
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const mode = process.env.COSMOS_ISOLATED_TEST === '1';
        const confirmation = process.env.COSMOS_ISOLATED_CONFIRM === CONFIRMATION;
        const mainUri = String(process.env.COSMOS_ISOLATED_URI || '').trim();
        const accountingUri = String(process.env.COSMOS_ISOLATED_ACCOUNTING_URI || '').trim();
        const declaredMainDb = String(process.env.COSMOS_ISOLATED_DB_NAME || '').trim().toLowerCase();
        const declaredAccountingDb = String(process.env.COSMOS_ISOLATED_ACCOUNTING_DB_NAME || '').trim().toLowerCase();
        const declaredProductionHost = String(process.env.COSMOS_PRODUCTION_ACCOUNT_HOST || '').trim().toLowerCase();
        if (!mode || !confirmation || !mainUri || !accountingUri || !declaredMainDb || !declaredAccountingDb || !declaredProductionHost) {
            markAll('UNVERIFIED', 'safety gate closed before any connection', 'Set COSMOS_ISOLATED_TEST=1, COSMOS_ISOLATED_CONFIRM=' + CONFIRMATION +
                ', COSMOS_ISOLATED_URI, COSMOS_ISOLATED_ACCOUNTING_URI, COSMOS_ISOLATED_DB_NAME, ' +
                'COSMOS_ISOLATED_ACCOUNTING_DB_NAME, and COSMOS_PRODUCTION_ACCOUNT_HOST. ' +
                'The harness does not fall back to MONGODB_URI or ACCOUNTING_DB_URI.');
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
            markAll('UNVERIFIED', 'production Cosmos host could not be positively identified for rejection', 'COSMOS_PRODUCTION_ACCOUNT_HOST must be a Cosmos host already present in the process environment or a local env file. The harness will not guess which account is production.');
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
        for (const key of PRODUCTION_URI_KEYS)
            delete process.env[key];
        blankEmailProviders();
        process.env.NODE_ENV = 'development';
        const [{ accountingConnection }, coverage, controllers, agentController] = yield Promise.all([
            Promise.resolve().then(() => __importStar(require('../config/database'))),
            Promise.resolve().then(() => __importStar(require('../services/rentalPeriodCoverage'))),
            Promise.resolve().then(() => __importStar(require('../controllers/paymentController'))),
            Promise.resolve().then(() => __importStar(require('../controllers/agentController'))),
        ]);
        const [{ Company }, { User }, { Property }, { Tenant }, { Lease }, { Payment }, { PropertyOwner }, { OwnerRentNotice }, { EventDedupRecord }, { JournalEntry }, { JournalLine }, { TaxObligation }, { VatRecord }, propertyAccountModule, { CompanyAccount },] = yield Promise.all([
            Promise.resolve().then(() => __importStar(require('../models/Company'))),
            Promise.resolve().then(() => __importStar(require('../models/User'))),
            Promise.resolve().then(() => __importStar(require('../models/Property'))),
            Promise.resolve().then(() => __importStar(require('../models/Tenant'))),
            Promise.resolve().then(() => __importStar(require('../models/Lease'))),
            Promise.resolve().then(() => __importStar(require('../models/Payment'))),
            Promise.resolve().then(() => __importStar(require('../models/PropertyOwner'))),
            Promise.resolve().then(() => __importStar(require('../models/OwnerRentNotice'))),
            Promise.resolve().then(() => __importStar(require('../models/EventDedupRecord'))),
            Promise.resolve().then(() => __importStar(require('../models/JournalEntry'))),
            Promise.resolve().then(() => __importStar(require('../models/JournalLine'))),
            Promise.resolve().then(() => __importStar(require('../models/TaxObligation'))),
            Promise.resolve().then(() => __importStar(require('../models/VatRecord'))),
            Promise.resolve().then(() => __importStar(require('../models/PropertyAccount'))),
            Promise.resolve().then(() => __importStar(require('../models/CompanyAccount'))),
        ]);
        const options = {
            autoIndex: false,
            autoCreate: false,
            retryWrites: false,
            serverSelectionTimeoutMS: 20000,
        };
        yield mongoose_1.default.connect(mainUri, options);
        yield accountingConnection.openUri(accountingUri, options);
        const mainDbName = ((_a = mongoose_1.default.connection.db) === null || _a === void 0 ? void 0 : _a.databaseName) || '';
        const accountingDbName = ((_b = accountingConnection.db) === null || _b === void 0 ? void 0 : _b.databaseName) || '';
        const seenHost = String(mongoose_1.default.connection.host || '').toLowerCase();
        if (mainDbName.toLowerCase() !== main.db || accountingDbName.toLowerCase() !== accounting.db || !seenHost.includes(main.host)) {
            yield mongoose_1.default.disconnect().catch(() => undefined);
            yield accountingConnection.close().catch(() => undefined);
            markAll('UNVERIFIED', 'connected identity did not match the declared disposable target', `mainDb=${mainDbName} accountingDb=${accountingDbName}`);
            process.exit(2);
        }
        const runId = (0, crypto_1.randomBytes)(4).toString('hex');
        const holdOnly = process.env.COSMOS_LOCK_HARNESS_ROLE === 'hold-lock';
        try {
            const unrelated = yield unrelatedData(mongoose_1.default.connection.db, accountingConnection.db);
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
                const release = yield coverage.acquireRentalPeriodGuard(key);
                console.log('LOCK_HELD');
                yield new Promise((resolve) => {
                    const stop = () => { void release().finally(() => resolve()); };
                    process.on('SIGTERM', stop);
                    process.on('SIGINT', stop);
                });
                return;
            }
            yield runTests({
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
        }
        finally {
            yield mongoose_1.default.disconnect().catch(() => undefined);
            yield accountingConnection.close().catch(() => undefined);
        }
        const failed = results.some((row) => row.status === 'FAIL');
        const unverified = results.some((row) => row.status === 'UNVERIFIED');
        console.log(`cosmos-lock-compatibility executed=${results.length} fail=${results.filter((row) => row.status === 'FAIL').length} unverified=${results.filter((row) => row.status === 'UNVERIFIED').length}`);
        console.log('Cosmos compatibility is not claimed unless every test above is PASS.');
        process.exit(failed ? 1 : unverified ? 2 : 0);
    });
}
function unrelatedData(mainDb, accountingDb) {
    return __awaiter(this, void 0, void 0, function* () {
        const paymentCount = yield countCollection(mainDb, 'payments');
        const companyCount = yield countCollection(mainDb, 'companies');
        if (companyCount === 0 && paymentCount === 0)
            return null;
        const companies = companyCount
            ? yield mainDb.collection('companies').find({}, { projection: { name: 1 } }).toArray()
            : [];
        const foreign = companies.filter((company) => !String(company.name || '').startsWith('Cosmos Lock Harness '));
        if (foreign.length || (paymentCount > 0 && companies.length === 0)) {
            return `payments=${paymentCount} companies=${companyCount} unrelatedCompanies=${foreign.length}`;
        }
        const accountingPayments = yield countCollection(accountingDb, 'payments');
        if (accountingPayments > 0)
            return `accounting connection already has payments=${accountingPayments}`;
        return null;
    });
}
function runTests(app) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        const db = mongoose_1.default.connection.db;
        const accountingDb = app.accountingConnection.db;
        let buildInfo = '';
        try {
            const info = yield db.command({ buildInfo: 1 });
            buildInfo = redact(JSON.stringify({ version: info.version, modules: info.modules, ok: info.ok }));
        }
        catch (error) {
            buildInfo = describeError(error);
        }
        const names = (yield db.listCollections().toArray()).map((collection) => collection.name).sort();
        const accountingNames = (yield accountingDb.listCollections().toArray()).map((collection) => collection.name).sort();
        emit({
            id: '01-metadata',
            status: ((_a = mongoose_1.default.connection.db) === null || _a === void 0 ? void 0 : _a.databaseName) && ((_b = app.accountingConnection.db) === null || _b === void 0 ? void 0 : _b.databaseName) ? 'PASS' : 'FAIL',
            operation: 'buildInfo and listCollections on both connections',
            response: `buildInfo=${buildInfo} mainCollections=${names.join(',') || '(none)'} accountingCollections=${accountingNames.join(',') || '(none)'}`,
            assertions: `main=${(_c = mongoose_1.default.connection.db) === null || _c === void 0 ? void 0 : _c.databaseName} accounting=${(_d = app.accountingConnection.db) === null || _d === void 0 ? void 0 : _d.databaseName}`,
        });
        const partitionMain = yield readPartition(db, 'payments');
        const partitionLock = yield readPartition(db, 'eventdeduprecords');
        const partitionJournal = yield readPartition(db, 'journalentries');
        const partitionAccounting = yield readPartition(accountingDb, 'propertyaccounts');
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
        yield guarded('03-unique-lock-index', 'unique lock index', () => testUniqueLock(app));
        yield guarded('04-partial-reversal-index', 'partial reversal index', () => testReversalIndex(app));
        yield guarded('05-concurrent-lock-acquisition', 'concurrent acquire', () => testConcurrentAcquire(app));
        yield guarded('06-heartbeat-ownership', 'heartbeat', () => testHeartbeat(app));
        yield guarded('07-expired-lock-recovery', 'expired lock recovery', () => testExpiry(app));
        const indexError = yield ensureRuntimeIndexes(app);
        const fixtures = yield createFixtures(app);
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
        }
        else {
            yield guarded('09-overlapping-advances', 'overlapping advances', () => testAdvances(app, fixtures));
            yield guarded('10-concurrent-controllers', 'concurrent controllers', () => testControllers(app, fixtures));
            yield guarded('11-currency-and-lease-isolation', 'currency and lease isolation', () => testIsolation(app, fixtures));
            yield guarded('12-duplicate-reversal', 'duplicate reversal', () => testReversal(app, fixtures));
            yield cleanupFixtures(app, fixtures);
        }
        yield guarded('14-transaction-or-code-20', 'transaction or code 20', () => testTransaction(app));
        yield guarded('15-throttling', 'throttling', () => testThrottle(app));
        yield guarded('16-process-termination', 'process termination', () => testProcessKill(app));
        yield guarded('17-main-and-accounting-connections', 'connection consistency', () => testConnections(app));
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
    });
}
function guarded(id, operation, fn) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield fn();
        }
        catch (error) {
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
    });
}
function ensureRuntimeIndexes(app) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield app.Payment.collection.createIndex({ companyId: 1, idempotencyKey: 1 }, { unique: true, name: 'companyId_1_idempotencyKey_1', partialFilterExpression: { idempotencyKey: { $exists: true, $type: 'string' } } });
            yield app.Payment.collection.createIndex({ companyId: 1, referenceNumber: 1 }, {
                unique: true,
                name: 'companyId_1_referenceNumber_1',
                partialFilterExpression: { referenceNumber: { $exists: true, $type: 'string', $gt: '' } },
            });
            yield app.JournalEntry.collection.createIndex({ companyId: 1, reference: 1 }, { unique: true, name: 'companyId_1_reference_1' });
            yield app.JournalEntry.collection.createIndex({ companyId: 1, sourceModule: 1, sourceId: 1 }, { unique: true, sparse: true, name: 'companyId_1_sourceModule_1_sourceId_1' });
            return null;
        }
        catch (error) {
            return describeError(error);
        }
    });
}
function readPartition(db, collection) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            const result = yield db.command({ customAction: 'GetCollection', collection });
            const key = (result === null || result === void 0 ? void 0 : result.shardKey) || (result === null || result === void 0 ? void 0 : result.partitionKey) || ((_a = result === null || result === void 0 ? void 0 : result.collection) === null || _a === void 0 ? void 0 : _a.shardKey) || ((_b = result === null || result === void 0 ? void 0 : result.indexes) === null || _b === void 0 ? void 0 : _b.shardKey);
            const indexes = yield db.collection(collection).indexes().catch(() => []);
            return {
                key: key ? JSON.stringify(key) : undefined,
                indexes: indexes.map((index) => String(index.name)),
            };
        }
        catch (error) {
            let indexes = [];
            try {
                indexes = (yield db.collection(collection).indexes()).map((index) => String(index.name));
            }
            catch (_c) {
                indexes = [];
            }
            return { error: describeError(error), indexes };
        }
    });
}
function testUniqueLock(app) {
    return __awaiter(this, void 0, void 0, function* () {
        const eventId = `cosmos-lock-harness:${app.runId}:unique`;
        try {
            const created = yield app.EventDedupRecord.collection.createIndex({ scope: 1, eventId: 1 }, { unique: true, name: 'scope_1_eventId_1' });
            yield app.EventDedupRecord.create({
                scope: app.coverage.RENTAL_PERIOD_GUARD_SCOPE,
                eventId,
                status: 'processed',
                processedAt: new Date(),
                ownerToken: 'first',
            });
            let duplicate = '';
            try {
                yield app.EventDedupRecord.create({
                    scope: app.coverage.RENTAL_PERIOD_GUARD_SCOPE,
                    eventId,
                    status: 'processed',
                    processedAt: new Date(),
                    ownerToken: 'second',
                });
                duplicate = 'second insert succeeded';
            }
            catch (error) {
                duplicate = describeError(error);
            }
            const count = yield app.EventDedupRecord.countDocuments({ scope: app.coverage.RENTAL_PERIOD_GUARD_SCOPE, eventId });
            emit({
                id: '03-unique-lock-index',
                status: count === 1 && duplicate.includes('code=11000') ? 'PASS' : 'FAIL',
                operation: 'createIndex {scope,eventId} unique, then two EventDedupRecord.create calls',
                response: `createIndex=${String(created)} duplicate=${duplicate}`,
                assertions: `lockRows=${count} expected=1 and duplicate code 11000`,
            });
        }
        catch (error) {
            emit({
                id: '03-unique-lock-index',
                status: 'FAIL',
                operation: 'createIndex {scope,eventId} unique',
                response: describeError(error),
                assertions: 'unique lock index was not enforced',
            });
        }
        finally {
            yield app.EventDedupRecord.deleteMany({ eventId });
        }
    });
}
function testReversalIndex(app) {
    return __awaiter(this, void 0, void 0, function* () {
        const reference = `COSMOSLOCK${app.runId}IDX`;
        try {
            const created = yield app.Payment.collection.createIndex({ reversalOfPaymentId: 1 }, {
                name: 'one_full_reversal_per_payment',
                unique: true,
                partialFilterExpression: { reversalOfPaymentId: { $exists: true }, amount: { $lt: 0 } },
            });
            const originalId = new mongoose_1.default.Types.ObjectId();
            const base = {
                companyId: new mongoose_1.default.Types.ObjectId(),
                propertyId: new mongoose_1.default.Types.ObjectId(),
                tenantId: new mongoose_1.default.Types.ObjectId(),
                agentId: new mongoose_1.default.Types.ObjectId(),
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
            yield app.Payment.create(Object.assign(Object.assign({}, base), { amount: 10, referenceNumber: `${reference}-P`, depositAmount: 0 }));
            yield app.Payment.create(Object.assign(Object.assign({}, base), { amount: -10, referenceNumber: `${reference}-R1`, reversalOfPaymentId: originalId, depositAmount: 0 }));
            let duplicate = '';
            try {
                yield app.Payment.create(Object.assign(Object.assign({}, base), { amount: -10, referenceNumber: `${reference}-R2`, reversalOfPaymentId: originalId, depositAmount: 0 }));
                duplicate = 'second negative REV succeeded';
            }
            catch (error) {
                duplicate = describeError(error);
            }
            const positive = yield app.Payment.create(Object.assign(Object.assign({}, base), { amount: 10, referenceNumber: `${reference}-C`, reversalOfPaymentId: originalId, isCorrectionEntry: true, status: 'pending', postingStatus: 'draft', depositAmount: 0 }));
            const negatives = yield app.Payment.countDocuments({ reversalOfPaymentId: originalId, amount: { $lt: 0 } });
            emit({
                id: '04-partial-reversal-index',
                status: negatives === 1 && duplicate.includes('code=11000') && positive ? 'PASS' : 'FAIL',
                operation: 'createIndex one_full_reversal_per_payment, two negative REV inserts, one positive correction',
                response: `createIndex=${String(created)} duplicate=${duplicate}`,
                assertions: `negativeReversals=${negatives} expected=1; positive correction persisted=${Boolean(positive)}`,
            });
        }
        catch (error) {
            emit({
                id: '04-partial-reversal-index',
                status: 'FAIL',
                operation: 'create partial unique reversal index and duplicate REV insert',
                response: describeError(error),
                assertions: 'one negative REV was not enforced',
            });
        }
        finally {
            yield app.Payment.deleteMany({ referenceNumber: new RegExp(`^${reference}`) });
        }
    });
}
function testConcurrentAcquire(app) {
    return __awaiter(this, void 0, void 0, function* () {
        const key = `cosmos-lock-harness:${app.runId}:race`;
        let busy = '';
        let secondRelease = null;
        const first = yield app.coverage.acquireRentalPeriodGuard(key, { heartbeatMs: 0, waitMs: 500 });
        try {
            secondRelease = yield app.coverage.acquireRentalPeriodGuard(key, { heartbeatMs: 0, waitMs: 200 });
            busy = 'second acquire succeeded';
        }
        catch (error) {
            busy = describeError(error);
        }
        const owners = yield app.EventDedupRecord.countDocuments({ scope: app.coverage.RENTAL_PERIOD_GUARD_SCOPE, eventId: key });
        emit({
            id: '05-concurrent-lock-acquisition',
            status: owners === 1 && busy.includes('RENTAL_PERIOD_BUSY') ? 'PASS' : 'FAIL',
            operation: 'two acquireRentalPeriodGuard calls for one key',
            response: busy,
            assertions: `lockRows=${owners} expected=1`,
        });
        yield first();
        if (secondRelease)
            yield secondRelease();
    });
}
function testHeartbeat(app) {
    return __awaiter(this, void 0, void 0, function* () {
        const key = `cosmos-lock-harness:${app.runId}:beat`;
        const release = yield app.coverage.acquireRentalPeriodGuard(key, { leaseMs: 80, heartbeatMs: 25, waitMs: 500 });
        const before = yield app.EventDedupRecord.findOne({ scope: app.coverage.RENTAL_PERIOD_GUARD_SCOPE, eventId: key }).lean();
        yield sleep(190);
        let intruder = '';
        try {
            const extra = yield app.coverage.acquireRentalPeriodGuard(key, { heartbeatMs: 0, waitMs: 100 });
            intruder = 'intruder acquired';
            yield extra();
        }
        catch (error) {
            intruder = describeError(error);
        }
        const after = yield app.EventDedupRecord.findOne({ scope: app.coverage.RENTAL_PERIOD_GUARD_SCOPE, eventId: key }).lean();
        emit({
            id: '06-heartbeat-ownership',
            status: String((before === null || before === void 0 ? void 0 : before.ownerToken) || '') !== '' && String(before === null || before === void 0 ? void 0 : before.ownerToken) === String(after === null || after === void 0 ? void 0 : after.ownerToken) && intruder.includes('RENTAL_PERIOD_BUSY') ? 'PASS' : 'FAIL',
            operation: 'acquireRentalPeriodGuard with heartbeat, then a second acquire after the lease interval',
            response: intruder,
            assertions: `ownerUnchanged=${String(before === null || before === void 0 ? void 0 : before.ownerToken) === String(after === null || after === void 0 ? void 0 : after.ownerToken)}`,
        });
        yield release();
    });
}
function testExpiry(app) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const key = `cosmos-lock-harness:${app.runId}:expire`;
        const first = yield app.coverage.acquireRentalPeriodGuard(key, { heartbeatMs: 0, leaseMs: 60000, waitMs: 500 });
        const oldToken = String(((_a = (yield app.EventDedupRecord.findOne({ scope: app.coverage.RENTAL_PERIOD_GUARD_SCOPE, eventId: key }).lean())) === null || _a === void 0 ? void 0 : _a.ownerToken) || '');
        yield app.EventDedupRecord.updateOne({ scope: app.coverage.RENTAL_PERIOD_GUARD_SCOPE, eventId: key, ownerToken: oldToken }, { $set: { processedAt: new Date(Date.now() - 1000) } });
        const second = yield app.coverage.acquireRentalPeriodGuard(key, { heartbeatMs: 0, leaseMs: 60000, waitMs: 1000 });
        const current = String(((_b = (yield app.EventDedupRecord.findOne({ scope: app.coverage.RENTAL_PERIOD_GUARD_SCOPE, eventId: key }).lean())) === null || _b === void 0 ? void 0 : _b.ownerToken) || '');
        yield first();
        const afterOldRelease = String(((_c = (yield app.EventDedupRecord.findOne({ scope: app.coverage.RENTAL_PERIOD_GUARD_SCOPE, eventId: key }).lean())) === null || _c === void 0 ? void 0 : _c.ownerToken) || '');
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
        yield second();
    });
}
function createFixtures(app) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const admin = yield app.User.create({
                email: `cosmos-lock-admin-${app.runId}@example.test`,
                password: 'test-pass-1',
                firstName: 'Cosmos',
                lastName: 'Admin',
                role: 'admin',
                roles: ['admin', 'accountant'],
                isActive: true,
                sessionVersion: 1,
            });
            const agent = yield app.User.create({
                email: `cosmos-lock-agent-${app.runId}@example.test`,
                password: 'test-pass-1',
                firstName: 'Cosmos',
                lastName: 'Agent',
                role: 'agent',
                roles: ['agent'],
                isActive: true,
                sessionVersion: 1,
            });
            const company = yield app.Company.create({
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
            const property = yield app.Property.create({
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
            const tenant = yield app.Tenant.create({
                firstName: 'Harness',
                lastName: 'Tenant',
                email: `cosmos-lock-tenant-${app.runId}@example.test`,
                phone: '0771111199',
                companyId: company._id,
                ownerId: admin._id,
                status: 'Active',
            });
            const lease = yield app.Lease.create({
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
            const otherLease = yield app.Lease.create({
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
            const owner = yield app.PropertyOwner.create({
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
        }
        catch (error) {
            console.log(`fixture error: ${describeError(error)}`);
            return null;
        }
    });
}
function adminUser(fixtures) {
    return {
        userId: String(fixtures.admin._id),
        companyId: String(fixtures.company._id),
        role: 'admin',
        roles: ['admin', 'accountant'],
    };
}
function leaseRequest(app, fixtures, month, year, extra = {}) {
    return {
        user: adminUser(fixtures),
        body: Object.assign({ leaseId: String(fixtures.lease._id), amount: 100, paymentDate: '2034-03-20', paymentMethod: 'cash', status: 'completed', rentalPeriodMonth: month, rentalPeriodYear: year, currency: 'USD', idempotencyKey: `cosmos:${app.runId}:${year}:${month}:${new mongoose_1.default.Types.ObjectId().toString()}` }, extra),
    };
}
function invoke(handler, req) {
    return __awaiter(this, void 0, void 0, function* () {
        const res = {
            statusCode: 200,
            body: undefined,
            status(code) { this.statusCode = code; return this; },
            json(body) { this.body = body; return this; },
        };
        try {
            yield handler(req, res);
        }
        catch (error) {
            if (res.body === undefined) {
                res.statusCode = 500;
                res.body = { message: describeError(error) };
            }
        }
        return res;
    });
}
function ledgerState(app, companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        const lines = yield app.JournalLine.find({ companyId }).select('debit credit').lean();
        const debit = lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
        const credit = lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
        const journals = yield app.JournalEntry.countDocuments({ companyId });
        const vatRows = yield app.VatRecord.find({ companyId }).select('vatCollected vatPaid status').lean();
        const vatReversal = vatRows
            .filter((row) => row.status === 'reversed')
            .reduce((sum, row) => sum + Number(row.vatCollected || 0) + Number(row.vatPaid || 0), 0);
        const taxRows = yield app.TaxObligation.find({ companyId }).select('status reversalOf').lean();
        const property = yield app.PropertyAccount.findOne({ companyId }).select('netOwnerBalance runningBalance transactions').lean();
        const company = yield app.CompanyAccount.findOne({ companyId }).select('runningBalance totalIncome transactions').lean();
        const reversalNotices = yield app.OwnerRentNotice.countDocuments({ companyId, idempotencyKey: /^owner-rent-reversal:/ });
        const rentNotices = yield app.OwnerRentNotice.countDocuments({ companyId, idempotencyKey: /^owner-rent-payment:/ });
        return {
            journals,
            debit: Number(debit.toFixed(2)),
            credit: Number(credit.toFixed(2)),
            vatRows: vatRows.length,
            vatReversal: Number(vatReversal.toFixed(2)),
            tax: taxRows.map((row) => `${row.status}${row.reversalOf ? ':reversal' : ''}`).join(',') || 'none',
            taxCount: taxRows.length,
            propertyFound: Boolean(property),
            ownerBalance: property ? Number(property.netOwnerBalance || 0) : null,
            propertyTransactions: Array.isArray(property === null || property === void 0 ? void 0 : property.transactions) ? property.transactions.length : 0,
            companyFound: Boolean(company),
            companyBalance: company ? Number(company.runningBalance || 0) : null,
            reversalNotices,
            rentNotices,
        };
    });
}
function snapshot(app, fixtures, month, year) {
    return __awaiter(this, void 0, void 0, function* () {
        const companyId = fixtures.company._id;
        const payments = yield app.Payment.countDocuments({
            companyId,
            rentalPeriodMonth: month,
            rentalPeriodYear: year,
            amount: { $gt: 0 },
            reversalOfPaymentId: { $exists: false },
        });
        const coverage = yield app.coverage.sumRentCoverageForPeriod({
            companyId,
            propertyId: fixtures.property._id,
            tenantId: fixtures.tenant._id,
            rentalPeriodMonth: month,
            rentalPeriodYear: year,
        });
        const journals = yield app.JournalEntry.countDocuments({ companyId });
        const notices = yield app.OwnerRentNotice.countDocuments({ companyId });
        const vat = yield app.VatRecord.countDocuments({ companyId });
        const tax = yield app.TaxObligation.countDocuments({ companyId });
        return { payments, coverage, journals, notices, vat, tax };
    });
}
function testAdvances(app, fixtures) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
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
        const [a, b] = yield Promise.all([
            invoke(app.controllers.createPayment, left),
            invoke(app.controllers.createPayment, right),
        ]);
        const advances = yield app.Payment.countDocuments({
            companyId: fixtures.company._id,
            rentalPeriodYear: 2034,
            advanceMonthsPaid: { $gt: 1 },
            amount: { $gt: 0 },
        });
        const june = yield app.coverage.sumRentCoverageForPeriod({
            companyId: fixtures.company._id,
            propertyId: fixtures.property._id,
            tenantId: fixtures.tenant._id,
            rentalPeriodMonth: 6,
            rentalPeriodYear: 2034,
        });
        const books = yield ledgerState(app, fixtures.company._id);
        emit({
            id: '09-overlapping-advances',
            status: advances === 1 && june === 100 ? 'PASS' : 'FAIL',
            operation: 'two concurrent createPayment advance ranges',
            response: `statuses=${a.statusCode}/${b.statusCode} ${redact(String(((_a = a.body) === null || _a === void 0 ? void 0 : _a.message) || ''))} ${redact(String(((_b = b.body) === null || _b === void 0 ? void 0 : _b.message) || ''))}`,
            assertions: `advancePayments=${advances} juneCoverage=${june} journals=${books.journals} debit=${books.debit} credit=${books.credit} vatReversal=${books.vatReversal} tax=${books.tax} ownerBalance=${String(books.ownerBalance)} reversalNotices=${books.reversalNotices}`,
        });
    });
}
function testControllers(app, fixtures) {
    return __awaiter(this, void 0, void 0, function* () {
        const pairs = [
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
                        idempotencyKey: `cosmos-acc:${app.runId}:${new mongoose_1.default.Types.ObjectId().toString()}`,
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
                        idempotencyKey: `cosmos-agent:${app.runId}:${new mongoose_1.default.Types.ObjectId().toString()}`,
                    },
                }],
        ];
        const details = [];
        let pass = true;
        for (const [label, month, handler, request] of pairs) {
            const other = JSON.parse(JSON.stringify(request));
            other.body.idempotencyKey = `${request.body.idempotencyKey}:b`;
            const [a, b] = yield Promise.all([invoke(handler, request), invoke(handler, other)]);
            const snap = yield snapshot(app, fixtures, month, 2034);
            details.push(`${label} http=${a.statusCode}/${b.statusCode} payments=${snap.payments} coverage=${snap.coverage} journals=${snap.journals} notices=${snap.notices} vat=${snap.vat} tax=${snap.tax}`);
            if (snap.payments !== 1 || snap.coverage !== 100)
                pass = false;
        }
        emit({
            id: '10-concurrent-controllers',
            status: pass ? 'PASS' : 'FAIL',
            operation: 'concurrent createPayment, createPaymentPublic, createPaymentAccountant, and createAgentPayment',
            response: details.join(' | '),
            assertions: 'each path persisted exactly one positive payment and coverage 100',
        });
    });
}
function testIsolation(app, fixtures) {
    return __awaiter(this, void 0, void 0, function* () {
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
        const [leaseResult, omittedResult] = yield Promise.all([
            invoke(app.controllers.createPayment, withLease),
            invoke(app.controllers.createPaymentAccountant, omittedLease),
        ]);
        const omittedSnap = yield snapshot(app, fixtures, 8, 2034);
        const usd = yield invoke(app.controllers.createPayment, leaseRequest(app, fixtures, 9, 2034, { currency: 'USD' }));
        const zwl = yield invoke(app.controllers.createPayment, leaseRequest(app, fixtures, 9, 2034, { currency: 'ZWL' }));
        const usdCoverage = yield app.coverage.sumRentCoverageForPeriod({
            companyId: fixtures.company._id,
            propertyId: fixtures.property._id,
            tenantId: fixtures.tenant._id,
            rentalPeriodMonth: 9,
            rentalPeriodYear: 2034,
            currency: 'USD',
        });
        const zwlCoverage = yield app.coverage.sumRentCoverageForPeriod({
            companyId: fixtures.company._id,
            propertyId: fixtures.property._id,
            tenantId: fixtures.tenant._id,
            rentalPeriodMonth: 9,
            rentalPeriodYear: 2034,
            currency: 'ZWL',
        });
        const secondLease = yield invoke(app.controllers.createPayment, leaseRequest(app, fixtures, 10, 2034, { leaseId: String(fixtures.otherLease._id) }));
        const firstLease = yield invoke(app.controllers.createPayment, leaseRequest(app, fixtures, 10, 2034));
        const leasePayments = yield app.Payment.countDocuments({
            companyId: fixtures.company._id,
            rentalPeriodMonth: 10,
            rentalPeriodYear: 2034,
            amount: { $gt: 0 },
        });
        const storedCurrencies = (yield app.Payment.find({
            companyId: fixtures.company._id,
            rentalPeriodMonth: 9,
            rentalPeriodYear: 2034,
            amount: { $gt: 0 },
        }).select('currency').lean()).map((row) => String(row.currency || '')).sort();
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
    });
}
function testReversal(app, fixtures) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        const created = yield invoke(app.controllers.createPayment, leaseRequest(app, fixtures, 11, 2034));
        const paymentId = (_b = (_a = created.body) === null || _a === void 0 ? void 0 : _a.payment) === null || _b === void 0 ? void 0 : _b._id;
        if (!paymentId) {
            emit({
                id: '12-duplicate-reversal',
                status: 'FAIL',
                operation: 'createPayment before reversePayment',
                response: `status=${created.statusCode} ${redact(String(((_c = created.body) === null || _c === void 0 ? void 0 : _c.message) || ''))}`,
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
        const originalBefore = yield app.Payment.findById(paymentId).lean();
        const request = {
            user: adminUser(fixtures),
            params: { id: String(paymentId) },
            body: { reason: 'cosmos harness duplicate receipt' },
        };
        const [first, second] = yield Promise.all([
            invoke(app.controllers.reversePayment, request),
            invoke(app.controllers.reversePayment, Object.assign(Object.assign({}, request), { body: { reason: 'cosmos harness duplicate receipt' } })),
        ]);
        const negatives = yield app.Payment.countDocuments({ companyId: fixtures.company._id, reversalOfPaymentId: paymentId, amount: { $lt: 0 } });
        const corrections = yield app.Payment.countDocuments({ companyId: fixtures.company._id, referenceNumber: new RegExp('^CORR-'), isCorrectionEntry: true });
        const originalAfter = yield app.Payment.findById(paymentId).lean();
        const books = yield ledgerState(app, fixtures.company._id);
        const amountUnchanged = Number(originalAfter === null || originalAfter === void 0 ? void 0 : originalAfter.amount) === Number(originalBefore === null || originalBefore === void 0 ? void 0 : originalBefore.amount)
            && Number(((_d = originalAfter === null || originalAfter === void 0 ? void 0 : originalAfter.commissionDetails) === null || _d === void 0 ? void 0 : _d.totalCommission) || 0) === Number(((_e = originalBefore === null || originalBefore === void 0 ? void 0 : originalBefore.commissionDetails) === null || _e === void 0 ? void 0 : _e.totalCommission) || 0);
        const reversed = String((originalAfter === null || originalAfter === void 0 ? void 0 : originalAfter.reversalState) || '') === 'reversed';
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
            response: `statuses=${first.statusCode}/${second.statusCode} ${redact(String(((_f = first.body) === null || _f === void 0 ? void 0 : _f.message) || ((_g = first.body) === null || _g === void 0 ? void 0 : _g.outcome) || ''))}`,
            assertions: `negativeReversals=${negatives} corrections=${corrections} amountUnchanged=${amountUnchanged} reversalState=${String((originalAfter === null || originalAfter === void 0 ? void 0 : originalAfter.reversalState) || '')} journals=${books.journals} debit=${books.debit} credit=${books.credit} vatReversal=${books.vatReversal} tax=${books.tax} ownerBalance=${String(books.ownerBalance)} companyBalance=${String(books.companyBalance)} reversalNotices=${books.reversalNotices} rentNotices=${books.rentNotices}`,
        });
        const retry = yield invoke(app.controllers.reversePayment, request);
        const afterNegatives = yield app.Payment.countDocuments({ companyId: fixtures.company._id, reversalOfPaymentId: paymentId, amount: { $lt: 0 } });
        const afterCorrections = yield app.Payment.countDocuments({ companyId: fixtures.company._id, referenceNumber: new RegExp('^CORR-'), isCorrectionEntry: true });
        const afterBooks = yield ledgerState(app, fixtures.company._id);
        const afterOriginal = yield app.Payment.findById(paymentId).lean();
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
            && Number(afterOriginal === null || afterOriginal === void 0 ? void 0 : afterOriginal.amount) === Number(originalBefore === null || originalBefore === void 0 ? void 0 : originalBefore.amount);
        emit({
            id: '13-reversal-idempotency',
            status: firstSettled && stable ? 'PASS' : 'FAIL',
            operation: 'repeat reversePayment for the same original',
            response: `status=${retry.statusCode} outcome=${redact(String(((_h = retry.body) === null || _h === void 0 ? void 0 : _h.outcome) || ((_j = retry.body) === null || _j === void 0 ? void 0 : _j.message) || ''))}`,
            assertions: `rev=${afterNegatives} corr=${afterCorrections} journals=${afterBooks.journals} debit=${afterBooks.debit} credit=${afterBooks.credit} vatReversal=${afterBooks.vatReversal} tax=${afterBooks.tax} ownerBalance=${String(afterBooks.ownerBalance)} reversalNotices=${afterBooks.reversalNotices}`,
        });
    });
}
function testTransaction(app) {
    return __awaiter(this, void 0, void 0, function* () {
        const markerId = `cosmos-lock-harness:${app.runId}:tx`;
        let mode = '';
        try {
            const session = yield mongoose_1.default.startSession();
            try {
                yield session.withTransaction(() => __awaiter(this, void 0, void 0, function* () {
                    yield app.EventDedupRecord.create([{
                            scope: 'cosmos-lock-harness-tx',
                            eventId: markerId,
                            status: 'processed',
                            ownerToken: 'tx',
                            processedAt: new Date(),
                        }], { session });
                }));
                mode = 'transaction-committed';
            }
            catch (error) {
                const err = error;
                const unsupported = Number(err === null || err === void 0 ? void 0 : err.code) === 20 || /transaction numbers are only allowed/i.test(String((err === null || err === void 0 ? void 0 : err.message) || ''));
                mode = unsupported ? `code-20 ${describeError(error)}` : `transaction-error ${describeError(error)}`;
                if (unsupported) {
                    yield app.EventDedupRecord.create({
                        scope: 'cosmos-lock-harness-tx',
                        eventId: markerId,
                        status: 'processed',
                        ownerToken: 'sequential',
                        processedAt: new Date(),
                    });
                }
            }
            finally {
                yield session.endSession();
            }
            const count = yield app.EventDedupRecord.countDocuments({ scope: 'cosmos-lock-harness-tx', eventId: markerId });
            emit({
                id: '14-transaction-or-code-20',
                status: count === 1 && (mode === 'transaction-committed' || mode.startsWith('code-20')) ? 'PASS' : 'FAIL',
                operation: 'mongoose session.withTransaction insert, with the application code-20 sequential fallback',
                response: mode,
                assertions: `markerRows=${count} expected=1`,
                limitation: 'This uses the same session API as reversePayment. It does not rewrite historical journals.',
            });
        }
        catch (error) {
            emit({
                id: '14-transaction-or-code-20',
                status: 'FAIL',
                operation: 'startSession',
                response: describeError(error),
                assertions: 'no transaction result was recorded',
            });
        }
        finally {
            yield app.EventDedupRecord.deleteMany({ scope: 'cosmos-lock-harness-tx', eventId: markerId });
        }
    });
}
function testThrottle(app) {
    return __awaiter(this, void 0, void 0, function* () {
        const key = `cosmos-lock-harness:${app.runId}:throttle`;
        let sawThrottle = false;
        let last = '';
        const release = yield app.coverage.acquireRentalPeriodGuard(key, { heartbeatMs: 0, waitMs: 300 });
        yield Promise.all([0, 1, 2, 3].map(() => __awaiter(this, void 0, void 0, function* () {
            try {
                const extra = yield app.coverage.acquireRentalPeriodGuard(key, { heartbeatMs: 0, waitMs: 200 });
                yield extra();
                last = 'acquire succeeded';
            }
            catch (error) {
                last = describeError(error);
                if (last.includes('code=16500') || last.includes('code=429'))
                    sawThrottle = true;
            }
        })));
        yield release();
        emit({
            id: '15-throttling',
            status: sawThrottle ? 'PASS' : 'UNVERIFIED',
            operation: 'concurrent acquireRentalPeriodGuard while one owner is held',
            response: last,
            assertions: sawThrottle ? 'a 16500 or 429 response was observed from the driver' : 'no 16500 or 429 was returned',
            limitation: sawThrottle ? undefined : 'The harness does not inject a synthetic throttle and does not change account throughput.',
        });
    });
}
function testProcessKill(app) {
    return __awaiter(this, void 0, void 0, function* () {
        const key = `cosmos-lock-harness:${app.runId}:killed`;
        const child = (0, child_process_1.spawn)(process.execPath, ['-r', 'ts-node/register/transpile-only', path_1.default.resolve(__dirname, 'runCosmosLockCompatibilityTests.ts')], {
            env: Object.assign(Object.assign({}, process.env), { COSMOS_LOCK_HARNESS_ROLE: 'hold-lock', COSMOS_LOCK_HOLD_KEY: key }),
            cwd: path_1.default.resolve(__dirname, '../..'),
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        const ready = yield waitForLock(app, key, child);
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
        yield sleep(app.coverage.RENTAL_GUARD_DEFAULTS.leaseMs + 10000);
        let recovered = '';
        let release = null;
        try {
            release = yield app.coverage.acquireRentalPeriodGuard(key);
            recovered = 'acquired';
        }
        catch (error) {
            recovered = describeError(error);
        }
        const rows = yield app.EventDedupRecord.countDocuments({ scope: app.coverage.RENTAL_PERIOD_GUARD_SCOPE, eventId: key });
        emit({
            id: '16-process-termination',
            status: recovered === 'acquired' && rows === 1 ? 'PASS' : 'FAIL',
            operation: 'kill the holder and acquire after the 60 second lease',
            response: recovered,
            assertions: `lockRows=${rows} expected=1 after recovery`,
        });
        if (release)
            yield release();
    });
}
function waitForLock(app, key, child) {
    if (child.exitCode !== null)
        return Promise.resolve(false);
    return new Promise((resolve) => {
        let settled = false;
        let timer;
        let poll;
        const finish = (held) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            clearInterval(poll);
            resolve(held);
        };
        timer = setTimeout(() => finish(false), 30000);
        poll = setInterval(() => {
            void app.EventDedupRecord.findOne({ scope: app.coverage.RENTAL_PERIOD_GUARD_SCOPE, eventId: key }).lean()
                .then((row) => { if (row)
                finish(true); })
                .catch(() => undefined);
        }, 500);
        child.once('exit', () => finish(false));
    });
}
function testConnections(app) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        const marker = `cosmos-lock-harness:${app.runId}:connection`;
        yield app.EventDedupRecord.create({
            scope: 'cosmos-lock-harness-connection',
            eventId: marker,
            status: 'processed',
            ownerToken: 'main',
            processedAt: new Date(),
        });
        const onMain = yield app.EventDedupRecord.countDocuments({ scope: 'cosmos-lock-harness-connection', eventId: marker });
        const onAccounting = yield app.accountingConnection.collection('eventdeduprecords').countDocuments({
            scope: 'cosmos-lock-harness-connection',
            eventId: marker,
        }).catch(() => 0);
        const sameDb = ((_a = mongoose_1.default.connection.db) === null || _a === void 0 ? void 0 : _a.databaseName) === ((_b = app.accountingConnection.db) === null || _b === void 0 ? void 0 : _b.databaseName);
        emit({
            id: '17-main-and-accounting-connections',
            status: !sameDb && onMain === 1 && onAccounting === 0 ? 'PASS' : 'FAIL',
            operation: 'insert a harness marker on the main connection and read it from the accounting connection',
            response: `mainDb=${(_c = mongoose_1.default.connection.db) === null || _c === void 0 ? void 0 : _c.databaseName} accountingDb=${(_d = app.accountingConnection.db) === null || _d === void 0 ? void 0 : _d.databaseName}`,
            assertions: `mainRows=${onMain} accountingRows=${onAccounting} databasesDiffer=${!sameDb}`,
        });
        yield app.EventDedupRecord.deleteMany({ scope: 'cosmos-lock-harness-connection', eventId: marker });
    });
}
function cleanupFixtures(app, fixtures) {
    return __awaiter(this, void 0, void 0, function* () {
        const company = yield app.Company.findById(fixtures.company._id).select('name registrationNumber').lean();
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
            yield model.collection.deleteMany({ companyId });
        }
        yield app.EventDedupRecord.collection.deleteMany({
            scope: app.coverage.RENTAL_PERIOD_GUARD_SCOPE,
            eventId: new RegExp(`^${String(companyId)}:`),
        });
        yield app.EventDedupRecord.collection.deleteMany({
            eventId: new RegExp(`^cosmos-lock-harness:${app.runId}`),
        });
        yield app.PropertyAccount.collection.deleteMany({ companyId });
        yield app.CompanyAccount.collection.deleteMany({ companyId });
        yield app.Company.collection.deleteMany({ _id: companyId, name: `Cosmos Lock Harness ${app.runId}` });
        yield app.User.collection.deleteMany({ email: new RegExp(`cosmos-lock-(admin|agent)-${app.runId}@example\\.test$`) });
    });
}
main().catch((error) => __awaiter(void 0, void 0, void 0, function* () {
    console.log(`FAIL harness ${describeError(error)}`);
    yield mongoose_1.default.disconnect().catch(() => undefined);
    process.exit(1);
}));
