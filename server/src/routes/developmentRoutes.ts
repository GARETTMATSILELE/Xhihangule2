import express from 'express';
import { authWithCompany } from '../middleware/auth';
import { isAdmin } from '../middleware/roles';
import {
  createDevelopment,
  listDevelopments,
  getDevelopment,
  updateDevelopment,
  deleteDevelopment,
  listUnitsForDevelopment,
  recomputeStats,
  listPaymentsForDevelopment,
  addCollaborator,
  removeCollaborator
} from '../controllers/developmentController';

const router = express.Router();

router.get('/', authWithCompany, listDevelopments);
router.get('/:id', authWithCompany, getDevelopment);
router.get('/:id/units', authWithCompany, listUnitsForDevelopment);
router.get('/:id/payments', authWithCompany, listPaymentsForDevelopment);
router.post('/', authWithCompany, createDevelopment);
router.patch('/:id', authWithCompany, updateDevelopment);
router.delete('/:id', authWithCompany, isAdmin, deleteDevelopment);
router.post('/:id/recompute-stats', authWithCompany, recomputeStats);
router.post('/:id/collaborators', authWithCompany, addCollaborator);
router.delete('/:id/collaborators', authWithCompany, removeCollaborator);

export default router;





