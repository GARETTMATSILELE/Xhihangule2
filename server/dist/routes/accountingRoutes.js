"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const roles_1 = require("../middleware/roles");
const accountingController_1 = require("../controllers/accountingController");
const taxRateController_1 = require("../controllers/taxRateController");
const taxComplianceController_1 = require("../controllers/taxComplianceController");
const financialControlsController_1 = require("../controllers/financialControlsController");
const multer_1 = __importDefault(require("multer"));
const contentDisposition_1 = require("../utils/contentDisposition");
const companyLoadShedding_1 = require("../middleware/companyLoadShedding");
const router = express_1.default.Router();
const dashboardSummaryLimiter = (0, companyLoadShedding_1.createPerCompanyRateLimiter)({
    operation: 'dashboard-summary',
    maxRequests: Math.max(5, Number(process.env.ACCOUNTING_DASHBOARD_RATE_LIMIT_MAX || 40)),
    windowMs: Math.max(5000, Number(process.env.ACCOUNTING_DASHBOARD_RATE_LIMIT_WINDOW_MS || 30000))
});
router.use(auth_1.auth);
router.get('/dashboard-summary', roles_1.canViewCommissions, dashboardSummaryLimiter, accountingController_1.getDashboardSummary);
router.get('/dashboard-outstanding', roles_1.canViewCommissions, dashboardSummaryLimiter, accountingController_1.getDashboardOutstanding);
router.get('/revenue-trend', roles_1.canViewCommissions, accountingController_1.getRevenueTrend);
router.get('/expense-trend', roles_1.canViewCommissions, accountingController_1.getExpenseTrend);
router.get('/vat-status', roles_1.canViewCommissions, accountingController_1.getVatStatus);
router.get('/vat-report/export', roles_1.canViewCommissions, accountingController_1.exportVatReport);
router.get('/vat-on-commission', roles_1.canViewCommissions, taxRateController_1.getVatOnCommissionSummary);
router.get('/tax-rates', roles_1.canViewCommissions, taxRateController_1.listCompanyTaxRates);
router.get('/tax-rates/current', roles_1.canViewCommissions, taxRateController_1.getCurrentVatRate);
router.post('/tax-rates', roles_1.canViewCommissions, taxRateController_1.createCompanyVatRate);
router.get('/commission-liability', roles_1.canViewCommissions, accountingController_1.getCommissionLiability);
router.get('/profit-loss', roles_1.canViewCommissions, accountingController_1.getProfitAndLoss);
router.get('/balance-sheet', roles_1.canViewCommissions, accountingController_1.getBalanceSheet);
router.get('/ledger', roles_1.canViewCommissions, accountingController_1.getLedger);
router.get('/bank-reconciliation', roles_1.canViewCommissions, accountingController_1.getBankReconciliation);
router.get('/bank-transactions/:id/suggestions', roles_1.canViewCommissions, accountingController_1.getBankTransactionSuggestions);
router.patch('/bank-transactions/:id/reconcile', roles_1.isAccountant, accountingController_1.reconcileBankTransaction);
router.post('/journal/manual', roles_1.isAccountant, accountingController_1.postManualTransaction);
router.post('/migrations/backfill-balances', roles_1.isSystemAdmin, accountingController_1.backfillBalances);
const taxUpload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
        const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png'];
        if (allowedTypes.includes(file.mimetype) && (0, contentDisposition_1.hasAllowedUploadExtension)(file.originalname, allowedExtensions)) {
            cb(null, true);
            return;
        }
        cb(new Error('Invalid receipt file. Only PDF and image files are allowed.'));
    }
});
router.get('/tax-compliance', roles_1.canViewCommissions, taxComplianceController_1.getTaxComplianceDashboard);
router.get('/tax-position', roles_1.canViewCommissions, taxComplianceController_1.getTaxPosition);
router.get('/tax-obligations', roles_1.canViewCommissions, taxComplianceController_1.listTaxObligations);
router.get('/tax-reconciliation', roles_1.canViewCommissions, taxComplianceController_1.getTaxReconciliation);
router.get('/tax-payments', roles_1.canViewCommissions, taxComplianceController_1.listTaxPayments);
router.post('/tax-payments', roles_1.isAccountant, taxComplianceController_1.postZimraPayment);
router.post('/tax-payments/:paymentId/receipt', roles_1.isAccountant, taxUpload.single('receipt'), taxComplianceController_1.uploadZimraPaymentReceipt);
router.get('/vat-returns', roles_1.canViewCommissions, taxComplianceController_1.listCompanyVatReturns);
router.post('/vat-returns/prepare', roles_1.isAccountant, taxComplianceController_1.prepareCompanyVatReturn);
router.patch('/vat-returns/:filingPeriod', roles_1.isAccountant, taxComplianceController_1.patchVatReturn);
router.get('/tax-reviews', roles_1.canViewCommissions, taxComplianceController_1.listTaxReviews);
router.post('/tax-reviews/:id/resolve', roles_1.isAccountant, taxComplianceController_1.resolveTaxReview);
router.get('/tax-migration-report', roles_1.canViewCommissions, taxComplianceController_1.getComplianceMigrationReport);
router.post('/tax-integrity/run', roles_1.isAccountant, taxComplianceController_1.runCompanyTaxIntegrity);
router.get('/financial-controls', roles_1.canViewCommissions, financialControlsController_1.getFinancialControlsDashboard);
router.get('/trial-balance', roles_1.canViewCommissions, financialControlsController_1.getTrialBalance);
router.get('/reconciliation-status', roles_1.canViewCommissions, financialControlsController_1.getReconciliationStatus);
router.get('/financial-exceptions', roles_1.canViewCommissions, financialControlsController_1.getFinancialExceptions);
router.post('/financial-exceptions/:id/review', roles_1.isAccountant, financialControlsController_1.reviewFinancialException);
router.post('/financial-integrity/run', roles_1.isAccountant, financialControlsController_1.runFinancialIntegrity);
router.get('/periods', roles_1.canViewCommissions, financialControlsController_1.getAccountingPeriods);
router.post('/periods', roles_1.isAccountant, financialControlsController_1.postAccountingPeriod);
router.post('/periods/:id/close', roles_1.isAccountant, financialControlsController_1.closeAccountingPeriodHandler);
router.post('/periods/:id/reopen', roles_1.isAccountant, financialControlsController_1.reopenAccountingPeriodHandler);
exports.default = router;
