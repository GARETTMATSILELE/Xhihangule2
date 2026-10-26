import express from 'express';
import { auth } from '../middleware/auth';
import { canViewCommissions, isAccountant, isSystemAdmin } from '../middleware/roles';
import {
  getDashboardSummary,
  getDashboardOutstanding,
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
import {
  createCompanyVatRate,
  getCurrentVatRate,
  getVatOnCommissionSummary,
  listCompanyTaxRates
} from '../controllers/taxRateController';
import {
  getTaxComplianceDashboard,
  listTaxObligations,
  getTaxReconciliation,
  postZimraPayment,
  uploadZimraPaymentReceipt,
  prepareCompanyVatReturn,
  listCompanyVatReturns,
  patchVatReturn,
  listTaxReviews,
  resolveTaxReview,
  getComplianceMigrationReport,
  listTaxPayments,
  runCompanyTaxIntegrity,
  getTaxPosition
} from '../controllers/taxComplianceController';
import {
  getFinancialControlsDashboard,
  getTrialBalance,
  getReconciliationStatus,
  getFinancialExceptions,
  reviewFinancialException,
  runFinancialIntegrity,
  getAccountingPeriods,
  postAccountingPeriod,
  closeAccountingPeriodHandler,
  reopenAccountingPeriodHandler
} from '../controllers/financialControlsController';
import multer from 'multer';
import { hasAllowedUploadExtension } from '../utils/contentDisposition';
import { createPerCompanyRateLimiter } from '../middleware/companyLoadShedding';

const router = express.Router();
const dashboardSummaryLimiter = createPerCompanyRateLimiter({
  operation: 'dashboard-summary',
  maxRequests: Math.max(5, Number(process.env.ACCOUNTING_DASHBOARD_RATE_LIMIT_MAX || 40)),
  windowMs: Math.max(5000, Number(process.env.ACCOUNTING_DASHBOARD_RATE_LIMIT_WINDOW_MS || 30000))
});

router.use(auth);

router.get('/dashboard-summary', canViewCommissions, dashboardSummaryLimiter, getDashboardSummary);
router.get('/dashboard-outstanding', canViewCommissions, dashboardSummaryLimiter, getDashboardOutstanding);
router.get('/revenue-trend', canViewCommissions, getRevenueTrend);
router.get('/expense-trend', canViewCommissions, getExpenseTrend);
router.get('/vat-status', canViewCommissions, getVatStatus);
router.get('/vat-report/export', canViewCommissions, exportVatReport);
router.get('/vat-on-commission', canViewCommissions, getVatOnCommissionSummary);
router.get('/tax-rates', canViewCommissions, listCompanyTaxRates);
router.get('/tax-rates/current', canViewCommissions, getCurrentVatRate);
router.post('/tax-rates', canViewCommissions, createCompanyVatRate);
router.get('/commission-liability', canViewCommissions, getCommissionLiability);
router.get('/profit-loss', canViewCommissions, getProfitAndLoss);
router.get('/balance-sheet', canViewCommissions, getBalanceSheet);
router.get('/ledger', canViewCommissions, getLedger);
router.get('/bank-reconciliation', canViewCommissions, getBankReconciliation);
router.get('/bank-transactions/:id/suggestions', canViewCommissions, getBankTransactionSuggestions);
router.patch('/bank-transactions/:id/reconcile', isAccountant, reconcileBankTransaction);

router.post('/journal/manual', isAccountant, postManualTransaction);
router.post('/migrations/backfill-balances', isSystemAdmin, backfillBalances);

const taxUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png'];
    if (allowedTypes.includes(file.mimetype) && hasAllowedUploadExtension(file.originalname, allowedExtensions)) {
      cb(null, true);
      return;
    }
    cb(new Error('Invalid receipt file. Only PDF and image files are allowed.'));
  }
});

router.get('/tax-compliance', canViewCommissions, getTaxComplianceDashboard);
router.get('/tax-position', canViewCommissions, getTaxPosition);
router.get('/tax-obligations', canViewCommissions, listTaxObligations);
router.get('/tax-reconciliation', canViewCommissions, getTaxReconciliation);
router.get('/tax-payments', canViewCommissions, listTaxPayments);
router.post('/tax-payments', isAccountant, postZimraPayment);
router.post('/tax-payments/:paymentId/receipt', isAccountant, taxUpload.single('receipt'), uploadZimraPaymentReceipt);
router.get('/vat-returns', canViewCommissions, listCompanyVatReturns);
router.post('/vat-returns/prepare', isAccountant, prepareCompanyVatReturn);
router.patch('/vat-returns/:filingPeriod', isAccountant, patchVatReturn);
router.get('/tax-reviews', canViewCommissions, listTaxReviews);
router.post('/tax-reviews/:id/resolve', isAccountant, resolveTaxReview);
router.get('/tax-migration-report', canViewCommissions, getComplianceMigrationReport);
router.post('/tax-integrity/run', isAccountant, runCompanyTaxIntegrity);

router.get('/financial-controls', canViewCommissions, getFinancialControlsDashboard);
router.get('/trial-balance', canViewCommissions, getTrialBalance);
router.get('/reconciliation-status', canViewCommissions, getReconciliationStatus);
router.get('/financial-exceptions', canViewCommissions, getFinancialExceptions);
router.post('/financial-exceptions/:id/review', isAccountant, reviewFinancialException);
router.post('/financial-integrity/run', isAccountant, runFinancialIntegrity);
router.get('/periods', canViewCommissions, getAccountingPeriods);
router.post('/periods', isAccountant, postAccountingPeriod);
router.post('/periods/:id/close', isAccountant, closeAccountingPeriodHandler);
router.post('/periods/:id/reopen', isAccountant, reopenAccountingPeriodHandler);

export default router;
