import express from 'express';
import multer from 'multer';
import { auth } from '../middleware/auth';
import {
  createVatPayout,
  getVatPayoutAcknowledgement,
  getVatPayoutReceipt,
  getVatPropertySummary,
  getVatSummary,
  getVatTransactionsGrouped,
  uploadVatPayoutReceipt
} from '../controllers/vatController';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mime = String(file?.mimetype || '').toLowerCase();
    if (mime === 'application/pdf' || mime.startsWith('image/')) return cb(null, true);
    return cb(new Error('Only PDF or image files are allowed'));
  }
});

// Summary across company within date range
router.get('/summary', auth, getVatSummary);
// Grouped transactions by property for UI
router.get('/transactions', auth, getVatTransactionsGrouped);
// Create payout for a property (for uncovered VAT transactions in range)
router.post('/payouts', auth, createVatPayout);
// Print acknowledgement for a payout
router.get('/payouts/:payoutId/ack', getVatPayoutAcknowledgement);
// Upload receipt document for payout
router.post('/payouts/:payoutId/receipt', auth, upload.single('receipt'), uploadVatPayoutReceipt);
// Retrieve uploaded payout receipt
router.get('/payouts/:payoutId/receipt', auth, getVatPayoutReceipt);
// Printable property VAT summary for a period
router.get('/properties/:propertyId/summary', auth, getVatPropertySummary);

export default router;

