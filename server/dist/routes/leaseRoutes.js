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
// Public endpoints (must come before protected routes)
router.get('/public', leaseController.getLeasesPublic.bind(leaseController));
router.get('/public/:id', leaseController.getLeaseByIdPublic.bind(leaseController));
// Protected routes - require authentication
router.use(auth_1.auth);
router.get('/', leaseController.getLeases.bind(leaseController));
router.get('/:id', leaseController.getLeaseById.bind(leaseController));
router.post('/', leaseController.createLease.bind(leaseController));
router.put('/:id', leaseController.updateLease.bind(leaseController));
router.delete('/:id', leaseController.deleteLease.bind(leaseController));
router.get('/stats/overview', leaseController.getLeaseStats.bind(leaseController));
router.get('/active/list', leaseController.getActiveLeases.bind(leaseController));
router.get('/expiring/list', leaseController.getExpiringLeases.bind(leaseController));
exports.default = router;
