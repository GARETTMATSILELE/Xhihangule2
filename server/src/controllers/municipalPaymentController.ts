import { Request, Response } from 'express';
import { MunicipalPayment } from '../models/MunicipalPayment';
import { AppError } from '../middleware/errorHandler';
import mongoose from 'mongoose';

export const createMunicipalPayment = async (req: Request, res: Response) => {
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

    const municipalPaymentData = {
      ...req.body,
      companyId: new mongoose.Types.ObjectId(req.user.companyId),
      processedBy: new mongoose.Types.ObjectId(req.user.userId),
      paymentType: 'municipal', // Ensure this is set
      status: 'completed' // Set as completed for accountant dashboard payments
    };

    const municipalPayment = new MunicipalPayment(municipalPaymentData);
    await municipalPayment.save();
    
    // Populate the created municipal payment for response
    const populatedMunicipalPayment = await MunicipalPayment.findById(municipalPayment._id)
      .populate('propertyId', 'name address')
      .populate('processedBy', 'firstName lastName email');
    
    res.status(201).json(populatedMunicipalPayment);
  } catch (error: any) {
    console.error('Error creating municipal payment:', error);
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(400).json({ message: error.message || 'Failed to create municipal payment' });
  }
}; 