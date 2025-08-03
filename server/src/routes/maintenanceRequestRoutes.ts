import express from 'express';
import { 
  createMaintenanceRequest, 
  getPropertyMaintenanceRequests, 
  addMaintenanceMessage, 
  updateMaintenanceRequest, 
  getMaintenanceRequestDetails, 
  deleteMaintenanceRequest, 
  getMaintenanceRequests,
  getMaintenanceRequestsPublic,
  approveMaintenanceRequest,
  completeMaintenanceRequest
} from '../controllers/maintenanceRequestController';
import { auth } from '../middleware/auth';

const router = express.Router();

// Test route to see if router is working
router.get('/test', (req, res) => {
  res.json({ message: 'Maintenance router is working' });
});

// Simple public route
router.get('/public', getMaintenanceRequestsPublic);

// Simple events route
router.get('/public/events', (req, res) => {
  res.json([]);
});

// Apply authentication middleware to all other maintenance routes
router.use(auth);

// Get all maintenance requests (with optional filtering)
router.get('/', getMaintenanceRequests);

// Get maintenance events (placeholder - can be implemented later)
router.get('/events', (req, res) => {
  res.json([]);
});

// Get maintenance requests for a specific property
router.get('/property/:propertyId', getPropertyMaintenanceRequests);

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