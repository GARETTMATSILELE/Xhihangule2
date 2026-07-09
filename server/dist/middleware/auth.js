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
exports.requireActiveSubscription = exports.requireCompanyContext = exports.requireRole = exports.authorize = exports.authWithCompany = exports.propertyOwnerAuth = exports.auth = void 0;
exports.tenantScopeQuery = tenantScopeQuery;
const authService_1 = require("../services/authService");
const User_1 = require("../models/User");
const Company_1 = require("../models/Company");
const Subscription_1 = require("../models/Subscription");
const authService = authService_1.AuthService.getInstance();
const COMPANY_CONTEXT_CACHE_TTL_MS = Number(process.env.COMPANY_CONTEXT_CACHE_TTL_MS || 60000);
const companyContextCache = new Map();
const getRequestToken = (req) => {
    var _a, _b;
    const headerToken = (_a = req.headers.authorization) === null || _a === void 0 ? void 0 : _a.split(' ')[1];
    const cookieToken = (_b = req.cookies) === null || _b === void 0 ? void 0 : _b.accessToken;
    return headerToken || cookieToken;
};
function resolveCompanyContext(userData) {
    return __awaiter(this, void 0, void 0, function* () {
        const cacheKey = `${userData.userId}:${userData.companyId || 'legacy-none'}`;
        const now = Date.now();
        const cached = companyContextCache.get(cacheKey);
        if (cached && cached.expiresAt > now) {
            return cached.context;
        }
        const base = {
            userId: userData.userId,
            role: userData.role,
            roles: userData.roles,
            companyId: userData.companyId,
            legacyTokenCompanyId: userData.companyId
        };
        try {
            const user = yield User_1.User.findById(userData.userId)
                .select('_id role roles companyId isActive sessionVersion')
                .maxTimeMS(5000)
                .lean();
            if (!user)
                return base;
            if (user.isActive === false)
                return base;
            const companyId = user.companyId ? String(user.companyId) : userData.companyId;
            const context = Object.assign(Object.assign({}, base), { role: (user.role || userData.role), roles: Array.isArray(user.roles) && user.roles.length > 0 ? user.roles : base.roles, companyId });
            if (companyId) {
                const [company, subscription] = yield Promise.all([
                    Company_1.Company.findById(companyId)
                        .select('_id tenantStatus onboardingStatus subscriptionStatus isActive subscriptionOverride')
                        .maxTimeMS(5000)
                        .lean(),
                    Subscription_1.Subscription.findOne({ companyId })
                        .select('_id status currentPeriodEnd trialEndDate gracePeriodEnd adminOverride')
                        .sort({ updatedAt: -1 })
                        .maxTimeMS(5000)
                        .lean()
                ]);
                if (company) {
                    context.tenantStatus = String(company.tenantStatus || ((company.isActive === false) ? 'suspended' : 'active'));
                    context.onboardingStatus = String(company.onboardingStatus || 'ACTIVE');
                    context.subscriptionStatus = String(company.subscriptionStatus || (subscription === null || subscription === void 0 ? void 0 : subscription.status) || 'trial');
                    context.subscriptionOverride = company.subscriptionOverride;
                }
                if (subscription) {
                    context.subscriptionId = String(subscription._id);
                    context.subscriptionStatus = String(subscription.status || context.subscriptionStatus || 'trial');
                    context.subscriptionOverride = subscription.adminOverride || context.subscriptionOverride;
                }
            }
            companyContextCache.set(cacheKey, { expiresAt: now + COMPANY_CONTEXT_CACHE_TTL_MS, context });
            return context;
        }
        catch (_a) {
            // Legacy-safe fallback: do not break existing tokens during transient DB outages.
            return base;
        }
    });
}
function attachUser(req, userData, context) {
    req.user = {
        userId: userData.userId,
        role: context.role || userData.role,
        roles: context.roles || userData.roles,
        companyId: context.companyId || userData.companyId
    };
    req.companyContext = context;
}
// Basic auth middleware that doesn't require companyId
const auth = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const token = getRequestToken(req);
        if (!token) {
            return res.status(401).json({
                status: 'error',
                message: 'Authentication required',
                code: 'AUTH_REQUIRED'
            });
        }
        // Verify token claims first, then enrich with current DB company context.
        // If DB enrichment fails, legacy token claims still work.
        const userData = authService.verifyAccessTokenClaims(token);
        const context = yield resolveCompanyContext(userData);
        attachUser(req, userData, context);
        next();
    }
    catch (error) {
        if (error instanceof Error) {
            if (error.message.includes('expired')) {
                return res.status(401).json({
                    status: 'error',
                    message: 'Token expired',
                    code: 'TOKEN_EXPIRED'
                });
            }
            else if (error.message.includes('Invalid')) {
                return res.status(401).json({
                    status: 'error',
                    message: 'Invalid token',
                    code: 'INVALID_TOKEN'
                });
            }
        }
        return res.status(401).json({
            status: 'error',
            message: 'Authentication failed',
            code: 'AUTH_FAILED'
        });
    }
});
exports.auth = auth;
// PropertyOwner-specific auth middleware
const propertyOwnerAuth = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const token = getRequestToken(req);
        if (!token) {
            return res.status(401).json({
                status: 'error',
                message: 'Authentication required',
                code: 'AUTH_REQUIRED'
            });
        }
        // Claim verification plus company-context enrichment; legacy claims still work
        // if enrichment is unavailable.
        const userData = authService.verifyAccessTokenClaims(token);
        const context = yield resolveCompanyContext(userData);
        // Ensure this is a PropertyOwner
        if (userData.role !== 'owner') {
            return res.status(403).json({
                status: 'error',
                message: 'Property owner access required',
                code: 'OWNER_ACCESS_REQUIRED'
            });
        }
        // For PropertyOwners, ensure they have a companyId
        if (!context.companyId) {
            return res.status(403).json({
                status: 'error',
                message: 'Property owner must be associated with a company',
                code: 'NO_COMPANY'
            });
        }
        attachUser(req, userData, context);
        next();
    }
    catch (error) {
        if (error instanceof Error) {
            if (error.message.includes('expired')) {
                return res.status(401).json({
                    status: 'error',
                    message: 'Token expired',
                    code: 'TOKEN_EXPIRED'
                });
            }
            else if (error.message.includes('Invalid')) {
                return res.status(401).json({
                    status: 'error',
                    message: 'Invalid token',
                    code: 'INVALID_TOKEN'
                });
            }
        }
        return res.status(401).json({
            status: 'error',
            message: 'Authentication failed',
            code: 'AUTH_FAILED'
        });
    }
});
exports.propertyOwnerAuth = propertyOwnerAuth;
// Auth middleware that requires companyId
const authWithCompany = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const token = getRequestToken(req);
        if (!token) {
            return res.status(401).json({
                status: 'error',
                message: 'Authentication required',
                code: 'AUTH_REQUIRED'
            });
        }
        // Company context is read from the current user relation when available so
        // newly linked companies work before the user's next full login.
        const userData = authService.verifyAccessTokenClaims(token);
        const context = yield resolveCompanyContext(userData);
        if (!context.companyId) {
            return res.status(403).json({
                status: 'error',
                message: 'User is not associated with any company',
                code: 'NO_COMPANY'
            });
        }
        attachUser(req, userData, context);
        next();
    }
    catch (error) {
        if (error instanceof Error) {
            if (error.message.includes('expired')) {
                return res.status(401).json({
                    status: 'error',
                    message: 'Token expired',
                    code: 'TOKEN_EXPIRED'
                });
            }
            else if (error.message.includes('Invalid')) {
                return res.status(401).json({
                    status: 'error',
                    message: 'Invalid token',
                    code: 'INVALID_TOKEN'
                });
            }
        }
        return res.status(401).json({
            status: 'error',
            message: 'Authentication failed',
            code: 'AUTH_FAILED'
        });
    }
});
exports.authWithCompany = authWithCompany;
// Role-based authorization middleware
const authorize = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                status: 'error',
                message: 'Authentication required',
                code: 'AUTH_REQUIRED'
            });
        }
        const userRoles = req.user.roles || [req.user.role];
        if (!allowedRoles.some(r => userRoles.includes(r))) {
            return res.status(403).json({
                status: 'error',
                message: 'Insufficient permissions',
                code: 'INSUFFICIENT_PERMISSIONS'
            });
        }
        next();
    };
};
exports.authorize = authorize;
exports.requireRole = exports.authorize;
const requireCompanyContext = (req, res, next) => {
    var _a, _b;
    if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId)) {
        return res.status(403).json({
            status: 'error',
            message: 'Company context required',
            code: 'NO_COMPANY'
        });
    }
    const tenantStatus = ((_b = req.companyContext) === null || _b === void 0 ? void 0 : _b.tenantStatus) || 'active';
    if (tenantStatus !== 'active' && tenantStatus !== 'pending') {
        return res.status(403).json({
            status: 'error',
            message: 'Company workspace is not active',
            code: 'TENANT_INACTIVE'
        });
    }
    next();
};
exports.requireCompanyContext = requireCompanyContext;
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['trial', 'active', 'TRIAL', 'ACTIVE']);
const READ_ONLY_SUBSCRIPTION_STATUSES = new Set(['past_due', 'expired', 'PAST_DUE', 'EXPIRED', 'inactive']);
const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const requireActiveSubscription = (options) => {
    return (req, res, next) => {
        var _a, _b, _c, _d;
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId)) {
            return res.status(403).json({
                status: 'error',
                message: 'Company context required',
                code: 'NO_COMPANY'
            });
        }
        const roles = req.user.roles || [req.user.role];
        const isAdminLike = roles.some((role) => ['admin', 'principal', 'prea', 'system_admin'].includes(role));
        if ((options === null || options === void 0 ? void 0 : options.allowBillingAccess) && isAdminLike) {
            return next();
        }
        const tenantStatus = ((_b = req.companyContext) === null || _b === void 0 ? void 0 : _b.tenantStatus) || 'active';
        const subscriptionStatus = ((_c = req.companyContext) === null || _c === void 0 ? void 0 : _c.subscriptionStatus) || 'trial';
        const override = (_d = req.companyContext) === null || _d === void 0 ? void 0 : _d.subscriptionOverride;
        if ((override === null || override === void 0 ? void 0 : override.enabled) && (!override.expiresAt || new Date(override.expiresAt) > new Date())) {
            return next();
        }
        if (tenantStatus !== 'suspended' && READ_ONLY_METHODS.has(req.method) && READ_ONLY_SUBSCRIPTION_STATUSES.has(subscriptionStatus)) {
            return next();
        }
        if (tenantStatus === 'suspended' || !ACTIVE_SUBSCRIPTION_STATUSES.has(subscriptionStatus)) {
            return res.status(402).json({
                status: 'error',
                message: READ_ONLY_SUBSCRIPTION_STATUSES.has(subscriptionStatus)
                    ? 'Subscription expired. Your account is in read-only mode.'
                    : 'Active subscription required',
                code: 'SUBSCRIPTION_INACTIVE',
                readOnly: READ_ONLY_SUBSCRIPTION_STATUSES.has(subscriptionStatus),
                subscriptionStatus
            });
        }
        next();
    };
};
exports.requireActiveSubscription = requireActiveSubscription;
function tenantScopeQuery(req, extra = {}) {
    var _a;
    const companyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
    if (!companyId) {
        return Object.assign(Object.assign({}, extra), { companyId: '__missing_company_context__' });
    }
    return Object.assign(Object.assign({}, extra), { companyId });
}
