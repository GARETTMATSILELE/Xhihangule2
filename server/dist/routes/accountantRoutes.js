"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
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
const companyAccountController_1 = require("../controllers/companyAccountController");
const salesContractController_1 = require("../controllers/salesContractController");
const Payment_1 = require("../models/Payment");
const mongoose_1 = __importDefault(require("mongoose"));
const agentAccountController_1 = require("../controllers/agentAccountController");
const router = express_1.default.Router();
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
        user: req.user ? { id: req.user.id, role: req.user.role } : null
    });
});
// Apply authentication middleware to all routes
router.use(auth_1.auth);
// Commission routes - allow admin and accountant to view
router.get('/agent-commissions', roles_1.canViewCommissions, (req, res) => {
    console.log('Agent commissions route hit');
    (0, accountantController_1.getAgentCommissions)(req, res);
});
router.get('/agency-commission', roles_1.canViewCommissions, (req, res) => {
    console.log('Agency commission route hit');
    (0, accountantController_1.getAgencyCommission)(req, res);
});
router.get('/prea-commission', roles_1.canViewCommissions, (req, res) => {
    console.log('PREA commission route hit');
    (0, accountantController_1.getPREACommission)(req, res);
});
// Deposit ledger routes - require accountant role
router.get('/property-accounts/:propertyId/deposits', roles_1.isAccountant, accountantController_1.getPropertyDepositLedger);
router.get('/property-accounts/:propertyId/deposits/summary', roles_1.isAccountant, accountantController_1.getPropertyDepositSummary);
router.post('/property-accounts/:propertyId/deposits/payout', roles_1.isAccountant, accountantController_1.createPropertyDepositPayout);
// Payment routes - allow admin, accountant, and agent roles
router.get('/payments', roles_1.canManagePayments, paymentController_1.getCompanyPayments);
router.post('/payments', roles_1.canManagePayments, paymentController_1.createPaymentAccountant);
router.get('/payments/:id', roles_1.canManagePayments, paymentController_1.getPaymentDetails);
router.put('/payments/:id/status', roles_1.canManagePayments, paymentController_1.updatePaymentStatus);
router.post('/payments/:id/finalize', roles_1.canManagePayments, paymentController_1.finalizeProvisionalPayment);
// Provisional auto-match suggestions (admin/accountant)
router.get('/payments/provisional/suggestions', roles_1.isAccountant, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { q } = req.query;
        const companyId = req.user.companyId;
        const query = { companyId: new mongoose_1.default.Types.ObjectId(companyId), isProvisional: true };
        if (q && q.trim()) {
            const regex = new RegExp(q.trim(), 'i');
            query.$or = [
                { manualPropertyAddress: { $regex: regex } },
                { manualTenantName: { $regex: regex } },
                { referenceNumber: { $regex: regex } }
            ];
        }
        const payments = yield Payment_1.Payment.find(query).sort({ createdAt: -1 }).limit(50);
        res.json({ status: 'success', data: payments });
    }
    catch (err) {
        console.error('Error fetching provisional suggestions:', err);
        res.status(500).json({ status: 'error', message: 'Failed to fetch suggestions' });
    }
}));
// Bulk finalize provisional payments
router.post('/payments/finalize-bulk', roles_1.canManagePayments, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const items = (((_a = req.body) === null || _a === void 0 ? void 0 : _a.items) || []);
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ message: 'items array is required' });
        }
        const results = [];
        for (const item of items) {
            try {
                const r = yield paymentController_1.finalizeProvisionalPayment(Object.assign(Object.assign({}, req), { params: { id: item.id }, body: Object.assign({}, item) }), { json: (o) => o });
                results.push({ id: item.id, ok: true });
            }
            catch (e) {
                results.push({ id: item.id, ok: false, error: (e === null || e === void 0 ? void 0 : e.message) || 'unknown' });
            }
        }
        res.json({ status: 'success', results });
    }
    catch (err) {
        console.error('Error bulk finalizing payments:', err);
        res.status(500).json({ message: 'Failed to bulk finalize payments' });
    }
}));
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
// Company account routes
router.get('/company-account/summary', roles_1.isAccountant, companyAccountController_1.getCompanyAccountSummary);
router.get('/company-account/transactions', roles_1.isAccountant, companyAccountController_1.getCompanyTransactions);
router.post('/company-account/transactions', roles_1.isAccountant, companyAccountController_1.createCompanyTransaction);
// Sales contracts
router.post('/sales', roles_1.isAccountant, salesContractController_1.createSalesContract);
router.get('/sales', roles_1.isAccountant, salesContractController_1.listSalesContracts);
router.get('/sales/:id', roles_1.isAccountant, salesContractController_1.getSalesContract);
// Agent Account routes - require accountant role
router.get('/agent-accounts', roles_1.isAccountant, agentAccountController_1.getCompanyAgentAccounts);
router.get('/agent-accounts/:agentId', roles_1.isAccountant, (req, res) => {
    var _a;
    console.log('Agent account detail route hit:', req.params.agentId);
    console.log('User role:', (_a = req.user) === null || _a === void 0 ? void 0 : _a.role);
    (0, agentAccountController_1.getAgentAccount)(req, res);
});
router.post('/agent-accounts/:agentId/penalty', roles_1.isAccountant, agentAccountController_1.addPenalty);
router.post('/agent-accounts/:agentId/payout', roles_1.isAccountant, agentAccountController_1.createAgentPayout);
router.put('/agent-accounts/:agentId/payout/:payoutId/status', roles_1.isAccountant, agentAccountController_1.updatePayoutStatus);
router.post('/agent-accounts/sync', roles_1.isAccountant, agentAccountController_1.syncAgentAccounts);
router.post('/agent-accounts/:agentId/sync-commissions', roles_1.isAccountant, agentAccountController_1.syncAgentCommissions);
router.get('/agent-accounts/:agentId/payout/:payoutId/acknowledgement', roles_1.isAccountant, agentAccountController_1.getAcknowledgementDocument);
exports.default = router;
