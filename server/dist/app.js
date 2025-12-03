"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = require("dotenv");
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const errorHandler_1 = require("./middleware/errorHandler");
const databaseCheck_1 = require("./middleware/databaseCheck");
const auth_1 = __importDefault(require("./routes/auth"));
const agentRoutes_1 = __importDefault(require("./routes/agentRoutes"));
const accountantRoutes_1 = __importDefault(require("./routes/accountantRoutes"));
const chartRoutes_1 = __importDefault(require("./routes/chartRoutes"));
const reportRoutes_1 = __importDefault(require("./routes/reportRoutes"));
const publicReportRoutes_1 = __importDefault(require("./routes/publicReportRoutes"));
const testReportRoutes_1 = __importDefault(require("./routes/testReportRoutes"));
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const propertyRoutes_1 = __importDefault(require("./routes/propertyRoutes"));
const paymentRoutes_1 = __importDefault(require("./routes/paymentRoutes"));
const tenantRoutes_1 = __importDefault(require("./routes/tenantRoutes"));
const leaseRoutes_1 = __importDefault(require("./routes/leaseRoutes"));
const propertyOwnerRoutes_1 = __importDefault(require("./routes/propertyOwnerRoutes"));
const salesOwnerRoutes_1 = __importDefault(require("./routes/salesOwnerRoutes"));
const ownerRoutes_1 = __importDefault(require("./routes/ownerRoutes"));
const companyRoutes_1 = __importDefault(require("./routes/companyRoutes"));
const healthRoutes_1 = __importDefault(require("./routes/healthRoutes"));
const maintenanceRequestRoutes_1 = __importDefault(require("./routes/maintenanceRequestRoutes"));
const fileRoutes_1 = __importDefault(require("./routes/fileRoutes"));
const salesFileRoutes_1 = __importDefault(require("./routes/salesFileRoutes"));
const invoiceRoutes_1 = __importDefault(require("./routes/invoiceRoutes"));
const dealRoutes_1 = __importDefault(require("./routes/dealRoutes"));
const buyerRoutes_1 = __importDefault(require("./routes/buyerRoutes"));
const leadRoutes_1 = __importDefault(require("./routes/leadRoutes"));
const viewingRoutes_1 = __importDefault(require("./routes/viewingRoutes"));
const valuationRoutes_1 = __importDefault(require("./routes/valuationRoutes"));
const developmentRoutes_1 = __importDefault(require("./routes/developmentRoutes"));
const developmentUnitRoutes_1 = __importDefault(require("./routes/developmentUnitRoutes"));
const maintenanceRoutes_1 = __importDefault(require("./routes/maintenanceRoutes"));
const levyPaymentRoutes_1 = __importDefault(require("./routes/levyPaymentRoutes"));
const municipalPaymentRoutes_1 = __importDefault(require("./routes/municipalPaymentRoutes"));
const paymentRequestRoutes_1 = __importDefault(require("./routes/paymentRequestRoutes"));
const notificationRoutes_1 = __importDefault(require("./routes/notificationRoutes"));
// Load environment variables
(0, dotenv_1.config)();
const app = (0, express_1.default)();
// Trust proxy (needed for correct req.protocol behind reverse proxies/SSL terminators)
app.set('trust proxy', 1);
// CORS configuration
const corsOptions = {
    origin: (origin, callback) => {
        const allowedOrigins = [
            process.env.CLIENT_URL,
            'https://www.xhihangule.com',
            'https://xhihangule.com',
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'http://localhost:5173', // Vite default port
            'http://127.0.0.1:5173' // Vite default port
        ].filter(Boolean);
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) {
            callback(null, true);
            return;
        }
        if (process.env.NODE_ENV === 'development' || allowedOrigins.includes(origin)) {
            callback(null, true);
        }
        else {
            console.warn(`CORS blocked request from origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    exposedHeaders: ['Set-Cookie'],
    maxAge: 86400 // 24 hours
};
// Middleware
app.use((0, cors_1.default)(corsOptions));
app.use(express_1.default.json());
app.use((0, cookie_parser_1.default)());
// Log all requests in development
if (process.env.NODE_ENV === 'development') {
    app.use((req, res, next) => {
        const redactedHeaders = Object.assign(Object.assign({}, req.headers), { authorization: req.headers.authorization ? '[redacted]' : undefined, cookie: req.headers.cookie ? '[redacted]' : undefined });
        console.log(`${req.method} ${req.path}`, {
            origin: req.headers.origin,
            headers: redactedHeaders
        });
        next();
    });
}
// Health check routes (no database check required)
app.use('/api/health', healthRoutes_1.default);
// Test route for reports
app.get('/api/reports/test', (req, res) => {
    res.json({ message: 'Reports test route working', timestamp: new Date().toISOString() });
});
// Test report routes
app.use('/api/test-reports', testReportRoutes_1.default);
// Public report routes (no authentication required)
app.use('/api/public/reports', publicReportRoutes_1.default);
// Apply database check middleware to all other routes
app.use(databaseCheck_1.checkDatabaseConnection);
// Protected routes
app.use('/api/auth', auth_1.default);
app.use('/api/agents', agentRoutes_1.default);
app.use('/api/accountants', accountantRoutes_1.default);
app.use('/api/charts', chartRoutes_1.default);
app.use('/api/reports', reportRoutes_1.default);
app.use('/api/users', userRoutes_1.default);
app.use('/api/properties', propertyRoutes_1.default);
app.use('/api/maintenance', maintenanceRoutes_1.default);
app.use('/api/payments', paymentRoutes_1.default);
app.use('/api/tenants', tenantRoutes_1.default);
app.use('/api/leases', leaseRoutes_1.default);
app.use('/api/property-owners', propertyOwnerRoutes_1.default);
app.use('/api/sales-owners', salesOwnerRoutes_1.default);
console.log('App: Registering owner routes at /api/owners');
app.use('/api/owners', ownerRoutes_1.default);
console.log('App: Owner routes registered successfully');
app.use('/api/companies', companyRoutes_1.default);
app.use('/api/maintenance', maintenanceRequestRoutes_1.default);
app.use('/api/files', fileRoutes_1.default);
app.use('/api/sales-files', salesFileRoutes_1.default);
app.use('/api/invoices', invoiceRoutes_1.default);
app.use('/api/deals', dealRoutes_1.default);
app.use('/api/buyers', buyerRoutes_1.default);
app.use('/api/leads', leadRoutes_1.default);
app.use('/api/viewings', viewingRoutes_1.default);
app.use('/api/valuations', valuationRoutes_1.default);
app.use('/api/developments', developmentRoutes_1.default);
app.use('/api/development-units', developmentUnitRoutes_1.default);
app.use('/api/levy-payments', levyPaymentRoutes_1.default);
app.use('/api/municipal-payments', municipalPaymentRoutes_1.default);
app.use('/api/payment-requests', paymentRequestRoutes_1.default);
app.use('/api/notifications', notificationRoutes_1.default);
// Error handling
app.use(errorHandler_1.errorHandler);
exports.default = app;
