import express from 'express';
import { auth } from '../middleware/auth';
import { isAccountant, canManagePayments } from '../middleware/roles';
import {
  getAgentCommissions,
  getAgencyCommission,
  getPREACommission,
  getPropertyDepositLedger,
  getPropertyDepositSummary,
  createPropertyDepositPayout
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
import { getCompanyAccountSummary, getCompanyTransactions, createCompanyTransaction } from '../controllers/companyAccountController';
import { createSalesContract, listSalesContracts, getSalesContract } from '../controllers/salesContractController';
import {
  getAgentAccount,
  getCompanyAgentAccounts,
  addPenalty,
  createAgentPayout,
  updatePayoutStatus as updateAgentPayoutStatus,
  syncAgentAccounts,
  syncAgentCommissions,
  getAcknowledgementDocument as getAgentAcknowledgementDocument
} from '../controllers/agentAccountController';

const router = express.Router();

// Debug middleware
router.use((req, res, next) => {
  console.log('Accountant route accessed:', req.method, req.path);
  next();
});

// Test route to verify routes are working
router.get('/test', (req, res) => {
  res.json({ 
    message: 'Accountant routes are working', 
    timestamp: new Date().toISOString(),
    user: req.user ? { id: (req.user as any).id, role: (req.user as any).role } : null
  });
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

// Deposit ledger routes - require accountant role
router.get('/property-accounts/:propertyId/deposits', isAccountant, getPropertyDepositLedger);
router.get('/property-accounts/:propertyId/deposits/summary', isAccountant, getPropertyDepositSummary);
router.post('/property-accounts/:propertyId/deposits/payout', isAccountant, createPropertyDepositPayout);

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

// Company account routes
router.get('/company-account/summary', isAccountant, getCompanyAccountSummary);
router.get('/company-account/transactions', isAccountant, getCompanyTransactions);
router.post('/company-account/transactions', isAccountant, createCompanyTransaction);

// Sales contracts
router.post('/sales', isAccountant, createSalesContract);
router.get('/sales', isAccountant, listSalesContracts);
router.get('/sales/:id', isAccountant, getSalesContract);

// Agent Account routes - require accountant role
router.get('/agent-accounts', isAccountant, getCompanyAgentAccounts);
router.get('/agent-accounts/:agentId', isAccountant, (req, res) => {
  console.log('Agent account detail route hit:', req.params.agentId);
  console.log('User role:', req.user?.role);
  getAgentAccount(req, res);
});
router.post('/agent-accounts/:agentId/penalty', isAccountant, addPenalty);
router.post('/agent-accounts/:agentId/payout', isAccountant, createAgentPayout);
router.put('/agent-accounts/:agentId/payout/:payoutId/status', isAccountant, updateAgentPayoutStatus);
router.post('/agent-accounts/sync', isAccountant, syncAgentAccounts);
router.post('/agent-accounts/:agentId/sync-commissions', isAccountant, syncAgentCommissions);
router.get('/agent-accounts/:agentId/payout/:payoutId/acknowledgement', isAccountant, getAgentAcknowledgementDocument);

export default router; 