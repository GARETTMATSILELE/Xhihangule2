"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const leaseController_1 = require("../controllers/leaseController");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
const leaseController = leaseController_1.LeaseController.getInstance();
// Legacy public endpoints now require authentication because leases contain
// tenant and financial information.
router.get('/public', auth_1.authWithCompany, leaseController.getLeasesPublic.bind(leaseController));
router.get('/public/:id', auth_1.authWithCompany, leaseController.getLeaseByIdPublic.bind(leaseController));
// Protected routes - require authentication
router.use(auth_1.authWithCompany, (0, auth_1.requireActiveSubscription)());
router.get('/', leaseController.getLeases.bind(leaseController));
router.get('/stats/overview', leaseController.getLeaseStats.bind(leaseController));
router.get('/active/list', leaseController.getActiveLeases.bind(leaseController));
router.get('/expiring/list', leaseController.getExpiringLeases.bind(leaseController));
router.post('/:id/renew', leaseController.renewLease.bind(leaseController));
router.post('/:id/terminate', leaseController.terminateLease.bind(leaseController));
router.post('/:id/close-settlement', leaseController.closeSettlement.bind(leaseController));
router.patch('/:id/status', leaseController.updateLeaseStatus.bind(leaseController));
router.post('/:id/extend', leaseController.extendLease.bind(leaseController));
router.get('/:id', leaseController.getLeaseById.bind(leaseController));
router.post('/', leaseController.createLease.bind(leaseController));
router.put('/:id', leaseController.updateLease.bind(leaseController));
router.delete('/:id', leaseController.deleteLease.bind(leaseController));
exports.default = router;
