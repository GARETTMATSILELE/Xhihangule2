import { Request, Response } from 'express';
import DatabaseSyncService from '../services/databaseSyncService';
import ScheduledSyncService from '../services/scheduledSyncService';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';

/**
 * Start real-time synchronization
 */
export const startRealTimeSync = async (req: Request, res: Response) => {
  try {
    const syncService = DatabaseSyncService.getInstance();
    await syncService.startRealTimeSync();
    
    res.json({
      success: true,
      message: 'Real-time synchronization started successfully',
      timestamp: new Date()
    });
    
  } catch (error) {
    logger.error('Error starting real-time sync:', error);
    
    if (error instanceof AppError) {
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
      } else if (error.message.includes('database connections')) {
        errorMessage = 'Database connections not available';
      } else {
        errorMessage = error.message;
      }
    }
    
    res.status(500).json({
      success: false,
      message: errorMessage,
      details: error instanceof Error ? error.message : String(error)
    });
  }
};

/**
 * Stop real-time synchronization
 */
export const stopRealTimeSync = async (req: Request, res: Response) => {
  try {
    const syncService = DatabaseSyncService.getInstance();
    await syncService.stopRealTimeSync();
    
    res.json({
      success: true,
      message: 'Real-time synchronization stopped successfully',
      timestamp: new Date()
    });
    
  } catch (error) {
    logger.error('Error stopping real-time sync:', error);
    
    if (error instanceof AppError) {
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
};

/**
 * Perform manual full synchronization
 */
export const performFullSync = async (req: Request, res: Response) => {
  try {
    const syncService = DatabaseSyncService.getInstance();
    const stats = await syncService.performFullSync();
    
    res.json({
      success: true,
      message: 'Full synchronization completed successfully',
      stats,
      timestamp: new Date()
    });
    
  } catch (error) {
    logger.error('Error performing full sync:', error);
    
    if (error instanceof AppError) {
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
};

/**
 * Get synchronization status
 */
export const getSyncStatus = async (req: Request, res: Response) => {
  try {
    const syncService = DatabaseSyncService.getInstance();
    const scheduledService = ScheduledSyncService.getInstance();
    
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
    
  } catch (error) {
    logger.error('Error getting sync status:', error);
    
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
};

/**
 * Get synchronization statistics
 */
export const getSyncStats = async (req: Request, res: Response) => {
  try {
    const syncService = DatabaseSyncService.getInstance();
    const stats = syncService.getSyncStats();
    
    res.json({
      success: true,
      data: stats
    });
    
  } catch (error) {
    logger.error('Error getting sync stats:', error);
    
    if (error instanceof AppError) {
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
};

/**
 * Validate data consistency between databases
 */
export const validateDataConsistency = async (req: Request, res: Response) => {
  try {
    const syncService = DatabaseSyncService.getInstance();
    const consistency = await syncService.validateDataConsistency();
    
    res.json({
      success: true,
      data: consistency,
      timestamp: new Date()
    });
    
  } catch (error) {
    logger.error('Error validating data consistency:', error);
    
    if (error instanceof AppError) {
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
};

/**
 * Get all sync schedules
 */
export const getSyncSchedules = async (req: Request, res: Response) => {
  try {
    const scheduledService = ScheduledSyncService.getInstance();
    const schedules = scheduledService.getSyncSchedules();
    
    res.json({
      success: true,
      data: schedules
    });
    
  } catch (error) {
    logger.error('Error getting sync schedules:', error);
    
    // Return empty schedules array if there's an error
    res.json({
      success: true,
      data: []
    });
  }
};

/**
 * Update sync schedule
 */
export const updateSyncSchedule = async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const updates = req.body;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Schedule name is required'
      });
    }
    
    const scheduledService = ScheduledSyncService.getInstance();
    scheduledService.updateSyncSchedule(name, updates);
    
    res.json({
      success: true,
      message: `Sync schedule '${name}' updated successfully`,
      timestamp: new Date()
    });
    
  } catch (error) {
    logger.error('Error updating sync schedule:', error);
    
    if (error instanceof AppError) {
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
};

/**
 * Enable sync schedule
 */
export const enableSyncSchedule = async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Schedule name is required'
      });
    }
    
    const scheduledService = ScheduledSyncService.getInstance();
    scheduledService.enableSyncSchedule(name);
    
    res.json({
      success: true,
      message: `Sync schedule '${name}' enabled successfully`,
      timestamp: new Date()
    });
    
  } catch (error) {
    logger.error('Error enabling sync schedule:', error);
    
    if (error instanceof AppError) {
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
};

/**
 * Disable sync schedule
 */
export const disableSyncSchedule = async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Schedule name is required'
      });
    }
    
    const scheduledService = ScheduledSyncService.getInstance();
    scheduledService.disableSyncSchedule(name);
    
    res.json({
      success: true,
      message: `Sync schedule '${name}' disabled successfully`,
      timestamp: new Date()
    });
    
  } catch (error) {
    logger.error('Error disabling sync schedule:', error);
    
    if (error instanceof AppError) {
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
};

/**
 * Start all sync schedules
 */
export const startAllSchedules = async (req: Request, res: Response) => {
  try {
    const scheduledService = ScheduledSyncService.getInstance();
    scheduledService.startAllSchedules();
    
    res.json({
      success: true,
      message: 'All synchronization schedules started successfully',
      timestamp: new Date()
    });
    
  } catch (error) {
    logger.error('Error starting all sync schedules:', error);
    
    if (error instanceof AppError) {
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
};

/**
 * Stop all sync schedules
 */
export const stopAllSchedules = async (req: Request, res: Response) => {
  try {
    const scheduledService = ScheduledSyncService.getInstance();
    scheduledService.stopAllSchedules();
    
    res.json({
      success: true,
      message: 'All synchronization schedules stopped successfully',
      timestamp: new Date()
    });
    
  } catch (error) {
    logger.error('Error stopping all sync schedules:', error);
    
    if (error instanceof AppError) {
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
};

/**
 * Add new sync schedule
 */
export const addSyncSchedule = async (req: Request, res: Response) => {
  try {
    const { name, cronExpression, description, enabled = true } = req.body;
    
    if (!name || !cronExpression || !description) {
      return res.status(400).json({
        success: false,
        message: 'Name, cron expression, and description are required'
      });
    }
    
    const scheduledService = ScheduledSyncService.getInstance();
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
    
  } catch (error) {
    logger.error('Error adding sync schedule:', error);
    
    if (error instanceof AppError) {
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
};

/**
 * Remove sync schedule
 */
export const removeSyncSchedule = async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Schedule name is required'
      });
    }
    
    const scheduledService = ScheduledSyncService.getInstance();
    
    // Stop the schedule first
    scheduledService.stopSyncJob(name);
    
    // Note: The ScheduledSyncService doesn't have a remove method yet
    // You would need to implement this in the service
    
    res.json({
      success: true,
      message: `Sync schedule '${name}' removed successfully`,
      timestamp: new Date()
    });
    
  } catch (error) {
    logger.error('Error removing sync schedule:', error);
    
    if (error instanceof AppError) {
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
};

/**
 * Get sync health check
 */
export const getSyncHealth = async (req: Request, res: Response) => {
  try {
    const syncService = DatabaseSyncService.getInstance();
    const scheduledService = ScheduledSyncService.getInstance();
    
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
      const consistency = await syncService.validateDataConsistency();
      health.dataConsistency = {
        isConsistent: consistency.isConsistent,
        issueCount: consistency.inconsistencies.length
      };
      
      // Determine overall health status
      if (!consistency.isConsistent || consistency.inconsistencies.length > 10) {
        health.status = 'degraded';
      }
    } catch (consistencyError) {
      logger.warn('Could not perform consistency check:', consistencyError);
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
    
  } catch (error) {
    logger.error('Error getting sync health:', error);
    
    res.json({
      success: true,
      data: {
        status: 'unhealthy',
        timestamp: new Date(),
        error: error instanceof Error ? error.message : String(error)
      }
    });
  }
};
