"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const database_1 = require("../config/database");
const router = express_1.default.Router();
// Debug middleware to log health check requests
router.use((req, res, next) => {
    console.log('Health check request received:', {
        method: req.method,
        path: req.path,
        headers: req.headers,
        cookies: req.cookies,
        body: req.body
    });
    next();
});
// Liveness probe: process is up
router.get('/live', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// Readiness probe: main DB connected and healthy. Accounting DB is ignored here to avoid false restarts
router.get('/ready', (req, res) => {
    try {
        const dbHealth = (0, database_1.getDatabaseHealth)();
        const uptime = process.uptime();
        if (!dbHealth.isConnected || !dbHealth.isHealthy) {
            return res.status(503).json({ status: 'error', reason: 'db_not_ready', database: dbHealth, uptime });
        }
        res.json({ status: 'ok', timestamp: new Date().toISOString(), database: dbHealth, uptime });
    }
    catch (error) {
        console.error('Readiness check error:', error);
        res.status(500).json({ status: 'error', message: 'Readiness check failed' });
    }
});
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
exports.default = router;
