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
exports.isLeaseAvailable = exports.canMutateLease = void 0;
exports.getScheduledJobLeaseMs = getScheduledJobLeaseMs;
exports.getLeaseRenewIntervalMs = getLeaseRenewIntervalMs;
exports.leaseKey = leaseKey;
exports.acquireJobLease = acquireJobLease;
exports.renewJobLease = renewJobLease;
exports.releaseJobLease = releaseJobLease;
exports.runWithJobLease = runWithJobLease;
const crypto_1 = __importDefault(require("crypto"));
const os_1 = __importDefault(require("os"));
const SystemSetting_1 = __importDefault(require("../models/SystemSetting"));
const logger_1 = require("../utils/logger");
var jobLeaseGuards_1 = require("./jobLeaseGuards");
Object.defineProperty(exports, "canMutateLease", { enumerable: true, get: function () { return jobLeaseGuards_1.canMutateLease; } });
Object.defineProperty(exports, "isLeaseAvailable", { enumerable: true, get: function () { return jobLeaseGuards_1.isLeaseAvailable; } });
// Reuses SystemSetting (unique `key`) so no accounting schema change.
// lastError holds the owner token; completedAt is the lease expiry.
const DEFAULT_LEASE_MS = Math.max(30000, Number(process.env.SCHEDULED_JOB_LEASE_MS || 180000));
const KEY_PREFIX = 'job_lease:';
function getScheduledJobLeaseMs() {
    return DEFAULT_LEASE_MS;
}
function getLeaseRenewIntervalMs(leaseMs = DEFAULT_LEASE_MS) {
    return Math.max(10000, Math.floor(leaseMs / 3));
}
function leaseKey(jobName) {
    return `${KEY_PREFIX}${jobName}`;
}
function acquireJobLease(jobName_1) {
    return __awaiter(this, arguments, void 0, function* (jobName, leaseMs = DEFAULT_LEASE_MS) {
        const now = new Date();
        const token = crypto_1.default.randomUUID();
        const ownerId = `${os_1.default.hostname()}:${process.pid}:${token.slice(0, 8)}`;
        const key = leaseKey(jobName);
        const leaseExpiresAt = new Date(now.getTime() + leaseMs);
        try {
            const claimed = yield SystemSetting_1.default.findOneAndUpdate({
                key,
                $or: [
                    { lastError: { $in: [null, ''] } },
                    { lastError: { $exists: false } },
                    { completedAt: { $exists: false } },
                    { completedAt: null },
                    { completedAt: { $lte: now } }
                ]
            }, {
                $setOnInsert: { key, version: 1 },
                $set: {
                    lastError: token,
                    startedAt: now,
                    completedAt: leaseExpiresAt,
                    value: {
                        kind: 'job_lease',
                        ownerToken: token,
                        ownerId,
                        leaseExpiresAt,
                        acquiredAt: now,
                        renewedAt: now
                    }
                }
            }, { upsert: true, new: true });
            if (!claimed || String(claimed.lastError || '') !== token) {
                return null;
            }
            return { token, ownerId };
        }
        catch (error) {
            if ((error === null || error === void 0 ? void 0 : error.code) === 11000) {
                return null;
            }
            throw error;
        }
    });
}
function renewJobLease(jobName_1, token_1) {
    return __awaiter(this, arguments, void 0, function* (jobName, token, leaseMs = DEFAULT_LEASE_MS) {
        const leaseExpiresAt = new Date(Date.now() + leaseMs);
        const result = yield SystemSetting_1.default.updateOne({ key: leaseKey(jobName), lastError: token }, {
            $set: {
                completedAt: leaseExpiresAt,
                'value.leaseExpiresAt': leaseExpiresAt,
                'value.renewedAt': new Date()
            }
        });
        return Number((result === null || result === void 0 ? void 0 : result.matchedCount) || 0) > 0;
    });
}
function releaseJobLease(jobName, token) {
    return __awaiter(this, void 0, void 0, function* () {
        yield SystemSetting_1.default.updateOne({ key: leaseKey(jobName), lastError: token }, {
            $set: {
                lastError: '',
                completedAt: new Date(0),
                'value.ownerToken': '',
                'value.ownerId': '',
                'value.leaseExpiresAt': new Date(0)
            }
        });
    });
}
function runWithJobLease(jobName_1, fn_1) {
    return __awaiter(this, arguments, void 0, function* (jobName, fn, leaseMs = DEFAULT_LEASE_MS) {
        const acquired = yield acquireJobLease(jobName, leaseMs);
        if (!acquired) {
            logger_1.logger.info(`Scheduled job skipped; lease held by another worker`, { jobName });
            return { skipped: true };
        }
        const renewEveryMs = getLeaseRenewIntervalMs(leaseMs);
        const timer = setInterval(() => {
            void renewJobLease(jobName, acquired.token, leaseMs).then((ok) => {
                if (!ok) {
                    logger_1.logger.warn(`Scheduled job lease renewal failed`, { jobName, ownerId: acquired.ownerId });
                }
            }).catch((error) => {
                logger_1.logger.warn(`Scheduled job lease renewal error`, { jobName, error });
            });
        }, renewEveryMs);
        try {
            const result = yield fn();
            return { skipped: false, result };
        }
        finally {
            clearInterval(timer);
            try {
                yield releaseJobLease(jobName, acquired.token);
            }
            catch (error) {
                logger_1.logger.warn(`Scheduled job lease release failed`, { jobName, error });
            }
        }
    });
}
