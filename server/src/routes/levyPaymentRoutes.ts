import express from 'express';
import { createLevyPayment, getLevyPayments, getLevyReceiptPublic, getLevyReceiptDownload, initiateLevyPayout, getLevyPayoutAcknowledgement } from '../controllers/levyPaymentController';
import { auth } from '../middleware/auth';

const router = express.Router();

router.post('/', auth, createLevyPayment);
router.get('/', getLevyPayments);
// Public receipt endpoint to mirror payments/public/:id/receipt
router.get('/public/:id/receipt', getLevyReceiptPublic);
router.get('/public/:id/receipt/download', getLevyReceiptDownload);
// Payout endpoints
router.post('/:id/payout', auth, initiateLevyPayout);
router.get('/public/:id/payout/ack', getLevyPayoutAcknowledgement);

export default router; 