"use strict";
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
exports.getTrustBackfillState = exports.backfillTrustAccounts = void 0;
const crypto_1 = __importDefault(require("crypto"));
const mongoose_1 = __importDefault(require("mongoose"));
const Payment_1 = require("../models/Payment");
const Property_1 = require("../models/Property");
const TrustAccount_1 = require("../models/TrustAccount");
const TrustTransaction_1 = require("../models/TrustTransaction");
const TrustAuditLog_1 = require("../models/TrustAuditLog");
const MigrationState_1 = require("../models/MigrationState");
const MIGRATION_NAME = 'trust_backfill_v1';
const MAX_BATCH_LIMIT = 50;
const LEASE_MINUTES = 10;
const money = (n) => Number(Number(n || 0).toFixed(2));
const ensureBackfillIndexes = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield mongoose_1.default.connection.db.createCollection('migration_state');
    }
    catch (error) {
        if ((error === null || error === void 0 ? void 0 : error.code) !== 48)
            throw error;
    }
    yield mongoose_1.default.connection.collection('migration_state').createIndex({ migrationName: 1 }, { unique: true });
    yield mongoose_1.default.connection.collection('migration_state').createIndex({ status: 1, leaseExpiresAt: 1 });
    yield mongoose_1.default.connection.collection('trustaccounts').createIndex({ propertyId: 1 }, { unique: true, partialFilterExpression: { status: { $in: ['OPEN', 'SETTLED'] } } });
    yield mongoose_1.default.connection.collection('trusttransactions').createIndex({ paymentId: 1 }, { unique: true, partialFilterExpression: { paymentId: { $exists: true, $type: 'objectId' } } });
});
const isTransientTxUnsupported = (error) => {
    return (error === null || error === void 0 ? void 0 : error.code) === 20 || /Transaction numbers are only allowed/.test(String((error === null || error === void 0 ? void 0 : error.message) || ''));
};
const acquireLock = (dryRun) => __awaiter(void 0, void 0, void 0, function* () {
    if (dryRun)
        return { state: null, token: `dryrun-${Date.now()}` };
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + LEASE_MINUTES * 60000);
    const token = crypto_1.default.randomUUID();
    const state = yield MigrationState_1.MigrationState.findOneAndUpdate({
        migrationName: MIGRATION_NAME,
        $or: [
            { status: { $in: ['idle', 'completed', 'failed'] } },
            { leaseExpiresAt: { $lt: now } },
            { leaseExpiresAt: { $exists: false } }
        ]
    }, {
        $setOnInsert: { migrationName: MIGRATION_NAME, processedCount: 0 },
        $set: { status: 'running', startedAt: now, completedAt: null, leaseExpiresAt, lockToken: token, error: '' }
    }, { upsert: true, new: true });
    if (!state || state.lockToken !== token) {
        throw new Error('Backfill is already running. Please retry later.');
    }
    return { state, token };
});
const extendLease = (token, processedCount, lastProcessedId) => __awaiter(void 0, void 0, void 0, function* () {
    const leaseExpiresAt = new Date(Date.now() + LEASE_MINUTES * 60000);
    yield MigrationState_1.MigrationState.updateOne({ migrationName: MIGRATION_NAME, lockToken: token, status: 'running' }, { $set: { leaseExpiresAt, processedCount, lastProcessedId } });
});
const finishState = (token, status, processedCount, lastProcessedId, error) => __awaiter(void 0, void 0, void 0, function* () {
    yield MigrationState_1.MigrationState.updateOne({ migrationName: MIGRATION_NAME, lockToken: token }, {
        $set: {
            status,
            processedCount,
            lastProcessedId,
            completedAt: new Date(),
            leaseExpiresAt: null,
            error: error || ''
        }
    });
});
const readResumeCursor = (dryRun) => __awaiter(void 0, void 0, void 0, function* () {
    if (dryRun)
        return undefined;
    const state = yield MigrationState_1.MigrationState.findOne({ migrationName: MIGRATION_NAME }).lean();
    return (state === null || state === void 0 ? void 0 : state.lastProcessedId) || undefined;
});
const getPropertyBatch = (afterId, limit) => __awaiter(void 0, void 0, void 0, function* () {
    const query = {};
    if (afterId && mongoose_1.default.Types.ObjectId.isValid(afterId)) {
        query._id = { $gt: new mongoose_1.default.Types.ObjectId(afterId) };
    }
    return Property_1.Property.find(query).sort({ _id: 1 }).limit(limit).lean();
});
const shouldConsiderProperty = (property) => __awaiter(void 0, void 0, void 0, function* () {
    if (String((property === null || property === void 0 ? void 0 : property.status) || '').toLowerCase() === 'sold')
        return true;
    if (String((property === null || property === void 0 ? void 0 : property.rentalType) || '').toLowerCase() === 'sale')
        return true;
    const hasSalePayment = yield Payment_1.Payment.exists({
        propertyId: property._id,
        paymentType: 'sale',
        status: 'completed',
        isProvisional: { $ne: true },
        isInSuspense: { $ne: true }
    });
    return Boolean(hasSalePayment);
});
const writeAudit = (input) => __awaiter(void 0, void 0, void 0, function* () {
    yield TrustAuditLog_1.TrustAuditLog.create([
        {
            companyId: new mongoose_1.default.Types.ObjectId(input.companyId),
            entityType: 'MIGRATION',
            entityId: input.entityId,
            action: input.action,
            sourceEvent: 'migration.trust.backfill',
            migrationId: input.migrationId,
            oldValue: null,
            newValue: input.payload || {},
            performedBy: input.performedBy ? new mongoose_1.default.Types.ObjectId(input.performedBy) : undefined,
            timestamp: new Date()
        }
    ], input.session ? { session: input.session } : undefined);
});
const processProperty = (property, options) => __awaiter(void 0, void 0, void 0, function* () {
    const result = { accountsCreated: 0, transactionsCreated: 0, skippedExisting: 0, errors: [] };
    const processWithSession = (session) => __awaiter(void 0, void 0, void 0, function* () {
        let trustAccount = yield TrustAccount_1.TrustAccount.findOne({
            companyId: property.companyId,
            propertyId: property._id,
            status: { $in: ['OPEN', 'SETTLED', 'CLOSED'] }
        })
            .sort({ createdAt: -1 })
            .session(session || null);
        if (!trustAccount) {
            if (!options.dryRun) {
                const purchasePrice = money(Number((property === null || property === void 0 ? void 0 : property.price) || 0));
                const created = yield TrustAccount_1.TrustAccount.create([
                    {
                        companyId: property.companyId,
                        propertyId: property._id,
                        sellerId: property.ownerId || undefined,
                        openingBalance: 0,
                        runningBalance: 0,
                        closingBalance: 0,
                        purchasePrice,
                        amountReceived: 0,
                        amountOutstanding: purchasePrice,
                        status: 'OPEN',
                        workflowState: 'TRUST_OPEN'
                    }
                ], session ? { session } : undefined);
                trustAccount = created[0];
                yield writeAudit({
                    companyId: String(property.companyId),
                    action: 'TRUST_ACCOUNT_CREATED',
                    entityId: String(trustAccount._id),
                    migrationId: options.migrationId,
                    performedBy: options.performedBy,
                    payload: { propertyId: String(property._id), dryRun: false },
                    session
                });
            }
            result.accountsCreated += 1;
        }
        else {
            result.skippedExisting += 1;
            if (!options.dryRun) {
                yield writeAudit({
                    companyId: String(property.companyId),
                    action: 'SKIPPED_EXISTING',
                    entityId: String(trustAccount._id),
                    migrationId: options.migrationId,
                    performedBy: options.performedBy,
                    payload: { reason: 'trust_account_exists', propertyId: String(property._id) },
                    session
                });
            }
        }
        const payments = yield Payment_1.Payment.find({
            companyId: property.companyId,
            propertyId: property._id,
            paymentType: 'sale',
            status: 'completed',
            isProvisional: { $ne: true },
            isInSuspense: { $ne: true }
        })
            .sort({ paymentDate: 1, _id: 1 })
            .session(session || null);
        if (!payments.length || !trustAccount)
            return;
        const lastTx = yield TrustTransaction_1.TrustTransaction.findOne({
            companyId: property.companyId,
            trustAccountId: trustAccount._id
        })
            .sort({ createdAt: -1 })
            .session(session || null);
        let runningBalance = money(Number((lastTx === null || lastTx === void 0 ? void 0 : lastTx.runningBalance) || trustAccount.runningBalance || 0));
        let amountReceived = money(Number(trustAccount.amountReceived || 0));
        const purchasePrice = money(Number(trustAccount.purchasePrice || (property === null || property === void 0 ? void 0 : property.price) || 0));
        for (const payment of payments) {
            const existing = yield TrustTransaction_1.TrustTransaction.findOne({
                companyId: property.companyId,
                paymentId: payment._id
            }).session(session || null);
            if (existing) {
                result.skippedExisting += 1;
                if (!options.dryRun) {
                    yield writeAudit({
                        companyId: String(property.companyId),
                        action: 'SKIPPED_EXISTING',
                        entityId: String(existing._id),
                        migrationId: options.migrationId,
                        performedBy: options.performedBy,
                        payload: { reason: 'trust_transaction_exists', paymentId: String(payment._id) },
                        session
                    });
                }
                continue;
            }
            runningBalance = money(runningBalance + Number(payment.amount || 0));
            amountReceived = money(amountReceived + Number(payment.amount || 0));
            const txDoc = {
                companyId: property.companyId,
                trustAccountId: trustAccount._id,
                propertyId: property._id,
                paymentId: payment._id,
                type: 'BUYER_PAYMENT',
                debit: 0,
                credit: money(Number(payment.amount || 0)),
                vatComponent: 0,
                runningBalance,
                reference: payment.referenceNumber,
                sourceEvent: 'migration.trust.backfill',
                createdBy: options.performedBy && mongoose_1.default.Types.ObjectId.isValid(options.performedBy)
                    ? new mongoose_1.default.Types.ObjectId(options.performedBy)
                    : undefined
            };
            if (!options.dryRun) {
                try {
                    const createdTx = yield TrustTransaction_1.TrustTransaction.create([txDoc], session ? { session } : undefined);
                    yield writeAudit({
                        companyId: String(property.companyId),
                        action: 'TRUST_TRANSACTION_CREATED',
                        entityId: String(createdTx[0]._id),
                        migrationId: options.migrationId,
                        performedBy: options.performedBy,
                        payload: { paymentId: String(payment._id), amount: Number(payment.amount || 0) },
                        session
                    });
                }
                catch (error) {
                    if ((error === null || error === void 0 ? void 0 : error.code) === 11000) {
                        result.skippedExisting += 1;
                        continue;
                    }
                    throw error;
                }
            }
            result.transactionsCreated += 1;
        }
        if (!options.dryRun) {
            trustAccount.runningBalance = runningBalance;
            trustAccount.closingBalance = runningBalance;
            trustAccount.amountReceived = amountReceived;
            trustAccount.amountOutstanding = money(Math.max(0, purchasePrice - amountReceived));
            trustAccount.purchasePrice = purchasePrice;
            trustAccount.lastTransactionAt = new Date();
            yield trustAccount.save(session ? { session } : undefined);
        }
    });
    if (options.dryRun) {
        yield processWithSession(undefined);
        return result;
    }
    let session = null;
    try {
        session = yield mongoose_1.default.startSession();
        yield session.withTransaction(() => __awaiter(void 0, void 0, void 0, function* () {
            yield processWithSession(session || undefined);
        }));
    }
    catch (error) {
        if (isTransientTxUnsupported(error)) {
            yield processWithSession(undefined);
        }
        else {
            throw error;
        }
    }
    finally {
        if (session) {
            try {
                session.endSession();
            }
            catch (_a) { }
        }
    }
    return result;
});
const backfillTrustAccounts = (...args_1) => __awaiter(void 0, [...args_1], void 0, function* (options = {}) {
    const start = Date.now();
    const dryRun = Boolean(options.dryRun);
    const limit = Math.min(MAX_BATCH_LIMIT, Math.max(1, Number(options.limit || MAX_BATCH_LIMIT)));
    const migrationId = `${MIGRATION_NAME}:${Date.now()}`;
    if (!dryRun) {
        yield ensureBackfillIndexes();
    }
    const totals = {
        migrationName: MIGRATION_NAME,
        dryRun,
        accountsCreated: 0,
        transactionsCreated: 0,
        skippedExisting: 0,
        errors: [],
        processedProperties: 0,
        duration: 0
    };
    const { token } = yield acquireLock(dryRun);
    let lastProcessedId = yield readResumeCursor(dryRun);
    let done = false;
    try {
        while (!done) {
            const batch = yield getPropertyBatch(lastProcessedId, limit);
            if (!batch.length) {
                done = true;
                break;
            }
            for (const property of batch) {
                lastProcessedId = String(property._id);
                const relevant = yield shouldConsiderProperty(property);
                if (!relevant) {
                    totals.skippedExisting += 1;
                    continue;
                }
                try {
                    const r = yield processProperty(property, { dryRun, migrationId, performedBy: options.performedBy });
                    totals.accountsCreated += r.accountsCreated;
                    totals.transactionsCreated += r.transactionsCreated;
                    totals.skippedExisting += r.skippedExisting;
                    totals.errors.push(...r.errors.map((e) => (Object.assign({ propertyId: String(property._id) }, e))));
                    totals.processedProperties += 1;
                }
                catch (error) {
                    totals.errors.push({ propertyId: String(property._id), error: (error === null || error === void 0 ? void 0 : error.message) || 'Unknown property backfill error' });
                }
            }
            if (!dryRun) {
                yield extendLease(token, totals.processedProperties, lastProcessedId);
            }
        }
        if (!dryRun) {
            yield finishState(token, 'completed', totals.processedProperties, lastProcessedId);
        }
    }
    catch (error) {
        if (!dryRun) {
            yield finishState(token, 'failed', totals.processedProperties, lastProcessedId, (error === null || error === void 0 ? void 0 : error.message) || 'Backfill failed');
        }
        throw error;
    }
    totals.duration = Date.now() - start;
    return totals;
});
exports.backfillTrustAccounts = backfillTrustAccounts;
const getTrustBackfillState = () => __awaiter(void 0, void 0, void 0, function* () {
    return MigrationState_1.MigrationState.findOne({ migrationName: MIGRATION_NAME }).lean();
});
exports.getTrustBackfillState = getTrustBackfillState;
