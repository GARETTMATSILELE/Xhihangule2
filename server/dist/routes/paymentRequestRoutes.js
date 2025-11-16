"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const paymentRequestController_1 = require("../controllers/paymentRequestController");
const router = express_1.default.Router();
// Create a new payment request (requires auth)
router.post('/', auth_1.auth, paymentRequestController_1.createPaymentRequest);
// Get all payment requests for a company (requires auth)
router.get('/', auth_1.auth, paymentRequestController_1.getPaymentRequests);
// Get payment request statistics (requires auth)
router.get('/stats', auth_1.auth, paymentRequestController_1.getPaymentRequestStats);
// Get a single payment request (requires auth)
router.get('/:id', auth_1.auth, paymentRequestController_1.getPaymentRequest);
// Update payment request status (requires auth)
router.patch('/:id/status', auth_1.auth, paymentRequestController_1.updatePaymentRequestStatus);
// Approvals (Principal/PREA/Admin)
router.post('/:id/approve', auth_1.auth, paymentRequestController_1.approvePaymentRequest);
router.post('/:id/reject', auth_1.auth, paymentRequestController_1.rejectPaymentRequest);
// Delete a payment request (requires auth)
router.delete('/:id', auth_1.auth, paymentRequestController_1.deletePaymentRequest);
exports.default = router;
