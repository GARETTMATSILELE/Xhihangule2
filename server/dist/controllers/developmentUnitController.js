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
exports.setUnitBuyer = exports.listUnits = exports.updateUnitStatus = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const errorHandler_1 = require("../middleware/errorHandler");
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
        const { developmentId, status, variationId, page = '1', limit = '50' } = req.query;
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
        const [items, total] = yield Promise.all([
            DevelopmentUnit_1.DevelopmentUnit.find(query)
                .sort({ variationId: 1, unitNumber: 1 })
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .lean(),
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
