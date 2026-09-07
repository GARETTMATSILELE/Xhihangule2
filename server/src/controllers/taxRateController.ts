import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Payment } from '../models/Payment';
import { createVatRate, getVatRateForDate, listTaxRates } from '../services/taxRateService';
import { AppError } from '../middleware/errorHandler';
import { hasAnyRole } from '../utils/access';

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
    if (!hasAnyRole(req, ['admin', 'accountant'])) {
      return res.status(403).json({ message: 'Only admin or accountant can configure VAT rates' });
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
      createdBy: req.user?.userId
    });
    return res.status(201).json({ status: 'success', data: created });
  } catch (error: any) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return res.status(status).json({ message: error?.message || 'Failed to create VAT rate' });
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
