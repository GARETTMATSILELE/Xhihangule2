import { Request } from 'express';
import { UserRole } from '../types/auth';

export function getUserRoles(req: Request): UserRole[] {
  const single = (req as any)?.user?.role as UserRole | undefined;
  const multi = ((req as any)?.user?.roles as UserRole[] | undefined) || (single ? [single] : []);
  return Array.isArray(multi) ? multi : (single ? [single] : []);
}

export function hasRole(req: Request, role: UserRole): boolean {
  const roles = getUserRoles(req);
  return roles.includes(role);
}

export function hasAnyRole(req: Request, rolesToCheck: UserRole[]): boolean {
  const roles = getUserRoles(req);
  return rolesToCheck.some(r => roles.includes(r));
}




