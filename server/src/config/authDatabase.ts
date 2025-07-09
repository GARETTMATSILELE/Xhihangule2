import mongoose from 'mongoose';

const AUTH_MONGODB_URI = process.env.AUTH_MONGODB_URI || 'mongodb://localhost:27017/property-management-auth';

// Connection options specific for auth
const authConnectionOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  maxPoolSize: 5, // Smaller pool for auth
  minPoolSize: 2,
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 30000,
  retryWrites: true,
  retryReads: true,
  autoIndex: false,
  autoCreate: false,
  keepAlive: true,
  keepAliveInitialDelay: 300000,
  heartbeatFrequencyMS: 10000,
};

// Circuit breaker state for auth
let authCircuitBreakerState = {
  isOpen: false,
  failureCount: 0,
  lastFailureTime: new Date(),
  threshold: 3, // Lower threshold for auth
  resetTimeout: 120000,
};

// Health check state for auth
let authHealthCheckState = {
  isHealthy: true,
  lastCheck: new Date(),
  checkInterval: 300000,
};

// Connect to Auth MongoDB
export const connectAuthDatabase = async (): Promise<void> => {
  try {
    if (mongoose.connection.readyState === 1) {
      console.log('Already connected to Auth MongoDB');
      return;
    }

    // Set up connection event handlers before connecting
    mongoose.connection.on('error', (error) => {
      console.error('Auth MongoDB connection error:', error);
      authCircuitBreakerState.failureCount++;
      authCircuitBreakerState.lastFailureTime = new Date();

      if (authCircuitBreakerState.failureCount >= authCircuitBreakerState.threshold) {
        authCircuitBreakerState.isOpen = true;
        console.error('Auth circuit breaker opened due to repeated failures');
      }
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('Auth MongoDB disconnected');
      authHealthCheckState.isHealthy = false;
    });

    mongoose.connection.on('reconnected', () => {
      if (!authHealthCheckState.isHealthy) {
        console.log('Auth MongoDB reconnected');
      }
      authHealthCheckState.isHealthy = true;
      authCircuitBreakerState.isOpen = false;
      authCircuitBreakerState.failureCount = 0;
    });

    // Connect to Auth MongoDB
    await mongoose.connect(AUTH_MONGODB_URI, authConnectionOptions);
    console.log('Connected to Auth MongoDB');

    // Start health check
    startAuthHealthCheck();
  } catch (error) {
    console.error('Error connecting to Auth MongoDB:', error);
    throw error;
  }
};

// Health check function for auth
const startAuthHealthCheck = () => {
  let healthCheckInterval: NodeJS.Timeout | null = null;

  const performHealthCheck = async () => {
    try {
      if (mongoose.connection.readyState !== 1) {
        authHealthCheckState.isHealthy = false;
        return;
      }

      await mongoose.connection.db.admin().ping();
      authHealthCheckState.isHealthy = true;
      authHealthCheckState.lastCheck = new Date();
    } catch (error) {
      console.error('Auth health check failed:', error);
      authHealthCheckState.isHealthy = false;
    }
  };

  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }

  healthCheckInterval = setInterval(performHealthCheck, authHealthCheckState.checkInterval);
};

// Graceful shutdown for auth
export const closeAuthDatabase = async (): Promise<void> => {
  try {
    await mongoose.connection.close();
    console.log('Auth MongoDB connection closed');
  } catch (error) {
    console.error('Error closing Auth MongoDB connection:', error);
    throw error;
  }
};

// Get auth database health status
export const getAuthDatabaseHealth = () => {
  return {
    isConnected: mongoose.connection.readyState === 1,
    isHealthy: authHealthCheckState.isHealthy,
    lastCheck: authHealthCheckState.lastCheck,
    circuitBreakerOpen: authCircuitBreakerState.isOpen,
    failureCount: authCircuitBreakerState.failureCount
  };
};

// Check if auth database is available
export const isAuthDatabaseAvailable = (): boolean => {
  return mongoose.connection.readyState === 1 && 
         authHealthCheckState.isHealthy && 
         !authCircuitBreakerState.isOpen;
}; 