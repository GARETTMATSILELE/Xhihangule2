import express from 'express';
import { authWithCompany } from '../middleware/auth';
import { canManagePayments } from '../middleware/roles';
import {
  createPayment,
  getCompanyPayments,
  getPaymentDetails,
  updatePaymentStatus,
  getPaymentsPublic,
  getPaymentByIdPublic,
  createPaymentPublic,
  getPaymentReceipt,
  getPaymentReceiptDownload,
} from '../controllers/paymentController';
import { Payment } from '../models/Payment';

const router = express.Router();

// Public endpoints (must come before protected routes)
router.get('/public', getPaymentsPublic);

// MVP: Comprehensive public endpoints for all payment operations (disabled in production)
router.get('/public/all', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ message: 'Not found' });
  }
  try {
    const payments = await Payment.find({})
      .select('amount dueDate status tenantId propertyId paymentMethod')
      .limit(50);
    res.json(payments);
  } catch (error) {
    console.error('Error fetching all public payments:', error);
    res.status(500).json({ message: 'Error fetching payments' });
  }
});

// Public endpoint for getting payment receipt (must come before /public/:id)
router.get('/public/:id/receipt', getPaymentReceipt);

// Public endpoint for downloading payment receipt as blob (must come before /public/:id)
router.get('/public/:id/receipt/download', getPaymentReceiptDownload);

router.get('/public/:id', getPaymentByIdPublic);

// Public endpoint for creating payments (for admin dashboard)
router.post('/public', createPaymentPublic);

// Create a new payment
router.post('/', authWithCompany, canManagePayments, createPayment);

// Get all payments for a company
router.get('/company', authWithCompany, canManagePayments, getCompanyPayments);

// Get payment details
router.get('/:id', authWithCompany, canManagePayments, getPaymentDetails);

// Authenticated receipt endpoints (JSON + HTML download)
router.get('/:id/receipt', authWithCompany, canManagePayments, getPaymentReceipt);
router.get('/:id/receipt/download', authWithCompany, canManagePayments, getPaymentReceiptDownload);

// Update payment status
router.patch('/:id/status', authWithCompany, canManagePayments, updatePaymentStatus);

export default router; 