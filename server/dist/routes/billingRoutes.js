"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const billingController_1 = require("../controllers/billingController");
const router = express_1.default.Router();
router.post('/checkout', auth_1.authWithCompany, billingController_1.createCheckout);
router.get('/payments/:id/status', auth_1.authWithCompany, billingController_1.getPaymentStatus);
router.post('/vouchers/redeem', auth_1.authWithCompany, billingController_1.redeemVoucher);
router.post('/subscriptions/change-plan', auth_1.authWithCompany, billingController_1.changePlan);
exports.default = router;
