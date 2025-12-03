import express from 'express';
import { authWithCompany } from '../middleware/auth';
import { createSalesOwner, getSalesOwners, getSalesOwnerById, updateSalesOwner, deleteSalesOwner, getSalesOwnerByPropertyId } from '../controllers/salesOwnerController';

const router = express.Router();

router.post('/', authWithCompany, createSalesOwner);
router.get('/', authWithCompany, getSalesOwners);
router.get('/by-property/:propertyId', authWithCompany, getSalesOwnerByPropertyId);
router.get('/:id', authWithCompany, getSalesOwnerById);
router.patch('/:id', authWithCompany, updateSalesOwner);
// Accept PUT for clients that use PUT semantics for updates
router.put('/:id', authWithCompany, updateSalesOwner);
router.delete('/:id', authWithCompany, deleteSalesOwner);

export default router;




