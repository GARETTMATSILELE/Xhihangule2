import express from 'express';
import { handlePaymentConfirmationWebhook } from '../controllers/paymentWebhookController';

const router = express.Router();

router.post('/payment-confirmation', handlePaymentConfirmationWebhook);

export default router;
