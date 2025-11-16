import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { AppError } from '../middleware/errorHandler';
import { hasAnyRole } from '../utils/access';
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
    const { developmentId, status, variationId, page = '1', limit = '50', requireBuyer, fields } = req.query as any;
    if (!developmentId) throw new AppError('developmentId is required', 400);

    // Ensure development belongs to company
    const dev = await Development.findById(developmentId).lean();
    if (!dev || String(dev.companyId) !== String(req.user!.companyId)) throw new AppError('Forbidden', 403);

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Math.min(200, Number(limit) || 50));

    const query: any = { developmentId: new mongoose.Types.ObjectId(developmentId) };
    if (status) query.status = String(status);
    if (variationId) query.variationId = String(variationId);
    // Optionally require a buyer and sold status
    const mustRequireBuyer = String(requireBuyer || '').toLowerCase() === 'true';
    if (mustRequireBuyer) {
      query.status = 'sold';
      query.$or = [
        { buyerName: { $exists: true, $type: 'string', $ne: '' } },
        { buyerId: { $exists: true } }
      ];
    }

    // Restrict to unit collaborators when user is sales and not dev owner/collaborator
    const isPrivileged = hasAnyRole(req, ['admin', 'accountant']);
    const isOwner = String(dev.createdBy) === String(req.user!.userId);
    const isDevCollaborator = Array.isArray(dev.collaborators) && dev.collaborators.some((id:any)=> String(id) === String(req.user!.userId));
    if (!isPrivileged && !isOwner && !isDevCollaborator) {
      query.collaborators = new mongoose.Types.ObjectId(req.user!.userId);
    }

    const selectFields = typeof fields === 'string'
      ? String(fields).split(',').map((s: string) => s.trim()).filter(Boolean).join(' ')
      : undefined;

    const [items, total] = await Promise.all([
      (() => {
        let q = DevelopmentUnit.find(query)
          .sort({ variationId: 1, unitNumber: 1 })
          .skip((pageNum - 1) * limitNum)
          .limit(limitNum);
        if (selectFields) q = q.select(selectFields);
        return q.lean();
      })(),
      DevelopmentUnit.countDocuments(query)
    ]);

    return res.json({ items, total, page: pageNum, limit: limitNum });
  } catch (error: any) {
    const status = (error as any)?.statusCode || 500;
    const message = (error as any)?.message || 'Error fetching units';
    return res.status(status).json({ message });
  }
};

export const setUnitBuyer = async (req: Request, res: Response) => {
  try {
    ensureAuthCompany(req);
    const { unitId } = req.params as any;
    const { buyerId } = req.body || {};
    if (!buyerId || !mongoose.Types.ObjectId.isValid(String(buyerId))) throw new AppError('buyerId is required', 400);

    const unit = await DevelopmentUnit.findById(unitId).lean();
    if (!unit) throw new AppError('Unit not found', 404);

    // Ensure unit belongs to the company
    const dev = await Development.findById(unit.developmentId).lean();
    if (!dev || String(dev.companyId) !== String(req.user!.companyId)) throw new AppError('Forbidden', 403);

    const buyer = await Buyer.findOne({ _id: buyerId, companyId: req.user!.companyId }).lean();
    if (!buyer) throw new AppError('Buyer not found', 404);

    const updated = await DevelopmentUnit.findByIdAndUpdate(
      unitId,
      { $set: { buyerId: buyer._id, buyerName: buyer.name } },
      { new: true }
    );
    return res.json({ status: 'success', data: updated });
  } catch (error: any) {
    const status = (error as any)?.statusCode || 500;
    const message = (error as any)?.message || 'Error setting unit buyer';
    return res.status(status).json({ message });
  }
};

export const updateUnitDetails = async (req: Request, res: Response) => {
  try {
    ensureAuthCompany(req);
    const { unitId } = req.params as any;
    const unit = await DevelopmentUnit.findById(unitId).lean();
    if (!unit) throw new AppError('Unit not found', 404);
    const dev = await Development.findById(unit.developmentId).lean();
    if (!dev || String(dev.companyId) !== String(req.user!.companyId)) throw new AppError('Forbidden', 403);

    // Only admin/accountant or development owner/collaborator can edit details
    const isPrivileged = hasAnyRole(req, ['admin', 'accountant']);
    const isOwner = String(dev.createdBy) === String(req.user!.userId);
    const isDevCollaborator = Array.isArray(dev.collaborators) && dev.collaborators.some((id:any)=> String(id) === String(req.user!.userId));
    if (!isPrivileged && !isOwner && !isDevCollaborator) throw new AppError('Not allowed to modify this unit', 403);

    const body = req.body || {};
    const setOps: any = {};
    if (typeof body.unitCode === 'string') setOps.unitCode = String(body.unitCode).trim();
    if (typeof body.price === 'number') setOps.price = Number(body.price);
    if (body.meta && typeof body.meta === 'object') {
      const meta: any = {};
      if (typeof body.meta.block === 'string') meta.block = String(body.meta.block).trim();
      if (typeof body.meta.floor === 'string') meta.floor = String(body.meta.floor).trim();
      if (typeof body.meta.bedrooms === 'number') meta.bedrooms = Number(body.meta.bedrooms);
      if (typeof body.meta.bathrooms === 'number') meta.bathrooms = Number(body.meta.bathrooms);
      if (typeof body.meta.standSize === 'number') meta.standSize = Number(body.meta.standSize);
      setOps.meta = meta;
    }
    if (Object.keys(setOps).length === 0) return res.json(await DevelopmentUnit.findById(unitId).lean());

    const updated = await DevelopmentUnit.findByIdAndUpdate(unitId, { $set: setOps }, { new: true }).lean();
    return res.json(updated);
  } catch (error: any) {
    const status = (error as any)?.statusCode || 500;
    const message = (error as any)?.message || 'Error updating unit';
    return res.status(status).json({ message });
  }
};

export const addUnitCollaborator = async (req: Request, res: Response) => {
  try {
    ensureAuthCompany(req);
    const { unitId } = req.params as any;
    const { userId } = req.body || {};
    if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) throw new AppError('Invalid userId', 400);
    const unit = await DevelopmentUnit.findById(unitId).lean();
    if (!unit) throw new AppError('Unit not found', 404);
    const dev = await Development.findById(unit.developmentId).lean();
    if (!dev || String(dev.companyId) !== String(req.user!.companyId)) throw new AppError('Forbidden', 403);
    // Only admin/accountant or development owner can add unit collaborators
    const isPrivileged = hasAnyRole(req, ['admin', 'accountant']);
    const isOwner = String(dev.createdBy) === String(req.user!.userId);
    if (!isPrivileged && !isOwner) throw new AppError('Only development owner or admin can add unit collaborators', 403);

    await DevelopmentUnit.updateOne({ _id: unitId }, { $addToSet: { collaborators: new mongoose.Types.ObjectId(String(userId)) } });
    const updated = await DevelopmentUnit.findById(unitId).lean();
    return res.json(updated);
  } catch (error: any) {
    const status = (error as any)?.statusCode || 500;
    const message = (error as any)?.message || 'Error adding unit collaborator';
    return res.status(status).json({ message });
  }
};

export const removeUnitCollaborator = async (req: Request, res: Response) => {
  try {
    ensureAuthCompany(req);
    const { unitId } = req.params as any;
    const { userId } = req.body || {};
    if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) throw new AppError('Invalid userId', 400);
    const unit = await DevelopmentUnit.findById(unitId).lean();
    if (!unit) throw new AppError('Unit not found', 404);
    const dev = await Development.findById(unit.developmentId).lean();
    if (!dev || String(dev.companyId) !== String(req.user!.companyId)) throw new AppError('Forbidden', 403);
    const isPrivileged = hasAnyRole(req, ['admin', 'accountant']);
    const isOwner = String(dev.createdBy) === String(req.user!.userId);
    if (!isPrivileged && !isOwner) throw new AppError('Only development owner or admin can remove unit collaborators', 403);

    await DevelopmentUnit.updateOne({ _id: unitId }, { $pull: { collaborators: new mongoose.Types.ObjectId(String(userId)) } });
    const updated = await DevelopmentUnit.findById(unitId).lean();
    return res.json(updated);
  } catch (error: any) {
    const status = (error as any)?.statusCode || 500;
    const message = (error as any)?.message || 'Error removing unit collaborator';
    return res.status(status).json({ message });
  }
};


