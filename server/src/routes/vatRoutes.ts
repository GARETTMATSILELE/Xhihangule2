import express from 'express';
import { auth } from '../middleware/auth';
import { createVatPayout, getVatPayoutAcknowledgement, getVatPropertySummary, getVatSummary, getVatTransactionsGrouped } from '../controllers/vatController';

const router = express.Router();

// Summary across company within date range
router.get('/summary', auth, getVatSummary);
// Grouped transactions by property for UI
router.get('/transactions', auth, getVatTransactionsGrouped);
// Create payout for a property (for uncovered VAT transactions in range)
router.post('/payouts', auth, createVatPayout);
// Print acknowledgement for a payout
router.get('/payouts/:payoutId/ack', getVatPayoutAcknowledgement);
// Printable property VAT summary for a period
router.get('/properties/:propertyId/summary', auth, getVatPropertySummary);

export default router;

