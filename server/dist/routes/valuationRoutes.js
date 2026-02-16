"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const valuationController_1 = require("../controllers/valuationController");
const router = express_1.default.Router();
router.get('/', auth_1.authWithCompany, valuationController_1.listValuations);
router.post('/', auth_1.authWithCompany, valuationController_1.createValuation);
router.get('/:id', auth_1.authWithCompany, valuationController_1.getValuationById);
router.patch('/:id', auth_1.authWithCompany, valuationController_1.updateValuation);
exports.default = router;
