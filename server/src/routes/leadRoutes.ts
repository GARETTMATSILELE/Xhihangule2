import express from 'express';
import { authWithCompany } from '../middleware/auth';
import { listLeads, createLead, updateLead, deleteLead, getLeadSuggestedProperties } from '../controllers/leadController';

const router = express.Router();

router.get('/', authWithCompany, listLeads);
router.post('/', authWithCompany, createLead);
router.get('/:id/suggested-properties', authWithCompany, getLeadSuggestedProperties);
router.put('/:id', authWithCompany, updateLead);
router.delete('/:id', authWithCompany, deleteLead);

export default router;


