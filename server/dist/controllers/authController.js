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
exports.refreshToken = exports.getCurrentUser = exports.logout = exports.login = exports.signup = void 0;
const User_1 = require("../models/User");
const Company_1 = require("../models/Company");
const errorHandler_1 = require("../middleware/errorHandler");
const authService_1 = require("../services/authService");
const authService = authService_1.AuthService.getInstance();
// Signup with company details
const signup = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email, password, name, company } = req.body;
        console.log('Signup attempt with data:', { email, name, hasCompany: !!company });
        // Check if user already exists
        const existingUser = yield User_1.User.findOne({ email });
        if (existingUser) {
            console.log('Signup failed - Email already registered:', email);
            throw new errorHandler_1.AppError('Email already registered', 400);
        }
        // Create user
        console.log('Creating new user...');
        const user = yield User_1.User.create({
            email,
            password,
            firstName: name.split(' ')[0],
            lastName: name.split(' ').slice(1).join(' '),
            role: 'admin',
            isActive: true
        });
        console.log('User created successfully:', { id: user._id, email: user.email });
        // Create company if provided
        let companyId;
        let companyData = null;
        if (company) {
            console.log('Creating new company...');
            const newCompany = yield Company_1.Company.create(Object.assign(Object.assign({}, company), { ownerId: user._id }));
            companyId = newCompany._id;
            companyData = newCompany;
            console.log('Company created successfully:', { id: newCompany._id, name: newCompany.name });
            // Update user with company ID
            console.log('Updating user with company ID...');
            user.companyId = companyId;
            yield user.save();
            console.log('User updated with company ID');
        }
        // Generate tokens using auth service
        const { token, refreshToken } = yield authService.login(email, password);
        // Verify the user was saved
        const savedUser = yield User_1.User.findById(user._id);
        console.log('Verified saved user:', {
            id: savedUser === null || savedUser === void 0 ? void 0 : savedUser._id,
            email: savedUser === null || savedUser === void 0 ? void 0 : savedUser.email,
            companyId: savedUser === null || savedUser === void 0 ? void 0 : savedUser.companyId
        });
        // Set refresh token as HttpOnly cookie
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
            path: '/',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });
        res.status(201).json({
            user: {
                _id: user._id,
                email: user.email,
                name: `${user.firstName} ${user.lastName}`,
                role: user.role,
                companyId
            },
            company: companyData,
            token,
            refreshToken
        });
    }
    catch (error) {
        console.error('Signup error:', error);
        next(error);
    }
});
exports.signup = signup;
// Role-based login
const login = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { email, password } = req.body;
        console.log('Login attempt for email:', email);
        // Use auth service for login
        const { user: userData, token, refreshToken } = yield authService.login(email, password);
        // Get full user data from database
        const fullUser = yield User_1.User.findById(userData.userId);
        if (!fullUser) {
            throw new errorHandler_1.AppError('User not found after login', 404);
        }
        // Get company details if user has a company
        let company = null;
        if (userData.companyId) {
            company = yield Company_1.Company.findById(userData.companyId);
            console.log('Found company:', {
                id: company === null || company === void 0 ? void 0 : company._id,
                name: company === null || company === void 0 ? void 0 : company.name,
                ownerId: company === null || company === void 0 ? void 0 : company.ownerId
            });
        }
        else {
            console.log('No company found for user');
        }
        console.log('Login successful:', {
            userId: userData.userId,
            role: userData.role,
            companyId: userData.companyId,
            hasCompany: !!company
        });
        // Set refresh token as HttpOnly cookie
        console.log('Setting refresh token cookie:', {
            hasRefreshToken: !!refreshToken,
            refreshTokenLength: refreshToken === null || refreshToken === void 0 ? void 0 : refreshToken.length,
            environment: process.env.NODE_ENV
        });
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
            path: '/',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });
        console.log('Refresh token cookie set successfully');
        res.json({
            user: {
                _id: fullUser._id,
                email: fullUser.email,
                firstName: fullUser.firstName,
                lastName: fullUser.lastName,
                role: fullUser.role,
                companyId: (_a = fullUser.companyId) === null || _a === void 0 ? void 0 : _a.toString(),
                isActive: fullUser.isActive,
                lastLogin: fullUser.lastLogin,
                createdAt: fullUser.createdAt,
                updatedAt: fullUser.updatedAt
            },
            company,
            token,
            refreshToken
        });
    }
    catch (error) {
        console.error('Login error:', error);
        next(error);
    }
});
exports.login = login;
// Logout
const logout = (req, res) => {
    // Clear refresh token cookie
    res.clearCookie('refreshToken');
    res.json({ message: 'Logged out successfully' });
};
exports.logout = logout;
// Get current user
const getCurrentUser = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!req.user) {
            throw new errorHandler_1.AppError('Not authenticated', 401);
        }
        const user = yield User_1.User.findById(req.user.userId).select('-password');
        if (!user) {
            throw new errorHandler_1.AppError('User not found', 404);
        }
        // Get company details if user has a company
        let company = null;
        if (user.companyId) {
            company = yield Company_1.Company.findById(user.companyId);
            console.log('Current user company:', {
                id: company === null || company === void 0 ? void 0 : company._id,
                name: company === null || company === void 0 ? void 0 : company.name,
                ownerId: company === null || company === void 0 ? void 0 : company.ownerId
            });
        }
        console.log('Current user:', {
            id: user._id,
            role: user.role,
            companyId: user.companyId,
            hasCompany: !!company
        });
        res.json({
            user: {
                _id: user._id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
                companyId: user.companyId,
                isActive: user.isActive,
                lastLogin: user.lastLogin,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            },
            company
        });
    }
    catch (error) {
        next(error);
    }
});
exports.getCurrentUser = getCurrentUser;
// Refresh token
const refreshToken = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        console.log('Refresh token request received');
        // Get refresh token from cookie
        const refreshToken = (_a = req.cookies) === null || _a === void 0 ? void 0 : _a.refreshToken;
        if (!refreshToken) {
            console.log('No refresh token found in cookies');
            throw new errorHandler_1.AppError('No refresh token available', 401);
        }
        console.log('Refresh token found, attempting to refresh...');
        // Use auth service to refresh token
        const { token: newAccessToken, refreshToken: newRefreshToken } = yield authService.refreshToken(refreshToken);
        console.log('Token refresh successful');
        // Set new refresh token as HttpOnly cookie
        res.cookie('refreshToken', newRefreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
            path: '/',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });
        res.json({
            token: newAccessToken,
            refreshToken: newRefreshToken
        });
    }
    catch (error) {
        console.error('Refresh token error:', error);
        next(error);
    }
});
exports.refreshToken = refreshToken;
