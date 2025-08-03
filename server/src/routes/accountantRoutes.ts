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
import {
  getPropertyTransactions,
  getPropertyAccount,
  addExpense,
  createOwnerPayout,
  updatePayoutStatus,
  getPayoutHistory,
  syncPropertyAccounts,
  getPaymentRequestDocument,
  getAcknowledgementDocument,
  getCompanyPropertyAccounts
} from '../controllers/propertyAccountController';

const router = express.Router();

// Debug middleware
router.use((req, res, next) => {
  console.log('Accountant route accessed:', req.method, req.path);
  console.log('User:', req.user);
  console.log('Full URL:', req.originalUrl);
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

// Property Account routes - require accountant role
router.get('/property-accounts', isAccountant, getCompanyPropertyAccounts);
router.get('/property-accounts/:propertyId', isAccountant, (req, res) => {
  console.log('Property account detail route hit:', req.params.propertyId);
  console.log('User role:', req.user?.role);
  getPropertyAccount(req, res);
});
router.get('/property-accounts/:propertyId/transactions', isAccountant, getPropertyTransactions);
router.post('/property-accounts/:propertyId/expense', isAccountant, addExpense);
router.post('/property-accounts/:propertyId/payout', isAccountant, createOwnerPayout);
router.put('/property-accounts/:propertyId/payout/:payoutId/status', isAccountant, updatePayoutStatus);
router.get('/property-accounts/:propertyId/payouts', isAccountant, getPayoutHistory);
router.post('/property-accounts/sync', isAccountant, syncPropertyAccounts);
router.get('/property-accounts/:propertyId/payout/:payoutId/payment-request', isAccountant, getPaymentRequestDocument);
router.get('/property-accounts/:propertyId/payout/:payoutId/acknowledgement', isAccountant, getAcknowledgementDocument);

export default router; 