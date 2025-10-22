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
exports.recomputeStats = exports.listPaymentsForDevelopment = exports.listUnitsForDevelopment = exports.deleteDevelopment = exports.updateDevelopment = exports.getDevelopment = exports.removeCollaborator = exports.addCollaborator = exports.listDevelopments = exports.createDevelopment = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const errorHandler_1 = require("../middleware/errorHandler");
const Development_1 = require("../models/Development");
const DevelopmentUnit_1 = require("../models/DevelopmentUnit");
const Payment_1 = require("../models/Payment");
const ensureAuthCompany = (req) => {
    var _a, _b;
    if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
        throw new errorHandler_1.AppError('Authentication required', 401);
    }
    if (!((_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId)) {
        throw new errorHandler_1.AppError('Company ID not found. Please ensure you are associated with a company.', 400);
    }
};
const recalcCachedStats = (developmentId) => __awaiter(void 0, void 0, void 0, function* () {
    const pipeline = [
        { $match: { developmentId } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
    ];
    const result = yield DevelopmentUnit_1.DevelopmentUnit.aggregate(pipeline);
    const counts = {};
    for (const r of result)
        counts[r._id] = r.count;
    const totalUnits = (counts['available'] || 0) + (counts['under_offer'] || 0) + (counts['sold'] || 0);
    yield Development_1.Development.updateOne({ _id: developmentId }, {
        $set: {
            'cachedStats.totalUnits': totalUnits,
            'cachedStats.availableUnits': counts['available'] || 0,
            'cachedStats.underOfferUnits': counts['under_offer'] || 0,
            'cachedStats.soldUnits': counts['sold'] || 0
        }
    });
});
const createDevelopment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        ensureAuthCompany(req);
        const { name, type, description, address, owner, variations, commissionPercent, commissionPreaPercent, commissionAgencyPercentRemaining, commissionAgentPercentRemaining } = req.body || {};
        if (!name || !type) {
            throw new errorHandler_1.AppError('Missing required fields: name and type', 400);
        }
        const allowedTypes = ['stands', 'apartments', 'houses', 'semidetached', 'townhouses', 'land'];
        if (!allowedTypes.includes(String(type))) {
            throw new errorHandler_1.AppError('Invalid development type', 400);
        }
        if (!Array.isArray(variations) || variations.length === 0) {
            throw new errorHandler_1.AppError('At least one variation is required', 400);
        }
        // Basic validation of variations
        for (const v of variations) {
            if (!(v === null || v === void 0 ? void 0 : v.id) || !(v === null || v === void 0 ? void 0 : v.label) || !(v === null || v === void 0 ? void 0 : v.count) || v.count < 1) {
                throw new errorHandler_1.AppError('Each variation must include id, label, and count >= 1', 400);
            }
        }
        // Helper: create without transaction (for standalone MongoDB)
        const createWithoutTransaction = () => __awaiter(void 0, void 0, void 0, function* () {
            const dev = yield Development_1.Development.create({
                name,
                type,
                description: description || '',
                address: address || '',
                companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId),
                owner: owner || {},
                variations,
                commissionPercent: typeof commissionPercent === 'number' ? commissionPercent : undefined,
                commissionPreaPercent: typeof commissionPreaPercent === 'number' ? commissionPreaPercent : undefined,
                commissionAgencyPercentRemaining: typeof commissionAgencyPercentRemaining === 'number' ? commissionAgencyPercentRemaining : undefined,
                commissionAgentPercentRemaining: typeof commissionAgentPercentRemaining === 'number' ? commissionAgentPercentRemaining : undefined,
                createdBy: new mongoose_1.default.Types.ObjectId(req.user.userId),
                updatedBy: new mongoose_1.default.Types.ObjectId(req.user.userId)
            });
            const unitDocs = [];
            for (const v of variations) {
                for (let i = 1; i <= Number(v.count); i++) {
                    unitDocs.push({
                        developmentId: dev._id,
                        variationId: v.id,
                        unitNumber: i,
                        status: 'available',
                        price: typeof v.price === 'number' ? v.price : undefined
                    });
                }
            }
            if (unitDocs.length > 0)
                yield DevelopmentUnit_1.DevelopmentUnit.insertMany(unitDocs);
            yield Development_1.Development.updateOne({ _id: dev._id }, {
                $set: {
                    'cachedStats.totalUnits': unitDocs.length,
                    'cachedStats.availableUnits': unitDocs.length,
                    'cachedStats.underOfferUnits': 0,
                    'cachedStats.soldUnits': 0
                }
            });
            const created = yield Development_1.Development.findById(dev._id).lean();
            return res.status(201).json(created);
        });
        // Try transaction first; if not supported, fallback
        try {
            const session = yield mongoose_1.default.startSession();
            session.startTransaction();
            try {
                const development = yield Development_1.Development.create([
                    {
                        name,
                        type,
                        description: description || '',
                        address: address || '',
                        companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId),
                        owner: owner || {},
                        variations,
                        commissionPercent: typeof commissionPercent === 'number' ? commissionPercent : undefined,
                        commissionPreaPercent: typeof commissionPreaPercent === 'number' ? commissionPreaPercent : undefined,
                        commissionAgencyPercentRemaining: typeof commissionAgencyPercentRemaining === 'number' ? commissionAgencyPercentRemaining : undefined,
                        commissionAgentPercentRemaining: typeof commissionAgentPercentRemaining === 'number' ? commissionAgentPercentRemaining : undefined,
                        createdBy: new mongoose_1.default.Types.ObjectId(req.user.userId),
                        updatedBy: new mongoose_1.default.Types.ObjectId(req.user.userId)
                    }
                ], { session });
                const dev = development[0];
                const unitDocs = [];
                for (const v of variations) {
                    for (let i = 1; i <= Number(v.count); i++) {
                        unitDocs.push({
                            developmentId: dev._id,
                            variationId: v.id,
                            unitNumber: i,
                            status: 'available',
                            price: typeof v.price === 'number' ? v.price : undefined
                        });
                    }
                }
                if (unitDocs.length > 0)
                    yield DevelopmentUnit_1.DevelopmentUnit.insertMany(unitDocs, { session });
                yield Development_1.Development.updateOne({ _id: dev._id }, {
                    $set: {
                        'cachedStats.totalUnits': unitDocs.length,
                        'cachedStats.availableUnits': unitDocs.length,
                        'cachedStats.underOfferUnits': 0,
                        'cachedStats.soldUnits': 0
                    }
                }, { session });
                yield session.commitTransaction();
                session.endSession();
                const created = yield Development_1.Development.findById(dev._id).lean();
                return res.status(201).json(created);
            }
            catch (txErr) {
                yield session.abortTransaction();
                session.endSession();
                // Fallback on transaction-not-supported
                const msg = String((txErr === null || txErr === void 0 ? void 0 : txErr.message) || '').toLowerCase();
                if (msg.includes('transaction numbers are only allowed') || msg.includes('replica set')) {
                    return yield createWithoutTransaction();
                }
                throw txErr;
            }
        }
        catch (outer) {
            // If session start failed, fallback
            return yield createWithoutTransaction();
        }
    }
    catch (error) {
        const status = (error === null || error === void 0 ? void 0 : error.statusCode) || 500;
        const message = (error === null || error === void 0 ? void 0 : error.message) || 'Error creating development';
        return res.status(status).json({ message });
    }
});
exports.createDevelopment = createDevelopment;
const listDevelopments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        ensureAuthCompany(req);
        const userId = new mongoose_1.default.Types.ObjectId(req.user.userId);
        const companyId = new mongoose_1.default.Types.ObjectId(req.user.companyId);
        // Sales users see developments they created OR those shared with them as collaborators.
        // Admin/accountant see all company developments.
        const match = (req.user.role === 'admin' || req.user.role === 'accountant')
            ? { companyId }
            : { companyId, $or: [{ createdBy: userId }, { collaborators: userId }] };
        const developments = yield Development_1.Development.find(match)
            .sort({ createdAt: -1 })
            .lean();
        return res.json(developments);
    }
    catch (error) {
        const status = (error === null || error === void 0 ? void 0 : error.statusCode) || 500;
        const message = (error === null || error === void 0 ? void 0 : error.message) || 'Error fetching developments';
        return res.status(status).json({ message });
    }
});
exports.listDevelopments = listDevelopments;
const addCollaborator = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        ensureAuthCompany(req);
        const dev = yield Development_1.Development.findOne({ _id: req.params.id, companyId: req.user.companyId });
        if (!dev)
            throw new errorHandler_1.AppError('Development not found', 404);
        const { userId } = req.body || {};
        if (!userId || !mongoose_1.default.Types.ObjectId.isValid(String(userId)))
            throw new errorHandler_1.AppError('Invalid userId', 400);
        const uid = new mongoose_1.default.Types.ObjectId(String(userId));
        yield Development_1.Development.updateOne({ _id: dev._id }, { $addToSet: { collaborators: uid }, $set: { updatedBy: req.user.userId } });
        const updated = yield Development_1.Development.findById(dev._id).lean();
        return res.json(updated);
    }
    catch (error) {
        const status = (error === null || error === void 0 ? void 0 : error.statusCode) || 500;
        const message = (error === null || error === void 0 ? void 0 : error.message) || 'Error adding collaborator';
        return res.status(status).json({ message });
    }
});
exports.addCollaborator = addCollaborator;
const removeCollaborator = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        ensureAuthCompany(req);
        const dev = yield Development_1.Development.findOne({ _id: req.params.id, companyId: req.user.companyId });
        if (!dev)
            throw new errorHandler_1.AppError('Development not found', 404);
        const { userId } = req.body || {};
        if (!userId || !mongoose_1.default.Types.ObjectId.isValid(String(userId)))
            throw new errorHandler_1.AppError('Invalid userId', 400);
        const uid = new mongoose_1.default.Types.ObjectId(String(userId));
        yield Development_1.Development.updateOne({ _id: dev._id }, { $pull: { collaborators: uid }, $set: { updatedBy: req.user.userId } });
        const updated = yield Development_1.Development.findById(dev._id).lean();
        return res.json(updated);
    }
    catch (error) {
        const status = (error === null || error === void 0 ? void 0 : error.statusCode) || 500;
        const message = (error === null || error === void 0 ? void 0 : error.message) || 'Error removing collaborator';
        return res.status(status).json({ message });
    }
});
exports.removeCollaborator = removeCollaborator;
const getDevelopment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        ensureAuthCompany(req);
        const dev = yield Development_1.Development.findOne({ _id: req.params.id, companyId: req.user.companyId }).lean();
        if (!dev) {
            throw new errorHandler_1.AppError('Development not found', 404);
        }
        return res.json(dev);
    }
    catch (error) {
        const status = (error === null || error === void 0 ? void 0 : error.statusCode) || 500;
        const message = (error === null || error === void 0 ? void 0 : error.message) || 'Error fetching development';
        return res.status(status).json({ message });
    }
});
exports.getDevelopment = getDevelopment;
const updateDevelopment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    try {
        ensureAuthCompany(req);
        const allowed = {
            name: (_a = req.body) === null || _a === void 0 ? void 0 : _a.name,
            type: (_b = req.body) === null || _b === void 0 ? void 0 : _b.type,
            description: (_c = req.body) === null || _c === void 0 ? void 0 : _c.description,
            address: (_d = req.body) === null || _d === void 0 ? void 0 : _d.address,
            owner: (_e = req.body) === null || _e === void 0 ? void 0 : _e.owner
        };
        // Commission fields (optional)
        if (typeof ((_f = req.body) === null || _f === void 0 ? void 0 : _f.commissionPercent) === 'number')
            allowed.commissionPercent = req.body.commissionPercent;
        if (typeof ((_g = req.body) === null || _g === void 0 ? void 0 : _g.commissionPreaPercent) === 'number')
            allowed.commissionPreaPercent = req.body.commissionPreaPercent;
        if (typeof ((_h = req.body) === null || _h === void 0 ? void 0 : _h.commissionAgencyPercentRemaining) === 'number')
            allowed.commissionAgencyPercentRemaining = req.body.commissionAgencyPercentRemaining;
        if (typeof ((_j = req.body) === null || _j === void 0 ? void 0 : _j.commissionAgentPercentRemaining) === 'number')
            allowed.commissionAgentPercentRemaining = req.body.commissionAgentPercentRemaining;
        // Remove undefined keys
        Object.keys(allowed).forEach(k => allowed[k] === undefined && delete allowed[k]);
        const updated = yield Development_1.Development.findOneAndUpdate({ _id: req.params.id, companyId: req.user.companyId }, { $set: Object.assign(Object.assign({}, allowed), { updatedBy: req.user.userId }) }, { new: true });
        if (!updated)
            throw new errorHandler_1.AppError('Development not found', 404);
        return res.json(updated);
    }
    catch (error) {
        const status = (error === null || error === void 0 ? void 0 : error.statusCode) || 500;
        const message = (error === null || error === void 0 ? void 0 : error.message) || 'Error updating development';
        return res.status(status).json({ message });
    }
});
exports.updateDevelopment = updateDevelopment;
const deleteDevelopment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        ensureAuthCompany(req);
        const session = yield mongoose_1.default.startSession();
        session.startTransaction();
        try {
            const dev = yield Development_1.Development.findOne({ _id: req.params.id, companyId: req.user.companyId }).session(session);
            if (!dev)
                throw new errorHandler_1.AppError('Development not found', 404);
            const unitsDelete = yield DevelopmentUnit_1.DevelopmentUnit.deleteMany({ developmentId: dev._id }).session(session);
            yield Development_1.Development.deleteOne({ _id: dev._id }).session(session);
            yield session.commitTransaction();
            session.endSession();
            return res.json({ message: 'Development deleted', unitsDeleted: unitsDelete.deletedCount });
        }
        catch (err) {
            yield session.abortTransaction();
            session.endSession();
            throw err;
        }
    }
    catch (error) {
        const status = (error === null || error === void 0 ? void 0 : error.statusCode) || 500;
        const message = (error === null || error === void 0 ? void 0 : error.message) || 'Error deleting development';
        return res.status(status).json({ message });
    }
});
exports.deleteDevelopment = deleteDevelopment;
const listUnitsForDevelopment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        ensureAuthCompany(req);
        const dev = yield Development_1.Development.findOne({ _id: req.params.id, companyId: req.user.companyId }).lean();
        if (!dev)
            throw new errorHandler_1.AppError('Development not found', 404);
        const { status, variationId, page = '1', limit = '50' } = req.query;
        const pageNum = Math.max(1, Number(page) || 1);
        const limitNum = Math.max(1, Math.min(200, Number(limit) || 50));
        const query = { developmentId: new mongoose_1.default.Types.ObjectId(req.params.id) };
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
        const message = (error === null || error === void 0 ? void 0 : error.message) || 'Error fetching development units';
        return res.status(status).json({ message });
    }
});
exports.listUnitsForDevelopment = listUnitsForDevelopment;
const listPaymentsForDevelopment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        ensureAuthCompany(req);
        const companyId = new mongoose_1.default.Types.ObjectId(req.user.companyId);
        const dev = yield Development_1.Development.findOne({ _id: req.params.id, companyId }).lean();
        if (!dev)
            throw new errorHandler_1.AppError('Development not found', 404);
        const { unitId, saleMode } = req.query;
        const query = {
            companyId,
            paymentType: 'sale',
            developmentId: new mongoose_1.default.Types.ObjectId(req.params.id)
        };
        if (unitId && mongoose_1.default.Types.ObjectId.isValid(String(unitId))) {
            query.developmentUnitId = new mongoose_1.default.Types.ObjectId(String(unitId));
        }
        if (saleMode && (String(saleMode) === 'quick' || String(saleMode) === 'installment')) {
            query.saleMode = String(saleMode);
        }
        const payments = yield Payment_1.Payment.find(query)
            .select('paymentDate amount currency commissionDetails buyerName sellerName saleMode manualPropertyAddress referenceNumber developmentId developmentUnitId')
            .sort({ paymentDate: -1 })
            .lean();
        return res.json({ items: payments });
    }
    catch (error) {
        const status = (error === null || error === void 0 ? void 0 : error.statusCode) || 500;
        const message = (error === null || error === void 0 ? void 0 : error.message) || 'Error fetching development payments';
        return res.status(status).json({ message });
    }
});
exports.listPaymentsForDevelopment = listPaymentsForDevelopment;
const recomputeStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        ensureAuthCompany(req);
        const dev = yield Development_1.Development.findOne({ _id: req.params.id, companyId: req.user.companyId }).lean();
        if (!dev)
            throw new errorHandler_1.AppError('Development not found', 404);
        yield recalcCachedStats(new mongoose_1.default.Types.ObjectId(req.params.id));
        const updated = yield Development_1.Development.findById(req.params.id).lean();
        return res.json(updated);
    }
    catch (error) {
        const status = (error === null || error === void 0 ? void 0 : error.statusCode) || 500;
        const message = (error === null || error === void 0 ? void 0 : error.message) || 'Error recomputing stats';
        return res.status(status).json({ message });
    }
});
exports.recomputeStats = recomputeStats;
