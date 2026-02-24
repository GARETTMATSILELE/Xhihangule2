"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const roles_1 = require("../middleware/roles");
const adminBackfillController_1 = require("../controllers/adminBackfillController");
const router = express_1.default.Router();
router.use(auth_1.auth);
router.use(roles_1.isAdmin);
router.get('/backfill-trust-accounts/state', adminBackfillController_1.getTrustBackfillStatus);
router.post('/backfill-trust-accounts', adminBackfillController_1.runTrustBackfill);
exports.default = router;
