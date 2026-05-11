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

// Legacy "public" payment endpoints now require authentication. Payment data is
// financial data and must never be queryable by companyId alone.
router.get('/public', authWithCompany, canManagePayments, getPaymentsPublic);

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
router.get('/public/:id/receipt', authWithCompany, canManagePayments, getPaymentReceipt);

// Public endpoint for downloading payment receipt as blob (must come before /public/:id)
router.get('/public/:id/receipt/download', authWithCompany, canManagePayments, getPaymentReceiptDownload);

router.get('/public/:id', authWithCompany, canManagePayments, getPaymentByIdPublic);

// Public endpoint for creating payments (for admin dashboard)
router.post('/public', authWithCompany, canManagePayments, createPaymentPublic);

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