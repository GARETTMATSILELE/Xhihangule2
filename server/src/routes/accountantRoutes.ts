import express from 'express';
import { auth } from '../middleware/auth';
import { isAccountant, canManagePayments, canViewCommissions, canViewSalesPayments } from '../middleware/roles';
import {
  getAgentCommissions,
  getAgencyCommission,
  getPREACommission,
  getPropertyDepositLedger,
  getPropertyDepositSummary,
  createPropertyDepositPayout,
  getCompanyDepositSummaries
} from '../controllers/accountantController';
import {
  createPayment,
  createPaymentAccountant,
  createSalesPaymentAccountant,
  getCompanyPayments,
  getCompanySalesPayments,
  getPaymentDetails,
  updatePayment,
  updatePaymentStatus,
  finalizeProvisionalPayment
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
  reconcilePropertyDuplicates,
  getCompanyPropertyAccounts
} from '../controllers/propertyAccountController';
import { getCompanyAccountSummary, getCompanyTransactions, createCompanyTransaction } from '../controllers/companyAccountController';
import { createSalesContract, listSalesContracts, getSalesContract } from '../controllers/salesContractController';
import { Request, Response } from 'express';
import { Payment } from '../models/Payment';
import mongoose from 'mongoose';
import {
  getAgentAccount,
  getCompanyAgentAccounts,
  addPenalty,
  createAgentPayout,
  updatePayoutStatus as updateAgentPayoutStatus,
  syncAgentAccounts,
  syncAgentCommissions,
  getAcknowledgementDocument as getAgentAcknowledgementDocument,
  getTopAgentsForMonth
} from '../controllers/agentAccountController';
import AgentAccountService from '../services/agentAccountService';
import { compareAgentCommissionTotals } from '../controllers/agentAccountController';

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

// Commission routes - allow admin and accountant to view
router.get('/agent-commissions', canViewCommissions, (req, res) => {
  console.log('Agent commissions route hit');
  getAgentCommissions(req, res);
});

router.get('/agency-commission', canViewCommissions, (req, res) => {
  console.log('Agency commission route hit');
  getAgencyCommission(req, res);
});

router.get('/prea-commission', canViewCommissions, (req, res) => {
  console.log('PREA commission route hit');
  getPREACommission(req, res);
});

// Deposit ledger routes - allow admin and accountant
router.get('/property-accounts/:propertyId/deposits', canViewCommissions, getPropertyDepositLedger);
router.get('/property-accounts/:propertyId/deposits/summary', canViewCommissions, getPropertyDepositSummary);
router.post('/property-accounts/:propertyId/deposits/payout', canViewCommissions, createPropertyDepositPayout);
// Company trust accounts summary
router.get('/trust-accounts/deposits', canViewCommissions, getCompanyDepositSummaries);

// Payment routes - allow admin, accountant, and agent roles
router.get('/payments', canManagePayments, getCompanyPayments);
// Sales-specific payment endpoints
router.get('/sales-payments', canViewSalesPayments, getCompanySalesPayments);
router.post('/sales-payments', canManagePayments, createSalesPaymentAccountant);
router.put('/sales-payments/:id', canManagePayments, updatePayment);
// Rental/general payments
router.post('/payments', canManagePayments, createPaymentAccountant);
router.get('/payments/:id', canManagePayments, getPaymentDetails);
router.put('/payments/:id/status', canManagePayments, updatePaymentStatus);
router.post('/payments/:id/finalize', canManagePayments, finalizeProvisionalPayment);

// Provisional auto-match suggestions (admin/accountant)
router.get('/payments/provisional/suggestions', isAccountant, async (req: Request, res: Response) => {
  try {
    const { q } = req.query as { q?: string };
    const companyId = req.user!.companyId as string;
    const query: any = { companyId: new mongoose.Types.ObjectId(companyId), isProvisional: true };
    if (q && q.trim()) {
      const regex = new RegExp(q.trim(), 'i');
      query.$or = [
        { manualPropertyAddress: { $regex: regex } },
        { manualTenantName: { $regex: regex } },
        { referenceNumber: { $regex: regex } }
      ];
    }
    const payments = await Payment.find(query).sort({ createdAt: -1 }).limit(50);
    res.json({ status: 'success', data: payments });
  } catch (err: any) {
    console.error('Error fetching provisional suggestions:', err);
    res.status(500).json({ status: 'error', message: 'Failed to fetch suggestions' });
  }
});

// Bulk finalize provisional payments
router.post('/payments/finalize-bulk', canManagePayments, async (req: Request, res: Response) => {
  try {
    const items = (req.body?.items || []) as Array<{ id: string; propertyId: string; tenantId: string; ownerId?: string; relationshipType?: 'management' | 'introduction'; overrideCommissionPercent?: number }>;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'items array is required' });
    }
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const item of items) {
      try {
        const r = await (finalizeProvisionalPayment as any)({ ...req, params: { id: item.id }, body: { ...item } }, { json: (o: any) => o });
        results.push({ id: item.id, ok: true });
      } catch (e: any) {
        results.push({ id: item.id, ok: false, error: e?.message || 'unknown' });
      }
    }
    res.json({ status: 'success', results });
  } catch (err: any) {
    console.error('Error bulk finalizing payments:', err);
    res.status(500).json({ message: 'Failed to bulk finalize payments' });
  }
});

// Property Account routes - allow admin and accountant
router.get('/property-accounts', canViewCommissions, getCompanyPropertyAccounts);
router.get('/property-accounts/:propertyId', canViewCommissions, (req, res) => {
  console.log('Property account detail route hit:', req.params.propertyId);
  console.log('User role:', req.user?.role);
  getPropertyAccount(req, res);
});
router.get('/property-accounts/:propertyId/transactions', canViewCommissions, getPropertyTransactions);
router.post('/property-accounts/:propertyId/expense', canViewCommissions, addExpense);
router.post('/property-accounts/:propertyId/payout', canViewCommissions, createOwnerPayout);
router.put('/property-accounts/:propertyId/payout/:payoutId/status', canViewCommissions, updatePayoutStatus);
router.get('/property-accounts/:propertyId/payouts', canViewCommissions, getPayoutHistory);
router.post('/property-accounts/sync', canViewCommissions, syncPropertyAccounts);
// Maintenance: remove duplicate income transactions for a property ledger (idempotent)
router.post('/property-accounts/:propertyId/reconcile-duplicates', canViewCommissions, reconcilePropertyDuplicates);
router.get('/property-accounts/:propertyId/payout/:payoutId/payment-request', canViewCommissions, getPaymentRequestDocument);
router.get('/property-accounts/:propertyId/payout/:payoutId/acknowledgement', canViewCommissions, getAcknowledgementDocument);

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
router.get('/agent-accounts/commission-compare', isAccountant, compareAgentCommissionTotals);
router.get('/agent-accounts/top-agents', isAccountant, getTopAgentsForMonth);
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

// Agent self-access summary (limited) - authenticated any role
router.get('/agents/me/account', async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) return res.status(401).json({ message: 'Unauthorized' });
    const service = AgentAccountService as any;
    const account = await service.getAgentAccount(req.user.userId);
    // Return limited summary only
    const payload = {
      agentId: account.agentId,
      agentName: account.agentName,
      runningBalance: account.runningBalance,
      totalCommissions: account.totalCommissions,
      totalPayouts: account.totalPayouts,
      totalPenalties: account.totalPenalties,
      lastCommissionDate: account.lastCommissionDate,
      lastPayoutDate: account.lastPayoutDate,
      lastPenaltyDate: account.lastPenaltyDate
    };
    return res.json({ status: 'success', data: payload });
  } catch (e: any) {
    console.error('Error fetching agent self account:', e);
    return res.status(500).json({ message: 'Failed to fetch agent account' });
  }
});

export default router; 