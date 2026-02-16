import express from 'express';
import { authWithCompany } from '../middleware/auth';
import { listValuations, createValuation, getValuationById, updateValuation } from '../controllers/valuationController';

const router = express.Router();

router.get('/', authWithCompany, listValuations);
router.post('/', authWithCompany, createValuation);
router.get('/:id', authWithCompany, getValuationById);
router.patch('/:id', authWithCompany, updateValuation);

export default router;





