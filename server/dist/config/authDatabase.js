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
exports.isAuthDatabaseAvailable = exports.getAuthDatabaseHealth = exports.closeAuthDatabase = exports.connectAuthDatabase = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
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
const connectAuthDatabase = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (mongoose_1.default.connection.readyState === 1) {
            console.log('Already connected to Auth MongoDB');
            return;
        }
        // Set up connection event handlers before connecting
        mongoose_1.default.connection.on('error', (error) => {
            console.error('Auth MongoDB connection error:', error);
            authCircuitBreakerState.failureCount++;
            authCircuitBreakerState.lastFailureTime = new Date();
            if (authCircuitBreakerState.failureCount >= authCircuitBreakerState.threshold) {
                authCircuitBreakerState.isOpen = true;
                console.error('Auth circuit breaker opened due to repeated failures');
            }
        });
        mongoose_1.default.connection.on('disconnected', () => {
            console.warn('Auth MongoDB disconnected');
            authHealthCheckState.isHealthy = false;
        });
        mongoose_1.default.connection.on('reconnected', () => {
            if (!authHealthCheckState.isHealthy) {
                console.log('Auth MongoDB reconnected');
            }
            authHealthCheckState.isHealthy = true;
            authCircuitBreakerState.isOpen = false;
            authCircuitBreakerState.failureCount = 0;
        });
        // Connect to Auth MongoDB
        yield mongoose_1.default.connect(AUTH_MONGODB_URI, authConnectionOptions);
        console.log('Connected to Auth MongoDB');
        // Start health check
        startAuthHealthCheck();
    }
    catch (error) {
        console.error('Error connecting to Auth MongoDB:', error);
        throw error;
    }
});
exports.connectAuthDatabase = connectAuthDatabase;
// Health check function for auth
const startAuthHealthCheck = () => {
    let healthCheckInterval = null;
    const performHealthCheck = () => __awaiter(void 0, void 0, void 0, function* () {
        try {
            if (mongoose_1.default.connection.readyState !== 1) {
                authHealthCheckState.isHealthy = false;
                return;
            }
            yield mongoose_1.default.connection.db.admin().ping();
            authHealthCheckState.isHealthy = true;
            authHealthCheckState.lastCheck = new Date();
        }
        catch (error) {
            console.error('Auth health check failed:', error);
            authHealthCheckState.isHealthy = false;
        }
    });
    if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
    }
    healthCheckInterval = setInterval(performHealthCheck, authHealthCheckState.checkInterval);
};
// Graceful shutdown for auth
const closeAuthDatabase = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield mongoose_1.default.connection.close();
        console.log('Auth MongoDB connection closed');
    }
    catch (error) {
        console.error('Error closing Auth MongoDB connection:', error);
        throw error;
    }
});
exports.closeAuthDatabase = closeAuthDatabase;
// Get auth database health status
const getAuthDatabaseHealth = () => {
    return {
        isConnected: mongoose_1.default.connection.readyState === 1,
        isHealthy: authHealthCheckState.isHealthy,
        lastCheck: authHealthCheckState.lastCheck,
        circuitBreakerOpen: authCircuitBreakerState.isOpen,
        failureCount: authCircuitBreakerState.failureCount
    };
};
exports.getAuthDatabaseHealth = getAuthDatabaseHealth;
// Check if auth database is available
const isAuthDatabaseAvailable = () => {
    return mongoose_1.default.connection.readyState === 1 &&
        authHealthCheckState.isHealthy &&
        !authCircuitBreakerState.isOpen;
};
exports.isAuthDatabaseAvailable = isAuthDatabaseAvailable;
