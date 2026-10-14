import { AppError } from '../middleware/errorHandler';

/** Roles a company administrator may assign. Platform and portal roles are excluded. */
export const COMPANY_ASSIGNABLE_ROLES = ['admin', 'agent', 'accountant', 'owner', 'sales', 'principal', 'prea'] as const;

export type CompanyAssignableRole = (typeof COMPANY_ASSIGNABLE_ROLES)[number];

function isAssignable(value: string): value is CompanyAssignableRole {
  return (COMPANY_ASSIGNABLE_ROLES as readonly string[]).includes(value);
}

/**
 * Rejects platform roles such as system_admin before any user document is written.
 * Returns only the fields the caller actually sent.
 */
export function assertCompanyAssignableRoleSet(
  role: unknown,
  roles: unknown
): { role?: CompanyAssignableRole; roles?: CompanyAssignableRole[] } {
  const requested: string[] = [];
  if (typeof role === 'string' && role.trim()) requested.push(role.trim());
  if (Array.isArray(roles)) {
    for (const entry of roles) {
      if (typeof entry === 'string' && entry.trim()) requested.push(entry.trim());
    }
  }

  if (requested.some((name) => !isAssignable(name))) {
    throw new AppError('That role cannot be assigned by a company administrator', 403);
  }

  const unique = Array.from(new Set(requested)).filter(isAssignable);
  if (Array.isArray(roles)) {
    if (unique.length === 0) {
      throw new AppError('At least one valid role is required', 400);
    }
    const requestedPrimary = typeof role === 'string' ? role.trim() : '';
    const primary = isAssignable(requestedPrimary) && unique.includes(requestedPrimary)
      ? requestedPrimary
      : unique[0];
    return { role: primary, roles: unique };
  }

  if (typeof role === 'string') {
    const trimmed = role.trim();
    if (isAssignable(trimmed)) return { role: trimmed };
  }

  return {};
}
