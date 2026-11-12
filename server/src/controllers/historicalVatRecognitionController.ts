import { Request, Response } from 'express';
import { buildHistoricalVatSchedule, recogniseHistoricalVat, rejectHistoricalVat } from '../services/historicalVatRecognitionService';

function accountantId(req: Request): string {
  return String((req.user as any)?.userId || '');
}

export const getHistoricalVatSchedule = async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  const companyId = String(req.user.companyId || '');
  if (!companyId) return res.status(400).json({ message: 'companyId is required' });
  try {
    const schedule = await buildHistoricalVatSchedule(companyId);
    return res.json({ ...schedule, automaticRecognition: false });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Failed to build the historical VAT schedule' });
  }
};

export const recogniseHistoricalVatReceipt = async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  const companyId = String(req.user.companyId || '');
  const userId = accountantId(req);
  if (!companyId || !userId) return res.status(400).json({ message: 'Accountant identity is required' });
  try {
    const result = await recogniseHistoricalVat({
      companyId,
      paymentId: String(req.params.id || ''),
      approvedBy: userId,
      confirm: req.body?.confirm === true,
      reason: typeof req.body?.reason === 'string' ? req.body.reason : '',
      physicalBookReference: typeof req.body?.physicalBookReference === 'string' ? req.body.physicalBookReference : '',
      septemberTaxTreatmentApproved: req.body?.septemberTaxTreatmentApproved === true,
      taxTreatmentBasis: typeof req.body?.taxTreatmentBasis === 'string' ? req.body.taxTreatmentBasis : ''
    });
    if (result.ok === false && result.status === 'blocked') {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Historical VAT recognition failed' });
  }
};

export const rejectHistoricalVatReceipt = async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  const companyId = String(req.user.companyId || '');
  const userId = accountantId(req);
  if (!companyId || !userId) return res.status(400).json({ message: 'Accountant identity is required' });
  try {
    const result = await rejectHistoricalVat({
      companyId,
      paymentId: String(req.params.id || ''),
      rejectedBy: userId,
      reason: typeof req.body?.reason === 'string' ? req.body.reason : ''
    });
    if (result.ok === false && result.status === 'blocked') return res.status(400).json(result);
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Historical VAT rejection failed' });
  }
};
