import { Router } from 'express';
import { createOrder, captureOrder, getStatus, getClientConfig } from '../controllers/paypalController';

const router = Router();

router.get('/status', getStatus);
router.get('/client-config', getClientConfig);
router.post('/create-order', createOrder);
router.post('/capture-order', captureOrder);

export default router;









