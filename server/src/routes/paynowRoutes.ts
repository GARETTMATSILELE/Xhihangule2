import { Router } from 'express';
import { createWebPayment, createMobilePayment, pollTransaction, handleResult, handleReturn, getStatus, confirmByReference } from '../controllers/paynowController';
import { authWithCompany } from '../middleware/auth';

const router = Router();

router.get('/status', getStatus);
router.post('/web/create', authWithCompany, createWebPayment);
router.post('/mobile/create', authWithCompany, createMobilePayment);
router.get('/poll', authWithCompany, pollTransaction);
router.post('/confirm', authWithCompany, confirmByReference);
router.post('/result', handleResult);
router.get('/return', handleReturn);

export default router;


