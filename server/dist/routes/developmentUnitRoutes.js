"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const developmentUnitController_1 = require("../controllers/developmentUnitController");
const router = express_1.default.Router();
router.get('/', auth_1.authWithCompany, developmentUnitController_1.listUnits);
router.patch('/:unitId/status', auth_1.authWithCompany, developmentUnitController_1.updateUnitStatus);
router.patch('/:unitId/buyer', auth_1.authWithCompany, developmentUnitController_1.setUnitBuyer);
exports.default = router;
