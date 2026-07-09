import express from 'express';
import { 
  createMaintenanceRequest, 
  getPropertyMaintenanceRequests, 
  addMaintenanceMessage, 
  updateMaintenanceRequest, 
  getMaintenanceRequestDetails, 
  deleteMaintenanceRequest, 
  getMaintenanceRequests,
  approveMaintenanceRequest,
  completeMaintenanceRequest
} from '../controllers/maintenanceRequestController';
import {
  getDashboard,
  getTimeline,
  postWorkOrder,
  postAssignContractor,
  postUploadPhoto,
  postQuotation,
  postVerification,
  getPropertyHistory,
  listContractors,
  createContractor,
  updateContractor,
  getContractorDashboard,
  getRequestPhotos,
  getRequestQuotes,
  getRequestWorkOrder,
  updateWorkOrderStatus,
  closeMaintenanceRequest,
  downloadDocument,
  getRequestDetailBundle,
  scheduleFollowUp,
  getOwnerSummary,
} from '../controllers/maintenanceManagementController';
import { auth } from '../middleware/auth';

const router = express.Router();

// Test route to see if router is working
router.get('/test', (req, res) => {
  res.json({ message: 'Maintenance router is working' });
});

// Legacy public route now requires authentication; maintenance records contain
// owner/tenant/property details and must be scoped by the authenticated user.
router.get('/public', auth, getMaintenanceRequests);

// Simple events route
router.get('/public/events', (req, res) => {
  res.json([]);
});

// Apply authentication middleware to all other maintenance routes
router.use(auth);

// --- Enterprise maintenance management routes (must be before /:id) ---
router.get('/dashboard', getDashboard);
router.get('/contractors/performance', getContractorDashboard);
router.get('/contractors', listContractors);
router.post('/contractors', createContractor);
router.put('/contractors/:id', updateContractor);
router.get('/property-history/:propertyId', getPropertyHistory);
router.post('/work-order', postWorkOrder);
router.post('/assign-contractor', postAssignContractor);
router.post('/upload-photo', postUploadPhoto);
router.post('/quotation', postQuotation);
router.post('/verification', postVerification);
router.get('/owner-summary', getOwnerSummary);

// Get all maintenance requests (with optional filtering)
router.get('/', getMaintenanceRequests);

// Get maintenance events (placeholder - can be implemented later)
router.get('/events', (req, res) => {
  res.json([]);
});

// Get maintenance requests for a specific property
router.get('/property/:propertyId', getPropertyMaintenanceRequests);

// Per-request enterprise endpoints
router.get('/timeline/:id', getTimeline);
router.get('/:id/detail-bundle', getRequestDetailBundle);
router.get('/:id/photos', getRequestPhotos);
router.get('/:id/quotes', getRequestQuotes);
router.get('/:id/work-order', getRequestWorkOrder);
router.post('/:id/work-order', postWorkOrder);
router.post('/:id/assign-contractor', postAssignContractor);
router.post('/:id/upload-photo', postUploadPhoto);
router.post('/:id/quotation', postQuotation);
router.post('/:id/verification', postVerification);
router.post('/:id/schedule-follow-up-inspection', scheduleFollowUp);
router.put('/:id/work-order/:workOrderId/status', updateWorkOrderStatus);
router.put('/:id/close', closeMaintenanceRequest);
router.get('/:id/documents/:docType', downloadDocument);

// Get maintenance request details
router.get('/:id', getMaintenanceRequestDetails);

// Create a new maintenance request
router.post('/', createMaintenanceRequest);

// Update maintenance request
router.put('/:id', updateMaintenanceRequest);

// Delete maintenance request
router.delete('/:id', deleteMaintenanceRequest);

// Add message to maintenance request
router.post('/:id/messages', addMaintenanceMessage);

// Update maintenance request status
router.put('/:id/status', updateMaintenanceRequest);

// Assign maintenance request to vendor
router.put('/:id/assign', updateMaintenanceRequest);

// Request owner approval
router.post('/:id/request-approval', updateMaintenanceRequest);

// Approve maintenance request (owner action)
router.put('/:id/approve', approveMaintenanceRequest);

// Complete maintenance request (agent action)
router.put('/:id/complete', completeMaintenanceRequest);

// Reject maintenance request
router.put('/:id/reject', updateMaintenanceRequest);

export default router; 