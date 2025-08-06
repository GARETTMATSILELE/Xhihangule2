"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const roles_1 = require("../middleware/roles");
const accountantController_1 = require("../controllers/accountantController");
const paymentController_1 = require("../controllers/paymentController");
const propertyAccountController_1 = require("../controllers/propertyAccountController");
const router = express_1.default.Router();
// Debug middleware
router.use((req, res, next) => {
    console.log('=== ACCOUNTANT ROUTE DEBUG ===');
    console.log('Accountant route accessed:', req.method, req.path);
    console.log('User:', req.user);
    console.log('Full URL:', req.originalUrl);
    console.log('Base URL:', req.baseUrl);
    console.log('Original URL:', req.originalUrl);
    console.log('=============================');
    next();
});
// Apply authentication middleware to all routes
router.use(auth_1.auth);
// Commission routes - require accountant role
router.get('/agent-commissions', roles_1.isAccountant, (req, res) => {
    console.log('Agent commissions route hit');
    (0, accountantController_1.getAgentCommissions)(req, res);
});
router.get('/agency-commission', roles_1.isAccountant, (req, res) => {
    console.log('Agency commission route hit');
    (0, accountantController_1.getAgencyCommission)(req, res);
});
router.get('/prea-commission', roles_1.isAccountant, (req, res) => {
    console.log('PREA commission route hit');
    (0, accountantController_1.getPREACommission)(req, res);
});
// Payment routes - allow admin, accountant, and agent roles
router.get('/payments', roles_1.canManagePayments, paymentController_1.getCompanyPayments);
router.post('/payments', roles_1.canManagePayments, paymentController_1.createPaymentAccountant);
router.get('/payments/:id', roles_1.canManagePayments, paymentController_1.getPaymentDetails);
router.put('/payments/:id/status', roles_1.canManagePayments, paymentController_1.updatePaymentStatus);
// Property Account routes - require accountant role
router.get('/property-accounts', roles_1.isAccountant, propertyAccountController_1.getCompanyPropertyAccounts);
router.get('/property-accounts/:propertyId', roles_1.isAccountant, (req, res) => {
    var _a;
    console.log('Property account detail route hit:', req.params.propertyId);
    console.log('User role:', (_a = req.user) === null || _a === void 0 ? void 0 : _a.role);
    (0, propertyAccountController_1.getPropertyAccount)(req, res);
});
router.get('/property-accounts/:propertyId/transactions', roles_1.isAccountant, propertyAccountController_1.getPropertyTransactions);
router.post('/property-accounts/:propertyId/expense', roles_1.isAccountant, propertyAccountController_1.addExpense);
router.post('/property-accounts/:propertyId/payout', roles_1.isAccountant, propertyAccountController_1.createOwnerPayout);
router.put('/property-accounts/:propertyId/payout/:payoutId/status', roles_1.isAccountant, propertyAccountController_1.updatePayoutStatus);
router.get('/property-accounts/:propertyId/payouts', roles_1.isAccountant, propertyAccountController_1.getPayoutHistory);
router.post('/property-accounts/sync', roles_1.isAccountant, propertyAccountController_1.syncPropertyAccounts);
router.get('/property-accounts/:propertyId/payout/:payoutId/payment-request', roles_1.isAccountant, propertyAccountController_1.getPaymentRequestDocument);
router.get('/property-accounts/:propertyId/payout/:payoutId/acknowledgement', roles_1.isAccountant, propertyAccountController_1.getAcknowledgementDocument);
exports.default = router;
