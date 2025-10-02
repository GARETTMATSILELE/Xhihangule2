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
exports.deleteLead = exports.updateLead = exports.createLead = exports.listLeads = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Lead_1 = require("../models/Lead");
const errorHandler_1 = require("../middleware/errorHandler");
const listLeads = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
        const leads = yield Lead_1.Lead.find(query).sort({ createdAt: -1 });
        res.json({ status: 'success', data: leads });
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError)
            return res.status(error.statusCode).json({ status: 'error', message: error.message });
        res.status(500).json({ status: 'error', message: 'Failed to fetch leads' });
    }
});
exports.listLeads = listLeads;
const createLead = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId))
            throw new errorHandler_1.AppError('Authentication required', 401);
        if (!req.user.companyId)
            throw new errorHandler_1.AppError('Company ID not found', 400);
        const { name, source, interest, email, phone, status, notes } = req.body;
        if (!name)
            throw new errorHandler_1.AppError('Name is required', 400);
        const lead = yield Lead_1.Lead.create({
            name,
            source: source || '',
            interest: interest || '',
            notes: notes || '',
            email,
            phone,
            status: status || 'New',
            companyId: req.user.companyId,
            ownerId: req.user.userId
        });
        res.status(201).json({ status: 'success', data: lead });
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError)
            return res.status(error.statusCode).json({ status: 'error', message: error.message });
        res.status(500).json({ status: 'error', message: 'Failed to create lead' });
    }
});
exports.createLead = createLead;
const updateLead = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId))
            throw new errorHandler_1.AppError('Authentication required', 401);
        if (!req.user.companyId)
            throw new errorHandler_1.AppError('Company ID not found', 400);
        const { id } = req.params;
        const updates = req.body || {};
        const lead = yield Lead_1.Lead.findOneAndUpdate({ _id: id, companyId: req.user.companyId }, updates, { new: true });
        if (!lead)
            throw new errorHandler_1.AppError('Lead not found', 404);
        res.json({ status: 'success', data: lead });
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError)
            return res.status(error.statusCode).json({ status: 'error', message: error.message });
        res.status(500).json({ status: 'error', message: 'Failed to update lead' });
    }
});
exports.updateLead = updateLead;
const deleteLead = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId))
            throw new errorHandler_1.AppError('Authentication required', 401);
        if (!req.user.companyId)
            throw new errorHandler_1.AppError('Company ID not found', 400);
        const { id } = req.params;
        const lead = yield Lead_1.Lead.findOneAndDelete({ _id: id, companyId: req.user.companyId });
        if (!lead)
            throw new errorHandler_1.AppError('Lead not found', 404);
        res.json({ status: 'success', message: 'Lead deleted' });
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError)
            return res.status(error.statusCode).json({ status: 'error', message: error.message });
        res.status(500).json({ status: 'error', message: 'Failed to delete lead' });
    }
});
exports.deleteLead = deleteLead;
