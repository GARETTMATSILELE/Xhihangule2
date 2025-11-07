import express from 'express';
import {
  startRealTimeSync,
  stopRealTimeSync,
  performFullSync,
  getSyncStatus,
  getSyncStats,
  validateDataConsistency,
  getSyncSchedules,
  updateSyncSchedule,
  enableSyncSchedule,
  disableSyncSchedule,
  startAllSchedules,
  stopAllSchedules,
  addSyncSchedule,
  removeSyncSchedule,
  getSyncHealth,
  listSyncFailures,
  retrySyncFailure
} from '../controllers/syncController';
import { isAdmin, isAccountant } from '../middleware/roles';
import { auth } from '../middleware/auth';

const router = express.Router();

// Real-time synchronization routes (Admin and Accountant)
router.post('/real-time/start', auth, (req, res, next) => {
  if (req.user?.role === 'admin' || req.user?.role === 'accountant') {
    next();
  } else {
    res.status(403).json({ message: 'Access denied' });
  }
}, startRealTimeSync);

router.post('/real-time/stop', auth, (req, res, next) => {
  if (req.user?.role === 'admin' || req.user?.role === 'accountant') {
    next();
  } else {
    res.status(403).json({ message: 'Access denied' });
  }
}, stopRealTimeSync);

// Manual synchronization routes (Admin and Accountant)
router.post('/full', auth, (req, res, next) => {
  if (req.user?.role === 'admin' || req.user?.role === 'accountant') {
    next();
  } else {
    res.status(403).json({ message: 'Access denied' });
  }
}, performFullSync);

// Read-only sync information (Admin and Accountant)
router.get('/status', auth, (req, res, next) => {
  if (req.user?.role === 'admin' || req.user?.role === 'accountant') {
    next();
  } else {
    res.status(403).json({ message: 'Access denied' });
  }
}, getSyncStatus);

router.get('/stats', auth, (req, res, next) => {
  if (req.user?.role === 'admin' || req.user?.role === 'accountant') {
    next();
  } else {
    res.status(403).json({ message: 'Access denied' });
  }
}, getSyncStats);

router.get('/health', auth, (req, res, next) => {
  if (req.user?.role === 'admin' || req.user?.role === 'accountant') {
    next();
  } else {
    res.status(403).json({ message: 'Access denied' });
  }
}, getSyncHealth);

// Data consistency validation (Admin and Accountant)
router.get('/consistency', auth, (req, res, next) => {
  if (req.user?.role === 'admin' || req.user?.role === 'accountant') {
    next();
  } else {
    res.status(403).json({ message: 'Access denied' });
  }
}, validateDataConsistency);

// Schedule management routes (Admin and Accountant)
router.get('/schedules', auth, (req, res, next) => {
  if (req.user?.role === 'admin' || req.user?.role === 'accountant') {
    next();
  } else {
    res.status(403).json({ message: 'Access denied' });
  }
}, getSyncSchedules);

router.post('/schedules', auth, (req, res, next) => {
  if (req.user?.role === 'admin' || req.user?.role === 'accountant') {
    next();
  } else {
    res.status(403).json({ message: 'Access denied' });
  }
}, addSyncSchedule);

router.put('/schedules/:name', auth, (req, res, next) => {
  if (req.user?.role === 'admin' || req.user?.role === 'accountant') {
    next();
  } else {
    res.status(403).json({ message: 'Access denied' });
  }
}, updateSyncSchedule);

router.delete('/schedules/:name', auth, (req, res, next) => {
  if (req.user?.role === 'admin' || req.user?.role === 'accountant') {
    next();
  } else {
    res.status(403).json({ message: 'Access denied' });
  }
}, removeSyncSchedule);

// Schedule control routes (Admin and Accountant)
router.post('/schedules/:name/enable', auth, (req, res, next) => {
  if (req.user?.role === 'admin' || req.user?.role === 'accountant') {
    next();
  } else {
    res.status(403).json({ message: 'Access denied' });
  }
}, enableSyncSchedule);

router.post('/schedules/:name/disable', auth, (req, res, next) => {
  if (req.user?.role === 'admin' || req.user?.role === 'accountant') {
    next();
  } else {
    res.status(403).json({ message: 'Access denied' });
  }
}, disableSyncSchedule);

router.post('/schedules/start-all', auth, (req, res, next) => {
  if (req.user?.role === 'admin' || req.user?.role === 'accountant') {
    next();
  } else {
    res.status(403).json({ message: 'Access denied' });
  }
}, startAllSchedules);

router.post('/schedules/stop-all', auth, (req, res, next) => {
  if (req.user?.role === 'admin' || req.user?.role === 'accountant') {
    next();
  } else {
    res.status(403).json({ message: 'Access denied' });
  }
}, stopAllSchedules);

// Failure listing and retry (Admin and Accountant)
router.get('/failures', auth, (req, res, next) => {
  if (req.user?.role === 'admin' || req.user?.role === 'accountant') {
    next();
  } else {
    res.status(403).json({ message: 'Access denied' });
  }
}, listSyncFailures);

router.post('/failures/retry', auth, (req, res, next) => {
  if (req.user?.role === 'admin' || req.user?.role === 'accountant') {
    next();
  } else {
    res.status(403).json({ message: 'Access denied' });
  }
}, retrySyncFailure);

export default router;


