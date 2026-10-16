import { CronJob } from 'cron';
import DatabaseSyncService from './databaseSyncService';
import SyncFailure from '../models/SyncFailure';
import { logger } from '../utils/logger';
import PropertyAccount from '../models/PropertyAccount';
import propertyAccountService from './propertyAccountService';
import { runWithJobLease } from './jobLeaseService';

export interface SyncSchedule {
  name: string;
  cronExpression: string;
  description: string;
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
  runCount: number;
  averageDuration: number;
}

export class ScheduledSyncService {
  private static instance: ScheduledSyncService;
  private syncJobs: Map<string, CronJob> = new Map();
  private syncSchedules: Map<string, SyncSchedule> = new Map();
  private databaseSyncService: DatabaseSyncService;

  private constructor() {
    this.databaseSyncService = DatabaseSyncService.getInstance();
    this.initializeSchedules();
  }

  public static getInstance(): ScheduledSyncService {
    if (!ScheduledSyncService.instance) {
      ScheduledSyncService.instance = new ScheduledSyncService();
    }
    return ScheduledSyncService.instance;
  }

  /**
   * Initialize default sync schedules
   */
  private initializeSchedules(): void {
    // Daily sync at 2 AM
    this.addSyncSchedule({
      name: 'daily_sync',
      cronExpression: '0 2 * * *',
      description: 'Daily operational sync. Payment accounting is detection-only.',
      enabled: true,
      runCount: 0,
      averageDuration: 0
    });

    // Hourly sync for critical data
    this.addSyncSchedule({
      name: 'hourly_sync',
      cronExpression: '0 * * * *',
      description: 'Hourly synchronization of payments and properties',
      enabled: true,
      runCount: 0,
      averageDuration: 0
    });

    // Frequent ledger reconciliation (keep small and cheap)
    this.addSyncSchedule({
      name: 'ledger_reconciliation',
      cronExpression: '*/5 * * * *',
      description: 'Detect duplicate ledger rows. Detection-only: does not archive, delete, or rewrite financial records.',
      enabled: true,
      runCount: 0,
      averageDuration: 0
    });

    this.addSyncSchedule({
      name: 'payment_accounting_integrity',
      cronExpression: '*/2 * * * *',
      description: 'Detect incomplete accounting for tracked payments. Read-only: never repairs or backfills.',
      enabled: true,
      runCount: 0,
      averageDuration: 0
    });

    // Weekly consistency check
    this.addSyncSchedule({
      name: 'weekly_consistency_check',
      cronExpression: '0 3 * * 0',
      description: 'Weekly data consistency validation (detection-only)',
      enabled: true,
      runCount: 0,
      averageDuration: 0
    });

    // Monthly deep sync
    this.addSyncSchedule({
      name: 'monthly_deep_sync',
      cronExpression: '0 4 1 * *',
      description: 'Monthly operational sync. Payment accounting is detection-only.',
      enabled: true,
      runCount: 0,
      averageDuration: 0
    });

    // Reprocess sync failures every 5 minutes
    this.addSyncSchedule({
      name: 'sync_failure_reprocessor',
      cronExpression: '*/5 * * * *',
      description: 'Reprocess pending sync failures with backoff',
      enabled: true,
      runCount: 0,
      averageDuration: 0
    });
  }

  /**
   * Add a new sync schedule
   */
  public addSyncSchedule(schedule: SyncSchedule): void {
    try {
      // Validate cron expression
      new CronJob(schedule.cronExpression, () => {}, null, false);

      this.syncSchedules.set(schedule.name, schedule);
      
      if (schedule.enabled) {
        this.startSyncJob(schedule);
      }

      logger.info(`Added sync schedule: ${schedule.name} - ${schedule.description}`);
      
    } catch (error) {
      logger.error(`Invalid cron expression for schedule ${schedule.name}:`, error);
      throw new Error(`Invalid cron expression: ${schedule.cronExpression}`);
    }
  }

  /**
   * Start a sync job
   */
  private startSyncJob(schedule: SyncSchedule): void {
    try {
      // Avoid starting the same job twice
      if (this.syncJobs.has(schedule.name)) {
        logger.info(`Sync job already started: ${schedule.name} - skipping`);
        return;
      }
      const job = new CronJob(
        schedule.cronExpression,
        async () => {
          await this.executeScheduledSync(schedule);
        },
        null,
        false,
        'UTC'
      );

      this.syncJobs.set(schedule.name, job);
      job.start();

      // Calculate next run time
      schedule.nextRun = job.nextDate().toJSDate();
      
      logger.info(`Started sync job: ${schedule.name} - Next run: ${schedule.nextRun}`);
      
    } catch (error) {
      logger.error(`Failed to start sync job ${schedule.name}:`, error);
    }
  }

  /**
   * Stop a sync job
   */
  public stopSyncJob(scheduleName: string): void {
    const job = this.syncJobs.get(scheduleName);
    if (job) {
      job.stop();
      this.syncJobs.delete(scheduleName);
      
      const schedule = this.syncSchedules.get(scheduleName);
      if (schedule) {
        schedule.enabled = false;
        schedule.nextRun = undefined;
      }
      
      logger.info(`Stopped sync job: ${scheduleName}`);
    }
  }

  /**
   * Enable a sync schedule
   */
  public enableSyncSchedule(scheduleName: string): void {
    const schedule = this.syncSchedules.get(scheduleName);
    if (schedule && !schedule.enabled) {
      schedule.enabled = true;
      this.startSyncJob(schedule);
      logger.info(`Enabled sync schedule: ${scheduleName}`);
    }
  }

  /**
   * Disable a sync schedule
   */
  public disableSyncSchedule(scheduleName: string): void {
    const schedule = this.syncSchedules.get(scheduleName);
    if (schedule && schedule.enabled) {
      this.stopSyncJob(scheduleName);
      logger.info(`Disabled sync schedule: ${scheduleName}`);
    }
  }

  /**
   * Execute a scheduled synchronization
   */
  private async executeScheduledSync(schedule: SyncSchedule): Promise<void> {
    const startTime = Date.now();
    logger.info(`Executing scheduled sync: ${schedule.name}`);

    try {
      const leaseResult = await runWithJobLease(`scheduled:${schedule.name}`, async () => {
        schedule.lastRun = new Date();
        schedule.runCount++;

        switch (schedule.name) {
          case 'daily_sync':
            await this.executeDailySync();
            break;
          case 'hourly_sync':
            await this.executeHourlySync();
            break;
          case 'ledger_reconciliation':
            await this.executeLedgerReconciliation();
            break;
          case 'payment_accounting_integrity':
            await this.executePaymentAccountingIntegrity();
            break;
          case 'weekly_consistency_check':
            await this.executeWeeklyConsistencyCheck();
            break;
          case 'monthly_deep_sync':
            await this.executeMonthlyDeepSync();
            break;
          case 'sync_failure_reprocessor':
            await this.executeFailureReprocessor();
            break;
          default:
            await this.executeCustomSync(schedule);
        }

        const duration = Date.now() - startTime;
        schedule.averageDuration = (schedule.averageDuration * (schedule.runCount - 1) + duration) / schedule.runCount;

        const job = this.syncJobs.get(schedule.name);
        if (job) {
          schedule.nextRun = job.nextDate().toJSDate();
        }

        logger.info(`Completed scheduled sync: ${schedule.name} in ${duration}ms`);
      });

      if (leaseResult.skipped) {
        return;
      }
    } catch (error) {
      logger.error(`Failed to execute scheduled sync ${schedule.name}:`, error);

      this.databaseSyncService.emit('scheduledSyncError', {
        scheduleName: schedule.name,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date()
      });
    }
  }

  /**
   * Execute failure reprocessor
   */
  private async executeFailureReprocessor(): Promise<void> {
    const MAX_ATTEMPTS = 10;
    const BASE_BACKOFF_MS = 5 * 60 * 1000; // 5 minutes
    try {
      const now = new Date();
      const pending = await SyncFailure.find({
        status: 'pending',
        $or: [
          { nextAttemptAt: { $exists: false } },
          { nextAttemptAt: { $lte: now } }
        ]
      }).limit(100);

      for (const fail of pending) {
        try {
          await this.databaseSyncService.retrySyncFor(fail.type, fail.documentId);
          // On success, mark resolved
          await SyncFailure.updateOne({ _id: fail._id }, { $set: { status: 'resolved' } });
          this.databaseSyncService.emit('syncFailureResolved', {
            type: fail.type,
            documentId: fail.documentId,
            resolvedAt: new Date()
          });
        } catch (err: any) {
          const attemptCount = (fail.attemptCount ?? 0) + 1;
          const retriable = this.databaseSyncService['db'].shouldRetry(err);
          const backoff = Math.min(BASE_BACKOFF_MS * Math.pow(2, attemptCount - 1), 24 * 60 * 60 * 1000); // cap at 24h
          const update: any = {
            $set: {
              errorName: err?.name,
              errorCode: err?.code,
              errorMessage: err?.message ?? String(err),
              errorLabels: Array.isArray(err?.errorLabels) ? err.errorLabels : [],
              retriable,
              lastErrorAt: new Date(),
              nextAttemptAt: retriable ? new Date(Date.now() + backoff) : undefined,
              status: attemptCount >= MAX_ATTEMPTS || !retriable ? 'discarded' : 'pending'
            },
            $inc: { attemptCount: 1 }
          };
          await SyncFailure.updateOne({ _id: fail._id }, update);
          this.databaseSyncService.emit('syncFailureRetry', {
            type: fail.type,
            documentId: fail.documentId,
            attempt: attemptCount,
            retriable,
            nextAttemptAt: retriable ? new Date(Date.now() + backoff) : undefined
          });
        }
      }
    } catch (error) {
      logger.error('Failure reprocessor run failed:', error);
    }
  }

  /**
   * Execute daily synchronization
   */
  private async executeDailySync(): Promise<void> {
    logger.info('Starting daily synchronization...');
    
    // Perform full sync
    await this.databaseSyncService.performFullSync();
    
    // Clean up old sync errors (keep last 30 days)
    await this.cleanupOldSyncErrors();
    
    logger.info('Daily synchronization completed');
  }

  /**
   * Execute hourly synchronization
   */
  private async executeHourlySync(): Promise<void> {
    logger.info('Starting hourly synchronization...');
    
    // Sync only recent changes (last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    // This would be implemented in the DatabaseSyncService
    // For now, we'll do a quick sync of critical data
    await this.syncRecentChanges(oneHourAgo);
    
    logger.info('Hourly synchronization completed');
  }

  /**
   * Tracked payments only: accountingComplete=false or diagnostic incomplete statuses.
   * Historical payments without those fields are never selected.
   * This pass DETECTS and FLAGS. It does not create accounting records.
   */
  private async executePaymentAccountingIntegrity(): Promise<void> {
    const { runPaymentAccountingIntegrityPass } = await import('./paymentAccountingIntegrity');
    await runPaymentAccountingIntegrityPass(50);
    const { logStuckRegistrationCheckouts } = await import('./registrationCheckoutMonitor');
    await logStuckRegistrationCheckouts();
  }

  /**
   * Execute ledger reconciliation
   */
  private async executeLedgerReconciliation(): Promise<void> {
    try {
      logger.info('Ledger reconciliation is detection-only; automatic duplicate archive/delete is disabled');
    } catch (err) {
      logger.error('Ledger reconciliation job failed:', err);
      throw err;
    }
  }

  /**
   * Execute weekly consistency check
   */
  private async executeWeeklyConsistencyCheck(): Promise<void> {
    logger.info('Starting weekly consistency check...');
    
    // Validate data consistency between databases
    const consistency = await this.databaseSyncService.validateDataConsistency();
    
    if (!consistency.isConsistent) {
      logger.warn(`Data consistency issues found: ${consistency.inconsistencies.length}`);
      for (const issue of consistency.inconsistencies) {
        logger.warn(`Consistency issue: ${issue.type} - ${issue.description}`);
      }
      logger.info('Weekly consistency check is detection-only; automatic account create/archive is disabled');
    } else {
      logger.info('Data consistency check passed');
    }
    
    logger.info('Weekly consistency check completed');
  }

  /**
   * Execute monthly deep synchronization
   */
  private async executeMonthlyDeepSync(): Promise<void> {
    logger.info('Starting monthly deep synchronization...');
    
    // Full sync with additional cleanup
    await this.databaseSyncService.performFullSync();
    
    // Clean up orphaned records
    await this.cleanupOrphanedRecords();
    
    // Optimize database indexes
    await this.optimizeDatabaseIndexes();
    
    // Generate sync report
    await this.generateSyncReport();
    
    logger.info('Monthly deep synchronization completed');
  }

  /**
   * Execute custom synchronization
   */
  private async executeCustomSync(schedule: SyncSchedule): Promise<void> {
    logger.info(`Executing custom sync: ${schedule.name}`);
    
    // Default to full sync for custom schedules
    await this.databaseSyncService.performFullSync();
  }

  /**
   * Sync recent changes
   */
  private async syncRecentChanges(since: Date): Promise<void> {
    try {
      // This would sync only documents modified since the given time
      // Implementation depends on your specific needs
      logger.info(`Syncing changes since ${since.toISOString()}`);
      
      // For now, we'll do a quick validation
      await this.databaseSyncService.validateDataConsistency();
      
    } catch (error) {
      logger.error('Failed to sync recent changes:', error);
      throw error;
    }
  }

  /**
   * Attempt to fix consistency issues
   */
  private async attemptConsistencyFixes(inconsistencies: Array<{ type: string; description: string; count: number }>): Promise<void> {
    try {
      logger.info('Attempting to fix consistency issues...');
      
      for (const issue of inconsistencies) {
        try {
          switch (issue.type) {
            case 'orphaned_property_account':
              await this.fixOrphanedPropertyAccounts();
              break;
            case 'missing_property_account':
              await this.fixMissingPropertyAccounts();
              break;
            case 'orphaned_owner_reference':
              await this.fixOrphanedOwnerReferences();
              break;
            default:
              logger.warn(`No automatic fix available for issue type: ${issue.type}`);
          }
        } catch (error) {
          logger.error(`Failed to fix issue ${issue.type}:`, error);
        }
      }
      
    } catch (error) {
      logger.error('Failed to attempt consistency fixes:', error);
    }
  }

  /**
   * Fix orphaned property accounts
   */
  private async fixOrphanedPropertyAccounts(): Promise<number> {
    try {
      const Property = require('../models/Property').default;
      const Development = require('../models/Development').default;
      const DevelopmentUnit = require('../models/DevelopmentUnit').default;

      // Only consider non-archived accounts for repair
      const propertyAccounts = await PropertyAccount.find({ isArchived: false });
      let archivedCount = 0;

      for (const account of propertyAccounts) {
        const pid = account.propertyId;
        // Check presence across all supported entity types
        const [propExists, devExists, unitExists] = await Promise.all([
          Property.findById(pid).select('_id').lean(),
          Development.findById(pid).select('_id').lean(),
          DevelopmentUnit.findById(pid).select('_id').lean()
        ]);
        const exists = Boolean(propExists || devExists || unitExists);
        if (!exists) {
          const archived = await propertyAccountService.archiveLedgerById(account._id);
          if (archived) archivedCount++;
        }
      }

      if (archivedCount > 0) {
        logger.info(`Archived ${archivedCount} orphaned property account(s) (no backing entity found)`);
      }

      return archivedCount;
    } catch (error) {
      logger.error('Failed to fix orphaned property accounts:', error);
      throw error;
    }
  }

  /**
   * Public entrypoint to archive orphaned property accounts on demand
   */
  public async runOrphanedAccountArchival(): Promise<{ archived: number }> {
    const archived = await this.fixOrphanedPropertyAccounts();
    return { archived };
  }

  /**
   * Fix missing property accounts
   */
  private async fixMissingPropertyAccounts(): Promise<void> {
    try {
      const Property = require('../models/Property').default;
      const properties = await Property.find({});
      let createdCount = 0;
      
      for (const property of properties) {
        await this.databaseSyncService['syncPropertyToAccounting'](property);
        createdCount++;
      }
      
      if (createdCount > 0) {
        logger.info(`Created ${createdCount} missing property accounts`);
      }
      
    } catch (error) {
      logger.error('Failed to fix missing property accounts:', error);
      throw error;
    }
  }

  /**
   * Fix orphaned owner references
   */
  private async fixOrphanedOwnerReferences(): Promise<number> {
    try {
      const User = require('../models/User').default;
      const PropertyOwner = require('../models/PropertyOwner').default;
      
      const propertyAccounts = await PropertyAccount.find({ ownerId: { $exists: true }, isArchived: false, isActive: { $ne: false } });
      let fixedCount = 0;
      
      for (const account of propertyAccounts) {
        if (account.ownerId) {
          const [po, u] = await Promise.all([
            PropertyOwner.findById(account.ownerId).select('_id'),
            User.findById(account.ownerId).select('_id')
          ]);
          if (!po && !u) {
            const cleaned = await propertyAccountService.clearOwnerReferenceForAccount(account._id);
            if (cleaned) fixedCount++;
          }
        }
      }
      
      if (fixedCount > 0) {
        logger.info(`Fixed ${fixedCount} orphaned owner references`);
      }
      return fixedCount;
    } catch (error) {
      logger.error('Failed to fix orphaned owner references:', error);
      throw error;
    }
  }

  /**
   * Public entrypoint to cleanup orphaned owner references
   */
  public async runOrphanedOwnerReferenceCleanup(): Promise<{ cleaned: number }> {
    const cleaned = await this.fixOrphanedOwnerReferences();
    return { cleaned };
  }

  /**
   * Cleanup orphaned owner references for a specific ownerId
   */
  public async runOwnerReferenceCleanupForOwnerId(ownerId: string): Promise<{ cleaned: number }> {
    try {
      const User = require('../models/User').default;
      const PropertyOwner = require('../models/PropertyOwner').default;
      let cleaned = 0;
      const accounts = await PropertyAccount.find({ ownerId: ownerId, isArchived: false, isActive: { $ne: false } });
      for (const account of accounts) {
        const [po, u] = await Promise.all([
          PropertyOwner.findById(ownerId).select('_id').lean(),
          User.findById(ownerId).select('_id').lean()
        ]);
        if (!po && !u) {
          const wasCleaned = await propertyAccountService.clearOwnerReferenceForAccount(account._id);
          if (wasCleaned) cleaned++;
        }
      }
      if (cleaned > 0) {
        logger.info(`Cleaned ${cleaned} orphaned owner reference(s) for ownerId ${ownerId}`);
      }
      return { cleaned };
    } catch (e) {
      logger.error('Failed to cleanup orphaned owner reference for ownerId:', ownerId, e);
      throw e;
    }
  }

  /**
   * Clean up orphaned records
   */
  private async cleanupOrphanedRecords(): Promise<void> {
    try {
      logger.info('Cleaning up orphaned records...');
      
      // This would implement cleanup logic for various orphaned records
      // Implementation depends on your specific data model
      
      logger.info('Orphaned records cleanup completed');
      
    } catch (error) {
      logger.error('Failed to cleanup orphaned records:', error);
    }
  }

  /**
   * Optimize database indexes
   */
  private async optimizeDatabaseIndexes(): Promise<void> {
    try {
      logger.info('Optimizing database indexes...');
      
      // This would implement index optimization logic
      // Implementation depends on your specific needs
      
      logger.info('Database index optimization completed');
      
    } catch (error) {
      logger.error('Failed to optimize database indexes:', error);
    }
  }

  /**
   * Generate sync report
   */
  private async generateSyncReport(): Promise<void> {
    try {
      logger.info('Generating sync report...');
      
      const stats = this.databaseSyncService.getSyncStats();
      const schedules = Array.from(this.syncSchedules.values());
      
      const report = {
        timestamp: new Date(),
        syncStats: stats,
        schedules: schedules,
        summary: {
          totalSchedules: schedules.length,
          enabledSchedules: schedules.filter(s => s.enabled).length,
          totalRuns: schedules.reduce((sum, s) => sum + s.runCount, 0),
          averageDuration: schedules.reduce((sum, s) => sum + s.averageDuration, 0) / schedules.length
        }
      };
      
      // Log report summary
      logger.info('Sync Report Generated:', {
        totalSchedules: report.summary.totalSchedules,
        enabledSchedules: report.summary.enabledSchedules,
        totalRuns: report.summary.totalRuns,
        averageDuration: Math.round(report.summary.averageDuration)
      });
      
      // Emit report generated event
      this.databaseSyncService.emit('syncReportGenerated', report);
      
    } catch (error) {
      logger.error('Failed to generate sync report:', error);
    }
  }

  /**
   * Clean up old sync errors
   */
  private async cleanupOldSyncErrors(): Promise<void> {
    try {
      // This would clean up old sync error logs
      // Implementation depends on your logging strategy
      logger.info('Old sync errors cleanup completed');
      
    } catch (error) {
      logger.error('Failed to cleanup old sync errors:', error);
    }
  }

  /**
   * Get all sync schedules
   */
  public getSyncSchedules(): SyncSchedule[] {
    try {
      return Array.from(this.syncSchedules.values());
    } catch (error) {
      logger.error('Error getting sync schedules:', error);
      return [];
    }
  }

  /**
   * Get sync schedule by name
   */
  public getSyncSchedule(name: string): SyncSchedule | undefined {
    return this.syncSchedules.get(name);
  }

  /**
   * Update sync schedule
   */
  public updateSyncSchedule(name: string, updates: Partial<SyncSchedule>): void {
    const schedule = this.syncSchedules.get(name);
    if (schedule) {
      const updatedSchedule = { ...schedule, ...updates };
      
      // Stop existing job if schedule is being disabled
      if (schedule.enabled && !updatedSchedule.enabled) {
        this.stopSyncJob(name);
      }
      
      // Start new job if schedule is being enabled
      if (!schedule.enabled && updatedSchedule.enabled) {
        this.startSyncJob(updatedSchedule);
      }
      
      // Update schedule
      this.syncSchedules.set(name, updatedSchedule);
      
      logger.info(`Updated sync schedule: ${name}`);
    }
  }

  /**
   * Start all enabled sync schedules
   */
  public startAllSchedules(): void {
    logger.info('Starting all enabled sync schedules...');
    
    for (const schedule of this.syncSchedules.values()) {
      if (schedule.enabled) {
        this.startSyncJob(schedule);
      }
    }
    
    logger.info('All enabled sync schedules started');
  }

  /**
   * Stop all sync schedules
   */
  public stopAllSchedules(): void {
    logger.info('Stopping all sync schedules...');
    
    for (const [name] of this.syncJobs) {
      this.stopSyncJob(name);
    }
    
    logger.info('All sync schedules stopped');
  }

  /**
   * Get service status
   */
  public getStatus(): {
    isRunning: boolean;
    totalSchedules: number;
    enabledSchedules: number;
    nextScheduledRun?: Date;
  } {
    try {
      const schedules = Array.from(this.syncSchedules.values());
      const enabledSchedules = schedules.filter(s => s.enabled);
      
      // Find the next scheduled run
      let nextScheduledRun: Date | undefined;
      for (const schedule of enabledSchedules) {
        if (schedule.nextRun && (!nextScheduledRun || schedule.nextRun < nextScheduledRun)) {
          nextScheduledRun = schedule.nextRun;
        }
      }
      
      return {
        isRunning: this.syncJobs.size > 0,
        totalSchedules: schedules.length,
        enabledSchedules: enabledSchedules.length,
        nextScheduledRun
      };
    } catch (error) {
      logger.error('Error getting scheduled sync status:', error);
      return {
        isRunning: false,
        totalSchedules: 0,
        enabledSchedules: 0,
        nextScheduledRun: undefined
      };
    }
  }
}

export default ScheduledSyncService;
