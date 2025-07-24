import express from 'express';
import { createLevyPayment, getLevyPayments } from '../controllers/levyPaymentController';
import { auth } from '../middleware/auth';

const router = express.Router();

router.post('/', auth, createLevyPayment);
router.get('/', getLevyPayments);

export default router; 