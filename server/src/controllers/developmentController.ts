import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { AppError } from '../middleware/errorHandler';
import { Development, IDevelopment } from '../models/Development';
import { DevelopmentUnit } from '../models/DevelopmentUnit';

const ensureAuthCompany = (req: Request) => {
  if (!req.user?.userId) {
    throw new AppError('Authentication required', 401);
  }
  if (!req.user?.companyId) {
    throw new AppError('Company ID not found. Please ensure you are associated with a company.', 400);
  }
};

const recalcCachedStats = async (developmentId: mongoose.Types.ObjectId) => {
  const pipeline = [
    { $match: { developmentId } },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ];
  const result = await DevelopmentUnit.aggregate(pipeline);
  const counts: Record<string, number> = {};
  for (const r of result) counts[r._id] = r.count;
  const totalUnits = (counts['available'] || 0) + (counts['under_offer'] || 0) + (counts['sold'] || 0);
  await Development.updateOne(
    { _id: developmentId },
    {
      $set: {
        'cachedStats.totalUnits': totalUnits,
        'cachedStats.availableUnits': counts['available'] || 0,
        'cachedStats.underOfferUnits': counts['under_offer'] || 0,
        'cachedStats.soldUnits': counts['sold'] || 0
      }
    }
  );
};

export const createDevelopment = async (req: Request, res: Response) => {
  try {
    ensureAuthCompany(req);

    const { name, type, description, owner, variations } = req.body || {};

    if (!name || !type) {
      throw new AppError('Missing required fields: name and type', 400);
    }
    const allowedTypes = ['stands', 'apartments', 'houses', 'semidetached', 'townhouses'];
    if (!allowedTypes.includes(String(type))) {
      throw new AppError('Invalid development type', 400);
    }

    if (!Array.isArray(variations) || variations.length === 0) {
      throw new AppError('At least one variation is required', 400);
    }

    // Basic validation of variations
    for (const v of variations) {
      if (!v?.id || !v?.label || !v?.count || v.count < 1) {
        throw new AppError('Each variation must include id, label, and count >= 1', 400);
      }
    }

    // Helper: create without transaction (for standalone MongoDB)
    const createWithoutTransaction = async () => {
      const dev = await Development.create({
        name,
        type,
        description: description || '',
        companyId: new mongoose.Types.ObjectId(req.user!.companyId),
        owner: owner || {},
        variations,
        createdBy: new mongoose.Types.ObjectId(req.user!.userId),
        updatedBy: new mongoose.Types.ObjectId(req.user!.userId)
      });

      const unitDocs: any[] = [];
      for (const v of variations) {
        for (let i = 1; i <= Number(v.count); i++) {
          unitDocs.push({
            developmentId: dev._id,
            variationId: v.id,
            unitNumber: i,
            status: 'available',
            price: typeof v.price === 'number' ? v.price : undefined
          });
        }
      }
      if (unitDocs.length > 0) await DevelopmentUnit.insertMany(unitDocs);
      await Development.updateOne(
        { _id: dev._id },
        {
          $set: {
            'cachedStats.totalUnits': unitDocs.length,
            'cachedStats.availableUnits': unitDocs.length,
            'cachedStats.underOfferUnits': 0,
            'cachedStats.soldUnits': 0
          }
        }
      );
      const created = await Development.findById(dev._id).lean();
      return res.status(201).json(created);
    };

    // Try transaction first; if not supported, fallback
    try {
      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        const development = await Development.create([
          {
            name,
            type,
            description: description || '',
            companyId: new mongoose.Types.ObjectId(req.user!.companyId),
            owner: owner || {},
            variations,
            createdBy: new mongoose.Types.ObjectId(req.user!.userId),
            updatedBy: new mongoose.Types.ObjectId(req.user!.userId)
          }
        ], { session });

        const dev = development[0];

        const unitDocs: any[] = [];
        for (const v of variations) {
          for (let i = 1; i <= Number(v.count); i++) {
            unitDocs.push({
              developmentId: dev._id,
              variationId: v.id,
              unitNumber: i,
              status: 'available',
              price: typeof v.price === 'number' ? v.price : undefined
            });
          }
        }
        if (unitDocs.length > 0) await DevelopmentUnit.insertMany(unitDocs, { session });
        await Development.updateOne(
          { _id: dev._id },
          {
            $set: {
              'cachedStats.totalUnits': unitDocs.length,
              'cachedStats.availableUnits': unitDocs.length,
              'cachedStats.underOfferUnits': 0,
              'cachedStats.soldUnits': 0
            }
          },
          { session }
        );

        await session.commitTransaction();
        session.endSession();

        const created = await Development.findById(dev._id).lean();
        return res.status(201).json(created);
      } catch (txErr: any) {
        await session.abortTransaction();
        session.endSession();
        // Fallback on transaction-not-supported
        const msg = String(txErr?.message || '').toLowerCase();
        if (msg.includes('transaction numbers are only allowed') || msg.includes('replica set')) {
          return await createWithoutTransaction();
        }
        throw txErr;
      }
    } catch (outer) {
      // If session start failed, fallback
      return await createWithoutTransaction();
    }
  } catch (error: any) {
    const status = (error as any)?.statusCode || 500;
    const message = (error as any)?.message || 'Error creating development';
    return res.status(status).json({ message });
  }
};

export const listDevelopments = async (req: Request, res: Response) => {
  try {
    ensureAuthCompany(req);
    const developments = await Development.find({ companyId: req.user!.companyId })
      .sort({ createdAt: -1 })
      .lean();
    return res.json(developments);
  } catch (error: any) {
    const status = (error as any)?.statusCode || 500;
    const message = (error as any)?.message || 'Error fetching developments';
    return res.status(status).json({ message });
  }
};

export const getDevelopment = async (req: Request, res: Response) => {
  try {
    ensureAuthCompany(req);
    const dev = await Development.findOne({ _id: req.params.id, companyId: req.user!.companyId }).lean();
    if (!dev) {
      throw new AppError('Development not found', 404);
    }
    return res.json(dev);
  } catch (error: any) {
    const status = (error as any)?.statusCode || 500;
    const message = (error as any)?.message || 'Error fetching development';
    return res.status(status).json({ message });
  }
};

export const updateDevelopment = async (req: Request, res: Response) => {
  try {
    ensureAuthCompany(req);
    const allowed: Partial<IDevelopment> = {
      name: req.body?.name,
      type: req.body?.type,
      description: req.body?.description,
      owner: req.body?.owner
    } as any;

    // Remove undefined keys
    Object.keys(allowed).forEach(k => (allowed as any)[k] === undefined && delete (allowed as any)[k]);

    const updated = await Development.findOneAndUpdate(
      { _id: req.params.id, companyId: req.user!.companyId },
      { $set: { ...allowed, updatedBy: req.user!.userId } },
      { new: true }
    );
    if (!updated) throw new AppError('Development not found', 404);
    return res.json(updated);
  } catch (error: any) {
    const status = (error as any)?.statusCode || 500;
    const message = (error as any)?.message || 'Error updating development';
    return res.status(status).json({ message });
  }
};

export const deleteDevelopment = async (req: Request, res: Response) => {
  try {
    ensureAuthCompany(req);
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const dev = await Development.findOne({ _id: req.params.id, companyId: req.user!.companyId }).session(session);
      if (!dev) throw new AppError('Development not found', 404);

      const unitsDelete = await DevelopmentUnit.deleteMany({ developmentId: dev._id }).session(session);
      await Development.deleteOne({ _id: dev._id }).session(session);

      await session.commitTransaction();
      session.endSession();
      return res.json({ message: 'Development deleted', unitsDeleted: unitsDelete.deletedCount });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      throw err;
    }
  } catch (error: any) {
    const status = (error as any)?.statusCode || 500;
    const message = (error as any)?.message || 'Error deleting development';
    return res.status(status).json({ message });
  }
};

export const listUnitsForDevelopment = async (req: Request, res: Response) => {
  try {
    ensureAuthCompany(req);
    const dev = await Development.findOne({ _id: req.params.id, companyId: req.user!.companyId }).lean();
    if (!dev) throw new AppError('Development not found', 404);

    const { status, variationId, page = '1', limit = '50' } = req.query as any;
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Math.min(200, Number(limit) || 50));

    const query: any = { developmentId: new mongoose.Types.ObjectId(req.params.id) };
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
    const message = (error as any)?.message || 'Error fetching development units';
    return res.status(status).json({ message });
  }
};

export const recomputeStats = async (req: Request, res: Response) => {
  try {
    ensureAuthCompany(req);
    const dev = await Development.findOne({ _id: req.params.id, companyId: req.user!.companyId }).lean();
    if (!dev) throw new AppError('Development not found', 404);
    await recalcCachedStats(new mongoose.Types.ObjectId(req.params.id));
    const updated = await Development.findById(req.params.id).lean();
    return res.json(updated);
  } catch (error: any) {
    const status = (error as any)?.statusCode || 500;
    const message = (error as any)?.message || 'Error recomputing stats';
    return res.status(status).json({ message });
  }
};


