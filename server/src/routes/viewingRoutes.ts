import express from 'express';
import { authWithCompany } from '../middleware/auth';
import { listViewings, createViewing, updateViewing, deleteViewing } from '../controllers/viewingController';

const router = express.Router();

router.get('/', authWithCompany, listViewings);
router.post('/', authWithCompany, createViewing);
router.put('/:id', authWithCompany, updateViewing);
router.delete('/:id', authWithCompany, deleteViewing);

export default router;


