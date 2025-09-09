import express from 'express';
import { getDatabaseHealth, getAccountingDatabaseHealth } from '../config/database';

const router = express.Router();

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

// Some platforms issue HEAD requests for health checks
router.head('/live', (req, res) => {
  res.status(200).end();
});

// Readiness probe: main DB connected and healthy. Accounting DB is ignored here to avoid false restarts
router.get('/ready', (req, res) => {
  try {
    const dbHealth = getDatabaseHealth();
    const uptime = process.uptime();
    if (!dbHealth.isConnected || !dbHealth.isHealthy) {
      return res.status(503).json({ status: 'error', reason: 'db_not_ready', database: dbHealth, uptime });
    }
    res.json({ status: 'ok', timestamp: new Date().toISOString(), database: dbHealth, uptime });
  } catch (error: any) {
    console.error('Readiness check error:', error);
    res.status(500).json({ status: 'error', message: 'Readiness check failed' });
  }
});

// Comprehensive health (kept for dashboards). Do not cause orchestrator restarts because of accounting DB
router.get('/', (req, res) => {
  try {
    const dbHealth = getDatabaseHealth();
    const accountingDbHealth = getAccountingDatabaseHealth();
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
  } catch (error: any) {
    console.error('Health check error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Health check failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

export default router; 