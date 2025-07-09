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
const paymentController_1 = require("../controllers/paymentController");
const Payment_1 = require("../models/Payment");
const router = express_1.default.Router();
// Public endpoints (must come before protected routes)
router.get('/public', paymentController_1.getPaymentsPublic);
// MVP: Comprehensive public endpoints for all payment operations
router.get('/public/all', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const payments = yield Payment_1.Payment.find({})
            .select('amount dueDate status tenantId propertyId paymentMethod')
            .limit(50);
        res.json(payments);
    }
    catch (error) {
        console.error('Error fetching all public payments:', error);
        res.status(500).json({ message: 'Error fetching payments' });
    }
}));
// Public endpoint for getting payment receipt (must come before /public/:id)
router.get('/public/:id/receipt', paymentController_1.getPaymentReceipt);
// Public endpoint for downloading payment receipt as blob (must come before /public/:id)
router.get('/public/:id/receipt/download', paymentController_1.getPaymentReceiptDownload);
router.get('/public/:id', paymentController_1.getPaymentByIdPublic);
// Public endpoint for creating payments (for admin dashboard)
router.post('/public', paymentController_1.createPaymentPublic);
// Create a new payment
router.post('/', auth_1.auth, roles_1.canManagePayments, paymentController_1.createPayment);
// Get all payments for a company
router.get('/company', auth_1.auth, roles_1.canManagePayments, paymentController_1.getCompanyPayments);
// Get payment details
router.get('/:id', auth_1.auth, roles_1.canManagePayments, paymentController_1.getPaymentDetails);
// Update payment status
router.patch('/:id/status', auth_1.auth, roles_1.canManagePayments, paymentController_1.updatePaymentStatus);
exports.default = router;
