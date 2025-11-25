import express from 'express';
import { createLevyPayment, getLevyPayments, getLevyReceiptPublic, getLevyReceiptDownload, initiateLevyPayout, getLevyPayoutAcknowledgement } from '../controllers/levyPaymentController';
import { auth } from '../middleware/auth';

const router = express.Router();

router.post('/', auth, createLevyPayment);
router.get('/', getLevyPayments);
// Public receipt endpoint to mirror payments/public/:id/receipt
router.get('/public/:id/receipt', getLevyReceiptPublic);
router.get('/public/:id/receipt/download', getLevyReceiptDownload);
// Authenticated receipt endpoints (JSON + HTML download)
router.get('/:id/receipt', auth, getLevyReceiptPublic);
router.get('/:id/receipt/download', auth, getLevyReceiptDownload);
// Payout endpoints
router.post('/:id/payout', auth, initiateLevyPayout);
router.get('/public/:id/payout/ack', getLevyPayoutAcknowledgement);

export default router; 