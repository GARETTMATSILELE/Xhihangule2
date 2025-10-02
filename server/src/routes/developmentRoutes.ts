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
  recomputeStats
} from '../controllers/developmentController';

const router = express.Router();

router.get('/', authWithCompany, listDevelopments);
router.get('/:id', authWithCompany, getDevelopment);
router.get('/:id/units', authWithCompany, listUnitsForDevelopment);
router.post('/', authWithCompany, createDevelopment);
router.patch('/:id', authWithCompany, updateDevelopment);
router.delete('/:id', authWithCompany, isAdmin, deleteDevelopment);
router.post('/:id/recompute-stats', authWithCompany, recomputeStats);

export default router;





