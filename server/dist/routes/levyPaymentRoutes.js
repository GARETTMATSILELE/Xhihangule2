"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const levyPaymentController_1 = require("../controllers/levyPaymentController");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
router.post('/', auth_1.auth, levyPaymentController_1.createLevyPayment);
router.get('/', levyPaymentController_1.getLevyPayments);
// Public receipt endpoint to mirror payments/public/:id/receipt
router.get('/public/:id/receipt', levyPaymentController_1.getLevyReceiptPublic);
router.get('/public/:id/receipt/download', levyPaymentController_1.getLevyReceiptDownload);
// Authenticated receipt endpoints (JSON + HTML download)
router.get('/:id/receipt', auth_1.auth, levyPaymentController_1.getLevyReceiptPublic);
router.get('/:id/receipt/download', auth_1.auth, levyPaymentController_1.getLevyReceiptDownload);
// Payout endpoints
router.post('/:id/payout', auth_1.auth, levyPaymentController_1.initiateLevyPayout);
router.get('/public/:id/payout/ack', levyPaymentController_1.getLevyPayoutAcknowledgement);
exports.default = router;
