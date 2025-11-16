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
exports.removeUnitCollaborator = exports.addUnitCollaborator = exports.updateUnitDetails = exports.setUnitBuyer = exports.listUnits = exports.updateUnitStatus = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const errorHandler_1 = require("../middleware/errorHandler");
const access_1 = require("../utils/access");
const Development_1 = require("../models/Development");
const DevelopmentUnit_1 = require("../models/DevelopmentUnit");
const Buyer_1 = require("../models/Buyer");
const ensureAuthCompany = (req) => {
    var _a, _b;
    if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
        throw new errorHandler_1.AppError('Authentication required', 401);
    }
    if (!((_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId)) {
        throw new errorHandler_1.AppError('Company ID not found. Please ensure you are associated with a company.', 400);
    }
};
const updateUnitStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        ensureAuthCompany(req);
        const { unitId } = req.params;
        const { to, reservationMinutes, dealId, buyerId } = req.body || {};
        const allowed = ['available', 'under_offer', 'sold'];
        if (!allowed.includes(String(to))) {
            throw new errorHandler_1.AppError('Invalid status', 400);
        }
        const unit = yield DevelopmentUnit_1.DevelopmentUnit.findById(unitId).lean();
        if (!unit)
            throw new errorHandler_1.AppError('Unit not found', 404);
        // Ensure unit belongs to a development within user's company
        const dev = yield Development_1.Development.findById(unit.developmentId).lean();
        if (!dev || String(dev.companyId) !== String(req.user.companyId)) {
            throw new errorHandler_1.AppError('Forbidden', 403);
        }
        const now = new Date();
        const expires = reservationMinutes ? new Date(now.getTime() + Number(reservationMinutes) * 60000) : undefined;
        let buyerPatch = {};
        if (to === 'sold' && buyerId) {
            const buyer = yield Buyer_1.Buyer.findOne({ _id: buyerId, companyId: req.user.companyId }).lean();
            if (buyer)
                buyerPatch = { buyerId: buyer._id, buyerName: buyer.name };
        }
        const update = {
            $set: Object.assign({ status: to, reservationExpiresAt: to === 'under_offer' ? expires : undefined, reservedAt: to === 'under_offer' ? now : undefined, reservedBy: to === 'under_offer' ? new mongoose_1.default.Types.ObjectId(req.user.userId) : undefined, soldAt: to === 'sold' ? now : undefined, dealId: to === 'sold' && dealId ? new mongoose_1.default.Types.ObjectId(dealId) : undefined }, buyerPatch),
            $push: {
                statusHistory: {
                    from: unit.status,
                    to,
                    at: now,
                    by: new mongoose_1.default.Types.ObjectId(req.user.userId)
                }
            }
        };
        // Guard against race conditions using precondition
        const updated = yield DevelopmentUnit_1.DevelopmentUnit.findOneAndUpdate({ _id: unitId, status: unit.status }, update, { new: true });
        if (!updated) {
            throw new errorHandler_1.AppError('Status changed by another process. Please retry.', 409);
        }
        // Update development cached stats asynchronously (no need to await)
        try {
            const pipeline = [
                { $match: { developmentId: updated.developmentId } },
                { $group: { _id: '$status', count: { $sum: 1 } } }
            ];
            const result = yield DevelopmentUnit_1.DevelopmentUnit.aggregate(pipeline);
            const counts = {};
            for (const r of result)
                counts[r._id] = r.count;
            const totalUnits = (counts['available'] || 0) + (counts['under_offer'] || 0) + (counts['sold'] || 0);
            yield Development_1.Development.updateOne({ _id: updated.developmentId }, {
                $set: {
                    'cachedStats.totalUnits': totalUnits,
                    'cachedStats.availableUnits': counts['available'] || 0,
                    'cachedStats.underOfferUnits': counts['under_offer'] || 0,
                    'cachedStats.soldUnits': counts['sold'] || 0
                }
            });
        }
        catch (_a) { }
        return res.json(updated);
    }
    catch (error) {
        const status = (error === null || error === void 0 ? void 0 : error.statusCode) || 500;
        const message = (error === null || error === void 0 ? void 0 : error.message) || 'Error updating unit status';
        return res.status(status).json({ message });
    }
});
exports.updateUnitStatus = updateUnitStatus;
const listUnits = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        ensureAuthCompany(req);
        const { developmentId, status, variationId, page = '1', limit = '50', requireBuyer, fields } = req.query;
        if (!developmentId)
            throw new errorHandler_1.AppError('developmentId is required', 400);
        // Ensure development belongs to company
        const dev = yield Development_1.Development.findById(developmentId).lean();
        if (!dev || String(dev.companyId) !== String(req.user.companyId))
            throw new errorHandler_1.AppError('Forbidden', 403);
        const pageNum = Math.max(1, Number(page) || 1);
        const limitNum = Math.max(1, Math.min(200, Number(limit) || 50));
        const query = { developmentId: new mongoose_1.default.Types.ObjectId(developmentId) };
        if (status)
            query.status = String(status);
        if (variationId)
            query.variationId = String(variationId);
        // Optionally require a buyer and sold status
        const mustRequireBuyer = String(requireBuyer || '').toLowerCase() === 'true';
        if (mustRequireBuyer) {
            query.status = 'sold';
            query.$or = [
                { buyerName: { $exists: true, $type: 'string', $ne: '' } },
                { buyerId: { $exists: true } }
            ];
        }
        // Restrict to unit collaborators when user is sales and not dev owner/collaborator
        const isPrivileged = (0, access_1.hasAnyRole)(req, ['admin', 'accountant']);
        const isOwner = String(dev.createdBy) === String(req.user.userId);
        const isDevCollaborator = Array.isArray(dev.collaborators) && dev.collaborators.some((id) => String(id) === String(req.user.userId));
        if (!isPrivileged && !isOwner && !isDevCollaborator) {
            query.collaborators = new mongoose_1.default.Types.ObjectId(req.user.userId);
        }
        const selectFields = typeof fields === 'string'
            ? String(fields).split(',').map((s) => s.trim()).filter(Boolean).join(' ')
            : undefined;
        const [items, total] = yield Promise.all([
            (() => {
                let q = DevelopmentUnit_1.DevelopmentUnit.find(query)
                    .sort({ variationId: 1, unitNumber: 1 })
                    .skip((pageNum - 1) * limitNum)
                    .limit(limitNum);
                if (selectFields)
                    q = q.select(selectFields);
                return q.lean();
            })(),
            DevelopmentUnit_1.DevelopmentUnit.countDocuments(query)
        ]);
        return res.json({ items, total, page: pageNum, limit: limitNum });
    }
    catch (error) {
        const status = (error === null || error === void 0 ? void 0 : error.statusCode) || 500;
        const message = (error === null || error === void 0 ? void 0 : error.message) || 'Error fetching units';
        return res.status(status).json({ message });
    }
});
exports.listUnits = listUnits;
const setUnitBuyer = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        ensureAuthCompany(req);
        const { unitId } = req.params;
        const { buyerId } = req.body || {};
        if (!buyerId || !mongoose_1.default.Types.ObjectId.isValid(String(buyerId)))
            throw new errorHandler_1.AppError('buyerId is required', 400);
        const unit = yield DevelopmentUnit_1.DevelopmentUnit.findById(unitId).lean();
        if (!unit)
            throw new errorHandler_1.AppError('Unit not found', 404);
        // Ensure unit belongs to the company
        const dev = yield Development_1.Development.findById(unit.developmentId).lean();
        if (!dev || String(dev.companyId) !== String(req.user.companyId))
            throw new errorHandler_1.AppError('Forbidden', 403);
        const buyer = yield Buyer_1.Buyer.findOne({ _id: buyerId, companyId: req.user.companyId }).lean();
        if (!buyer)
            throw new errorHandler_1.AppError('Buyer not found', 404);
        const updated = yield DevelopmentUnit_1.DevelopmentUnit.findByIdAndUpdate(unitId, { $set: { buyerId: buyer._id, buyerName: buyer.name } }, { new: true });
        return res.json({ status: 'success', data: updated });
    }
    catch (error) {
        const status = (error === null || error === void 0 ? void 0 : error.statusCode) || 500;
        const message = (error === null || error === void 0 ? void 0 : error.message) || 'Error setting unit buyer';
        return res.status(status).json({ message });
    }
});
exports.setUnitBuyer = setUnitBuyer;
const updateUnitDetails = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        ensureAuthCompany(req);
        const { unitId } = req.params;
        const unit = yield DevelopmentUnit_1.DevelopmentUnit.findById(unitId).lean();
        if (!unit)
            throw new errorHandler_1.AppError('Unit not found', 404);
        const dev = yield Development_1.Development.findById(unit.developmentId).lean();
        if (!dev || String(dev.companyId) !== String(req.user.companyId))
            throw new errorHandler_1.AppError('Forbidden', 403);
        // Only admin/accountant or development owner/collaborator can edit details
        const isPrivileged = (0, access_1.hasAnyRole)(req, ['admin', 'accountant']);
        const isOwner = String(dev.createdBy) === String(req.user.userId);
        const isDevCollaborator = Array.isArray(dev.collaborators) && dev.collaborators.some((id) => String(id) === String(req.user.userId));
        if (!isPrivileged && !isOwner && !isDevCollaborator)
            throw new errorHandler_1.AppError('Not allowed to modify this unit', 403);
        const body = req.body || {};
        const setOps = {};
        if (typeof body.unitCode === 'string')
            setOps.unitCode = String(body.unitCode).trim();
        if (typeof body.price === 'number')
            setOps.price = Number(body.price);
        if (body.meta && typeof body.meta === 'object') {
            const meta = {};
            if (typeof body.meta.block === 'string')
                meta.block = String(body.meta.block).trim();
            if (typeof body.meta.floor === 'string')
                meta.floor = String(body.meta.floor).trim();
            if (typeof body.meta.bedrooms === 'number')
                meta.bedrooms = Number(body.meta.bedrooms);
            if (typeof body.meta.bathrooms === 'number')
                meta.bathrooms = Number(body.meta.bathrooms);
            if (typeof body.meta.standSize === 'number')
                meta.standSize = Number(body.meta.standSize);
            setOps.meta = meta;
        }
        if (Object.keys(setOps).length === 0)
            return res.json(yield DevelopmentUnit_1.DevelopmentUnit.findById(unitId).lean());
        const updated = yield DevelopmentUnit_1.DevelopmentUnit.findByIdAndUpdate(unitId, { $set: setOps }, { new: true }).lean();
        return res.json(updated);
    }
    catch (error) {
        const status = (error === null || error === void 0 ? void 0 : error.statusCode) || 500;
        const message = (error === null || error === void 0 ? void 0 : error.message) || 'Error updating unit';
        return res.status(status).json({ message });
    }
});
exports.updateUnitDetails = updateUnitDetails;
const addUnitCollaborator = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        ensureAuthCompany(req);
        const { unitId } = req.params;
        const { userId } = req.body || {};
        if (!userId || !mongoose_1.default.Types.ObjectId.isValid(String(userId)))
            throw new errorHandler_1.AppError('Invalid userId', 400);
        const unit = yield DevelopmentUnit_1.DevelopmentUnit.findById(unitId).lean();
        if (!unit)
            throw new errorHandler_1.AppError('Unit not found', 404);
        const dev = yield Development_1.Development.findById(unit.developmentId).lean();
        if (!dev || String(dev.companyId) !== String(req.user.companyId))
            throw new errorHandler_1.AppError('Forbidden', 403);
        // Only admin/accountant or development owner can add unit collaborators
        const isPrivileged = (0, access_1.hasAnyRole)(req, ['admin', 'accountant']);
        const isOwner = String(dev.createdBy) === String(req.user.userId);
        if (!isPrivileged && !isOwner)
            throw new errorHandler_1.AppError('Only development owner or admin can add unit collaborators', 403);
        yield DevelopmentUnit_1.DevelopmentUnit.updateOne({ _id: unitId }, { $addToSet: { collaborators: new mongoose_1.default.Types.ObjectId(String(userId)) } });
        const updated = yield DevelopmentUnit_1.DevelopmentUnit.findById(unitId).lean();
        return res.json(updated);
    }
    catch (error) {
        const status = (error === null || error === void 0 ? void 0 : error.statusCode) || 500;
        const message = (error === null || error === void 0 ? void 0 : error.message) || 'Error adding unit collaborator';
        return res.status(status).json({ message });
    }
});
exports.addUnitCollaborator = addUnitCollaborator;
const removeUnitCollaborator = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        ensureAuthCompany(req);
        const { unitId } = req.params;
        const { userId } = req.body || {};
        if (!userId || !mongoose_1.default.Types.ObjectId.isValid(String(userId)))
            throw new errorHandler_1.AppError('Invalid userId', 400);
        const unit = yield DevelopmentUnit_1.DevelopmentUnit.findById(unitId).lean();
        if (!unit)
            throw new errorHandler_1.AppError('Unit not found', 404);
        const dev = yield Development_1.Development.findById(unit.developmentId).lean();
        if (!dev || String(dev.companyId) !== String(req.user.companyId))
            throw new errorHandler_1.AppError('Forbidden', 403);
        const isPrivileged = (0, access_1.hasAnyRole)(req, ['admin', 'accountant']);
        const isOwner = String(dev.createdBy) === String(req.user.userId);
        if (!isPrivileged && !isOwner)
            throw new errorHandler_1.AppError('Only development owner or admin can remove unit collaborators', 403);
        yield DevelopmentUnit_1.DevelopmentUnit.updateOne({ _id: unitId }, { $pull: { collaborators: new mongoose_1.default.Types.ObjectId(String(userId)) } });
        const updated = yield DevelopmentUnit_1.DevelopmentUnit.findById(unitId).lean();
        return res.json(updated);
    }
    catch (error) {
        const status = (error === null || error === void 0 ? void 0 : error.statusCode) || 500;
        const message = (error === null || error === void 0 ? void 0 : error.message) || 'Error removing unit collaborator';
        return res.status(status).json({ message });
    }
});
exports.removeUnitCollaborator = removeUnitCollaborator;
