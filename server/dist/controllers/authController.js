"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.refreshToken = exports.getCurrentUser = exports.logout = exports.resetPassword = exports.requestPasswordReset = exports.login = exports.signup = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const crypto_1 = __importDefault(require("crypto"));
const User_1 = require("../models/User");
const Company_1 = require("../models/Company");
const errorHandler_1 = require("../middleware/errorHandler");
const authService_1 = require("../services/authService");
const emailService_1 = require("../services/emailService");
const subscriptionService_1 = require("../services/subscriptionService");
const auditService_1 = require("../services/auditService");
const normalization_1 = require("../utils/normalization");
const publicSignupCompany_1 = require("../utils/publicSignupCompany");
const onboardingService_1 = require("../services/onboardingService");
const authService = authService_1.AuthService.getInstance();
const subscriptionService = subscriptionService_1.SubscriptionService.getInstance();
// Compute cookie domain for production based on env. Prefer explicit COOKIE_DOMAIN.
// Falls back to deriving from CLIENT_URL or APP_BASE_URL. Returns value suitable for cookie 'domain'.
function getCookieDomain() {
    const explicit = (process.env.COOKIE_DOMAIN || '').trim();
    if (explicit)
        return explicit;
    const fromUrl = (process.env.CLIENT_URL || process.env.APP_BASE_URL || '').trim();
    if (!fromUrl)
        return undefined;
    try {
        const hostname = new URL(fromUrl).hostname;
        // Use leading dot for cross-subdomain
        return hostname.startsWith('www.') ? `.${hostname.slice(4)}` : `.${hostname}`;
    }
    catch (_a) {
        return undefined;
    }
}
function clearAuthCookies(res) {
    const prod = process.env.NODE_ENV === 'production';
    const domain = getCookieDomain();
    const base = Object.assign({ path: '/', sameSite: prod ? 'strict' : 'lax', secure: prod }, (prod && domain ? { domain } : {}));
    try {
        res.clearCookie('refreshToken', Object.assign(Object.assign({}, base), { httpOnly: true }));
    }
    catch (_a) { }
    try {
        res.clearCookie('accessToken', Object.assign(Object.assign({}, base), { httpOnly: true }));
    }
    catch (_b) { }
    try {
        res.clearCookie('refreshCsrf', Object.assign(Object.assign({}, base), { httpOnly: false }));
    }
    catch (_c) { }
}
// Signup with company details
const signup = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    try {
        if (!(0, publicSignupCompany_1.isPublicSignupAllowed)(process.env)) {
            throw new errorHandler_1.AppError('Public signup is disabled', 403, 'SIGNUP_DISABLED');
        }
        const { email: rawEmail, password, name, company, plan: inputPlan } = req.body;
        const email = (0, normalization_1.normalizeEmail)(rawEmail);
        if (!email || !password || !name) {
            throw new errorHandler_1.AppError('Email, password and name are required', 400, 'VALIDATION_ERROR');
        }
        // Check if user already exists
        const existingUser = yield User_1.User.findOne({ email });
        if (existingUser) {
            throw new errorHandler_1.AppError('Email already registered', 400, 'DUPLICATE_EMAIL');
        }
        const selectedPlan = (inputPlan && ['INDIVIDUAL', 'SME', 'ENTERPRISE'].includes(inputPlan)) ? inputPlan : 'ENTERPRISE';
        const wantsCompany = Boolean(company) || selectedPlan === 'INDIVIDUAL';
        if (process.env.NODE_ENV === 'production' && wantsCompany) {
            const companyPayload = company ? Object.assign(Object.assign({}, (0, publicSignupCompany_1.publicSignupCompanyFields)(company)), { companyType: company.companyType, workspaceType: company.workspaceType }) : {
                name: String(name).trim() || 'Individual Owner',
                email,
                address: 'N/A',
                phone: '0000000000',
                registrationNumber: `REG-${Date.now().toString().slice(-6)}`,
                tinNumber: `TIN-${Date.now().toString().slice(-6)}`,
                country: 'Zimbabwe',
                companyType: 'INDIVIDUAL_LANDLORD',
                workspaceType: 'individual'
            };
            const result = yield onboardingService_1.OnboardingService.getInstance().start({
                email,
                password,
                name,
                plan: selectedPlan,
                billingCycle: 'monthly',
                company: {
                    name: String(companyPayload.name || ''),
                    email: companyPayload.email,
                    address: companyPayload.address,
                    phone: companyPayload.phone,
                    website: companyPayload.website,
                    registrationNumber: companyPayload.registrationNumber,
                    tinNumber: companyPayload.tinNumber,
                    vatNumber: companyPayload.vatNumber,
                    country: companyPayload.country,
                    companyType: companyPayload.companyType,
                    workspaceType: companyPayload.workspaceType
                },
                idempotencyKey: req.get('idempotency-key') || undefined
            });
            const { token, refreshToken } = yield authService.login(email, password);
            const cookieDomain = getCookieDomain();
            const prod = process.env.NODE_ENV === 'production';
            const scoped = prod && cookieDomain ? { domain: cookieDomain } : {};
            res.cookie('refreshToken', refreshToken, Object.assign(Object.assign({ httpOnly: true, secure: prod, sameSite: 'strict', path: '/' }, scoped), { maxAge: 7 * 24 * 60 * 60 * 1000 }));
            res.cookie('accessToken', token, Object.assign(Object.assign({ httpOnly: true, secure: prod, sameSite: 'strict', path: '/' }, scoped), { maxAge: 24 * 60 * 60 * 1000 }));
            res.cookie('refreshCsrf', crypto_1.default.randomBytes(32).toString('hex'), Object.assign(Object.assign({ httpOnly: false, secure: prod, sameSite: 'strict', path: '/' }, scoped), { maxAge: 7 * 24 * 60 * 60 * 1000 }));
            return res.status(result.alreadyProcessed ? 200 : 201).json({
                user: {
                    _id: (_a = result.user) === null || _a === void 0 ? void 0 : _a._id,
                    email: (_b = result.user) === null || _b === void 0 ? void 0 : _b.email,
                    name: `${((_c = result.user) === null || _c === void 0 ? void 0 : _c.firstName) || ''} ${((_d = result.user) === null || _d === void 0 ? void 0 : _d.lastName) || ''}`.trim(),
                    role: (_e = result.user) === null || _e === void 0 ? void 0 : _e.role,
                    companyId: (_f = result.user) === null || _f === void 0 ? void 0 : _f.companyId
                },
                company: result.company,
                paymentSession: result.paymentSession ? {
                    _id: result.paymentSession._id,
                    amount: result.paymentSession.amount,
                    currency: result.paymentSession.currency,
                    status: result.paymentSession.status
                } : null,
                registration: {
                    status: ((_g = result.company) === null || _g === void 0 ? void 0 : _g.onboardingStatus) || 'INITIALIZING_WORKSPACE',
                    nextStep: ((_h = result.company) === null || _h === void 0 ? void 0 : _h.onboardingStatus) === 'PENDING_PAYMENT' ? 'payment' : 'workspace',
                    paymentRequired: ((_j = result.company) === null || _j === void 0 ? void 0 : _j.onboardingStatus) === 'PENDING_PAYMENT'
                },
                token
            });
        }
        // Determine role: ALWAYS create admin accounts on signup
        const assignedRole = 'admin';
        // Create user and (optionally) company atomically in a transaction
        const session = yield mongoose_1.default.startSession();
        let createdUser = null;
        let companyData = null;
        let companyId = undefined;
        try {
            yield session.withTransaction(() => __awaiter(void 0, void 0, void 0, function* () {
                var _a, _b;
                // Create user
                console.log('Creating new user...');
                const [firstNameRaw, ...lastParts] = String(name).trim().split(/\s+/);
                const firstName = firstNameRaw || 'User';
                const lastName = lastParts.join(' ') || firstNameRaw || 'Admin';
                const newUser = new User_1.User({
                    email,
                    password,
                    firstName,
                    lastName,
                    role: assignedRole,
                    isActive: true
                });
                yield newUser.save({ session });
                createdUser = newUser;
                console.log('User created successfully:', { id: createdUser._id, email: createdUser.email });
                // Create company if provided OR auto-create for INDIVIDUAL plan
                const isIndividualPlan = (inputPlan && ['INDIVIDUAL', 'SME', 'ENTERPRISE'].includes(inputPlan)) ? inputPlan === 'INDIVIDUAL' : false;
                if (company || isIndividualPlan) {
                    const requiredCompanyFields = ['name', 'address', 'phone', 'email', 'registrationNumber', 'tinNumber'];
                    const baseName = `${firstName} ${lastName}`.trim();
                    const nowSuffix = `${Date.now()}`.slice(-6);
                    const autoCompany = company ? (0, publicSignupCompany_1.publicSignupCompanyFields)(company) : {
                        name: baseName || 'Individual Owner',
                        description: 'Auto-created individual plan company',
                        email: email,
                        address: 'N/A',
                        phone: '0000000000',
                        website: undefined,
                        registrationNumber: `REG-${nowSuffix}`,
                        tinNumber: `TIN-${nowSuffix}`,
                        vatNumber: undefined
                    };
                    const missing = requiredCompanyFields.filter((f) => !autoCompany[f]);
                    if (missing.length > 0) {
                        throw new errorHandler_1.AppError(`Missing company fields: ${missing.join(', ')}`, 400, 'VALIDATION_ERROR');
                    }
                    console.log('Creating new company...');
                    const { PLAN_CONFIG } = yield Promise.resolve().then(() => __importStar(require('../types/plan')));
                    const plan = (inputPlan && ['INDIVIDUAL', 'SME', 'ENTERPRISE'].includes(inputPlan)) ? inputPlan : 'ENTERPRISE';
                    const cfg = PLAN_CONFIG[plan];
                    const workspaceType = (0, normalization_1.normalizeWorkspaceType)((_a = company === null || company === void 0 ? void 0 : company.workspaceType) !== null && _a !== void 0 ? _a : (_b = req.body) === null || _b === void 0 ? void 0 : _b.workspaceType, cfg.workspaceType);
                    const companyDoc = new Company_1.Company(Object.assign(Object.assign({}, autoCompany), { ownerId: createdUser._id, workspaceType,
                        plan, propertyLimit: cfg.propertyLimit, featureFlags: cfg.featureFlags }));
                    const newCompany = yield companyDoc.save({ session });
                    companyId = newCompany._id;
                    companyData = newCompany;
                    console.log('Company created successfully:', { id: newCompany._id, name: newCompany.name });
                    // Update user with company ID
                    console.log('Updating user with company ID...');
                    createdUser.companyId = companyId;
                    yield createdUser.save({ session });
                    console.log('User updated with company ID');
                    // Create trial subscription for the new company
                    console.log('Creating trial subscription...');
                    yield subscriptionService.createTrialSubscription(companyId.toString(), plan, 14 // 14-day trial
                    );
                    console.log('Trial subscription created successfully');
                }
            }));
        }
        catch (txError) {
            const msg = String((txError === null || txError === void 0 ? void 0 : txError.message) || '');
            const isTxnUnsupported = msg.includes('Transaction numbers are only allowed on a replica set member or mongos');
            if (isTxnUnsupported) {
                console.warn('MongoDB transactions unsupported. Falling back to non-transactional flow with compensation.');
                try {
                    // Create user without session
                    console.log('Creating new user (fallback)...');
                    const [firstNameRaw, ...lastParts] = String(name).trim().split(/\s+/);
                    const firstName = firstNameRaw || 'User';
                    const lastName = lastParts.join(' ') || firstNameRaw || 'Admin';
                    createdUser = yield User_1.User.create({
                        email,
                        password,
                        firstName,
                        lastName,
                        role: assignedRole,
                        isActive: true
                    });
                    console.log('User created successfully (fallback):', { id: createdUser._id, email: createdUser.email });
                    // Fallback path: create company if provided OR auto-create for INDIVIDUAL plan
                    if (company || ((inputPlan && ['INDIVIDUAL', 'SME', 'ENTERPRISE'].includes(inputPlan)) ? inputPlan === 'INDIVIDUAL' : false)) {
                        try {
                            console.log('Creating new company (fallback)...');
                            const { PLAN_CONFIG } = yield Promise.resolve().then(() => __importStar(require('../types/plan')));
                            const plan = (inputPlan && ['INDIVIDUAL', 'SME', 'ENTERPRISE'].includes(inputPlan)) ? inputPlan : 'ENTERPRISE';
                            const cfg = PLAN_CONFIG[plan];
                            const workspaceType = (0, normalization_1.normalizeWorkspaceType)((_k = company === null || company === void 0 ? void 0 : company.workspaceType) !== null && _k !== void 0 ? _k : (_l = req.body) === null || _l === void 0 ? void 0 : _l.workspaceType, cfg.workspaceType);
                            const [firstNameRaw, ...lastParts2] = String(name).trim().split(/\s+/);
                            const firstName2 = firstNameRaw || 'User';
                            const lastName2 = lastParts2.join(' ') || firstNameRaw || 'Admin';
                            const baseName2 = `${firstName2} ${lastName2}`.trim();
                            const nowSuffix2 = `${Date.now()}`.slice(-6);
                            const autoCompany2 = company ? (0, publicSignupCompany_1.publicSignupCompanyFields)(company) : {
                                name: baseName2 || 'Individual Owner',
                                description: 'Auto-created individual plan company',
                                email: email,
                                address: 'N/A',
                                phone: '0000000000',
                                website: undefined,
                                registrationNumber: `REG-${nowSuffix2}`,
                                tinNumber: `TIN-${nowSuffix2}`,
                                vatNumber: undefined
                            };
                            const newCompany = yield Company_1.Company.create(Object.assign(Object.assign({}, autoCompany2), { ownerId: createdUser._id, workspaceType,
                                plan, propertyLimit: cfg.propertyLimit, featureFlags: cfg.featureFlags }));
                            companyId = newCompany._id;
                            companyData = newCompany;
                            console.log('Company created successfully (fallback):', { id: newCompany._id, name: newCompany.name });
                            // Update user with companyId
                            createdUser.companyId = companyId;
                            yield createdUser.save();
                            console.log('User updated with company ID (fallback)');
                            // Create trial subscription for the new company (fallback)
                            console.log('Creating trial subscription (fallback)...');
                            yield subscriptionService.createTrialSubscription(companyId.toString(), plan, 14 // 14-day trial
                            );
                            console.log('Trial subscription created successfully (fallback)');
                        }
                        catch (fallbackCompanyError) {
                            if (companyId) {
                                yield Company_1.Company.deleteOne({ _id: companyId });
                                companyId = undefined;
                                companyData = null;
                            }
                            if (createdUser === null || createdUser === void 0 ? void 0 : createdUser._id) {
                                yield User_1.User.deleteOne({ _id: createdUser._id });
                                createdUser = null;
                            }
                            if ((fallbackCompanyError === null || fallbackCompanyError === void 0 ? void 0 : fallbackCompanyError.code) === 11000) {
                                const dupMsg = String((fallbackCompanyError === null || fallbackCompanyError === void 0 ? void 0 : fallbackCompanyError.message) || 'Duplicate key error');
                                if (dupMsg.includes('tinNumber') || dupMsg.includes('taxNumber')) {
                                    return next(new errorHandler_1.AppError('Company tax number already exists', 400, 'DUPLICATE_COMPANY_TIN'));
                                }
                                return next(new errorHandler_1.AppError('Duplicate key error', 400, 'DUPLICATE_KEY'));
                            }
                            return next(fallbackCompanyError instanceof errorHandler_1.AppError
                                ? fallbackCompanyError
                                : new errorHandler_1.AppError('Registration could not be completed', 500, 'REGISTRATION_FAILED'));
                        }
                    }
                }
                catch (fallbackUserError) {
                    if ((fallbackUserError === null || fallbackUserError === void 0 ? void 0 : fallbackUserError.code) === 11000) {
                        const dupMsg = String((fallbackUserError === null || fallbackUserError === void 0 ? void 0 : fallbackUserError.message) || 'Duplicate key error');
                        if (dupMsg.includes('email_1') || dupMsg.toLowerCase().includes('email')) {
                            return next(new errorHandler_1.AppError('Email already registered', 400, 'DUPLICATE_EMAIL'));
                        }
                        return next(new errorHandler_1.AppError('Duplicate key error', 400, 'DUPLICATE_KEY'));
                    }
                    return next(fallbackUserError);
                }
            }
            else if ((txError === null || txError === void 0 ? void 0 : txError.code) === 11000) {
                if (msg.includes('email_1') || msg.toLowerCase().includes('email')) {
                    return next(new errorHandler_1.AppError('Email already registered', 400, 'DUPLICATE_EMAIL'));
                }
                if (msg.includes('tinNumber') || msg.includes('taxNumber')) {
                    return next(new errorHandler_1.AppError('Company tax number already exists', 400, 'DUPLICATE_COMPANY_TIN'));
                }
                return next(new errorHandler_1.AppError('Duplicate key error', 400, 'DUPLICATE_KEY'));
            }
            else {
                return next(txError);
            }
        }
        finally {
            session.endSession();
        }
        // Generate tokens using auth service (after successful transaction)
        const { token, refreshToken } = yield authService.login(email, password);
        // Verify the user was saved
        const savedUser = yield User_1.User.findById(createdUser._id);
        console.log('Verified saved user:', {
            id: savedUser === null || savedUser === void 0 ? void 0 : savedUser._id,
            email: savedUser === null || savedUser === void 0 ? void 0 : savedUser.email,
            companyId: savedUser === null || savedUser === void 0 ? void 0 : savedUser.companyId
        });
        // Set refresh token as HttpOnly cookie
        const cookieDomain = getCookieDomain();
        res.cookie('refreshToken', refreshToken, Object.assign(Object.assign({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax', path: '/' }, (process.env.NODE_ENV === 'production' && cookieDomain ? { domain: cookieDomain } : {})), { maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
         }));
        // Also set access token cookie so direct browser navigation to protected docs works.
        res.cookie('accessToken', token, Object.assign(Object.assign({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax', path: '/' }, (process.env.NODE_ENV === 'production' && cookieDomain ? { domain: cookieDomain } : {})), { maxAge: 24 * 60 * 60 * 1000 // 1 day
         }));
        // Set a non-HttpOnly CSRF token cookie for refresh protection
        const signupCsrf = crypto_1.default.randomBytes(32).toString('hex');
        res.cookie('refreshCsrf', signupCsrf, Object.assign(Object.assign({ httpOnly: false, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax', path: '/' }, (process.env.NODE_ENV === 'production' && cookieDomain ? { domain: cookieDomain } : {})), { maxAge: 7 * 24 * 60 * 60 * 1000 }));
        res.status(201).json({
            user: {
                _id: savedUser._id,
                email: savedUser.email,
                name: `${savedUser.firstName} ${savedUser.lastName}`,
                role: savedUser.role,
                roles: (Array.isArray(savedUser.roles) && savedUser.roles.length > 0) ? savedUser.roles : undefined,
                companyId: savedUser.companyId
            },
            company: companyData,
            token
        });
        yield (0, auditService_1.recordAuditEvent)({
            req,
            userId: savedUser._id.toString(),
            companyId: (_o = (_m = savedUser.companyId) === null || _m === void 0 ? void 0 : _m.toString) === null || _o === void 0 ? void 0 : _o.call(_m),
            action: 'auth.signup',
            entityType: 'User',
            entityId: savedUser._id.toString(),
            metadata: { plan: inputPlan || null, hasCompany: Boolean(companyData) }
        });
    }
    catch (error) {
        console.error('Signup error:', {
            message: error === null || error === void 0 ? void 0 : error.message,
            name: error === null || error === void 0 ? void 0 : error.name,
            code: error === null || error === void 0 ? void 0 : error.code,
            details: error === null || error === void 0 ? void 0 : error.details,
            stack: error === null || error === void 0 ? void 0 : error.stack
        });
        // Normalize Mongoose validation and duplicate errors
        if ((error === null || error === void 0 ? void 0 : error.name) === 'ValidationError') {
            return next(new errorHandler_1.AppError('Validation failed', 400, 'VALIDATION_ERROR', Object.values(error.errors || {}).map((e) => e.message)));
        }
        if ((error === null || error === void 0 ? void 0 : error.code) === 11000) {
            const message = String((error === null || error === void 0 ? void 0 : error.message) || 'Duplicate key error');
            if (message.includes('email_1') || message.toLowerCase().includes('email')) {
                return next(new errorHandler_1.AppError('Email already registered', 400, 'DUPLICATE_EMAIL'));
            }
            if (message.includes('tinNumber') || message.includes('taxNumber')) {
                return next(new errorHandler_1.AppError('Company tax number already exists', 400, 'DUPLICATE_COMPANY_TIN'));
            }
            return next(new errorHandler_1.AppError('Duplicate key error', 400, 'DUPLICATE_KEY'));
        }
        next(error);
    }
});
exports.signup = signup;
// Role-based login
const login = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    try {
        const { email, password } = req.body;
        const normalizedEmail = (0, normalization_1.normalizeEmail)(email);
        // Use auth service for login
        const { user: userData, token, refreshToken } = yield authService.login(normalizedEmail, password);
        // Get company details if user has a company
        let company = null;
        if (userData.companyId) {
            company = yield Company_1.Company.findById(userData.companyId).maxTimeMS(5000);
        }
        // Set refresh token as HttpOnly cookie
        const cookieDomain = getCookieDomain();
        res.cookie('refreshToken', refreshToken, Object.assign(Object.assign({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax', path: '/' }, (process.env.NODE_ENV === 'production' && cookieDomain ? { domain: cookieDomain } : {})), { maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
         }));
        res.cookie('accessToken', token, Object.assign(Object.assign({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax', path: '/' }, (process.env.NODE_ENV === 'production' && cookieDomain ? { domain: cookieDomain } : {})), { maxAge: 24 * 60 * 60 * 1000 // 1 day
         }));
        // Also set a non-HttpOnly CSRF token cookie for refresh endpoint
        const loginCsrf = crypto_1.default.randomBytes(32).toString('hex');
        res.cookie('refreshCsrf', loginCsrf, Object.assign(Object.assign({ httpOnly: false, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax', path: '/' }, (process.env.NODE_ENV === 'production' && cookieDomain ? { domain: cookieDomain } : {})), { maxAge: 7 * 24 * 60 * 60 * 1000 }));
        res.json({
            user: {
                _id: userData.userId,
                email: userData.email,
                firstName: userData.firstName,
                lastName: userData.lastName,
                role: userData.role,
                roles: (Array.isArray(userData.roles) && userData.roles.length > 0) ? userData.roles : undefined,
                companyId: (_a = userData.companyId) === null || _a === void 0 ? void 0 : _a.toString(),
                isActive: userData.isActive,
                lastLogin: userData.lastLogin,
                createdAt: userData.createdAt,
                updatedAt: userData.updatedAt
            },
            company: company ? {
                _id: company._id,
                name: company.name,
                address: company.address,
                phone: company.phone,
                email: company.email,
                website: company.website,
                registrationNumber: company.registrationNumber,
                tinNumber: company.tinNumber,
                vatNumber: company.vatNumber,
                ownerId: company.ownerId,
                description: company.description,
                logo: company.logo,
                isActive: company.isActive,
                subscriptionStatus: company.subscriptionStatus,
                subscriptionEndDate: company.subscriptionEndDate,
                companyType: company.companyType,
                workspaceType: company.workspaceType,
                bankAccounts: company.bankAccounts,
                commissionConfig: company.commissionConfig,
                plan: company.plan,
                propertyLimit: company.propertyLimit,
                featureFlags: company.featureFlags,
                createdAt: company.createdAt,
                updatedAt: company.updatedAt
            } : null,
            token
        });
        yield (0, auditService_1.recordAuditEvent)({
            req,
            userId: userData.userId,
            companyId: (_c = (_b = userData.companyId) === null || _b === void 0 ? void 0 : _b.toString) === null || _c === void 0 ? void 0 : _c.call(_b),
            action: 'auth.login',
            entityType: 'User',
            entityId: userData.userId
        });
    }
    catch (error) {
        yield (0, auditService_1.recordAuditEvent)({
            req,
            action: 'auth.login_failed',
            entityType: 'User',
            status: 'failure',
            metadata: { email: (_d = req.body) === null || _d === void 0 ? void 0 : _d.email }
        });
        console.error('Login error:', error);
        // Normalize known auth errors to 401 with message
        const message = (error === null || error === void 0 ? void 0 : error.message) || 'Authentication failed';
        if (message === 'Invalid credentials' || message === 'Account is inactive') {
            return res.status(message === 'Invalid credentials' ? 401 : 403).json({
                status: 'error',
                message,
                code: message === 'Invalid credentials' ? 'AUTH_ERROR' : 'ACCOUNT_INACTIVE'
            });
        }
        next(error);
    }
});
exports.login = login;
// Request password reset: create token, store hash+expiry, email link
const requestPasswordReset = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    // Log so we can confirm in Azure Log stream that this route was hit
    console.log('[auth] forgot-password request received', { path: req.path, method: req.method, hasBody: !!req.body });
    try {
        const { email } = req.body;
        if (!email) {
            throw new errorHandler_1.AppError('Email is required', 400, 'VALIDATION_ERROR');
        }
        const user = yield User_1.User.findOne({ email: String(email).toLowerCase() });
        // Return 404 when email is not found (explicit behavior as requested)
        if (!user) {
            return res.status(404).json({ message: 'Email not found' });
        }
        const token = crypto_1.default.randomBytes(32).toString('hex');
        const tokenHash = crypto_1.default.createHash('sha256').update(token).digest('hex');
        user.resetPasswordToken = tokenHash;
        user.resetPasswordExpires = new Date(Date.now() + 1000 * 60 * 15); // 15 minutes
        yield user.save();
        // Always use the MANTIS base URL for password reset links
        // Prefer explicit brand var; do NOT fall back to generic APP_BASE_URL (to avoid XHI domain)
        const baseUrl = process.env.APP_BASE_URL_MANTIS ||
            'https://www.mantisafrica.com';
        const resetUrl = `${baseUrl}/reset-password?token=${token}&email=${encodeURIComponent(user.email)}`;
        yield (0, emailService_1.sendMail)({
            to: user.email,
            subject: 'Password Reset Request',
            html: `
        <p>You requested a password reset.</p>
        <p>Click the link below to reset your password. This link expires in 15 minutes.</p>
        <p><a href="${resetUrl}">Reset your password</a></p>
        <p>If you did not request this, you can safely ignore this email.</p>
      `,
            text: `Reset your password: ${resetUrl}`
        });
        return res.json({ message: 'A password reset link has been sent to your email' });
    }
    catch (error) {
        next(error);
    }
});
exports.requestPasswordReset = requestPasswordReset;
// Reset password using token
const resetPassword = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { token, email, password } = req.body;
        if (!token || !email || !password) {
            throw new errorHandler_1.AppError('Token, email and new password are required', 400, 'VALIDATION_ERROR');
        }
        const tokenHash = crypto_1.default.createHash('sha256').update(token).digest('hex');
        const user = yield User_1.User.findOne({
            email: String(email).toLowerCase(),
            resetPasswordToken: tokenHash,
            resetPasswordExpires: { $gt: new Date() }
        });
        if (!user) {
            throw new errorHandler_1.AppError('Invalid or expired reset token', 400, 'INVALID_TOKEN');
        }
        user.password = password;
        user.passwordChangedAt = new Date();
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        yield user.save();
        return res.json({ message: 'Password has been reset successfully' });
    }
    catch (error) {
        next(error);
    }
});
exports.resetPassword = resetPassword;
// Logout
const logout = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    clearAuthCookies(res);
    yield (0, auditService_1.recordAuditEvent)({
        req,
        action: 'auth.logout',
        entityType: 'Session',
        metadata: { hasAccessToken: Boolean((_a = req.cookies) === null || _a === void 0 ? void 0 : _a.accessToken) }
    });
    res.json({ message: 'Logged out successfully' });
});
exports.logout = logout;
// Get current user
const getCurrentUser = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!req.user) {
            throw new errorHandler_1.AppError('Not authenticated', 401);
        }
        const user = yield authService.getUserContext(req.user.userId);
        if (!user) {
            throw new errorHandler_1.AppError('User not found', 404);
        }
        // Get company details if user has a company
        let company = null;
        if (user.companyId) {
            company = yield Company_1.Company.findById(user.companyId);
        }
        res.json({
            user: Object.assign({ _id: user.userId, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role, roles: (Array.isArray(user.roles) && user.roles.length > 0) ? user.roles : undefined, companyId: user.companyId, isActive: user.isActive, lastLogin: user.lastLogin, createdAt: user.createdAt, updatedAt: user.updatedAt }, (user.avatarUrl ? { avatarUrl: user.avatarUrl } : {})),
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
    var _a, _b;
    try {
        // Get refresh token from cookie
        const refreshToken = (_a = req.cookies) === null || _a === void 0 ? void 0 : _a.refreshToken;
        if (!refreshToken) {
            throw new errorHandler_1.AppError('No refresh token available', 401);
        }
        // Double-submit cookie CSRF protection
        const csrfHeader = req.headers['x-refresh-csrf'] || req.get('x-refresh-csrf');
        const csrfCookie = (_b = req.cookies) === null || _b === void 0 ? void 0 : _b.refreshCsrf;
        if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
            throw new errorHandler_1.AppError('CSRF token missing or invalid', 403, 'CSRF_MISMATCH');
        }
        // Use auth service to refresh token
        const { token: newAccessToken, refreshToken: newRefreshToken } = yield authService.refreshToken(refreshToken);
        // Set new refresh token as HttpOnly cookie
        const cookieDomain = getCookieDomain();
        res.cookie('refreshToken', newRefreshToken, Object.assign(Object.assign({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax', path: '/' }, (process.env.NODE_ENV === 'production' && cookieDomain ? { domain: cookieDomain } : {})), { maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
         }));
        res.cookie('accessToken', newAccessToken, Object.assign(Object.assign({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax', path: '/' }, (process.env.NODE_ENV === 'production' && cookieDomain ? { domain: cookieDomain } : {})), { maxAge: 24 * 60 * 60 * 1000 // 1 day
         }));
        // Rotate CSRF cookie
        const rotatedCsrf = crypto_1.default.randomBytes(32).toString('hex');
        res.cookie('refreshCsrf', rotatedCsrf, Object.assign(Object.assign({ httpOnly: false, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax', path: '/' }, (process.env.NODE_ENV === 'production' && cookieDomain ? { domain: cookieDomain } : {})), { maxAge: 7 * 24 * 60 * 60 * 1000 }));
        res.json({
            token: newAccessToken
        });
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError && (error.statusCode === 401 || error.statusCode === 403)) {
            clearAuthCookies(res);
        }
        console.error('Refresh token error:', error);
        next(error);
    }
});
exports.refreshToken = refreshToken;
