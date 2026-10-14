import { recordAuditEvent } from '../services/auditService';

export async function ecosystemAudit(params: {
  req?: any;
  actor?: string;
  action: string;
  entity: string;
  entityId?: string;
  previousState?: any;
  newState?: any;
  metadata?: Record<string, any>;
}): Promise<void> {
  await recordAuditEvent({
    req: params.req,
    userId: params.actor || params.req?.user?.userId,
    companyId: params.req?.user?.companyId,
    action: params.action,
    entityType: params.entity,
    entityId: params.entityId,
    metadata: {
      previousState: params.previousState,
      newState: params.newState,
      ...(params.metadata || {}),
    },
  });
}
