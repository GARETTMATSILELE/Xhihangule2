import express from 'express';
import { propertyOwnerAuth } from '../middleware/auth';
import { getOwnerProperties, getOwnerPropertyById, getOwnerMaintenanceRequests, getOwnerMaintenanceRequestById, updateOwnerMaintenanceRequest, addOwnerMaintenanceMessage, getOwnerNetIncome, approveOwnerMaintenanceRequest } from '../controllers/ownerController';

const router = express.Router();

console.log('OwnerRoutes: Registering owner routes...');

// Only protect property routes, not maintenance-requests
router.use('/properties', propertyOwnerAuth);
router.use('/properties/:id', propertyOwnerAuth);

// Property routes for owners
router.get('/properties', (req, res, next) => {
  console.log('OwnerRoutes: GET /properties route hit');
  next();
}, getOwnerProperties);

router.get('/properties/:id', (req, res, next) => {
  console.log('OwnerRoutes: GET /properties/:id route hit');
  next();
}, getOwnerPropertyById);

// Net income route for owners (public)
router.get('/net-income', (req, res, next) => {
  console.log('OwnerRoutes: GET /net-income route hit');
  next();
}, getOwnerNetIncome);

// Maintenance request routes for owners (public)
router.get('/maintenance-requests', (req, res, next) => {
  console.log('OwnerRoutes: GET /maintenance-requests route hit');
  next();
}, getOwnerMaintenanceRequests);

router.get('/maintenance-requests/:id', (req, res, next) => {
  console.log('OwnerRoutes: GET /maintenance-requests/:id route hit');
  next();
}, getOwnerMaintenanceRequestById);

router.patch('/maintenance-requests/:id', (req, res, next) => {
  console.log('OwnerRoutes: PATCH /maintenance-requests/:id route hit');
  next();
}, updateOwnerMaintenanceRequest);

router.patch('/maintenance-requests/:id/approve', (req, res, next) => {
  console.log('OwnerRoutes: PATCH /maintenance-requests/:id/approve route hit');
  next();
}, approveOwnerMaintenanceRequest);

router.post('/maintenance-requests/:id/messages', (req, res, next) => {
  console.log('OwnerRoutes: POST /maintenance-requests/:id/messages route hit');
  next();
}, addOwnerMaintenanceMessage);

console.log('OwnerRoutes: All owner routes registered');

export default router; 