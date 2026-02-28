import express from 'express';
import { auth } from '../middleware/auth';
import { canViewCommissions, isAccountant } from '../middleware/roles';
import {
  getDashboardSummary,
  getRevenueTrend,
  getExpenseTrend,
  getVatStatus,
  exportVatReport,
  getCommissionLiability,
  getProfitAndLoss,
  getBalanceSheet,
  getLedger,
  getBankReconciliation,
  reconcileBankTransaction,
  getBankTransactionSuggestions,
  postManualTransaction,
  backfillBalances
} from '../controllers/accountingController';
import { createPerCompanyRateLimiter } from '../middleware/companyLoadShedding';

const router = express.Router();
const dashboardSummaryLimiter = createPerCompanyRateLimiter({
  operation: 'dashboard-summary',
  maxRequests: Math.max(5, Number(process.env.ACCOUNTING_DASHBOARD_RATE_LIMIT_MAX || 40)),
  windowMs: Math.max(5000, Number(process.env.ACCOUNTING_DASHBOARD_RATE_LIMIT_WINDOW_MS || 30000))
});

router.use(auth);

router.get('/dashboard-summary', canViewCommissions, dashboardSummaryLimiter, getDashboardSummary);
router.get('/revenue-trend', canViewCommissions, getRevenueTrend);
router.get('/expense-trend', canViewCommissions, getExpenseTrend);
router.get('/vat-status', canViewCommissions, getVatStatus);
router.get('/vat-report/export', canViewCommissions, exportVatReport);
router.get('/commission-liability', canViewCommissions, getCommissionLiability);
router.get('/profit-loss', canViewCommissions, getProfitAndLoss);
router.get('/balance-sheet', canViewCommissions, getBalanceSheet);
router.get('/ledger', canViewCommissions, getLedger);
router.get('/bank-reconciliation', canViewCommissions, getBankReconciliation);
router.get('/bank-transactions/:id/suggestions', canViewCommissions, getBankTransactionSuggestions);
router.patch('/bank-transactions/:id/reconcile', isAccountant, reconcileBankTransaction);

router.post('/journal/manual', isAccountant, postManualTransaction);
router.post('/migrations/backfill-balances', isAccountant, backfillBalances);

export default router;
