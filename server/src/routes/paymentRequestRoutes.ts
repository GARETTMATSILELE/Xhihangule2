import express from 'express';
import { auth } from '../middleware/auth';
import {
  createPaymentRequest,
  getPaymentRequests,
  getPaymentRequest,
  updatePaymentRequestStatus,
  deletePaymentRequest,
  getPaymentRequestStats,
  approvePaymentRequest,
  rejectPaymentRequest
} from '../controllers/paymentRequestController';

const router = express.Router();

// Create a new payment request (requires auth)
router.post('/', auth, createPaymentRequest);

// Get all payment requests for a company (requires auth)
router.get('/', auth, getPaymentRequests);

// Get payment request statistics (requires auth)
router.get('/stats', auth, getPaymentRequestStats);

// Get a single payment request (requires auth)
router.get('/:id', auth, getPaymentRequest);

// Update payment request status (requires auth)
router.patch('/:id/status', auth, updatePaymentRequestStatus);

// Approvals (Principal/PREA/Admin)
router.post('/:id/approve', auth, approvePaymentRequest);
router.post('/:id/reject', auth, rejectPaymentRequest);

// Delete a payment request (requires auth)
router.delete('/:id', auth, deletePaymentRequest);

export default router; 