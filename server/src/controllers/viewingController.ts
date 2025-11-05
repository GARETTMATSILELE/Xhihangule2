import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Viewing } from '../models/Viewing';
import { AppError } from '../middleware/errorHandler';

export const listViewings = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) throw new AppError('Authentication required', 401);
    if (!req.user.companyId) throw new AppError('Company ID not found', 400);

    const query: any = { companyId: new mongoose.Types.ObjectId(req.user.companyId) };
    if (req.user.role !== 'admin' && req.user.role !== 'accountant') {
      query.ownerId = new mongoose.Types.ObjectId(req.user.userId);
    }
    if (req.query.propertyId) {
      query.propertyId = new mongoose.Types.ObjectId(String(req.query.propertyId));
    }
    const viewings = await Viewing.find(query).sort({ when: 1 });
    res.json({ status: 'success', data: viewings });
  } catch (error) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ status: 'error', message: error.message });
    res.status(500).json({ status: 'error', message: 'Failed to fetch viewings' });
  }
};

export const createViewing = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) throw new AppError('Authentication required', 401);
    if (!req.user.companyId) throw new AppError('Company ID not found', 400);

    const { propertyId, buyerId, leadId, when, status, notes } = req.body;
    if (!propertyId || !when) throw new AppError('propertyId and when are required', 400);

    const viewing = await Viewing.create({
      propertyId,
      buyerId: buyerId || undefined,
      leadId: leadId || undefined,
      when: new Date(when),
      status: status || 'Scheduled',
      notes: notes || '',
      companyId: req.user.companyId,
      ownerId: req.user.userId
    });
    res.status(201).json({ status: 'success', data: viewing });
  } catch (error) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ status: 'error', message: error.message });
    res.status(500).json({ status: 'error', message: 'Failed to create viewing' });
  }
};

export const updateViewing = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) throw new AppError('Authentication required', 401);
    if (!req.user.companyId) throw new AppError('Company ID not found', 400);
    const { id } = req.params;
    const updates = req.body || {};
    const viewing = await Viewing.findOneAndUpdate({ _id: id, companyId: req.user.companyId }, updates, { new: true });
    if (!viewing) throw new AppError('Viewing not found', 404);
    res.json({ status: 'success', data: viewing });
  } catch (error) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ status: 'error', message: error.message });
    res.status(500).json({ status: 'error', message: 'Failed to update viewing' });
  }
};

export const deleteViewing = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) throw new AppError('Authentication required', 401);
    if (!req.user.companyId) throw new AppError('Company ID not found', 400);
    const { id } = req.params;
    const viewing = await Viewing.findOneAndDelete({ _id: id, companyId: req.user.companyId });
    if (!viewing) throw new AppError('Viewing not found', 404);
    res.json({ status: 'success', message: 'Viewing deleted' });
  } catch (error) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ status: 'error', message: error.message });
    res.status(500).json({ status: 'error', message: 'Failed to delete viewing' });
  }
};


