import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Valuation } from '../models/Valuation';

export const listValuations = async (req: Request, res: Response) => {
  try {
    const { companyId, agentId } = req.query as { companyId?: string; agentId?: string };
    const filter: any = {};
    if (companyId && mongoose.Types.ObjectId.isValid(companyId)) filter.companyId = new mongoose.Types.ObjectId(companyId);
    if (agentId && mongoose.Types.ObjectId.isValid(agentId)) filter.agentId = new mongoose.Types.ObjectId(agentId);
    const items = await Valuation.find(filter).sort({ createdAt: -1 }).limit(1000).lean();
    return res.json(items);
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err?.message || 'Failed to list valuations' });
  }
};

export const createValuation = async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    if (!body.companyId || !body.agentId || !body.propertyAddress || !body.country || !body.city || !body.category) {
      return res.status(400).json({ status: 'error', message: 'Missing required fields' });
    }
    const doc = await Valuation.create({
      companyId: body.companyId,
      agentId: body.agentId,
      propertyAddress: body.propertyAddress,
      country: body.country,
      city: body.city,
      suburb: body.suburb,
      category: body.category,
      propertyType: body.propertyType,
      bedrooms: body.bedrooms,
      bathrooms: body.bathrooms,
      landSize: body.landSize,
      zoning: body.zoning,
      amenitiesResidential: body.amenitiesResidential,
      amenitiesCommercial: body.amenitiesCommercial,
      amenitiesIndustrial: body.amenitiesIndustrial,
      outBuildings: body.outBuildings,
      staffQuarters: body.staffQuarters,
      cottage: body.cottage,
      estimatedValue: body.estimatedValue
    });
    return res.status(201).json(doc);
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err?.message || 'Failed to create valuation' });
  }
};



