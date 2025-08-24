import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Buyer } from '../models/Buyer';
import { AppError } from '../middleware/errorHandler';

export const listBuyers = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) throw new AppError('Authentication required', 401);
    if (!req.user.companyId) throw new AppError('Company ID not found', 400);

    const query: any = { companyId: new mongoose.Types.ObjectId(req.user.companyId) };
    if (req.user.role !== 'admin' && req.user.role !== 'accountant') {
      query.ownerId = new mongoose.Types.ObjectId(req.user.userId);
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

    const { name, email, phone, budgetMin, budgetMax, prefs } = req.body;
    if (!name) throw new AppError('Name is required', 400);

    const buyer = await Buyer.create({
      name,
      email,
      phone,
      budgetMin: Number(budgetMin || 0),
      budgetMax: Number(budgetMax || 0),
      prefs: prefs || '',
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


