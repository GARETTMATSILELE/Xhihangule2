import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Buyer } from '../models/Buyer';
import { AppError } from '../middleware/errorHandler';
import { Development } from '../models/Development';
import { DevelopmentUnit } from '../models/DevelopmentUnit';

export const listBuyers = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) throw new AppError('Authentication required', 401);
    if (!req.user.companyId) throw new AppError('Company ID not found', 400);

    const query: any = { companyId: new mongoose.Types.ObjectId(req.user.companyId) };
    if (req.user.role !== 'admin' && req.user.role !== 'accountant') {
      query.ownerId = new mongoose.Types.ObjectId(req.user.userId);
    }
    // Optional filters for developments
    const { developmentId, developmentUnitId } = req.query as any;
    if (developmentId && mongoose.Types.ObjectId.isValid(String(developmentId))) {
      query.developmentId = new mongoose.Types.ObjectId(String(developmentId));
    }
    if (developmentUnitId && mongoose.Types.ObjectId.isValid(String(developmentUnitId))) {
      query.developmentUnitId = new mongoose.Types.ObjectId(String(developmentUnitId));
    }
    const buyers = await Buyer.find(query).sort({ createdAt: -1 });
    res.json({ status: 'success', data: buyers });
  } catch (error) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ status: 'error', message: error.message });
    res.status(500).json({ status: 'error', message: 'Failed to fetch buyers' });
  }
};

export const createBuyer = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) throw new AppError('Authentication required', 401);
    if (!req.user.companyId) throw new AppError('Company ID not found', 400);

    const { name, email, phone, idNumber, budgetMin, budgetMax, prefs, developmentId, developmentUnitId } = req.body;
    if (!name) throw new AppError('Name is required', 400);

    let devId: mongoose.Types.ObjectId | undefined = undefined;
    let unitId: mongoose.Types.ObjectId | undefined = undefined;
    if (developmentId && mongoose.Types.ObjectId.isValid(String(developmentId))) {
      const dev = await Development.findOne({ _id: developmentId, companyId: req.user.companyId }).lean();
      if (!dev) throw new AppError('Invalid developmentId', 400);
      devId = new mongoose.Types.ObjectId(String(developmentId));
    }
    if (developmentUnitId && mongoose.Types.ObjectId.isValid(String(developmentUnitId))) {
      const unit = await DevelopmentUnit.findOne({ _id: developmentUnitId }).lean();
      if (!unit) throw new AppError('Invalid developmentUnitId', 400);
      if (devId && String(unit.developmentId) !== String(devId)) {
        throw new AppError('Unit does not belong to the specified development', 400);
      }
      unitId = new mongoose.Types.ObjectId(String(developmentUnitId));
      if (!devId) devId = new mongoose.Types.ObjectId(String(unit.developmentId));
    }

    const buyer = await Buyer.create({
      name,
      email,
      phone,
      budgetMin: Number(budgetMin || 0),
      budgetMax: Number(budgetMax || 0),
      idNumber: idNumber,
      prefs: prefs || '',
      developmentId: devId,
      developmentUnitId: unitId,
      companyId: req.user.companyId,
      ownerId: req.user.userId
    });
    res.status(201).json({ status: 'success', data: buyer });
  } catch (error) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ status: 'error', message: error.message });
    res.status(500).json({ status: 'error', message: 'Failed to create buyer' });
  }
};

export const updateBuyer = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) throw new AppError('Authentication required', 401);
    if (!req.user.companyId) throw new AppError('Company ID not found', 400);
    const { id } = req.params;
    const updates = req.body || {};
    const buyer = await Buyer.findOneAndUpdate({ _id: id, companyId: req.user.companyId }, updates, { new: true });
    if (!buyer) throw new AppError('Buyer not found', 404);
    res.json({ status: 'success', data: buyer });
  } catch (error) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ status: 'error', message: error.message });
    res.status(500).json({ status: 'error', message: 'Failed to update buyer' });
  }
};

export const deleteBuyer = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) throw new AppError('Authentication required', 401);
    if (!req.user.companyId) throw new AppError('Company ID not found', 400);
    const { id } = req.params;
    const buyer = await Buyer.findOneAndDelete({ _id: id, companyId: req.user.companyId });
    if (!buyer) throw new AppError('Buyer not found', 404);
    res.json({ status: 'success', message: 'Buyer deleted' });
  } catch (error) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ status: 'error', message: error.message });
    res.status(500).json({ status: 'error', message: 'Failed to delete buyer' });
  }
};


