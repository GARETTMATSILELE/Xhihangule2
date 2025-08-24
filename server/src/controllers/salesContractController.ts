import { Request, Response } from 'express';
import { SalesContract } from '../models/SalesContract';

export const createSalesContract = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const companyId = (req.user as any).companyId;
    const createdBy = (req.user as any).userId;
    const {
      propertyId,
      manualPropertyAddress,
      buyerName,
      sellerName,
      currency,
      totalSalePrice,
      commissionPercent,
      preaPercentOfCommission,
      agencyPercentRemaining,
      agentPercentRemaining,
      reference
    } = req.body || {};

    if (!buyerName || !totalSalePrice) {
      return res.status(400).json({ message: 'buyerName and totalSalePrice are required' });
    }

    const doc = await SalesContract.create({
      companyId,
      propertyId,
      manualPropertyAddress,
      buyerName,
      sellerName,
      currency: currency || 'USD',
      totalSalePrice,
      commissionPercent: commissionPercent ?? 5,
      preaPercentOfCommission: preaPercentOfCommission ?? 3,
      agencyPercentRemaining: agencyPercentRemaining ?? 50,
      agentPercentRemaining: agentPercentRemaining ?? 50,
      reference,
      createdBy
    });
    return res.status(201).json({ status: 'success', data: doc });
  } catch (err: any) {
    return res.status(500).json({ message: err.message || 'Failed to create sales contract' });
  }
};

export const listSalesContracts = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const companyId = (req.user as any).companyId;
    const { query } = req;
    const filter: any = { companyId };
    if (query.reference) filter.reference = query.reference;
    if (query.status) filter.status = query.status;
    const docs = await SalesContract.find(filter).sort({ createdAt: -1 }).limit(200);
    return res.json({ status: 'success', data: docs });
  } catch (err: any) {
    return res.status(500).json({ message: err.message || 'Failed to list sales contracts' });
  }
};

export const getSalesContract = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const companyId = (req.user as any).companyId;
    const { id } = req.params as any;
    const doc = await SalesContract.findOne({ _id: id, companyId });
    if (!doc) return res.status(404).json({ message: 'Sales contract not found' });
    return res.json({ status: 'success', data: doc });
  } catch (err: any) {
    return res.status(500).json({ message: err.message || 'Failed to fetch sales contract' });
  }
};



