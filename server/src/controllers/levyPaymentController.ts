import { Request, Response } from 'express';
import { LevyPayment } from '../models/LevyPayment';
import { AppError } from '../middleware/errorHandler';
import mongoose from 'mongoose';

export const createLevyPayment = async (req: Request, res: Response) => {
  try {
    if (!req.user?.companyId) {
      throw new AppError('Company ID not found. Please ensure you are associated with a company.', 400);
    }

    if (!req.user?.userId) {
      throw new AppError('User ID not found. Please ensure you are properly authenticated.', 400);
    }

    // Validate required fields
    const { propertyId, paymentDate, paymentMethod, amount, currency = 'USD' } = req.body;
    
    if (!propertyId) {
      throw new AppError('Property ID is required', 400);
    }
    
    if (!paymentDate) {
      throw new AppError('Payment date is required', 400);
    }
    
    if (!paymentMethod) {
      throw new AppError('Payment method is required', 400);
    }
    
    if (!amount || amount <= 0) {
      throw new AppError('Valid amount is required', 400);
    }

    const levyPaymentData = {
      ...req.body,
      companyId: new mongoose.Types.ObjectId(req.user.companyId),
      processedBy: new mongoose.Types.ObjectId(req.user.userId),
      paymentType: 'levy', // Ensure this is set
      status: 'completed' // Set as completed for accountant dashboard payments
    };

    const levyPayment = new LevyPayment(levyPaymentData);
    await levyPayment.save();
    
    // Populate the created levy payment for response
    const populatedLevyPayment = await LevyPayment.findById(levyPayment._id)
      .populate('propertyId', 'name address')
      .populate('processedBy', 'firstName lastName email');
    
    res.status(201).json(populatedLevyPayment);
  } catch (error: any) {
    console.error('Error creating levy payment:', error);
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(400).json({ message: error.message || 'Failed to create levy payment' });
  }
};

export const getLevyPayments = async (req: Request, res: Response) => {
  try {
    const companyId = req.user?.companyId || req.query.companyId;
    if (!companyId) {
      return res.status(400).json({ message: 'Company ID is required' });
    }
    const levyPayments = await LevyPayment.find({ companyId })
      .populate('propertyId', 'name address')
      .populate('processedBy', 'firstName lastName email')
      .sort({ paymentDate: -1 });
    res.status(200).json(levyPayments);
  } catch (error: any) {
    console.error('Error fetching levy payments:', error);
    res.status(500).json({ message: error.message || 'Failed to fetch levy payments' });
  }
}; 