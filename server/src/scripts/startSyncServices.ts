import DatabaseSyncService from '../services/databaseSyncService';
import ScheduledSyncService from '../services/scheduledSyncService';
import { logger } from '../utils/logger';
import maintenanceJobQueueService from '../services/maintenanceJobQueueService';

/**
 * Initialize and start database synchronization services
 */
export const initializeSyncServices = async (): Promise<void> => {
  try {
    logger.info('🚀 Initializing database synchronization services...');

    // Initialize the scheduled sync service
    const scheduledService = ScheduledSyncService.getInstance();
    
    // Start all enabled schedules
    scheduledService.startAllSchedules();
    maintenanceJobQueueService.start();
    
    logger.info('✅ Scheduled synchronization services started');

    // Optionally start real-time sync (can be controlled via API)
    // const realTimeService = DatabaseSyncService.getInstance();
    // await realTimeService.startRealTimeSync();
    
    logger.info('✅ Database synchronization services initialized successfully');

  } catch (error) {
    logger.error('❌ Failed to initialize sync services:', error);
    throw error;
  }
};

/**
 * Gracefully shutdown sync services
 */
export const shutdownSyncServices = async (): Promise<void> => {
  try {
    logger.info('🛑 Shutting down database synchronization services...');

    // Stop real-time sync if running
    const realTimeService = DatabaseSyncService.getInstance();
    await realTimeService.stopRealTimeSync();

    // Stop all scheduled sync jobs
    const scheduledService = ScheduledSyncService.getInstance();
    scheduledService.stopAllSchedules();
    maintenanceJobQueueService.stop();

    logger.info('✅ Database synchronization services shut down successfully');

  } catch (error) {
    logger.error('❌ Error shutting down sync services:', error);
  }
};

/**
 * Check if sync services are healthy
 */
export const checkSyncServicesHealth = async (): Promise<boolean> => {
  try {
    const realTimeService = DatabaseSyncService.getInstance();
    const scheduledService = ScheduledSyncService.getInstance();

    const realTimeStatus = realTimeService.getSyncStatus();
    const scheduledStatus = scheduledService.getStatus();

    // Basic health check
    const isHealthy = scheduledStatus.enabledSchedules > 0;

    if (isHealthy) {
      logger.info('✅ Sync services health check passed');
    } else {
      logger.warn('⚠️ Sync services health check failed - no enabled schedules');
    }

    return isHealthy;

  } catch (error) {
    logger.error('❌ Sync services health check failed:', error);
    return false;
  }
};

export default {
  initializeSyncServices,
  shutdownSyncServices,
  checkSyncServicesHealth
};
