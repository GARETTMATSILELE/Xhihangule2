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
exports.COMPANY_WIDE_PROPERTY_ROLES = void 0;
exports.hasCompanyWidePropertyAccess = hasCompanyWidePropertyAccess;
exports.agentPortfolioClause = agentPortfolioClause;
exports.propertyIdsForCaller = propertyIdsForCaller;
exports.callerCanAccessProperty = callerCanAccessProperty;
exports.landlordPropertyIds = landlordPropertyIds;
exports.propertyOwnerIdsForCaller = propertyOwnerIdsForCaller;
exports.callerCanReadPropertyOwner = callerCanReadPropertyOwner;
exports.callerCanMutatePropertyOwner = callerCanMutatePropertyOwner;
const mongoose_1 = __importDefault(require("mongoose"));
const access_1 = require("./access");
const Property_1 = require("../models/Property");
const PropertyOwner_1 = require("../models/PropertyOwner");
const User_1 = require("../models/User");
/**
 * Company-wide property visibility already used by search and property reports.
 * These roles are an explicit permission. A plain agent is not in this list.
 */
exports.COMPANY_WIDE_PROPERTY_ROLES = ['admin', 'accountant', 'principal', 'prea'];
function hasCompanyWidePropertyAccess(req) {
    return (0, access_1.hasAnyRole)(req, exports.COMPANY_WIDE_PROPERTY_ROLES);
}
/**
 * Portfolio rule confirmed from the schema and write paths:
 * - ownerId is the User who created the property (often the agent who saved it).
 * - agentId is the formal assignment, when one was recorded.
 * - propertyOwnerId is the PropertyOwner landlord and is not an agent grant.
 */
function agentPortfolioClause(userId) {
    const id = new mongoose_1.default.Types.ObjectId(userId);
    return { $or: [{ ownerId: id }, { agentId: id }] };
}
function propertyIdsForCaller(req) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) || !req.user.companyId)
            return [];
        if (hasCompanyWidePropertyAccess(req))
            return 'company';
        const companyId = new mongoose_1.default.Types.ObjectId(req.user.companyId);
        const roles = (0, access_1.getUserRoles)(req);
        const isPortfolioStaff = roles.some((role) => role === 'agent' || role === 'sales');
        if (!isPortfolioStaff && roles.includes('owner')) {
            const resolved = yield landlordPropertyIds(req.user.userId, req.user.companyId);
            return resolved;
        }
        return Property_1.Property.find(Object.assign({ companyId, isDeleted: { $ne: true } }, agentPortfolioClause(req.user.userId))).distinct('_id');
    });
}
function callerCanAccessProperty(req, propertyId, options) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId) || !req.user.userId || !mongoose_1.default.Types.ObjectId.isValid(String(propertyId)))
            return false;
        if (hasCompanyWidePropertyAccess(req) || (options === null || options === void 0 ? void 0 : options.includeDeleted)) {
            const exists = yield Property_1.Property.exists(Object.assign(Object.assign({ _id: propertyId, companyId: req.user.companyId }, (hasCompanyWidePropertyAccess(req) ? {} : agentPortfolioClause(req.user.userId))), ((options === null || options === void 0 ? void 0 : options.includeDeleted) ? {} : { isDeleted: { $ne: true } })));
            return Boolean(exists);
        }
        const ids = yield propertyIdsForCaller(req);
        if (ids === 'company')
            return false;
        return ids.some((id) => String(id) === String(propertyId));
    });
}
function landlordPropertyIds(userId, companyHint) {
    return __awaiter(this, void 0, void 0, function* () {
        const hint = companyHint && mongoose_1.default.Types.ObjectId.isValid(companyHint)
            ? new mongoose_1.default.Types.ObjectId(companyHint)
            : undefined;
        let owner = mongoose_1.default.Types.ObjectId.isValid(userId)
            ? yield PropertyOwner_1.PropertyOwner.findOne(Object.assign({ _id: userId }, (hint ? { companyId: hint } : {}))).select('_id properties companyId').lean()
            : null;
        if (!owner && mongoose_1.default.Types.ObjectId.isValid(userId)) {
            const user = yield User_1.User.findById(userId).select('email role companyId').lean();
            if (user && user.role === 'owner' && user.email) {
                const companyId = user.companyId || hint;
                owner = yield PropertyOwner_1.PropertyOwner.findOne(Object.assign({ email: user.email }, (companyId ? { companyId } : {}))).select('_id properties companyId').lean();
            }
        }
        if (!owner)
            return [];
        const companyId = owner.companyId || hint;
        const rows = yield Property_1.Property.find(Object.assign(Object.assign({}, (companyId ? { companyId } : {})), { isDeleted: { $ne: true }, $or: [
                { propertyOwnerId: owner._id },
                ...((owner.properties || []).length ? [{ _id: { $in: owner.properties } }] : []),
            ] })).select('_id').lean();
        return rows.map((row) => row._id);
    });
}
function propertyOwnerIdsForCaller(req) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId))
            return [];
        if (hasCompanyWidePropertyAccess(req))
            return 'company';
        const ids = yield propertyIdsForCaller(req);
        if (ids === 'company')
            return 'company';
        if (!ids.length)
            return [];
        const fromLink = yield Property_1.Property.distinct('propertyOwnerId', {
            _id: { $in: ids },
            companyId: req.user.companyId,
            propertyOwnerId: { $ne: null },
        });
        const fromArray = yield PropertyOwner_1.PropertyOwner.find({
            companyId: req.user.companyId,
            properties: { $in: ids },
        }).distinct('_id');
        const merged = new Map();
        for (const id of [...fromLink, ...fromArray]) {
            if (id)
                merged.set(String(id), id);
        }
        return [...merged.values()];
    });
}
function callerCanReadPropertyOwner(req, ownerId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        if (!mongoose_1.default.Types.ObjectId.isValid(String(ownerId)))
            return false;
        const ids = yield propertyOwnerIdsForCaller(req);
        if (ids === 'company') {
            return Boolean(yield PropertyOwner_1.PropertyOwner.exists({ _id: ownerId, companyId: (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId }));
        }
        return ids.some((id) => String(id) === String(ownerId));
    });
}
/**
 * A shared landlord record may be read by each agent who manages one of its properties.
 * Mutating it is limited to callers whose portfolio already contains every linked property,
 * so one agent cannot rename a landlord that also belongs to another agent's property.
 */
function callerCanMutatePropertyOwner(req, ownerId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId) || !mongoose_1.default.Types.ObjectId.isValid(String(ownerId)))
            return false;
        const owner = yield PropertyOwner_1.PropertyOwner.findOne({ _id: ownerId, companyId: req.user.companyId }).select('_id properties').lean();
        if (!owner)
            return false;
        if (hasCompanyWidePropertyAccess(req))
            return true;
        const visible = yield propertyIdsForCaller(req);
        if (visible === 'company')
            return true;
        const visibleSet = new Set(visible.map(String));
        const linked = new Set(((owner.properties) || []).map(String));
        const rows = yield Property_1.Property.find({
            companyId: req.user.companyId,
            isDeleted: { $ne: true },
            propertyOwnerId: ownerId,
        }).select('_id').lean();
        for (const row of rows)
            linked.add(String(row._id));
        if (!linked.size)
            return false;
        for (const id of linked) {
            if (!visibleSet.has(id))
                return false;
        }
        return true;
    });
}
