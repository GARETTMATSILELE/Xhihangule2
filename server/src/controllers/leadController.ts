import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Lead } from '../models/Lead';
import { AppError } from '../middleware/errorHandler';

export const listLeads = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) throw new AppError('Authentication required', 401);
    if (!req.user.companyId) throw new AppError('Company ID not found', 400);

    const query: any = { companyId: new mongoose.Types.ObjectId(req.user.companyId) };
    if (req.user.role !== 'admin' && req.user.role !== 'accountant') {
      query.ownerId = new mongoose.Types.ObjectId(req.user.userId);
    }
    const leads = await Lead.find(query).sort({ createdAt: -1 });
    res.json({ status: 'success', data: leads });
  } catch (error) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ status: 'error', message: error.message });
    res.status(500).json({ status: 'error', message: 'Failed to fetch leads' });
  }
};

export const createLead = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) throw new AppError('Authentication required', 401);
    if (!req.user.companyId) throw new AppError('Company ID not found', 400);

    const { name, source, interest, email, phone, status, notes } = req.body;
    if (!name) throw new AppError('Name is required', 400);

    const lead = await Lead.create({
      name,
      source: source || '',
      interest: interest || '',
      notes: notes || '',
      email,
      phone,
      status: status || 'New',
      companyId: req.user.companyId,
      ownerId: req.user.userId
    });
    res.status(201).json({ status: 'success', data: lead });
  } catch (error) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ status: 'error', message: error.message });
    res.status(500).json({ status: 'error', message: 'Failed to create lead' });
  }
};

export const updateLead = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) throw new AppError('Authentication required', 401);
    if (!req.user.companyId) throw new AppError('Company ID not found', 400);
    const { id } = req.params;
    const updates = req.body || {};
    const lead = await Lead.findOneAndUpdate({ _id: id, companyId: req.user.companyId }, updates, { new: true });
    if (!lead) throw new AppError('Lead not found', 404);
    res.json({ status: 'success', data: lead });
  } catch (error) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ status: 'error', message: error.message });
    res.status(500).json({ status: 'error', message: 'Failed to update lead' });
  }
};

export const deleteLead = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) throw new AppError('Authentication required', 401);
    if (!req.user.companyId) throw new AppError('Company ID not found', 400);
    const { id } = req.params;
    const lead = await Lead.findOneAndDelete({ _id: id, companyId: req.user.companyId });
    if (!lead) throw new AppError('Lead not found', 404);
    res.json({ status: 'success', message: 'Lead deleted' });
  } catch (error) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ status: 'error', message: error.message });
    res.status(500).json({ status: 'error', message: 'Failed to delete lead' });
  }
};


