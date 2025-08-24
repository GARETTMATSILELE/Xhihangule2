"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const viewingController_1 = require("../controllers/viewingController");
const router = express_1.default.Router();
router.get('/', auth_1.authWithCompany, viewingController_1.listViewings);
router.post('/', auth_1.authWithCompany, viewingController_1.createViewing);
router.put('/:id', auth_1.authWithCompany, viewingController_1.updateViewing);
router.delete('/:id', auth_1.authWithCompany, viewingController_1.deleteViewing);
exports.default = router;
