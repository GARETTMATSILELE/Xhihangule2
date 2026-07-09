"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const maintenanceRequestController_1 = require("../controllers/maintenanceRequestController");
const maintenanceManagementController_1 = require("../controllers/maintenanceManagementController");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// Test route to see if router is working
router.get('/test', (req, res) => {
    res.json({ message: 'Maintenance router is working' });
});
// Legacy public route now requires authentication; maintenance records contain
// owner/tenant/property details and must be scoped by the authenticated user.
router.get('/public', auth_1.auth, maintenanceRequestController_1.getMaintenanceRequests);
// Simple events route
router.get('/public/events', (req, res) => {
    res.json([]);
});
// Apply authentication middleware to all other maintenance routes
router.use(auth_1.auth);
// --- Enterprise maintenance management routes (must be before /:id) ---
router.get('/dashboard', maintenanceManagementController_1.getDashboard);
router.get('/contractors/performance', maintenanceManagementController_1.getContractorDashboard);
router.get('/contractors', maintenanceManagementController_1.listContractors);
router.post('/contractors', maintenanceManagementController_1.createContractor);
router.put('/contractors/:id', maintenanceManagementController_1.updateContractor);
router.get('/property-history/:propertyId', maintenanceManagementController_1.getPropertyHistory);
router.post('/work-order', maintenanceManagementController_1.postWorkOrder);
router.post('/assign-contractor', maintenanceManagementController_1.postAssignContractor);
router.post('/upload-photo', maintenanceManagementController_1.postUploadPhoto);
router.post('/quotation', maintenanceManagementController_1.postQuotation);
router.post('/verification', maintenanceManagementController_1.postVerification);
router.get('/owner-summary', maintenanceManagementController_1.getOwnerSummary);
// Get all maintenance requests (with optional filtering)
router.get('/', maintenanceRequestController_1.getMaintenanceRequests);
// Get maintenance events (placeholder - can be implemented later)
router.get('/events', (req, res) => {
    res.json([]);
});
// Get maintenance requests for a specific property
router.get('/property/:propertyId', maintenanceRequestController_1.getPropertyMaintenanceRequests);
// Per-request enterprise endpoints
router.get('/timeline/:id', maintenanceManagementController_1.getTimeline);
router.get('/:id/detail-bundle', maintenanceManagementController_1.getRequestDetailBundle);
router.get('/:id/photos', maintenanceManagementController_1.getRequestPhotos);
router.get('/:id/quotes', maintenanceManagementController_1.getRequestQuotes);
router.get('/:id/work-order', maintenanceManagementController_1.getRequestWorkOrder);
router.post('/:id/work-order', maintenanceManagementController_1.postWorkOrder);
router.post('/:id/assign-contractor', maintenanceManagementController_1.postAssignContractor);
router.post('/:id/upload-photo', maintenanceManagementController_1.postUploadPhoto);
router.post('/:id/quotation', maintenanceManagementController_1.postQuotation);
router.post('/:id/verification', maintenanceManagementController_1.postVerification);
router.post('/:id/schedule-follow-up-inspection', maintenanceManagementController_1.scheduleFollowUp);
router.put('/:id/work-order/:workOrderId/status', maintenanceManagementController_1.updateWorkOrderStatus);
router.put('/:id/close', maintenanceManagementController_1.closeMaintenanceRequest);
router.get('/:id/documents/:docType', maintenanceManagementController_1.downloadDocument);
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
// Approve maintenance request (owner action)
router.put('/:id/approve', maintenanceRequestController_1.approveMaintenanceRequest);
// Complete maintenance request (agent action)
router.put('/:id/complete', maintenanceRequestController_1.completeMaintenanceRequest);
// Reject maintenance request
router.put('/:id/reject', maintenanceRequestController_1.updateMaintenanceRequest);
exports.default = router;
