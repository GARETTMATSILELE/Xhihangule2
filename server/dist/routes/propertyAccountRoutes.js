"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const propertyAccountService_1 = require("../services/propertyAccountService");
const propertyAccountController_1 = require("../controllers/propertyAccountController");
const router = express_1.default.Router();
router.post('/sync-payments', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    yield (0, propertyAccountService_1.syncPaymentsToPropertyAccounts)();
    res.json({ success: true });
}));
router.get('/:propertyId', propertyAccountController_1.getPropertyAccount);
router.post('/:propertyId/expense', propertyAccountController_1.addExpense);
exports.default = router;
