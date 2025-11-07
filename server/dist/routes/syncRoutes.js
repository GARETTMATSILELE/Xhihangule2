"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const syncController_1 = require("../controllers/syncController");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// Real-time synchronization routes (Admin and Accountant)
router.post('/real-time/start', auth_1.auth, (0, auth_1.authorize)(['admin', 'accountant']), syncController_1.startRealTimeSync);
router.post('/real-time/stop', auth_1.auth, (0, auth_1.authorize)(['admin', 'accountant']), syncController_1.stopRealTimeSync);
// Manual synchronization routes (Admin and Accountant)
router.post('/full', auth_1.auth, (0, auth_1.authorize)(['admin', 'accountant']), syncController_1.performFullSync);
// Read-only sync information (Admin and Accountant)
router.get('/status', auth_1.auth, (0, auth_1.authorize)(['admin', 'accountant']), syncController_1.getSyncStatus);
router.get('/stats', auth_1.auth, (0, auth_1.authorize)(['admin', 'accountant']), syncController_1.getSyncStats);
router.get('/health', auth_1.auth, (0, auth_1.authorize)(['admin', 'accountant']), syncController_1.getSyncHealth);
// Data consistency validation (Admin and Accountant)
router.get('/consistency', auth_1.auth, (0, auth_1.authorize)(['admin', 'accountant']), syncController_1.validateDataConsistency);
// Schedule management routes (Admin and Accountant)
router.get('/schedules', auth_1.auth, (0, auth_1.authorize)(['admin', 'accountant']), syncController_1.getSyncSchedules);
router.post('/schedules', auth_1.auth, (0, auth_1.authorize)(['admin', 'accountant']), syncController_1.addSyncSchedule);
router.put('/schedules/:name', auth_1.auth, (0, auth_1.authorize)(['admin', 'accountant']), syncController_1.updateSyncSchedule);
router.delete('/schedules/:name', auth_1.auth, (0, auth_1.authorize)(['admin', 'accountant']), syncController_1.removeSyncSchedule);
// Schedule control routes (Admin and Accountant)
router.post('/schedules/:name/enable', auth_1.auth, (0, auth_1.authorize)(['admin', 'accountant']), syncController_1.enableSyncSchedule);
router.post('/schedules/:name/disable', auth_1.auth, (0, auth_1.authorize)(['admin', 'accountant']), syncController_1.disableSyncSchedule);
router.post('/schedules/start-all', auth_1.auth, (0, auth_1.authorize)(['admin', 'accountant']), syncController_1.startAllSchedules);
router.post('/schedules/stop-all', auth_1.auth, (0, auth_1.authorize)(['admin', 'accountant']), syncController_1.stopAllSchedules);
// Failure listing and retry (Admin and Accountant)
router.get('/failures', auth_1.auth, (0, auth_1.authorize)(['admin', 'accountant']), syncController_1.listSyncFailures);
router.post('/failures/retry', auth_1.auth, (0, auth_1.authorize)(['admin', 'accountant']), syncController_1.retrySyncFailure);
exports.default = router;
