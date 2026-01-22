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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScheduledSyncService = void 0;
const cron_1 = require("cron");
const databaseSyncService_1 = __importDefault(require("./databaseSyncService"));
const SyncFailure_1 = __importDefault(require("../models/SyncFailure"));
const logger_1 = require("../utils/logger");
const Payment_1 = require("../models/Payment");
const PropertyAccount_1 = __importDefault(require("../models/PropertyAccount"));
const propertyAccountService_1 = __importStar(require("./propertyAccountService"));
class ScheduledSyncService {
    constructor() {
        this.syncJobs = new Map();
        this.syncSchedules = new Map();
        this.databaseSyncService = databaseSyncService_1.default.getInstance();
        this.initializeSchedules();
    }
    static getInstance() {
        if (!ScheduledSyncService.instance) {
            ScheduledSyncService.instance = new ScheduledSyncService();
        }
        return ScheduledSyncService.instance;
    }
    /**
     * Initialize default sync schedules
     */
    initializeSchedules() {
        // Daily sync at 2 AM
        this.addSyncSchedule({
            name: 'daily_sync',
            cronExpression: '0 2 * * *',
            description: 'Daily full synchronization at 2 AM',
            enabled: true,
            runCount: 0,
            averageDuration: 0
        });
        // Hourly sync for critical data
        this.addSyncSchedule({
            name: 'hourly_sync',
            cronExpression: '0 * * * *',
            description: 'Hourly synchronization of payments and properties',
            enabled: true,
            runCount: 0,
            averageDuration: 0
        });
        // Frequent ledger reconciliation (keep small and cheap)
        this.addSyncSchedule({
            name: 'ledger_reconciliation',
            cronExpression: '*/5 * * * *',
            description: 'Re-post recent payments and dedupe property ledgers',
            enabled: true,
            runCount: 0,
            averageDuration: 0
        });
        // Weekly consistency check
        this.addSyncSchedule({
            name: 'weekly_consistency_check',
            cronExpression: '0 3 * * 0',
            description: 'Weekly data consistency validation',
            enabled: true,
            runCount: 0,
            averageDuration: 0
        });
        // Monthly deep sync
        this.addSyncSchedule({
            name: 'monthly_deep_sync',
            cronExpression: '0 4 1 * *',
            description: 'Monthly deep synchronization and cleanup',
            enabled: true,
            runCount: 0,
            averageDuration: 0
        });
        // Reprocess sync failures every 5 minutes
        this.addSyncSchedule({
            name: 'sync_failure_reprocessor',
            cronExpression: '*/5 * * * *',
            description: 'Reprocess pending sync failures with backoff',
            enabled: true,
            runCount: 0,
            averageDuration: 0
        });
    }
    /**
     * Add a new sync schedule
     */
    addSyncSchedule(schedule) {
        try {
            // Validate cron expression
            new cron_1.CronJob(schedule.cronExpression, () => { }, null, false);
            this.syncSchedules.set(schedule.name, schedule);
            if (schedule.enabled) {
                this.startSyncJob(schedule);
            }
            logger_1.logger.info(`Added sync schedule: ${schedule.name} - ${schedule.description}`);
        }
        catch (error) {
            logger_1.logger.error(`Invalid cron expression for schedule ${schedule.name}:`, error);
            throw new Error(`Invalid cron expression: ${schedule.cronExpression}`);
        }
    }
    /**
     * Start a sync job
     */
    startSyncJob(schedule) {
        try {
            // Avoid starting the same job twice
            if (this.syncJobs.has(schedule.name)) {
                logger_1.logger.info(`Sync job already started: ${schedule.name} - skipping`);
                return;
            }
            const job = new cron_1.CronJob(schedule.cronExpression, () => __awaiter(this, void 0, void 0, function* () {
                yield this.executeScheduledSync(schedule);
            }), null, false, 'UTC');
            this.syncJobs.set(schedule.name, job);
            job.start();
            // Calculate next run time
            schedule.nextRun = job.nextDate().toJSDate();
            logger_1.logger.info(`Started sync job: ${schedule.name} - Next run: ${schedule.nextRun}`);
        }
        catch (error) {
            logger_1.logger.error(`Failed to start sync job ${schedule.name}:`, error);
        }
    }
    /**
     * Stop a sync job
     */
    stopSyncJob(scheduleName) {
        const job = this.syncJobs.get(scheduleName);
        if (job) {
            job.stop();
            this.syncJobs.delete(scheduleName);
            const schedule = this.syncSchedules.get(scheduleName);
            if (schedule) {
                schedule.enabled = false;
                schedule.nextRun = undefined;
            }
            logger_1.logger.info(`Stopped sync job: ${scheduleName}`);
        }
    }
    /**
     * Enable a sync schedule
     */
    enableSyncSchedule(scheduleName) {
        const schedule = this.syncSchedules.get(scheduleName);
        if (schedule && !schedule.enabled) {
            schedule.enabled = true;
            this.startSyncJob(schedule);
            logger_1.logger.info(`Enabled sync schedule: ${scheduleName}`);
        }
    }
    /**
     * Disable a sync schedule
     */
    disableSyncSchedule(scheduleName) {
        const schedule = this.syncSchedules.get(scheduleName);
        if (schedule && schedule.enabled) {
            this.stopSyncJob(scheduleName);
            logger_1.logger.info(`Disabled sync schedule: ${scheduleName}`);
        }
    }
    /**
     * Execute a scheduled synchronization
     */
    executeScheduledSync(schedule) {
        return __awaiter(this, void 0, void 0, function* () {
            const startTime = Date.now();
            logger_1.logger.info(`Executing scheduled sync: ${schedule.name}`);
            try {
                // Update schedule info
                schedule.lastRun = new Date();
                schedule.runCount++;
                // Execute appropriate sync based on schedule type
                switch (schedule.name) {
                    case 'daily_sync':
                        yield this.executeDailySync();
                        break;
                    case 'hourly_sync':
                        yield this.executeHourlySync();
                        break;
                    case 'ledger_reconciliation':
                        yield this.executeLedgerReconciliation();
                        break;
                    case 'weekly_consistency_check':
                        yield this.executeWeeklyConsistencyCheck();
                        break;
                    case 'monthly_deep_sync':
                        yield this.executeMonthlyDeepSync();
                        break;
                    case 'sync_failure_reprocessor':
                        yield this.executeFailureReprocessor();
                        break;
                    default:
                        yield this.executeCustomSync(schedule);
                }
                // Calculate and update average duration
                const duration = Date.now() - startTime;
                schedule.averageDuration = (schedule.averageDuration * (schedule.runCount - 1) + duration) / schedule.runCount;
                // Calculate next run time
                const job = this.syncJobs.get(schedule.name);
                if (job) {
                    schedule.nextRun = job.nextDate().toJSDate();
                }
                logger_1.logger.info(`Completed scheduled sync: ${schedule.name} in ${duration}ms`);
            }
            catch (error) {
                logger_1.logger.error(`Failed to execute scheduled sync ${schedule.name}:`, error);
                // Emit error event
                this.databaseSyncService.emit('scheduledSyncError', {
                    scheduleName: schedule.name,
                    error: error instanceof Error ? error.message : String(error),
                    timestamp: new Date()
                });
            }
        });
    }
    /**
     * Execute failure reprocessor
     */
    executeFailureReprocessor() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const MAX_ATTEMPTS = 10;
            const BASE_BACKOFF_MS = 5 * 60 * 1000; // 5 minutes
            try {
                const now = new Date();
                const pending = yield SyncFailure_1.default.find({
                    status: 'pending',
                    $or: [
                        { nextAttemptAt: { $exists: false } },
                        { nextAttemptAt: { $lte: now } }
                    ]
                }).limit(100);
                for (const fail of pending) {
                    try {
                        yield this.databaseSyncService.retrySyncFor(fail.type, fail.documentId);
                        // On success, mark resolved
                        yield SyncFailure_1.default.updateOne({ _id: fail._id }, { $set: { status: 'resolved' } });
                        this.databaseSyncService.emit('syncFailureResolved', {
                            type: fail.type,
                            documentId: fail.documentId,
                            resolvedAt: new Date()
                        });
                    }
                    catch (err) {
                        const attemptCount = ((_a = fail.attemptCount) !== null && _a !== void 0 ? _a : 0) + 1;
                        const retriable = this.databaseSyncService['db'].shouldRetry(err);
                        const backoff = Math.min(BASE_BACKOFF_MS * Math.pow(2, attemptCount - 1), 24 * 60 * 60 * 1000); // cap at 24h
                        const update = {
                            $set: {
                                errorName: err === null || err === void 0 ? void 0 : err.name,
                                errorCode: err === null || err === void 0 ? void 0 : err.code,
                                errorMessage: (_b = err === null || err === void 0 ? void 0 : err.message) !== null && _b !== void 0 ? _b : String(err),
                                errorLabels: Array.isArray(err === null || err === void 0 ? void 0 : err.errorLabels) ? err.errorLabels : [],
                                retriable,
                                lastErrorAt: new Date(),
                                nextAttemptAt: retriable ? new Date(Date.now() + backoff) : undefined,
                                status: attemptCount >= MAX_ATTEMPTS || !retriable ? 'discarded' : 'pending'
                            },
                            $inc: { attemptCount: 1 }
                        };
                        yield SyncFailure_1.default.updateOne({ _id: fail._id }, update);
                        this.databaseSyncService.emit('syncFailureRetry', {
                            type: fail.type,
                            documentId: fail.documentId,
                            attempt: attemptCount,
                            retriable,
                            nextAttemptAt: retriable ? new Date(Date.now() + backoff) : undefined
                        });
                    }
                }
            }
            catch (error) {
                logger_1.logger.error('Failure reprocessor run failed:', error);
            }
        });
    }
    /**
     * Execute daily synchronization
     */
    executeDailySync() {
        return __awaiter(this, void 0, void 0, function* () {
            logger_1.logger.info('Starting daily synchronization...');
            // Perform full sync
            yield this.databaseSyncService.performFullSync();
            // Clean up old sync errors (keep last 30 days)
            yield this.cleanupOldSyncErrors();
            logger_1.logger.info('Daily synchronization completed');
        });
    }
    /**
     * Execute hourly synchronization
     */
    executeHourlySync() {
        return __awaiter(this, void 0, void 0, function* () {
            logger_1.logger.info('Starting hourly synchronization...');
            // Sync only recent changes (last hour)
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            // This would be implemented in the DatabaseSyncService
            // For now, we'll do a quick sync of critical data
            yield this.syncRecentChanges(oneHourAgo);
            logger_1.logger.info('Hourly synchronization completed');
        });
    }
    /**
     * Execute ledger reconciliation
     */
    executeLedgerReconciliation() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, e_1, _b, _c;
            var _d, _e, _f;
            const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
            try {
                // 1) Re-post recent completed payments (idempotent, guarded by unique indexes)
                const recentPayments = yield Payment_1.Payment.find({ status: 'completed', paymentDate: { $gte: since } }).select('_id');
                for (const p of recentPayments) {
                    try {
                        yield propertyAccountService_1.default.recordIncomeFromPayment(String(p._id));
                    }
                    catch (e) {
                        try {
                            yield (yield Promise.resolve().then(() => __importStar(require('./ledgerEventService')))).default.enqueueOwnerIncomeEvent(String(p._id));
                        }
                        catch (_g) { }
                        logger_1.logger.warn('Reconciliation: failed to post income for payment, enqueued:', (e === null || e === void 0 ? void 0 : e.message) || e);
                    }
                }
                // 2) Ensure company commissions are present for recent payments (idempotent)
                try {
                    const { CompanyAccount } = yield Promise.resolve().then(() => __importStar(require('../models/CompanyAccount')));
                    const payList = yield Payment_1.Payment.find({
                        status: 'completed',
                        paymentDate: { $gte: since },
                        'commissionDetails.agencyShare': { $gt: 0 }
                    }).select('_id companyId paymentType commissionDetails paymentDate currency paymentMethod referenceNumber processedBy notes');
                    for (const p of payList) {
                        if (!p.companyId)
                            continue;
                        const desiredSource = p.paymentType === 'sale' ? 'sales_commission' : 'rental_commission';
                        const txDoc = {
                            type: 'income',
                            source: desiredSource,
                            amount: Number(((_d = p.commissionDetails) === null || _d === void 0 ? void 0 : _d.agencyShare) || 0),
                            date: p.paymentDate || new Date(),
                            currency: p.currency || 'USD',
                            paymentMethod: p.paymentMethod,
                            paymentId: p._id,
                            referenceNumber: p.referenceNumber,
                            description: desiredSource === 'sales_commission' ? 'Sales commission income' : 'Rental commission income',
                            processedBy: p.processedBy,
                            notes: p.notes
                        };
                        yield CompanyAccount.updateOne({ companyId: p.companyId }, { $setOnInsert: { companyId: p.companyId, runningBalance: 0, totalIncome: 0, totalExpenses: 0, lastUpdated: new Date() } }, { upsert: true });
                        yield CompanyAccount.updateOne({ companyId: p.companyId, transactions: { $not: { $elemMatch: { paymentId: p._id, isArchived: { $ne: true } } } } }, {
                            $push: { transactions: txDoc },
                            $inc: { totalIncome: Number(((_e = p.commissionDetails) === null || _e === void 0 ? void 0 : _e.agencyShare) || 0), runningBalance: Number(((_f = p.commissionDetails) === null || _f === void 0 ? void 0 : _f.agencyShare) || 0) },
                            $set: { lastUpdated: new Date() }
                        });
                    }
                }
                catch (ensureErr) {
                    logger_1.logger.warn('Reconciliation: ensuring company commissions skipped:', (ensureErr === null || ensureErr === void 0 ? void 0 : ensureErr.message) || ensureErr);
                }
                // 3) Dedupe any property accounts updated recently
                const recentAccounts = yield PropertyAccount_1.default.find({ lastUpdated: { $gte: since } }).select('_id propertyId ledgerType');
                for (const acct of recentAccounts) {
                    try {
                        yield (0, propertyAccountService_1.reconcilePropertyLedgerDuplicates)(String(acct.propertyId), acct.ledgerType);
                    }
                    catch (e) {
                        logger_1.logger.warn('Reconciliation: failed to dedupe ledger', { accountId: String(acct._id), err: (e === null || e === void 0 ? void 0 : e.message) || e });
                    }
                }
                // 4) Dedupe company accounts updated recently (keep earliest for each paymentId, archive the rest)
                try {
                    const { CompanyAccount } = yield Promise.resolve().then(() => __importStar(require('../models/CompanyAccount')));
                    const cursor = CompanyAccount.find({ lastUpdated: { $gte: since } })
                        .select('_id companyId transactions.paymentId transactions.date transactions._id transactions.type transactions.amount')
                        .lean()
                        .cursor();
                    try {
                        for (var _h = true, _j = __asyncValues(cursor), _k; _k = yield _j.next(), _a = _k.done, !_a; _h = true) {
                            _c = _k.value;
                            _h = false;
                            const ca = _c;
                            try {
                                const grouped = Object.create(null);
                                const txs = Array.isArray(ca.transactions) ? ca.transactions : [];
                                for (const t of txs) {
                                    const pid = (t === null || t === void 0 ? void 0 : t.paymentId) ? String(t.paymentId) : '';
                                    if (!pid)
                                        continue;
                                    (grouped[pid] || (grouped[pid] = [])).push({ _id: t._id, date: new Date(t.date) });
                                }
                                const toArchive = [];
                                for (const pid of Object.keys(grouped)) {
                                    const list = grouped[pid];
                                    if (list.length <= 1)
                                        continue;
                                    const sorted = list.slice().sort((a, b) => a.date.getTime() - b.date.getTime());
                                    toArchive.push(...sorted.slice(1).map(i => i._id).filter(Boolean));
                                }
                                if (toArchive.length > 0) {
                                    // Soft-archive duplicates via native update to bypass immutability
                                    yield CompanyAccount.collection.updateOne({ _id: ca._id }, { $set: { 'transactions.$[t].isArchived': true, lastUpdated: new Date() } }, { arrayFilters: [{ 't._id': { $in: toArchive } }] });
                                    // Recalculate totals using only active transactions
                                    const fresh = yield CompanyAccount.findById(ca._id).select('_id transactions').lean();
                                    if (fresh) {
                                        const active = (Array.isArray(fresh.transactions) ? fresh.transactions : []).filter((t) => (t === null || t === void 0 ? void 0 : t.isArchived) !== true);
                                        const income = active.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount || 0), 0);
                                        const expenses = active.filter((t) => t.type !== 'income').reduce((s, t) => s + Number(t.amount || 0), 0);
                                        yield CompanyAccount.updateOne({ _id: fresh._id }, { $set: { totalIncome: income, totalExpenses: expenses, runningBalance: income - expenses, lastUpdated: new Date() } });
                                    }
                                }
                            }
                            catch (docErr) {
                                logger_1.logger.warn('Reconciliation: company ledger dedupe failed for account', { accountId: String((ca === null || ca === void 0 ? void 0 : ca._id) || ''), err: (docErr === null || docErr === void 0 ? void 0 : docErr.message) || docErr });
                            }
                        }
                    }
                    catch (e_1_1) { e_1 = { error: e_1_1 }; }
                    finally {
                        try {
                            if (!_h && !_a && (_b = _j.return)) yield _b.call(_j);
                        }
                        finally { if (e_1) throw e_1.error; }
                    }
                }
                catch (dedupeErr) {
                    logger_1.logger.warn('Reconciliation: company ledger dedupe skipped:', (dedupeErr === null || dedupeErr === void 0 ? void 0 : dedupeErr.message) || dedupeErr);
                }
            }
            catch (err) {
                logger_1.logger.error('Ledger reconciliation job failed:', err);
                throw err;
            }
        });
    }
    /**
     * Execute weekly consistency check
     */
    executeWeeklyConsistencyCheck() {
        return __awaiter(this, void 0, void 0, function* () {
            logger_1.logger.info('Starting weekly consistency check...');
            // Validate data consistency between databases
            const consistency = yield this.databaseSyncService.validateDataConsistency();
            if (!consistency.isConsistent) {
                logger_1.logger.warn(`Data consistency issues found: ${consistency.inconsistencies.length}`);
                // Log inconsistencies
                for (const issue of consistency.inconsistencies) {
                    logger_1.logger.warn(`Consistency issue: ${issue.type} - ${issue.description}`);
                }
                // Attempt to fix common issues
                yield this.attemptConsistencyFixes(consistency.inconsistencies);
            }
            else {
                logger_1.logger.info('Data consistency check passed');
            }
            logger_1.logger.info('Weekly consistency check completed');
        });
    }
    /**
     * Execute monthly deep synchronization
     */
    executeMonthlyDeepSync() {
        return __awaiter(this, void 0, void 0, function* () {
            logger_1.logger.info('Starting monthly deep synchronization...');
            // Full sync with additional cleanup
            yield this.databaseSyncService.performFullSync();
            // Clean up orphaned records
            yield this.cleanupOrphanedRecords();
            // Optimize database indexes
            yield this.optimizeDatabaseIndexes();
            // Generate sync report
            yield this.generateSyncReport();
            logger_1.logger.info('Monthly deep synchronization completed');
        });
    }
    /**
     * Execute custom synchronization
     */
    executeCustomSync(schedule) {
        return __awaiter(this, void 0, void 0, function* () {
            logger_1.logger.info(`Executing custom sync: ${schedule.name}`);
            // Default to full sync for custom schedules
            yield this.databaseSyncService.performFullSync();
        });
    }
    /**
     * Sync recent changes
     */
    syncRecentChanges(since) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // This would sync only documents modified since the given time
                // Implementation depends on your specific needs
                logger_1.logger.info(`Syncing changes since ${since.toISOString()}`);
                // For now, we'll do a quick validation
                yield this.databaseSyncService.validateDataConsistency();
            }
            catch (error) {
                logger_1.logger.error('Failed to sync recent changes:', error);
                throw error;
            }
        });
    }
    /**
     * Attempt to fix consistency issues
     */
    attemptConsistencyFixes(inconsistencies) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                logger_1.logger.info('Attempting to fix consistency issues...');
                for (const issue of inconsistencies) {
                    try {
                        switch (issue.type) {
                            case 'orphaned_property_account':
                                yield this.fixOrphanedPropertyAccounts();
                                break;
                            case 'missing_property_account':
                                yield this.fixMissingPropertyAccounts();
                                break;
                            case 'orphaned_owner_reference':
                                yield this.fixOrphanedOwnerReferences();
                                break;
                            default:
                                logger_1.logger.warn(`No automatic fix available for issue type: ${issue.type}`);
                        }
                    }
                    catch (error) {
                        logger_1.logger.error(`Failed to fix issue ${issue.type}:`, error);
                    }
                }
            }
            catch (error) {
                logger_1.logger.error('Failed to attempt consistency fixes:', error);
            }
        });
    }
    /**
     * Fix orphaned property accounts
     */
    fixOrphanedPropertyAccounts() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const PropertyAccount = require('../models/PropertyAccount').default;
                const Property = require('../models/Property').default;
                const Development = require('../models/Development').default;
                const DevelopmentUnit = require('../models/DevelopmentUnit').default;
                // Only consider non-archived accounts for repair
                const propertyAccounts = yield PropertyAccount.find({ isArchived: { $ne: true } });
                let archivedCount = 0;
                for (const account of propertyAccounts) {
                    const pid = account.propertyId;
                    // Check presence across all supported entity types
                    const [propExists, devExists, unitExists] = yield Promise.all([
                        Property.findById(pid).select('_id').lean(),
                        Development.findById(pid).select('_id').lean(),
                        DevelopmentUnit.findById(pid).select('_id').lean()
                    ]);
                    const exists = Boolean(propExists || devExists || unitExists);
                    if (!exists) {
                        yield PropertyAccount.updateOne({ _id: account._id, isArchived: { $ne: true } }, { $set: { isArchived: true, isActive: false, lastUpdated: new Date() } });
                        archivedCount++;
                    }
                }
                if (archivedCount > 0) {
                    logger_1.logger.info(`Archived ${archivedCount} orphaned property account(s) (no backing entity found)`);
                }
                return archivedCount;
            }
            catch (error) {
                logger_1.logger.error('Failed to fix orphaned property accounts:', error);
                throw error;
            }
        });
    }
    /**
     * Public entrypoint to archive orphaned property accounts on demand
     */
    runOrphanedAccountArchival() {
        return __awaiter(this, void 0, void 0, function* () {
            const archived = yield this.fixOrphanedPropertyAccounts();
            return { archived };
        });
    }
    /**
     * Fix missing property accounts
     */
    fixMissingPropertyAccounts() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const Property = require('../models/Property').default;
                const properties = yield Property.find({});
                let createdCount = 0;
                for (const property of properties) {
                    yield this.databaseSyncService['syncPropertyToAccounting'](property);
                    createdCount++;
                }
                if (createdCount > 0) {
                    logger_1.logger.info(`Created ${createdCount} missing property accounts`);
                }
            }
            catch (error) {
                logger_1.logger.error('Failed to fix missing property accounts:', error);
                throw error;
            }
        });
    }
    /**
     * Fix orphaned owner references
     */
    fixOrphanedOwnerReferences() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const PropertyAccount = require('../models/PropertyAccount').default;
                const User = require('../models/User').default;
                const PropertyOwner = require('../models/PropertyOwner').default;
                const propertyAccounts = yield PropertyAccount.find({ ownerId: { $exists: true } });
                let fixedCount = 0;
                for (const account of propertyAccounts) {
                    if (account.ownerId) {
                        const [po, u] = yield Promise.all([
                            PropertyOwner.findById(account.ownerId).select('_id'),
                            User.findById(account.ownerId).select('_id')
                        ]);
                        if (!po && !u) {
                            yield PropertyAccount.findByIdAndUpdate(account._id, {
                                $unset: { ownerId: 1, ownerName: 1 },
                                $set: { lastUpdated: new Date() }
                            });
                            fixedCount++;
                        }
                    }
                }
                if (fixedCount > 0) {
                    logger_1.logger.info(`Fixed ${fixedCount} orphaned owner references`);
                }
                return fixedCount;
            }
            catch (error) {
                logger_1.logger.error('Failed to fix orphaned owner references:', error);
                throw error;
            }
        });
    }
    /**
     * Public entrypoint to cleanup orphaned owner references
     */
    runOrphanedOwnerReferenceCleanup() {
        return __awaiter(this, void 0, void 0, function* () {
            const cleaned = yield this.fixOrphanedOwnerReferences();
            return { cleaned };
        });
    }
    /**
     * Cleanup orphaned owner references for a specific ownerId
     */
    runOwnerReferenceCleanupForOwnerId(ownerId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const PropertyAccount = require('../models/PropertyAccount').default;
                const User = require('../models/User').default;
                const PropertyOwner = require('../models/PropertyOwner').default;
                let cleaned = 0;
                const accounts = yield PropertyAccount.find({ ownerId: ownerId });
                for (const account of accounts) {
                    const [po, u] = yield Promise.all([
                        PropertyOwner.findById(ownerId).select('_id').lean(),
                        User.findById(ownerId).select('_id').lean()
                    ]);
                    if (!po && !u) {
                        yield PropertyAccount.updateOne({ _id: account._id }, { $unset: { ownerId: 1, ownerName: 1 }, $set: { lastUpdated: new Date() } });
                        cleaned++;
                    }
                }
                if (cleaned > 0) {
                    logger_1.logger.info(`Cleaned ${cleaned} orphaned owner reference(s) for ownerId ${ownerId}`);
                }
                return { cleaned };
            }
            catch (e) {
                logger_1.logger.error('Failed to cleanup orphaned owner reference for ownerId:', ownerId, e);
                throw e;
            }
        });
    }
    /**
     * Clean up orphaned records
     */
    cleanupOrphanedRecords() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                logger_1.logger.info('Cleaning up orphaned records...');
                // This would implement cleanup logic for various orphaned records
                // Implementation depends on your specific data model
                logger_1.logger.info('Orphaned records cleanup completed');
            }
            catch (error) {
                logger_1.logger.error('Failed to cleanup orphaned records:', error);
            }
        });
    }
    /**
     * Optimize database indexes
     */
    optimizeDatabaseIndexes() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                logger_1.logger.info('Optimizing database indexes...');
                // This would implement index optimization logic
                // Implementation depends on your specific needs
                logger_1.logger.info('Database index optimization completed');
            }
            catch (error) {
                logger_1.logger.error('Failed to optimize database indexes:', error);
            }
        });
    }
    /**
     * Generate sync report
     */
    generateSyncReport() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                logger_1.logger.info('Generating sync report...');
                const stats = this.databaseSyncService.getSyncStats();
                const schedules = Array.from(this.syncSchedules.values());
                const report = {
                    timestamp: new Date(),
                    syncStats: stats,
                    schedules: schedules,
                    summary: {
                        totalSchedules: schedules.length,
                        enabledSchedules: schedules.filter(s => s.enabled).length,
                        totalRuns: schedules.reduce((sum, s) => sum + s.runCount, 0),
                        averageDuration: schedules.reduce((sum, s) => sum + s.averageDuration, 0) / schedules.length
                    }
                };
                // Log report summary
                logger_1.logger.info('Sync Report Generated:', {
                    totalSchedules: report.summary.totalSchedules,
                    enabledSchedules: report.summary.enabledSchedules,
                    totalRuns: report.summary.totalRuns,
                    averageDuration: Math.round(report.summary.averageDuration)
                });
                // Emit report generated event
                this.databaseSyncService.emit('syncReportGenerated', report);
            }
            catch (error) {
                logger_1.logger.error('Failed to generate sync report:', error);
            }
        });
    }
    /**
     * Clean up old sync errors
     */
    cleanupOldSyncErrors() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // This would clean up old sync error logs
                // Implementation depends on your logging strategy
                logger_1.logger.info('Old sync errors cleanup completed');
            }
            catch (error) {
                logger_1.logger.error('Failed to cleanup old sync errors:', error);
            }
        });
    }
    /**
     * Get all sync schedules
     */
    getSyncSchedules() {
        try {
            return Array.from(this.syncSchedules.values());
        }
        catch (error) {
            logger_1.logger.error('Error getting sync schedules:', error);
            return [];
        }
    }
    /**
     * Get sync schedule by name
     */
    getSyncSchedule(name) {
        return this.syncSchedules.get(name);
    }
    /**
     * Update sync schedule
     */
    updateSyncSchedule(name, updates) {
        const schedule = this.syncSchedules.get(name);
        if (schedule) {
            const updatedSchedule = Object.assign(Object.assign({}, schedule), updates);
            // Stop existing job if schedule is being disabled
            if (schedule.enabled && !updatedSchedule.enabled) {
                this.stopSyncJob(name);
            }
            // Start new job if schedule is being enabled
            if (!schedule.enabled && updatedSchedule.enabled) {
                this.startSyncJob(updatedSchedule);
            }
            // Update schedule
            this.syncSchedules.set(name, updatedSchedule);
            logger_1.logger.info(`Updated sync schedule: ${name}`);
        }
    }
    /**
     * Start all enabled sync schedules
     */
    startAllSchedules() {
        logger_1.logger.info('Starting all enabled sync schedules...');
        for (const schedule of this.syncSchedules.values()) {
            if (schedule.enabled) {
                this.startSyncJob(schedule);
            }
        }
        logger_1.logger.info('All enabled sync schedules started');
    }
    /**
     * Stop all sync schedules
     */
    stopAllSchedules() {
        logger_1.logger.info('Stopping all sync schedules...');
        for (const [name] of this.syncJobs) {
            this.stopSyncJob(name);
        }
        logger_1.logger.info('All sync schedules stopped');
    }
    /**
     * Get service status
     */
    getStatus() {
        try {
            const schedules = Array.from(this.syncSchedules.values());
            const enabledSchedules = schedules.filter(s => s.enabled);
            // Find the next scheduled run
            let nextScheduledRun;
            for (const schedule of enabledSchedules) {
                if (schedule.nextRun && (!nextScheduledRun || schedule.nextRun < nextScheduledRun)) {
                    nextScheduledRun = schedule.nextRun;
                }
            }
            return {
                isRunning: this.syncJobs.size > 0,
                totalSchedules: schedules.length,
                enabledSchedules: enabledSchedules.length,
                nextScheduledRun
            };
        }
        catch (error) {
            logger_1.logger.error('Error getting scheduled sync status:', error);
            return {
                isRunning: false,
                totalSchedules: 0,
                enabledSchedules: 0,
                nextScheduledRun: undefined
            };
        }
    }
}
exports.ScheduledSyncService = ScheduledSyncService;
exports.default = ScheduledSyncService;
