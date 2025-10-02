import express from 'express';
import { authWithCompany } from '../middleware/auth';
import { createSalesOwner, getSalesOwners, getSalesOwnerById, updateSalesOwner } from '../controllers/salesOwnerController';

const router = express.Router();

router.post('/', authWithCompany, createSalesOwner);
router.get('/', authWithCompany, getSalesOwners);
router.get('/:id', authWithCompany, getSalesOwnerById);
router.patch('/:id', authWithCompany, updateSalesOwner);

export default router;




