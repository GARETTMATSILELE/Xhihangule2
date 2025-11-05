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
exports.deleteViewing = exports.updateViewing = exports.createViewing = exports.listViewings = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Viewing_1 = require("../models/Viewing");
const errorHandler_1 = require("../middleware/errorHandler");
const listViewings = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
        const viewings = yield Viewing_1.Viewing.find(query).sort({ when: 1 });
        res.json({ status: 'success', data: viewings });
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError)
            return res.status(error.statusCode).json({ status: 'error', message: error.message });
        res.status(500).json({ status: 'error', message: 'Failed to fetch viewings' });
    }
});
exports.listViewings = listViewings;
const createViewing = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId))
            throw new errorHandler_1.AppError('Authentication required', 401);
        if (!req.user.companyId)
            throw new errorHandler_1.AppError('Company ID not found', 400);
        const { propertyId, buyerId, leadId, when, status, notes } = req.body;
        if (!propertyId || !when)
            throw new errorHandler_1.AppError('propertyId and when are required', 400);
        const viewing = yield Viewing_1.Viewing.create({
            propertyId,
            buyerId: buyerId || undefined,
            leadId: leadId || undefined,
            when: new Date(when),
            status: status || 'Scheduled',
            notes: notes || '',
            companyId: req.user.companyId,
            ownerId: req.user.userId
        });
        res.status(201).json({ status: 'success', data: viewing });
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError)
            return res.status(error.statusCode).json({ status: 'error', message: error.message });
        res.status(500).json({ status: 'error', message: 'Failed to create viewing' });
    }
});
exports.createViewing = createViewing;
const updateViewing = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId))
            throw new errorHandler_1.AppError('Authentication required', 401);
        if (!req.user.companyId)
            throw new errorHandler_1.AppError('Company ID not found', 400);
        const { id } = req.params;
        const updates = req.body || {};
        const viewing = yield Viewing_1.Viewing.findOneAndUpdate({ _id: id, companyId: req.user.companyId }, updates, { new: true });
        if (!viewing)
            throw new errorHandler_1.AppError('Viewing not found', 404);
        res.json({ status: 'success', data: viewing });
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError)
            return res.status(error.statusCode).json({ status: 'error', message: error.message });
        res.status(500).json({ status: 'error', message: 'Failed to update viewing' });
    }
});
exports.updateViewing = updateViewing;
const deleteViewing = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId))
            throw new errorHandler_1.AppError('Authentication required', 401);
        if (!req.user.companyId)
            throw new errorHandler_1.AppError('Company ID not found', 400);
        const { id } = req.params;
        const viewing = yield Viewing_1.Viewing.findOneAndDelete({ _id: id, companyId: req.user.companyId });
        if (!viewing)
            throw new errorHandler_1.AppError('Viewing not found', 404);
        res.json({ status: 'success', message: 'Viewing deleted' });
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError)
            return res.status(error.statusCode).json({ status: 'error', message: error.message });
        res.status(500).json({ status: 'error', message: 'Failed to delete viewing' });
    }
});
exports.deleteViewing = deleteViewing;
