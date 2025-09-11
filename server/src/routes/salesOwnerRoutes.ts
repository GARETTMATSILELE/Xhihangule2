import express from 'express';
import { authWithCompany } from '../middleware/auth';
import { createSalesOwner, getSalesOwners } from '../controllers/salesOwnerController';

const router = express.Router();

router.post('/', authWithCompany, createSalesOwner);
router.get('/', authWithCompany, getSalesOwners);

export default router;




