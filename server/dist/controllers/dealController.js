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
exports.deleteDeal = exports.updateDeal = exports.createDeal = exports.listDeals = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Deal_1 = require("../models/Deal");
const errorHandler_1 = require("../middleware/errorHandler");
const listDeals = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
        if (req.query.propertyId) {
            query.propertyId = new mongoose_1.default.Types.ObjectId(String(req.query.propertyId));
        }
        const deals = yield Deal_1.Deal.find(query).sort({ createdAt: -1 });
        res.json({ status: 'success', data: deals });
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({ status: 'error', message: error.message });
        }
        res.status(500).json({ status: 'error', message: 'Failed to fetch deals' });
    }
});
exports.listDeals = listDeals;
const createDeal = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId))
            throw new errorHandler_1.AppError('Authentication required', 401);
        if (!req.user.companyId)
            throw new errorHandler_1.AppError('Company ID not found', 400);
        const { propertyId, buyerName, buyerEmail, buyerPhone, stage, offerPrice, closeDate, notes } = req.body;
        if (!propertyId || !buyerName || offerPrice == null) {
            throw new errorHandler_1.AppError('Missing required fields: propertyId, buyerName, offerPrice', 400);
        }
        const deal = yield Deal_1.Deal.create({
            propertyId,
            buyerName,
            buyerEmail,
            buyerPhone,
            stage: stage || 'Offer',
            offerPrice,
            closeDate: closeDate || null,
            notes: notes || '',
            won: false,
            companyId: req.user.companyId,
            ownerId: req.user.userId
        });
        res.status(201).json({ status: 'success', data: deal });
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({ status: 'error', message: error.message });
        }
        res.status(500).json({ status: 'error', message: 'Failed to create deal' });
    }
});
exports.createDeal = createDeal;
const updateDeal = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId))
            throw new errorHandler_1.AppError('Authentication required', 401);
        if (!req.user.companyId)
            throw new errorHandler_1.AppError('Company ID not found', 400);
        const { id } = req.params;
        const updates = req.body || {};
        const deal = yield Deal_1.Deal.findOneAndUpdate({ _id: id, companyId: req.user.companyId }, updates, { new: true });
        if (!deal)
            throw new errorHandler_1.AppError('Deal not found', 404);
        res.json({ status: 'success', data: deal });
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({ status: 'error', message: error.message });
        }
        res.status(500).json({ status: 'error', message: 'Failed to update deal' });
    }
});
exports.updateDeal = updateDeal;
const deleteDeal = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId))
            throw new errorHandler_1.AppError('Authentication required', 401);
        if (!req.user.companyId)
            throw new errorHandler_1.AppError('Company ID not found', 400);
        const { id } = req.params;
        const deal = yield Deal_1.Deal.findOneAndDelete({ _id: id, companyId: req.user.companyId });
        if (!deal)
            throw new errorHandler_1.AppError('Deal not found', 404);
        res.json({ status: 'success', message: 'Deal deleted' });
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({ status: 'error', message: error.message });
        }
        res.status(500).json({ status: 'error', message: 'Failed to delete deal' });
    }
});
exports.deleteDeal = deleteDeal;
