import express from 'express';
import { auth, authorize } from '../middleware/auth';
import {
  listSystemAdmins,
  addSystemAdmin,
  removeSystemAdmin,
  runBackup,
  getBackups,
  reconcile,
  ledgerMaintenance,
  fullSync,
  listCompanySubscriptions,
  listTenants,
  suspendTenant,
  reactivateTenant,
  manualRenewSubscription,
  createCashVoucher,
  listCashVouchers,
  listSubscriptionBillingPayments,
  getSubscriptionPaymentReceipt
} from '../controllers/systemAdminController';
import {
  getEnhancedStatus,
  getSystemAdminDashboard,
  listCompanies,
  getCompanyProfile,
  updateCompanyProfile,
  setCompanyStatus,
  listCashPayments,
  createCashPayment,
  reviewCashPayment,
  listPlans,
  upsertPlan,
  listPlatformInvoices,
  generatePlatformInvoice,
  updatePlatformInvoice,
  downloadPlatformInvoicePdf,
  emailPlatformInvoice,
  listEnhancedVouchers,
  revokeVoucher,
  extendVoucher,
  getVoucherHistory,
  listAuditLogs,
  listSupportTickets,
  createSupportTicket,
  updateSupportTicket,
  getRevenueAnalytics
} from '../controllers/systemAdminExpansionController';

const router = express.Router();

// Require auth; restrict to system_admin via middleware check inside controller
router.use(auth);

router.get('/status', getEnhancedStatus);
router.get('/dashboard', getSystemAdminDashboard);
router.get('/users', listSystemAdmins);
router.post('/users', addSystemAdmin);
router.delete('/users/:id', removeSystemAdmin);

router.post('/backups/run', runBackup);
router.get('/backups', getBackups);

router.post('/maintenance/reconcile', reconcile);
router.post('/maintenance/ledger', ledgerMaintenance);
router.post('/sync/full', fullSync);

// Subscriptions management
router.get('/subscriptions/companies', listCompanySubscriptions);
router.get('/tenants', listTenants);
router.post('/tenants/:id/suspend', suspendTenant);
router.post('/tenants/:id/reactivate', reactivateTenant);
router.post('/subscriptions/renew', manualRenewSubscription);
router.post('/subscriptions/vouchers', createCashVoucher);
router.get('/subscriptions/vouchers', listCashVouchers);
router.get('/subscriptions/billing-payments', listSubscriptionBillingPayments);
router.get('/subscriptions/billing-payments/:id/receipt', getSubscriptionPaymentReceipt);

// Enterprise SaaS management
router.get('/companies', listCompanies);
router.get('/companies/:id', getCompanyProfile);
router.put('/companies/:id', updateCompanyProfile);
router.post('/companies/:id/:action(suspend|activate)', setCompanyStatus);

router.get('/cash-payments', listCashPayments);
router.post('/cash-payments', createCashPayment);
router.post('/cash-payments/:id/:action(approve|reject|request-info)', reviewCashPayment);

router.get('/invoices', listPlatformInvoices);
router.post('/invoices', generatePlatformInvoice);
router.patch('/invoices/:id', updatePlatformInvoice);
router.get('/invoices/:id/pdf', downloadPlatformInvoicePdf);
router.post('/invoices/:id/email', emailPlatformInvoice);

router.get('/vouchers', listEnhancedVouchers);
router.post('/vouchers/:id/revoke', revokeVoucher);
router.post('/vouchers/:id/extend', extendVoucher);
router.get('/vouchers/:id/history', getVoucherHistory);

router.get('/plans', listPlans);
router.post('/plans', upsertPlan);
router.put('/plans/:code', upsertPlan);

router.get('/audit-logs', listAuditLogs);

router.get('/support-tickets', listSupportTickets);
router.post('/support-tickets', createSupportTicket);
router.patch('/support-tickets/:id', updateSupportTicket);

router.get('/revenue', getRevenueAnalytics);

export default router;


