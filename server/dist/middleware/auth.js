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
exports.authorize = exports.authWithCompany = exports.propertyOwnerAuth = exports.auth = void 0;
const authService_1 = require("../services/authService");
const authService = authService_1.AuthService.getInstance();
const getRequestToken = (req) => {
    var _a, _b;
    const headerToken = (_a = req.headers.authorization) === null || _a === void 0 ? void 0 : _a.split(' ')[1];
    const cookieToken = (_b = req.cookies) === null || _b === void 0 ? void 0 : _b.accessToken;
    return headerToken || cookieToken;
};
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
        // Use claim-only verification to avoid DB dependency on every request.
        const userData = authService.verifyAccessTokenClaims(token);
        req.user = {
            userId: userData.userId,
            role: userData.role,
            roles: userData.roles,
            companyId: userData.companyId
        };
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
        // Claim-only verification avoids turning transient DB outages into blanket auth failures.
        const userData = authService.verifyAccessTokenClaims(token);
        // Ensure this is a PropertyOwner
        if (userData.role !== 'owner') {
            return res.status(403).json({
                status: 'error',
                message: 'Property owner access required',
                code: 'OWNER_ACCESS_REQUIRED'
            });
        }
        // For PropertyOwners, ensure they have a companyId
        if (!userData.companyId) {
            return res.status(403).json({
                status: 'error',
                message: 'Property owner must be associated with a company',
                code: 'NO_COMPANY'
            });
        }
        req.user = {
            userId: userData.userId,
            role: userData.role,
            roles: userData.roles,
            companyId: userData.companyId
        };
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
        // Claim-only verification avoids turning transient DB outages into blanket auth failures.
        const userData = authService.verifyAccessTokenClaims(token);
        if (!userData.companyId) {
            return res.status(403).json({
                status: 'error',
                message: 'User is not associated with any company',
                code: 'NO_COMPANY'
            });
        }
        req.user = {
            userId: userData.userId,
            role: userData.role,
            roles: userData.roles,
            companyId: userData.companyId
        };
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
