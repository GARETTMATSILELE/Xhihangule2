"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const leadController_1 = require("../controllers/leadController");
const router = express_1.default.Router();
router.get('/', auth_1.authWithCompany, leadController_1.listLeads);
router.post('/', auth_1.authWithCompany, leadController_1.createLead);
router.put('/:id', auth_1.authWithCompany, leadController_1.updateLead);
router.delete('/:id', auth_1.authWithCompany, leadController_1.deleteLead);
exports.default = router;
