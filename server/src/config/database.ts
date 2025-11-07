import mongoose from 'mongoose';
import { createIndexes } from '../models/indexes';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/property-management';
const ACCOUNTING_DB_URI = process.env.ACCOUNTING_DB_URI || 'mongodb://localhost:27017/accounting';

export const mainConnection = mongoose.createConnection(MONGODB_URI);

export const accountingConnection = mongoose.createConnection(ACCOUNTING_DB_URI);

// Connection options
const connectionOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  maxPoolSize: 10,
  minPoolSize: 5,
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 30000,
  retryWrites: true,
  retryReads: true,
  autoIndex: false,
  autoCreate: false,
  bufferCommands: false, // Disable command buffering
  // Heartbeat settings
  heartbeatFrequencyMS: 10000, // 10 seconds
  // Add recommended settings
  maxIdleTimeMS: 60000, // Close idle connections after 1 minute
  waitQueueTimeoutMS: 30000, // Wait queue timeout
  compressors: ['zlib' as const], // Enable compression with correct type
};

// Circuit breaker state
let circuitBreakerState = {
  isOpen: false,
  failureCount: 0,
  lastFailureTime: new Date(),
  threshold: 5,
  resetTimeout: 120000, // Increased to 2 minutes
};

// Health check state
let healthCheckState = {
  isHealthy: true,
  lastCheck: new Date(),
  checkInterval: 300000, // Increased to 5 minutes
};

// Retry configuration
const retryConfig = {
  maxRetries: 5, // Increased from 3
  initialDelay: 2000, // Increased from 1000
  maxDelay: 10000, // Increased from 5000
};

// Calculate exponential backoff delay
const getRetryDelay = (retryCount: number): number => {
  const delay = Math.min(
    retryConfig.initialDelay * Math.pow(2, retryCount),
    retryConfig.maxDelay
  );
  return delay + Math.random() * 1000; // Add jitter
};

// Connect to MongoDB
export const connectDatabase = async (): Promise<void> => {
  try {
    if (mongoose.connection.readyState === 1) {
      console.log('Already connected to MongoDB');
      return;
    }

    // Set up connection event handlers before connecting
    mongoose.connection.on('error', (error) => {
      console.error('MongoDB connection error:', error);
      circuitBreakerState.failureCount++;
      circuitBreakerState.lastFailureTime = new Date();

      if (circuitBreakerState.failureCount >= circuitBreakerState.threshold) {
        circuitBreakerState.isOpen = true;
        console.error('Circuit breaker opened due to repeated failures');
      }
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected');
      healthCheckState.isHealthy = false;
    });

    mongoose.connection.on('reconnected', () => {
      // Only log reconnection if we were previously disconnected
      if (!healthCheckState.isHealthy) {
        console.log('MongoDB reconnected');
      }
      healthCheckState.isHealthy = true;
      circuitBreakerState.isOpen = false;
      circuitBreakerState.failureCount = 0;
    });

    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI, connectionOptions);
    
    // Create indexes only if they don't exist
    try {
      await createIndexes();
    } catch (error: any) {
      if (error.code === 85) { // Index already exists
        // Suppress the message for existing indexes
      } else {
        console.error('Error creating indexes:', error);
        // Don't throw error, continue without indexes
      }
    }

    // Migrate accounting PropertyAccount ownerPayouts.referenceNumber unique index to compound index
    try {
      // Ensure accounting collection exists to avoid NamespaceNotFound (26)
      try {
        await accountingConnection.db.createCollection('propertyaccounts');
      } catch (ensureErr: any) {
        if (ensureErr && ensureErr.code !== 48) {
          throw ensureErr;
        }
      }

      const acct = accountingConnection.collection('propertyaccounts');
      const idx = await acct.indexes();
      // Drop legacy subdocument unique index if present
      const legacy = idx.find((i: any) => i.name === 'ownerPayouts.referenceNumber_1');
      if (legacy) {
        console.warn('Dropping legacy index ownerPayouts.referenceNumber_1 on propertyaccounts');
        try {
          await acct.dropIndex('ownerPayouts.referenceNumber_1');
        } catch (dropErr: any) {
          if (!dropErr || (dropErr.code !== 27 && dropErr.codeName !== 'IndexNotFound')) {
            throw dropErr;
          }
        }
      }

      // Create compound unique index if missing
      const hasCompound = idx.find((i: any) => i.name === 'propertyId_1_ownerPayouts.referenceNumber_1');
      if (!hasCompound) {
        console.log('Creating compound unique index on propertyaccounts: { propertyId: 1, ownerPayouts.referenceNumber: 1 }');
        await acct.createIndex(
          { propertyId: 1 as any, 'ownerPayouts.referenceNumber': 1 as any },
          { name: 'propertyId_1_ownerPayouts.referenceNumber_1', unique: true, sparse: true }
        );
      }

      // Ensure unique index for transactions.paymentId to guarantee idempotency
      const hasTxnPaymentIdx = idx.find((i: any) => i.name === 'transactions.paymentId_1');
      if (!hasTxnPaymentIdx) {
        console.log('Creating unique sparse index on propertyaccounts.transactions.paymentId');
        await acct.createIndex(
          { 'transactions.paymentId': 1 as any },
          { name: 'transactions.paymentId_1', unique: true, sparse: true }
        );
      }
    } catch (acctIdxErr: any) {
      if (acctIdxErr && acctIdxErr.code === 26) {
        console.log('Accounting propertyaccounts collection not found; skipping compound index migration');
      } else {
        console.error('Accounting index migration error (non-fatal):', acctIdxErr);
      }
    }

    // Fix legacy indexes inconsistencies for companies collection
    try {
      // Ensure the companies collection exists to avoid NamespaceNotFound (26)
      try {
        await mongoose.connection.db.createCollection('companies');
      } catch (ensureErr: any) {
        // Ignore "collection already exists" (48); rethrow others
        if (ensureErr && ensureErr.code !== 48) {
          throw ensureErr;
        }
      }

      const companies = mongoose.connection.collection('companies');
      const existingIndexes = await companies.indexes();
      const hasLegacyTaxIndex = existingIndexes.some((idx: any) => idx.name === 'taxNumber_1');
      if (hasLegacyTaxIndex) {
        console.warn('Dropping legacy companies index taxNumber_1');
        await companies.dropIndex('taxNumber_1');
      }
      // Cosmos DB (Mongo API) compatible unique index on tinNumber.
      // Strategy:
      // 1) Normalize documents where tinNumber is an empty string to null (or unset),
      //    so a sparse unique index can enforce uniqueness only when present.
      // 2) Create { unique: true, sparse: true } index (partialFilterExpression with $ne is not supported).
      const hasTinIndex = existingIndexes.some((idx: any) => idx.name === 'tinNumber_1');
      if (!hasTinIndex) {
        console.log('Normalizing companies.tinNumber empty strings to null for sparse unique index');
        await companies.updateMany(
          { tinNumber: '' },
          { $set: { tinNumber: null } }
        );

        console.log('Creating sparse unique index on companies.tinNumber');
        await companies.createIndex(
          { tinNumber: 1 },
          { unique: true, sparse: true }
        );
      }
    } catch (idxError: any) {
      // Suppress noisy logs when collection truly does not exist yet
      if (idxError && idxError.code === 26) {
        console.log('Companies collection not found; skipping legacy index migration');
      } else {
        console.error('Company index migration error (non-fatal):', idxError);
      }
    }

    // Start health check
    startHealthCheck();
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    throw error;
  }
};

// Health check function
const startHealthCheck = () => {
  let healthCheckInterval: NodeJS.Timeout | null = null;

  const performHealthCheck = async () => {
    try {
      if (mongoose.connection.readyState !== 1) {
        healthCheckState.isHealthy = false;
        return;
      }

      // Simple ping to verify connection
      await mongoose.connection.db.admin().ping();
      
      healthCheckState.isHealthy = true;
      healthCheckState.lastCheck = new Date();
    } catch (error) {
      console.error('Health check failed:', error);
      healthCheckState.isHealthy = false;
    }
  };

  // Clear any existing interval
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }

  // Start new interval
  healthCheckInterval = setInterval(performHealthCheck, healthCheckState.checkInterval);
};

// Graceful shutdown
export const closeDatabase = async (): Promise<void> => {
  try {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  } catch (error) {
    console.error('Error closing MongoDB connection:', error);
    throw error;
  }
};

// Get database health status
export const getDatabaseHealth = () => {
  return {
    isConnected: mongoose.connection.readyState === 1,
    isHealthy: healthCheckState.isHealthy,
    lastCheck: healthCheckState.lastCheck,
    circuitBreakerOpen: circuitBreakerState.isOpen,
    failureCount: circuitBreakerState.failureCount
  };
};

// Check if database is available
export const isDatabaseAvailable = (): boolean => {
  return mongoose.connection.readyState === 1 && 
         healthCheckState.isHealthy && 
         !circuitBreakerState.isOpen;
}; 

export const getAccountingDatabaseHealth = () => {
  return {
    isConnected: accountingConnection.readyState === 1,
    dbName: accountingConnection.name,
    host: accountingConnection.host,
    port: accountingConnection.port
  };
}; 