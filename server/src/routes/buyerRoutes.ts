import express from 'express';
import { authWithCompany } from '../middleware/auth';
import { listBuyers, getBuyer, createBuyer, updateBuyer, deleteBuyer } from '../controllers/buyerController';

const router = express.Router();

router.get('/', authWithCompany, listBuyers);
router.get('/:id', authWithCompany, getBuyer);
router.post('/', authWithCompany, createBuyer);
router.put('/:id', authWithCompany, updateBuyer);
router.delete('/:id', authWithCompany, deleteBuyer);

export default router;


