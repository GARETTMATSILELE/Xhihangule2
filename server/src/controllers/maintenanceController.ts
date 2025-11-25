import { Request, Response } from 'express';
import { reconcileDuplicates } from '../services/reconciliationService';

export const runReconciliation = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  try {
    const role = (req.user as any)?.role || (Array.isArray((req.user as any)?.roles) ? (req.user as any).roles[0] : undefined);
    const isAdmin = role === 'admin' || (Array.isArray((req.user as any)?.roles) && (req.user as any).roles.includes('admin'));
    if (!isAdmin) {
      return res.status(403).json({ message: 'Forbidden: admin only' });
    }
    const dryRun = String(req.query.dryRun || req.body?.dryRun || 'true').toLowerCase() !== 'false';
    const result = await reconcileDuplicates(dryRun);
    return res.status(200).json({ dryRun, result });
  } catch (e: any) {
    console.error('Reconciliation failed:', e);
    return res.status(500).json({ message: 'Reconciliation failed', error: e?.message || 'Unknown error' });
  }
};










