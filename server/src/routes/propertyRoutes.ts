import express from 'express';
import {
  getProperties,
  getProperty,
  createProperty,
  createSalesProperty,
  updateProperty,
  deleteProperty,
  restoreProperty,
  getVacantProperties,
  getAdminDashboardProperties,
  getPublicProperties
} from '../controllers/propertyController';
import { authWithCompany, requireActiveSubscription } from '../middleware/auth';
import { propertyIdsForCaller } from '../utils/propertyAccess';
import { isAdmin, isAgent, canCreateProperty } from '../middleware/roles';
import { enforcePropertyLimit } from '../middleware/limits';
import { logger } from '../utils/logger';
import { Property, IProperty } from '../models/Property';

const router = express.Router();

// Debug middleware
router.use((req, res, next) => {
  logger.debug('Property route accessed:', {
    method: req.method,
    path: req.path,
    userId: req.user?.userId,
    role: req.user?.role
  });
  next();
});

// Debug route to list all properties (disabled in production)
router.get('/debug/all', authWithCompany, async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ message: 'Not found' });
  }
  try {
    const ids = await propertyIdsForCaller(req);
    const query: any = { companyId: req.user?.companyId };
    if (ids !== 'company') query._id = { $in: ids };
    const properties = await Property.find(query).populate('ownerId', 'firstName lastName email');
    console.log('All properties in database:', {
      count: properties.length,
      properties: properties.map((p: IProperty) => ({
        id: p._id,
        name: p.name,
        address: p.address,
        type: p.type,
        ownerId: p.ownerId,
        companyId: p.companyId
      }))
    });
    res.json(properties);
  } catch (error) {
    console.error('Error fetching all properties:', error);
    res.status(500).json({ message: 'Error fetching properties' });
  }
});

// Public routes (no auth required)
router.get('/public', async (req, res) => {
  try {
    const properties = await Property.find({ status: 'available' })
      .select('name address type propertyCategory propertySubtype propertyOperationalStatus propertyUse status')
      .limit(10);
    res.json(properties);
  } catch (error) {
    console.error('Error fetching public properties:', error);
    res.status(500).json({ message: 'Error fetching properties' });
  }
});

// Legacy public creation endpoint now requires authenticated company context.
router.post('/public', authWithCompany, canCreateProperty, enforcePropertyLimit, createProperty);

// Legacy public-filtered endpoint now requires authenticated company context.
router.get('/public-filtered', authWithCompany, getPublicProperties);

// MVP: Comprehensive public endpoints for all property operations (disabled in production)
router.get('/public/all', authWithCompany, async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ message: 'Not found' });
  }
  try {
    const ids = await propertyIdsForCaller(req);
    const scoped: any = { companyId: req.user?.companyId };
    if (ids !== 'company') scoped._id = { $in: ids };
    const properties = await Property.find(scoped)
      .select('name address type propertyCategory propertySubtype propertyOperationalStatus propertyUse status rentAmount bedrooms bathrooms amenities propertySpecifications')
      .limit(50);
    res.json(properties);
  } catch (error) {
    console.error('Error fetching all public properties:', error);
    res.status(500).json({ message: 'Error fetching properties' });
  }
});

router.get('/public/:id', authWithCompany, async (req, res) => {
  try {
    const ids = await propertyIdsForCaller(req);
    const query: any = { _id: req.params.id, companyId: req.user?.companyId };
    if (ids !== 'company') query._id = { $in: ids.filter((id) => String(id) === String(req.params.id)) };
    const property = await Property.findOne(query)
      .select('name address type propertyCategory propertySubtype propertyOperationalStatus propertyUse status rentAmount bedrooms bathrooms amenities description propertySpecifications');
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }
    res.json(property);
  } catch (error) {
    console.error('Error fetching public property:', error);
    res.status(500).json({ message: 'Error fetching property' });
  }
});

// Admin dashboard route (disabled in production)
router.get('/admin-dashboard', authWithCompany, (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ message: 'Not found' });
  }
  return getAdminDashboardProperties(req, res);
});

// Protected routes (auth required)
router.get('/', authWithCompany, requireActiveSubscription(), getProperties);
router.get('/vacant', authWithCompany, requireActiveSubscription(), getVacantProperties);
router.get('/:id', authWithCompany, requireActiveSubscription(), getProperty);
router.post('/', authWithCompany, requireActiveSubscription(), canCreateProperty, enforcePropertyLimit, createProperty);
// Sales route for creating property with sales fields
router.post('/sales', authWithCompany, requireActiveSubscription(), createSalesProperty);
// Allow sales/agents to update their own sales properties (controller enforces ownership)
router.put('/sales/:id', authWithCompany, requireActiveSubscription(), updateProperty);
router.put('/:id', authWithCompany, requireActiveSubscription(), isAdmin, updateProperty);
router.delete('/:id', authWithCompany, requireActiveSubscription(), isAdmin, deleteProperty);
router.put('/:id/restore', authWithCompany, requireActiveSubscription(), isAdmin, restoreProperty);

export default router; 