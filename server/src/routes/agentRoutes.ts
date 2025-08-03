import express from 'express';
import { auth } from '../middleware/auth';
import { isAgent } from '../middleware/roles';
import {
  getAgentProperties,
  getAgentTenants,
  getAgentLeases,
  getAgentFiles,
  getAgentCommission,
  createAgentProperty,
  createAgentTenant,
  createAgentLease,
  createAgentPayment,
  updateAgentPayment,
  createAgentFile,
  getAgentPropertyOwners,
  createAgentPropertyOwner,
  updateAgentPropertyOwner,
  deleteAgentPropertyOwner
} from '../controllers/agentController';

const router = express.Router();

// Debug middleware
router.use((req, res, next) => {
  console.log('Agent routes middleware - Request path:', req.path);
  next();
});

// Apply auth middleware to all routes
router.use(auth);
router.use(isAgent);

// Agent dashboard routes
router.get('/properties', (req, res) => {
  console.log('Agent properties route hit');
  getAgentProperties(req, res);
});
router.post('/properties', createAgentProperty);
router.get('/tenants', getAgentTenants);
router.post('/tenants', createAgentTenant);
router.get('/leases', getAgentLeases);
router.post('/leases', createAgentLease);
router.get('/files', getAgentFiles);
router.post('/files', createAgentFile);
router.post('/payments', createAgentPayment);
router.put('/payments/:id', updateAgentPayment);
router.get('/commission', getAgentCommission);

// Property owner routes
router.get('/property-owners', getAgentPropertyOwners);
router.post('/property-owners', createAgentPropertyOwner);
router.put('/property-owners/:id', updateAgentPropertyOwner);
router.delete('/property-owners/:id', deleteAgentPropertyOwner);

export default router; 