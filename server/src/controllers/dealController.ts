import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Deal } from '../models/Deal';
import { AppError } from '../middleware/errorHandler';

export const listDeals = async (req: Request, res: Response) => {
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

    const deals = await Deal.find(query).sort({ createdAt: -1 });
    res.json({ status: 'success', data: deals });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ status: 'error', message: error.message });
    }
    res.status(500).json({ status: 'error', message: 'Failed to fetch deals' });
  }
};

export const createDeal = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) throw new AppError('Authentication required', 401);
    if (!req.user.companyId) throw new AppError('Company ID not found', 400);

    const { propertyId, buyerName, buyerEmail, buyerPhone, stage, offerPrice, closeDate, notes } = req.body;
    if (!propertyId || !buyerName || offerPrice == null) {
      throw new AppError('Missing required fields: propertyId, buyerName, offerPrice', 400);
    }

    const deal = await Deal.create({
      propertyId,
      buyerName,
      buyerEmail,
      buyerPhone,
      stage: stage || 'Offer',
      offerPrice,
      closeDate: closeDate || null,
      notes: notes || '',
      won: false,
      companyId: req.user.companyId,
      ownerId: req.user.userId
    });
    res.status(201).json({ status: 'success', data: deal });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ status: 'error', message: error.message });
    }
    res.status(500).json({ status: 'error', message: 'Failed to create deal' });
  }
};

export const updateDeal = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) throw new AppError('Authentication required', 401);
    if (!req.user.companyId) throw new AppError('Company ID not found', 400);

    const { id } = req.params;
    const updates = req.body || {};

    const deal = await Deal.findOneAndUpdate(
      { _id: id, companyId: req.user.companyId },
      updates,
      { new: true }
    );
    if (!deal) throw new AppError('Deal not found', 404);
    res.json({ status: 'success', data: deal });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ status: 'error', message: error.message });
    }
    res.status(500).json({ status: 'error', message: 'Failed to update deal' });
  }
};

export const deleteDeal = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) throw new AppError('Authentication required', 401);
    if (!req.user.companyId) throw new AppError('Company ID not found', 400);

    const { id } = req.params;
    const deal = await Deal.findOneAndDelete({ _id: id, companyId: req.user.companyId });
    if (!deal) throw new AppError('Deal not found', 404);
    res.json({ status: 'success', message: 'Deal deleted' });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ status: 'error', message: error.message });
    }
    res.status(500).json({ status: 'error', message: 'Failed to delete deal' });
  }
};


