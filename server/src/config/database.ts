import mongoose from 'mongoose';
import { createIndexes } from '../models/indexes';

const LOCAL_MAIN_URI = 'mongodb://localhost:27017/property-management';
const LOCAL_ACCOUNTING_URI = 'mongodb://localhost:27017/accounting';

const isProduction = process.env.NODE_ENV === 'production';

const getFirstEnv = (keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
};

const resolveMainUri = (): string => {
  const envUri = getFirstEnv([
    'MONGODB_URI',
    'MONGODB_URI_PROPERTY',
    'CUSTOMCONNSTR_MONGODB_URI',
    'CUSTOMCONNSTR_MONGODB_URI_PROPERTY',
    'AZURE_COSMOS_CONNECTIONSTRING',
  ]);

  if (envUri) return envUri;
  if (isProduction) {
    throw new Error(
      'Missing required MongoDB URI. Set one of: MONGODB_URI, MONGODB_URI_PROPERTY, CUSTOMCONNSTR_MONGODB_URI, AZURE_COSMOS_CONNECTIONSTRING.'
    );
  }

  // In development, default to local unless explicitly forced
  if (process.env.FORCE_DB_URI === 'true') {
    return LOCAL_MAIN_URI;
  }
  return LOCAL_MAIN_URI;
};

const resolveAccountingUri = (): string => {
  const envUri = getFirstEnv([
    'ACCOUNTING_DB_URI',
    'MONGODB_URI_ACCOUNTING',
    'CUSTOMCONNSTR_ACCOUNTING_DB_URI',
    'CUSTOMCONNSTR_MONGODB_URI_ACCOUNTING',
  ]);

  if (envUri) return envUri;
  if (isProduction) {
    throw new Error(
      'Missing required accounting MongoDB URI. Set one of: ACCOUNTING_DB_URI, MONGODB_URI_ACCOUNTING, CUSTOMCONNSTR_ACCOUNTING_DB_URI.'
    );
  }

  return LOCAL_ACCOUNTING_URI;
};

const MONGODB_URI = resolveMainUri();
const ACCOUNTING_DB_URI = resolveAccountingUri();
const IS_COSMOS_MONGO =
  /cosmos\.azure\.com/i.test(MONGODB_URI) || /cosmos\.azure\.com/i.test(ACCOUNTING_DB_URI);
const RETRY_WRITES =
  typeof process.env.MONGODB_RETRY_WRITES === 'string'
    ? process.env.MONGODB_RETRY_WRITES.toLowerCase() === 'true'
    : !IS_COSMOS_MONGO;

// Create connections without opening immediately to avoid crashing when DB is down.
// We'll open these inside connectDatabase() within try/catch.
export const mainConnection = mongoose.createConnection();
export const accountingConnection = mongoose.createConnection();

// Connection options
const connectionOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  maxPoolSize: 10,
  minPoolSize: 0,
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 120000,
  connectTimeoutMS: 30000,
  retryWrites: RETRY_WRITES,
  retryReads: true,
  autoIndex: false,
  autoCreate: false,
  bufferCommands: false, // Disable command buffering
  // Heartbeat settings
  heartbeatFrequencyMS: 10000, // 10 seconds
  // Add recommended settings
  maxIdleTimeMS: 30000, // Close idle connections after 30 seconds
  waitQueueTimeoutMS: 10000, // Fail fast under pool starvation to avoid request pileups
  maxConnecting: 2, // Limit concurrent connection establishment during outages
  family: 4, // Prefer IPv4 to avoid occasional dual-stack route issues
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
  checkInterval: 30000, // 30 seconds for faster readiness recovery
};

let healthCheckInterval: NodeJS.Timeout | null = null;
let connectionHandlersAttached = false;

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
    if (mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2) {
      console.log('Already connected to MongoDB');
      return;
    }
    if (IS_COSMOS_MONGO) {
      console.log('Cosmos Mongo endpoint detected; using conservative write retry settings', {
        retryWrites: RETRY_WRITES
      });
    }

    // Set up connection event handlers once to avoid duplicate listeners on reconnect attempts
    if (!connectionHandlersAttached) {
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

      connectionHandlersAttached = true;
    }

    // Connect default mongoose connection (primary)
    await mongoose.connect(MONGODB_URI, connectionOptions);
    // Open named connections (non-fatal if they fail; they will retry on next start)
    try {
      await mainConnection.openUri(MONGODB_URI, connectionOptions as any);
    } catch (e) {
      console.error('Failed to open mainConnection (non-fatal):', (e as any)?.message || e);
    }
    try {
      await accountingConnection.openUri(ACCOUNTING_DB_URI, connectionOptions as any);
    } catch (e) {
      console.error('Failed to open accountingConnection (non-fatal):', (e as any)?.message || e);
    }
    
    // Create indexes only when primary connection is still healthy.
    if (Number(mongoose.connection.readyState) === 1) {
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
    } else {
      console.warn('Skipping createIndexes because primary connection is not ready');
    }

    // Migrate accounting PropertyAccount legacy indexes (drop-only; creation is handled by model/service)
    try {
      // Initialize secondary/accounting connection lazily
      // Ensure accounting connection is established (createConnection is sync; .asPromise ensures ready)
      await accountingConnection.asPromise();
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

      // Creation of correct compound indexes is handled centrally in PropertyAccountService.ensureLedgerIndexes
      // We explicitly avoid creating simple/sparse legacy indexes here to prevent conflicts.
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
  performHealthCheck();
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
    isConnected: accountingConnection ? accountingConnection.readyState === 1 : false,
    dbName: accountingConnection ? accountingConnection.name : undefined,
    host: accountingConnection ? (accountingConnection as any).host : undefined,
    port: accountingConnection ? (accountingConnection as any).port : undefined
  };
}; 