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
const User_1 = require("../models/User");
const auth_1 = require("../middleware/auth");
const errorHandler_1 = require("../middleware/errorHandler");
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
        let query = { role: 'agent' };
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
// Apply auth middleware to all routes below this point
router.use(auth_1.auth);
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
        res.json({
            status: 'success',
            data: user
        });
    }
    catch (error) {
        console.error('Error in GET /me:', error);
        next(error);
    }
}));
// Get all users - Admin only
router.get('/', (0, auth_1.authorize)(['admin']), (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('GET / route hit');
        console.log('Fetching users with filters:', req.query);
        // Build query based on filters
        const query = {};
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
// Create new user - Admin only
router.post('/', (0, auth_1.authorize)(['admin']), (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    console.log('POST / route hit');
    try {
        const user = yield (0, userController_1.createUser)(req.body);
        console.log('User created:', user);
        res.status(201).json({
            status: 'success',
            data: user
        });
    }
    catch (error) {
        console.error('Error in POST /:', error);
        next(error);
    }
}));
exports.default = router;
