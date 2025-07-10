import express from 'express';
import { auth } from '../middleware/auth';
import { isAccountant, canManagePayments } from '../middleware/roles';
import {
  getAgentCommissions,
  getAgencyCommission,
  getPREACommission
} from '../controllers/accountantController';
import {
  createPayment,
  createPaymentAccountant,
  getCompanyPayments,
  getPaymentDetails,
  updatePaymentStatus
} from '../controllers/paymentController';

const router = express.Router();

// Debug middleware
router.use((req, res, next) => {
  console.log('Accountant route accessed:', req.method, req.path);
  console.log('User:', req.user);
  next();
});

// Apply authentication middleware to all routes
router.use(auth);

// Commission routes - require accountant role
router.get('/agent-commissions', isAccountant, (req, res) => {
  console.log('Agent commissions route hit');
  getAgentCommissions(req, res);
});

router.get('/agency-commission', isAccountant, (req, res) => {
  console.log('Agency commission route hit');
  getAgencyCommission(req, res);
});

router.get('/prea-commission', isAccountant, (req, res) => {
  console.log('PREA commission route hit');
  getPREACommission(req, res);
});

// Payment routes - allow admin, accountant, and agent roles
router.get('/payments', canManagePayments, getCompanyPayments);
router.post('/payments', canManagePayments, createPaymentAccountant);
router.get('/payments/:id', canManagePayments, getPaymentDetails);
router.put('/payments/:id/status', canManagePayments, updatePaymentStatus);

export default router; 