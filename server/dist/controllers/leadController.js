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
const access_1 = require("../utils/access");
const Buyer_1 = require("../models/Buyer");
const Deal_1 = require("../models/Deal");
const listLeads = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId))
            throw new errorHandler_1.AppError('Authentication required', 401);
        if (!req.user.companyId)
            throw new errorHandler_1.AppError('Company ID not found', 400);
        const query = { companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId) };
        if (!(0, access_1.hasAnyRole)(req, ['admin', 'accountant'])) {
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
        const prev = yield Lead_1.Lead.findOne({ _id: id, companyId: req.user.companyId });
        const lead = yield Lead_1.Lead.findOneAndUpdate({ _id: id, companyId: req.user.companyId }, updates, { new: true });
        if (!lead)
            throw new errorHandler_1.AppError('Lead not found', 404);
        // If lead transitioned to Won, create a Buyer record tied to a property
        try {
            const becameWon = ((updates === null || updates === void 0 ? void 0 : updates.status) === 'Won') || ((prev === null || prev === void 0 ? void 0 : prev.status) !== 'Won' && lead.status === 'Won');
            if (becameWon) {
                // Determine propertyId: prefer explicit from request; fallback to a deal linked to this lead
                let propertyId = updates === null || updates === void 0 ? void 0 : updates.propertyId;
                if (!propertyId) {
                    const deal = yield Deal_1.Deal.findOne({ leadId: lead._id, companyId: req.user.companyId }).sort({ createdAt: -1 }).lean();
                    if (deal)
                        propertyId = String(deal.propertyId);
                }
                // Upsert buyer by email/phone/name within company
                const query = { companyId: req.user.companyId };
                if (lead.email)
                    query.email = lead.email;
                else if (lead.phone)
                    query.phone = lead.phone;
                else
                    query.name = lead.name;
                let buyer = yield Buyer_1.Buyer.findOne(query);
                if (!buyer) {
                    buyer = yield Buyer_1.Buyer.create({
                        name: lead.name,
                        email: lead.email,
                        phone: lead.phone,
                        prefs: lead.interest || '',
                        propertyId: propertyId,
                        companyId: req.user.companyId,
                        ownerId: req.user.userId
                    });
                }
                else if (propertyId && !buyer.propertyId) {
                    // Attach property if not already set
                    buyer.propertyId = new mongoose_1.default.Types.ObjectId(propertyId);
                    yield buyer.save();
                }
            }
        }
        catch (e) {
            // Non-fatal: log and continue
            console.warn('Lead->Buyer sync failed:', e);
        }
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
