"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const fiscalController_1 = require("../controllers/fiscalController");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// GET /api/fiscal/health
router.get('/health', auth_1.auth, fiscalController_1.getFiscalHealth);
exports.default = router;
