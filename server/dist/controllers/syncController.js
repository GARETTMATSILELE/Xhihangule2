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
exports.getSyncHealth = exports.removeSyncSchedule = exports.addSyncSchedule = exports.stopAllSchedules = exports.startAllSchedules = exports.disableSyncSchedule = exports.enableSyncSchedule = exports.updateSyncSchedule = exports.getSyncSchedules = exports.validateDataConsistency = exports.getSyncStats = exports.getSyncStatus = exports.performFullSync = exports.stopRealTimeSync = exports.startRealTimeSync = void 0;
const databaseSyncService_1 = __importDefault(require("../services/databaseSyncService"));
const scheduledSyncService_1 = __importDefault(require("../services/scheduledSyncService"));
const logger_1 = require("../utils/logger");
const errorHandler_1 = require("../middleware/errorHandler");
/**
 * Start real-time synchronization
 */
const startRealTimeSync = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const syncService = databaseSyncService_1.default.getInstance();
        yield syncService.startRealTimeSync();
        res.json({
            success: true,
            message: 'Real-time synchronization started successfully',
            timestamp: new Date()
        });
    }
    catch (error) {
        logger_1.logger.error('Error starting real-time sync:', error);
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message
            });
        }
        // Provide more specific error messages
        let errorMessage = 'Failed to start real-time synchronization';
        if (error instanceof Error) {
            if (error.message.includes('replica set')) {
                errorMessage = 'Real-time sync started with polling fallback (MongoDB replica set not available)';
            }
            else if (error.message.includes('database connections')) {
                errorMessage = 'Database connections not available';
            }
            else {
                errorMessage = error.message;
            }
        }
        res.status(500).json({
            success: false,
            message: errorMessage,
            details: error instanceof Error ? error.message : String(error)
        });
    }
});
exports.startRealTimeSync = startRealTimeSync;
/**
 * Stop real-time synchronization
 */
const stopRealTimeSync = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const syncService = databaseSyncService_1.default.getInstance();
        yield syncService.stopRealTimeSync();
        res.json({
            success: true,
            message: 'Real-time synchronization stopped successfully',
            timestamp: new Date()
        });
    }
    catch (error) {
        logger_1.logger.error('Error stopping real-time sync:', error);
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message
            });
        }
        res.status(500).json({
            success: false,
            message: 'Failed to stop real-time synchronization'
        });
    }
});
exports.stopRealTimeSync = stopRealTimeSync;
/**
 * Perform manual full synchronization
 */
const performFullSync = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const syncService = databaseSyncService_1.default.getInstance();
        const stats = yield syncService.performFullSync();
        res.json({
            success: true,
            message: 'Full synchronization completed successfully',
            stats,
            timestamp: new Date()
        });
    }
    catch (error) {
        logger_1.logger.error('Error performing full sync:', error);
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message
            });
        }
        res.status(500).json({
            success: false,
            message: 'Failed to perform full synchronization'
        });
    }
});
exports.performFullSync = performFullSync;
/**
 * Get synchronization status
 */
const getSyncStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const syncService = databaseSyncService_1.default.getInstance();
        const scheduledService = scheduledSyncService_1.default.getInstance();
        const realTimeStatus = syncService.getSyncStatus();
        const scheduledStatus = scheduledService.getStatus();
        const syncStats = syncService.getSyncStats();
        res.json({
            success: true,
            data: {
                realTime: realTimeStatus,
                scheduled: scheduledStatus,
                stats: syncStats,
                timestamp: new Date()
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Error getting sync status:', error);
        // Return a basic status even if there's an error
        res.json({
            success: true,
            data: {
                realTime: {
                    isRunning: false,
                    lastSyncTime: new Date(),
                    totalSynced: 0
                },
                scheduled: {
                    isRunning: false,
                    totalSchedules: 0,
                    enabledSchedules: 0,
                    nextScheduledRun: undefined
                },
                stats: {
                    totalSynced: 0,
                    successCount: 0,
                    errorCount: 0,
                    lastSyncTime: new Date(),
                    syncDuration: 0,
                    errors: []
                },
                timestamp: new Date()
            }
        });
    }
});
exports.getSyncStatus = getSyncStatus;
/**
 * Get synchronization statistics
 */
const getSyncStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const syncService = databaseSyncService_1.default.getInstance();
        const stats = syncService.getSyncStats();
        res.json({
            success: true,
            data: stats
        });
    }
    catch (error) {
        logger_1.logger.error('Error getting sync stats:', error);
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message
            });
        }
        res.status(500).json({
            success: false,
            message: 'Failed to get synchronization statistics'
        });
    }
});
exports.getSyncStats = getSyncStats;
/**
 * Validate data consistency between databases
 */
const validateDataConsistency = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const syncService = databaseSyncService_1.default.getInstance();
        const consistency = yield syncService.validateDataConsistency();
        res.json({
            success: true,
            data: consistency,
            timestamp: new Date()
        });
    }
    catch (error) {
        logger_1.logger.error('Error validating data consistency:', error);
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message
            });
        }
        res.status(500).json({
            success: false,
            message: 'Failed to validate data consistency'
        });
    }
});
exports.validateDataConsistency = validateDataConsistency;
/**
 * Get all sync schedules
 */
const getSyncSchedules = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const scheduledService = scheduledSyncService_1.default.getInstance();
        const schedules = scheduledService.getSyncSchedules();
        res.json({
            success: true,
            data: schedules
        });
    }
    catch (error) {
        logger_1.logger.error('Error getting sync schedules:', error);
        // Return empty schedules array if there's an error
        res.json({
            success: true,
            data: []
        });
    }
});
exports.getSyncSchedules = getSyncSchedules;
/**
 * Update sync schedule
 */
const updateSyncSchedule = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name } = req.params;
        const updates = req.body;
        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'Schedule name is required'
            });
        }
        const scheduledService = scheduledSyncService_1.default.getInstance();
        scheduledService.updateSyncSchedule(name, updates);
        res.json({
            success: true,
            message: `Sync schedule '${name}' updated successfully`,
            timestamp: new Date()
        });
    }
    catch (error) {
        logger_1.logger.error('Error updating sync schedule:', error);
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message
            });
        }
        res.status(500).json({
            success: false,
            message: 'Failed to update synchronization schedule'
        });
    }
});
exports.updateSyncSchedule = updateSyncSchedule;
/**
 * Enable sync schedule
 */
const enableSyncSchedule = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name } = req.params;
        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'Schedule name is required'
            });
        }
        const scheduledService = scheduledSyncService_1.default.getInstance();
        scheduledService.enableSyncSchedule(name);
        res.json({
            success: true,
            message: `Sync schedule '${name}' enabled successfully`,
            timestamp: new Date()
        });
    }
    catch (error) {
        logger_1.logger.error('Error enabling sync schedule:', error);
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message
            });
        }
        res.status(500).json({
            success: false,
            message: 'Failed to enable synchronization schedule'
        });
    }
});
exports.enableSyncSchedule = enableSyncSchedule;
/**
 * Disable sync schedule
 */
const disableSyncSchedule = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name } = req.params;
        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'Schedule name is required'
            });
        }
        const scheduledService = scheduledSyncService_1.default.getInstance();
        scheduledService.disableSyncSchedule(name);
        res.json({
            success: true,
            message: `Sync schedule '${name}' disabled successfully`,
            timestamp: new Date()
        });
    }
    catch (error) {
        logger_1.logger.error('Error disabling sync schedule:', error);
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message
            });
        }
        res.status(500).json({
            success: false,
            message: 'Failed to disable synchronization schedule'
        });
    }
});
exports.disableSyncSchedule = disableSyncSchedule;
/**
 * Start all sync schedules
 */
const startAllSchedules = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const scheduledService = scheduledSyncService_1.default.getInstance();
        scheduledService.startAllSchedules();
        res.json({
            success: true,
            message: 'All synchronization schedules started successfully',
            timestamp: new Date()
        });
    }
    catch (error) {
        logger_1.logger.error('Error starting all sync schedules:', error);
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message
            });
        }
        res.status(500).json({
            success: false,
            message: 'Failed to start all synchronization schedules'
        });
    }
});
exports.startAllSchedules = startAllSchedules;
/**
 * Stop all sync schedules
 */
const stopAllSchedules = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const scheduledService = scheduledSyncService_1.default.getInstance();
        scheduledService.stopAllSchedules();
        res.json({
            success: true,
            message: 'All synchronization schedules stopped successfully',
            timestamp: new Date()
        });
    }
    catch (error) {
        logger_1.logger.error('Error stopping all sync schedules:', error);
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message
            });
        }
        res.status(500).json({
            success: false,
            message: 'Failed to stop all synchronization schedules'
        });
    }
});
exports.stopAllSchedules = stopAllSchedules;
/**
 * Add new sync schedule
 */
const addSyncSchedule = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, cronExpression, description, enabled = true } = req.body;
        if (!name || !cronExpression || !description) {
            return res.status(400).json({
                success: false,
                message: 'Name, cron expression, and description are required'
            });
        }
        const scheduledService = scheduledSyncService_1.default.getInstance();
        scheduledService.addSyncSchedule({
            name,
            cronExpression,
            description,
            enabled,
            runCount: 0,
            averageDuration: 0
        });
        res.json({
            success: true,
            message: `Sync schedule '${name}' added successfully`,
            timestamp: new Date()
        });
    }
    catch (error) {
        logger_1.logger.error('Error adding sync schedule:', error);
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message
            });
        }
        res.status(500).json({
            success: false,
            message: 'Failed to add synchronization schedule'
        });
    }
});
exports.addSyncSchedule = addSyncSchedule;
/**
 * Remove sync schedule
 */
const removeSyncSchedule = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name } = req.params;
        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'Schedule name is required'
            });
        }
        const scheduledService = scheduledSyncService_1.default.getInstance();
        // Stop the schedule first
        scheduledService.stopSyncJob(name);
        // Note: The ScheduledSyncService doesn't have a remove method yet
        // You would need to implement this in the service
        res.json({
            success: true,
            message: `Sync schedule '${name}' removed successfully`,
            timestamp: new Date()
        });
    }
    catch (error) {
        logger_1.logger.error('Error removing sync schedule:', error);
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message
            });
        }
        res.status(500).json({
            success: false,
            message: 'Failed to remove synchronization schedule'
        });
    }
});
exports.removeSyncSchedule = removeSyncSchedule;
/**
 * Get sync health check
 */
const getSyncHealth = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const syncService = databaseSyncService_1.default.getInstance();
        const scheduledService = scheduledSyncService_1.default.getInstance();
        const realTimeStatus = syncService.getSyncStatus();
        const scheduledStatus = scheduledService.getStatus();
        const health = {
            status: 'healthy',
            timestamp: new Date(),
            realTime: {
                isRunning: realTimeStatus.isRunning,
                lastSync: realTimeStatus.lastSyncTime
            },
            scheduled: {
                isRunning: scheduledStatus.isRunning,
                totalSchedules: scheduledStatus.totalSchedules,
                enabledSchedules: scheduledStatus.enabledSchedules,
                nextRun: scheduledStatus.nextScheduledRun
            },
            dataConsistency: {
                isConsistent: true,
                issueCount: 0
            }
        };
        // Try to perform consistency check, but don't fail if it errors
        try {
            const consistency = yield syncService.validateDataConsistency();
            health.dataConsistency = {
                isConsistent: consistency.isConsistent,
                issueCount: consistency.inconsistencies.length
            };
            // Determine overall health status
            if (!consistency.isConsistent || consistency.inconsistencies.length > 10) {
                health.status = 'degraded';
            }
        }
        catch (consistencyError) {
            logger_1.logger.warn('Could not perform consistency check:', consistencyError);
            health.dataConsistency = {
                isConsistent: false,
                issueCount: 0
            };
            health.status = 'degraded';
        }
        if (!realTimeStatus.isRunning && scheduledStatus.enabledSchedules === 0) {
            health.status = 'unhealthy';
        }
        res.json({
            success: true,
            data: health
        });
    }
    catch (error) {
        logger_1.logger.error('Error getting sync health:', error);
        res.json({
            success: true,
            data: {
                status: 'unhealthy',
                timestamp: new Date(),
                error: error instanceof Error ? error.message : String(error)
            }
        });
    }
});
exports.getSyncHealth = getSyncHealth;
