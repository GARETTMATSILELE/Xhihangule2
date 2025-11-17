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
const express_1 = __importDefault(require("express"));
const authService_1 = require("../services/authService");
const auth_1 = require("../middleware/auth");
class AuthError extends Error {
    constructor(message) {
        super(message);
        this.name = 'AuthError';
    }
}
const router = express_1.default.Router();
const authService = authService_1.AuthService.getInstance();
// Get current user route
router.get('/me', auth_1.auth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!req.user) {
            return res.status(401).json({
                status: 'error',
                message: 'Not authenticated',
                code: 'NOT_AUTHENTICATED'
            });
        }
        const userResult = yield authService.getUserById(req.user.userId);
        if (!userResult) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }
        const { user, type } = userResult;
        // Build avatar URL if present (only for app users, not property owners)
        const avatarUrl = (type === 'user' && (user === null || user === void 0 ? void 0 : user.avatar))
            ? `data:${user.avatarMimeType || 'image/png'};base64,${user.avatar}`
            : undefined;
        // Return the structure the client expects (include avatarUrl when present)
        res.json({
            user: Object.assign({ _id: user._id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: type === 'user' ? user.role : 'owner', companyId: user.companyId, isActive: type === 'user' ? user.isActive : true, lastLogin: type === 'user' ? user.lastLogin : undefined, createdAt: user.createdAt, updatedAt: user.updatedAt }, (avatarUrl ? { avatarUrl } : {}))
        });
    }
    catch (error) {
        console.error('Error in /me endpoint:', error);
        res.status(500).json({
            status: 'error',
            message: 'Error fetching user data',
            code: 'SERVER_ERROR'
        });
    }
}));
// Login route
router.post('/login', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            throw new AuthError('Email and password are required');
        }
        const result = yield authService.login(email, password);
        // Fetch the full user data from database to get proper structure
        const userResult = yield authService.getUserById(result.user.userId);
        if (!userResult) {
            throw new AuthError('User not found after login');
        }
        const { user: fullUser, type } = userResult;
        // Fetch company data if user has a companyId
        let company = null;
        if (fullUser.companyId) {
            try {
                const Company = require('../models/Company').default;
                company = yield Company.findById(fullUser.companyId);
            }
            catch (error) {
                console.error('Error fetching company:', error);
                // Continue without company data
            }
        }
        // Set refresh token as HttpOnly cookie
        res.cookie('refreshToken', result.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });
        // Build avatar URL if present
        const avatarUrl = (fullUser === null || fullUser === void 0 ? void 0 : fullUser.avatar)
            ? `data:${fullUser.avatarMimeType || 'image/png'};base64,${fullUser.avatar}`
            : undefined;
        // Return the structure the client expects: { user, company, token, refreshToken } (include avatarUrl)
        res.json({
            user: Object.assign({ _id: fullUser._id, email: fullUser.email, firstName: fullUser.firstName, lastName: fullUser.lastName, role: type === 'user' ? fullUser.role : 'owner', companyId: (_a = fullUser.companyId) === null || _a === void 0 ? void 0 : _a.toString(), isActive: type === 'user' ? fullUser.isActive : true, lastLogin: type === 'user' ? fullUser.lastLogin : undefined, createdAt: fullUser.createdAt, updatedAt: fullUser.updatedAt }, (avatarUrl ? { avatarUrl } : {})),
            company: company,
            token: result.token,
            refreshToken: result.refreshToken
        });
    }
    catch (error) {
        if (error instanceof AuthError) {
            res.status(401).json({
                status: 'error',
                message: error.message,
                code: 'AUTH_ERROR'
            });
        }
        else {
            res.status(500).json({
                status: 'error',
                message: 'Internal server error',
                code: 'SERVER_ERROR'
            });
        }
    }
}));
// Logout route
router.post('/logout', (req, res) => {
    res.clearCookie('refreshToken');
    res.json({
        status: 'success',
        message: 'Logged out successfully'
    });
});
// Refresh token route
router.post('/refresh-token', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        console.log('Refresh token request received');
        // Get refresh token from request body or cookies
        const { refreshToken } = req.body;
        const cookieRefreshToken = (_a = req.cookies) === null || _a === void 0 ? void 0 : _a.refreshToken;
        const tokenToUse = refreshToken || cookieRefreshToken;
        console.log('Refresh token check:', {
            hasBodyToken: !!refreshToken,
            hasCookieToken: !!cookieRefreshToken,
            hasTokenToUse: !!tokenToUse
        });
        if (!tokenToUse) {
            throw new AuthError('Refresh token is required');
        }
        console.log('Calling auth service refresh token');
        const result = yield authService.refreshToken(tokenToUse);
        console.log('Refresh token successful:', {
            hasNewToken: !!result.token,
            hasNewRefreshToken: !!result.refreshToken
        });
        // Set new refresh token as HttpOnly cookie
        res.cookie('refreshToken', result.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });
        res.json({
            status: 'success',
            token: result.token,
            refreshToken: result.refreshToken
        });
    }
    catch (error) {
        console.error('Refresh token error:', error);
        if (error instanceof AuthError) {
            res.status(401).json({
                status: 'error',
                message: error.message,
                code: 'REFRESH_ERROR'
            });
        }
        else {
            res.status(500).json({
                status: 'error',
                message: 'Internal server error',
                code: 'SERVER_ERROR'
            });
        }
    }
}));
// Verify token route
router.post('/verify-token', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { token } = req.body;
        if (!token) {
            throw new AuthError('Token is required');
        }
        const user = yield authService.verifyToken(token);
        res.json({
            status: 'success',
            user
        });
    }
    catch (error) {
        if (error instanceof AuthError) {
            res.status(401).json({
                status: 'error',
                message: error.message,
                code: 'VERIFY_ERROR'
            });
        }
        else {
            res.status(500).json({
                status: 'error',
                message: 'Internal server error',
                code: 'SERVER_ERROR'
            });
        }
    }
}));
exports.default = router;
