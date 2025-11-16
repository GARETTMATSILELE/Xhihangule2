import express from 'express';
import { authWithCompany } from '../middleware/auth';
import { listDeals, createDeal, updateDeal, deleteDeal, progressDeal, createDealFromLead, dealsSummary } from '../controllers/dealController';

const router = express.Router();

router.get('/', authWithCompany, listDeals);
router.get('/summary', authWithCompany, dealsSummary);
router.post('/', authWithCompany, createDeal);
router.post('/from-lead', authWithCompany, createDealFromLead);
router.put('/:id', authWithCompany, updateDeal);
router.post('/:id/progress', authWithCompany, progressDeal);
router.delete('/:id', authWithCompany, deleteDeal);

export default router;


