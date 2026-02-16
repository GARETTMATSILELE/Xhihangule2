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
exports.getLeadSuggestedProperties = exports.deleteLead = exports.updateLead = exports.createLead = exports.listLeads = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Lead_1 = require("../models/Lead");
const errorHandler_1 = require("../middleware/errorHandler");
const access_1 = require("../utils/access");
const Buyer_1 = require("../models/Buyer");
const Deal_1 = require("../models/Deal");
const Property_1 = require("../models/Property");
const User_1 = require("../models/User");
const norm = (s) => String(s || '').trim().toLowerCase();
const asNum = (v) => (v == null || v === '' || isNaN(Number(v)) ? undefined : Number(v));
function scorePropertyForLead(lead, p) {
    var _a;
    const reasons = [];
    let score = 0;
    const asking = Number((p === null || p === void 0 ? void 0 : p.price) || (p === null || p === void 0 ? void 0 : p.rent) || 0);
    const leadMin = asNum(lead === null || lead === void 0 ? void 0 : lead.budgetMin);
    const leadMax = asNum(lead === null || lead === void 0 ? void 0 : lead.budgetMax);
    // Budget match
    if (asking > 0 && (leadMin != null || leadMax != null)) {
        const okMin = leadMin == null ? true : asking >= leadMin;
        const okMax = leadMax == null ? true : asking <= leadMax;
        if (okMin && okMax) {
            score += 40;
            reasons.push('Within budget');
        }
    }
    // Suburb / area match (string match against address/name)
    const suburbs = Array.isArray(lead === null || lead === void 0 ? void 0 : lead.preferredSuburbs) ? lead.preferredSuburbs : [];
    if (suburbs.length > 0) {
        const hay = `${(p === null || p === void 0 ? void 0 : p.address) || ''} ${(p === null || p === void 0 ? void 0 : p.name) || ''}`.toLowerCase();
        const hit = suburbs.map((x) => String(x || '').trim()).filter(Boolean).find((s) => hay.includes(s.toLowerCase()));
        if (hit) {
            score += 30;
            reasons.push(`Preferred suburb: ${hit}`);
        }
    }
    // Bedrooms match
    const minBedrooms = asNum(lead === null || lead === void 0 ? void 0 : lead.minBedrooms);
    const pBeds = (_a = asNum(p === null || p === void 0 ? void 0 : p.bedrooms)) !== null && _a !== void 0 ? _a : 0;
    if (minBedrooms != null) {
        if (pBeds >= minBedrooms) {
            score += 20;
            reasons.push(`At least ${minBedrooms} bedrooms`);
        }
    }
    // Property type match
    const leadType = norm(lead === null || lead === void 0 ? void 0 : lead.propertyType);
    const propType = norm(p === null || p === void 0 ? void 0 : p.type);
    if (leadType && propType && leadType === propType) {
        score += 10;
        reasons.push(`Property type: ${p.type}`);
    }
    // Optional feature reasons (no score in Phase 1)
    const wantedFeatures = Array.isArray(lead === null || lead === void 0 ? void 0 : lead.features) ? lead.features : [];
    const amenities = Array.isArray(p === null || p === void 0 ? void 0 : p.amenities) ? p.amenities : [];
    if (wantedFeatures.length > 0 && amenities.length > 0) {
        const amenHay = amenities.map((a) => norm(a));
        const hits = wantedFeatures
            .map((f) => String(f || '').trim())
            .filter(Boolean)
            .filter((f) => amenHay.includes(norm(f)));
        hits.slice(0, 3).forEach((f) => reasons.push(`${f} available`));
    }
    // Clear flag for under offer
    if (String(p === null || p === void 0 ? void 0 : p.status) === 'under_offer') {
        reasons.push('Under Offer');
    }
    return { score: Math.max(0, Math.min(100, score)), reasons };
}
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
        const { name, source, interest, email, phone, status, notes, budgetMin, budgetMax, preferredSuburbs, propertyType, minBedrooms, features } = req.body;
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
            budgetMin: budgetMin != null && !isNaN(Number(budgetMin)) ? Number(budgetMin) : undefined,
            budgetMax: budgetMax != null && !isNaN(Number(budgetMax)) ? Number(budgetMax) : undefined,
            preferredSuburbs: Array.isArray(preferredSuburbs)
                ? preferredSuburbs.map((s) => String(s || '').trim()).filter(Boolean)
                : (typeof preferredSuburbs === 'string'
                    ? preferredSuburbs.split(',').map((s) => s.trim()).filter(Boolean)
                    : undefined),
            propertyType: propertyType ? String(propertyType) : undefined,
            minBedrooms: minBedrooms != null && !isNaN(Number(minBedrooms)) ? Number(minBedrooms) : undefined,
            features: Array.isArray(features) ? features.map((f) => String(f || '').trim()).filter(Boolean) : undefined,
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
        // Normalize optional requirement fields if present
        if ('budgetMin' in updates) {
            updates.budgetMin = updates.budgetMin != null && !isNaN(Number(updates.budgetMin)) ? Number(updates.budgetMin) : undefined;
        }
        if ('budgetMax' in updates) {
            updates.budgetMax = updates.budgetMax != null && !isNaN(Number(updates.budgetMax)) ? Number(updates.budgetMax) : undefined;
        }
        if ('minBedrooms' in updates) {
            updates.minBedrooms = updates.minBedrooms != null && !isNaN(Number(updates.minBedrooms)) ? Number(updates.minBedrooms) : undefined;
        }
        if ('preferredSuburbs' in updates) {
            updates.preferredSuburbs = Array.isArray(updates.preferredSuburbs)
                ? updates.preferredSuburbs.map((s) => String(s || '').trim()).filter(Boolean)
                : (typeof updates.preferredSuburbs === 'string'
                    ? updates.preferredSuburbs.split(',').map((s) => s.trim()).filter(Boolean)
                    : undefined);
        }
        if ('features' in updates) {
            updates.features = Array.isArray(updates.features)
                ? updates.features.map((f) => String(f || '').trim()).filter(Boolean)
                : undefined;
        }
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
                    // If we have a valid propertyId, also set Property.buyerId for deterministic lookup.
                    if (propertyId && mongoose_1.default.Types.ObjectId.isValid(String(propertyId))) {
                        const propObjectId = new mongoose_1.default.Types.ObjectId(String(propertyId));
                        yield Property_1.Property.updateOne({ _id: propObjectId, companyId: req.user.companyId }, { $set: { buyerId: buyer._id } });
                        yield Buyer_1.Buyer.updateMany({ companyId: req.user.companyId, propertyId: propObjectId, _id: { $ne: buyer._id } }, { $unset: { propertyId: '' } });
                    }
                }
                else if (propertyId) {
                    // Attach/update property link and ensure Property.buyerId is set for payments.
                    if (mongoose_1.default.Types.ObjectId.isValid(String(propertyId))) {
                        const propObjectId = new mongoose_1.default.Types.ObjectId(String(propertyId));
                        buyer.propertyId = propObjectId;
                        // Fill missing fields where possible (do not overwrite existing values)
                        if (!buyer.email && lead.email)
                            buyer.email = lead.email;
                        if (!buyer.phone && lead.phone)
                            buyer.phone = lead.phone;
                        if (!buyer.name && lead.name)
                            buyer.name = lead.name;
                        yield buyer.save();
                        yield Property_1.Property.updateOne({ _id: propObjectId, companyId: req.user.companyId }, { $set: { buyerId: buyer._id } });
                        yield Buyer_1.Buyer.updateMany({ companyId: req.user.companyId, propertyId: propObjectId, _id: { $ne: buyer._id } }, { $unset: { propertyId: '' } });
                    }
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
const getLeadSuggestedProperties = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId))
            throw new errorHandler_1.AppError('Authentication required', 401);
        if (!req.user.companyId)
            throw new errorHandler_1.AppError('Company ID not found', 400);
        const { id } = req.params;
        const leadQuery = { _id: id, companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId) };
        if (!(0, access_1.hasAnyRole)(req, ['admin', 'accountant'])) {
            leadQuery.ownerId = new mongoose_1.default.Types.ObjectId(req.user.userId);
        }
        const lead = yield Lead_1.Lead.findOne(leadQuery).lean();
        if (!lead)
            throw new errorHandler_1.AppError('Lead not found', 404);
        const includeUnderOffer = String(((_b = req.query) === null || _b === void 0 ? void 0 : _b.includeUnderOffer) || '1') !== '0';
        const statusFilter = includeUnderOffer ? ['available', 'under_offer'] : ['available'];
        const props = yield Property_1.Property.find({
            companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId),
            rentalType: 'sale',
            status: { $in: statusFilter }
        })
            .select('_id name address price status bedrooms type amenities ownerId')
            .lean();
        const scored = (props || [])
            .map((p) => {
            const { score, reasons } = scorePropertyForLead(lead, p);
            return { p, score, reasons };
        })
            .filter((x) => x.score >= 60)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);
        const listingAgentIds = Array.from(new Set(scored
            .map((x) => { var _a; return String(((_a = x === null || x === void 0 ? void 0 : x.p) === null || _a === void 0 ? void 0 : _a.ownerId) || ''); })
            .filter(Boolean)
            .filter((oid) => oid !== String(lead === null || lead === void 0 ? void 0 : lead.ownerId))));
        const agents = listingAgentIds.length
            ? yield User_1.User.find({ _id: { $in: listingAgentIds.map((x) => new mongoose_1.default.Types.ObjectId(x)) }, companyId: req.user.companyId })
                .select('_id firstName lastName email')
                .lean()
            : [];
        const agentById = {};
        (agents || []).forEach((u) => {
            agentById[String(u._id)] = u;
        });
        const suggestions = scored.map(({ p, score, reasons }) => {
            const ownerId = String((p === null || p === void 0 ? void 0 : p.ownerId) || '');
            const agent = ownerId ? agentById[ownerId] : undefined;
            const listingAgent = ownerId && ownerId !== String(lead === null || lead === void 0 ? void 0 : lead.ownerId) && agent
                ? { id: ownerId, name: `${agent.firstName || ''} ${agent.lastName || ''}`.trim() || agent.email || 'Agent' }
                : undefined;
            return {
                property: {
                    _id: p._id,
                    name: p.name,
                    address: p.address,
                    price: p.price,
                    status: p.status,
                    bedrooms: p.bedrooms,
                    type: p.type,
                    ownerId: p.ownerId
                },
                score,
                reasons,
                listingAgent
            };
        });
        res.json({ status: 'success', data: { leadId: id, suggestions } });
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError)
            return res.status(error.statusCode).json({ status: 'error', message: error.message });
        res.status(500).json({ status: 'error', message: 'Failed to fetch suggested properties' });
    }
});
exports.getLeadSuggestedProperties = getLeadSuggestedProperties;
