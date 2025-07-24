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