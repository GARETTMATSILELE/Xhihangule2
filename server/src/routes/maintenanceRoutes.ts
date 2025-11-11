import { Router } from 'express';
import { runReconciliation } from '../controllers/maintenanceController';
import { auth } from '../middleware/auth';

const router = Router();

// Admin-only reconciliation route (auth + controller checks admin)
router.post('/reconcile-duplicates', auth, runReconciliation);

export default router;


