import express from 'express';
import { authWithCompany } from '../middleware/auth';
import { updateUnitStatus, listUnits } from '../controllers/developmentUnitController';

const router = express.Router();

router.get('/', authWithCompany, listUnits);
router.patch('/:unitId/status', authWithCompany, updateUnitStatus);

export default router;





