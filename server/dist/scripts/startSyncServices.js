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
exports.checkSyncServicesHealth = exports.shutdownSyncServices = exports.initializeSyncServices = void 0;
const databaseSyncService_1 = __importDefault(require("../services/databaseSyncService"));
const scheduledSyncService_1 = __importDefault(require("../services/scheduledSyncService"));
const logger_1 = require("../utils/logger");
const maintenanceJobQueueService_1 = __importDefault(require("../services/maintenanceJobQueueService"));
/**
 * Initialize and start database synchronization services
 */
const initializeSyncServices = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        logger_1.logger.info('🚀 Initializing database synchronization services...');
        // Initialize the scheduled sync service
        const scheduledService = scheduledSyncService_1.default.getInstance();
        // Start all enabled schedules
        scheduledService.startAllSchedules();
        maintenanceJobQueueService_1.default.start();
        logger_1.logger.info('✅ Scheduled synchronization services started');
        // Optionally start real-time sync (can be controlled via API)
        // const realTimeService = DatabaseSyncService.getInstance();
        // await realTimeService.startRealTimeSync();
        logger_1.logger.info('✅ Database synchronization services initialized successfully');
    }
    catch (error) {
        logger_1.logger.error('❌ Failed to initialize sync services:', error);
        throw error;
    }
});
exports.initializeSyncServices = initializeSyncServices;
/**
 * Gracefully shutdown sync services
 */
const shutdownSyncServices = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        logger_1.logger.info('🛑 Shutting down database synchronization services...');
        // Stop real-time sync if running
        const realTimeService = databaseSyncService_1.default.getInstance();
        yield realTimeService.stopRealTimeSync();
        // Stop all scheduled sync jobs
        const scheduledService = scheduledSyncService_1.default.getInstance();
        scheduledService.stopAllSchedules();
        maintenanceJobQueueService_1.default.stop();
        logger_1.logger.info('✅ Database synchronization services shut down successfully');
    }
    catch (error) {
        logger_1.logger.error('❌ Error shutting down sync services:', error);
    }
});
exports.shutdownSyncServices = shutdownSyncServices;
/**
 * Check if sync services are healthy
 */
const checkSyncServicesHealth = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const realTimeService = databaseSyncService_1.default.getInstance();
        const scheduledService = scheduledSyncService_1.default.getInstance();
        const realTimeStatus = realTimeService.getSyncStatus();
        const scheduledStatus = scheduledService.getStatus();
        // Basic health check
        const isHealthy = scheduledStatus.enabledSchedules > 0;
        if (isHealthy) {
            logger_1.logger.info('✅ Sync services health check passed');
        }
        else {
            logger_1.logger.warn('⚠️ Sync services health check failed - no enabled schedules');
        }
        return isHealthy;
    }
    catch (error) {
        logger_1.logger.error('❌ Sync services health check failed:', error);
        return false;
    }
});
exports.checkSyncServicesHealth = checkSyncServicesHealth;
exports.default = {
    initializeSyncServices: exports.initializeSyncServices,
    shutdownSyncServices: exports.shutdownSyncServices,
    checkSyncServicesHealth: exports.checkSyncServicesHealth
};
