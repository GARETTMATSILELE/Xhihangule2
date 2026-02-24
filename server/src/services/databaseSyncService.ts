import { mainConnection, accountingConnection } from '../config/database';
import { Payment } from '../models/Payment';
import { Property } from '../models/Property';
import { Development } from '../models/Development';
import { DevelopmentUnit } from '../models/DevelopmentUnit';
import { User } from '../models/User';
import { PropertyOwner } from '../models/PropertyOwner';
import { IPropertyAccount } from '../models/PropertyAccount';
import { logger } from '../utils/logger';
import { DatabaseService } from './databaseService';
import SyncFailure from '../models/SyncFailure';
import { EventEmitter } from 'events';
import propertyAccountService, { reconcilePropertyLedgerDuplicates } from './propertyAccountService';
import ledgerEventService from './ledgerEventService';
import agentAccountService from './agentAccountService';
import accountingIntegrationService from './accountingIntegrationService';

export interface SyncEvent {
  type: 'payment' | 'property' | 'user' | 'lease' | 'maintenance';
  action: 'create' | 'update' | 'delete';
  documentId: string;
  collection: string;
  timestamp: Date;
  data?: any;
}

export interface SyncStats {
  totalSynced: number;
  successCount: number;
  errorCount: number;
  lastSyncTime: Date;
  syncDuration: number;
  errors: Array<{ documentId: string; error: string; timestamp: Date }>;
}

export class DatabaseSyncService extends EventEmitter {
  private static instance: DatabaseSyncService;
  private isRunning: boolean = false;
  private changeStreams: Map<string, any> = new Map();
  // Track async full sync job state
  private fullSyncInProgress: boolean = false;
  private currentFullSyncJobId: string | null = null;
  private currentFullSyncStartedAt: Date | null = null;
  private lastFullSyncCompletedAt: Date | null = null;
  private lastFullSyncError: string | null = null;
  private syncStats: SyncStats = {
    totalSynced: 0,
    successCount: 0,
    errorCount: 0,
    lastSyncTime: new Date(),
    syncDuration: 0,
    errors: []
  };
  private db: DatabaseService = DatabaseService.getInstance();

  private constructor() {
    super();
  }

  public static getInstance(): DatabaseSyncService {
    if (!DatabaseSyncService.instance) {
      DatabaseSyncService.instance = new DatabaseSyncService();
    }
    return DatabaseSyncService.instance;
  }

  /**
   * Start real-time synchronization using MongoDB Change Streams
   */
  public async startRealTimeSync(): Promise<void> {
    if (this.isRunning) {
      logger.info('Real-time sync is already running');
      return;
    }

    try {
      logger.info('Starting real-time database synchronization...');
      
      // Check if database connections are available
      if (!mainConnection || !accountingConnection) {
        throw new Error('Database connections not available');
      }
      
      // Try to set up change streams for critical collections
      try {
        await this.setupChangeStreams();
        this.isRunning = true;
        logger.info('Real-time sync started successfully with change streams');
      } catch (changeStreamError) {
        logger.warn('Change streams setup failed, attempting polling fallback:', changeStreamError);
        
        // Check if this is a change stream compatibility issue
        if (changeStreamError instanceof Error && 
            (changeStreamError.message.includes('replica sets') || 
             changeStreamError.message.includes('$changeStream') ||
             changeStreamError.message.includes('Change streams require replica set'))) {
          
          logger.warn('Change streams not supported on standalone MongoDB. Real-time sync will use polling instead.');
          
          try {
            // Fall back to polling-based sync
            await this.startPollingSync();
            this.isRunning = true;
            logger.info('Real-time sync started successfully with polling fallback');
          } catch (pollingError) {
            logger.error('Polling fallback also failed:', pollingError);
            throw new Error(`Failed to start real-time sync: ${pollingError instanceof Error ? pollingError.message : String(pollingError)}`);
          }
        } else {
          // This is not a change stream compatibility issue, re-throw
          throw changeStreamError;
        }
      }
      
      // Emit sync started event
      this.emit('syncStarted', { timestamp: new Date() });
      
      // Start background ledger event processing loop (common for both modes)
      try {
        const processInterval = setInterval(async () => {
          try {
            await ledgerEventService.processPending(50);
          } catch (procErr) {
            logger.warn('Ledger events processing tick failed:', procErr);
          }
        }, 15000);
        this.changeStreams.set('ledger_events_processing', { close: () => clearInterval(processInterval) } as any);
        logger.info('Started ledger events processing loop');
      } catch (e) {
        logger.warn('Failed to start ledger events processing loop:', e);
      }
      
    } catch (error) {
      logger.error('Failed to start real-time sync:', error);
      throw error;
    }
  }

  /**
   * Stop real-time synchronization
   */
  public async stopRealTimeSync(): Promise<void> {
    if (!this.isRunning) {
      logger.info('Real-time sync is not running');
      return;
    }

    try {
      logger.info('Stopping real-time database synchronization...');
      
      // Close all change streams
      for (const [collection, stream] of this.changeStreams) {
        await stream.close();
        logger.info(`Closed change stream for ${collection}`);
      }
      
      this.changeStreams.clear();
      this.isRunning = false;
      
      logger.info('Real-time sync stopped successfully');
      
      // Emit sync stopped event
      this.emit('syncStopped', { timestamp: new Date() });
      
    } catch (error) {
      logger.error('Failed to stop real-time sync:', error);
      throw error;
    }
  }

  /**
   * Set up change streams for critical collections
   */
  private async setupChangeStreams(): Promise<void> {
    try {
      // Check if database connections are available
      if (!mainConnection || !accountingConnection) {
        throw new Error('Database connections not available');
      }

      // Check if models are available
      if (!Payment || !Property || !User) {
        throw new Error('Required models not available');
      }

      // Check if change streams are supported (replica set required)
      try {
        // Try to get server info to check if it's a replica set
        const serverInfo = await mainConnection.db.admin().serverInfo();
        if (!serverInfo.setName) {
          logger.warn('Standalone MongoDB detected - change streams not supported');
          throw new Error('Change streams require replica set configuration');
        }
        logger.info(`Replica set detected: ${serverInfo.setName}`);
      } catch (error) {
        logger.warn('Could not determine MongoDB configuration - assuming standalone');
        throw new Error('Change streams require replica set configuration');
      }

      // Payment changes
      const paymentStream = Payment.watch([], { fullDocument: 'updateLookup' });
      paymentStream.on('change', async (change) => {
        await this.handlePaymentChange(change);
      });
      paymentStream.on('error', (error) => {
        logger.error('Payment change stream error:', error);
        if (error.message.includes('replica sets') || error.message.includes('$changeStream')) {
          throw new Error('Change streams require replica set configuration');
        }
      });
      this.changeStreams.set('payments', paymentStream);

      // Property changes
      const propertyStream = Property.watch([], { fullDocument: 'updateLookup' });
      propertyStream.on('change', async (change) => {
        await this.handlePropertyChange(change);
      });
      propertyStream.on('error', (error) => {
        logger.error('Property change stream error:', error);
        if (error.message.includes('replica sets') || error.message.includes('$changeStream')) {
          throw new Error('Change streams require replica set configuration');
        }
      });
      this.changeStreams.set('properties', propertyStream);

      // User changes
      const userStream = User.watch([], { fullDocument: 'updateLookup' });
      userStream.on('change', async (change) => {
        await this.handleUserChange(change);
      });
      userStream.on('error', (error) => {
        logger.error('User change stream error:', error);
        if (error.message.includes('replica sets') || error.message.includes('$changeStream')) {
          throw new Error('Change streams require replica set configuration');
        }
      });
      this.changeStreams.set('users', userStream);

      logger.info('Change streams set up successfully');
      
    } catch (error) {
      logger.error('Failed to set up change streams:', error);
      throw error;
    }
  }

  /**
   * Start polling-based synchronization as fallback for standalone MongoDB
   */
  private async startPollingSync(): Promise<void> {
    try {
      logger.info('Starting polling-based synchronization...');
      
      // Set up polling intervals for different collections
      const pollingIntervals = {
        payments: 30000,    // 30 seconds
        properties: 60000,  // 1 minute
        users: 120000       // 2 minutes
      };

      // Start polling for payments
      const paymentPolling = setInterval(async () => {
        try {
          await this.pollPaymentChanges();
        } catch (error) {
          logger.error('Error polling payment changes:', error);
        }
      }, pollingIntervals.payments);

      // Start polling for properties
      const propertyPolling = setInterval(async () => {
        try {
          await this.pollPropertyChanges();
        } catch (error) {
          logger.error('Error polling property changes:', error);
        }
      }, pollingIntervals.properties);

      // Start polling for users
      const userPolling = setInterval(async () => {
        try {
          await this.pollUserChanges();
        } catch (error) {
          logger.error('Error polling user changes:', error);
        }
      }, pollingIntervals.users);

      // Store polling intervals for cleanup
      this.changeStreams.set('payments_polling', { close: () => clearInterval(paymentPolling) } as any);
      this.changeStreams.set('properties_polling', { close: () => clearInterval(propertyPolling) } as any);
      this.changeStreams.set('users_polling', { close: () => clearInterval(userPolling) } as any);

      // Also start background ledger event processing in polling mode
      const ledgerEventsPolling = setInterval(async () => {
        try {
          await ledgerEventService.processPending(50);
        } catch (e) {
          logger.warn('Error polling ledger events:', e);
        }
      }, 15000);
      this.changeStreams.set('ledger_events_polling', { close: () => clearInterval(ledgerEventsPolling) } as any);

      logger.info('Polling-based synchronization started successfully');
      
    } catch (error) {
      logger.error('Failed to start polling sync:', error);
      throw error;
    }
  }

  /**
   * Poll for payment changes
   */
  private async pollPaymentChanges(): Promise<void> {
    try {
      // Get recent payments that might need syncing
      const recentPayments = await Payment.find({
        updatedAt: { $gte: new Date(Date.now() - 60000) }, // Last minute
        status: 'completed',
        paymentType: { $in: ['rental', 'sale'] },
        isProvisional: { $ne: true },
        isInSuspense: { $ne: true }
      }).limit(100);

      for (const payment of recentPayments) {
        if (
          payment.status === 'completed' &&
          (payment.paymentType === 'rental' || payment.paymentType === 'sale') &&
          !(payment as any).reversalOfPaymentId &&
          Number((payment as any).amount || 0) >= 0
        ) {
          try {
            await this.syncPaymentToAccounting(payment);
          } catch (e) {
            // syncPaymentToAccounting already records failure; continue
          }
        }
      }
    } catch (error) {
      logger.error('Error polling payment changes:', error);
    }
  }

  /**
   * Poll for property changes
   */
  private async pollPropertyChanges(): Promise<void> {
    try {
      // Get recent properties that might need syncing
      const recentProperties = await Property.find({
        updatedAt: { $gte: new Date(Date.now() - 120000) } // Last 2 minutes
      }).limit(100);

      for (const property of recentProperties) {
        await this.syncPropertyToAccounting(property);
      }
    } catch (error) {
      logger.error('Error polling property changes:', error);
    }
  }

  /**
   * Poll for user changes
   */
  private async pollUserChanges(): Promise<void> {
    try {
      // Get recent users that might need syncing
      const recentUsers = await User.find({
        updatedAt: { $gte: new Date(Date.now() - 240000) } // Last 4 minutes
      }).limit(100);

      for (const user of recentUsers) {
        await this.syncUserToAccounting(user);
      }
    } catch (error) {
      logger.error('Error polling user changes:', error);
    }
  }

  /**
   * Handle payment changes
   */
  private async handlePaymentChange(change: any): Promise<void> {
    const { operationType, documentKey, fullDocument } = change;
    const documentId = documentKey._id.toString();
    
    try {
      if (operationType === 'insert' || operationType === 'update') {
        if (
          fullDocument &&
          fullDocument.status === 'completed' &&
          (fullDocument.paymentType === 'rental' || fullDocument.paymentType === 'sale') &&
          fullDocument.isInSuspense !== true &&
          fullDocument.isProvisional !== true &&
          !fullDocument.reversalOfPaymentId &&
          Number(fullDocument.amount || 0) >= 0
        ) {
          try {
            await this.syncPaymentToAccounting(fullDocument);
            // Reflect to property ledger as well (idempotent)
            try {
              await propertyAccountService.recordIncomeFromPayment(documentId);
            } catch (ledgerErr) {
              // Enqueue for retry via ledger event service if immediate posting fails
              try { await ledgerEventService.enqueueOwnerIncomeEvent(documentId); } catch {}
              logger.warn('Ledger post failed on change stream; enqueued for retry:', (ledgerErr as any)?.message || ledgerErr);
            }
            // After attempting postings, verify and reconcile postings across ledgers in near-real-time
            try {
              await this.verifyAndReconcilePaymentPosting(documentId);
            } catch (verifyErr) {
              logger.warn('Post-sync verification failed (non-fatal):', (verifyErr as any)?.message || verifyErr);
            }
            await this.clearFailureRecord('payment', documentId);
          } catch (e) {
            // error recorded in syncPaymentToAccounting
          }
        } else if (fullDocument && (fullDocument.status === 'reversed' || String(fullDocument.postingStatus || '') === 'reversed')) {
          try {
            await accountingIntegrationService.syncPaymentReversed(fullDocument as any, { reason: String(fullDocument?.reversalReason || '') });
          } catch (e) {
            logger.warn('Payment reversal accounting sync failed in databaseSync:', (e as any)?.message || e);
          }
          try {
            await propertyAccountService.reverseIncomeFromPayment(documentId, { reason: String(fullDocument?.reversalReason || '') });
          } catch (e) {
            logger.warn('Property ledger reversal sync failed in databaseSync:', (e as any)?.message || e);
          }
          try {
            await agentAccountService.reverseCommissionForPayment(documentId, String(fullDocument?.reversalReason || ''));
          } catch (e) {
            logger.warn('Agent commission reversal sync failed in databaseSync:', (e as any)?.message || e);
          }
        }
      } else if (operationType === 'delete') {
        await this.removePaymentFromAccounting(documentId);
        await this.clearFailureRecord('payment', documentId);
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

    } catch (error) {
      logger.error('Error handling payment change:', error);
      this.recordSyncError('payment', documentId, error);
    }
  }

  /**
   * Handle property changes
   */
  private async handlePropertyChange(change: any): Promise<void> {
    const { operationType, documentKey, fullDocument } = change;
    const documentId = documentKey._id.toString();
    
    try {
      if (operationType === 'insert' || operationType === 'update') {
        await this.syncPropertyToAccounting(fullDocument);
        await this.clearFailureRecord('property', documentId);
      } else if (operationType === 'delete') {
        await this.removePropertyFromAccounting(documentId);
        await this.clearFailureRecord('property', documentId);
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

    } catch (error) {
      logger.error('Error handling property change:', error);
      this.recordSyncError('property', documentId, error);
    }
  }

  /**
   * Handle user changes
   */
  private async handleUserChange(change: any): Promise<void> {
    const { operationType, documentKey, fullDocument } = change;
    const documentId = documentKey._id.toString();
    
    try {
      if (operationType === 'insert' || operationType === 'update') {
        await this.syncUserToAccounting(fullDocument);
        await this.clearFailureRecord('user', documentId);
      } else if (operationType === 'delete') {
        await this.removeUserFromAccounting(documentId);
        await this.clearFailureRecord('user', documentId);
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

    } catch (error) {
      logger.error('Error handling user change:', error);
      this.recordSyncError('user', documentId, error);
    }
  }

  /**
   * Sync payment to accounting database
   */
  private async syncPaymentToAccounting(payment: any): Promise<void> {
    try {
      // Record agency commission into company account as revenue (idempotent, race-safe)
      const { CompanyAccount } = await import('../models/CompanyAccount');
      if (payment.companyId && payment.commissionDetails?.agencyShare) {
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
          await this.db.executeWithRetry(async () => {
          // 1) Ensure base account exists (idempotent)
          await CompanyAccount.updateOne(
            { companyId },
            { $setOnInsert: { companyId, runningBalance: 0, totalIncome: 0, totalExpenses: 0, lastUpdated: new Date() } },
            { upsert: true }
          );
          // 2) Append commission transaction only if not already present; do NOT upsert here to avoid duplicate docs
          const res = await CompanyAccount.updateOne(
            { companyId, transactions: { $not: { $elemMatch: { paymentId: payment._id, isArchived: { $ne: true } } } } },
            {
              $push: { transactions: txDoc },
              $inc: { totalIncome: agencyShare, runningBalance: agencyShare },
              $set: { lastUpdated: new Date() }
            }
          );
          // If already present (matchedCount === 0), treat as success (idempotent)
          });
          logger.info(`Recorded company revenue ${agencyShare} for company ${companyId} from payment ${payment._id}`);
      }
      this.recordSyncSuccess();

    } catch (error) {
      logger.error(`Failed to sync payment ${payment._id}:`, error);
      throw error;
    }
  }

  /**
   * Sync property to accounting database
   */
  private async syncPropertyToAccounting(property: any): Promise<void> {
    try {
      // Always go through the service's idempotent entrypoint
      const account = await propertyAccountService.getOrCreatePropertyAccount(property._id.toString(), 'rental');
      // Update metadata on the canonical rental ledger
      const updates: any = {
        propertyName: property.name,
        propertyAddress: property.address,
        ownerId: property.ownerId,
        isActive: property.isActive !== false,
        lastUpdated: new Date()
      };
      if (property.ownerId) {
        const owner = await User.findById(property.ownerId);
        if (owner) {
          updates.ownerName = `${owner.firstName} ${owner.lastName}`;
        }
      }
      await this.db.executeWithRetry(async () => {
        await (await import('../models/PropertyAccount')).default.updateOne(
          { _id: (account as any)._id },
          { $set: updates }
        );
      });
      logger.info(`Ensured/updated property account for property ${property._id}`);
      
      this.recordSyncSuccess();

    } catch (error) {
      logger.error(`Failed to sync property ${property._id}:`, error);
      throw error;
    }
  }

  /**
   * Sync user to accounting database
   */
  private async syncUserToAccounting(user: any): Promise<void> {
    try {
      // Update owner names in property accounts if this user is a property owner
      const PropertyAccount = accountingConnection.model('PropertyAccount');
      const ownerName = `${user.firstName} ${user.lastName}`;
      const res = await this.db.executeWithRetry(async () => {
        return await PropertyAccount.updateMany(
          { ownerId: user._id },
          { $set: { ownerName, lastUpdated: new Date() } },
          { maxTimeMS: 5000 } as any
        );
      });

      if ((res as any)?.modifiedCount > 0) {
        logger.info(`Updated owner name in ${(res as any).modifiedCount} property accounts for user ${user._id}`);
      }
      
      this.recordSyncSuccess();

    } catch (error) {
      logger.error(`Failed to sync user ${user._id}:`, error);
      throw error;
    }
  }

  /**
   * Remove payment from accounting database
   */
  private async removePaymentFromAccounting(paymentId: string): Promise<void> {
    try {
      const PropertyAccount = accountingConnection.model('PropertyAccount');
      
      // Find property account with this payment
      const propertyAccount = await PropertyAccount.findOne({
        'transactions.paymentId': paymentId
      });

      if (propertyAccount) {
        const transaction = propertyAccount.transactions.find(
          (t: any) => t.paymentId && t.paymentId.toString() === paymentId
        );

        if (transaction) {
          // Remove transaction and update totals
          propertyAccount.transactions = propertyAccount.transactions.filter(
            (t: any) => t.paymentId && t.paymentId.toString() !== paymentId
          );
          
          propertyAccount.totalIncome -= transaction.amount;
          propertyAccount.runningBalance -= transaction.amount;
          propertyAccount.lastUpdated = new Date();

          await this.db.executeWithRetry(async () => {
            await propertyAccount.save();
          });
          logger.info(`Removed payment ${paymentId} from property account ${propertyAccount.propertyId}`);
        }
      }
      
      this.recordSyncSuccess();

    } catch (error) {
      logger.error(`Failed to remove payment ${paymentId}:`, error);
      throw error;
    }
  }

  /**
   * Remove property from accounting database
   */
  private async removePropertyFromAccounting(propertyId: string): Promise<void> {
    try {
      // Do not delete immutable ledgers; archive/deactivate instead
      const PropertyAccount = accountingConnection.model('PropertyAccount');
      await this.db.executeWithRetry(async () => {
        await PropertyAccount.updateMany(
          { propertyId },
          { $set: { isActive: false, isArchived: true, lastUpdated: new Date() } },
          { maxTimeMS: 5000 } as any
        );
      });
      logger.info(`Archived/deactivated property account(s) for property ${propertyId}`);
      
      this.recordSyncSuccess();

    } catch (error) {
      logger.error(`Failed to remove property ${propertyId}:`, error);
      throw error;
    }
  }

  /**
   * Remove user from accounting database
   */
  private async removeUserFromAccounting(userId: string): Promise<void> {
    try {
      const PropertyAccount = accountingConnection.model('PropertyAccount');
      
      // Update property accounts to remove owner reference
      await this.db.executeWithRetry(async () => {
        await PropertyAccount.updateMany(
          { ownerId: userId },
          { 
            $unset: { ownerId: 1, ownerName: 1 },
            $set: { lastUpdated: new Date() }
          },
          { maxTimeMS: 5000 } as any
        );
      });

      logger.info(`Removed user ${userId} from property accounts`);
      
      this.recordSyncSuccess();

    } catch (error) {
      logger.error(`Failed to remove user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Perform full synchronization of all data
   */
  public async performFullSync(): Promise<SyncStats> {
    const startTime = Date.now();
    logger.info('Starting full database synchronization...');

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
      await this.syncAllProperties();
      
      // Sync all completed payments
      await this.syncAllPayments();
      
      // Sync all users
      await this.syncAllUsers();

      // Calculate duration
      this.syncStats.syncDuration = Date.now() - startTime;
      
      logger.info(`Full sync completed in ${this.syncStats.syncDuration}ms. Success: ${this.syncStats.successCount}, Errors: ${this.syncStats.errorCount}`);
      
      // Emit full sync completed event
      this.emit('fullSyncCompleted', this.syncStats);
      
      return this.syncStats;

    } catch (error) {
      logger.error('Full sync failed:', error);
      this.syncStats.syncDuration = Date.now() - startTime;
      throw error;
    }
  }

  /**
   * Start full synchronization asynchronously and return a job id
   */
  public startFullSyncAsync(): { jobId: string; startedAt: Date } {
    // Lazy import to avoid top-level dependency cycle
    const { v4: uuidv4 } = require('uuid');
    if (this.fullSyncInProgress && this.currentFullSyncJobId) {
      logger.info(`Full sync already in progress (jobId=${this.currentFullSyncJobId})`);
      return { jobId: this.currentFullSyncJobId, startedAt: this.currentFullSyncStartedAt || new Date() };
    }
    this.fullSyncInProgress = true;
    this.lastFullSyncError = null;
    this.currentFullSyncJobId = uuidv4();
    this.currentFullSyncStartedAt = new Date();
    const jobId: string = this.currentFullSyncJobId as string;
    const startedAt: Date = this.currentFullSyncStartedAt as Date;
    // Run on next tick without blocking the request cycle
    setImmediate(async () => {
      try {
        await this.performFullSync();
      } catch (e: any) {
        const message = e?.message ? String(e.message) : String(e);
        this.lastFullSyncError = message;
        logger.error(`Full sync job ${jobId} failed:`, e);
      } finally {
        this.fullSyncInProgress = false;
        this.lastFullSyncCompletedAt = new Date();
        // keep currentFullSyncJobId until next start so status can show last run
      }
    });
    return { jobId, startedAt };
  }

  /**
   * Get background full sync job status
   */
  public getFullSyncJobStatus(): {
    inProgress: boolean;
    jobId: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    lastError: string | null;
  } {
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
  private async syncAllProperties(): Promise<void> {
    try {
      const properties = await Property.find({});
      logger.info(`Syncing ${properties.length} properties...`);

      for (const property of properties) {
        try {
          await this.syncPropertyToAccounting(property);
          this.syncStats.totalSynced++;
        } catch (error) {
          this.recordSyncError('property', property._id.toString(), error);
        }
      }

    } catch (error) {
      logger.error('Failed to sync properties:', error);
      throw error;
    }
  }

  /**
   * Sync all completed payments
   */
  private async syncAllPayments(): Promise<void> {
    try {
      const payments = await Payment.find({
        status: 'completed',
        paymentType: { $in: ['rental', 'sale'] },
        isProvisional: { $ne: true },
        isInSuspense: { $ne: true },
        reversalOfPaymentId: { $exists: false },
        amount: { $gte: 0 }
      });
      
      logger.info(`Syncing ${payments.length} completed payments...`);

      for (const payment of payments) {
        try {
          await this.syncPaymentToAccounting(payment);
          // Ensure owner income is posted to property/development ledgers as well (idempotent)
          try {
            await propertyAccountService.recordIncomeFromPayment(payment._id.toString());
          } catch (ledgerErr) {
            // Queue for retry if immediate posting fails
            try { await ledgerEventService.enqueueOwnerIncomeEvent(payment._id.toString()); } catch {}
            logger.warn('Property ledger posting failed during full sync; enqueued for retry:', (ledgerErr as any)?.message || ledgerErr);
          }
          // Best-effort verification and reconciliation for this payment
          try {
            await this.verifyAndReconcilePaymentPosting(payment._id.toString());
          } catch (verifyErr) {
            logger.warn('Verification failed during full sync (non-fatal):', (verifyErr as any)?.message || verifyErr);
          }
          this.syncStats.totalSynced++;
        } catch (error) {
          this.recordSyncError('payment', payment._id.toString(), error);
        }
      }

    } catch (error) {
      logger.error('Failed to sync payments:', error);
      throw error;
    }
  }

  /**
   * Sync all users
   */
  private async syncAllUsers(): Promise<void> {
    try {
      const users = await User.find({});
      logger.info(`Syncing ${users.length} users...`);

      for (const user of users) {
        try {
          await this.syncUserToAccounting(user);
          this.syncStats.totalSynced++;
        } catch (error) {
          this.recordSyncError('user', user._id.toString(), error);
        }
      }

    } catch (error) {
      logger.error('Failed to sync users:', error);
      throw error;
    }
  }

  /**
   * Record successful sync
   */
  private recordSyncSuccess(): void {
    this.syncStats.successCount++;
  }

  /**
   * Record sync error
   */
  private recordSyncError(type: string, documentId: string, error: unknown): void {
    const err = error as any;
    const errorMessage = err?.message ? String(err.message) : String(error);
    this.syncStats.errorCount++;
    this.syncStats.errors.push({
      documentId,
      error: errorMessage,
      timestamp: new Date()
    });

    // Persist failure for reprocessing
    try {
      const retriable = this.db.shouldRetry(err);
      const labels: string[] = Array.isArray(err?.errorLabels) ? err.errorLabels : [];
      const backoffMs = retriable ? 5 * 60 * 1000 : undefined; // 5 minutes initial backoff
      SyncFailure.updateOne(
        { type, documentId },
        {
          $set: {
            type,
            documentId,
            errorName: err?.name,
            errorCode: err?.code,
            errorMessage: errorMessage,
            errorLabels: labels,
            retriable,
            status: 'pending',
            lastErrorAt: new Date(),
            payload: undefined
          },
          $setOnInsert: {
            attemptCount: 0
          },
          ...(retriable ? { $set: { nextAttemptAt: new Date(Date.now() + (backoffMs as number)) } } : {})
        },
        { upsert: true }
      ).catch(() => {});
    } catch (persistErr) {
      logger.warn('Failed to persist sync failure record:', persistErr);
    }

    // Emit error event
    this.emit('syncError', {
      type,
      documentId,
      error: errorMessage,
      errorName: (error as any)?.name,
      errorCode: (error as any)?.code,
      retriable: this.db.shouldRetry(error),
      timestamp: new Date()
    });
  }

  private async clearFailureRecord(type: string, documentId: string): Promise<void> {
    try {
      await SyncFailure.deleteOne({ type, documentId });
      this.emit('syncFailureCleared', { type, documentId, timestamp: new Date() });
    } catch (e) {
      logger.warn('Failed to clear failure record:', e);
    }
  }

  /**
   * Retry a failed sync for a specific document
   */
  public async retrySyncFor(type: string, documentId: string): Promise<void> {
    try {
      switch (type) {
        case 'payment': {
          const payment = await Payment.findById(documentId);
          if (payment) {
            await this.syncPaymentToAccounting(payment);
            await this.clearFailureRecord('payment', documentId);
          }
          break;
        }
        case 'property': {
          const property = await Property.findById(documentId);
          if (property) {
            await this.syncPropertyToAccounting(property);
            await this.clearFailureRecord('property', documentId);
          }
          break;
        }
        case 'user': {
          const user = await User.findById(documentId);
          if (user) {
            await this.syncUserToAccounting(user);
            await this.clearFailureRecord('user', documentId);
          }
          break;
        }
        default:
          logger.warn(`No retry handler for type: ${type}`);
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * List stored sync failures (for dashboard)
   */
  public async listFailures(params?: { status?: 'pending' | 'resolved' | 'discarded'; limit?: number }): Promise<any[]> {
    const { status, limit = 100 } = params || {};
    const query: any = {};
    if (status) query.status = status;
    return SyncFailure.find(query).sort({ lastErrorAt: -1 }).limit(limit).lean();
  }

  public async retryFailureById(id: string): Promise<void> {
    const fail = await SyncFailure.findById(id);
    if (!fail) return;
    await this.retrySyncFor(fail.type, fail.documentId);
    await SyncFailure.updateOne({ _id: fail._id }, { $set: { status: 'resolved' } });
  }

  /**
   * Get current sync statistics
   */
  public getSyncStats(): SyncStats {
    try {
      return { ...this.syncStats };
    } catch (error) {
      logger.error('Error getting sync stats:', error);
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
  public getSyncStatus(): { isRunning: boolean; lastSyncTime: Date; totalSynced: number } {
    try {
      return {
        isRunning: this.isRunning,
        lastSyncTime: this.syncStats.lastSyncTime,
        totalSynced: this.syncStats.totalSynced
      };
    } catch (error) {
      logger.error('Error getting sync status:', error);
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
  public async validateDataConsistency(options?: {
    lookbackDays?: number;
    concurrency?: number;
  }): Promise<{
    isConsistent: boolean;
    inconsistencies: Array<{ type: string; description: string; count: number }>;
  }> {
    try {
      const inconsistencies: Array<{ type: string; description: string; count: number }> = [];
      // Resolve execution parameters with safe bounds
      const resolvedConcurrency = Math.max(
        1,
        Math.min(
          50,
          Number(options?.concurrency || process.env.SYNC_VALIDATION_CONCURRENCY || 8)
        )
      );
      const resolvedLookbackDays = Math.max(
        1,
        Math.min(
          365,
          Number(options?.lookbackDays ?? process.env.SYNC_VALIDATION_LOOKBACK_DAYS ?? 30)
        )
      );
      // Simple concurrency runner
      const runWithConcurrency = async <T>(
        items: T[],
        worker: (item: T, index: number) => Promise<void>,
        concurrency: number
      ): Promise<void> => {
        let index = 0;
        const total = items.length;
        const workers: Array<Promise<void>> = [];
        for (let i = 0; i < Math.min(concurrency, total); i++) {
          workers.push(
            (async () => {
              while (true) {
                let currentIndex: number;
                // Fetch next index
                if (index >= total) break;
                currentIndex = index;
                index += 1;
                try {
                  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                  await worker(items[currentIndex]!, currentIndex);
                } catch (e) {
                  // Individual item errors are recorded by the worker; continue
                }
              }
            })()
          );
        }
        await Promise.allSettled(workers);
      };

      // Check if database connections are available
      if (!accountingConnection || !mainConnection) {
        logger.warn('Database connections not available for consistency check');
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
        const PropertyAccount = accountingConnection.model('PropertyAccount');
        const propertyAccounts: Array<{
          _id: any;
          propertyId: any;
          ownerId?: any;
        }> = await PropertyAccount.find({ isArchived: { $ne: true } })
          .select('_id propertyId ownerId')
          .lean();
        await runWithConcurrency(
          propertyAccounts,
          async (account) => {
            try {
              // Check if backing entity still exists across Property/Development/DevelopmentUnit
              const [prop, dev, unit] = await Promise.all([
                Property.findById(account.propertyId).select('_id').lean(),
                Development.findById(account.propertyId).select('_id').lean(),
                DevelopmentUnit.findById(account.propertyId).select('_id').lean()
              ]);
              if (!prop && !dev && !unit) {
                inconsistencies.push({
                  type: 'orphaned_property_account',
                  description: `Property account exists but property ${account.propertyId} not found`,
                  count: 1
                });
              }
              // Check if owner still exists (support legacy owner types)
              if (account.ownerId) {
                const [po, u] = await Promise.all([
                  PropertyOwner.findById(account.ownerId).select('_id').lean(),
                  User.findById(account.ownerId).select('_id').lean()
                ]);
                if (!po && !u) {
                  inconsistencies.push({
                    type: 'orphaned_owner_reference',
                    description: `Property account references non-existent owner ${account.ownerId}`,
                    count: 1
                  });
                }
              }
            } catch (accountError) {
              logger.warn(`Error checking account ${account._id}:`, accountError);
              inconsistencies.push({
                type: 'account_check_error',
                description: `Error checking account ${account._id}`,
                count: 1
              });
            }
          },
          resolvedConcurrency
        );

        // Check for missing property accounts
        const properties: Array<{ _id: any }> = await Property.find({})
          .select('_id')
          .lean();
        await runWithConcurrency(
          properties,
          async (property) => {
            try {
              const account = await PropertyAccount.findOne({ propertyId: property._id })
                .select('_id')
                .lean();
              if (!account) {
                inconsistencies.push({
                  type: 'missing_property_account',
                  description: `Property ${property._id} exists but no accounting record found`,
                  count: 1
                });
              }
            } catch (propertyError) {
              logger.warn(`Error checking property ${property._id}:`, propertyError);
            }
          },
          resolvedConcurrency
        );

        // Cross-check payments vs ledgers (lookback window to bound workload)
        const since = new Date(Date.now() - resolvedLookbackDays * 24 * 60 * 60 * 1000);
        const payments: Array<{
          _id: any;
          companyId?: any;
          paymentType?: string;
          commissionDetails?: { agencyShare?: number };
          paymentDate?: Date;
          currency?: string;
          paymentMethod?: string;
          referenceNumber?: string;
          processedBy?: any;
          notes?: string;
        }> = await Payment.find({
          status: 'completed',
          paymentType: { $in: ['rental', 'sale'] },
          isProvisional: { $ne: true },
          isInSuspense: { $ne: true },
          $or: [
            { paymentDate: { $gte: since } },
            { updatedAt: { $gte: since } }
          ]
        })
          .select('_id companyId paymentType commissionDetails paymentDate currency paymentMethod referenceNumber processedBy notes')
          .lean();

        // Helper to safely import CompanyAccount on demand
        const getCompanyAccountModel = async () => {
          const mod = await import('../models/CompanyAccount');
          return mod.CompanyAccount;
        };

        await runWithConcurrency(
          payments,
          async (p) => {
            // Property/development ledger presence
            const propHasPosting = await PropertyAccount.findOne({
              'transactions.paymentId': p._id
            })
              .select('_id')
              .lean();
            if (!propHasPosting) {
              inconsistencies.push({
                type: 'missing_property_ledger_income',
                description: `Payment ${String(p._id)} not posted to any property/development ledger`,
                count: 1
              });
            }
            // Company commission presence (only when agencyShare > 0 and companyId present)
            const agencyShare = Number(p?.commissionDetails?.agencyShare || 0);
            if (agencyShare > 0 && p?.companyId) {
              const CompanyAccount = await getCompanyAccountModel();
              const companyHasPosting = await CompanyAccount.findOne({
                companyId: p.companyId,
                'transactions.paymentId': p._id
              })
                .select('_id')
                .lean();
              if (!companyHasPosting) {
                inconsistencies.push({
                  type: 'missing_company_commission',
                  description: `Payment ${String(p._id)} commission not posted to company account`,
                  count: 1
                });
              }
            }
          },
          resolvedConcurrency
        );

        // Detect duplicate postings in recent ledgers (property)
        const recentAccounts = await PropertyAccount.find({ lastUpdated: { $gte: since } })
          .select('_id propertyId ledgerType transactions')
          .lean();
        for (const acc of recentAccounts) {
          const counts: Record<string, number> = Object.create(null);
          for (const t of (acc as any).transactions || []) {
            const pid = t?.paymentId ? String(t.paymentId) : '';
            if (!pid) continue;
            const key = `${t.type}:${pid}`;
            counts[key] = (counts[key] || 0) + 1;
          }
          const dupKeys = Object.keys(counts).filter(k => counts[k] > 1);
          if (dupKeys.length > 0) {
            inconsistencies.push({
              type: 'duplicate_property_ledger_posting',
              description: `Duplicate postings detected on property ledger ${String((acc as any)._id)} for ${dupKeys.length} payment(s)`,
              count: dupKeys.length
            });
          }
        }

        // Detect duplicate postings in recent company accounts
        try {
          const CompanyAccount = await getCompanyAccountModel();
          const companyAccounts = await CompanyAccount.find({ lastUpdated: { $gte: since } })
            .select('_id companyId transactions').lean();
          for (const ca of companyAccounts) {
            const counts: Record<string, number> = Object.create(null);
            for (const t of (((ca as any).transactions || []).filter((x: any) => x?.isArchived !== true))) {
              const pid = t?.paymentId ? String(t.paymentId) : '';
              if (!pid) continue;
              counts[pid] = (counts[pid] || 0) + 1;
            }
            const dup = Object.keys(counts).filter(k => counts[k] > 1);
            if (dup.length > 0) {
              inconsistencies.push({
                type: 'duplicate_company_commission',
                description: `Duplicate company commission postings detected on account ${String((ca as any)._id)} for ${dup.length} payment(s)`,
                count: dup.length
              });
            }
          }
        } catch (dupErr) {
          logger.warn('CompanyAccount duplicate detection skipped:', dupErr);
        }
      } catch (dbError) {
        logger.error('Database error during consistency check:', dbError);
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

    } catch (error) {
      logger.error('Failed to validate data consistency:', error);
      return {
        isConsistent: false,
        inconsistencies: [{
          type: 'validation_error',
          description: 'Failed to validate data consistency',
          count: 1
        }]
      };
    }
  }

  /**
   * Verify that a specific payment has been posted to relevant ledgers and reconcile issues:
   * - Ensures property/development ledger income exists (idempotent)
   * - Ensures company commission is recorded when applicable (idempotent)
   * - Dedupe duplicate postings in ledgers (best-effort)
   */
  private async verifyAndReconcilePaymentPosting(paymentId: string): Promise<void> {
    try {
      const payment = await Payment.findById(paymentId).lean();
      if (!payment || payment.status !== 'completed') return;
      if ((payment as any).isInSuspense === true) return;

      // Property/development ledgers: idempotent record and dedupe if needed
      try {
        await propertyAccountService.recordIncomeFromPayment(paymentId);
      } catch (e) {
        // Enqueue for retry if immediate fails
        try { await ledgerEventService.enqueueOwnerIncomeEvent(paymentId); } catch {}
        logger.warn('verifyAndReconcile: property ledger post failed; enqueued for retry:', (e as any)?.message || e);
      }

      // Dedupe any property ledgers that contain this payment more than once
      try {
        const PropertyAccount = accountingConnection.model('PropertyAccount');
        const accountsWithPayment = await PropertyAccount.find({ 'transactions.paymentId': payment._id })
          .select('_id propertyId ledgerType transactions').lean();
        for (const acc of accountsWithPayment) {
          // Count occurrences of this paymentId
          const occurrences = ((acc as any).transactions || []).filter((t: any) => String(t?.paymentId || '') === String(payment._id)).length;
          if (occurrences > 1) {
            try {
              await reconcilePropertyLedgerDuplicates(String((acc as any).propertyId), (acc as any).ledgerType as any);
              logger.info(`verifyAndReconcile: deduped property ledger for property ${String((acc as any).propertyId)} (${(acc as any).ledgerType})`);
            } catch (dedupeErr) {
              logger.warn('verifyAndReconcile: failed to dedupe property ledger:', (dedupeErr as any)?.message || dedupeErr);
            }
          }
        }
      } catch (scanErr) {
        logger.warn('verifyAndReconcile: scan for property ledger duplicates failed:', (scanErr as any)?.message || scanErr);
      }

      // Company commission ledger: ensure commission posted (idempotent) and dedupe
      const agencyShare = Number((payment as any)?.commissionDetails?.agencyShare || 0);
      if (agencyShare > 0 && (payment as any)?.companyId) {
        try {
          // Reuse the same logic as syncPaymentToAccounting by constructing tx and pushing if missing
          const { CompanyAccount } = await import('../models/CompanyAccount');
          const companyId = (payment as any).companyId;
          const desiredSource = payment.paymentType === 'sale' ? 'sales_commission' : 'rental_commission';
          const txDoc = {
            type: 'income',
            source: desiredSource,
            amount: agencyShare,
            date: (payment as any).paymentDate || new Date(),
            currency: (payment as any).currency || 'USD',
            paymentMethod: (payment as any).paymentMethod,
            paymentId: (payment as any)._id,
            referenceNumber: (payment as any).referenceNumber,
            description: desiredSource === 'sales_commission' ? 'Sales commission income' : 'Rental commission income',
            processedBy: (payment as any).processedBy,
            notes: (payment as any).notes
          };
          // Ensure account exists and append only if not already present
          await CompanyAccount.updateOne(
            { companyId },
            { $setOnInsert: { companyId, runningBalance: 0, totalIncome: 0, totalExpenses: 0, lastUpdated: new Date() } },
            { upsert: true }
          );
          await CompanyAccount.updateOne(
            { companyId, transactions: { $not: { $elemMatch: { paymentId: (payment as any)._id, isArchived: { $ne: true } } } } },
            {
              $push: { transactions: txDoc },
              $inc: { totalIncome: agencyShare, runningBalance: agencyShare },
              $set: { lastUpdated: new Date() }
            }
          );
        } catch (postErr) {
          logger.warn('verifyAndReconcile: failed ensuring company commission posting:', (postErr as any)?.message || postErr);
        }

        // Dedupe duplicate postings in company ledger (keep earliest, archive the rest)
        try {
          const { CompanyAccount } = await import('../models/CompanyAccount');
          const ca = await CompanyAccount.findOne({ companyId: (payment as any).companyId }).lean();
          if (ca && Array.isArray((ca as any).transactions)) {
            const dupIds: any[] = [];
            const grouped: Record<string, Array<{ _id?: any; date: Date }>> = Object.create(null);
            for (const t of (ca as any).transactions) {
              const pid = t?.paymentId ? String(t.paymentId) : '';
              if (!pid) continue;
              if (!grouped[pid]) grouped[pid] = [];
              grouped[pid].push({ _id: (t as any)._id, date: new Date(t.date) });
            }
            for (const pid of Object.keys(grouped)) {
              const list = grouped[pid];
              if (list.length <= 1) continue;
              const sorted = list.slice().sort((a, b) => a.date.getTime() - b.date.getTime());
              // archive all but the first
              dupIds.push(...sorted.slice(1).map(i => i._id).filter(Boolean));
            }
            if (dupIds.length > 0) {
              // Soft-archive duplicates (bypass immutability guard using native collection update)
              await (CompanyAccount as any).collection.updateOne(
                { companyId: (payment as any).companyId },
                { $set: { 'transactions.$[t].isArchived': true, lastUpdated: new Date() } },
                { arrayFilters: [{ 't._id': { $in: dupIds } }] } as any
              );
              // Recalculate totals ignoring archived
              const fresh = await CompanyAccount.findOne({ companyId: (payment as any).companyId }).lean();
              if (fresh && Array.isArray((fresh as any).transactions)) {
                const active = (fresh as any).transactions.filter((t: any) => t?.isArchived !== true);
                const income = active.filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
                const expenses = active.filter((t: any) => t.type !== 'income').reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
                await CompanyAccount.updateOne(
                  { _id: (fresh as any)._id },
                  { $set: { totalIncome: income, totalExpenses: expenses, runningBalance: income - expenses, lastUpdated: new Date() } }
                );
              }
            }
          }
        } catch (dedupeErr) {
          logger.warn('verifyAndReconcile: failed to dedupe company ledger:', (dedupeErr as any)?.message || dedupeErr);
        }
      }
    } catch (outer) {
      // Non-fatal
      logger.warn('verifyAndReconcilePaymentPosting encountered an error:', (outer as any)?.message || outer);
    }
  }

  /**
   * Public wrapper to reconcile postings for a given payment:
   * - Ensures property/development ledger income exists
   * - Ensures company commission is recorded when applicable
   * - Attempts to dedupe related duplicates
   */
  public async reconcilePaymentPosting(paymentId: string): Promise<void> {
    await this.verifyAndReconcilePaymentPosting(paymentId);
  }
}

export default DatabaseSyncService;
