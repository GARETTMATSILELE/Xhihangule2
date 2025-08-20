import express from 'express';
import compression from 'compression';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import path from 'path';
import propertyRoutes from './routes/propertyRoutes';
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
import ownerRoutes from './routes/ownerRoutes';
import healthRoutes from './routes/healthRoutes';
import maintenanceRequestRoutes from './routes/maintenanceRequestRoutes';
import levyPaymentRoutes from './routes/levyPaymentRoutes';
import municipalPaymentRoutes from './routes/municipalPaymentRoutes';
import paymentRequestRoutes from './routes/paymentRequestRoutes';
import invoiceRoutes from './routes/invoiceRoutes';
import syncRoutes from './routes/syncRoutes';
import { connectDatabase, closeDatabase } from './config/database';
import { errorHandler } from './middleware/errorHandler';
import { createServer } from 'http';
import { initializeSocket } from './config/socket';
import { initializeSyncServices } from './scripts/startSyncServices';

// Load environment variables
dotenv.config();

const app = express();

// Middleware
const allowedOriginsFromEnv = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const allowedOrigins = [
  process.env.CLIENT_URL || 'http://localhost:3000',
  'http://localhost:5173', // Vite default port
  'http://localhost:3000', // Create React App default port
  ...allowedOriginsFromEnv
];

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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

// Add cookie-parser middleware
app.use(cookieParser());

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Enable gzip compression
app.use(compression());

// Debug middleware only in development
if (process.env.NODE_ENV !== 'production') {
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
}

// Routes
app.use('/api/properties', propertyRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/leases', leaseRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/charts', chartRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/users', userRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/accountants', accountantRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/property-owners', propertyOwnerRoutes);
app.use('/api/owners', ownerRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/maintenance', maintenanceRequestRoutes);
app.use('/api/levy-payments', levyPaymentRoutes);
app.use('/api/municipal-payments', municipalPaymentRoutes);
app.use('/api/payment-requests', paymentRequestRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/sync', syncRoutes);

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

  // SPA fallback with no-store to avoid caching HTML shell
  app.get('*', (req, res) => {
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

// Connect to MongoDB
connectDatabase()
  .then(async () => {
    console.log('Connected to MongoDB');
    
    // Initialize sync services
    try {
      await initializeSyncServices();
      console.log('Database synchronization services initialized');
    } catch (error) {
      console.error('Failed to initialize sync services:', error);
      // Don't exit, continue with server startup
    }
    
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
