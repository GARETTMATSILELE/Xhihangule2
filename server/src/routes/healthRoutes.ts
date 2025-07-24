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