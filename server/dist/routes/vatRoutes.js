"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const vatController_1 = require("../controllers/vatController");
const router = express_1.default.Router();
// Summary across company within date range
router.get('/summary', auth_1.auth, vatController_1.getVatSummary);
// Grouped transactions by property for UI
router.get('/transactions', auth_1.auth, vatController_1.getVatTransactionsGrouped);
// Create payout for a property (for uncovered VAT transactions in range)
router.post('/payouts', auth_1.auth, vatController_1.createVatPayout);
// Print acknowledgement for a payout
router.get('/payouts/:payoutId/ack', vatController_1.getVatPayoutAcknowledgement);
// Printable property VAT summary for a period
router.get('/properties/:propertyId/summary', auth_1.auth, vatController_1.getVatPropertySummary);
exports.default = router;
