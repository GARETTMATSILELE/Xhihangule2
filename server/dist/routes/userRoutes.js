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
const userController_1 = require("../controllers/userController");
const userController_2 = require("../controllers/userController");
const User_1 = require("../models/User");
const auth_1 = require("../middleware/auth");
const errorHandler_1 = require("../middleware/errorHandler");
const multer_1 = __importDefault(require("multer"));
const emailService_1 = require("../services/emailService");
function escapeHtml(s) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
const router = express_1.default.Router();
// Debug middleware for user routes
router.use((req, res, next) => {
    console.log('User route accessed:', {
        method: req.method,
        path: req.path,
        body: req.body,
        headers: req.headers,
        cookies: req.cookies
    });
    next();
});
// Public endpoint for getting agents (for admin dashboard) - NO AUTH REQUIRED
router.get('/public/agents', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('Public agents request:', {
            query: req.query,
            headers: req.headers
        });
        // Get company ID from query params or headers (for admin dashboard)
        const companyId = req.query.companyId || req.headers['x-company-id'];
        const role = req.query.role || 'agent';
        let query = { $or: [{ role }, { roles: role }], isArchived: { $ne: true } };
        // Filter by company ID if provided
        if (companyId) {
            query.companyId = companyId;
        }
        console.log('Public agents query:', query);
        const agents = yield User_1.User.find(query)
            .select('firstName lastName email role companyId')
            .sort({ firstName: 1, lastName: 1 });
        console.log(`Found ${agents.length} agents`);
        res.json({
            status: 'success',
            data: agents,
            count: agents.length,
            companyId: companyId || null
        });
    }
    catch (error) {
        console.error('Error fetching agents (public):', error);
        res.status(500).json({
            status: 'error',
            message: 'Error fetching agents',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}));
// Multer for avatar uploads (images only, memory storage)
const avatarUpload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype && file.mimetype.startsWith('image/')) {
            cb(null, true);
        }
        else {
            cb(new Error('Only image files are allowed for avatar'));
        }
    }
});
// Update current user's own profile (no company required)
router.put('/me', auth_1.auth, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
            throw new errorHandler_1.AppError('User not authenticated', 401);
        }
        // Whitelist updatable fields for self-update
        const { firstName, lastName, phone, language, timezone, notifications, twoFactorEnabled } = req.body || {};
        const updates = {};
        if (typeof firstName === 'string')
            updates.firstName = firstName;
        if (typeof lastName === 'string')
            updates.lastName = lastName;
        if (typeof phone === 'string')
            updates.phone = phone;
        if (typeof language === 'string')
            updates.language = language;
        if (typeof timezone === 'string')
            updates.timezone = timezone;
        if (typeof twoFactorEnabled === 'boolean')
            updates.twoFactorEnabled = twoFactorEnabled;
        if (notifications && typeof notifications === 'object')
            updates.notifications = notifications;
        const updated = yield User_1.User.findByIdAndUpdate(req.user.userId, { $set: updates }, { new: true }).select('-password');
        if (!updated) {
            throw new errorHandler_1.AppError('User not found', 404);
        }
        res.json({ status: 'success', data: updated });
    }
    catch (error) {
        next(error);
    }
}));
// Upload/update current user's avatar
router.post('/me/avatar', auth_1.auth, avatarUpload.single('avatar'), (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
            throw new errorHandler_1.AppError('User not authenticated', 401);
        }
        const file = req.file;
        if (!file) {
            throw new errorHandler_1.AppError('No avatar file uploaded', 400);
        }
        if (!file.mimetype || !file.mimetype.startsWith('image/')) {
            throw new errorHandler_1.AppError('Invalid file type. Only images are allowed.', 400);
        }
        const base64 = file.buffer.toString('base64');
        const updated = yield User_1.User.findByIdAndUpdate(req.user.userId, { $set: { avatar: base64, avatarMimeType: file.mimetype } }, { new: true }).select('_id avatar avatarMimeType');
        if (!updated) {
            throw new errorHandler_1.AppError('User not found', 404);
        }
        const avatarUrl = `data:${updated.avatarMimeType || 'image/png'};base64,${updated.avatar}`;
        res.json({ status: 'success', data: { avatarUrl } });
    }
    catch (error) {
        // Handle Multer file size errors gracefully
        if ((error === null || error === void 0 ? void 0 : error.code) === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ status: 'error', message: 'Avatar exceeds maximum size of 10MB. Please upload a smaller image.' });
        }
        next(error);
    }
}));
// Update current user's password (no company required)
router.put('/me/password', auth_1.auth, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
            throw new errorHandler_1.AppError('User not authenticated', 401);
        }
        const { currentPassword, newPassword } = req.body || {};
        if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
            throw new errorHandler_1.AppError('Current and new passwords are required', 400);
        }
        const user = yield User_1.User.findById(req.user.userId);
        if (!user) {
            throw new errorHandler_1.AppError('User not found', 404);
        }
        const isMatch = yield user.comparePassword(currentPassword);
        if (!isMatch) {
            throw new errorHandler_1.AppError('Current password is incorrect', 400);
        }
        user.password = newPassword;
        yield user.save();
        res.json({ status: 'success' });
    }
    catch (error) {
        next(error);
    }
}));
// Apply auth middleware to all routes below this point
router.use(auth_1.authWithCompany);
// Test route to verify user routes are working
router.get('/test', (req, res) => {
    console.log('Test route hit');
    res.json({ message: 'User routes are working' });
});
// Get current user
router.get('/me', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    console.log('GET /me route hit');
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
            throw new errorHandler_1.AppError('User not authenticated', 401);
        }
        const user = yield (0, userController_1.getCurrentUser)(req.user.userId);
        console.log('Current user found:', user);
        const safe = typeof (user === null || user === void 0 ? void 0 : user.toObject) === 'function' ? user.toObject() : user;
        if (safe === null || safe === void 0 ? void 0 : safe.avatar) {
            safe.avatarUrl = `data:${safe.avatarMimeType || 'image/png'};base64,${safe.avatar}`;
        }
        res.json({
            status: 'success',
            data: safe
        });
    }
    catch (error) {
        console.error('Error in GET /me:', error);
        next(error);
    }
}));
// Get all users - Admin only
router.get('/', (0, auth_1.authorize)(['admin']), (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        console.log('GET / route hit');
        console.log('Fetching users with filters:', req.query);
        // Build query based on filters and enforce company scoping
        const query = { companyId: (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId, isArchived: { $ne: true } };
        if (req.query.role) {
            query.role = req.query.role;
        }
        const users = yield User_1.User.find(query).select('-password');
        console.log('Found users:', users.length);
        res.json(users);
    }
    catch (error) {
        console.error('Error in GET /:', error);
        next(error);
    }
}));
// Get agents for current company - Admin, Accountant, Agent, Sales, Principal, PREA
router.get('/agents', (0, auth_1.authorize)(['admin', 'accountant', 'agent', 'sales', 'principal', 'prea']), (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        console.log('GET /agents route hit');
        const role = req.query.role || 'agent';
        const query = {
            companyId: (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId,
            $or: [{ role }, { roles: role }],
            isArchived: { $ne: true }
        };
        const agents = yield User_1.User.find(query).select('firstName lastName email role roles companyId');
        console.log('Found agents:', agents.length);
        res.json(agents);
    }
    catch (error) {
        console.error('Error in GET /agents:', error);
        next(error);
    }
}));
// Commission summary for user (agent) - self, admin, accountant
router.get('/:id/commission', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // authWithCompany is already applied above; just delegate to controller
        yield (0, userController_2.getUserCommissionSummary)(req, res);
    }
    catch (error) {
        next(error);
    }
}));
// Create new user - Admin only
router.post('/', (0, auth_1.authorize)(['admin']), (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    console.log('POST / route hit');
    try {
        const payload = Object.assign(Object.assign({}, req.body), { companyId: (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId });
        const user = yield (0, userController_1.createUser)(payload);
        console.log('User created:', user);
        // Email the new user that their account has been created (non-fatal if email fails)
        let accountCreatedEmailSent = false;
        try {
            const to = String((user === null || user === void 0 ? void 0 : user.email) || '').trim();
            if (to) {
                const linkBase = process.env.CLIENT_URL || process.env.APP_BASE_URL || 'http://localhost:3000';
                const loginUrl = `${String(linkBase).replace(/\/+$/, '')}/login`;
                const fullName = [String((user === null || user === void 0 ? void 0 : user.firstName) || ''), String((user === null || user === void 0 ? void 0 : user.lastName) || '')]
                    .filter((p) => p && p.trim())
                    .join(' ')
                    .trim();
                const greeting = fullName ? `Hi ${fullName},` : 'Hello,';
                const subject = 'Your account has been created';
                const plain = [
                    greeting,
                    '',
                    'An administrator has created an account for you.',
                    'Please log in to access your account.',
                    '',
                    `Login: ${loginUrl}`,
                ].join('\n');
                const html = [
                    `<p>${escapeHtml(greeting)}</p>`,
                    '<p>An administrator has created an account for you.</p>',
                    '<p>Please log in to access your account.</p>',
                    `<p><a href="${loginUrl}" target="_blank" rel="noopener noreferrer">Log in</a></p>`,
                    `<p style="color:#6b7280;font-size:12px">If you did not expect this email, please ignore it or contact your administrator.</p>`,
                ].join('');
                yield (0, emailService_1.sendMail)({ to, subject, html, text: plain });
                accountCreatedEmailSent = true;
            }
        }
        catch (e) {
            console.warn('[userRoutes] Failed to send account created email:', (e === null || e === void 0 ? void 0 : e.message) || e);
        }
        res.status(201).json({
            status: 'success',
            data: user,
            meta: { accountCreatedEmailSent }
        });
    }
    catch (error) {
        console.error('Error in POST /:', error);
        next(error);
    }
}));
// Update user by ID - Admin only
router.put('/:id', (0, auth_1.authorize)(['admin']), (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const updated = yield (0, userController_1.updateUserById)(req.params.id, req.body, (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId);
        res.json({ status: 'success', data: updated });
    }
    catch (error) {
        next(error);
    }
}));
// Archive (soft-delete) user by ID - Admin only
router.delete('/:id', (0, auth_1.authorize)(['admin']), (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const result = yield (0, userController_1.deleteUserById)(req.params.id, (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId, (_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId);
        res.json({
            status: 'success',
            message: result.alreadyArchived ? 'User already archived' : 'User archived successfully',
            data: result
        });
    }
    catch (error) {
        next(error);
    }
}));
exports.default = router;
