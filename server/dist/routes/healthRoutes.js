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
const express_1 = __importDefault(require("express"));
const mongoose_1 = __importDefault(require("mongoose"));
const database_1 = require("../config/database");
const LedgerEvent_1 = __importDefault(require("../models/LedgerEvent"));
const router = express_1.default.Router();
// Optional verbose health logging (disabled by default in production)
router.use((req, res, next) => {
    if (process.env.HEALTH_LOG_VERBOSE === 'true') {
        console.log('Health check request received:', {
            method: req.method,
            path: req.path,
            headers: req.headers,
            cookies: req.cookies,
            body: req.body
        });
    }
    next();
});
// Liveness probe: process is up
router.get('/live', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// Some platforms issue HEAD requests for health checks
router.head('/live', (req, res) => {
    res.status(200).end();
});
// Readiness probe: main DB connected and healthy. Accounting DB is ignored here to avoid false restarts
router.get('/ready', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const dbHealth = (0, database_1.getDatabaseHealth)();
        const uptime = process.uptime();
        if (dbHealth.isConnected && dbHealth.isHealthy) {
            return res.json({ status: 'ok', timestamp: new Date().toISOString(), database: dbHealth, uptime });
        }
        // Fallback: run a direct ping before declaring not ready.
        // This avoids false 503s when cached health state lags transient recoveries.
        if (mongoose_1.default.connection.readyState === 1) {
            try {
                yield mongoose_1.default.connection.db.admin().ping();
                return res.json({
                    status: 'ok',
                    timestamp: new Date().toISOString(),
                    database: Object.assign(Object.assign({}, dbHealth), { isHealthy: true }),
                    uptime
                });
            }
            catch (_a) {
                // Keep readiness failure response below
            }
        }
        return res.status(503).json({ status: 'error', reason: 'db_not_ready', database: dbHealth, uptime });
    }
    catch (error) {
        console.error('Readiness check error:', error);
        res.status(500).json({ status: 'error', message: 'Readiness check failed' });
    }
}));
// Comprehensive health (kept for dashboards). Do not cause orchestrator restarts because of accounting DB
router.get('/', (req, res) => {
    try {
        const dbHealth = (0, database_1.getDatabaseHealth)();
        const accountingDbHealth = (0, database_1.getAccountingDatabaseHealth)();
        const uptime = process.uptime();
        console.log('Health check response:', {
            status: 'ok',
            database: dbHealth,
            accountingDatabase: accountingDbHealth,
            uptime
        });
        // Only fail if main DB is unhealthy; accounting DB is informational here
        if (!dbHealth.isConnected || !dbHealth.isHealthy) {
            return res.status(503).json({
                status: 'error',
                message: 'Main database not connected or unhealthy',
                database: dbHealth,
                accountingDatabase: accountingDbHealth,
                uptime
            });
        }
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            database: dbHealth,
            accountingDatabase: accountingDbHealth,
            uptime
        });
    }
    catch (error) {
        console.error('Health check error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Health check failed',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});
// Ledger events health: shows backlog and last failure info
router.get('/ledger-events', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const [pending, processing, failed, completed, latestFailed, nextDue] = yield Promise.all([
            LedgerEvent_1.default.countDocuments({ status: 'pending' }),
            LedgerEvent_1.default.countDocuments({ status: 'processing' }),
            LedgerEvent_1.default.countDocuments({ status: 'failed' }),
            LedgerEvent_1.default.countDocuments({ status: 'completed', updatedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
            LedgerEvent_1.default.findOne({ status: 'failed' }).sort({ updatedAt: -1 }).lean(),
            LedgerEvent_1.default.findOne({ status: { $in: ['pending', 'failed'] } }).sort({ nextAttemptAt: 1 }).lean()
        ]);
        const payload = {
            status: 'ok',
            timestamp: new Date().toISOString(),
            counts: { pending, processing, failed, completedLast24h: completed },
            nextAttemptAt: (nextDue === null || nextDue === void 0 ? void 0 : nextDue.nextAttemptAt) || null,
            latestFailure: latestFailed
                ? {
                    id: String(latestFailed._id),
                    paymentId: String(latestFailed.paymentId),
                    attemptCount: latestFailed.attemptCount,
                    lastError: latestFailed.lastError || null,
                    updatedAt: latestFailed.updatedAt
                }
                : null
        };
        res.json(payload);
    }
    catch (error) {
        console.error('Ledger events health error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch ledger events health' });
    }
}));
exports.default = router;
