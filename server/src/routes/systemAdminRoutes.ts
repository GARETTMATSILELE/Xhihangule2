import express from 'express';
import { auth, authorize } from '../middleware/auth';
import {
  getStatus,
  listSystemAdmins,
  addSystemAdmin,
  removeSystemAdmin,
  runBackup,
  getBackups,
  reconcile,
  ledgerMaintenance,
  fullSync,
  listCompanySubscriptions,
  manualRenewSubscription,
  createCashVoucher,
  listCashVouchers,
  listSubscriptionBillingPayments,
  getSubscriptionPaymentReceipt
} from '../controllers/systemAdminController';

const router = express.Router();

// Require auth; restrict to system_admin via middleware check inside controller
router.use(auth);

router.get('/status', getStatus);
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
router.post('/subscriptions/renew', manualRenewSubscription);
router.post('/subscriptions/vouchers', createCashVoucher);
router.get('/subscriptions/vouchers', listCashVouchers);
router.get('/subscriptions/billing-payments', listSubscriptionBillingPayments);
router.get('/subscriptions/billing-payments/:id/receipt', getSubscriptionPaymentReceipt);

export default router;


