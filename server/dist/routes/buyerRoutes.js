"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const buyerController_1 = require("../controllers/buyerController");
const router = express_1.default.Router();
router.get('/', auth_1.authWithCompany, buyerController_1.listBuyers);
router.get('/:id', auth_1.authWithCompany, buyerController_1.getBuyer);
router.post('/', auth_1.authWithCompany, buyerController_1.createBuyer);
router.put('/:id', auth_1.authWithCompany, buyerController_1.updateBuyer);
router.delete('/:id', auth_1.authWithCompany, buyerController_1.deleteBuyer);
exports.default = router;
