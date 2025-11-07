import express from 'express';
import { authWithCompany } from '../middleware/auth';
import { updateUnitStatus, listUnits, setUnitBuyer, updateUnitDetails, addUnitCollaborator, removeUnitCollaborator } from '../controllers/developmentUnitController';

const router = express.Router();

router.get('/', authWithCompany, listUnits);
router.patch('/:unitId/status', authWithCompany, updateUnitStatus);
router.patch('/:unitId/buyer', authWithCompany, setUnitBuyer);
router.patch('/:unitId', authWithCompany, updateUnitDetails);
router.post('/:unitId/collaborators', authWithCompany, addUnitCollaborator);
router.delete('/:unitId/collaborators', authWithCompany, removeUnitCollaborator);

export default router;





