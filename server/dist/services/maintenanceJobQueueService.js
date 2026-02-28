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
const os_1 = __importDefault(require("os"));
const MaintenanceJob_1 = require("../models/MaintenanceJob");
const propertyAccountService_1 = __importDefault(require("./propertyAccountService"));
const logger_1 = require("../utils/logger");
const POLL_INTERVAL_MS = Math.max(1000, Number(process.env.MAINTENANCE_QUEUE_POLL_INTERVAL_MS || 5000));
const LEASE_MS = Math.max(15000, Number(process.env.MAINTENANCE_QUEUE_LEASE_MS || 120000));
const MAX_ATTEMPTS = Math.max(1, Number(process.env.MAINTENANCE_QUEUE_MAX_ATTEMPTS || 3));
class MaintenanceJobQueueService {
    constructor() {
        this.timer = null;
        this.processing = false;
        this.workerId = `${os_1.default.hostname()}:${process.pid}`;
    }
    static getInstance() {
        if (!MaintenanceJobQueueService.instance) {
            MaintenanceJobQueueService.instance = new MaintenanceJobQueueService();
        }
        return MaintenanceJobQueueService.instance;
    }
    enqueue(operation, payload) {
        return __awaiter(this, void 0, void 0, function* () {
            const existing = yield MaintenanceJob_1.MaintenanceJob.findOne({
                operation,
                companyId: payload.companyId || '',
                status: { $in: ['pending', 'running'] }
            })
                .sort({ createdAt: -1 })
                .lean();
            if (existing) {
                return { job: existing, deduplicated: true };
            }
            const created = yield MaintenanceJob_1.MaintenanceJob.create({
                operation,
                companyId: payload.companyId || '',
                requestedBy: payload.requestedBy || '',
                status: 'pending',
                attempts: 0,
                maxAttempts: MAX_ATTEMPTS,
                runAfter: payload.runAfter || new Date()
            });
            return { job: created, deduplicated: false };
        });
    }
    getJobById(jobId, companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            return MaintenanceJob_1.MaintenanceJob.findOne(Object.assign({ _id: jobId }, (companyId ? { companyId } : {}))).lean();
        });
    }
    listRecentJobs(companyId_1, operation_1) {
        return __awaiter(this, arguments, void 0, function* (companyId, operation, limit = 20) {
            return MaintenanceJob_1.MaintenanceJob.find(Object.assign({ companyId }, (operation ? { operation } : {})))
                .sort({ createdAt: -1 })
                .limit(Math.min(Math.max(limit, 1), 100))
                .lean();
        });
    }
    start() {
        if (this.timer)
            return;
        this.timer = setInterval(() => {
            void this.tick();
        }, POLL_INTERVAL_MS);
        logger_1.logger.info(`Maintenance queue started (poll=${POLL_INTERVAL_MS}ms, worker=${this.workerId})`);
    }
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    tick() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.processing)
                return;
            this.processing = true;
            try {
                yield this.requeueExpiredLeases();
                const job = yield this.claimNextJob();
                if (!job)
                    return;
                yield this.executeJob(job);
            }
            catch (error) {
                logger_1.logger.error('Maintenance queue tick failed:', error);
            }
            finally {
                this.processing = false;
            }
        });
    }
    requeueExpiredLeases() {
        return __awaiter(this, void 0, void 0, function* () {
            const now = new Date();
            yield MaintenanceJob_1.MaintenanceJob.updateMany({
                status: 'running',
                leaseExpiresAt: { $lt: now }
            }, {
                $set: {
                    status: 'pending',
                    runAfter: new Date(now.getTime() + 5000),
                    workerId: '',
                    leaseExpiresAt: undefined
                }
            });
        });
    }
    claimNextJob() {
        return __awaiter(this, void 0, void 0, function* () {
            const now = new Date();
            return MaintenanceJob_1.MaintenanceJob.findOneAndUpdate({
                status: 'pending',
                runAfter: { $lte: now }
            }, {
                $set: {
                    status: 'running',
                    workerId: this.workerId,
                    startedAt: new Date(),
                    leaseExpiresAt: new Date(Date.now() + LEASE_MS),
                    finishedAt: undefined
                },
                $inc: { attempts: 1 }
            }, {
                sort: { runAfter: 1, createdAt: 1 },
                new: true
            });
        });
    }
    executeJob(job) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                let result = {};
                if (job.operation === 'sync_property_accounts') {
                    yield propertyAccountService_1.default.syncPropertyAccountsWithPayments();
                    const migrated = yield propertyAccountService_1.default.migrateSalesLedgerForCompany();
                    result = { migrated };
                }
                else if (job.operation === 'ensure_development_ledgers') {
                    result = yield propertyAccountService_1.default.ensureDevelopmentLedgersAndBackfillPayments({
                        companyId: job.companyId || undefined
                    });
                }
                else {
                    throw new Error(`Unknown maintenance operation: ${String(job.operation)}`);
                }
                yield MaintenanceJob_1.MaintenanceJob.updateOne({ _id: job._id, status: 'running' }, {
                    $set: {
                        status: 'completed',
                        result,
                        finishedAt: new Date(),
                        leaseExpiresAt: undefined,
                        lastError: undefined
                    }
                });
            }
            catch (error) {
                const message = String((error === null || error === void 0 ? void 0 : error.message) || error);
                const attempts = Number(job.attempts || 0);
                const maxAttempts = Number(job.maxAttempts || MAX_ATTEMPTS);
                const retryable = attempts < maxAttempts;
                const backoffMs = Math.min(300000, 5000 * Math.max(1, attempts));
                yield MaintenanceJob_1.MaintenanceJob.updateOne({ _id: job._id, status: 'running' }, {
                    $set: {
                        status: retryable ? 'pending' : 'failed',
                        runAfter: retryable ? new Date(Date.now() + backoffMs) : new Date(),
                        lastError: message,
                        finishedAt: retryable ? undefined : new Date(),
                        leaseExpiresAt: undefined
                    }
                });
                logger_1.logger.error(`Maintenance job ${String(job._id)} failed (${job.operation}):`, error);
            }
        });
    }
}
exports.default = MaintenanceJobQueueService.getInstance();
