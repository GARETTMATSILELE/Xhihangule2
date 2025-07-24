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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLevyPayments = exports.createLevyPayment = void 0;
const LevyPayment_1 = require("../models/LevyPayment");
const createLevyPayment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const levyPayment = new LevyPayment_1.LevyPayment(req.body);
        yield levyPayment.save();
        res.status(201).json(levyPayment);
    }
    catch (error) {
        res.status(400).json({ message: error.message || 'Failed to create levy payment' });
    }
});
exports.createLevyPayment = createLevyPayment;
const getLevyPayments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const companyId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId) || req.query.companyId;
        if (!companyId) {
            return res.status(400).json({ message: 'Company ID is required' });
        }
        const levyPayments = yield LevyPayment_1.LevyPayment.find({ companyId }).sort({ paymentDate: -1 });
        res.status(200).json(levyPayments);
    }
    catch (error) {
        res.status(500).json({ message: error.message || 'Failed to fetch levy payments' });
    }
});
exports.getLevyPayments = getLevyPayments;
