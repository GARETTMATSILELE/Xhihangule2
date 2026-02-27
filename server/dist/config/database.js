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
const isProduction = process.env.NODE_ENV === 'production';
const getFirstEnv = (keys) => {
    for (const key of keys) {
        const value = process.env[key];
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }
    return undefined;
};
const resolveMainUri = () => {
    const envUri = getFirstEnv([
        'MONGODB_URI',
        'MONGODB_URI_PROPERTY',
        'CUSTOMCONNSTR_MONGODB_URI',
        'CUSTOMCONNSTR_MONGODB_URI_PROPERTY',
        'AZURE_COSMOS_CONNECTIONSTRING',
    ]);
    if (envUri)
        return envUri;
    if (isProduction) {
        throw new Error('Missing required MongoDB URI. Set one of: MONGODB_URI, MONGODB_URI_PROPERTY, CUSTOMCONNSTR_MONGODB_URI, AZURE_COSMOS_CONNECTIONSTRING.');
    }
    // In development, default to local unless explicitly forced
    if (process.env.FORCE_DB_URI === 'true') {
        return LOCAL_MAIN_URI;
    }
    return LOCAL_MAIN_URI;
};
const resolveAccountingUri = () => {
    const envUri = getFirstEnv([
        'ACCOUNTING_DB_URI',
        'MONGODB_URI_ACCOUNTING',
        'CUSTOMCONNSTR_ACCOUNTING_DB_URI',
        'CUSTOMCONNSTR_MONGODB_URI_ACCOUNTING',
    ]);
    if (envUri)
        return envUri;
    if (isProduction) {
        throw new Error('Missing required accounting MongoDB URI. Set one of: ACCOUNTING_DB_URI, MONGODB_URI_ACCOUNTING, CUSTOMCONNSTR_ACCOUNTING_DB_URI.');
    }
    return LOCAL_ACCOUNTING_URI;
};
const MONGODB_URI = resolveMainUri();
const ACCOUNTING_DB_URI = resolveAccountingUri();
const IS_COSMOS_MONGO = /cosmos\.azure\.com/i.test(MONGODB_URI) || /cosmos\.azure\.com/i.test(ACCOUNTING_DB_URI);
const RETRY_WRITES = typeof process.env.MONGODB_RETRY_WRITES === 'string'
    ? process.env.MONGODB_RETRY_WRITES.toLowerCase() === 'true'
    : !IS_COSMOS_MONGO;
// Create connections without opening immediately to avoid crashing when DB is down.
// We'll open these inside connectDatabase() within try/catch.
exports.mainConnection = mongoose_1.default.createConnection();
exports.accountingConnection = mongoose_1.default.createConnection();
// Connection options
const connectionOptions = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    maxPoolSize: Number(process.env.MONGODB_MAX_POOL_SIZE || 20),
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
    maxIdleTimeMS: Number(process.env.MONGODB_MAX_IDLE_TIME_MS || 120000), // Keep warm sockets longer to reduce churn under bursty traffic
    waitQueueTimeoutMS: 10000, // Fail fast under pool starvation to avoid request pileups
    maxConnecting: Number(process.env.MONGODB_MAX_CONNECTING || 4), // Limit concurrent connection establishment during outages
    family: 4, // Prefer IPv4 to avoid occasional dual-stack route issues
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
    checkInterval: Number(process.env.DB_HEALTH_CHECK_INTERVAL_MS || 60000), // 60s default to reduce probe pressure
    consecutiveFailures: 0,
    consecutiveSuccesses: 0,
    failureThreshold: Number(process.env.DB_HEALTH_FAILURE_THRESHOLD || 3),
    successThreshold: Number(process.env.DB_HEALTH_SUCCESS_THRESHOLD || 1),
};
let healthCheckInterval = null;
let connectionHandlersAttached = false;
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
        if (mongoose_1.default.connection.readyState === 1 || mongoose_1.default.connection.readyState === 2) {
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
            connectionHandlersAttached = true;
        }
        // Connect default mongoose connection (primary)
        yield mongoose_1.default.connect(MONGODB_URI, connectionOptions);
        // Open named connections (non-fatal if they fail; they will retry on next start)
        try {
            yield exports.mainConnection.openUri(MONGODB_URI, connectionOptions);
        }
        catch (e) {
            console.error('Failed to open mainConnection (non-fatal):', (e === null || e === void 0 ? void 0 : e.message) || e);
        }
        try {
            yield exports.accountingConnection.openUri(ACCOUNTING_DB_URI, connectionOptions);
        }
        catch (e) {
            console.error('Failed to open accountingConnection (non-fatal):', (e === null || e === void 0 ? void 0 : e.message) || e);
        }
        // Create indexes only when primary connection is still healthy.
        if (Number(mongoose_1.default.connection.readyState) === 1) {
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
        }
        else {
            console.warn('Skipping createIndexes because primary connection is not ready');
        }
        // Migrate accounting PropertyAccount legacy indexes (drop-only; creation is handled by model/service)
        try {
            // Initialize secondary/accounting connection lazily
            // Ensure accounting connection is established (createConnection is sync; .asPromise ensures ready)
            yield exports.accountingConnection.asPromise();
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
            // Creation of correct compound indexes is handled centrally in PropertyAccountService.ensureLedgerIndexes
            // We explicitly avoid creating simple/sparse legacy indexes here to prevent conflicts.
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
    const performHealthCheck = () => __awaiter(void 0, void 0, void 0, function* () {
        try {
            if (mongoose_1.default.connection.readyState !== 1) {
                healthCheckState.consecutiveFailures += 1;
                healthCheckState.consecutiveSuccesses = 0;
                if (healthCheckState.consecutiveFailures >= healthCheckState.failureThreshold) {
                    healthCheckState.isHealthy = false;
                }
                return;
            }
            // Simple ping to verify connection
            yield mongoose_1.default.connection.db.admin().ping();
            healthCheckState.consecutiveFailures = 0;
            healthCheckState.consecutiveSuccesses += 1;
            if (healthCheckState.consecutiveSuccesses >= healthCheckState.successThreshold) {
                healthCheckState.isHealthy = true;
            }
            healthCheckState.lastCheck = new Date();
        }
        catch (error) {
            healthCheckState.consecutiveFailures += 1;
            healthCheckState.consecutiveSuccesses = 0;
            if (healthCheckState.consecutiveFailures >= healthCheckState.failureThreshold) {
                healthCheckState.isHealthy = false;
            }
            if (healthCheckState.consecutiveFailures === healthCheckState.failureThreshold) {
                console.error('Health check failed repeatedly; marking DB unhealthy:', error);
            }
        }
    });
    // Clear any existing interval
    if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
    }
    // Start new interval
    performHealthCheck();
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
        isConnected: exports.accountingConnection ? exports.accountingConnection.readyState === 1 : false,
        dbName: exports.accountingConnection ? exports.accountingConnection.name : undefined,
        host: exports.accountingConnection ? exports.accountingConnection.host : undefined,
        port: exports.accountingConnection ? exports.accountingConnection.port : undefined
    };
};
exports.getAccountingDatabaseHealth = getAccountingDatabaseHealth;
