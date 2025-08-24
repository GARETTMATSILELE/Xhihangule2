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
class AuthService {
    constructor() {
        this.isInitialized = false;
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
            const isAvailable = yield (0, database_1.isDatabaseAvailable)();
            if (!isAvailable) {
                throw new Error('Database is not available');
            }
            this.isInitialized = true;
        });
    }
    getUserById(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.initialize();
            // First try to find in PropertyOwner collection
            let propertyOwner = yield PropertyOwner_1.PropertyOwner.findById(userId);
            if (propertyOwner) {
                return { user: propertyOwner, type: 'propertyOwner' };
            }
            // If not found, try User collection
            let user = yield User_1.User.findById(userId);
            if (user) {
                return { user, type: 'user' };
            }
            return null;
        });
    }
    login(email, password) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.initialize();
            // Check only the User collection
            let user = yield User_1.User.findOne({ email });
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
            // Update last login
            user.lastLogin = new Date();
            yield user.save();
            const token = this.generateAccessToken(user, 'user');
            const refreshToken = this.generateRefreshToken(user, 'user');
            return {
                user: {
                    userId: user._id.toString(),
                    email: user.email,
                    role: user.role,
                    companyId: user.companyId ? user.companyId.toString() : undefined
                },
                token,
                refreshToken
            };
        });
    }
    refreshToken(refreshToken) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.initialize();
            try {
                console.log('AuthService: Starting token refresh');
                const decoded = jsonwebtoken_1.default.verify(refreshToken, jwt_1.JWT_CONFIG.REFRESH_SECRET);
                console.log('AuthService: Token decoded successfully, userId:', decoded.userId);
                const userResult = yield this.getUserById(decoded.userId);
                if (!userResult) {
                    console.log('AuthService: User not found for userId:', decoded.userId);
                    throw new Error('User not found');
                }
                const { user, type } = userResult;
                console.log('AuthService: User found:', { userId: user._id, role: type === 'user' ? user.role : 'owner' });
                // Check if user is still active (only for User model)
                if (type === 'user' && !user.isActive) {
                    console.log('AuthService: User is inactive');
                    throw new Error('Account is inactive');
                }
                const newToken = this.generateAccessToken(user, type);
                const newRefreshToken = this.generateRefreshToken(user, type);
                console.log('AuthService: New tokens generated successfully');
                return {
                    token: newToken,
                    refreshToken: newRefreshToken
                };
            }
            catch (error) {
                console.error('AuthService: Token refresh failed:', error);
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
            yield this.initialize();
            try {
                const decoded = jsonwebtoken_1.default.verify(token, jwt_1.JWT_CONFIG.SECRET);
                console.log('AuthService: Token decoded:', decoded);
                const userResult = yield this.getUserById(decoded.userId);
                if (!userResult) {
                    throw new Error('User not found');
                }
                const { user, type } = userResult;
                console.log('AuthService: User found in database:', {
                    userId: user._id,
                    role: type === 'user' ? user.role : 'owner',
                    companyId: user.companyId ? user.companyId.toString() : undefined
                });
                // Check if user is still active (only for User model)
                if (type === 'user' && !user.isActive) {
                    throw new Error('Account is inactive');
                }
                const result = {
                    userId: user._id.toString(),
                    email: user.email,
                    role: type === 'user' ? user.role : 'owner',
                    companyId: user.companyId ? user.companyId.toString() : undefined
                };
                console.log('AuthService: Returning user data:', result);
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
