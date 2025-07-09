import express from 'express';
import {
  getProperties,
  getProperty,
  createProperty,
  createPropertyPublic,
  updateProperty,
  deleteProperty,
  getVacantProperties,
  getAdminDashboardProperties,
  getPublicProperties
} from '../controllers/propertyController';
import { auth } from '../middleware/auth';
import { isAdmin, isAgent, canCreateProperty } from '../middleware/roles';
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

// Debug route to list all properties
router.get('/debug/all', async (req, res) => {
  try {
    const properties = await Property.find({}).populate('ownerId', 'firstName lastName email');
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
      .select('name address type status')
      .limit(10);
    res.json(properties);
  } catch (error) {
    console.error('Error fetching public properties:', error);
    res.status(500).json({ message: 'Error fetching properties' });
  }
});

// Public property creation endpoint (no auth required)
router.post('/public', createPropertyPublic);

// New public endpoint with user-based filtering (no auth required)
router.get('/public-filtered', getPublicProperties);

// MVP: Comprehensive public endpoints for all property operations
router.get('/public/all', async (req, res) => {
  try {
    const properties = await Property.find({})
      .select('name address type status rentAmount bedrooms bathrooms amenities')
      .limit(50);
    res.json(properties);
  } catch (error) {
    console.error('Error fetching all public properties:', error);
    res.status(500).json({ message: 'Error fetching properties' });
  }
});

router.get('/public/:id', async (req, res) => {
  try {
    const property = await Property.findById(req.params.id)
      .select('name address type status rentAmount bedrooms bathrooms amenities description');
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }
    res.json(property);
  } catch (error) {
    console.error('Error fetching public property:', error);
    res.status(500).json({ message: 'Error fetching property' });
  }
});

// Admin dashboard route (no auth required)
router.get('/admin-dashboard', getAdminDashboardProperties);

// Protected routes (auth required)
router.get('/', auth, getProperties);
router.get('/vacant', auth, getVacantProperties);
router.get('/:id', auth, getProperty);
router.post('/', auth, canCreateProperty, createProperty);
router.put('/:id', auth, isAdmin, updateProperty);
router.delete('/:id', auth, isAdmin, deleteProperty);

export default router; 