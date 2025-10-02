import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { AppError } from '../middleware/errorHandler';
import { Development } from '../models/Development';
import { DevelopmentUnit } from '../models/DevelopmentUnit';
import { Buyer } from '../models/Buyer';

const ensureAuthCompany = (req: Request) => {
  if (!req.user?.userId) {
    throw new AppError('Authentication required', 401);
  }
  if (!req.user?.companyId) {
    throw new AppError('Company ID not found. Please ensure you are associated with a company.', 400);
  }
};

export const updateUnitStatus = async (req: Request, res: Response) => {
  try {
    ensureAuthCompany(req);
    const { unitId } = req.params as any;
    const { to, reservationMinutes, dealId, buyerId } = req.body || {};
    const allowed = ['available', 'under_offer', 'sold'];
    if (!allowed.includes(String(to))) {
      throw new AppError('Invalid status', 400);
    }

    const unit = await DevelopmentUnit.findById(unitId).lean();
    if (!unit) throw new AppError('Unit not found', 404);

    // Ensure unit belongs to a development within user's company
    const dev = await Development.findById(unit.developmentId).lean();
    if (!dev || String(dev.companyId) !== String(req.user!.companyId)) {
      throw new AppError('Forbidden', 403);
    }

    const now = new Date();
    const expires = reservationMinutes ? new Date(now.getTime() + Number(reservationMinutes) * 60_000) : undefined;

    let buyerPatch: any = {};
    if (to === 'sold' && buyerId) {
      const buyer = await Buyer.findOne({ _id: buyerId, companyId: req.user!.companyId }).lean();
      if (buyer) buyerPatch = { buyerId: buyer._id, buyerName: buyer.name };
    }

    const update: any = {
      $set: {
        status: to,
        reservationExpiresAt: to === 'under_offer' ? expires : undefined,
        reservedAt: to === 'under_offer' ? now : undefined,
        reservedBy: to === 'under_offer' ? new mongoose.Types.ObjectId(req.user!.userId) : undefined,
        soldAt: to === 'sold' ? now : undefined,
        dealId: to === 'sold' && dealId ? new mongoose.Types.ObjectId(dealId) : undefined,
        ...buyerPatch
      },
      $push: {
        statusHistory: {
          from: unit.status,
          to,
          at: now,
          by: new mongoose.Types.ObjectId(req.user!.userId)
        }
      }
    };

    // Guard against race conditions using precondition
    const updated = await DevelopmentUnit.findOneAndUpdate({ _id: unitId, status: unit.status }, update, { new: true });
    if (!updated) {
      throw new AppError('Status changed by another process. Please retry.', 409);
    }

    // Update development cached stats asynchronously (no need to await)
    try {
      const pipeline = [
        { $match: { developmentId: updated.developmentId } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ];
      const result = await DevelopmentUnit.aggregate(pipeline);
      const counts: Record<string, number> = {};
      for (const r of result) counts[r._id] = r.count;
      const totalUnits = (counts['available'] || 0) + (counts['under_offer'] || 0) + (counts['sold'] || 0);
      await Development.updateOne(
        { _id: updated.developmentId },
        {
          $set: {
            'cachedStats.totalUnits': totalUnits,
            'cachedStats.availableUnits': counts['available'] || 0,
            'cachedStats.underOfferUnits': counts['under_offer'] || 0,
            'cachedStats.soldUnits': counts['sold'] || 0
          }
        }
      );
    } catch {}

    return res.json(updated);
  } catch (error: any) {
    const status = (error as any)?.statusCode || 500;
    const message = (error as any)?.message || 'Error updating unit status';
    return res.status(status).json({ message });
  }
};

export const listUnits = async (req: Request, res: Response) => {
  try {
    ensureAuthCompany(req);
    const { developmentId, status, variationId, page = '1', limit = '50' } = req.query as any;
    if (!developmentId) throw new AppError('developmentId is required', 400);

    // Ensure development belongs to company
    const dev = await Development.findById(developmentId).lean();
    if (!dev || String(dev.companyId) !== String(req.user!.companyId)) throw new AppError('Forbidden', 403);

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Math.min(200, Number(limit) || 50));

    const query: any = { developmentId: new mongoose.Types.ObjectId(developmentId) };
    if (status) query.status = String(status);
    if (variationId) query.variationId = String(variationId);

    const [items, total] = await Promise.all([
      DevelopmentUnit.find(query)
        .sort({ variationId: 1, unitNumber: 1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      DevelopmentUnit.countDocuments(query)
    ]);

    return res.json({ items, total, page: pageNum, limit: limitNum });
  } catch (error: any) {
    const status = (error as any)?.statusCode || 500;
    const message = (error as any)?.message || 'Error fetching units';
    return res.status(status).json({ message });
  }
};


