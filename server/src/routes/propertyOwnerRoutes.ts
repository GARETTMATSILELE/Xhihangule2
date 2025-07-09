import express from 'express';
import { auth } from '../middleware/auth';
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
router.post('/public', createPropertyOwnerPublic);
router.patch('/public/:id', updatePropertyOwnerPublic);
router.delete('/public/:id', deletePropertyOwnerPublic);

// CRUD routes for property owners
router.post('/', auth, createPropertyOwner);
router.get('/', auth, getPropertyOwners);
router.get('/:id', auth, getPropertyOwnerById);
router.patch('/:id', auth, updatePropertyOwner);
router.delete('/:id', auth, deletePropertyOwner);

export default router; 