import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import propertyRoutes from './routes/propertyRoutes';
import tenantRoutes from './routes/tenantRoutes';
import leaseRoutes from './routes/leaseRoutes';
import paymentRoutes from './routes/paymentRoutes';
import chartRoutes from './routes/chartRoutes';
import authRoutes from './routes/authRoutes';
import companyRoutes from './routes/companyRoutes';
import userRoutes from './routes/userRoutes';
import agentRoutes from './routes/agentRoutes';
import fileRoutes from './routes/fileRoutes';
import propertyOwnerRoutes from './routes/propertyOwnerRoutes';
import ownerRoutes from './routes/ownerRoutes';
import healthRoutes from './routes/healthRoutes';
import maintenanceRequestRoutes from './routes/maintenanceRequestRoutes';
import { connectDatabase, closeDatabase } from './config/database';
import { createServer } from 'http';
import { initializeSocket } from './config/socket';

// Load environment variables
dotenv.config();

const app = express();

// Middleware
const allowedOrigins = [
  process.env.CLIENT_URL || 'http://localhost:3000',
  'http://localhost:5173', // Vite default port
  'http://localhost:3000'  // Create React App default port
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
app.use('/api/properties', propertyRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/leases', leaseRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/charts', chartRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/users', userRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/property-owners', propertyOwnerRoutes);
app.use('/api/owners', ownerRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/maintenance', maintenanceRequestRoutes);

// Test route
app.get('/api/test', (req, res) => {
  res.json({ message: 'API is working' });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    status: 'error',
    message: err.message || 'Internal server error'
  });
});

const PORT = process.env.PORT || 5000;

const httpServer = createServer(app);

// Initialize Socket.IO
const { io } = initializeSocket(httpServer);

// Connect to MongoDB
connectDatabase()
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
