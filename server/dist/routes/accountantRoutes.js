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
const router = express_1.default.Router();
// Debug middleware
router.use((req, res, next) => {
    console.log('Accountant route accessed:', req.method, req.path);
    console.log('User:', req.user);
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
exports.default = router;
