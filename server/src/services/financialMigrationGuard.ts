import { Request } from 'express';
import { AppError } from '../middleware/errorHandler';
import AdminAuditLog from '../models/AdminAuditLog';

export type MigrationAudit = { _id?: unknown; startedAt?: Date } | null;

export function requestRoles(req: Request): string[] {
  return (((req.user as any)?.roles as string[] | undefined) || [req.user?.role]).filter(Boolean) as string[];
}

export function isSystemAdminUser(req: Request): boolean {
  return requestRoles(req).includes('system_admin');
}

export function isAdminOrSystemAdminUser(req: Request): boolean {
  const roles = requestRoles(req);
  return roles.includes('admin') || roles.includes('system_admin');
}

/**
 * Explicit historical/migration confirmation. Never treat a GET or a silent POST as consent.
 */
export function requireExplicitMigrationConfirmation(req: Request): { reason: string } {
  const confirm = req.body?.confirm === true || String(req.query?.confirm || '').toLowerCase() === 'true';
  const reason = String(req.body?.reason || req.query?.reason || '').trim();
  if (!confirm || !reason) {
    throw new AppError(
      'Historical financial migration requires confirm=true and a non-empty reason. This is not a reconciliation or integrity action.',
      400
    );
  }
  return { reason };
}

export async function startMigrationAudit(req: Request, action: string, payload?: Record<string, unknown>): Promise<MigrationAudit> {
  try {
    return await AdminAuditLog.create({
      actorId: String((req.user as any)?.userId || ''),
      actorEmail: String((req.user as any)?.email || ''),
      action,
      payload,
      success: false,
      startedAt: new Date()
    } as any);
  } catch {
    return null;
  }
}

export async function finishMigrationAudit(
  doc: MigrationAudit,
  success: boolean,
  result?: unknown,
  error?: string
): Promise<void> {
  if (!doc?._id) return;
  try {
    const completedAt = new Date();
    const durationMs = doc.startedAt ? completedAt.getTime() - new Date(doc.startedAt).getTime() : undefined;
    await AdminAuditLog.updateOne({ _id: doc._id }, { $set: { success, result, error, completedAt, durationMs } });
  } catch {
    /* audit must never block the operator response */
  }
}
