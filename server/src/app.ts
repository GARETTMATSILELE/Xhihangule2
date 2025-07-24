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
import ownerRoutes from './routes/ownerRoutes';
import companyRoutes from './routes/companyRoutes';
import healthRoutes from './routes/healthRoutes';
import maintenanceRequestRoutes from './routes/maintenanceRequestRoutes';
import fileRoutes from './routes/fileRoutes';
import invoiceRoutes from './routes/invoiceRoutes';
import propertyAccountRoutes from './routes/propertyAccountRoutes';
import levyPaymentRoutes from './routes/levyPaymentRoutes';
import municipalPaymentRoutes from './routes/municipalPaymentRoutes';

// Load environment variables
config();

const app = express();

// CORS configuration
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    const allowedOrigins = [
      process.env.CLIENT_URL,
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
    console.log(`${req.method} ${req.path}`, {
      origin: req.headers.origin,
      headers: req.headers,
      cookies: req.cookies
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
app.use('/api/payments', paymentRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/leases', leaseRoutes);
app.use('/api/property-owners', propertyOwnerRoutes);
console.log('App: Registering owner routes at /api/owners');
app.use('/api/owners', ownerRoutes);
console.log('App: Owner routes registered successfully');
app.use('/api/companies', companyRoutes);
app.use('/api/maintenance', maintenanceRequestRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/property-accounts', propertyAccountRoutes);
app.use('/api/levy-payments', levyPaymentRoutes);
app.use('/api/municipal-payments', municipalPaymentRoutes);

// Error handling
app.use(errorHandler);

export default app; 