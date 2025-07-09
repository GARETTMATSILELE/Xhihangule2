import express from 'express';
import { auth } from '../middleware/auth';
import { isAgent } from '../middleware/roles';
import {
  getAgentProperties,
  getAgentTenants,
  getAgentLeases,
  getAgentCommission,
  createAgentProperty
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
router.get('/leases', getAgentLeases);
router.get('/commission', getAgentCommission);

export default router; 