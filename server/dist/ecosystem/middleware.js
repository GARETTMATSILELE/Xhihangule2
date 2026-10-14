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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ecosystemAuth = void 0;
exports.requireEcosystemRoles = requireEcosystemRoles;
exports.requireTenant = requireTenant;
exports.requireContractor = requireContractor;
exports.requireAgencyStaff = requireAgencyStaff;
exports.requireOwnerOrAgency = requireOwnerOrAgency;
exports.requireFlag = requireFlag;
exports.asyncHandler = asyncHandler;
exports.actorId = actorId;
exports.actorRoles = actorRoles;
const auth_1 = require("../middleware/auth");
const access_1 = require("../utils/access");
const errorHandler_1 = require("../middleware/errorHandler");
const flags_1 = require("./flags");
const Company_1 = require("../models/Company");
const tenantFacing_1 = require("./models/tenantFacing");
exports.ecosystemAuth = auth_1.auth;
function requireEcosystemRoles(roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ status: 'error', message: 'Authentication required', code: 'AUTH_REQUIRED' });
        }
        if (!(0, access_1.hasAnyRole)(req, roles)) {
            return res.status(403).json({ status: 'error', message: 'Insufficient permissions', code: 'INSUFFICIENT_PERMISSIONS' });
        }
        next();
    };
}
function requireTenant() {
    return requireEcosystemRoles(['tenant']);
}
function requireContractor() {
    return requireEcosystemRoles(['contractor']);
}
function requireAgencyStaff() {
    return requireEcosystemRoles(['admin', 'agent', 'principal', 'prea']);
}
function requireOwnerOrAgency() {
    return requireEcosystemRoles(['owner', 'admin', 'agent', 'principal', 'prea']);
}
function requireFlag(flag) {
    return (req, res, next) => __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            // Never trust client-supplied companyId for authorization.
            let companyId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId) ? String(req.user.companyId) : '';
            if (!companyId && ((_b = req.user) === null || _b === void 0 ? void 0 : _b.userId)) {
                const profile = yield tenantFacing_1.TenantProfile.findOne({ userId: req.user.userId }).select('companyId').lean();
                if (profile === null || profile === void 0 ? void 0 : profile.companyId)
                    companyId = String(profile.companyId);
            }
            const company = companyId ? yield Company_1.Company.findById(companyId).select('featureFlags').lean() : null;
            if (!(0, flags_1.isFlagEnabledForCompany)(company, flag)) {
                return res.status(403).json({
                    status: 'error',
                    message: 'This feature is not enabled for this workspace',
                    code: 'FEATURE_DISABLED',
                });
            }
            next();
        }
        catch (error) {
            next(error);
        }
    });
}
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
function actorId(req) {
    var _a;
    const id = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
    if (!id)
        throw new errorHandler_1.AppError('Authentication required', 401, 'AUTH_REQUIRED');
    return String(id);
}
function actorRoles(req) {
    return (0, access_1.getUserRoles)(req);
}
