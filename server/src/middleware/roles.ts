import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';

export const isAgent = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401);
  }

  if (req.user.role !== 'agent') {
    throw new AppError('Access denied. Agent role required.', 403);
  }

  next();
};

export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401);
  }

  if (req.user.role !== 'admin') {
    throw new AppError('Access denied. Admin role required.', 403);
  }

  next();
};

export const isOwner = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401);
  }

  if (req.user.role !== 'owner') {
    throw new AppError('Access denied. Owner role required.', 403);
  }

  next();
};

export const isAccountant = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401);
  }

  if (req.user.role !== 'accountant') {
    throw new AppError('Access denied. Accountant role required.', 403);
  }

  next();
};

export const canCreateProperty = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401);
  }

  if (!['admin', 'owner', 'agent'].includes(req.user.role)) {
    throw new AppError('Access denied. Admin, Owner, or Agent role required to create properties.', 403);
  }

  next();
};

export const canManagePayments = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401);
  }

  if (!['admin', 'accountant', 'agent'].includes(req.user.role)) {
    throw new AppError('Access denied. Admin, Accountant, or Agent role required to manage payments.', 403);
  }

  next();
}; 