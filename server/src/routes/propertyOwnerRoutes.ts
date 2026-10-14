import express from 'express';
import { authWithCompany } from '../middleware/auth';
import { callerCanAccessProperty } from '../utils/propertyAccess';
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
import {
  ownersDashboard,
  ownerPortfolio,
  ownerFinancials,
  ownerMaintenance,
  ownerDocumentsList,
  ownerDocumentsUpload,
  ownerBankingUpsert,
  ownerPreferencesUpsert,
  ownerProfileExtras,
  ownerHistoryList,
  ownershipHistoryCreate,
  propertyOwnershipHistory,
  ownerDocumentPdf,
  ownerFullProfile,
  ownerProfilePatch,
} from '../controllers/ownerManagementController';

const router = express.Router();

// Legacy public endpoints now require company authentication because property
// owner records contain PII and account-management capabilities.
router.get('/public', authWithCompany, getPropertyOwnersPublic);
router.get('/public/:id', authWithCompany, getPropertyOwnerByIdPublic);
// New endpoint: Get property owner by propertyId
router.get('/by-property/:propertyId', authWithCompany, async (req, res) => {
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

    if (!req.user?.companyId) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    if (!(await callerCanAccessProperty(req, propertyId))) {
      return res.status(404).json({ message: 'Owner not found for this property' });
    }
    const companyFilter: any = { companyId: new mongoose.Types.ObjectId(req.user.companyId) };
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
      const Property = require('../models/Property').Property;
      const property = await Property.findOne({ _id: objectId, companyId: companyFilter.companyId }).select('propertyOwnerId');
      if (property?.propertyOwnerId) {
        owner = await PropertyOwner.findOne({ _id: property.propertyOwnerId, companyId: companyFilter.companyId });
      }
      if (!owner) {
        return res.status(404).json({ message: 'Owner not found for this property' });
      }
      return res.json({
        _id: owner._id,
        email: owner.email,
        firstName: owner.firstName,
        lastName: owner.lastName,
        companyId: owner.companyId
      });
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
router.post('/public', authWithCompany, createPropertyOwnerPublic);
router.patch('/public/:id', authWithCompany, updatePropertyOwnerPublic);
router.delete('/public/:id', authWithCompany, deletePropertyOwnerPublic);

// ORM management routes (before /:id)
router.get('/dashboard', authWithCompany, ownersDashboard);
router.post('/documents', authWithCompany, ownerDocumentsUpload);
router.post('/banking', authWithCompany, ownerBankingUpsert);
router.post('/preferences', authWithCompany, ownerPreferencesUpsert);
router.post('/ownership-history', authWithCompany, ownershipHistoryCreate);
router.get('/property-history/:propertyId', authWithCompany, propertyOwnershipHistory);

// CRUD routes for property owners (company-scoped)
router.post('/', authWithCompany, createPropertyOwner);
router.get('/', authWithCompany, getPropertyOwners);
router.get('/:ownerId/portfolio', authWithCompany, ownerPortfolio);
router.get('/:ownerId/financials', authWithCompany, ownerFinancials);
router.get('/:ownerId/maintenance', authWithCompany, ownerMaintenance);
router.get('/:ownerId/documents', authWithCompany, ownerDocumentsList);
router.get('/:ownerId/history', authWithCompany, ownerHistoryList);
router.get('/:ownerId/profile-extras', authWithCompany, ownerProfileExtras);
router.get('/:ownerId/full-profile', authWithCompany, ownerFullProfile);
router.patch('/:ownerId/profile', authWithCompany, ownerProfilePatch);
router.post('/:ownerId/banking', authWithCompany, ownerBankingUpsert);
router.post('/:ownerId/preferences', authWithCompany, ownerPreferencesUpsert);
router.post('/:ownerId/documents', authWithCompany, ownerDocumentsUpload);
router.get('/:ownerId/documents/:docType', authWithCompany, ownerDocumentPdf);
router.get('/:id', authWithCompany, getPropertyOwnerById);
router.patch('/:id', authWithCompany, updatePropertyOwner);
// Accept PUT for clients that use PUT semantics for updates
router.put('/:id', authWithCompany, updatePropertyOwner);
router.delete('/:id', authWithCompany, deletePropertyOwner);

export default router; 