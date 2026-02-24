"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const auth_1 = require("../middleware/auth");
const vatController_1 = require("../controllers/vatController");
const router = express_1.default.Router();
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const mime = String((file === null || file === void 0 ? void 0 : file.mimetype) || '').toLowerCase();
        if (mime === 'application/pdf' || mime.startsWith('image/'))
            return cb(null, true);
        return cb(new Error('Only PDF or image files are allowed'));
    }
});
// Summary across company within date range
router.get('/summary', auth_1.auth, vatController_1.getVatSummary);
// Grouped transactions by property for UI
router.get('/transactions', auth_1.auth, vatController_1.getVatTransactionsGrouped);
// Create payout for a property (for uncovered VAT transactions in range)
router.post('/payouts', auth_1.auth, vatController_1.createVatPayout);
// Print acknowledgement for a payout
router.get('/payouts/:payoutId/ack', vatController_1.getVatPayoutAcknowledgement);
// Upload receipt document for payout
router.post('/payouts/:payoutId/receipt', auth_1.auth, upload.single('receipt'), vatController_1.uploadVatPayoutReceipt);
// Retrieve uploaded payout receipt
router.get('/payouts/:payoutId/receipt', auth_1.auth, vatController_1.getVatPayoutReceipt);
// Printable property VAT summary for a period
router.get('/properties/:propertyId/summary', auth_1.auth, vatController_1.getVatPropertySummary);
exports.default = router;
