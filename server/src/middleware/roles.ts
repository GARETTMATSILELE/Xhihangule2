import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';

export const isAgent = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401);
  }

  const roles = ((req.user as any).roles as string[] | undefined) || [req.user.role];
  if (!roles.some(r => ['agent', 'sales'].includes(r))) {
    throw new AppError('Access denied. Agent role required.', 403);
  }

  next();
};

export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401);
  }

  const roles = ((req.user as any).roles as string[] | undefined) || [req.user.role];
  if (!roles.includes('admin')) {
    throw new AppError('Access denied. Admin role required.', 403);
  }

  next();
};

export const isOwner = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401);
  }

  const roles = ((req.user as any).roles as string[] | undefined) || [req.user.role];
  if (!roles.includes('owner')) {
    throw new AppError('Access denied. Owner role required.', 403);
  }

  next();
};

export const isAccountant = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401);
  }

  const roles = ((req.user as any).roles as string[] | undefined) || [req.user.role];
  if (!roles.includes('accountant')) {
    throw new AppError('Access denied. Accountant role required.', 403);
  }

  next();
};

// Read-only access to agent accounts for Admin, Principal, PREA and Accountant
export const canViewAgentAccounts = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401);
  }
  const roles = ((req.user as any).roles as string[] | undefined) || [req.user.role];
  if (!roles.some(r => ['accountant', 'admin', 'principal', 'prea'].includes(r))) {
    throw new AppError('Access denied. Admin, Principal, PREA or Accountant role required.', 403);
  }
  next();
};

export const canCreateProperty = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401);
  }

  const roles = ((req.user as any).roles as string[] | undefined) || [req.user.role];
  if (!roles.some(r => ['admin', 'owner', 'agent', 'sales'].includes(r))) {
    throw new AppError('Access denied. Admin, Owner, or Agent role required to create properties.', 403);
  }

  next();
};

export const canManagePayments = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401);
  }

  const roles = ((req.user as any).roles as string[] | undefined) || [req.user.role];
  if (!roles.some(r => ['admin', 'accountant', 'agent', 'sales', 'principal', 'prea'].includes(r))) {
    throw new AppError('Access denied. Admin, Accountant, Agent, Sales, Principal or PREA role required to manage payments.', 403);
  }

  next();
}; 

// Allow viewing sales payments for Admin/Accountant/Agent/Sales
export const canViewSalesPayments = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401);
  }
  const roles = ((req.user as any).roles as string[] | undefined) || [req.user.role];
  if (!roles.some(r => ['admin', 'accountant', 'agent', 'sales'].includes(r))) {
    throw new AppError('Access denied. Admin, Accountant, Agent, or Sales role required to view sales payments.', 403);
  }
  next();
};

// Allow viewing commission reports for Admins and Accountants
export const canViewCommissions = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401);
  }

  const roles = ((req.user as any).roles as string[] | undefined) || [req.user.role];
  if (!roles.some(r => ['admin', 'accountant'].includes(r))) {
    throw new AppError('Access denied. Admin or Accountant role required to view commissions.', 403);
  }

  next();
};

export const isAdminOrSales = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401);
  }

  const roles = ((req.user as any).roles as string[] | undefined) || [req.user.role];
  if (!roles.some(r => ['admin', 'sales'].includes(r))) {
    throw new AppError('Access denied. Admin or Sales role required.', 403);
  }

  next();
};