"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const fiscalController_1 = require("../controllers/fiscalController");
const router = express_1.default.Router();
// GET /api/fiscal/health?companyId=...
router.get('/health', fiscalController_1.getFiscalHealth);
exports.default = router;
