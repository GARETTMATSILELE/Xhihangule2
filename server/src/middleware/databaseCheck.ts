import { Request, Response, NextFunction } from 'express';
import { getDatabaseHealth } from '../config/database';

export const checkDatabaseConnection = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = getDatabaseHealth();
    
    if (!status.isConnected || !status.isHealthy) {
      return res.status(503).json({
        status: 'error',
        message: 'Database connection is not available',
        details: status
      });
    }
    
    next();
  } catch (error: any) {
    console.error('Database connection check failed:', error);
    res.status(503).json({
      status: 'error',
      message: 'Database connection check failed',
      error: error?.message || 'Unknown error'
    });
  }
}; 