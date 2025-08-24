"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const dealController_1 = require("../controllers/dealController");
const router = express_1.default.Router();
router.get('/', auth_1.authWithCompany, dealController_1.listDeals);
router.post('/', auth_1.authWithCompany, dealController_1.createDeal);
router.put('/:id', auth_1.authWithCompany, dealController_1.updateDeal);
router.delete('/:id', auth_1.authWithCompany, dealController_1.deleteDeal);
exports.default = router;
