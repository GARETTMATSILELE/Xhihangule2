import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import cookieParser from 'cookie-parser';
import { errorHandler } from './middleware/errorHandler';
import { checkDatabaseConnection } from './middleware/databaseCheck';
import { connectDatabase } from './config/database';
import authRoutes from './routes/auth';
import agentRoutes from './routes/agentRoutes';
import accountantRoutes from './routes/accountantRoutes';
import chartRoutes from './routes/chartRoutes';
import reportRoutes from './routes/reportRoutes';
import publicReportRoutes from './routes/publicReportRoutes';
import testReportRoutes from './routes/testReportRoutes';
import userRoutes from './routes/userRoutes';
import propertyRoutes from './routes/propertyRoutes';
import paymentRoutes from './routes/paymentRoutes';
import tenantRoutes from './routes/tenantRoutes';
import leaseRoutes from './routes/leaseRoutes';
import propertyOwnerRoutes from './routes/propertyOwnerRoutes';
import salesOwnerRoutes from './routes/salesOwnerRoutes';
import ownerRoutes from './routes/ownerRoutes';
import companyRoutes from './routes/companyRoutes';
import healthRoutes from './routes/healthRoutes';
import maintenanceRequestRoutes from './routes/maintenanceRequestRoutes';
import fileRoutes from './routes/fileRoutes';
import salesFileRoutes from './routes/salesFileRoutes';
import invoiceRoutes from './routes/invoiceRoutes';
import dealRoutes from './routes/dealRoutes';
import buyerRoutes from './routes/buyerRoutes';
import leadRoutes from './routes/leadRoutes';
import viewingRoutes from './routes/viewingRoutes';
import valuationRoutes from './routes/valuationRoutes';
import developmentRoutes from './routes/developmentRoutes';
import developmentUnitRoutes from './routes/developmentUnitRoutes';
import maintenanceRoutes from './routes/maintenanceRoutes';
import paypalRoutes from './routes/paypalRoutes';

import levyPaymentRoutes from './routes/levyPaymentRoutes';
import municipalPaymentRoutes from './routes/municipalPaymentRoutes';
import paymentRequestRoutes from './routes/paymentRequestRoutes';
import notificationRoutes from './routes/notificationRoutes';
import vatRoutes from './routes/vatRoutes';

// Load environment variables
config();

const app = express();

// Trust proxy (needed for correct req.protocol behind reverse proxies/SSL terminators)
app.set('trust proxy', 1);

// CORS configuration
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    const allowedOrigins = [
      process.env.CLIENT_URL,
      'https://www.mantisafrica.com',
      'https://mantisafrica.com',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:5173', // Vite default port
      'http://127.0.0.1:5173'  // Vite default port
    ].filter(Boolean);

    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      callback(null, true);
      return;
    }

    if (process.env.NODE_ENV === 'development' || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
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
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// Log all requests in development
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    const redactedHeaders = {
      ...req.headers,
      authorization: req.headers.authorization ? '[redacted]' : undefined,
      cookie: req.headers.cookie ? '[redacted]' : undefined
    };
    console.log(`${req.method} ${req.path}`, {
      origin: req.headers.origin,
      headers: redactedHeaders
    });
    next();
  });
}

// Health check routes (no database check required)
app.use('/api/health', healthRoutes);

// Test route for reports
app.get('/api/reports/test', (req, res) => {
  res.json({ message: 'Reports test route working', timestamp: new Date().toISOString() });
});

// Test report routes
app.use('/api/test-reports', testReportRoutes);

// Public report routes (no authentication required)
app.use('/api/public/reports', publicReportRoutes);

// Apply database check middleware to all other routes
app.use(checkDatabaseConnection);

// Protected routes
app.use('/api/auth', authRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/accountants', accountantRoutes);
app.use('/api/charts', chartRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/users', userRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/leases', leaseRoutes);
app.use('/api/property-owners', propertyOwnerRoutes);
app.use('/api/sales-owners', salesOwnerRoutes);
console.log('App: Registering owner routes at /api/owners');
app.use('/api/owners', ownerRoutes);
console.log('App: Owner routes registered successfully');
app.use('/api/companies', companyRoutes);
app.use('/api/maintenance', maintenanceRequestRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/sales-files', salesFileRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/deals', dealRoutes);
app.use('/api/buyers', buyerRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/viewings', viewingRoutes);
app.use('/api/valuations', valuationRoutes);
app.use('/api/developments', developmentRoutes);
app.use('/api/development-units', developmentUnitRoutes);

app.use('/api/levy-payments', levyPaymentRoutes);
app.use('/api/municipal-payments', municipalPaymentRoutes);
app.use('/api/payment-requests', paymentRequestRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/paypal', paypalRoutes);
app.use('/api/vat', vatRoutes);

// Error handling
app.use(errorHandler);

export default app; 