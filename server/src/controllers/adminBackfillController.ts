import { Request, Response } from 'express';
import AdminAuditLog from '../models/AdminAuditLog';
import { backfillTrustAccounts, getTrustBackfillState } from '../services/trustBackfillService';

async function startAudit(req: Request, action: string, payload?: any) {
  try {
    const actorId = String((req.user as any)?.userId || '');
    const actorEmail = String((req.user as any)?.email || '');
    return await AdminAuditLog.create({
      actorId,
      actorEmail,
      action,
      payload,
      success: false,
      startedAt: new Date()
    } as any);
  } catch {
    return null;
  }
}

async function finishAudit(doc: any, success: boolean, result?: any, error?: string) {
  if (!doc) return;
  try {
    const completedAt = new Date();
    const durationMs = doc.startedAt ? completedAt.getTime() - new Date(doc.startedAt).getTime() : undefined;
    await AdminAuditLog.updateOne({ _id: doc._id }, { $set: { success, result, error, completedAt, durationMs } });
  } catch {}
}

export const runTrustBackfill = async (req: Request, res: Response) => {
  const dryRun = Boolean(req.body?.dryRun);
  const limit = Math.min(50, Math.max(1, Number(req.body?.limit || 50)));
  const audit = await startAudit(req, 'maintenance:trust_backfill', { dryRun, limit });
  try {
    const result = await backfillTrustAccounts({
      dryRun,
      limit,
      performedBy: String((req.user as any)?.userId || '')
    });
    await finishAudit(audit, true, result);
    return res.json({ message: dryRun ? 'Dry run completed' : 'Backfill completed', data: result });
  } catch (error: any) {
    await finishAudit(audit, false, undefined, error?.message || 'Backfill failed');
    return res.status(500).json({ message: error?.message || 'Backfill failed' });
  }
};

export const getTrustBackfillStatus = async (_req: Request, res: Response) => {
  const state = await getTrustBackfillState();
  return res.json({ data: state || null });
};

