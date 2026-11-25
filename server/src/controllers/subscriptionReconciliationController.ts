import { Request, Response } from 'express';
import { adminCanResolve, listSubscriptionCases, resolveSubscriptionCase } from '../services/subscriptionReconciliationService';

function forbidden(res: Response) {
  return res.status(403).json({ message: 'Access denied.', code: 'RECONCILIATION_FORBIDDEN' });
}

export const listSubscriptionReconciliation = async (req: Request, res: Response) => {
  try {
    if (!adminCanResolve(req.user as { role?: string; roles?: string[]; companyId?: unknown })) return forbidden(res);
    const cases = await listSubscriptionCases(String(req.user?.companyId));
    res.json({ cases });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Reconciliation could not be loaded.';
    res.status(500).json({ message, code: 'RECONCILIATION_FAILED' });
  }
};

export const resolveSubscriptionReconciliation = async (req: Request, res: Response) => {
  try {
    const user = req.user as { userId?: string; _id?: string; role?: string; roles?: string[]; companyId?: unknown } | undefined;
    if (!adminCanResolve(user)) return forbidden(res);
    const result = await resolveSubscriptionCase({
      companyId: String(user?.companyId),
      caseId: String(req.params.id || ''),
      adminUserId: String(user?.userId || user?._id || ''),
      resolution: String(req.body?.resolution || ''),
      notes: req.body?.notes,
      externalRefundReference: req.body?.externalRefundReference
    });
    res.status(result.status).json(result.body);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Reconciliation could not be saved.';
    res.status(500).json({ message, code: 'RECONCILIATION_FAILED' });
  }
};
