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
        // If either database is not connected, return 503 Service Unavailable
        if (!dbHealth.isConnected || !accountingDbHealth.isConnected) {
            return res.status(503).json({
                status: 'error',
                message: 'One or more databases not connected',
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
