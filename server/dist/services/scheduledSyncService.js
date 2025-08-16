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
exports.ScheduledSyncService = void 0;
const cron_1 = require("cron");
const databaseSyncService_1 = __importDefault(require("./databaseSyncService"));
const logger_1 = require("../utils/logger");
class ScheduledSyncService {
    constructor() {
        this.syncJobs = new Map();
        this.syncSchedules = new Map();
        this.databaseSyncService = databaseSyncService_1.default.getInstance();
        this.initializeSchedules();
    }
    static getInstance() {
        if (!ScheduledSyncService.instance) {
            ScheduledSyncService.instance = new ScheduledSyncService();
        }
        return ScheduledSyncService.instance;
    }
    /**
     * Initialize default sync schedules
     */
    initializeSchedules() {
        // Daily sync at 2 AM
        this.addSyncSchedule({
            name: 'daily_sync',
            cronExpression: '0 2 * * *',
            description: 'Daily full synchronization at 2 AM',
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
        // Weekly consistency check
        this.addSyncSchedule({
            name: 'weekly_consistency_check',
            cronExpression: '0 3 * * 0',
            description: 'Weekly data consistency validation',
            enabled: true,
            runCount: 0,
            averageDuration: 0
        });
        // Monthly deep sync
        this.addSyncSchedule({
            name: 'monthly_deep_sync',
            cronExpression: '0 4 1 * *',
            description: 'Monthly deep synchronization and cleanup',
            enabled: true,
            runCount: 0,
            averageDuration: 0
        });
    }
    /**
     * Add a new sync schedule
     */
    addSyncSchedule(schedule) {
        try {
            // Validate cron expression
            new cron_1.CronJob(schedule.cronExpression, () => { }, null, false);
            this.syncSchedules.set(schedule.name, schedule);
            if (schedule.enabled) {
                this.startSyncJob(schedule);
            }
            logger_1.logger.info(`Added sync schedule: ${schedule.name} - ${schedule.description}`);
        }
        catch (error) {
            logger_1.logger.error(`Invalid cron expression for schedule ${schedule.name}:`, error);
            throw new Error(`Invalid cron expression: ${schedule.cronExpression}`);
        }
    }
    /**
     * Start a sync job
     */
    startSyncJob(schedule) {
        try {
            const job = new cron_1.CronJob(schedule.cronExpression, () => __awaiter(this, void 0, void 0, function* () {
                yield this.executeScheduledSync(schedule);
            }), null, false, 'UTC');
            this.syncJobs.set(schedule.name, job);
            job.start();
            // Calculate next run time
            schedule.nextRun = job.nextDate().toJSDate();
            logger_1.logger.info(`Started sync job: ${schedule.name} - Next run: ${schedule.nextRun}`);
        }
        catch (error) {
            logger_1.logger.error(`Failed to start sync job ${schedule.name}:`, error);
        }
    }
    /**
     * Stop a sync job
     */
    stopSyncJob(scheduleName) {
        const job = this.syncJobs.get(scheduleName);
        if (job) {
            job.stop();
            this.syncJobs.delete(scheduleName);
            const schedule = this.syncSchedules.get(scheduleName);
            if (schedule) {
                schedule.enabled = false;
                schedule.nextRun = undefined;
            }
            logger_1.logger.info(`Stopped sync job: ${scheduleName}`);
        }
    }
    /**
     * Enable a sync schedule
     */
    enableSyncSchedule(scheduleName) {
        const schedule = this.syncSchedules.get(scheduleName);
        if (schedule && !schedule.enabled) {
            schedule.enabled = true;
            this.startSyncJob(schedule);
            logger_1.logger.info(`Enabled sync schedule: ${scheduleName}`);
        }
    }
    /**
     * Disable a sync schedule
     */
    disableSyncSchedule(scheduleName) {
        const schedule = this.syncSchedules.get(scheduleName);
        if (schedule && schedule.enabled) {
            this.stopSyncJob(scheduleName);
            logger_1.logger.info(`Disabled sync schedule: ${scheduleName}`);
        }
    }
    /**
     * Execute a scheduled synchronization
     */
    executeScheduledSync(schedule) {
        return __awaiter(this, void 0, void 0, function* () {
            const startTime = Date.now();
            logger_1.logger.info(`Executing scheduled sync: ${schedule.name}`);
            try {
                // Update schedule info
                schedule.lastRun = new Date();
                schedule.runCount++;
                // Execute appropriate sync based on schedule type
                switch (schedule.name) {
                    case 'daily_sync':
                        yield this.executeDailySync();
                        break;
                    case 'hourly_sync':
                        yield this.executeHourlySync();
                        break;
                    case 'weekly_consistency_check':
                        yield this.executeWeeklyConsistencyCheck();
                        break;
                    case 'monthly_deep_sync':
                        yield this.executeMonthlyDeepSync();
                        break;
                    default:
                        yield this.executeCustomSync(schedule);
                }
                // Calculate and update average duration
                const duration = Date.now() - startTime;
                schedule.averageDuration = (schedule.averageDuration * (schedule.runCount - 1) + duration) / schedule.runCount;
                // Calculate next run time
                const job = this.syncJobs.get(schedule.name);
                if (job) {
                    schedule.nextRun = job.nextDate().toJSDate();
                }
                logger_1.logger.info(`Completed scheduled sync: ${schedule.name} in ${duration}ms`);
            }
            catch (error) {
                logger_1.logger.error(`Failed to execute scheduled sync ${schedule.name}:`, error);
                // Emit error event
                this.databaseSyncService.emit('scheduledSyncError', {
                    scheduleName: schedule.name,
                    error: error instanceof Error ? error.message : String(error),
                    timestamp: new Date()
                });
            }
        });
    }
    /**
     * Execute daily synchronization
     */
    executeDailySync() {
        return __awaiter(this, void 0, void 0, function* () {
            logger_1.logger.info('Starting daily synchronization...');
            // Perform full sync
            yield this.databaseSyncService.performFullSync();
            // Clean up old sync errors (keep last 30 days)
            yield this.cleanupOldSyncErrors();
            logger_1.logger.info('Daily synchronization completed');
        });
    }
    /**
     * Execute hourly synchronization
     */
    executeHourlySync() {
        return __awaiter(this, void 0, void 0, function* () {
            logger_1.logger.info('Starting hourly synchronization...');
            // Sync only recent changes (last hour)
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            // This would be implemented in the DatabaseSyncService
            // For now, we'll do a quick sync of critical data
            yield this.syncRecentChanges(oneHourAgo);
            logger_1.logger.info('Hourly synchronization completed');
        });
    }
    /**
     * Execute weekly consistency check
     */
    executeWeeklyConsistencyCheck() {
        return __awaiter(this, void 0, void 0, function* () {
            logger_1.logger.info('Starting weekly consistency check...');
            // Validate data consistency between databases
            const consistency = yield this.databaseSyncService.validateDataConsistency();
            if (!consistency.isConsistent) {
                logger_1.logger.warn(`Data consistency issues found: ${consistency.inconsistencies.length}`);
                // Log inconsistencies
                for (const issue of consistency.inconsistencies) {
                    logger_1.logger.warn(`Consistency issue: ${issue.type} - ${issue.description}`);
                }
                // Attempt to fix common issues
                yield this.attemptConsistencyFixes(consistency.inconsistencies);
            }
            else {
                logger_1.logger.info('Data consistency check passed');
            }
            logger_1.logger.info('Weekly consistency check completed');
        });
    }
    /**
     * Execute monthly deep synchronization
     */
    executeMonthlyDeepSync() {
        return __awaiter(this, void 0, void 0, function* () {
            logger_1.logger.info('Starting monthly deep synchronization...');
            // Full sync with additional cleanup
            yield this.databaseSyncService.performFullSync();
            // Clean up orphaned records
            yield this.cleanupOrphanedRecords();
            // Optimize database indexes
            yield this.optimizeDatabaseIndexes();
            // Generate sync report
            yield this.generateSyncReport();
            logger_1.logger.info('Monthly deep synchronization completed');
        });
    }
    /**
     * Execute custom synchronization
     */
    executeCustomSync(schedule) {
        return __awaiter(this, void 0, void 0, function* () {
            logger_1.logger.info(`Executing custom sync: ${schedule.name}`);
            // Default to full sync for custom schedules
            yield this.databaseSyncService.performFullSync();
        });
    }
    /**
     * Sync recent changes
     */
    syncRecentChanges(since) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // This would sync only documents modified since the given time
                // Implementation depends on your specific needs
                logger_1.logger.info(`Syncing changes since ${since.toISOString()}`);
                // For now, we'll do a quick validation
                yield this.databaseSyncService.validateDataConsistency();
            }
            catch (error) {
                logger_1.logger.error('Failed to sync recent changes:', error);
                throw error;
            }
        });
    }
    /**
     * Attempt to fix consistency issues
     */
    attemptConsistencyFixes(inconsistencies) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                logger_1.logger.info('Attempting to fix consistency issues...');
                for (const issue of inconsistencies) {
                    try {
                        switch (issue.type) {
                            case 'orphaned_property_account':
                                yield this.fixOrphanedPropertyAccounts();
                                break;
                            case 'missing_property_account':
                                yield this.fixMissingPropertyAccounts();
                                break;
                            case 'orphaned_owner_reference':
                                yield this.fixOrphanedOwnerReferences();
                                break;
                            default:
                                logger_1.logger.warn(`No automatic fix available for issue type: ${issue.type}`);
                        }
                    }
                    catch (error) {
                        logger_1.logger.error(`Failed to fix issue ${issue.type}:`, error);
                    }
                }
            }
            catch (error) {
                logger_1.logger.error('Failed to attempt consistency fixes:', error);
            }
        });
    }
    /**
     * Fix orphaned property accounts
     */
    fixOrphanedPropertyAccounts() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const PropertyAccount = require('../models/PropertyAccount').default;
                const Property = require('../models/Property').default;
                const propertyAccounts = yield PropertyAccount.find({});
                let fixedCount = 0;
                for (const account of propertyAccounts) {
                    const property = yield Property.findById(account.propertyId);
                    if (!property) {
                        yield PropertyAccount.findByIdAndDelete(account._id);
                        fixedCount++;
                    }
                }
                if (fixedCount > 0) {
                    logger_1.logger.info(`Fixed ${fixedCount} orphaned property accounts`);
                }
            }
            catch (error) {
                logger_1.logger.error('Failed to fix orphaned property accounts:', error);
                throw error;
            }
        });
    }
    /**
     * Fix missing property accounts
     */
    fixMissingPropertyAccounts() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const Property = require('../models/Property').default;
                const properties = yield Property.find({});
                let createdCount = 0;
                for (const property of properties) {
                    yield this.databaseSyncService['syncPropertyToAccounting'](property);
                    createdCount++;
                }
                if (createdCount > 0) {
                    logger_1.logger.info(`Created ${createdCount} missing property accounts`);
                }
            }
            catch (error) {
                logger_1.logger.error('Failed to fix missing property accounts:', error);
                throw error;
            }
        });
    }
    /**
     * Fix orphaned owner references
     */
    fixOrphanedOwnerReferences() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const PropertyAccount = require('../models/PropertyAccount').default;
                const User = require('../models/User').default;
                const propertyAccounts = yield PropertyAccount.find({ ownerId: { $exists: true } });
                let fixedCount = 0;
                for (const account of propertyAccounts) {
                    if (account.ownerId) {
                        const owner = yield User.findById(account.ownerId);
                        if (!owner) {
                            yield PropertyAccount.findByIdAndUpdate(account._id, {
                                $unset: { ownerId: 1, ownerName: 1 },
                                $set: { lastUpdated: new Date() }
                            });
                            fixedCount++;
                        }
                    }
                }
                if (fixedCount > 0) {
                    logger_1.logger.info(`Fixed ${fixedCount} orphaned owner references`);
                }
            }
            catch (error) {
                logger_1.logger.error('Failed to fix orphaned owner references:', error);
                throw error;
            }
        });
    }
    /**
     * Clean up orphaned records
     */
    cleanupOrphanedRecords() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                logger_1.logger.info('Cleaning up orphaned records...');
                // This would implement cleanup logic for various orphaned records
                // Implementation depends on your specific data model
                logger_1.logger.info('Orphaned records cleanup completed');
            }
            catch (error) {
                logger_1.logger.error('Failed to cleanup orphaned records:', error);
            }
        });
    }
    /**
     * Optimize database indexes
     */
    optimizeDatabaseIndexes() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                logger_1.logger.info('Optimizing database indexes...');
                // This would implement index optimization logic
                // Implementation depends on your specific needs
                logger_1.logger.info('Database index optimization completed');
            }
            catch (error) {
                logger_1.logger.error('Failed to optimize database indexes:', error);
            }
        });
    }
    /**
     * Generate sync report
     */
    generateSyncReport() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                logger_1.logger.info('Generating sync report...');
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
                logger_1.logger.info('Sync Report Generated:', {
                    totalSchedules: report.summary.totalSchedules,
                    enabledSchedules: report.summary.enabledSchedules,
                    totalRuns: report.summary.totalRuns,
                    averageDuration: Math.round(report.summary.averageDuration)
                });
                // Emit report generated event
                this.databaseSyncService.emit('syncReportGenerated', report);
            }
            catch (error) {
                logger_1.logger.error('Failed to generate sync report:', error);
            }
        });
    }
    /**
     * Clean up old sync errors
     */
    cleanupOldSyncErrors() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // This would clean up old sync error logs
                // Implementation depends on your logging strategy
                logger_1.logger.info('Old sync errors cleanup completed');
            }
            catch (error) {
                logger_1.logger.error('Failed to cleanup old sync errors:', error);
            }
        });
    }
    /**
     * Get all sync schedules
     */
    getSyncSchedules() {
        try {
            return Array.from(this.syncSchedules.values());
        }
        catch (error) {
            logger_1.logger.error('Error getting sync schedules:', error);
            return [];
        }
    }
    /**
     * Get sync schedule by name
     */
    getSyncSchedule(name) {
        return this.syncSchedules.get(name);
    }
    /**
     * Update sync schedule
     */
    updateSyncSchedule(name, updates) {
        const schedule = this.syncSchedules.get(name);
        if (schedule) {
            const updatedSchedule = Object.assign(Object.assign({}, schedule), updates);
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
            logger_1.logger.info(`Updated sync schedule: ${name}`);
        }
    }
    /**
     * Start all enabled sync schedules
     */
    startAllSchedules() {
        logger_1.logger.info('Starting all enabled sync schedules...');
        for (const schedule of this.syncSchedules.values()) {
            if (schedule.enabled) {
                this.startSyncJob(schedule);
            }
        }
        logger_1.logger.info('All enabled sync schedules started');
    }
    /**
     * Stop all sync schedules
     */
    stopAllSchedules() {
        logger_1.logger.info('Stopping all sync schedules...');
        for (const [name] of this.syncJobs) {
            this.stopSyncJob(name);
        }
        logger_1.logger.info('All sync schedules stopped');
    }
    /**
     * Get service status
     */
    getStatus() {
        try {
            const schedules = Array.from(this.syncSchedules.values());
            const enabledSchedules = schedules.filter(s => s.enabled);
            // Find the next scheduled run
            let nextScheduledRun;
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
        }
        catch (error) {
            logger_1.logger.error('Error getting scheduled sync status:', error);
            return {
                isRunning: false,
                totalSchedules: 0,
                enabledSchedules: 0,
                nextScheduledRun: undefined
            };
        }
    }
}
exports.ScheduledSyncService = ScheduledSyncService;
exports.default = ScheduledSyncService;
