import { Router } from 'express';
import { createWebPayment, createMobilePayment, pollTransaction, handleResult, handleReturn, getStatus } from '../controllers/paynowController';

const router = Router();

router.get('/status', getStatus);
router.post('/web/create', createWebPayment);
router.post('/mobile/create', createMobilePayment);
router.get('/poll', pollTransaction);
router.post('/result', handleResult);
router.get('/return', handleReturn);

export default router;


