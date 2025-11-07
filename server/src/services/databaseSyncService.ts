import { mainConnection, accountingConnection } from '../config/database';
import { Payment } from '../models/Payment';
import { Property } from '../models/Property';
import { User } from '../models/User';
import { IPropertyAccount } from '../models/PropertyAccount';
import { logger } from '../utils/logger';
import { DatabaseService } from './databaseService';
import SyncFailure from '../models/SyncFailure';
import { EventEmitter } from 'events';

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
        updatedAt: { $gte: new Date(Date.now() - 60000) } // Last minute
      }).limit(100);

      for (const payment of recentPayments) {
        if (payment.status === 'completed' && payment.paymentType === 'rental') {
          await this.syncPaymentToAccounting(payment);
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
        if (fullDocument && fullDocument.status === 'completed' && fullDocument.paymentType === 'rental') {
        await this.syncPaymentToAccounting(fullDocument);
        await this.clearFailureRecord('payment', documentId);
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
      const PropertyAccount = accountingConnection.model('PropertyAccount');
      const { CompanyAccount } = await import('../models/CompanyAccount');
      
      // Find or create property account
      let propertyAccount = await PropertyAccount.findOne({ propertyId: payment.propertyId });
      
      if (!propertyAccount) {
        // Get property details
        const property = await Property.findById(payment.propertyId);
        if (!property) {
          throw new Error(`Property not found: ${payment.propertyId}`);
        }

        // Get owner details
        let ownerName = 'Unknown Owner';
        if (property.ownerId) {
          const owner = await User.findById(property.ownerId);
          if (owner) {
            ownerName = `${owner.firstName} ${owner.lastName}`;
          }
        }

        // Create new property account
        propertyAccount = new PropertyAccount({
          propertyId: payment.propertyId,
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
          isActive: true
        });
      }

      // Check if payment already exists in transactions
      const existingTransaction = propertyAccount.transactions.find(
        (t: any) => t.paymentId && t.paymentId.toString() === payment._id.toString()
      );

      if (!existingTransaction) {
        // Calculate owner amount (income after commission deduction)
        const ownerAmount = payment.commissionDetails?.ownerAmount || payment.amount;
        
        logger.info(`Payment ${payment._id}: Full amount: ${payment.amount}, Owner amount (after commission): ${ownerAmount}`);
        
        // Add income transaction (rental vs sale)
        const isSale = payment.paymentType === 'sale';
        const incomeDescription = isSale
          ? `Sale income - ${payment.referenceNumber || ''}`
          : `Rent payment - ${payment.tenantName || 'Tenant'}`;
        const incomeCategory = isSale ? 'sale_income' : 'rental_income';

        propertyAccount.transactions.push({
          type: 'income',
          amount: ownerAmount,
          date: payment.paymentDate || new Date(),
          paymentId: payment._id,
          description: incomeDescription,
          category: incomeCategory,
          recipientType: 'tenant',
          referenceNumber: payment.referenceNumber,
          status: 'completed',
          processedBy: payment.processedBy,
          notes: payment.notes
        });

        // Update totals with owner amount (after commission)
        propertyAccount.totalIncome += ownerAmount;
        propertyAccount.runningBalance += ownerAmount;
        propertyAccount.lastIncomeDate = new Date();
        propertyAccount.lastUpdated = new Date();

        await this.db.executeWithRetry(async () => {
          await propertyAccount.save();
        });
        logger.info(`Synced payment ${payment._id} to property account ${payment.propertyId}`);
        
        this.recordSyncSuccess();
      }

      // Record agency commission into company account as revenue
      if (payment.companyId && payment.commissionDetails?.agencyShare) {
        const companyId = payment.companyId;
        let companyAccount = await CompanyAccount.findOne({ companyId });
        if (!companyAccount) {
          companyAccount = new CompanyAccount({ companyId, transactions: [], runningBalance: 0, totalIncome: 0, totalExpenses: 0 });
        }

        const alreadyLogged = companyAccount.transactions.some((t: any) => t.paymentId?.toString() === payment._id.toString() && t.type === 'income');
        if (!alreadyLogged) {
          const agencyShare = payment.commissionDetails.agencyShare;
          const source = payment.paymentType === 'introduction' ? 'sales_commission' : 'rental_commission';
          companyAccount.transactions.push({
            type: 'income',
            source,
            amount: agencyShare,
            date: payment.paymentDate || new Date(),
            currency: payment.currency || 'USD',
            paymentMethod: payment.paymentMethod,
            paymentId: payment._id,
            referenceNumber: payment.referenceNumber,
            description: source === 'sales_commission' ? 'Sales commission income' : 'Rental commission income',
            processedBy: payment.processedBy,
            notes: payment.notes
          });
          companyAccount.totalIncome += agencyShare;
          companyAccount.runningBalance += agencyShare;
          companyAccount.lastUpdated = new Date();
          await this.db.executeWithRetry(async () => {
            await companyAccount.save();
          });
          logger.info(`Recorded company revenue ${agencyShare} for company ${companyId} from payment ${payment._id}`);
        }
      }

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
      const PropertyAccount = accountingConnection.model('PropertyAccount');
      
      let propertyAccount = await PropertyAccount.findOne({ propertyId: property._id });
      
      if (propertyAccount) {
        // Update existing account
        propertyAccount.propertyName = property.name;
        propertyAccount.propertyAddress = property.address;
        propertyAccount.ownerId = property.ownerId;
        propertyAccount.isActive = property.isActive !== false;
        propertyAccount.lastUpdated = new Date();

        if (property.ownerId) {
          const owner = await User.findById(property.ownerId);
          if (owner) {
            propertyAccount.ownerName = `${owner.firstName} ${owner.lastName}`;
          }
        }

        await this.db.executeWithRetry(async () => {
          await propertyAccount.save();
        });
        logger.info(`Updated property account for property ${property._id}`);
      } else {
        // Create new account if it doesn't exist
        let ownerName = 'Unknown Owner';
        if (property.ownerId) {
          const owner = await User.findById(property.ownerId);
          if (owner) {
            ownerName = `${owner.firstName} ${owner.lastName}`;
          }
        }

        const newAccount = new PropertyAccount({
          propertyId: property._id,
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

        await this.db.executeWithRetry(async () => {
          await newAccount.save();
        });
        logger.info(`Created property account for property ${property._id}`);
      }
      
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
      const PropertyAccount = accountingConnection.model('PropertyAccount');
      
      await this.db.executeWithRetry(async () => {
        await PropertyAccount.findOneAndDelete({ propertyId }, { maxTimeMS: 5000 } as any);
      });
      logger.info(`Removed property account for property ${propertyId}`);
      
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
        paymentType: 'rental'
      });
      
      logger.info(`Syncing ${payments.length} completed payments...`);

      for (const payment of payments) {
        try {
          await this.syncPaymentToAccounting(payment);
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
  public async validateDataConsistency(): Promise<{
    isConsistent: boolean;
    inconsistencies: Array<{ type: string; description: string; count: number }>;
  }> {
    try {
      const inconsistencies = [];

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
        const propertyAccounts = await PropertyAccount.find({});
        
        for (const account of propertyAccounts) {
          try {
            // Check if property still exists
            const property = await Property.findById(account.propertyId);
            if (!property) {
              inconsistencies.push({
                type: 'orphaned_property_account',
                description: `Property account exists but property ${account.propertyId} not found`,
                count: 1
              });
            }

            // Check if owner still exists
            if (account.ownerId) {
              const owner = await User.findById(account.ownerId);
              if (!owner) {
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
        }

        // Check for missing property accounts
        const properties = await Property.find({});
        for (const property of properties) {
          try {
            const account = await PropertyAccount.findOne({ propertyId: property._id });
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
}

export default DatabaseSyncService;
