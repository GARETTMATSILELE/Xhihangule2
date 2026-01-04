import express from 'express';
import compression from 'compression';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import propertyRoutes from './routes/propertyRoutes';
import billingRoutes from './routes/billingRoutes';
import tenantRoutes from './routes/tenantRoutes';
import leaseRoutes from './routes/leaseRoutes';
import paymentRoutes from './routes/paymentRoutes';
import chartRoutes from './routes/chartRoutes';
import authRoutes from './routes/auth';
import companyRoutes from './routes/companyRoutes';
import userRoutes from './routes/userRoutes';
import agentRoutes from './routes/agentRoutes';
import accountantRoutes from './routes/accountantRoutes';
import fileRoutes from './routes/fileRoutes';
import propertyOwnerRoutes from './routes/propertyOwnerRoutes';
import salesOwnerRoutes from './routes/salesOwnerRoutes';
import ownerRoutes from './routes/ownerRoutes';
import healthRoutes from './routes/healthRoutes';
import maintenanceRequestRoutes from './routes/maintenanceRequestRoutes';
import levyPaymentRoutes from './routes/levyPaymentRoutes';
import municipalPaymentRoutes from './routes/municipalPaymentRoutes';
import paymentRequestRoutes from './routes/paymentRequestRoutes';
import notificationRoutes from './routes/notificationRoutes';
import invoiceRoutes from './routes/invoiceRoutes';
import syncRoutes from './routes/syncRoutes';
import subscriptionRoutes from './routes/subscriptionRoutes';
import fiscalRoutes from './routes/fiscalRoutes';
import dealRoutes from './routes/dealRoutes';
import buyerRoutes from './routes/buyerRoutes';
import leadRoutes from './routes/leadRoutes';
import viewingRoutes from './routes/viewingRoutes';
import valuationRoutes from './routes/valuationRoutes';
import developmentRoutes from './routes/developmentRoutes';
import developmentUnitRoutes from './routes/developmentUnitRoutes';
import maintenanceRoutes from './routes/maintenanceRoutes';
import inspectionRoutes from './routes/inspectionRoutes';
import salesFileRoutes from './routes/salesFileRoutes';
import paypalRoutes from './routes/paypalRoutes';
import { connectDatabase, closeDatabase } from './config/database';
import { errorHandler } from './middleware/errorHandler';
import { createServer } from 'http';
import { initializeSocket } from './config/socket';
import { initializeSyncServices } from './scripts/startSyncServices';
import reportRoutes from './routes/reportRoutes';
import publicReportRoutes from './routes/publicReportRoutes';
import { initializePropertyAccountIndexes } from './services/propertyAccountService';
import SystemSetting from './models/SystemSetting';
import { runPropertyLedgerMaintenance } from './services/propertyAccountService';
import systemAdminRoutes from './routes/systemAdminRoutes';
import { User } from './models/User';
import { Company } from './models/Company';
import bcrypt from 'bcryptjs';

// Load environment variables (support .env.production if NODE_ENV=production or ENV_FILE override)
const ENV_FILE = process.env.ENV_FILE || (process.env.NODE_ENV === 'production' ? '.env.production' : '.env');
// Resolve the env file relative to the compiled/runtime directory so it works from both src/ and dist/
const ENV_PATH = path.resolve(__dirname, '..', ENV_FILE);
dotenv.config({ path: ENV_PATH });

const app = express();

// Trust proxy (so req.protocol reflects https behind reverse proxies)
app.set('trust proxy', 1);

// Fail fast on missing critical environment in production
if (process.env.NODE_ENV === 'production') {
  const missing: string[] = [];
  if (!process.env.JWT_SECRET) missing.push('JWT_SECRET');
  if (!process.env.JWT_REFRESH_SECRET) missing.push('JWT_REFRESH_SECRET');
  if (!process.env.MONGODB_URI) missing.push('MONGODB_URI');
  if (missing.length > 0) {
    // eslint-disable-next-line no-console
    console.error(`Missing required environment variables in production: ${missing.join(', ')}`);
    process.exit(1);
  }
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
const allowedOriginsFromEnv = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const allowedOrigins = [
  process.env.CLIENT_URL || 'http://localhost:3000',
  'http://localhost:5173', // Vite default port
  'http://localhost:3000', // Create React App default port
  // Production defaults (ensure both apex and www are allowed if env not configured)
  'https://mantisafrica.com',
  'https://www.mantisafrica.com',
  ...allowedOriginsFromEnv
];

// Security headers (production)
if (process.env.NODE_ENV === 'production') {
  app.use(helmet({
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

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
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
app.use(cookieParser());

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Enable gzip compression
app.use(compression());

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Too many attempts, please try again later.' }
});
const refreshLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Too many refresh attempts, slow down.' }
});
const fileLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false
});

// Additional rate limits for password reset flow
const forgotLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Too many password reset requests, please try again later.' }
});
const resetLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Too many reset attempts, please try again later.' }
});

// Debug middleware only in development
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    const redactedHeaders = {
      ...req.headers,
      authorization: req.headers.authorization ? '[redacted]' : undefined,
      cookie: req.headers.cookie ? '[redacted]' : undefined
    };
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
app.use('/api/properties', propertyRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/leases', leaseRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/charts', chartRoutes);
// Apply targeted rate limits to sensitive endpoints
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);
app.use('/api/auth/refresh-token', refreshLimiter);
app.use('/api/auth/forgot-password', forgotLimiter);
app.use('/api/auth/reset-password', resetLimiter);
app.use('/api/files/upload', fileLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/users', userRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/accountants', accountantRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/sales-files', salesFileRoutes);
app.use('/api/property-owners', propertyOwnerRoutes);
app.use('/api/sales-owners', salesOwnerRoutes);
app.use('/api/owners', ownerRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/maintenance', maintenanceRequestRoutes);
app.use('/api/deals', dealRoutes);
app.use('/api/buyers', buyerRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/viewings', viewingRoutes);
app.use('/api/valuations', valuationRoutes);
app.use('/api/developments', developmentRoutes);
app.use('/api/development-units', developmentUnitRoutes);
app.use('/api/inspections', inspectionRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/levy-payments', levyPaymentRoutes);
app.use('/api/municipal-payments', municipalPaymentRoutes);
app.use('/api/payment-requests', paymentRequestRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/fiscal', fiscalRoutes);
app.use('/api/paypal', paypalRoutes);
// Reports (public and authenticated)
app.use('/api/public/reports', publicReportRoutes);
app.use('/api/reports', reportRoutes);
// System Admin (global)
app.use('/api/system-admin', systemAdminRoutes);

// Session-scoped routes to support multiple concurrent sessions in one browser profile
const sessionRouter = express.Router();
sessionRouter.use('/properties', propertyRoutes);
sessionRouter.use('/tenants', tenantRoutes);
sessionRouter.use('/leases', leaseRoutes);
sessionRouter.use('/payments', paymentRoutes);
sessionRouter.use('/charts', chartRoutes);
sessionRouter.use('/auth', authRoutes);
sessionRouter.use('/companies', companyRoutes);
sessionRouter.use('/users', userRoutes);
sessionRouter.use('/agents', agentRoutes);
sessionRouter.use('/accountants', accountantRoutes);
sessionRouter.use('/files', fileRoutes);
sessionRouter.use('/property-owners', propertyOwnerRoutes);
sessionRouter.use('/sales-owners', salesOwnerRoutes);
sessionRouter.use('/owners', ownerRoutes);
sessionRouter.use('/health', healthRoutes);
sessionRouter.use('/maintenance', maintenanceRequestRoutes);
sessionRouter.use('/deals', dealRoutes);
sessionRouter.use('/buyers', buyerRoutes);
sessionRouter.use('/leads', leadRoutes);
sessionRouter.use('/viewings', viewingRoutes);
sessionRouter.use('/valuations', valuationRoutes);
sessionRouter.use('/developments', developmentRoutes);
sessionRouter.use('/development-units', developmentUnitRoutes);
sessionRouter.use('/inspections', inspectionRoutes);
sessionRouter.use('/levy-payments', levyPaymentRoutes);
sessionRouter.use('/municipal-payments', municipalPaymentRoutes);
sessionRouter.use('/payment-requests', paymentRequestRoutes);
sessionRouter.use('/notifications', notificationRoutes);
sessionRouter.use('/invoices', invoiceRoutes);
sessionRouter.use('/sync', syncRoutes);
sessionRouter.use('/fiscal', fiscalRoutes);

app.use('/api/s/:sessionId', sessionRouter);

// Serve client build in production
if (process.env.NODE_ENV === 'production') {
  const staticPath = path.join(__dirname, 'public');

  // Set long-term caching for hashed static assets
  app.use((req, res, next) => {
    if (req.path.startsWith('/static/')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
    next();
  });

  app.use(express.static(staticPath));

  // SPA fallback only for HTML navigation requests; avoid intercepting static asset URLs
  app.get('*', (req, res, next) => {
    const acceptHeader = req.headers['accept'] || '';
    const isHtmlRequest = typeof acceptHeader === 'string' && acceptHeader.includes('text/html');
    const isAsset = req.path.startsWith('/static/') || req.path.includes('.') || req.path.startsWith('/assets/');
    if (!isHtmlRequest || isAsset) {
      return next();
    }
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(staticPath, 'index.html'));
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
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const httpServer = createServer(app);

// Initialize Socket.IO
const { io } = initializeSocket(httpServer);

// Start the server first so /api/health/live responds even if DB is down
httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Connect to MongoDB (non-fatal if it fails; readiness will report not ready)
connectDatabase()
  .then(async () => {
    console.log('Connected to MongoDB');

    try {
      // Bootstrap hardcoded System Admin and Company (idempotent)
      try {
        const hardEmail = 'garet.matsi@gmail.com';
        const hardPassword = 'Mabhadhi@1908';
        const hardCompanyName = 'Xhihangule Pvt Ltd';
        // Ensure system admin user exists first (required for Company.ownerId)
        let userDoc = await User.findOne({ email: hardEmail });
        const hashed = await bcrypt.hash(hardPassword, 10);
        if (!userDoc) {
          userDoc = await User.create({
            email: hardEmail,
            password: hashed,
            firstName: 'System',
            lastName: 'Administrator',
            role: 'admin',
            roles: ['admin', 'system_admin'],
            isActive: true
          } as any);
          console.log('Created hardcoded system admin user:', hardEmail);
        } else {
          // Ensure system_admin + admin roles; reset password to the hardcoded one as specified
          const roles: string[] = Array.isArray((userDoc as any).roles) ? (userDoc as any).roles! : [userDoc.role];
          const needsSystemAdmin = !roles.includes('system_admin');
          const needsAdmin = !roles.includes('admin') && userDoc.role !== 'admin';
          const updates: any = {};
          if (needsSystemAdmin || needsAdmin) {
            const newRoles = Array.from(new Set([...(roles || []), 'system_admin', 'admin']));
            updates.roles = newRoles;
            if (userDoc.role !== 'admin') {
              updates.role = 'admin';
            }
          }
          updates.password = hashed;
          if (Object.keys(updates).length > 0) {
            await User.updateOne({ _id: userDoc._id }, { $set: updates });
            console.log('Updated hardcoded system admin user configuration');
          }
        }
        // Ensure company exists with all required fields (link to system admin as owner)
        let companyDoc = await Company.findOne({ name: hardCompanyName });
        if (!companyDoc) {
          companyDoc = await Company.create({
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
          } as any);
          console.log('Created hardcoded company:', hardCompanyName);
        }
        // Link user to company if not already linked
        if (!userDoc.companyId || String(userDoc.companyId) !== String(companyDoc._id)) {
          await User.updateOne({ _id: userDoc._id }, { $set: { companyId: companyDoc._id } });
          console.log('Linked system admin user to company');
        }
      } catch (bootErr) {
        console.error('Bootstrap system admin failed (non-fatal):', bootErr);
      }

      // Ensure critical property account indexes are in place at startup
      try {
        await initializePropertyAccountIndexes();
        console.log('Property account indexes ensured');
      } catch (idxErr) {
        console.warn('Failed to ensure property account indexes:', idxErr);
      }

      await initializeSyncServices();
      console.log('Database synchronization services initialized');

      // One-time ledger maintenance at boot (production only)
      if (process.env.NODE_ENV === 'production') {
        (async () => {
          const maintenanceKey = 'ledger_maintenance_v1';
          try {
            // Create run record if not present
            await SystemSetting.updateOne(
              { key: maintenanceKey, startedAt: { $exists: false } },
              { $setOnInsert: { key: maintenanceKey, version: 1, startedAt: new Date() } },
              { upsert: true }
            );
            const record = await SystemSetting.findOne({ key: maintenanceKey }).lean();
            if (record && record.completedAt) {
              console.log('Startup ledger maintenance already completed previously - skipping.');
              return;
            }
            console.log('Starting startup ledger maintenance (one-time) across all companies...');
            const result = await runPropertyLedgerMaintenance({});
            await SystemSetting.updateOne(
              { key: maintenanceKey },
              { $set: { completedAt: new Date(), value: result, lastError: undefined } }
            );
            console.log('Startup ledger maintenance completed.');
          } catch (e: any) {
            console.error('Startup ledger maintenance failed:', e?.message || e);
            try {
              await SystemSetting.updateOne(
                { key: maintenanceKey },
                { $set: { lastError: e?.message || String(e) } },
                { upsert: true }
              );
            } catch {}
          }
        })().catch(() => {});
      }
    } catch (error) {
      console.error('Failed to initialize sync services:', error);
    }
  })
  .catch((error) => {
    console.error('Failed to connect to MongoDB (server remains up for /health/live):', error);
    // Do not exit; /api/health/ready will be 503 until DB is healthy
  });

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Closing HTTP server...');
  httpServer.close(async () => {
    console.log('HTTP server closed');
    try {
      const { shutdownSyncServices } = await import('./scripts/startSyncServices');
      await shutdownSyncServices();
      console.log('Sync services shut down gracefully');
    } catch (error) {
      console.error('Error shutting down sync services:', error);
    }
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
