import { Request, Response } from 'express';
import {
  getCompanyAccountingIntegritySummary,
  listCompanyAccountingInconsistencies
} from '../services/paymentAccountingIntegrity';
import { buildFinancialTrace, listTrustVisibility } from '../services/financialTraceService';

function parseDate(value: unknown): Date | undefined {
  if (!value || typeof value !== 'string') return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed;
}

export const getAccountingIntegritySummary = async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  const companyId = String(req.user.companyId || '');
  if (!companyId) return res.status(400).json({ message: 'companyId is required' });
  try {
    const summary = await getCompanyAccountingIntegritySummary(companyId);
    return res.json(summary);
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Failed to load accounting integrity summary' });
  }
};

export const getPaymentFinancialTrace = async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  const companyId = String(req.user.companyId || '');
  if (!companyId) return res.status(400).json({ message: 'companyId is required' });
  try {
    const trace = await buildFinancialTrace(companyId, String(req.params.id));
    if (!trace) return res.status(404).json({ message: 'Payment not found' });
    return res.json(trace);
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Failed to load financial trace' });
  }
};

export const getTrustVisibility = async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  const companyId = String(req.user.companyId || '');
  if (!companyId) return res.status(400).json({ message: 'companyId is required' });
  try {
    const rows = await listTrustVisibility(companyId, Number(req.query.limit || 50));
    return res.json({ rows });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Failed to load trust visibility' });
  }
};

export const listAccountingIntegrityInconsistencies = async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  const companyId = String(req.user.companyId || '');
  if (!companyId) return res.status(400).json({ message: 'companyId is required' });
  try {
    const result = await listCompanyAccountingInconsistencies(companyId, {
      status: req.query.status as any,
      component: typeof req.query.component === 'string' ? req.query.component : undefined,
      dateFrom: parseDate(req.query.dateFrom || req.query.startDate),
      dateTo: parseDate(req.query.dateTo || req.query.endDate),
      propertyId: typeof req.query.propertyId === 'string' ? req.query.propertyId : undefined,
      agentId: typeof req.query.agentId === 'string' ? req.query.agentId : undefined,
      paymentReference: typeof req.query.paymentReference === 'string' ? req.query.paymentReference : undefined,
      currency: typeof req.query.currency === 'string' ? req.query.currency : undefined,
      page: Number(req.query.page || 1),
      limit: Number(req.query.limit || 25)
    });
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Failed to list accounting inconsistencies' });
  }
};
