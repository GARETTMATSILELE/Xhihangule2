import { Router } from 'express';
import { createOrder, captureOrder, getStatus } from '../controllers/paypalController';

const router = Router();

router.get('/status', getStatus);
router.post('/create-order', createOrder);
router.post('/capture-order', captureOrder);

export default router;









