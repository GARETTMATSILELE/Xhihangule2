import { Request, Response, NextFunction } from 'express';
import { auth } from '../middleware/auth';
import { hasAnyRole, getUserRoles } from '../utils/access';
import { AppError } from '../middleware/errorHandler';
import { UserRole } from '../types/auth';
import { EcosystemFlagKey, isFlagEnabledForCompany } from './flags';
import { Company } from '../models/Company';
import { TenantProfile } from './models/tenantFacing';

export const ecosystemAuth = auth;

export function requireEcosystemRoles(roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ status: 'error', message: 'Authentication required', code: 'AUTH_REQUIRED' });
    }
    if (!hasAnyRole(req, roles)) {
      return res.status(403).json({ status: 'error', message: 'Insufficient permissions', code: 'INSUFFICIENT_PERMISSIONS' });
    }
    next();
  };
}

export function requireTenant() {
  return requireEcosystemRoles(['tenant']);
}

export function requireContractor() {
  return requireEcosystemRoles(['contractor']);
}

export function requireAgencyStaff() {
  return requireEcosystemRoles(['admin', 'agent', 'principal', 'prea']);
}

export function requireOwnerOrAgency() {
  return requireEcosystemRoles(['owner', 'admin', 'agent', 'principal', 'prea']);
}

export function requireFlag(flag: EcosystemFlagKey) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Never trust client-supplied companyId for authorization.
      let companyId = req.user?.companyId ? String(req.user.companyId) : '';
      if (!companyId && req.user?.userId) {
        const profile = await TenantProfile.findOne({ userId: req.user.userId }).select('companyId').lean();
        if (profile?.companyId) companyId = String(profile.companyId);
      }
      const company = companyId ? await Company.findById(companyId).select('featureFlags').lean() : null;
      if (!isFlagEnabledForCompany(company as any, flag)) {
        return res.status(403).json({
          status: 'error',
          message: 'This feature is not enabled for this workspace',
          code: 'FEATURE_DISABLED',
        });
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function actorId(req: Request): string {
  const id = req.user?.userId;
  if (!id) throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  return String(id);
}

export function actorRoles(req: Request): UserRole[] {
  return getUserRoles(req);
}
