import { Request, Response } from 'express';
import { Property } from '../models/Property';
import { Payment } from '../models/Payment';
import { Lease } from '../models/Lease';
import { Tenant } from '../models/Tenant';
import { User } from '../models/User';

export const getPropertyTransactions = async (req: Request, res: Response) => {
  try {
    const { propertyId } = req.params;
    const { type } = req.query;
    if (!propertyId) return res.status(400).json({ message: 'Property ID required' });
    if (!type || (type !== 'income' && type !== 'expenditure')) {
      return res.status(400).json({ message: 'Query param type=income|expenditure required' });
    }
    if (type === 'income') {
      // Find all rental income payments for this property (after commission)
      const payments = await Payment.find({ propertyId, type: 'rent', status: 'completed' })
        .sort({ createdAt: 1 });
      // Map to show net income (after commission)
      const income = payments.map((p: any) => ({
        _id: p._id,
        date: p.createdAt,
        amount: p.amount - (p.commissionDetails?.totalCommission || 0),
        grossAmount: p.amount,
        commission: p.commissionDetails?.totalCommission || 0,
        tenant: p.tenantId,
        lease: p.leaseId,
        description: p.description || 'Rental income',
      }));
      return res.json(income);
    } else {
      // Expenditure: payments made from this property account (type: 'expenditure' or similar)
      const payments = await Payment.find({ propertyId, type: 'expenditure', status: 'completed' })
        .sort({ createdAt: 1 });
      return res.json(payments);
    }
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err });
  }
};

export const createPropertyPayment = async (req: Request, res: Response) => {
  try {
    const { propertyId } = req.params;
    const { amount, recipientId, recipientType, reason } = req.body;
    if (!propertyId || !amount || !recipientId || !recipientType) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    // For now, just create a Payment with type 'expenditure'
    const payment = new Payment({
      propertyId,
      amount,
      recipientId,
      recipientType, // 'owner' or 'contractor'
      reason,
      type: 'expenditure',
      status: 'completed',
      createdAt: new Date(),
    });
    await payment.save();
    res.status(201).json(payment);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err });
  }
};

export const getPaymentRequestDocument = async (req: Request, res: Response) => {
  try {
    const { propertyId, paymentId } = req.params;
    // Fetch payment and property
    const payment = await Payment.findById(paymentId);
    const property = await Property.findById(propertyId);
    if (!payment || !property) {
      return res.status(404).json({ message: 'Payment or property not found' });
    }
    // For now, return a JSON with the details needed for the payment request document
    res.json({
      documentType: 'Payment Request',
      property: {
        name: property.name,
        address: property.address,
      },
      payment: {
        amount: payment.amount,
        recipientId: payment.recipientId,
        recipientType: payment.recipientType,
        reason: payment.reason,
        date: payment.createdAt,
      },
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err });
  }
};

export const getAcknowledgementDocument = async (req: Request, res: Response) => {
  try {
    const { propertyId, paymentId } = req.params;
    const payment = await Payment.findById(paymentId);
    const property = await Property.findById(propertyId);
    if (!payment || !property) {
      return res.status(404).json({ message: 'Payment or property not found' });
    }
    // For now, return a JSON with the details needed for the acknowledgement document
    res.json({
      documentType: 'Acknowledgement of Receipt',
      property: {
        address: property.address,
      },
      payment: {
        amount: payment.amount,
        reason: payment.reason,
        recipientId: payment.recipientId,
        recipientType: payment.recipientType,
        date: payment.createdAt,
      },
      blanks: {
        name: '',
        idNumber: '',
        signature: '',
        contactNumber: payment.recipientType === 'contractor' ? '' : undefined,
      },
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err });
  }
}; 