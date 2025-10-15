import express from 'express';
import { authWithCompany } from '../middleware/auth';
import { updateUnitStatus, listUnits, setUnitBuyer } from '../controllers/developmentUnitController';

const router = express.Router();

router.get('/', authWithCompany, listUnits);
router.patch('/:unitId/status', authWithCompany, updateUnitStatus);
router.patch('/:unitId/buyer', authWithCompany, setUnitBuyer);

export default router;





