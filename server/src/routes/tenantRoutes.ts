import express from 'express';
import { auth } from '../middleware/auth';
import {
  getTenants,
  getTenant,
  createTenant,
  updateTenant,
  deleteTenant,
  getTenantsPublic
} from '../controllers/tenantController';
import { validateRequest, createTenantSchema, updateTenantSchema } from '../middleware/validation';
import { Tenant } from '../models/Tenant';

const router = express.Router();

// Public endpoint for admin dashboard
router.get('/public', getTenantsPublic);

// MVP: Comprehensive public endpoints for all tenant operations
router.get('/public/all', async (req, res) => {
  try {
    const tenants = await Tenant.find({})
      .select('firstName lastName email phone rentAmount leaseStartDate leaseEndDate status')
      .limit(50);
    res.json(tenants);
  } catch (error) {
    console.error('Error fetching all public tenants:', error);
    res.status(500).json({ message: 'Error fetching tenants' });
  }
});

router.get('/public/:id', async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.params.id)
      .select('firstName lastName email phone rentAmount leaseStartDate leaseEndDate status propertyId');
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    res.json(tenant);
  } catch (error) {
    console.error('Error fetching public tenant:', error);
    res.status(500).json({ message: 'Error fetching tenant' });
  }
});

// Protected routes
router.use(auth);

// Routes
router.get('/', getTenants);
router.get('/:id', getTenant);
router.post('/', validateRequest(createTenantSchema), createTenant);
router.put('/:id', validateRequest(updateTenantSchema), updateTenant);
router.delete('/:id', deleteTenant);

export default router; 