"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const roles_1 = require("../middleware/roles");
const invoiceController_1 = require("../controllers/invoiceController");
const router = express_1.default.Router();
// Apply authentication middleware to all routes
router.use(auth_1.auth);
// Invoice routes - require accountant role
router.post('/', roles_1.isAccountant, invoiceController_1.createInvoice);
router.get('/', roles_1.isAccountant, invoiceController_1.getInvoices);
exports.default = router;
