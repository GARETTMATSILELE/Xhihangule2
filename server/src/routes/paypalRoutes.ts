import { Router } from 'express';
import { createOrder, captureOrder } from '../controllers/paypalController';

const router = Router();

router.post('/create-order', createOrder);
router.post('/capture-order', captureOrder);

export default router;









