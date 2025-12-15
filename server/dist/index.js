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
const express_1 = __importDefault(require("express"));
const compression_1 = __importDefault(require("compression"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const path_1 = __importDefault(require("path"));
const propertyRoutes_1 = __importDefault(require("./routes/propertyRoutes"));
const billingRoutes_1 = __importDefault(require("./routes/billingRoutes"));
const tenantRoutes_1 = __importDefault(require("./routes/tenantRoutes"));
const leaseRoutes_1 = __importDefault(require("./routes/leaseRoutes"));
const paymentRoutes_1 = __importDefault(require("./routes/paymentRoutes"));
const chartRoutes_1 = __importDefault(require("./routes/chartRoutes"));
const auth_1 = __importDefault(require("./routes/auth"));
const companyRoutes_1 = __importDefault(require("./routes/companyRoutes"));
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const agentRoutes_1 = __importDefault(require("./routes/agentRoutes"));
const accountantRoutes_1 = __importDefault(require("./routes/accountantRoutes"));
const fileRoutes_1 = __importDefault(require("./routes/fileRoutes"));
const propertyOwnerRoutes_1 = __importDefault(require("./routes/propertyOwnerRoutes"));
const salesOwnerRoutes_1 = __importDefault(require("./routes/salesOwnerRoutes"));
const ownerRoutes_1 = __importDefault(require("./routes/ownerRoutes"));
const healthRoutes_1 = __importDefault(require("./routes/healthRoutes"));
const maintenanceRequestRoutes_1 = __importDefault(require("./routes/maintenanceRequestRoutes"));
const levyPaymentRoutes_1 = __importDefault(require("./routes/levyPaymentRoutes"));
const municipalPaymentRoutes_1 = __importDefault(require("./routes/municipalPaymentRoutes"));
const paymentRequestRoutes_1 = __importDefault(require("./routes/paymentRequestRoutes"));
const notificationRoutes_1 = __importDefault(require("./routes/notificationRoutes"));
const invoiceRoutes_1 = __importDefault(require("./routes/invoiceRoutes"));
const syncRoutes_1 = __importDefault(require("./routes/syncRoutes"));
const subscriptionRoutes_1 = __importDefault(require("./routes/subscriptionRoutes"));
const fiscalRoutes_1 = __importDefault(require("./routes/fiscalRoutes"));
const dealRoutes_1 = __importDefault(require("./routes/dealRoutes"));
const buyerRoutes_1 = __importDefault(require("./routes/buyerRoutes"));
const leadRoutes_1 = __importDefault(require("./routes/leadRoutes"));
const viewingRoutes_1 = __importDefault(require("./routes/viewingRoutes"));
const valuationRoutes_1 = __importDefault(require("./routes/valuationRoutes"));
const developmentRoutes_1 = __importDefault(require("./routes/developmentRoutes"));
const developmentUnitRoutes_1 = __importDefault(require("./routes/developmentUnitRoutes"));
const maintenanceRoutes_1 = __importDefault(require("./routes/maintenanceRoutes"));
const inspectionRoutes_1 = __importDefault(require("./routes/inspectionRoutes"));
const salesFileRoutes_1 = __importDefault(require("./routes/salesFileRoutes"));
const paypalRoutes_1 = __importDefault(require("./routes/paypalRoutes"));
const database_1 = require("./config/database");
const errorHandler_1 = require("./middleware/errorHandler");
const http_1 = require("http");
const socket_1 = require("./config/socket");
const startSyncServices_1 = require("./scripts/startSyncServices");
const reportRoutes_1 = __importDefault(require("./routes/reportRoutes"));
const publicReportRoutes_1 = __importDefault(require("./routes/publicReportRoutes"));
const propertyAccountService_1 = require("./services/propertyAccountService");
const SystemSetting_1 = __importDefault(require("./models/SystemSetting"));
const propertyAccountService_2 = require("./services/propertyAccountService");
const systemAdminRoutes_1 = __importDefault(require("./routes/systemAdminRoutes"));
const User_1 = require("./models/User");
const Company_1 = require("./models/Company");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
// Load environment variables (support .env.production if NODE_ENV=production or ENV_FILE override)
const ENV_FILE = process.env.ENV_FILE || (process.env.NODE_ENV === 'production' ? '.env.production' : '.env');
// Resolve the env file relative to the compiled/runtime directory so it works from both src/ and dist/
const ENV_PATH = path_1.default.resolve(__dirname, '..', ENV_FILE);
dotenv_1.default.config({ path: ENV_PATH });
const app = (0, express_1.default)();
// Trust proxy (so req.protocol reflects https behind reverse proxies)
app.set('trust proxy', 1);
// Fail fast on missing critical environment in production
if (process.env.NODE_ENV === 'production') {
    const missing = [];
    if (!process.env.JWT_SECRET)
        missing.push('JWT_SECRET');
    if (!process.env.JWT_REFRESH_SECRET)
        missing.push('JWT_REFRESH_SECRET');
    if (!process.env.MONGODB_URI)
        missing.push('MONGODB_URI');
    if (missing.length > 0) {
        // eslint-disable-next-line no-console
        console.error(`Missing required environment variables in production: ${missing.join(', ')}`);
        process.exit(1);
    }
}
// Middleware
const allowedOriginsFromEnv = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
const allowedOrigins = [
    process.env.CLIENT_URL || 'http://localhost:3000',
    'http://localhost:5173', // Vite default port
    'http://localhost:3000', // Create React App default port
    // Production defaults (ensure both apex and www are allowed if env not configured)
    'https://xhihangule.com',
    'https://www.xhihangule.com',
    ...allowedOriginsFromEnv
];
// Security headers (production)
if (process.env.NODE_ENV === 'production') {
    app.use((0, helmet_1.default)({
        contentSecurityPolicy: {
            useDefaults: true,
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: [
                    "'self'",
                    "'unsafe-inline'",
                    "https://www.paypal.com",
                    "https://*.paypal.com",
                    "https://*.paypalobjects.com"
                ],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: [
                    "'self'",
                    "data:",
                    "blob:",
                    // Allow Unsplash images used on the landing page
                    "https://images.unsplash.com",
                    "https://*.unsplash.com",
                    // Some extensions or libraries may load small PNGs from gstatic
                    "https://fonts.gstatic.com",
                    // PayPal assets
                    "https://www.paypal.com",
                    "https://*.paypal.com",
                    "https://*.paypalobjects.com"
                ],
                fontSrc: ["'self'", "data:"],
                connectSrc: [
                    "'self'",
                    ...allowedOrigins,
                    // PayPal APIs (live and sandbox)
                    "https://api-m.paypal.com",
                    "https://api-m.sandbox.paypal.com",
                    // PayPal domains used by SDK
                    "https://www.paypal.com",
                    "https://*.paypal.com",
                    "https://*.paypalobjects.com"
                ],
                frameSrc: [
                    "'self'",
                    "blob:",
                    "data:",
                    "about:",
                    // PayPal checkout frames
                    "https://www.paypal.com",
                    "https://*.paypal.com",
                    "https://*.paypalobjects.com"
                ],
                objectSrc: ["'none'"]
            }
        },
        frameguard: { action: 'deny' },
        referrerPolicy: { policy: 'no-referrer' }
    }));
}
app.use((0, cors_1.default)({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin)
            return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'Origin',
        'Idempotency-Key',
        'idempotency-key'
    ],
    exposedHeaders: [
        'Idempotency-Key'
    ],
    optionsSuccessStatus: 204
}));
// Add cookie-parser middleware
app.use((0, cookie_parser_1.default)());
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '50mb' }));
// Enable gzip compression
app.use((0, compression_1.default)());
// Rate limiting
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: 'error', message: 'Too many attempts, please try again later.' }
});
const refreshLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: 'error', message: 'Too many refresh attempts, slow down.' }
});
const fileLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false
});
// Additional rate limits for password reset flow
const forgotLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: 'error', message: 'Too many password reset requests, please try again later.' }
});
const resetLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: 'error', message: 'Too many reset attempts, please try again later.' }
});
// Debug middleware only in development
if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
        const redactedHeaders = Object.assign(Object.assign({}, req.headers), { authorization: req.headers.authorization ? '[redacted]' : undefined, cookie: req.headers.cookie ? '[redacted]' : undefined });
        console.log('Incoming request:', {
            method: req.method,
            url: req.url,
            path: req.path,
            baseUrl: req.baseUrl,
            originalUrl: req.originalUrl,
            headers: redactedHeaders,
            body: req.body
        });
        next();
    });
}
// Routes
app.use('/api/properties', propertyRoutes_1.default);
app.use('/api/tenants', tenantRoutes_1.default);
app.use('/api/leases', leaseRoutes_1.default);
app.use('/api/payments', paymentRoutes_1.default);
app.use('/api/charts', chartRoutes_1.default);
// Apply targeted rate limits to sensitive endpoints
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);
app.use('/api/auth/refresh-token', refreshLimiter);
app.use('/api/auth/forgot-password', forgotLimiter);
app.use('/api/auth/reset-password', resetLimiter);
app.use('/api/files/upload', fileLimiter);
app.use('/api/auth', auth_1.default);
app.use('/api/companies', companyRoutes_1.default);
app.use('/api/users', userRoutes_1.default);
app.use('/api/agents', agentRoutes_1.default);
app.use('/api/accountants', accountantRoutes_1.default);
app.use('/api/files', fileRoutes_1.default);
app.use('/api/sales-files', salesFileRoutes_1.default);
app.use('/api/property-owners', propertyOwnerRoutes_1.default);
app.use('/api/sales-owners', salesOwnerRoutes_1.default);
app.use('/api/owners', ownerRoutes_1.default);
app.use('/api/health', healthRoutes_1.default);
app.use('/api/maintenance', maintenanceRequestRoutes_1.default);
app.use('/api/deals', dealRoutes_1.default);
app.use('/api/buyers', buyerRoutes_1.default);
app.use('/api/leads', leadRoutes_1.default);
app.use('/api/viewings', viewingRoutes_1.default);
app.use('/api/valuations', valuationRoutes_1.default);
app.use('/api/developments', developmentRoutes_1.default);
app.use('/api/development-units', developmentUnitRoutes_1.default);
app.use('/api/inspections', inspectionRoutes_1.default);
app.use('/api/maintenance', maintenanceRoutes_1.default);
app.use('/api/levy-payments', levyPaymentRoutes_1.default);
app.use('/api/municipal-payments', municipalPaymentRoutes_1.default);
app.use('/api/payment-requests', paymentRequestRoutes_1.default);
app.use('/api/notifications', notificationRoutes_1.default);
app.use('/api/invoices', invoiceRoutes_1.default);
app.use('/api/sync', syncRoutes_1.default);
app.use('/api/billing', billingRoutes_1.default);
app.use('/api/subscription', subscriptionRoutes_1.default);
app.use('/api/fiscal', fiscalRoutes_1.default);
app.use('/api/paypal', paypalRoutes_1.default);
// Reports (public and authenticated)
app.use('/api/public/reports', publicReportRoutes_1.default);
app.use('/api/reports', reportRoutes_1.default);
// System Admin (global)
app.use('/api/system-admin', systemAdminRoutes_1.default);
// Session-scoped routes to support multiple concurrent sessions in one browser profile
const sessionRouter = express_1.default.Router();
sessionRouter.use('/properties', propertyRoutes_1.default);
sessionRouter.use('/tenants', tenantRoutes_1.default);
sessionRouter.use('/leases', leaseRoutes_1.default);
sessionRouter.use('/payments', paymentRoutes_1.default);
sessionRouter.use('/charts', chartRoutes_1.default);
sessionRouter.use('/auth', auth_1.default);
sessionRouter.use('/companies', companyRoutes_1.default);
sessionRouter.use('/users', userRoutes_1.default);
sessionRouter.use('/agents', agentRoutes_1.default);
sessionRouter.use('/accountants', accountantRoutes_1.default);
sessionRouter.use('/files', fileRoutes_1.default);
sessionRouter.use('/property-owners', propertyOwnerRoutes_1.default);
sessionRouter.use('/sales-owners', salesOwnerRoutes_1.default);
sessionRouter.use('/owners', ownerRoutes_1.default);
sessionRouter.use('/health', healthRoutes_1.default);
sessionRouter.use('/maintenance', maintenanceRequestRoutes_1.default);
sessionRouter.use('/deals', dealRoutes_1.default);
sessionRouter.use('/buyers', buyerRoutes_1.default);
sessionRouter.use('/leads', leadRoutes_1.default);
sessionRouter.use('/viewings', viewingRoutes_1.default);
sessionRouter.use('/valuations', valuationRoutes_1.default);
sessionRouter.use('/developments', developmentRoutes_1.default);
sessionRouter.use('/development-units', developmentUnitRoutes_1.default);
sessionRouter.use('/inspections', inspectionRoutes_1.default);
sessionRouter.use('/levy-payments', levyPaymentRoutes_1.default);
sessionRouter.use('/municipal-payments', municipalPaymentRoutes_1.default);
sessionRouter.use('/payment-requests', paymentRequestRoutes_1.default);
sessionRouter.use('/notifications', notificationRoutes_1.default);
sessionRouter.use('/invoices', invoiceRoutes_1.default);
sessionRouter.use('/sync', syncRoutes_1.default);
sessionRouter.use('/fiscal', fiscalRoutes_1.default);
app.use('/api/s/:sessionId', sessionRouter);
// Serve client build in production
if (process.env.NODE_ENV === 'production') {
    const staticPath = path_1.default.join(__dirname, 'public');
    // Set long-term caching for hashed static assets
    app.use((req, res, next) => {
        if (req.path.startsWith('/static/')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
        next();
    });
    app.use(express_1.default.static(staticPath));
    // SPA fallback only for HTML navigation requests; avoid intercepting static asset URLs
    app.get('*', (req, res, next) => {
        const acceptHeader = req.headers['accept'] || '';
        const isHtmlRequest = typeof acceptHeader === 'string' && acceptHeader.includes('text/html');
        const isAsset = req.path.startsWith('/static/') || req.path.includes('.') || req.path.startsWith('/assets/');
        if (!isHtmlRequest || isAsset) {
            return next();
        }
        res.setHeader('Cache-Control', 'no-store');
        res.sendFile(path_1.default.join(staticPath, 'index.html'));
    });
}
// Debug route to catch unmatched requests - temporarily disabled
// app.use('/api/*', (req, res, next) => {
//   console.log('DEBUG: Unmatched API route:', req.method, req.originalUrl);
//   next();
// });
// Test route
app.get('/api/test', (req, res) => {
    res.json({ message: 'API is working' });
});
// Centralized error handling middleware
app.use(errorHandler_1.errorHandler);
const PORT = process.env.PORT || 5000;
const httpServer = (0, http_1.createServer)(app);
// Initialize Socket.IO
const { io } = (0, socket_1.initializeSocket)(httpServer);
// Start the server first so /api/health/live responds even if DB is down
httpServer.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
// Connect to MongoDB (non-fatal if it fails; readiness will report not ready)
(0, database_1.connectDatabase)()
    .then(() => __awaiter(void 0, void 0, void 0, function* () {
    console.log('Connected to MongoDB');
    try {
        // Bootstrap hardcoded System Admin and Company (idempotent)
        try {
            const hardEmail = 'garet.matsi@gmail.com';
            const hardPassword = 'Mabhadhi@1908';
            const hardCompanyName = 'Xhihangule Pvt Ltd';
            // Ensure system admin user exists first (required for Company.ownerId)
            let userDoc = yield User_1.User.findOne({ email: hardEmail });
            const hashed = yield bcryptjs_1.default.hash(hardPassword, 10);
            if (!userDoc) {
                userDoc = yield User_1.User.create({
                    email: hardEmail,
                    password: hashed,
                    firstName: 'System',
                    lastName: 'Administrator',
                    role: 'admin',
                    roles: ['admin', 'system_admin'],
                    isActive: true
                });
                console.log('Created hardcoded system admin user:', hardEmail);
            }
            else {
                // Ensure system_admin + admin roles; reset password to the hardcoded one as specified
                const roles = Array.isArray(userDoc.roles) ? userDoc.roles : [userDoc.role];
                const needsSystemAdmin = !roles.includes('system_admin');
                const needsAdmin = !roles.includes('admin') && userDoc.role !== 'admin';
                const updates = {};
                if (needsSystemAdmin || needsAdmin) {
                    const newRoles = Array.from(new Set([...(roles || []), 'system_admin', 'admin']));
                    updates.roles = newRoles;
                    if (userDoc.role !== 'admin') {
                        updates.role = 'admin';
                    }
                }
                updates.password = hashed;
                if (Object.keys(updates).length > 0) {
                    yield User_1.User.updateOne({ _id: userDoc._id }, { $set: updates });
                    console.log('Updated hardcoded system admin user configuration');
                }
            }
            // Ensure company exists with all required fields (link to system admin as owner)
            let companyDoc = yield Company_1.Company.findOne({ name: hardCompanyName });
            if (!companyDoc) {
                companyDoc = yield Company_1.Company.create({
                    name: hardCompanyName,
                    address: 'Bootstrap Address',
                    phone: '+0000000000',
                    email: 'info@xhihangule.local',
                    website: 'https://xhihangule.local',
                    registrationNumber: 'XHI-BOOTSTRAP-0001',
                    tinNumber: 'TIN-BOOTSTRAP-0001',
                    ownerId: userDoc._id,
                    isActive: true,
                    subscriptionStatus: 'trial',
                    plan: 'ENTERPRISE',
                    featureFlags: {
                        commissionEnabled: true,
                        agentAccounts: true,
                        propertyAccounts: true
                    }
                });
                console.log('Created hardcoded company:', hardCompanyName);
            }
            // Link user to company if not already linked
            if (!userDoc.companyId || String(userDoc.companyId) !== String(companyDoc._id)) {
                yield User_1.User.updateOne({ _id: userDoc._id }, { $set: { companyId: companyDoc._id } });
                console.log('Linked system admin user to company');
            }
        }
        catch (bootErr) {
            console.error('Bootstrap system admin failed (non-fatal):', bootErr);
        }
        // Ensure critical property account indexes are in place at startup
        try {
            yield (0, propertyAccountService_1.initializePropertyAccountIndexes)();
            console.log('Property account indexes ensured');
        }
        catch (idxErr) {
            console.warn('Failed to ensure property account indexes:', idxErr);
        }
        yield (0, startSyncServices_1.initializeSyncServices)();
        console.log('Database synchronization services initialized');
        // One-time ledger maintenance at boot (production only)
        if (process.env.NODE_ENV === 'production') {
            (() => __awaiter(void 0, void 0, void 0, function* () {
                const maintenanceKey = 'ledger_maintenance_v1';
                try {
                    // Create run record if not present
                    yield SystemSetting_1.default.updateOne({ key: maintenanceKey, startedAt: { $exists: false } }, { $setOnInsert: { key: maintenanceKey, version: 1, startedAt: new Date() } }, { upsert: true });
                    const record = yield SystemSetting_1.default.findOne({ key: maintenanceKey }).lean();
                    if (record && record.completedAt) {
                        console.log('Startup ledger maintenance already completed previously - skipping.');
                        return;
                    }
                    console.log('Starting startup ledger maintenance (one-time) across all companies...');
                    const result = yield (0, propertyAccountService_2.runPropertyLedgerMaintenance)({});
                    yield SystemSetting_1.default.updateOne({ key: maintenanceKey }, { $set: { completedAt: new Date(), value: result, lastError: undefined } });
                    console.log('Startup ledger maintenance completed.');
                }
                catch (e) {
                    console.error('Startup ledger maintenance failed:', (e === null || e === void 0 ? void 0 : e.message) || e);
                    try {
                        yield SystemSetting_1.default.updateOne({ key: maintenanceKey }, { $set: { lastError: (e === null || e === void 0 ? void 0 : e.message) || String(e) } }, { upsert: true });
                    }
                    catch (_a) { }
                }
            }))().catch(() => { });
        }
    }
    catch (error) {
        console.error('Failed to initialize sync services:', error);
    }
}))
    .catch((error) => {
    console.error('Failed to connect to MongoDB (server remains up for /health/live):', error);
    // Do not exit; /api/health/ready will be 503 until DB is healthy
});
// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Closing HTTP server...');
    httpServer.close(() => __awaiter(void 0, void 0, void 0, function* () {
        console.log('HTTP server closed');
        try {
            const { shutdownSyncServices } = yield Promise.resolve().then(() => __importStar(require('./scripts/startSyncServices')));
            yield shutdownSyncServices();
            console.log('Sync services shut down gracefully');
        }
        catch (error) {
            console.error('Error shutting down sync services:', error);
        }
        process.exit(0);
    }));
});
// Suppress punycode deprecation warning
process.removeAllListeners('warning');
process.on('warning', (warning) => {
    if (warning.name === 'DeprecationWarning' && warning.message.includes('punycode')) {
        return;
    }
    console.warn(warning);
});
