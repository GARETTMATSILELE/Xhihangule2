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

export async function recordAuditEvent(input: AuditInput): Promise<void> {
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
  } catch (error: any) {
    logger.warn('Audit event write failed', {
      action: input.action,
      entityType: input.entityType,
      message: error?.message || String(error)
    });
  }
}
