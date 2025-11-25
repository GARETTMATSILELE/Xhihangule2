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
exports.getAccountingDatabaseHealth = exports.isDatabaseAvailable = exports.getDatabaseHealth = exports.closeDatabase = exports.connectDatabase = exports.accountingConnection = exports.mainConnection = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const indexes_1 = require("../models/indexes");
const LOCAL_MAIN_URI = 'mongodb://localhost:27017/property-management';
const LOCAL_ACCOUNTING_URI = 'mongodb://localhost:27017/accounting';
const getEffectiveUri = (envValue, localFallback) => {
    // In production, use the provided env var if present, otherwise fallback
    if (process.env.NODE_ENV === 'production') {
        return envValue && envValue.trim() ? envValue : localFallback;
    }
    // In development, default to local unless explicitly forced
    if (process.env.FORCE_DB_URI === 'true') {
        return envValue && envValue.trim() ? envValue : localFallback;
    }
    return localFallback;
};
const MONGODB_URI = getEffectiveUri(process.env.MONGODB_URI, LOCAL_MAIN_URI);
const ACCOUNTING_DB_URI = getEffectiveUri(process.env.ACCOUNTING_DB_URI, LOCAL_ACCOUNTING_URI);
exports.mainConnection = mongoose_1.default.createConnection(MONGODB_URI);
exports.accountingConnection = mongoose_1.default.createConnection(ACCOUNTING_DB_URI);
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
        // Migrate accounting PropertyAccount ownerPayouts.referenceNumber unique index to compound index
        try {
            // Ensure accounting collection exists to avoid NamespaceNotFound (26)
            try {
                yield exports.accountingConnection.db.createCollection('propertyaccounts');
            }
            catch (ensureErr) {
                if (ensureErr && ensureErr.code !== 48) {
                    throw ensureErr;
                }
            }
            const acct = exports.accountingConnection.collection('propertyaccounts');
            const idx = yield acct.indexes();
            // Drop legacy subdocument unique index if present
            const legacy = idx.find((i) => i.name === 'ownerPayouts.referenceNumber_1');
            if (legacy) {
                console.warn('Dropping legacy index ownerPayouts.referenceNumber_1 on propertyaccounts');
                try {
                    yield acct.dropIndex('ownerPayouts.referenceNumber_1');
                }
                catch (dropErr) {
                    if (!dropErr || (dropErr.code !== 27 && dropErr.codeName !== 'IndexNotFound')) {
                        throw dropErr;
                    }
                }
            }
            // Create compound unique index if missing
            const hasCompound = idx.find((i) => i.name === 'propertyId_1_ownerPayouts.referenceNumber_1');
            if (!hasCompound) {
                console.log('Creating compound unique index on propertyaccounts: { propertyId: 1, ownerPayouts.referenceNumber: 1 }');
                yield acct.createIndex({ propertyId: 1, 'ownerPayouts.referenceNumber': 1 }, { name: 'propertyId_1_ownerPayouts.referenceNumber_1', unique: true, sparse: true });
            }
            // Ensure unique index for transactions.paymentId to guarantee idempotency
            const hasTxnPaymentIdx = idx.find((i) => i.name === 'transactions.paymentId_1');
            if (!hasTxnPaymentIdx) {
                console.log('Creating unique sparse index on propertyaccounts.transactions.paymentId');
                yield acct.createIndex({ 'transactions.paymentId': 1 }, { name: 'transactions.paymentId_1', unique: true, sparse: true });
            }
        }
        catch (acctIdxErr) {
            if (acctIdxErr && acctIdxErr.code === 26) {
                console.log('Accounting propertyaccounts collection not found; skipping compound index migration');
            }
            else {
                console.error('Accounting index migration error (non-fatal):', acctIdxErr);
            }
        }
        // Fix legacy indexes inconsistencies for companies collection
        try {
            // Ensure the companies collection exists to avoid NamespaceNotFound (26)
            try {
                yield mongoose_1.default.connection.db.createCollection('companies');
            }
            catch (ensureErr) {
                // Ignore "collection already exists" (48); rethrow others
                if (ensureErr && ensureErr.code !== 48) {
                    throw ensureErr;
                }
            }
            const companies = mongoose_1.default.connection.collection('companies');
            const existingIndexes = yield companies.indexes();
            const hasLegacyTaxIndex = existingIndexes.some((idx) => idx.name === 'taxNumber_1');
            if (hasLegacyTaxIndex) {
                console.warn('Dropping legacy companies index taxNumber_1');
                yield companies.dropIndex('taxNumber_1');
            }
            // Cosmos DB (Mongo API) compatible unique index on tinNumber.
            // Strategy:
            // 1) Normalize documents where tinNumber is an empty string to null (or unset),
            //    so a sparse unique index can enforce uniqueness only when present.
            // 2) Create { unique: true, sparse: true } index (partialFilterExpression with $ne is not supported).
            const hasTinIndex = existingIndexes.some((idx) => idx.name === 'tinNumber_1');
            if (!hasTinIndex) {
                console.log('Normalizing companies.tinNumber empty strings to null for sparse unique index');
                yield companies.updateMany({ tinNumber: '' }, { $set: { tinNumber: null } });
                console.log('Creating sparse unique index on companies.tinNumber');
                yield companies.createIndex({ tinNumber: 1 }, { unique: true, sparse: true });
            }
        }
        catch (idxError) {
            // Suppress noisy logs when collection truly does not exist yet
            if (idxError && idxError.code === 26) {
                console.log('Companies collection not found; skipping legacy index migration');
            }
            else {
                console.error('Company index migration error (non-fatal):', idxError);
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
const getAccountingDatabaseHealth = () => {
    return {
        isConnected: exports.accountingConnection.readyState === 1,
        dbName: exports.accountingConnection.name,
        host: exports.accountingConnection.host,
        port: exports.accountingConnection.port
    };
};
exports.getAccountingDatabaseHealth = getAccountingDatabaseHealth;
