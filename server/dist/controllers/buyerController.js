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
exports.deleteBuyer = exports.updateBuyer = exports.createBuyer = exports.listBuyers = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Buyer_1 = require("../models/Buyer");
const errorHandler_1 = require("../middleware/errorHandler");
const listBuyers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId))
            throw new errorHandler_1.AppError('Authentication required', 401);
        if (!req.user.companyId)
            throw new errorHandler_1.AppError('Company ID not found', 400);
        const query = { companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId) };
        if (req.user.role !== 'admin' && req.user.role !== 'accountant') {
            query.ownerId = new mongoose_1.default.Types.ObjectId(req.user.userId);
        }
        const buyers = yield Buyer_1.Buyer.find(query).sort({ createdAt: -1 });
        res.json({ status: 'success', data: buyers });
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError)
            return res.status(error.statusCode).json({ status: 'error', message: error.message });
        res.status(500).json({ status: 'error', message: 'Failed to fetch buyers' });
    }
});
exports.listBuyers = listBuyers;
const createBuyer = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId))
            throw new errorHandler_1.AppError('Authentication required', 401);
        if (!req.user.companyId)
            throw new errorHandler_1.AppError('Company ID not found', 400);
        const { name, email, phone, idNumber, budgetMin, budgetMax, prefs } = req.body;
        if (!name)
            throw new errorHandler_1.AppError('Name is required', 400);
        const buyer = yield Buyer_1.Buyer.create({
            name,
            email,
            phone,
            budgetMin: Number(budgetMin || 0),
            budgetMax: Number(budgetMax || 0),
            idNumber: idNumber,
            prefs: prefs || '',
            companyId: req.user.companyId,
            ownerId: req.user.userId
        });
        res.status(201).json({ status: 'success', data: buyer });
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError)
            return res.status(error.statusCode).json({ status: 'error', message: error.message });
        res.status(500).json({ status: 'error', message: 'Failed to create buyer' });
    }
});
exports.createBuyer = createBuyer;
const updateBuyer = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId))
            throw new errorHandler_1.AppError('Authentication required', 401);
        if (!req.user.companyId)
            throw new errorHandler_1.AppError('Company ID not found', 400);
        const { id } = req.params;
        const updates = req.body || {};
        const buyer = yield Buyer_1.Buyer.findOneAndUpdate({ _id: id, companyId: req.user.companyId }, updates, { new: true });
        if (!buyer)
            throw new errorHandler_1.AppError('Buyer not found', 404);
        res.json({ status: 'success', data: buyer });
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError)
            return res.status(error.statusCode).json({ status: 'error', message: error.message });
        res.status(500).json({ status: 'error', message: 'Failed to update buyer' });
    }
});
exports.updateBuyer = updateBuyer;
const deleteBuyer = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId))
            throw new errorHandler_1.AppError('Authentication required', 401);
        if (!req.user.companyId)
            throw new errorHandler_1.AppError('Company ID not found', 400);
        const { id } = req.params;
        const buyer = yield Buyer_1.Buyer.findOneAndDelete({ _id: id, companyId: req.user.companyId });
        if (!buyer)
            throw new errorHandler_1.AppError('Buyer not found', 404);
        res.json({ status: 'success', message: 'Buyer deleted' });
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError)
            return res.status(error.statusCode).json({ status: 'error', message: error.message });
        res.status(500).json({ status: 'error', message: 'Failed to delete buyer' });
    }
});
exports.deleteBuyer = deleteBuyer;
