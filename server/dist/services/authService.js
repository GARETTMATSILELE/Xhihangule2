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
exports.AuthService = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_1 = require("../models/User");
const PropertyOwner_1 = require("../models/PropertyOwner");
const errorHandler_1 = require("../middleware/errorHandler");
const database_1 = require("../config/database");
const jwt_1 = require("../config/jwt");
// Token expiry times
const ACCESS_TOKEN_EXPIRY = jwt_1.JWT_CONFIG.ACCESS_TOKEN_EXPIRY;
const REFRESH_TOKEN_EXPIRY = jwt_1.JWT_CONFIG.REFRESH_TOKEN_EXPIRY;
const AUTH_QUERY_MAX_TIME_MS = Math.max(5000, Number(process.env.AUTH_QUERY_MAX_TIME_MS || 15000));
class AuthService {
    constructor() {
        this.isInitialized = false;
        this.userVerificationCache = new Map();
        this.userContextCache = new Map();
    }
    static getInstance() {
        if (!AuthService.instance) {
            AuthService.instance = new AuthService();
        }
        return AuthService.instance;
    }
    initialize() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.isInitialized)
                return;
            // Be resilient during startup/transient reconnects: attempt a quick lazy connect + short retries
            if (!(0, database_1.isDatabaseAvailable)()) {
                try {
                    yield (0, database_1.connectDatabase)();
                }
                catch (_a) { }
                for (let i = 0; i < 3 && !(0, database_1.isDatabaseAvailable)(); i++) {
                    yield new Promise((r) => setTimeout(r, 1000));
                }
            }
            if (!(0, database_1.isDatabaseAvailable)()) {
                // Return an operational error so the API surfaces 503 instead of 500
                throw new errorHandler_1.AppError('Service temporarily unavailable', 503, 'SERVICE_UNAVAILABLE');
            }
            this.isInitialized = true;
        });
    }
    decodeAccessToken(token) {
        const decoded = jsonwebtoken_1.default.verify(token, jwt_1.JWT_CONFIG.SECRET, {
            issuer: jwt_1.JWT_CONFIG.ISSUER,
            audience: jwt_1.JWT_CONFIG.AUDIENCE
        });
        if (!(decoded === null || decoded === void 0 ? void 0 : decoded.userId) || !(decoded === null || decoded === void 0 ? void 0 : decoded.role)) {
            throw new Error('Invalid access token payload');
        }
        if (decoded.type && decoded.type !== 'access') {
            throw new Error('Invalid access token type');
        }
        return decoded;
    }
    /**
     * Fast token verification path for request middleware.
     * This validates token integrity/expiry and extracts claims without requiring a DB round-trip.
     */
    verifyAccessTokenClaims(token) {
        const decoded = this.decodeAccessToken(token);
        return {
            userId: decoded.userId,
            role: decoded.role,
            roles: decoded.roles,
            companyId: decoded.companyId
        };
    }
    getUserById(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.initialize();
            // First try to find in PropertyOwner collection
            let propertyOwner = yield PropertyOwner_1.PropertyOwner.findById(userId).maxTimeMS(AUTH_QUERY_MAX_TIME_MS);
            if (propertyOwner) {
                return { user: propertyOwner, type: 'propertyOwner' };
            }
            // If not found, try User collection
            let user = yield User_1.User.findById(userId).maxTimeMS(AUTH_QUERY_MAX_TIME_MS);
            if (user) {
                return { user, type: 'user' };
            }
            return null;
        });
    }
    getUserContext(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.initialize();
            const now = Date.now();
            const cached = this.userContextCache.get(userId);
            if (cached && cached.expiresAt > now) {
                return cached.user;
            }
            const user = yield User_1.User.findById(userId)
                .select('_id email firstName lastName role roles companyId isActive lastLogin createdAt updatedAt avatar avatarMimeType')
                .maxTimeMS(AUTH_QUERY_MAX_TIME_MS)
                .lean();
            if (!user)
                return null;
            const context = {
                userId: String(user._id),
                email: String(user.email || ''),
                firstName: String(user.firstName || ''),
                lastName: String(user.lastName || ''),
                role: user.role,
                roles: Array.isArray(user.roles) && user.roles.length > 0 ? user.roles : undefined,
                companyId: user.companyId ? String(user.companyId) : undefined,
                isActive: Boolean(user.isActive),
                lastLogin: user.lastLogin,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
                avatarUrl: user.avatar
                    ? `data:${String(user.avatarMimeType || 'image/png')};base64,${String(user.avatar)}`
                    : undefined
            };
            this.userContextCache.set(userId, {
                user: context,
                expiresAt: now + AuthService.USER_CONTEXT_CACHE_TTL_MS
            });
            return context;
        });
    }
    login(email, password) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.initialize();
            // Check only the User collection
            const normalizedEmail = String(email || '').trim().toLowerCase();
            let user = yield User_1.User.findOne({ email: normalizedEmail })
                .select('_id email password firstName lastName role roles companyId isActive lastLogin createdAt updatedAt')
                .maxTimeMS(AUTH_QUERY_MAX_TIME_MS);
            if (!user) {
                throw new errorHandler_1.AppError('Invalid credentials', 401, 'AUTH_ERROR');
            }
            // Check if user is active
            if (!user.isActive) {
                throw new errorHandler_1.AppError('Account is inactive', 403, 'ACCOUNT_INACTIVE');
            }
            // Verify password for User
            const isValidPassword = yield bcryptjs_1.default.compare(password, user.password);
            if (!isValidPassword) {
                throw new errorHandler_1.AppError('Invalid credentials', 401, 'AUTH_ERROR');
            }
            // Update last login without blocking authentication response path.
            const newLastLogin = new Date();
            void User_1.User.updateOne({ _id: user._id }, { $set: { lastLogin: newLastLogin } }).catch(() => { });
            const token = this.generateAccessToken(user, 'user');
            const refreshToken = this.generateRefreshToken(user, 'user');
            const resultUser = {
                userId: user._id.toString(),
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
                roles: Array.isArray(user.roles) && user.roles.length > 0 ? user.roles : undefined,
                companyId: user.companyId ? user.companyId.toString() : undefined,
                isActive: user.isActive,
                lastLogin: newLastLogin,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            };
            this.userContextCache.set(resultUser.userId, {
                user: resultUser,
                expiresAt: Date.now() + AuthService.USER_CONTEXT_CACHE_TTL_MS
            });
            return {
                user: resultUser,
                token,
                refreshToken
            };
        });
    }
    refreshToken(refreshToken) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const decoded = jsonwebtoken_1.default.verify(refreshToken, jwt_1.JWT_CONFIG.REFRESH_SECRET, {
                    issuer: jwt_1.JWT_CONFIG.ISSUER,
                    audience: jwt_1.JWT_CONFIG.AUDIENCE
                });
                if (!(decoded === null || decoded === void 0 ? void 0 : decoded.userId)) {
                    throw new Error('Invalid refresh token payload');
                }
                if (decoded.type && decoded.type !== 'refresh') {
                    throw new Error('Invalid refresh token type');
                }
                yield this.initialize();
                const userResult = yield this.getUserById(decoded.userId);
                if (!userResult) {
                    throw new Error('User not found');
                }
                const { user, type } = userResult;
                // Check if user is still active (only for User model)
                if (type === 'user' && !user.isActive) {
                    throw new Error('Account is inactive');
                }
                // Invalidate refresh token if password changed after token was issued
                try {
                    const iatSec = typeof decoded.iat === 'number' ? decoded.iat : undefined;
                    const pwdChangedAt = user.passwordChangedAt;
                    if (iatSec && pwdChangedAt && pwdChangedAt.getTime() > iatSec * 1000) {
                        throw new Error('Refresh token invalid due to password change');
                    }
                }
                catch (cmpErr) {
                    throw cmpErr;
                }
                const newToken = this.generateAccessToken(user, type);
                const newRefreshToken = this.generateRefreshToken(user, type);
                return {
                    token: newToken,
                    refreshToken: newRefreshToken
                };
            }
            catch (error) {
                if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
                    throw new Error('Refresh token expired');
                }
                else if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
                    throw new Error('Invalid refresh token');
                }
                throw new Error('Token refresh failed');
            }
        });
    }
    verifyToken(token) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            yield this.initialize();
            try {
                const decoded = this.decodeAccessToken(token);
                const cacheKey = `${decoded.userId}:${(_a = decoded.iat) !== null && _a !== void 0 ? _a : 'na'}`;
                const now = Date.now();
                const cached = this.userVerificationCache.get(cacheKey);
                if (cached && cached.expiresAt > now) {
                    return cached.user;
                }
                const userResult = yield this.getUserById(decoded.userId);
                if (!userResult) {
                    throw new Error('User not found');
                }
                const { user, type } = userResult;
                // Invalidate access token if password changed after token was issued
                try {
                    const iatSec = typeof decoded.iat === 'number' ? decoded.iat : undefined;
                    const pwdChangedAt = user.passwordChangedAt;
                    if (iatSec && pwdChangedAt && pwdChangedAt.getTime() > iatSec * 1000) {
                        throw new Error('Access token invalid due to password change');
                    }
                }
                catch (cmpErr) {
                    throw cmpErr;
                }
                // Check if user is still active (only for User model)
                if (type === 'user' && !user.isActive) {
                    throw new Error('Account is inactive');
                }
                const result = {
                    userId: user._id.toString(),
                    email: user.email,
                    role: type === 'user' ? user.role : 'owner',
                    roles: type === 'user' ? ((Array.isArray(user.roles) && user.roles.length > 0) ? user.roles : undefined) : undefined,
                    companyId: user.companyId ? user.companyId.toString() : undefined
                };
                this.userVerificationCache.set(cacheKey, {
                    user: result,
                    expiresAt: now + AuthService.DB_VERIFY_CACHE_TTL_MS
                });
                return result;
            }
            catch (error) {
                if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
                    throw new Error('Access token expired');
                }
                else if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
                    throw new Error('Invalid access token');
                }
                throw new Error('Token verification failed');
            }
        });
    }
    generateAccessToken(user, userType) {
        const payload = {
            userId: user._id.toString(),
            role: userType === 'user' ? user.role : 'owner',
            roles: userType === 'user' ? ((Array.isArray(user.roles) && user.roles.length > 0) ? user.roles : undefined) : undefined,
            companyId: user.companyId ? user.companyId.toString() : undefined,
            type: 'access'
        };
        const options = {
            expiresIn: ACCESS_TOKEN_EXPIRY,
            issuer: jwt_1.JWT_CONFIG.ISSUER,
            audience: jwt_1.JWT_CONFIG.AUDIENCE
        };
        return jsonwebtoken_1.default.sign(payload, jwt_1.JWT_CONFIG.SECRET, options);
    }
    generateRefreshToken(user, userType) {
        const payload = {
            userId: user._id.toString(),
            type: 'refresh'
        };
        const options = {
            expiresIn: REFRESH_TOKEN_EXPIRY,
            issuer: jwt_1.JWT_CONFIG.ISSUER,
            audience: jwt_1.JWT_CONFIG.AUDIENCE
        };
        return jsonwebtoken_1.default.sign(payload, jwt_1.JWT_CONFIG.REFRESH_SECRET, options);
    }
    // Utility method to decode token without verification (for debugging)
    decodeToken(token) {
        try {
            return jsonwebtoken_1.default.decode(token);
        }
        catch (error) {
            return null;
        }
    }
}
exports.AuthService = AuthService;
AuthService.DB_VERIFY_CACHE_TTL_MS = Number(process.env.AUTH_USER_CACHE_TTL_MS || 120000);
AuthService.USER_CONTEXT_CACHE_TTL_MS = Number(process.env.AUTH_USER_CONTEXT_CACHE_TTL_MS || 120000);
