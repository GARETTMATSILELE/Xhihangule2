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
    // Find owner whose properties array contains this propertyId as ObjectId or string or $oid
    const PropertyOwner = require('../models/PropertyOwner').PropertyOwner;
    const owner = await PropertyOwner.findOne({
      $or: [
        { properties: objectId },
        { properties: propertyId },
        { properties: { $elemMatch: { $oid: propertyId } } }
      ]
    });
    if (!owner) {
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
router.delete('/:id', authWithCompany, deletePropertyOwner);

export default router; 