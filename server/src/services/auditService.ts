import { Request } from 'express';
import { AuditLog } from '../models/AuditLog';
import { logger } from '../utils/logger';

type AuditInput = {
  req?: Request;
  userId?: string;
  companyId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  status?: 'success' | 'failure';
  metadata?: Record<string, any>;
};

export async function recordAuditEvent(input: AuditInput): Promise<boolean> {
  const seam = process.env.NODE_ENV !== 'production' && process.env.MANTIS_TEST_SEAM === '1' ? (global as any) : undefined;
  const failAction = seam?.__failAuditAction;
  if (failAction && input.action === failAction) {
    seam.__failAuditAction = undefined;
    logger.error('audit_event_persist_failed', {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      companyId: input.companyId,
      result: input.metadata?.result
    });
    return false;
  }
  const failResult = seam?.__failAuditResult;
  if (failResult && input.action === 'ledger.retry' && input.metadata?.result === failResult) {
    (global as any).__failAuditResult = undefined;
    logger.error('audit_event_persist_failed', {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      companyId: input.companyId,
      result: input.metadata?.result
    });
    return false;
  }
  try {
    await AuditLog.create({
      userId: input.userId || (input.req as any)?.user?.userId,
      companyId: input.companyId || (input.req as any)?.user?.companyId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      ip: input.req?.ip,
      userAgent: input.req?.get('user-agent'),
      requestId: input.req?.get('x-request-id') || (input.req as any)?.requestId,
      status: input.status || 'success',
      metadata: input.metadata
    });
    return true;
  } catch (error: any) {
    logger.error('audit_event_persist_failed', {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      companyId: input.companyId,
      message: error?.message || String(error)
    });
    return false;
  }
}
