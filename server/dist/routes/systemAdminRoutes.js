"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const systemAdminController_1 = require("../controllers/systemAdminController");
const router = express_1.default.Router();
// Require auth; restrict to system_admin via middleware check inside controller
router.use(auth_1.auth);
router.get('/status', systemAdminController_1.getStatus);
router.get('/users', systemAdminController_1.listSystemAdmins);
router.post('/users', systemAdminController_1.addSystemAdmin);
router.delete('/users/:id', systemAdminController_1.removeSystemAdmin);
router.post('/backups/run', systemAdminController_1.runBackup);
router.get('/backups', systemAdminController_1.getBackups);
router.post('/maintenance/reconcile', systemAdminController_1.reconcile);
router.post('/maintenance/ledger', systemAdminController_1.ledgerMaintenance);
router.post('/sync/full', systemAdminController_1.fullSync);
// Subscriptions management
router.get('/subscriptions/companies', systemAdminController_1.listCompanySubscriptions);
router.post('/subscriptions/renew', systemAdminController_1.manualRenewSubscription);
router.post('/subscriptions/vouchers', systemAdminController_1.createCashVoucher);
router.get('/subscriptions/vouchers', systemAdminController_1.listCashVouchers);
router.get('/subscriptions/billing-payments', systemAdminController_1.listSubscriptionBillingPayments);
router.get('/subscriptions/billing-payments/:id/receipt', systemAdminController_1.getSubscriptionPaymentReceipt);
exports.default = router;
