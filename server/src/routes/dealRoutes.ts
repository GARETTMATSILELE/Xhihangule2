import express from 'express';
import { authWithCompany } from '../middleware/auth';
import { listDeals, createDeal, updateDeal, deleteDeal } from '../controllers/dealController';

const router = express.Router();

router.get('/', authWithCompany, listDeals);
router.post('/', authWithCompany, createDeal);
router.put('/:id', authWithCompany, updateDeal);
router.delete('/:id', authWithCompany, deleteDeal);

export default router;


