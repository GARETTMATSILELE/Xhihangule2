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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteUserById = exports.updateUserById = exports.createUser = exports.getCurrentUser = exports.getUserCommissionSummary = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Payment_1 = require("../models/Payment");
const errorHandler_1 = require("../middleware/errorHandler");
const access_1 = require("../utils/access");
const getUserCommissionSummary = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) || !((_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId)) {
            throw new errorHandler_1.AppError('Authentication required', 401);
        }
        const targetUserId = req.params.id;
        const { saleOnly, startDate, endDate, limit } = req.query;
        // Authorization: allow self, admin, accountant, principal, or prea within same company
        if (String(req.user.userId) !== String(targetUserId) && !(0, access_1.hasAnyRole)(req, ['admin', 'accountant', 'principal', 'prea'])) {
            throw new errorHandler_1.AppError('Forbidden', 403);
        }
        const q = {
            agentId: new mongoose_1.default.Types.ObjectId(targetUserId),
            companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId),
            status: 'completed'
        };
        if (String(saleOnly) === 'true') {
            q.paymentType = 'sale';
        }
        if (startDate || endDate) {
            q.paymentDate = {};
            if (startDate)
                q.paymentDate.$gte = new Date(String(startDate));
            if (endDate)
                q.paymentDate.$lte = new Date(String(endDate));
        }
        // Aggregate totals
        const cursor = Payment_1.Payment.find(q)
            .select('paymentDate commissionDetails referenceNumber manualPropertyAddress propertyId tenantId paymentType')
            .sort({ paymentDate: -1 });
        const docs = yield cursor.lean();
        const totalAgentCommission = docs.reduce((s, d) => { var _a; return s + Number(((_a = d === null || d === void 0 ? void 0 : d.commissionDetails) === null || _a === void 0 ? void 0 : _a.agentShare) || 0); }, 0);
        const totalAgencyCommission = docs.reduce((s, d) => { var _a; return s + Number(((_a = d === null || d === void 0 ? void 0 : d.commissionDetails) === null || _a === void 0 ? void 0 : _a.agencyShare) || 0); }, 0);
        const totalPrea = docs.reduce((s, d) => { var _a; return s + Number(((_a = d === null || d === void 0 ? void 0 : d.commissionDetails) === null || _a === void 0 ? void 0 : _a.preaFee) || 0); }, 0);
        const lim = Math.max(0, Math.min(100, Number(limit || 10)));
        const items = lim > 0 ? docs.slice(0, lim).map((d) => {
            var _a, _b, _c;
            return ({
                id: String(d._id),
                date: d.paymentDate,
                amount: d.amount,
                agentShare: ((_a = d === null || d === void 0 ? void 0 : d.commissionDetails) === null || _a === void 0 ? void 0 : _a.agentShare) || 0,
                agencyShare: ((_b = d === null || d === void 0 ? void 0 : d.commissionDetails) === null || _b === void 0 ? void 0 : _b.agencyShare) || 0,
                preaFee: ((_c = d === null || d === void 0 ? void 0 : d.commissionDetails) === null || _c === void 0 ? void 0 : _c.preaFee) || 0,
                referenceNumber: d.referenceNumber,
                manualPropertyAddress: d.manualPropertyAddress,
                paymentType: d.paymentType
            });
        }) : [];
        return res.json({
            totalAgentCommission,
            totalAgencyCommission,
            totalPrea,
            count: docs.length,
            items
        });
    }
    catch (err) {
        const status = (err === null || err === void 0 ? void 0 : err.statusCode) || 500;
        return res.status(status).json({ message: (err === null || err === void 0 ? void 0 : err.message) || 'Failed to get commission summary' });
    }
});
exports.getUserCommissionSummary = getUserCommissionSummary;
const User_1 = require("../models/User");
const getCurrentUser = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    if (!userId) {
        throw new errorHandler_1.AppError('User ID is required', 400);
    }
    try {
        const user = yield User_1.User.findById(userId).select('-password');
        if (!user) {
            throw new errorHandler_1.AppError('User not found', 404);
        }
        return user;
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            throw error;
        }
        throw new errorHandler_1.AppError('Error fetching user', 500);
    }
});
exports.getCurrentUser = getCurrentUser;
const createUser = (userData) => __awaiter(void 0, void 0, void 0, function* () {
    console.log('Creating user with data:', userData);
    // Check if user already exists
    const existingUser = yield User_1.User.findOne({ email: userData.email, companyId: userData.companyId, isArchived: { $ne: true } });
    if (existingUser) {
        throw new errorHandler_1.AppError('User already exists', 400);
    }
    // Normalize roles: if roles array provided, ensure unique/valid and set primary role
    const VALID_ROLES = ['admin', 'agent', 'accountant', 'owner', 'sales', 'principal', 'prea'];
    let payload = Object.assign({}, userData);
    if (Array.isArray(userData.roles) && userData.roles.length > 0) {
        const roles = Array.from(new Set(userData.roles.map((r) => String(r)))).filter((r) => VALID_ROLES.includes(r));
        if (roles.length === 0)
            throw new errorHandler_1.AppError('At least one valid role is required', 400);
        payload.roles = roles;
        // Set primary role if not provided or not valid
        if (!VALID_ROLES.includes(String(userData.role))) {
            payload.role = roles[0];
        }
    }
    // Create new user
    const user = yield User_1.User.create(payload);
    console.log('User created successfully:', user);
    // Return user without password
    const _a = user.toObject(), { password } = _a, userWithoutPassword = __rest(_a, ["password"]);
    return userWithoutPassword;
});
exports.createUser = createUser;
const updateUserById = (id, updates, currentCompanyId) => __awaiter(void 0, void 0, void 0, function* () {
    if (!id) {
        throw new errorHandler_1.AppError('User ID is required', 400);
    }
    const user = yield User_1.User.findById(id);
    if (!user) {
        throw new errorHandler_1.AppError('User not found', 404);
    }
    if (user.isArchived) {
        throw new errorHandler_1.AppError('Archived users cannot be updated', 400);
    }
    // Enforce company scoping if provided
    if (currentCompanyId && user.companyId && user.companyId.toString() !== currentCompanyId) {
        throw new errorHandler_1.AppError('Forbidden: User does not belong to your company', 403);
    }
    // Apply allowed updates
    if (typeof updates.firstName === 'string')
        user.firstName = updates.firstName;
    if (typeof updates.lastName === 'string')
        user.lastName = updates.lastName;
    if (typeof updates.email === 'string')
        user.email = updates.email;
    if (typeof updates.role === 'string')
        user.role = updates.role;
    // Update roles array if provided
    const VALID_ROLES = ['admin', 'agent', 'accountant', 'owner', 'sales', 'principal', 'prea'];
    if (Array.isArray(updates.roles)) {
        const roles = Array.from(new Set(updates.roles.map((r) => String(r)))).filter((r) => VALID_ROLES.includes(r));
        if (roles.length === 0) {
            throw new errorHandler_1.AppError('At least one valid role is required', 400);
        }
        user.roles = roles;
        // Ensure primary role is aligned with roles array
        if (!roles.includes(user.role)) {
            user.role = roles[0];
        }
    }
    // If password provided and non-empty, set it so pre-save hook re-hashes
    if (typeof updates.password === 'string' && updates.password.trim().length > 0) {
        user.password = updates.password;
    }
    yield user.save();
    const _a = user.toObject(), { password } = _a, userWithoutPassword = __rest(_a, ["password"]);
    return userWithoutPassword;
});
exports.updateUserById = updateUserById;
const deleteUserById = (id, actorUserId, currentCompanyId) => __awaiter(void 0, void 0, void 0, function* () {
    if (!id) {
        throw new errorHandler_1.AppError('User ID is required', 400);
    }
    const user = yield User_1.User.findById(id);
    if (!user) {
        throw new errorHandler_1.AppError('User not found', 404);
    }
    if (currentCompanyId && user.companyId && user.companyId.toString() !== currentCompanyId) {
        throw new errorHandler_1.AppError('Forbidden: User does not belong to your company', 403);
    }
    if (user.isArchived) {
        return {
            alreadyArchived: true,
            id: String(user._id),
            isActive: Boolean(user.isActive)
        };
    }
    if (actorUserId && String(user._id) === String(actorUserId)) {
        throw new errorHandler_1.AppError('You cannot delete your own account', 400);
    }
    user.archivedDetails = {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        roles: Array.isArray(user.roles) ? user.roles : undefined
    };
    user.isArchived = true;
    user.archivedAt = new Date();
    user.archivedBy = actorUserId ? new mongoose_1.default.Types.ObjectId(actorUserId) : undefined;
    user.isActive = false;
    yield user.save();
    return {
        id: String(user._id),
        isArchived: true,
        archivedAt: user.archivedAt
    };
});
exports.deleteUserById = deleteUserById;
