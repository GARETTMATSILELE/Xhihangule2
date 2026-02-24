import express from 'express';
import { auth } from '../middleware/auth';
import { isAdmin } from '../middleware/roles';
import { getTrustBackfillStatus, runTrustBackfill } from '../controllers/adminBackfillController';

const router = express.Router();

router.use(auth);
router.use(isAdmin);

router.get('/backfill-trust-accounts/state', getTrustBackfillStatus);
router.post('/backfill-trust-accounts', runTrustBackfill);

export default router;

