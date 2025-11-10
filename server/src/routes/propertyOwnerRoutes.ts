import express from 'express';
import { authWithCompany } from '../middleware/auth';
import {
  createPropertyOwner,
  getPropertyOwners,
  getPropertyOwnerById,
  updatePropertyOwner,
  deletePropertyOwner,
  getPropertyOwnersPublic,
  getPropertyOwnerByIdPublic,
  createPropertyOwnerPublic,
  updatePropertyOwnerPublic,
  deletePropertyOwnerPublic
} from '../controllers/propertyOwnerController';

const router = express.Router();

// Public endpoints (must come before protected routes)
router.get('/public', getPropertyOwnersPublic);
router.get('/public/:id', getPropertyOwnerByIdPublic);
// New endpoint: Get property owner by propertyId
router.get('/by-property/:propertyId', async (req, res) => {
  try {
    const propertyId = req.params.propertyId;
    if (!propertyId) {
      return res.status(400).json({ message: 'PropertyId is required' });
    }
    const mongoose = require('mongoose');
    let objectId;
    try {
      objectId = new mongoose.Types.ObjectId(propertyId);
    } catch {
      return res.status(400).json({ message: 'Invalid propertyId format' });
    }

    // Optional company scoping (preferred): from auth or query
    const companyIdParam = (req.user && req.user.companyId) || (req.query.companyId as string) || null;
    const companyFilter: any = companyIdParam
      ? { companyId: new mongoose.Types.ObjectId(companyIdParam) }
      : {};
    // Find owner whose properties array contains this propertyId as ObjectId or string or $oid
    const PropertyOwner = require('../models/PropertyOwner').PropertyOwner;
    // Strategy: fetch owners in company scope and filter in Node to avoid Mongoose cast issues
    const owners = await PropertyOwner.find(companyFilter);
    const isMatch = (val: any): boolean => {
      if (!val) return false;
      // Direct ObjectId match
      if (val instanceof mongoose.Types.ObjectId) {
        return val.equals(objectId);
      }
      // String match
      if (typeof val === 'string') {
        return val === propertyId || val === String(objectId);
      }
      // Object that may contain $oid or _id
      if (typeof val === 'object') {
        const oid = (val && (val.$oid || val._id || val.id)) as any;
        if (oid instanceof mongoose.Types.ObjectId) return oid.equals(objectId);
        if (typeof oid === 'string') return oid === propertyId || oid === String(objectId);
      }
      return false;
    };
    let owner = owners.find((o: any) => Array.isArray(o?.properties) && o.properties.some(isMatch)) || null;
    if (!owner) {
      // Fallback: get property and use its ownerId
      const Property = require('../models/Property').Property;
      const User = require('../models/User').User;
      const property = await Property.findById(objectId);
      const rawOwnerId = property?.ownerId;
      if (rawOwnerId) {
        // Try to find a PropertyOwner by this id
        owner = await PropertyOwner.findOne({ _id: rawOwnerId, ...(companyFilter.companyId ? { companyId: companyFilter.companyId } : {}) });
        if (owner) {
          return res.json({
            _id: owner._id,
            email: owner.email,
            firstName: owner.firstName,
            lastName: owner.lastName,
            companyId: owner.companyId
          });
        }
        // Try User collection fallback (owner stored as user)
        const user = await User.findOne({ _id: rawOwnerId, ...(companyFilter.companyId ? { companyId: companyFilter.companyId } : {}) }).select('firstName lastName email companyId role');
        if (user) {
          return res.json({
            _id: user._id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            companyId: user.companyId
          });
        }
      }
      return res.status(404).json({ message: 'Owner not found for this property' });
    }
    res.json({
      _id: owner._id,
      email: owner.email,
      firstName: owner.firstName,
      lastName: owner.lastName,
      companyId: owner.companyId
    });
  } catch (error) {
    console.error('Error fetching owner by propertyId:', error);
    res.status(500).json({ message: 'Error fetching owner by propertyId' });
  }
});
router.post('/public', createPropertyOwnerPublic);
router.patch('/public/:id', updatePropertyOwnerPublic);
router.delete('/public/:id', deletePropertyOwnerPublic);

// CRUD routes for property owners (company-scoped)
router.post('/', authWithCompany, createPropertyOwner);
router.get('/', authWithCompany, getPropertyOwners);
router.get('/:id', authWithCompany, getPropertyOwnerById);
router.patch('/:id', authWithCompany, updatePropertyOwner);
// Accept PUT for clients that use PUT semantics for updates
router.put('/:id', authWithCompany, updatePropertyOwner);
router.delete('/:id', authWithCompany, deletePropertyOwner);

export default router; 