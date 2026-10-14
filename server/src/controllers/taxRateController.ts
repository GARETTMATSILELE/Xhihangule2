import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Payment } from '../models/Payment';
import { createVatRate, getVatRateForDate, listTaxRates } from '../services/taxRateService';
import { createCentralStandardVatRate, listStandardVatRates } from '../services/taxRuleRegistry';
import { AppError } from '../middleware/errorHandler';
import { hasAnyRole } from '../utils/access';
import AdminAuditLog from '../models/AdminAuditLog';

const getCompanyId = (req: Request): string | undefined =>
  req.user?.companyId ? String(req.user.companyId) : undefined;

export const listCompanyTaxRates = async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ message: 'companyId is required' });
    const taxType = String(req.query.taxType || 'VAT');
    const rows = await listTaxRates(companyId, taxType);
    return res.json({ status: 'success', data: rows });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Failed to list tax rates' });
  }
};

export const getCurrentVatRate = async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ message: 'companyId is required' });
    const onDate = req.query.date ? new Date(String(req.query.date)) : new Date();
    if (Number.isNaN(onDate.getTime())) {
      return res.status(400).json({ message: 'Invalid date' });
    }
    const rate = await getVatRateForDate(companyId, onDate);
    return res.json({
      status: 'success',
      data: {
        taxType: 'VAT',
        rate: rate.percent,
        decimalRate: rate.decimal,
        source: rate.source,
        taxRateId: rate.taxRateId,
        jurisdiction: rate.jurisdiction,
        effectiveFrom: rate.effectiveFrom,
        managedBy: 'mantis',
        asOf: onDate
      }
    });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Failed to get current VAT rate' });
  }
};

export const createCompanyVatRate = async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ message: 'companyId is required' });
    const requestedType = String(req.body?.taxType || 'VAT').toUpperCase();
    if (requestedType === 'VAT') {
      return res.status(403).json({
        message: 'Standard VAT rates are managed centrally by Mantis. Company users cannot set a VAT rate.',
        code: 'VAT_RATE_CENTRALLY_MANAGED'
      });
    }
    if (!hasAnyRole(req, ['admin', 'accountant'])) {
      return res.status(403).json({ message: 'Only admin or accountant can configure this tax rate' });
    }
    const rate = Number(req.body?.rate);
    const effectiveFrom = req.body?.effectiveFrom ? new Date(req.body.effectiveFrom) : new Date();
    if (!Number.isFinite(rate) || rate < 0) {
      return res.status(400).json({ message: 'VAT rate must be a number greater than or equal to 0' });
    }
    if (Number.isNaN(effectiveFrom.getTime())) {
      return res.status(400).json({ message: 'Invalid effectiveFrom date' });
    }
    const created = await createVatRate({
      companyId,
      rate,
      effectiveFrom,
      createdBy: req.user?.userId,
      taxType: ['VAT', 'CGT', 'CGWT'].includes(String(req.body?.taxType || 'VAT'))
        ? String(req.body?.taxType || 'VAT') as any
        : 'VAT'
    });
    return res.status(201).json({ status: 'success', data: created });
  } catch (error: any) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return res.status(status).json({ message: error?.message || 'Failed to create VAT rate' });
  }
};

const requireSystemAdmin = (req: Request) => {
  const roles: string[] = Array.isArray((req.user as any)?.roles)
    ? (req.user as any).roles
    : ((req.user as any)?.role ? [(req.user as any).role] : []);
  if (!roles.includes('system_admin')) {
    throw new AppError('System admin required', 403);
  }
};

export const listCentralVatRates = async (req: Request, res: Response) => {
  try {
    requireSystemAdmin(req);
    const jurisdiction = String(req.query.jurisdiction || 'ZW');
    const rows = await listStandardVatRates(jurisdiction);
    return res.json({ status: 'success', data: rows, managedBy: 'mantis' });
  } catch (error: any) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return res.status(status).json({ message: error?.message || 'Failed to list central VAT rates' });
  }
};

export const createCentralVatRate = async (req: Request, res: Response) => {
  try {
    requireSystemAdmin(req);
    const rate = Number(req.body?.rate);
    const effectiveFrom = req.body?.effectiveFrom ? new Date(req.body.effectiveFrom) : null;
    const sourceReference = String(req.body?.sourceReference || '').trim();
    if (!effectiveFrom || Number.isNaN(effectiveFrom.getTime())) {
      return res.status(400).json({ message: 'A valid effectiveFrom date is required' });
    }
    const created = await createCentralStandardVatRate({
      jurisdiction: req.body?.jurisdiction || 'ZW',
      rate,
      effectiveFrom,
      sourceReference,
      notes: req.body?.notes,
      createdBy: req.user?.userId
    });
    await AdminAuditLog.create({
      actorId: String(req.user?.userId || ''),
      actorEmail: String((req.user as any)?.email || ''),
      action: 'central_vat_rate:create',
      payload: { jurisdiction: created.jurisdiction, rate: created.rate, effectiveFrom: created.effectiveFrom, sourceReference },
      result: { id: created.id, version: created.version },
      success: true,
      startedAt: new Date(),
      completedAt: new Date()
    } as any);
    return res.status(201).json({ status: 'success', data: created });
  } catch (error: any) {
    const status = error instanceof AppError ? error.statusCode : 400;
    return res.status(status >= 400 && status < 600 ? status : 400).json({ message: error?.message || 'Failed to create central VAT rate' });
  }
};

export const getVatOnCommissionSummary = async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ message: 'companyId is required' });

    const now = new Date();
    const start = req.query.startDate ? new Date(String(req.query.startDate)) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = req.query.endDate ? new Date(String(req.query.endDate)) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return res.status(400).json({ message: 'Invalid date range' });
    }

    const rows = await Payment.aggregate([
      {
        $match: {
          companyId: new mongoose.Types.ObjectId(companyId),
          status: 'completed',
          paymentDate: { $gte: start, $lte: end },
          'commissionDetails.vatOnCommission': { $gt: 0 }
        }
      },
      {
        $group: {
          _id: null,
          vatCollected: { $sum: '$commissionDetails.vatOnCommission' },
          transactions: { $sum: 1 },
          properties: { $addToSet: '$propertyId' }
        }
      }
    ]);

    const row = rows[0] || { vatCollected: 0, transactions: 0, properties: [] };
    return res.json({
      status: 'success',
      data: {
        startDate: start,
        endDate: end,
        vatCollected: Number(Number(row.vatCollected || 0).toFixed(2)),
        transactions: Number(row.transactions || 0),
        properties: Array.isArray(row.properties) ? row.properties.length : 0
      }
    });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Failed to summarise VAT on commission' });
  }
};
