"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const propertyRoutes_1 = __importDefault(require("./routes/propertyRoutes"));
const tenantRoutes_1 = __importDefault(require("./routes/tenantRoutes"));
const leaseRoutes_1 = __importDefault(require("./routes/leaseRoutes"));
const paymentRoutes_1 = __importDefault(require("./routes/paymentRoutes"));
const chartRoutes_1 = __importDefault(require("./routes/chartRoutes"));
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const companyRoutes_1 = __importDefault(require("./routes/companyRoutes"));
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const agentRoutes_1 = __importDefault(require("./routes/agentRoutes"));
const accountantRoutes_1 = __importDefault(require("./routes/accountantRoutes"));
const fileRoutes_1 = __importDefault(require("./routes/fileRoutes"));
const propertyOwnerRoutes_1 = __importDefault(require("./routes/propertyOwnerRoutes"));
const ownerRoutes_1 = __importDefault(require("./routes/ownerRoutes"));
const healthRoutes_1 = __importDefault(require("./routes/healthRoutes"));
const maintenanceRequestRoutes_1 = __importDefault(require("./routes/maintenanceRequestRoutes"));
const levyPaymentRoutes_1 = __importDefault(require("./routes/levyPaymentRoutes"));
const municipalPaymentRoutes_1 = __importDefault(require("./routes/municipalPaymentRoutes"));
const paymentRequestRoutes_1 = __importDefault(require("./routes/paymentRequestRoutes"));
const invoiceRoutes_1 = __importDefault(require("./routes/invoiceRoutes"));
const database_1 = require("./config/database");
const http_1 = require("http");
const socket_1 = require("./config/socket");
// Load environment variables
dotenv_1.default.config();
const app = (0, express_1.default)();
// Middleware
const allowedOrigins = [
    process.env.CLIENT_URL || 'http://localhost:3000',
    'http://localhost:5173', // Vite default port
    'http://localhost:3000' // Create React App default port
];
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
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));
// Add cookie-parser middleware
app.use((0, cookie_parser_1.default)());
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '50mb' }));
// Debug middleware
app.use((req, res, next) => {
    console.log('Incoming request:', {
        method: req.method,
        url: req.url,
        path: req.path,
        baseUrl: req.baseUrl,
        originalUrl: req.originalUrl,
        headers: req.headers,
        body: req.body
    });
    next();
});
// Routes
app.use('/api/properties', propertyRoutes_1.default);
app.use('/api/tenants', tenantRoutes_1.default);
app.use('/api/leases', leaseRoutes_1.default);
app.use('/api/payments', paymentRoutes_1.default);
app.use('/api/charts', chartRoutes_1.default);
app.use('/api/auth', authRoutes_1.default);
app.use('/api/companies', companyRoutes_1.default);
app.use('/api/users', userRoutes_1.default);
app.use('/api/agents', agentRoutes_1.default);
app.use('/api/accountants', accountantRoutes_1.default);
app.use('/api/files', fileRoutes_1.default);
app.use('/api/property-owners', propertyOwnerRoutes_1.default);
app.use('/api/owners', ownerRoutes_1.default);
app.use('/api/health', healthRoutes_1.default);
app.use('/api/maintenance', maintenanceRequestRoutes_1.default);
app.use('/api/levy-payments', levyPaymentRoutes_1.default);
app.use('/api/municipal-payments', municipalPaymentRoutes_1.default);
app.use('/api/payment-requests', paymentRequestRoutes_1.default);
app.use('/api/invoices', invoiceRoutes_1.default);
// Debug route to catch unmatched requests - temporarily disabled
// app.use('/api/*', (req, res, next) => {
//   console.log('DEBUG: Unmatched API route:', req.method, req.originalUrl);
//   next();
// });
// Test route
app.get('/api/test', (req, res) => {
    res.json({ message: 'API is working' });
});
// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        status: 'error',
        message: err.message || 'Internal server error'
    });
});
const PORT = process.env.PORT || 5000;
const httpServer = (0, http_1.createServer)(app);
// Initialize Socket.IO
const { io } = (0, socket_1.initializeSocket)(httpServer);
// Connect to MongoDB
(0, database_1.connectDatabase)()
    .then(() => {
    console.log('Connected to MongoDB');
    // Start the server
    httpServer.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
})
    .catch((error) => {
    console.error('Failed to connect to MongoDB:', error);
    process.exit(1);
});
// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Closing HTTP server...');
    httpServer.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
    });
});
// Suppress punycode deprecation warning
process.removeAllListeners('warning');
process.on('warning', (warning) => {
    if (warning.name === 'DeprecationWarning' && warning.message.includes('punycode')) {
        return;
    }
    console.warn(warning);
});
