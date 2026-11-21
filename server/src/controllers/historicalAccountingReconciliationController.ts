import { Request, Response } from 'express';
import { dryRunCompanyHistoricalAccounting, executeHistoricalAccountingRepair } from '../services/historicalAccountingReconciliation';

export const getHistoricalAccountingDryRun = async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  const companyId = String(req.user.companyId || '');
  if (!companyId) return res.status(400).json({ message: 'companyId is required' });
  try {
    const report = await dryRunCompanyHistoricalAccounting(companyId);
    return res.json(report);
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Historical accounting dry run failed' });
  }
};

export const executeHistoricalAccountingRepairReceipt = async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  const companyId = String(req.user.companyId || '');
  const userId = String((req.user as any).userId || '');
  if (!companyId || !userId) return res.status(400).json({ message: 'Accountant identity is required' });
  try {
    const result = await executeHistoricalAccountingRepair({
      companyId,
      paymentId: String(req.params.id || ''),
      authorisedBy: userId,
      confirm: req.body?.confirm === true,
      reason: typeof req.body?.reason === 'string' ? req.body.reason : '',
      fingerprint: typeof req.body?.fingerprint === 'string' ? req.body.fingerprint : ''
    });
    if (result.ok === false) return res.status(409).json(result);
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Historical accounting repair failed' });
  }
};
