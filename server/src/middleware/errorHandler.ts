import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export class AppError extends Error {
  statusCode: number;
  status: string;
  isOperational: boolean;
  code?: string;
  details?: any;

  constructor(message: string, statusCode: number, code?: string, details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.status = 'error';
    this.isOperational = true;
    this.code = code;
    this.details = details;
    this.name = 'AppError';

    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Log error details
  logger.error('Error occurred:', {
    name: err.name,
    message: err.message,
    stack: err.stack,
    isOperational: err instanceof AppError ? err.isOperational : false,
    statusCode: err instanceof AppError ? err.statusCode : 500,
    code: err instanceof AppError ? err.code : 'INTERNAL_SERVER_ERROR',
    details: err instanceof AppError ? err.details : undefined,
    path: req.path,
    method: req.method
  });

  // Handle operational errors (AppError)
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
      code: err.code,
      ...(process.env.NODE_ENV === 'development' && { 
        stack: err.stack,
        details: err.details
      })
    });
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      status: 'error',
      message: 'Invalid token',
      code: 'INVALID_TOKEN'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      status: 'error',
      message: 'Token expired',
      code: 'TOKEN_EXPIRED'
    });
  }

  // Handle MongoDB duplicate key errors
  if (err.name === 'MongoError' && (err as any).code === 11000) {
    return res.status(400).json({
      status: 'error',
      message: 'Duplicate field value entered',
      code: 'DUPLICATE_ENTRY'
    });
  }

  // Handle validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      status: 'error',
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: Object.values((err as any).errors).map((e: any) => e.message)
    });
  }

  // Handle unknown errors
  return res.status(500).json({
    status: 'error',
    message: 'Something went wrong',
    code: 'INTERNAL_SERVER_ERROR',
    ...(process.env.NODE_ENV === 'development' && { 
      stack: err.stack,
      error: err.message
    })
  });
}; 