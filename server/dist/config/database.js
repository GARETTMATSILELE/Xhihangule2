"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDatabaseAvailable = exports.getDatabaseHealth = exports.closeDatabase = exports.connectDatabase = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const indexes_1 = require("../models/indexes");
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/property-management';
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
    compressors: ['zlib'], // Enable compression with correct type
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
const getRetryDelay = (retryCount) => {
    const delay = Math.min(retryConfig.initialDelay * Math.pow(2, retryCount), retryConfig.maxDelay);
    return delay + Math.random() * 1000; // Add jitter
};
// Connect to MongoDB
const connectDatabase = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (mongoose_1.default.connection.readyState === 1) {
            console.log('Already connected to MongoDB');
            return;
        }
        // Set up connection event handlers before connecting
        mongoose_1.default.connection.on('error', (error) => {
            console.error('MongoDB connection error:', error);
            circuitBreakerState.failureCount++;
            circuitBreakerState.lastFailureTime = new Date();
            if (circuitBreakerState.failureCount >= circuitBreakerState.threshold) {
                circuitBreakerState.isOpen = true;
                console.error('Circuit breaker opened due to repeated failures');
            }
        });
        mongoose_1.default.connection.on('disconnected', () => {
            console.warn('MongoDB disconnected');
            healthCheckState.isHealthy = false;
        });
        mongoose_1.default.connection.on('reconnected', () => {
            // Only log reconnection if we were previously disconnected
            if (!healthCheckState.isHealthy) {
                console.log('MongoDB reconnected');
            }
            healthCheckState.isHealthy = true;
            circuitBreakerState.isOpen = false;
            circuitBreakerState.failureCount = 0;
        });
        // Connect to MongoDB
        yield mongoose_1.default.connect(MONGODB_URI, connectionOptions);
        // Create indexes only if they don't exist
        try {
            yield (0, indexes_1.createIndexes)();
        }
        catch (error) {
            if (error.code === 85) { // Index already exists
                // Suppress the message for existing indexes
            }
            else {
                console.error('Error creating indexes:', error);
                // Don't throw error, continue without indexes
            }
        }
        // Start health check
        startHealthCheck();
    }
    catch (error) {
        console.error('Error connecting to MongoDB:', error);
        throw error;
    }
});
exports.connectDatabase = connectDatabase;
// Health check function
const startHealthCheck = () => {
    let healthCheckInterval = null;
    const performHealthCheck = () => __awaiter(void 0, void 0, void 0, function* () {
        try {
            if (mongoose_1.default.connection.readyState !== 1) {
                healthCheckState.isHealthy = false;
                return;
            }
            // Simple ping to verify connection
            yield mongoose_1.default.connection.db.admin().ping();
            healthCheckState.isHealthy = true;
            healthCheckState.lastCheck = new Date();
        }
        catch (error) {
            console.error('Health check failed:', error);
            healthCheckState.isHealthy = false;
        }
    });
    // Clear any existing interval
    if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
    }
    // Start new interval
    healthCheckInterval = setInterval(performHealthCheck, healthCheckState.checkInterval);
};
// Graceful shutdown
const closeDatabase = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield mongoose_1.default.connection.close();
        console.log('MongoDB connection closed');
    }
    catch (error) {
        console.error('Error closing MongoDB connection:', error);
        throw error;
    }
});
exports.closeDatabase = closeDatabase;
// Get database health status
const getDatabaseHealth = () => {
    return {
        isConnected: mongoose_1.default.connection.readyState === 1,
        isHealthy: healthCheckState.isHealthy,
        lastCheck: healthCheckState.lastCheck,
        circuitBreakerOpen: circuitBreakerState.isOpen,
        failureCount: circuitBreakerState.failureCount
    };
};
exports.getDatabaseHealth = getDatabaseHealth;
// Check if database is available
const isDatabaseAvailable = () => {
    return mongoose_1.default.connection.readyState === 1 &&
        healthCheckState.isHealthy &&
        !circuitBreakerState.isOpen;
};
exports.isDatabaseAvailable = isDatabaseAvailable;
