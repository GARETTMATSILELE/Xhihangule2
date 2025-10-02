import express from 'express';
import { authWithCompany } from '../middleware/auth';
import { listValuations, createValuation } from '../controllers/valuationController';

const router = express.Router();

router.get('/', authWithCompany, listValuations);
router.post('/', authWithCompany, createValuation);

export default router;





