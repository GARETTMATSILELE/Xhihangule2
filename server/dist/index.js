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
const corsOrigins_1 = require("./config/corsOrigins");
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
const agencyOperationsRoutes_1 = __importDefault(require("./routes/agencyOperationsRoutes"));
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
const uploadRoutes_1 = __importDefault(require("./routes/uploadRoutes"));
const paynowRoutes_1 = __importDefault(require("./routes/paynowRoutes"));
const onboardingRoutes_1 = __importDefault(require("./routes/onboardingRoutes"));
const individualRoutes_1 = __importDefault(require("./routes/individualRoutes"));
const diagnosticsRoutes_1 = __importDefault(require("./routes/diagnosticsRoutes"));
const accountingRoutes_1 = __importDefault(require("./routes/accountingRoutes"));
const trustAccountRoutes_1 = __importDefault(require("./routes/trustAccountRoutes"));
const routes_1 = __importDefault(require("./ecosystem/routes"));
const webhookRoutes_1 = __importDefault(require("./routes/webhookRoutes"));
const adminRoutes_1 = __importDefault(require("./routes/adminRoutes"));
const api_1 = __importDefault(require("./reporting/api"));
const database_1 = require("./config/database");
const errorHandler_1 = require("./middleware/errorHandler");
const http_1 = require("http");
const socket_1 = require("./config/socket");
const startSyncServices_1 = require("./scripts/startSyncServices");
const reportRoutes_1 = __importDefault(require("./routes/reportRoutes"));
const publicReportRoutes_1 = __importDefault(require("./routes/publicReportRoutes"));
const propertyAccountService_1 = require("./services/propertyAccountService");
const systemAdminRoutes_1 = __importDefault(require("./routes/systemAdminRoutes"));
const trustEventListener_1 = require("./services/trustEventListener");
const trustReconciliationJob_1 = require("./jobs/trustReconciliationJob");
// Removed legacy bootstrap imports
const systemAdminBootstrap_1 = require("./services/systemAdminBootstrap");
const productionConfig_1 = require("./config/productionConfig");
const emailService_1 = require("./services/emailService");
const requestSecurity_1 = require("./utils/requestSecurity");
const runtimeRole_1 = require("./config/runtimeRole");
const crypto_1 = __importDefault(require("crypto"));
// Load environment variables (support .env.production if NODE_ENV=production or ENV_FILE override)
const ENV_FILE = process.env.ENV_FILE || (process.env.NODE_ENV === 'production' ? '.env.production' : '.env');
// Resolve the env file relative to the compiled/runtime directory so it works from both src/ and dist/
const ENV_PATH = path_1.default.resolve(__dirname, '..', ENV_FILE);
dotenv_1.default.config({ path: ENV_PATH });
const app = (0, express_1.default)();
const runtimeFeatures = (0, runtimeRole_1.getRuntimeFeatures)();
function isMongoWaitQueueTimeout(error) {
    return ((error === null || error === void 0 ? void 0 : error.name) === 'MongoWaitQueueTimeoutError' ||
        (error === null || error === void 0 ? void 0 : error.name) === 'WaitQueueTimeoutError' ||
        /Timed out while checking out a connection from connection pool/i.test(String((error === null || error === void 0 ? void 0 : error.message) || '')));
}
process.on('uncaughtException', (error) => {
    if (isMongoWaitQueueTimeout(error)) {
        console.error('MongoDB connection pool timeout; keeping server alive while pool recovers:', (error === null || error === void 0 ? void 0 : error.message) || error);
        return;
    }
    console.error('Uncaught exception:', error);
    process.exit(1);
});
process.on('unhandledRejection', (reason) => {
    if (isMongoWaitQueueTimeout(reason)) {
        console.error('Unhandled MongoDB connection pool timeout; keeping server alive while pool recovers:', (reason === null || reason === void 0 ? void 0 : reason.message) || reason);
        return;
    }
    console.error('Unhandled promise rejection:', reason);
});
// Lightweight request latency instrumentation for endpoint profiling.
app.use((req, res, next) => {
    const requestId = req.get('x-request-id') || crypto_1.default.randomUUID();
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    const startNs = process.hrtime.bigint();
    const originalEnd = res.end.bind(res);
    res.end = ((chunk, encoding, cb) => {
        const elapsedMs = Number(process.hrtime.bigint() - startNs) / 1000000;
        try {
            if (!res.headersSent) {
                res.setHeader('X-Response-Time', `${elapsedMs.toFixed(1)}ms`);
            }
        }
        catch (_a) {
            // no-op: never block response on telemetry
        }
        return originalEnd(chunk, encoding, cb);
    });
    next();
});
console.log('Runtime role configuration:', {
    role: runtimeFeatures.role,
    runHttpServer: runtimeFeatures.runHttpServer,
    runSyncSchedules: runtimeFeatures.runSyncSchedules,
    runTrustBackground: runtimeFeatures.runTrustBackground,
    runStartupMaintenance: runtimeFeatures.runStartupMaintenance
});
// Trust proxy (so req.protocol reflects https behind reverse proxies)
app.set('trust proxy', 1);
// Perform a one-time SMTP verification at startup (non-blocking)
(() => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const emailStatus = (0, emailService_1.getEmailConfigStatus)();
        if (emailStatus.smtpConfigured) {
            const v = yield (0, emailService_1.verifySmtpConnection)();
            if (v.verified) {
                console.log('SMTP verified', { host: emailStatus.smtp.host, port: emailStatus.smtp.port });
            }
            else {
                console.error('SMTP verification failed', {
                    host: emailStatus.smtp.host,
                    port: emailStatus.smtp.port,
                    error: v.error
                });
            }
        }
        else {
            console.warn('SMTP not configured; emails will use API providers if set or be logged.');
        }
    }
    catch (e) {
        console.warn('SMTP verification check failed:', (e === null || e === void 0 ? void 0 : e.message) || String(e));
    }
}))().catch(() => { });
// Fail fast on missing critical environment in production
const productionConfigProblems = (0, productionConfig_1.productionStartupProblems)(process.env);
if (productionConfigProblems.length > 0) {
    // eslint-disable-next-line no-console
    console.error(`Missing required environment variables in production: ${productionConfigProblems.join(', ')}`);
    process.exit(1);
}
// Optional canonical host redirect (configure via env to enable)
const CANONICAL_HOST = process.env.CANONICAL_HOST;
const REDIRECT_FROM_HOSTS = (process.env.REDIRECT_FROM_HOSTS || '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
if (CANONICAL_HOST && REDIRECT_FROM_HOSTS.length > 0) {
    app.use((req, res, next) => {
        const hostHeader = req.headers.host || '';
        const currentHost = String(hostHeader).split(':')[0];
        if (currentHost && REDIRECT_FROM_HOSTS.includes(currentHost)) {
            if (req.method === 'GET' || req.method === 'HEAD') {
                const target = `${req.protocol}://${CANONICAL_HOST}${req.originalUrl}`;
                return res.redirect(301, target);
            }
            // Do not redirect non-idempotent API requests to avoid breaking clients
        }
        return next();
    });
}
// Middleware
const allowedOrigins = (0, corsOrigins_1.buildAllowedOrigins)(process.env);
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
                styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
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
                fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
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
        if ((0, corsOrigins_1.isOriginAllowed)(origin, allowedOrigins)) {
            return callback(null, true);
        }
        if (process.env.NODE_ENV !== 'production') {
            console.warn(`CORS rejected origin: ${origin}`);
        }
        return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'Origin',
        'x-refresh-csrf',
        'X-Refresh-Csrf',
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
const requestBodyLimit = process.env.REQUEST_BODY_LIMIT || '10mb';
app.use(express_1.default.json({ limit: requestBodyLimit }));
app.use(express_1.default.urlencoded({ extended: true, limit: requestBodyLimit }));
// Enable gzip compression
app.use((0, compression_1.default)());
// Rate limiting
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 10,
    keyGenerator: (req) => (0, requestSecurity_1.getClientIpForRateLimit)(req),
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: 'error', message: 'Too many attempts, please try again later.' }
});
const refreshLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 20,
    keyGenerator: (req) => (0, requestSecurity_1.getClientIpForRateLimit)(req),
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: 'error', message: 'Too many refresh attempts, slow down.' }
});
const fileLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 30,
    keyGenerator: (req) => (0, requestSecurity_1.getClientIpForRateLimit)(req),
    standardHeaders: true,
    legacyHeaders: false
});
// Additional rate limits for password reset flow
const forgotLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 5,
    keyGenerator: (req) => (0, requestSecurity_1.getClientIpForRateLimit)(req),
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: 'error', message: 'Too many password reset requests, please try again later.' }
});
const resetLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 10,
    keyGenerator: (req) => (0, requestSecurity_1.getClientIpForRateLimit)(req),
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: 'error', message: 'Too many reset attempts, please try again later.' }
});
// Debug middleware only in development
if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
        console.log('Incoming request:', {
            method: req.method,
            url: req.url,
            path: req.path,
            baseUrl: req.baseUrl,
            originalUrl: req.originalUrl,
            headers: (0, requestSecurity_1.redactHeaders)(req.headers),
            body: req.body
        });
        next();
    });
}
// Routes
// Keep liveness/readiness probes available even while MongoDB is still connecting.
app.use('/api/health', healthRoutes_1.default);
app.use('/health', healthRoutes_1.default);
const databaseReadinessGate = (req, res, next) => {
    if ((0, database_1.isDatabaseAvailable)()) {
        return next();
    }
    res.setHeader('Retry-After', '5');
    return res.status(503).json({
        status: 'error',
        message: 'Service temporarily unavailable',
        code: 'DB_NOT_READY',
        database: (0, database_1.getDatabaseHealth)()
    });
};
app.use('/api', databaseReadinessGate);
app.use('/api/properties', propertyRoutes_1.default);
app.use('/api/tenants', tenantRoutes_1.default);
app.use('/api/leases', leaseRoutes_1.default);
app.use('/api/payments', paymentRoutes_1.default);
app.use('/api/webhooks', webhookRoutes_1.default);
app.use('/api/charts', chartRoutes_1.default);
// Apply targeted rate limits to sensitive endpoints
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);
app.use('/api/onboarding/start', authLimiter);
app.use('/api/paynow/web/create', authLimiter);
app.use('/api/paynow/mobile/create', authLimiter);
app.use('/api/auth/refresh-token', refreshLimiter);
app.use('/api/auth/forgot-password', forgotLimiter);
app.use('/api/auth/reset-password', resetLimiter);
app.use('/api/files/upload', fileLimiter);
app.use('/api/auth', auth_1.default);
app.use('/api/onboarding', onboardingRoutes_1.default);
app.use('/api/companies', companyRoutes_1.default);
app.use('/api/users', userRoutes_1.default);
app.use('/api/agents', agentRoutes_1.default);
app.use('/api/accountants', accountantRoutes_1.default);
app.use('/api/individual', individualRoutes_1.default);
app.use('/api/files', fileRoutes_1.default);
app.use('/api/upload', uploadRoutes_1.default);
app.use('/api/sales-files', salesFileRoutes_1.default);
app.use('/api/property-owners', propertyOwnerRoutes_1.default);
app.use('/api/sales-owners', salesOwnerRoutes_1.default);
app.use('/api/owners', ownerRoutes_1.default);
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
app.use('/api/agency-operations', agencyOperationsRoutes_1.default);
app.use('/api/invoices', invoiceRoutes_1.default);
app.use('/api/sync', syncRoutes_1.default);
app.use('/api/billing', billingRoutes_1.default);
app.use('/api/subscription', subscriptionRoutes_1.default);
app.use('/api/fiscal', fiscalRoutes_1.default);
app.use('/api/paynow', paynowRoutes_1.default);
// Diagnostics (exposed in non-production by default, or when explicitly enabled)
const exposeDiagnostics = (String(process.env.EXPOSE_DIAGNOSTICS || '').toLowerCase() === 'true') || process.env.NODE_ENV !== 'production';
if (exposeDiagnostics) {
    app.use('/api/diagnostics', diagnosticsRoutes_1.default);
}
// Reports (public and authenticated)
app.use('/api/public/reports', publicReportRoutes_1.default);
app.use('/api/reports', reportRoutes_1.default);
app.use('/api/reporting', api_1.default);
// System Admin (global)
app.use('/api/system-admin', systemAdminRoutes_1.default);
app.use('/api/admin', adminRoutes_1.default);
app.use('/api/accounting', accountingRoutes_1.default);
app.use('/api/trust-accounts', trustAccountRoutes_1.default);
app.use('/api/ecosystem', routes_1.default);
// Session-scoped routes to support multiple concurrent sessions in one browser profile
const sessionRouter = express_1.default.Router();
sessionRouter.use('/properties', propertyRoutes_1.default);
sessionRouter.use('/tenants', tenantRoutes_1.default);
sessionRouter.use('/leases', leaseRoutes_1.default);
sessionRouter.use('/payments', paymentRoutes_1.default);
sessionRouter.use('/webhooks', webhookRoutes_1.default);
sessionRouter.use('/charts', chartRoutes_1.default);
sessionRouter.use('/auth', auth_1.default);
sessionRouter.use('/onboarding', onboardingRoutes_1.default);
sessionRouter.use('/companies', companyRoutes_1.default);
sessionRouter.use('/users', userRoutes_1.default);
sessionRouter.use('/agents', agentRoutes_1.default);
sessionRouter.use('/accountants', accountantRoutes_1.default);
sessionRouter.use('/individual', individualRoutes_1.default);
sessionRouter.use('/files', fileRoutes_1.default);
sessionRouter.use('/upload', uploadRoutes_1.default);
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
sessionRouter.use('/accounting', accountingRoutes_1.default);
sessionRouter.use('/trust-accounts', trustAccountRoutes_1.default);
sessionRouter.use('/ecosystem', routes_1.default);
sessionRouter.use('/admin', adminRoutes_1.default);
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
if (runtimeFeatures.runHttpServer) {
    httpServer.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
        console.log('Accounting API boot', {
            phase: '9',
            startedAt: new Date().toISOString(),
            nodeEnv: process.env.NODE_ENV || 'undefined'
        });
    });
}
else {
    console.log('HTTP server disabled for this runtime role (worker mode).');
}
let databaseReconnectTimeout = null;
let databaseServicesInitialized = false;
let isShuttingDown = false;
const initializeDatabaseBackedServices = () => __awaiter(void 0, void 0, void 0, function* () {
    if (databaseServicesInitialized) {
        return;
    }
    try {
        if (runtimeFeatures.runTrustBackground) {
            // Trust listeners/reconciliation are background workloads and should run on worker/all roles.
            (0, trustEventListener_1.startTrustEventListener)();
            (0, trustReconciliationJob_1.startTrustReconciliationJob)();
        }
        else {
            console.log('Trust background services disabled for this runtime role.');
        }
        // Opt-in, create-only break-glass administrator. Production never runs this.
        // An existing user is not updated. See systemAdminBootstrap.ts.
        try {
            yield (0, systemAdminBootstrap_1.provisionBreakGlassSystemAdmin)();
        }
        catch (_a) {
            console.error('System admin bootstrap failed. Startup continued without creating an administrator.');
        }
        // Removed legacy bootstrap block referencing Xhihangule
        // Ensure critical property account indexes are in place at startup
        try {
            yield (0, propertyAccountService_1.initializePropertyAccountIndexes)();
            console.log('Property account indexes ensured');
        }
        catch (idxErr) {
            console.warn('Failed to ensure property account indexes:', idxErr);
        }
        if (runtimeFeatures.runSyncSchedules) {
            yield (0, startSyncServices_1.initializeSyncServices)();
            console.log('Database synchronization services initialized');
        }
        else {
            console.log('Scheduled synchronization services disabled for this runtime role.');
        }
        // Historical property-ledger maintenance (dedupe/archive/cancel) is a one-time
        // migration. It must never run as ordinary application startup.
        // Invoke via POST /api/system-admin/maintenance/ledger (system_admin, confirm+reason)
        // or `npm run ledger:maintain -- --company-id=<id> [--dry-run]`.
        if (process.env.NODE_ENV === 'production') {
            console.log('Startup ledger maintenance is disabled; historical ledger mutation is admin/CLI only.');
        }
        databaseServicesInitialized = true;
    }
    catch (error) {
        console.error('Failed to initialize database-backed services:', error);
    }
});
const scheduleDatabaseReconnect = (attempt) => {
    var _a;
    if (isShuttingDown) {
        return;
    }
    const initialDelayMs = Number(process.env.DB_RECONNECT_INITIAL_DELAY_MS || 10000);
    const maxDelayMs = Number(process.env.DB_RECONNECT_MAX_DELAY_MS || 60000);
    const delayMs = Math.min(initialDelayMs * Math.pow(2, Math.max(0, attempt - 1)), maxDelayMs);
    console.warn(`MongoDB is not ready; retrying connection in ${Math.round(delayMs / 1000)}s`);
    databaseReconnectTimeout = setTimeout(() => {
        connectDatabaseWithRetry(attempt + 1).catch((error) => {
            console.error('Unexpected MongoDB reconnect loop error:', error);
            scheduleDatabaseReconnect(attempt + 1);
        });
    }, delayMs);
    (_a = databaseReconnectTimeout.unref) === null || _a === void 0 ? void 0 : _a.call(databaseReconnectTimeout);
};
const connectDatabaseWithRetry = (...args_1) => __awaiter(void 0, [...args_1], void 0, function* (attempt = 1) {
    try {
        yield (0, database_1.connectDatabase)();
        console.log('Connected to MongoDB');
        yield initializeDatabaseBackedServices();
    }
    catch (error) {
        console.error('Failed to connect to MongoDB:', error);
        if (runtimeFeatures.runHttpServer) {
            console.error('Server remains up for /health/live; /api/health/ready will be 503 until DB is healthy');
        }
        scheduleDatabaseReconnect(attempt);
    }
});
// Connect to MongoDB in the background. If Cosmos is slow or temporarily unavailable,
// keep retrying while liveness remains available and DB-backed API routes return 503.
connectDatabaseWithRetry().catch((error) => {
    console.error('Unexpected MongoDB startup loop error:', error);
    scheduleDatabaseReconnect(1);
});
// Handle graceful shutdown
process.on('SIGTERM', () => {
    isShuttingDown = true;
    if (databaseReconnectTimeout) {
        clearTimeout(databaseReconnectTimeout);
    }
    console.log('SIGTERM received. Closing HTTP server...');
    httpServer.close(() => __awaiter(void 0, void 0, void 0, function* () {
        console.log('HTTP server closed');
        try {
            (0, trustEventListener_1.stopTrustEventListener)();
            (0, trustReconciliationJob_1.stopTrustReconciliationJob)();
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
