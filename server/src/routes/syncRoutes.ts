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
  retrySyncFailure,
  reconcilePaymentPosting,
  archiveOrphanedPropertyAccounts,
  cleanupOrphanedOwnerReferences,
  cleanupOwnerReferenceById
} from '../controllers/syncController';
import { auth, authorize } from '../middleware/auth';

const router = express.Router();

// Mutating synchronization routes are admin-only to avoid accidental production-wide jobs.
router.post('/real-time/start', auth, authorize(['admin']), startRealTimeSync);

router.post('/real-time/stop', auth, authorize(['admin']), stopRealTimeSync);

router.post('/full', auth, authorize(['admin']), performFullSync);

// Read-only sync information (Admin and Accountant)
router.get('/status', auth, authorize(['admin','accountant']), getSyncStatus);

router.get('/stats', auth, authorize(['admin','accountant']), getSyncStats);

router.get('/health', auth, authorize(['admin','accountant']), getSyncHealth);

// Data consistency validation (Admin and Accountant)
router.get('/consistency', auth, authorize(['admin','accountant']), validateDataConsistency);

// Schedule management routes
router.get('/schedules', auth, authorize(['admin','accountant']), getSyncSchedules);

router.post('/schedules', auth, authorize(['admin']), addSyncSchedule);

router.put('/schedules/:name', auth, authorize(['admin']), updateSyncSchedule);

router.delete('/schedules/:name', auth, authorize(['admin']), removeSyncSchedule);

// Schedule control routes
router.post('/schedules/:name/enable', auth, authorize(['admin']), enableSyncSchedule);

router.post('/schedules/:name/disable', auth, authorize(['admin']), disableSyncSchedule);

router.post('/schedules/start-all', auth, authorize(['admin']), startAllSchedules);

router.post('/schedules/stop-all', auth, authorize(['admin']), stopAllSchedules);

// Failure listing and retry (Admin and Accountant)
router.get('/failures', auth, authorize(['admin','accountant']), listSyncFailures);

router.post('/failures/retry', auth, authorize(['admin']), retrySyncFailure);

// Reconciliation endpoints
router.post('/reconcile/payment/:paymentId', auth, authorize(['admin']), reconcilePaymentPosting);

// Maintenance: archive orphaned property accounts immediately
router.post('/fix/orphaned-accounts', auth, authorize(['admin']), archiveOrphanedPropertyAccounts);

// Maintenance: cleanup orphaned owner references on property accounts
router.post('/fix/orphaned-owner-references', auth, authorize(['admin']), cleanupOrphanedOwnerReferences);
router.post('/fix/orphaned-owner-references/:ownerId', auth, authorize(['admin']), cleanupOwnerReferenceById);

export default router;


