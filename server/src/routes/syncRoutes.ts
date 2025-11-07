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
import { auth, authorize } from '../middleware/auth';

const router = express.Router();

// Real-time synchronization routes (Admin and Accountant)
router.post('/real-time/start', auth, authorize(['admin','accountant']), startRealTimeSync);

router.post('/real-time/stop', auth, authorize(['admin','accountant']), stopRealTimeSync);

// Manual synchronization routes (Admin and Accountant)
router.post('/full', auth, authorize(['admin','accountant']), performFullSync);

// Read-only sync information (Admin and Accountant)
router.get('/status', auth, authorize(['admin','accountant']), getSyncStatus);

router.get('/stats', auth, authorize(['admin','accountant']), getSyncStats);

router.get('/health', auth, authorize(['admin','accountant']), getSyncHealth);

// Data consistency validation (Admin and Accountant)
router.get('/consistency', auth, authorize(['admin','accountant']), validateDataConsistency);

// Schedule management routes (Admin and Accountant)
router.get('/schedules', auth, authorize(['admin','accountant']), getSyncSchedules);

router.post('/schedules', auth, authorize(['admin','accountant']), addSyncSchedule);

router.put('/schedules/:name', auth, authorize(['admin','accountant']), updateSyncSchedule);

router.delete('/schedules/:name', auth, authorize(['admin','accountant']), removeSyncSchedule);

// Schedule control routes (Admin and Accountant)
router.post('/schedules/:name/enable', auth, authorize(['admin','accountant']), enableSyncSchedule);

router.post('/schedules/:name/disable', auth, authorize(['admin','accountant']), disableSyncSchedule);

router.post('/schedules/start-all', auth, authorize(['admin','accountant']), startAllSchedules);

router.post('/schedules/stop-all', auth, authorize(['admin','accountant']), stopAllSchedules);

// Failure listing and retry (Admin and Accountant)
router.get('/failures', auth, authorize(['admin','accountant']), listSyncFailures);

router.post('/failures/retry', auth, authorize(['admin','accountant']), retrySyncFailure);

export default router;


