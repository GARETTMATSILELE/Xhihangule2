"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.DatabaseSyncService = void 0;
const database_1 = require("../config/database");
const Payment_1 = require("../models/Payment");
const Property_1 = require("../models/Property");
const User_1 = require("../models/User");
const logger_1 = require("../utils/logger");
const databaseService_1 = require("./databaseService");
const SyncFailure_1 = __importDefault(require("../models/SyncFailure"));
const events_1 = require("events");
const propertyAccountService_1 = __importStar(require("./propertyAccountService"));
const ledgerEventService_1 = __importDefault(require("./ledgerEventService"));
class DatabaseSyncService extends events_1.EventEmitter {
    constructor() {
        super();
        this.isRunning = false;
        this.changeStreams = new Map();
        // Track async full sync job state
        this.fullSyncInProgress = false;
        this.currentFullSyncJobId = null;
        this.currentFullSyncStartedAt = null;
        this.lastFullSyncCompletedAt = null;
        this.lastFullSyncError = null;
        this.syncStats = {
            totalSynced: 0,
            successCount: 0,
            errorCount: 0,
            lastSyncTime: new Date(),
            syncDuration: 0,
            errors: []
        };
        this.db = databaseService_1.DatabaseService.getInstance();
    }
    static getInstance() {
        if (!DatabaseSyncService.instance) {
            DatabaseSyncService.instance = new DatabaseSyncService();
        }
        return DatabaseSyncService.instance;
    }
    /**
     * Start real-time synchronization using MongoDB Change Streams
     */
    startRealTimeSync() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.isRunning) {
                logger_1.logger.info('Real-time sync is already running');
                return;
            }
            try {
                logger_1.logger.info('Starting real-time database synchronization...');
                // Check if database connections are available
                if (!database_1.mainConnection || !database_1.accountingConnection) {
                    throw new Error('Database connections not available');
                }
                // Try to set up change streams for critical collections
                try {
                    yield this.setupChangeStreams();
                    this.isRunning = true;
                    logger_1.logger.info('Real-time sync started successfully with change streams');
                }
                catch (changeStreamError) {
                    logger_1.logger.warn('Change streams setup failed, attempting polling fallback:', changeStreamError);
                    // Check if this is a change stream compatibility issue
                    if (changeStreamError instanceof Error &&
                        (changeStreamError.message.includes('replica sets') ||
                            changeStreamError.message.includes('$changeStream') ||
                            changeStreamError.message.includes('Change streams require replica set'))) {
                        logger_1.logger.warn('Change streams not supported on standalone MongoDB. Real-time sync will use polling instead.');
                        try {
                            // Fall back to polling-based sync
                            yield this.startPollingSync();
                            this.isRunning = true;
                            logger_1.logger.info('Real-time sync started successfully with polling fallback');
                        }
                        catch (pollingError) {
                            logger_1.logger.error('Polling fallback also failed:', pollingError);
                            throw new Error(`Failed to start real-time sync: ${pollingError instanceof Error ? pollingError.message : String(pollingError)}`);
                        }
                    }
                    else {
                        // This is not a change stream compatibility issue, re-throw
                        throw changeStreamError;
                    }
                }
                // Emit sync started event
                this.emit('syncStarted', { timestamp: new Date() });
                // Start background ledger event processing loop (common for both modes)
                try {
                    const processInterval = setInterval(() => __awaiter(this, void 0, void 0, function* () {
                        try {
                            yield ledgerEventService_1.default.processPending(50);
                        }
                        catch (procErr) {
                            logger_1.logger.warn('Ledger events processing tick failed:', procErr);
                        }
                    }), 15000);
                    this.changeStreams.set('ledger_events_processing', { close: () => clearInterval(processInterval) });
                    logger_1.logger.info('Started ledger events processing loop');
                }
                catch (e) {
                    logger_1.logger.warn('Failed to start ledger events processing loop:', e);
                }
            }
            catch (error) {
                logger_1.logger.error('Failed to start real-time sync:', error);
                throw error;
            }
        });
    }
    /**
     * Stop real-time synchronization
     */
    stopRealTimeSync() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.isRunning) {
                logger_1.logger.info('Real-time sync is not running');
                return;
            }
            try {
                logger_1.logger.info('Stopping real-time database synchronization...');
                // Close all change streams
                for (const [collection, stream] of this.changeStreams) {
                    yield stream.close();
                    logger_1.logger.info(`Closed change stream for ${collection}`);
                }
                this.changeStreams.clear();
                this.isRunning = false;
                logger_1.logger.info('Real-time sync stopped successfully');
                // Emit sync stopped event
                this.emit('syncStopped', { timestamp: new Date() });
            }
            catch (error) {
                logger_1.logger.error('Failed to stop real-time sync:', error);
                throw error;
            }
        });
    }
    /**
     * Set up change streams for critical collections
     */
    setupChangeStreams() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Check if database connections are available
                if (!database_1.mainConnection || !database_1.accountingConnection) {
                    throw new Error('Database connections not available');
                }
                // Check if models are available
                if (!Payment_1.Payment || !Property_1.Property || !User_1.User) {
                    throw new Error('Required models not available');
                }
                // Check if change streams are supported (replica set required)
                try {
                    // Try to get server info to check if it's a replica set
                    const serverInfo = yield database_1.mainConnection.db.admin().serverInfo();
                    if (!serverInfo.setName) {
                        logger_1.logger.warn('Standalone MongoDB detected - change streams not supported');
                        throw new Error('Change streams require replica set configuration');
                    }
                    logger_1.logger.info(`Replica set detected: ${serverInfo.setName}`);
                }
                catch (error) {
                    logger_1.logger.warn('Could not determine MongoDB configuration - assuming standalone');
                    throw new Error('Change streams require replica set configuration');
                }
                // Payment changes
                const paymentStream = Payment_1.Payment.watch([], { fullDocument: 'updateLookup' });
                paymentStream.on('change', (change) => __awaiter(this, void 0, void 0, function* () {
                    yield this.handlePaymentChange(change);
                }));
                paymentStream.on('error', (error) => {
                    logger_1.logger.error('Payment change stream error:', error);
                    if (error.message.includes('replica sets') || error.message.includes('$changeStream')) {
                        throw new Error('Change streams require replica set configuration');
                    }
                });
                this.changeStreams.set('payments', paymentStream);
                // Property changes
                const propertyStream = Property_1.Property.watch([], { fullDocument: 'updateLookup' });
                propertyStream.on('change', (change) => __awaiter(this, void 0, void 0, function* () {
                    yield this.handlePropertyChange(change);
                }));
                propertyStream.on('error', (error) => {
                    logger_1.logger.error('Property change stream error:', error);
                    if (error.message.includes('replica sets') || error.message.includes('$changeStream')) {
                        throw new Error('Change streams require replica set configuration');
                    }
                });
                this.changeStreams.set('properties', propertyStream);
                // User changes
                const userStream = User_1.User.watch([], { fullDocument: 'updateLookup' });
                userStream.on('change', (change) => __awaiter(this, void 0, void 0, function* () {
                    yield this.handleUserChange(change);
                }));
                userStream.on('error', (error) => {
                    logger_1.logger.error('User change stream error:', error);
                    if (error.message.includes('replica sets') || error.message.includes('$changeStream')) {
                        throw new Error('Change streams require replica set configuration');
                    }
                });
                this.changeStreams.set('users', userStream);
                logger_1.logger.info('Change streams set up successfully');
            }
            catch (error) {
                logger_1.logger.error('Failed to set up change streams:', error);
                throw error;
            }
        });
    }
    /**
     * Start polling-based synchronization as fallback for standalone MongoDB
     */
    startPollingSync() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                logger_1.logger.info('Starting polling-based synchronization...');
                // Set up polling intervals for different collections
                const pollingIntervals = {
                    payments: 30000, // 30 seconds
                    properties: 60000, // 1 minute
                    users: 120000 // 2 minutes
                };
                // Start polling for payments
                const paymentPolling = setInterval(() => __awaiter(this, void 0, void 0, function* () {
                    try {
                        yield this.pollPaymentChanges();
                    }
                    catch (error) {
                        logger_1.logger.error('Error polling payment changes:', error);
                    }
                }), pollingIntervals.payments);
                // Start polling for properties
                const propertyPolling = setInterval(() => __awaiter(this, void 0, void 0, function* () {
                    try {
                        yield this.pollPropertyChanges();
                    }
                    catch (error) {
                        logger_1.logger.error('Error polling property changes:', error);
                    }
                }), pollingIntervals.properties);
                // Start polling for users
                const userPolling = setInterval(() => __awaiter(this, void 0, void 0, function* () {
                    try {
                        yield this.pollUserChanges();
                    }
                    catch (error) {
                        logger_1.logger.error('Error polling user changes:', error);
                    }
                }), pollingIntervals.users);
                // Store polling intervals for cleanup
                this.changeStreams.set('payments_polling', { close: () => clearInterval(paymentPolling) });
                this.changeStreams.set('properties_polling', { close: () => clearInterval(propertyPolling) });
                this.changeStreams.set('users_polling', { close: () => clearInterval(userPolling) });
                // Also start background ledger event processing in polling mode
                const ledgerEventsPolling = setInterval(() => __awaiter(this, void 0, void 0, function* () {
                    try {
                        yield ledgerEventService_1.default.processPending(50);
                    }
                    catch (e) {
                        logger_1.logger.warn('Error polling ledger events:', e);
                    }
                }), 15000);
                this.changeStreams.set('ledger_events_polling', { close: () => clearInterval(ledgerEventsPolling) });
                logger_1.logger.info('Polling-based synchronization started successfully');
            }
            catch (error) {
                logger_1.logger.error('Failed to start polling sync:', error);
                throw error;
            }
        });
    }
    /**
     * Poll for payment changes
     */
    pollPaymentChanges() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Get recent payments that might need syncing
                const recentPayments = yield Payment_1.Payment.find({
                    updatedAt: { $gte: new Date(Date.now() - 60000) } // Last minute
                }).limit(100);
                for (const payment of recentPayments) {
                    if (payment.status === 'completed' && (payment.paymentType === 'rental' || payment.paymentType === 'sale')) {
                        try {
                            yield this.syncPaymentToAccounting(payment);
                        }
                        catch (e) {
                            // syncPaymentToAccounting already records failure; continue
                        }
                    }
                }
            }
            catch (error) {
                logger_1.logger.error('Error polling payment changes:', error);
            }
        });
    }
    /**
     * Poll for property changes
     */
    pollPropertyChanges() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Get recent properties that might need syncing
                const recentProperties = yield Property_1.Property.find({
                    updatedAt: { $gte: new Date(Date.now() - 120000) } // Last 2 minutes
                }).limit(100);
                for (const property of recentProperties) {
                    yield this.syncPropertyToAccounting(property);
                }
            }
            catch (error) {
                logger_1.logger.error('Error polling property changes:', error);
            }
        });
    }
    /**
     * Poll for user changes
     */
    pollUserChanges() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Get recent users that might need syncing
                const recentUsers = yield User_1.User.find({
                    updatedAt: { $gte: new Date(Date.now() - 240000) } // Last 4 minutes
                }).limit(100);
                for (const user of recentUsers) {
                    yield this.syncUserToAccounting(user);
                }
            }
            catch (error) {
                logger_1.logger.error('Error polling user changes:', error);
            }
        });
    }
    /**
     * Handle payment changes
     */
    handlePaymentChange(change) {
        return __awaiter(this, void 0, void 0, function* () {
            const { operationType, documentKey, fullDocument } = change;
            const documentId = documentKey._id.toString();
            try {
                if (operationType === 'insert' || operationType === 'update') {
                    if (fullDocument && fullDocument.status === 'completed' && (fullDocument.paymentType === 'rental' || fullDocument.paymentType === 'sale')) {
                        try {
                            yield this.syncPaymentToAccounting(fullDocument);
                            // Reflect to property ledger as well (idempotent)
                            try {
                                yield propertyAccountService_1.default.recordIncomeFromPayment(documentId);
                            }
                            catch (ledgerErr) {
                                // Enqueue for retry via ledger event service if immediate posting fails
                                try {
                                    yield ledgerEventService_1.default.enqueueOwnerIncomeEvent(documentId);
                                }
                                catch (_a) { }
                                logger_1.logger.warn('Ledger post failed on change stream; enqueued for retry:', (ledgerErr === null || ledgerErr === void 0 ? void 0 : ledgerErr.message) || ledgerErr);
                            }
                            // After attempting postings, verify and reconcile postings across ledgers in near-real-time
                            try {
                                yield this.verifyAndReconcilePaymentPosting(documentId);
                            }
                            catch (verifyErr) {
                                logger_1.logger.warn('Post-sync verification failed (non-fatal):', (verifyErr === null || verifyErr === void 0 ? void 0 : verifyErr.message) || verifyErr);
                            }
                            yield this.clearFailureRecord('payment', documentId);
                        }
                        catch (e) {
                            // error recorded in syncPaymentToAccounting
                        }
                    }
                }
                else if (operationType === 'delete') {
                    yield this.removePaymentFromAccounting(documentId);
                    yield this.clearFailureRecord('payment', documentId);
                }
                // Emit sync event
                this.emit('paymentSynced', {
                    type: 'payment',
                    action: operationType === 'insert' ? 'create' : operationType === 'update' ? 'update' : 'delete',
                    documentId: documentId,
                    collection: 'payments',
                    timestamp: new Date(),
                    data: fullDocument
                });
            }
            catch (error) {
                logger_1.logger.error('Error handling payment change:', error);
                this.recordSyncError('payment', documentId, error);
            }
        });
    }
    /**
     * Handle property changes
     */
    handlePropertyChange(change) {
        return __awaiter(this, void 0, void 0, function* () {
            const { operationType, documentKey, fullDocument } = change;
            const documentId = documentKey._id.toString();
            try {
                if (operationType === 'insert' || operationType === 'update') {
                    yield this.syncPropertyToAccounting(fullDocument);
                    yield this.clearFailureRecord('property', documentId);
                }
                else if (operationType === 'delete') {
                    yield this.removePropertyFromAccounting(documentId);
                    yield this.clearFailureRecord('property', documentId);
                }
                // Emit sync event
                this.emit('propertySynced', {
                    type: 'property',
                    action: operationType === 'insert' ? 'create' : operationType === 'update' ? 'update' : 'delete',
                    documentId: documentId,
                    collection: 'properties',
                    timestamp: new Date(),
                    data: fullDocument
                });
            }
            catch (error) {
                logger_1.logger.error('Error handling property change:', error);
                this.recordSyncError('property', documentId, error);
            }
        });
    }
    /**
     * Handle user changes
     */
    handleUserChange(change) {
        return __awaiter(this, void 0, void 0, function* () {
            const { operationType, documentKey, fullDocument } = change;
            const documentId = documentKey._id.toString();
            try {
                if (operationType === 'insert' || operationType === 'update') {
                    yield this.syncUserToAccounting(fullDocument);
                    yield this.clearFailureRecord('user', documentId);
                }
                else if (operationType === 'delete') {
                    yield this.removeUserFromAccounting(documentId);
                    yield this.clearFailureRecord('user', documentId);
                }
                // Emit sync event
                this.emit('userSynced', {
                    type: 'user',
                    action: operationType === 'insert' ? 'create' : operationType === 'update' ? 'update' : 'delete',
                    documentId: documentId,
                    collection: 'users',
                    timestamp: new Date(),
                    data: fullDocument
                });
            }
            catch (error) {
                logger_1.logger.error('Error handling user change:', error);
                this.recordSyncError('user', documentId, error);
            }
        });
    }
    /**
     * Sync payment to accounting database
     */
    syncPaymentToAccounting(payment) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                // Record agency commission into company account as revenue (idempotent, race-safe)
                const { CompanyAccount } = yield Promise.resolve().then(() => __importStar(require('../models/CompanyAccount')));
                if (payment.companyId && ((_a = payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.agencyShare)) {
                    const companyId = payment.companyId;
                    // Determine correct source label based on payment type
                    const desiredSource = payment.paymentType === 'sale' ? 'sales_commission' : 'rental_commission';
                    const agencyShare = payment.commissionDetails.agencyShare;
                    const txDoc = {
                        type: 'income',
                        source: desiredSource,
                        amount: agencyShare,
                        date: payment.paymentDate || new Date(),
                        currency: payment.currency || 'USD',
                        paymentMethod: payment.paymentMethod,
                        paymentId: payment._id,
                        referenceNumber: payment.referenceNumber,
                        description: desiredSource === 'sales_commission' ? 'Sales commission income' : 'Rental commission income',
                        processedBy: payment.processedBy,
                        notes: payment.notes
                    };
                    yield this.db.executeWithRetry(() => __awaiter(this, void 0, void 0, function* () {
                        // 1) Ensure base account exists (idempotent)
                        yield CompanyAccount.updateOne({ companyId }, { $setOnInsert: { companyId, runningBalance: 0, totalIncome: 0, totalExpenses: 0, lastUpdated: new Date() } }, { upsert: true });
                        // 2) Append commission transaction only if not already present; do NOT upsert here to avoid duplicate docs
                        const res = yield CompanyAccount.updateOne({ companyId, transactions: { $not: { $elemMatch: { paymentId: payment._id } } } }, {
                            $push: { transactions: txDoc },
                            $inc: { totalIncome: agencyShare, runningBalance: agencyShare },
                            $set: { lastUpdated: new Date() }
                        });
                        // If already present (matchedCount === 0), treat as success (idempotent)
                    }));
                    logger_1.logger.info(`Recorded company revenue ${agencyShare} for company ${companyId} from payment ${payment._id}`);
                }
                this.recordSyncSuccess();
            }
            catch (error) {
                logger_1.logger.error(`Failed to sync payment ${payment._id}:`, error);
                throw error;
            }
        });
    }
    /**
     * Sync property to accounting database
     */
    syncPropertyToAccounting(property) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Use application schema (with ledgerType)
                const PropertyAccount = (yield Promise.resolve().then(() => __importStar(require('../models/PropertyAccount')))).default;
                // Maintain the base rental ledger account as the canonical metadata carrier
                let propertyAccount = yield PropertyAccount.findOne({ propertyId: property._id, ledgerType: 'rental' });
                if (propertyAccount) {
                    // Update existing account
                    propertyAccount.propertyName = property.name;
                    propertyAccount.propertyAddress = property.address;
                    propertyAccount.ownerId = property.ownerId;
                    propertyAccount.isActive = property.isActive !== false;
                    propertyAccount.lastUpdated = new Date();
                    if (property.ownerId) {
                        const owner = yield User_1.User.findById(property.ownerId);
                        if (owner) {
                            propertyAccount.ownerName = `${owner.firstName} ${owner.lastName}`;
                        }
                    }
                    yield this.db.executeWithRetry(() => __awaiter(this, void 0, void 0, function* () {
                        yield propertyAccount.save();
                    }));
                    logger_1.logger.info(`Updated property account for property ${property._id}`);
                }
                else {
                    // Create new account if it doesn't exist
                    let ownerName = 'Unknown Owner';
                    if (property.ownerId) {
                        const owner = yield User_1.User.findById(property.ownerId);
                        if (owner) {
                            ownerName = `${owner.firstName} ${owner.lastName}`;
                        }
                    }
                    const newAccount = new PropertyAccount({
                        propertyId: property._id,
                        ledgerType: 'rental',
                        propertyName: property.name,
                        propertyAddress: property.address,
                        ownerId: property.ownerId,
                        ownerName,
                        transactions: [],
                        ownerPayouts: [],
                        runningBalance: 0,
                        totalIncome: 0,
                        totalExpenses: 0,
                        totalOwnerPayouts: 0,
                        isActive: property.isActive !== false
                    });
                    yield this.db.executeWithRetry(() => __awaiter(this, void 0, void 0, function* () {
                        yield newAccount.save();
                    }));
                    logger_1.logger.info(`Created property account for property ${property._id}`);
                }
                this.recordSyncSuccess();
            }
            catch (error) {
                logger_1.logger.error(`Failed to sync property ${property._id}:`, error);
                throw error;
            }
        });
    }
    /**
     * Sync user to accounting database
     */
    syncUserToAccounting(user) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Update owner names in property accounts if this user is a property owner
                const PropertyAccount = database_1.accountingConnection.model('PropertyAccount');
                const ownerName = `${user.firstName} ${user.lastName}`;
                const res = yield this.db.executeWithRetry(() => __awaiter(this, void 0, void 0, function* () {
                    return yield PropertyAccount.updateMany({ ownerId: user._id }, { $set: { ownerName, lastUpdated: new Date() } }, { maxTimeMS: 5000 });
                }));
                if ((res === null || res === void 0 ? void 0 : res.modifiedCount) > 0) {
                    logger_1.logger.info(`Updated owner name in ${res.modifiedCount} property accounts for user ${user._id}`);
                }
                this.recordSyncSuccess();
            }
            catch (error) {
                logger_1.logger.error(`Failed to sync user ${user._id}:`, error);
                throw error;
            }
        });
    }
    /**
     * Remove payment from accounting database
     */
    removePaymentFromAccounting(paymentId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const PropertyAccount = database_1.accountingConnection.model('PropertyAccount');
                // Find property account with this payment
                const propertyAccount = yield PropertyAccount.findOne({
                    'transactions.paymentId': paymentId
                });
                if (propertyAccount) {
                    const transaction = propertyAccount.transactions.find((t) => t.paymentId && t.paymentId.toString() === paymentId);
                    if (transaction) {
                        // Remove transaction and update totals
                        propertyAccount.transactions = propertyAccount.transactions.filter((t) => t.paymentId && t.paymentId.toString() !== paymentId);
                        propertyAccount.totalIncome -= transaction.amount;
                        propertyAccount.runningBalance -= transaction.amount;
                        propertyAccount.lastUpdated = new Date();
                        yield this.db.executeWithRetry(() => __awaiter(this, void 0, void 0, function* () {
                            yield propertyAccount.save();
                        }));
                        logger_1.logger.info(`Removed payment ${paymentId} from property account ${propertyAccount.propertyId}`);
                    }
                }
                this.recordSyncSuccess();
            }
            catch (error) {
                logger_1.logger.error(`Failed to remove payment ${paymentId}:`, error);
                throw error;
            }
        });
    }
    /**
     * Remove property from accounting database
     */
    removePropertyFromAccounting(propertyId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const PropertyAccount = database_1.accountingConnection.model('PropertyAccount');
                yield this.db.executeWithRetry(() => __awaiter(this, void 0, void 0, function* () {
                    yield PropertyAccount.findOneAndDelete({ propertyId }, { maxTimeMS: 5000 });
                }));
                logger_1.logger.info(`Removed property account for property ${propertyId}`);
                this.recordSyncSuccess();
            }
            catch (error) {
                logger_1.logger.error(`Failed to remove property ${propertyId}:`, error);
                throw error;
            }
        });
    }
    /**
     * Remove user from accounting database
     */
    removeUserFromAccounting(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const PropertyAccount = database_1.accountingConnection.model('PropertyAccount');
                // Update property accounts to remove owner reference
                yield this.db.executeWithRetry(() => __awaiter(this, void 0, void 0, function* () {
                    yield PropertyAccount.updateMany({ ownerId: userId }, {
                        $unset: { ownerId: 1, ownerName: 1 },
                        $set: { lastUpdated: new Date() }
                    }, { maxTimeMS: 5000 });
                }));
                logger_1.logger.info(`Removed user ${userId} from property accounts`);
                this.recordSyncSuccess();
            }
            catch (error) {
                logger_1.logger.error(`Failed to remove user ${userId}:`, error);
                throw error;
            }
        });
    }
    /**
     * Perform full synchronization of all data
     */
    performFullSync() {
        return __awaiter(this, void 0, void 0, function* () {
            const startTime = Date.now();
            logger_1.logger.info('Starting full database synchronization...');
            try {
                // Reset stats
                this.syncStats = {
                    totalSynced: 0,
                    successCount: 0,
                    errorCount: 0,
                    lastSyncTime: new Date(),
                    syncDuration: 0,
                    errors: []
                };
                // Sync all properties
                yield this.syncAllProperties();
                // Sync all completed payments
                yield this.syncAllPayments();
                // Sync all users
                yield this.syncAllUsers();
                // Calculate duration
                this.syncStats.syncDuration = Date.now() - startTime;
                logger_1.logger.info(`Full sync completed in ${this.syncStats.syncDuration}ms. Success: ${this.syncStats.successCount}, Errors: ${this.syncStats.errorCount}`);
                // Emit full sync completed event
                this.emit('fullSyncCompleted', this.syncStats);
                return this.syncStats;
            }
            catch (error) {
                logger_1.logger.error('Full sync failed:', error);
                this.syncStats.syncDuration = Date.now() - startTime;
                throw error;
            }
        });
    }
    /**
     * Start full synchronization asynchronously and return a job id
     */
    startFullSyncAsync() {
        // Lazy import to avoid top-level dependency cycle
        const { v4: uuidv4 } = require('uuid');
        if (this.fullSyncInProgress && this.currentFullSyncJobId) {
            logger_1.logger.info(`Full sync already in progress (jobId=${this.currentFullSyncJobId})`);
            return { jobId: this.currentFullSyncJobId, startedAt: this.currentFullSyncStartedAt || new Date() };
        }
        this.fullSyncInProgress = true;
        this.lastFullSyncError = null;
        this.currentFullSyncJobId = uuidv4();
        this.currentFullSyncStartedAt = new Date();
        const jobId = this.currentFullSyncJobId;
        const startedAt = this.currentFullSyncStartedAt;
        // Run on next tick without blocking the request cycle
        setImmediate(() => __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.performFullSync();
            }
            catch (e) {
                const message = (e === null || e === void 0 ? void 0 : e.message) ? String(e.message) : String(e);
                this.lastFullSyncError = message;
                logger_1.logger.error(`Full sync job ${jobId} failed:`, e);
            }
            finally {
                this.fullSyncInProgress = false;
                this.lastFullSyncCompletedAt = new Date();
                // keep currentFullSyncJobId until next start so status can show last run
            }
        }));
        return { jobId, startedAt };
    }
    /**
     * Get background full sync job status
     */
    getFullSyncJobStatus() {
        return {
            inProgress: this.fullSyncInProgress,
            jobId: this.currentFullSyncJobId,
            startedAt: this.currentFullSyncStartedAt,
            completedAt: this.lastFullSyncCompletedAt,
            lastError: this.lastFullSyncError
        };
    }
    /**
     * Sync all properties
     */
    syncAllProperties() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const properties = yield Property_1.Property.find({});
                logger_1.logger.info(`Syncing ${properties.length} properties...`);
                for (const property of properties) {
                    try {
                        yield this.syncPropertyToAccounting(property);
                        this.syncStats.totalSynced++;
                    }
                    catch (error) {
                        this.recordSyncError('property', property._id.toString(), error);
                    }
                }
            }
            catch (error) {
                logger_1.logger.error('Failed to sync properties:', error);
                throw error;
            }
        });
    }
    /**
     * Sync all completed payments
     */
    syncAllPayments() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const payments = yield Payment_1.Payment.find({
                    status: 'completed',
                    paymentType: { $in: ['rental', 'sale'] }
                });
                logger_1.logger.info(`Syncing ${payments.length} completed payments...`);
                for (const payment of payments) {
                    try {
                        yield this.syncPaymentToAccounting(payment);
                        // Ensure owner income is posted to property/development ledgers as well (idempotent)
                        try {
                            yield propertyAccountService_1.default.recordIncomeFromPayment(payment._id.toString());
                        }
                        catch (ledgerErr) {
                            // Queue for retry if immediate posting fails
                            try {
                                yield ledgerEventService_1.default.enqueueOwnerIncomeEvent(payment._id.toString());
                            }
                            catch (_a) { }
                            logger_1.logger.warn('Property ledger posting failed during full sync; enqueued for retry:', (ledgerErr === null || ledgerErr === void 0 ? void 0 : ledgerErr.message) || ledgerErr);
                        }
                        // Best-effort verification and reconciliation for this payment
                        try {
                            yield this.verifyAndReconcilePaymentPosting(payment._id.toString());
                        }
                        catch (verifyErr) {
                            logger_1.logger.warn('Verification failed during full sync (non-fatal):', (verifyErr === null || verifyErr === void 0 ? void 0 : verifyErr.message) || verifyErr);
                        }
                        this.syncStats.totalSynced++;
                    }
                    catch (error) {
                        this.recordSyncError('payment', payment._id.toString(), error);
                    }
                }
            }
            catch (error) {
                logger_1.logger.error('Failed to sync payments:', error);
                throw error;
            }
        });
    }
    /**
     * Sync all users
     */
    syncAllUsers() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const users = yield User_1.User.find({});
                logger_1.logger.info(`Syncing ${users.length} users...`);
                for (const user of users) {
                    try {
                        yield this.syncUserToAccounting(user);
                        this.syncStats.totalSynced++;
                    }
                    catch (error) {
                        this.recordSyncError('user', user._id.toString(), error);
                    }
                }
            }
            catch (error) {
                logger_1.logger.error('Failed to sync users:', error);
                throw error;
            }
        });
    }
    /**
     * Record successful sync
     */
    recordSyncSuccess() {
        this.syncStats.successCount++;
    }
    /**
     * Record sync error
     */
    recordSyncError(type, documentId, error) {
        const err = error;
        const errorMessage = (err === null || err === void 0 ? void 0 : err.message) ? String(err.message) : String(error);
        this.syncStats.errorCount++;
        this.syncStats.errors.push({
            documentId,
            error: errorMessage,
            timestamp: new Date()
        });
        // Persist failure for reprocessing
        try {
            const retriable = this.db.shouldRetry(err);
            const labels = Array.isArray(err === null || err === void 0 ? void 0 : err.errorLabels) ? err.errorLabels : [];
            const backoffMs = retriable ? 5 * 60 * 1000 : undefined; // 5 minutes initial backoff
            SyncFailure_1.default.updateOne({ type, documentId }, Object.assign({ $set: {
                    type,
                    documentId,
                    errorName: err === null || err === void 0 ? void 0 : err.name,
                    errorCode: err === null || err === void 0 ? void 0 : err.code,
                    errorMessage: errorMessage,
                    errorLabels: labels,
                    retriable,
                    status: 'pending',
                    lastErrorAt: new Date(),
                    payload: undefined
                }, $setOnInsert: {
                    attemptCount: 0
                } }, (retriable ? { $set: { nextAttemptAt: new Date(Date.now() + backoffMs) } } : {})), { upsert: true }).catch(() => { });
        }
        catch (persistErr) {
            logger_1.logger.warn('Failed to persist sync failure record:', persistErr);
        }
        // Emit error event
        this.emit('syncError', {
            type,
            documentId,
            error: errorMessage,
            errorName: error === null || error === void 0 ? void 0 : error.name,
            errorCode: error === null || error === void 0 ? void 0 : error.code,
            retriable: this.db.shouldRetry(error),
            timestamp: new Date()
        });
    }
    clearFailureRecord(type, documentId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield SyncFailure_1.default.deleteOne({ type, documentId });
                this.emit('syncFailureCleared', { type, documentId, timestamp: new Date() });
            }
            catch (e) {
                logger_1.logger.warn('Failed to clear failure record:', e);
            }
        });
    }
    /**
     * Retry a failed sync for a specific document
     */
    retrySyncFor(type, documentId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                switch (type) {
                    case 'payment': {
                        const payment = yield Payment_1.Payment.findById(documentId);
                        if (payment) {
                            yield this.syncPaymentToAccounting(payment);
                            yield this.clearFailureRecord('payment', documentId);
                        }
                        break;
                    }
                    case 'property': {
                        const property = yield Property_1.Property.findById(documentId);
                        if (property) {
                            yield this.syncPropertyToAccounting(property);
                            yield this.clearFailureRecord('property', documentId);
                        }
                        break;
                    }
                    case 'user': {
                        const user = yield User_1.User.findById(documentId);
                        if (user) {
                            yield this.syncUserToAccounting(user);
                            yield this.clearFailureRecord('user', documentId);
                        }
                        break;
                    }
                    default:
                        logger_1.logger.warn(`No retry handler for type: ${type}`);
                }
            }
            catch (error) {
                throw error;
            }
        });
    }
    /**
     * List stored sync failures (for dashboard)
     */
    listFailures(params) {
        return __awaiter(this, void 0, void 0, function* () {
            const { status, limit = 100 } = params || {};
            const query = {};
            if (status)
                query.status = status;
            return SyncFailure_1.default.find(query).sort({ lastErrorAt: -1 }).limit(limit).lean();
        });
    }
    retryFailureById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const fail = yield SyncFailure_1.default.findById(id);
            if (!fail)
                return;
            yield this.retrySyncFor(fail.type, fail.documentId);
            yield SyncFailure_1.default.updateOne({ _id: fail._id }, { $set: { status: 'resolved' } });
        });
    }
    /**
     * Get current sync statistics
     */
    getSyncStats() {
        try {
            return Object.assign({}, this.syncStats);
        }
        catch (error) {
            logger_1.logger.error('Error getting sync stats:', error);
            return {
                totalSynced: 0,
                successCount: 0,
                errorCount: 0,
                lastSyncTime: new Date(),
                syncDuration: 0,
                errors: []
            };
        }
    }
    /**
     * Get sync status
     */
    getSyncStatus() {
        try {
            return {
                isRunning: this.isRunning,
                lastSyncTime: this.syncStats.lastSyncTime,
                totalSynced: this.syncStats.totalSynced
            };
        }
        catch (error) {
            logger_1.logger.error('Error getting sync status:', error);
            return {
                isRunning: false,
                lastSyncTime: new Date(),
                totalSynced: 0
            };
        }
    }
    /**
     * Validate data consistency between databases
     */
    validateDataConsistency() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const inconsistencies = [];
                // Check if database connections are available
                if (!database_1.accountingConnection || !database_1.mainConnection) {
                    logger_1.logger.warn('Database connections not available for consistency check');
                    return {
                        isConsistent: false,
                        inconsistencies: [{
                                type: 'connection_error',
                                description: 'Database connections not available',
                                count: 1
                            }]
                    };
                }
                try {
                    // Check property accounts consistency
                    const PropertyAccount = database_1.accountingConnection.model('PropertyAccount');
                    const propertyAccounts = yield PropertyAccount.find({});
                    for (const account of propertyAccounts) {
                        try {
                            // Check if property still exists
                            const property = yield Property_1.Property.findById(account.propertyId);
                            if (!property) {
                                inconsistencies.push({
                                    type: 'orphaned_property_account',
                                    description: `Property account exists but property ${account.propertyId} not found`,
                                    count: 1
                                });
                            }
                            // Check if owner still exists
                            if (account.ownerId) {
                                const owner = yield User_1.User.findById(account.ownerId);
                                if (!owner) {
                                    inconsistencies.push({
                                        type: 'orphaned_owner_reference',
                                        description: `Property account references non-existent owner ${account.ownerId}`,
                                        count: 1
                                    });
                                }
                            }
                        }
                        catch (accountError) {
                            logger_1.logger.warn(`Error checking account ${account._id}:`, accountError);
                            inconsistencies.push({
                                type: 'account_check_error',
                                description: `Error checking account ${account._id}`,
                                count: 1
                            });
                        }
                    }
                    // Check for missing property accounts
                    const properties = yield Property_1.Property.find({});
                    for (const property of properties) {
                        try {
                            const account = yield PropertyAccount.findOne({ propertyId: property._id });
                            if (!account) {
                                inconsistencies.push({
                                    type: 'missing_property_account',
                                    description: `Property ${property._id} exists but no accounting record found`,
                                    count: 1
                                });
                            }
                        }
                        catch (propertyError) {
                            logger_1.logger.warn(`Error checking property ${property._id}:`, propertyError);
                        }
                    }
                    // Cross-check payments vs ledgers (lookback window to bound workload)
                    const lookbackDays = Number(process.env.SYNC_VALIDATION_LOOKBACK_DAYS || 30);
                    const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
                    const payments = yield Payment_1.Payment.find({
                        status: 'completed',
                        paymentType: { $in: ['rental', 'sale'] },
                        $or: [
                            { paymentDate: { $gte: since } },
                            { updatedAt: { $gte: since } }
                        ]
                    }).select('_id companyId propertyId paymentType commissionDetails').lean();
                    // Helper to safely import CompanyAccount on demand
                    const getCompanyAccountModel = () => __awaiter(this, void 0, void 0, function* () {
                        const mod = yield Promise.resolve().then(() => __importStar(require('../models/CompanyAccount')));
                        return mod.CompanyAccount;
                    });
                    for (const p of payments) {
                        // Property/development ledger presence
                        const propHasPosting = yield PropertyAccount.findOne({
                            'transactions.paymentId': p._id
                        }).select('_id').lean();
                        if (!propHasPosting) {
                            inconsistencies.push({
                                type: 'missing_property_ledger_income',
                                description: `Payment ${String(p._id)} not posted to any property/development ledger`,
                                count: 1
                            });
                        }
                        // Company commission presence (only when agencyShare > 0 and companyId present)
                        const agencyShare = Number(((_a = p === null || p === void 0 ? void 0 : p.commissionDetails) === null || _a === void 0 ? void 0 : _a.agencyShare) || 0);
                        if (agencyShare > 0 && (p === null || p === void 0 ? void 0 : p.companyId)) {
                            const CompanyAccount = yield getCompanyAccountModel();
                            const companyHasPosting = yield CompanyAccount.findOne({
                                companyId: p.companyId,
                                'transactions.paymentId': p._id
                            }).select('_id').lean();
                            if (!companyHasPosting) {
                                inconsistencies.push({
                                    type: 'missing_company_commission',
                                    description: `Payment ${String(p._id)} commission not posted to company account`,
                                    count: 1
                                });
                            }
                        }
                    }
                    // Detect duplicate postings in recent ledgers (property)
                    const recentAccounts = yield PropertyAccount.find({ lastUpdated: { $gte: since } })
                        .select('_id propertyId ledgerType transactions').lean();
                    for (const acc of recentAccounts) {
                        const counts = Object.create(null);
                        for (const t of acc.transactions || []) {
                            const pid = (t === null || t === void 0 ? void 0 : t.paymentId) ? String(t.paymentId) : '';
                            if (!pid)
                                continue;
                            const key = `${t.type}:${pid}`;
                            counts[key] = (counts[key] || 0) + 1;
                        }
                        const dupKeys = Object.keys(counts).filter(k => counts[k] > 1);
                        if (dupKeys.length > 0) {
                            inconsistencies.push({
                                type: 'duplicate_property_ledger_posting',
                                description: `Duplicate postings detected on property ledger ${String(acc._id)} for ${dupKeys.length} payment(s)`,
                                count: dupKeys.length
                            });
                        }
                    }
                    // Detect duplicate postings in recent company accounts
                    try {
                        const CompanyAccount = yield getCompanyAccountModel();
                        const companyAccounts = yield CompanyAccount.find({ lastUpdated: { $gte: since } })
                            .select('_id companyId transactions').lean();
                        for (const ca of companyAccounts) {
                            const counts = Object.create(null);
                            for (const t of (ca.transactions || [])) {
                                const pid = (t === null || t === void 0 ? void 0 : t.paymentId) ? String(t.paymentId) : '';
                                if (!pid)
                                    continue;
                                counts[pid] = (counts[pid] || 0) + 1;
                            }
                            const dup = Object.keys(counts).filter(k => counts[k] > 1);
                            if (dup.length > 0) {
                                inconsistencies.push({
                                    type: 'duplicate_company_commission',
                                    description: `Duplicate company commission postings detected on account ${String(ca._id)} for ${dup.length} payment(s)`,
                                    count: dup.length
                                });
                            }
                        }
                    }
                    catch (dupErr) {
                        logger_1.logger.warn('CompanyAccount duplicate detection skipped:', dupErr);
                    }
                }
                catch (dbError) {
                    logger_1.logger.error('Database error during consistency check:', dbError);
                    inconsistencies.push({
                        type: 'database_error',
                        description: 'Database error during consistency check',
                        count: 1
                    });
                }
                return {
                    isConsistent: inconsistencies.length === 0,
                    inconsistencies
                };
            }
            catch (error) {
                logger_1.logger.error('Failed to validate data consistency:', error);
                return {
                    isConsistent: false,
                    inconsistencies: [{
                            type: 'validation_error',
                            description: 'Failed to validate data consistency',
                            count: 1
                        }]
                };
            }
        });
    }
    /**
     * Verify that a specific payment has been posted to relevant ledgers and reconcile issues:
     * - Ensures property/development ledger income exists (idempotent)
     * - Ensures company commission is recorded when applicable (idempotent)
     * - Dedupe duplicate postings in ledgers (best-effort)
     */
    verifyAndReconcilePaymentPosting(paymentId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const payment = yield Payment_1.Payment.findById(paymentId).lean();
                if (!payment || payment.status !== 'completed')
                    return;
                // Property/development ledgers: idempotent record and dedupe if needed
                try {
                    yield propertyAccountService_1.default.recordIncomeFromPayment(paymentId);
                }
                catch (e) {
                    // Enqueue for retry if immediate fails
                    try {
                        yield ledgerEventService_1.default.enqueueOwnerIncomeEvent(paymentId);
                    }
                    catch (_b) { }
                    logger_1.logger.warn('verifyAndReconcile: property ledger post failed; enqueued for retry:', (e === null || e === void 0 ? void 0 : e.message) || e);
                }
                // Dedupe any property ledgers that contain this payment more than once
                try {
                    const PropertyAccount = database_1.accountingConnection.model('PropertyAccount');
                    const accountsWithPayment = yield PropertyAccount.find({ 'transactions.paymentId': payment._id })
                        .select('_id propertyId ledgerType transactions').lean();
                    for (const acc of accountsWithPayment) {
                        // Count occurrences of this paymentId
                        const occurrences = (acc.transactions || []).filter((t) => String((t === null || t === void 0 ? void 0 : t.paymentId) || '') === String(payment._id)).length;
                        if (occurrences > 1) {
                            try {
                                yield (0, propertyAccountService_1.reconcilePropertyLedgerDuplicates)(String(acc.propertyId), acc.ledgerType);
                                logger_1.logger.info(`verifyAndReconcile: deduped property ledger for property ${String(acc.propertyId)} (${acc.ledgerType})`);
                            }
                            catch (dedupeErr) {
                                logger_1.logger.warn('verifyAndReconcile: failed to dedupe property ledger:', (dedupeErr === null || dedupeErr === void 0 ? void 0 : dedupeErr.message) || dedupeErr);
                            }
                        }
                    }
                }
                catch (scanErr) {
                    logger_1.logger.warn('verifyAndReconcile: scan for property ledger duplicates failed:', (scanErr === null || scanErr === void 0 ? void 0 : scanErr.message) || scanErr);
                }
                // Company commission ledger: ensure commission posted (idempotent) and dedupe
                const agencyShare = Number(((_a = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.agencyShare) || 0);
                if (agencyShare > 0 && (payment === null || payment === void 0 ? void 0 : payment.companyId)) {
                    try {
                        // Reuse the same logic as syncPaymentToAccounting by constructing tx and pushing if missing
                        const { CompanyAccount } = yield Promise.resolve().then(() => __importStar(require('../models/CompanyAccount')));
                        const companyId = payment.companyId;
                        const desiredSource = payment.paymentType === 'sale' ? 'sales_commission' : 'rental_commission';
                        const txDoc = {
                            type: 'income',
                            source: desiredSource,
                            amount: agencyShare,
                            date: payment.paymentDate || new Date(),
                            currency: payment.currency || 'USD',
                            paymentMethod: payment.paymentMethod,
                            paymentId: payment._id,
                            referenceNumber: payment.referenceNumber,
                            description: desiredSource === 'sales_commission' ? 'Sales commission income' : 'Rental commission income',
                            processedBy: payment.processedBy,
                            notes: payment.notes
                        };
                        // Ensure account exists and append only if not already present
                        yield CompanyAccount.updateOne({ companyId }, { $setOnInsert: { companyId, runningBalance: 0, totalIncome: 0, totalExpenses: 0, lastUpdated: new Date() } }, { upsert: true });
                        yield CompanyAccount.updateOne({ companyId, transactions: { $not: { $elemMatch: { paymentId: payment._id } } } }, {
                            $push: { transactions: txDoc },
                            $inc: { totalIncome: agencyShare, runningBalance: agencyShare },
                            $set: { lastUpdated: new Date() }
                        });
                    }
                    catch (postErr) {
                        logger_1.logger.warn('verifyAndReconcile: failed ensuring company commission posting:', (postErr === null || postErr === void 0 ? void 0 : postErr.message) || postErr);
                    }
                    // Dedupe duplicate postings in company ledger (keep earliest)
                    try {
                        const { CompanyAccount } = yield Promise.resolve().then(() => __importStar(require('../models/CompanyAccount')));
                        const ca = yield CompanyAccount.findOne({ companyId: payment.companyId }).lean();
                        if (ca && Array.isArray(ca.transactions)) {
                            const dupIds = [];
                            const seen = new Set();
                            const grouped = Object.create(null);
                            for (const t of ca.transactions) {
                                const pid = (t === null || t === void 0 ? void 0 : t.paymentId) ? String(t.paymentId) : '';
                                if (!pid)
                                    continue;
                                if (!grouped[pid])
                                    grouped[pid] = [];
                                grouped[pid].push({ _id: t._id, date: new Date(t.date) });
                            }
                            for (const pid of Object.keys(grouped)) {
                                const list = grouped[pid];
                                if (list.length <= 1)
                                    continue;
                                const sorted = list.slice().sort((a, b) => a.date.getTime() - b.date.getTime());
                                // remove all but the first
                                dupIds.push(...sorted.slice(1).map(i => i._id).filter(Boolean));
                            }
                            if (dupIds.length > 0) {
                                yield (yield Promise.resolve().then(() => __importStar(require('../models/CompanyAccount')))).CompanyAccount.updateOne({ companyId: payment.companyId }, { $pull: { transactions: { _id: { $in: dupIds } } }, $set: { lastUpdated: new Date() } });
                                // Recalculate totals quickly
                                const fresh = yield (yield Promise.resolve().then(() => __importStar(require('../models/CompanyAccount')))).CompanyAccount.findOne({ companyId: payment.companyId });
                                if (fresh) {
                                    const list = fresh.transactions || [];
                                    const income = list.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount || 0), 0);
                                    const expenses = list.filter((t) => t.type !== 'income').reduce((s, t) => s + Number(t.amount || 0), 0);
                                    yield (yield Promise.resolve().then(() => __importStar(require('../models/CompanyAccount')))).CompanyAccount.updateOne({ _id: fresh._id }, { $set: { totalIncome: income, totalExpenses: expenses, runningBalance: income - expenses, lastUpdated: new Date() } });
                                }
                            }
                        }
                    }
                    catch (dedupeErr) {
                        logger_1.logger.warn('verifyAndReconcile: failed to dedupe company ledger:', (dedupeErr === null || dedupeErr === void 0 ? void 0 : dedupeErr.message) || dedupeErr);
                    }
                }
            }
            catch (outer) {
                // Non-fatal
                logger_1.logger.warn('verifyAndReconcilePaymentPosting encountered an error:', (outer === null || outer === void 0 ? void 0 : outer.message) || outer);
            }
        });
    }
}
exports.DatabaseSyncService = DatabaseSyncService;
exports.default = DatabaseSyncService;
