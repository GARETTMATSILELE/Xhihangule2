"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const maintenanceRequestController_1 = require("../controllers/maintenanceRequestController");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// Test route to see if router is working
router.get('/test', (req, res) => {
    res.json({ message: 'Maintenance router is working' });
});
// Simple public route
router.get('/public', maintenanceRequestController_1.getMaintenanceRequestsPublic);
// Simple events route
router.get('/public/events', (req, res) => {
    res.json([]);
});
// Apply authentication middleware to all other maintenance routes
router.use(auth_1.auth);
// Get all maintenance requests (with optional filtering)
router.get('/', maintenanceRequestController_1.getMaintenanceRequests);
// Get maintenance events (placeholder - can be implemented later)
router.get('/events', (req, res) => {
    res.json([]);
});
// Get maintenance requests for a specific property
router.get('/property/:propertyId', maintenanceRequestController_1.getPropertyMaintenanceRequests);
// Get maintenance request details
router.get('/:id', maintenanceRequestController_1.getMaintenanceRequestDetails);
// Create a new maintenance request
router.post('/', maintenanceRequestController_1.createMaintenanceRequest);
// Update maintenance request
router.put('/:id', maintenanceRequestController_1.updateMaintenanceRequest);
// Delete maintenance request
router.delete('/:id', maintenanceRequestController_1.deleteMaintenanceRequest);
// Add message to maintenance request
router.post('/:id/messages', maintenanceRequestController_1.addMaintenanceMessage);
// Update maintenance request status
router.put('/:id/status', maintenanceRequestController_1.updateMaintenanceRequest);
// Assign maintenance request to vendor
router.put('/:id/assign', maintenanceRequestController_1.updateMaintenanceRequest);
// Request owner approval
router.post('/:id/request-approval', maintenanceRequestController_1.updateMaintenanceRequest);
// Approve maintenance request
router.put('/:id/approve', maintenanceRequestController_1.updateMaintenanceRequest);
// Reject maintenance request
router.put('/:id/reject', maintenanceRequestController_1.updateMaintenanceRequest);
exports.default = router;
