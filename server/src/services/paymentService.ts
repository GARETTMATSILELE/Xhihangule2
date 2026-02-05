import { Request, Response } from 'express';
import { Payment, IPayment } from '../models/Payment';
import { Property, IProperty } from '../models/Property';
import { User } from '../models/User';
import { Company } from '../models/Company';
import { AppError } from '../middleware/errorHandler';
import { JwtPayload } from '../types/auth';
import mongoose from 'mongoose';
import { isDatabaseAvailable } from '../config/database';
// CommissionService is imported elsewhere in the codebase; this service does not need a singleton
import { logger } from '../utils/logger';
import { DatabaseService } from './databaseService';
import { CommissionService } from './commissionService';
import { sendAgentPaymentNotificationEmail } from './agentPaymentNotificationService';

const dbService = DatabaseService.getInstance();
// Remove unused singleton reference; commission calculations are handled in controllers via CommissionService

// Commission calculations are centralized in CommissionService

// Get all payments for a company
export const getCompanyPayments = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    if (!isDatabaseAvailable()) {
      throw new AppError('Database is not available', 503);
    }

    const payments = await Payment.find({ companyId: req.user.companyId })
      .populate('propertyId', 'name address')
      .populate('tenantId', 'firstName lastName')
      .populate('agentId', 'firstName lastName')
      .populate('processedBy', 'firstName lastName')
      .sort({ paymentDate: -1 });

    res.json(payments);
  } catch (error) {
    console.error('Error fetching company payments:', error);
    res.status(500).json({ 
      message: 'Failed to fetch payments',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Create a new payment
export const createPayment = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!isDatabaseAvailable()) {
      throw new AppError('Database is not available', 503);
    }

    const {
      paymentType,
      propertyType,
      propertyId,
      tenantId,
      agentId,
      paymentDate,
      paymentMethod,
      amount,
      depositAmount,
      referenceNumber,
      notes,
    } = req.body;

    // Validate required fields
    if (!propertyId || !tenantId || !agentId || !amount) {
      throw new AppError('Missing required fields', 400);
    }

    // Get property details
    const property = await Property.findById(propertyId).session(session);
    if (!property) {
      throw new AppError('Property not found', 404);
    }

    // Get agent details
    const agent = await User.findById(agentId).session(session);
    if (!agent) {
      throw new AppError('Agent not found', 404);
    }

    // Calculate commission using centralized service and company-configured splits
    const commissionPercent = typeof property.commission === 'number'
      ? property.commission
      : ((propertyType || 'residential') === 'residential' ? 15 : 10);
    const commissionDetails = await CommissionService.calculate(
      amount,
      commissionPercent,
      new mongoose.Types.ObjectId(req.user.companyId)
    );

    // Create payment record
    const payment = new Payment({
      paymentType,
      propertyType,
      propertyId,
      tenantId,
      agentId,
      companyId: req.user.companyId,
      paymentDate,
      paymentMethod,
      amount,
      depositAmount,
      referenceNumber,
      notes,
      processedBy: req.user.userId,
      commissionDetails,
      status: 'completed',
    });

    await payment.save({ session });

    // Update company revenue
    await Company.findByIdAndUpdate(
      req.user.companyId,
      {
        $inc: {
          revenue: commissionDetails.agencyShare,
        },
      },
      { session }
    );

    // Update agent commission
    await User.findByIdAndUpdate(
      agentId,
      {
        $inc: {
          commission: commissionDetails.agentShare,
        },
      },
      { session }
    );

    // If it's a rental payment, update property owner's balance
    if (paymentType === 'rental' && property.ownerId) {
      await User.findByIdAndUpdate(
        property.ownerId,
        {
          $inc: {
            balance: commissionDetails.ownerAmount,
          },
        },
        { session }
      );

      // Update property statistics
      await Property.findByIdAndUpdate(
        propertyId,
        {
          $inc: {
            totalRentCollected: amount,
            occupancyRate: 100 / (property.units || 1),
          },
          $set: {
            status: 'rented',
            occupiedUnits: (property.occupiedUnits || 0) + 1,
          },
        },
        { session }
      );
    }

    await session.commitTransaction();

    // Notify agent by email (fire-and-forget)
    void sendAgentPaymentNotificationEmail(payment);

    res.status(201).json({
      message: 'Payment processed successfully',
      payment,
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Error processing payment:', error);
    res.status(error instanceof AppError ? error.statusCode : 500).json({
      message: error instanceof AppError ? error.message : 'Failed to process payment',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  } finally {
    session.endSession();
  }
};

// Get payment details
export const getPaymentDetails = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
    }

    if (!isDatabaseAvailable()) {
      throw new AppError('Database is not available', 503, 'DB_UNAVAILABLE');
    }

    const payment = await Payment.findById(req.params.id)
      .populate('propertyId', 'name address')
      .populate('tenantId', 'firstName lastName')
      .populate('agentId', 'firstName lastName')
      .populate('processedBy', 'firstName lastName');

    if (!payment) {
      throw new AppError('Payment not found', 404, 'PAYMENT_NOT_FOUND');
    }

    // Check if user has access to this payment
    if (payment.companyId.toString() !== req.user.companyId) {
      throw new AppError('Access denied', 403, 'ACCESS_DENIED');
    }

    res.json(payment);
  } catch (error) {
    logger.error('Error fetching payment details:', {
      error,
      paymentId: req.params.id,
      userId: req.user?.userId
    });

    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        status: error.status,
        message: error.message,
        code: error.code
      });
    } else {
      res.status(500).json({
        status: 'error',
        message: 'Failed to fetch payment details',
        code: 'INTERNAL_SERVER_ERROR'
      });
    }
  }
};

// Update payment status
export const updatePaymentStatus = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!isDatabaseAvailable()) {
      throw new AppError('Database is not available', 503);
    }

    const { status } = req.body;

    if (!['pending', 'completed', 'failed'].includes(status)) {
      throw new AppError('Invalid status', 400);
    }

    const payment = await Payment.findById(req.params.id).session(session);

    if (!payment) {
      throw new AppError('Payment not found', 404);
    }

    // Check if user has access to this payment
    if (payment.companyId.toString() !== req.user.companyId) {
      throw new AppError('Access denied', 403);
    }

    const oldStatus = payment.status;
    payment.status = status;
    await payment.save({ session });

    // If payment is being marked as failed, reverse the commission and revenue updates
    if (oldStatus === 'completed' && status === 'failed') {
      const { commissionDetails } = payment;

      // Reverse company revenue
      await Company.findByIdAndUpdate(
        payment.companyId,
        {
          $inc: {
            revenue: -commissionDetails.agencyShare,
          },
        },
        { session }
      );

      // Reverse agent commission
      await User.findByIdAndUpdate(
        payment.agentId,
        {
          $inc: {
            commission: -commissionDetails.agentShare,
          },
        },
        { session }
      );

      // If it was a rental payment, reverse property owner's balance
      if (payment.paymentType === 'rental') {
        const property = await Property.findById(payment.propertyId).session(session);
        if (property) {
          await User.findByIdAndUpdate(
            property.ownerId,
            {
              $inc: {
                balance: -commissionDetails.ownerAmount,
              },
            },
            { session }
          );

          // Update property statistics
          await Property.findByIdAndUpdate(
            payment.propertyId,
            {
              $inc: {
                totalRentCollected: -payment.amount,
                occupancyRate: -100 / (property.units || 1),
              },
              $set: {
                status: 'available',
                occupiedUnits: Math.max(0, (property.occupiedUnits || 0) - 1),
              },
            },
            { session }
          );
        }
      }
    }

    await session.commitTransaction();
    res.json({
      message: 'Payment status updated successfully',
      payment,
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Error updating payment status:', error);
    res.status(error instanceof AppError ? error.statusCode : 500).json({
      message: error instanceof AppError ? error.message : 'Failed to update payment status',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  } finally {
    session.endSession();
  }
};

// Update property occupancy when adding a payment
const updatePropertyOccupancy = async (property: IProperty, isAdding: boolean) => {
  try {
    // These fields have default values in the schema
    const units = (property as any).units || 1;
    const occupiedUnits = (property as any).occupiedUnits || 0;
    
    const updatedOccupancy = {
      occupancyRate: 100 / units,
      occupiedUnits: isAdding ? occupiedUnits + 1 : Math.max(0, occupiedUnits - 1)
    };

    await Property.findByIdAndUpdate(property._id, {
      $set: updatedOccupancy
    });

    return updatedOccupancy;
  } catch (error) {
    logger.error('Error updating property occupancy:', error);
    throw new AppError('Failed to update property occupancy', 500);
  }
}; 