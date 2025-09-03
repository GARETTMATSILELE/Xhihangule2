import { Request, Response } from 'express';
import { PaymentRequest } from '../models/PaymentRequest';
import { Property } from '../models/Property';
import { Tenant } from '../models/Tenant';
import { PropertyOwner } from '../models/PropertyOwner';
import { User } from '../models/User';

// Create a new payment request
export const createPaymentRequest = async (req: Request, res: Response) => {
  try {
    const companyId = req.user?.companyId || req.body.companyId;
    
    if (!companyId) {
      return res.status(400).json({ message: 'Company ID is required' });
    }

    const {
      propertyId,
      tenantId,
      ownerId,
      amount,
      currency,
      reason,
      requestDate,
      dueDate,
      notes,
      payTo
    } = req.body;

    // Validate required fields
    if (!propertyId || !amount || !currency || !reason || !payTo?.name || !payTo?.surname) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Verify property exists and belongs to company
    const property = await Property.findOne({ _id: propertyId, companyId });
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }

    // Resolve requester name safely from DB using authenticated user id
    let requestedByName = 'Unknown';
    try {
      const requesterId = (req.user as any)?.userId;
      if (requesterId) {
        const requester = await User.findById(requesterId).select('firstName lastName').lean();
        if (requester) {
          const parts = [requester.firstName, requester.lastName].filter(Boolean);
          requestedByName = parts.length ? parts.join(' ').trim() : 'Unknown';
        }
      }
    } catch {
      // keep default 'Unknown' if lookup fails
    }

    const paymentRequest = new PaymentRequest({
      companyId,
      propertyId,
      tenantId,
      ownerId,
      amount,
      currency,
      reason,
      requestDate: requestDate || new Date(),
      dueDate: dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      notes,
      requestedBy: requestedByName,
      requestedByUser: (req.user as any)?.userId,
      payTo
    });

    await paymentRequest.save();

    res.status(201).json({
      message: 'Payment request created successfully',
      data: paymentRequest
    });
  } catch (error: any) {
    console.error('Error creating payment request:', error);
    res.status(500).json({ message: 'Failed to create payment request', error: error.message });
  }
};

// Get all payment requests for a company
export const getPaymentRequests = async (req: Request, res: Response) => {
  try {
    const companyId = req.user?.companyId || req.query.companyId as string;
    
    if (!companyId) {
      return res.status(400).json({ message: 'Company ID is required' });
    }

    const { status, page = 1, limit = 10 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    // Build query - if agent, restrict to own requests
    const query: any = { companyId };
    if ((req.user as any)?.role === 'agent') {
      query.requestedByUser = (req.user as any)?.userId;
    }
    if (status) {
      query.status = status;
    }

    // Get payment requests with populated data
    const paymentRequests = await PaymentRequest.find(query)
      .populate('propertyId', 'name address')
      .populate('tenantId', 'firstName lastName email')
      .populate('ownerId', 'firstName lastName email')
      .populate('requestedByUser', 'firstName lastName email')
      .populate('processedBy', 'firstName lastName email')
      .sort({ requestDate: -1 })
      .skip(skip)
      .limit(Number(limit));

    // Get total count
    const total = await PaymentRequest.countDocuments(query);

    res.json({
      data: paymentRequests,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error: any) {
    console.error('Error fetching payment requests:', error);
    res.status(500).json({ message: 'Failed to fetch payment requests', error: error.message });
  }
};

// Get a single payment request
export const getPaymentRequest = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const companyId = req.user?.companyId;

    if (!companyId) {
      return res.status(400).json({ message: 'Company ID is required' });
    }

    const paymentRequest = await PaymentRequest.findOne({ _id: id, companyId })
      .populate('propertyId', 'name address')
      .populate('tenantId', 'firstName lastName email')
      .populate('ownerId', 'firstName lastName email')
      .populate('requestedByUser', 'firstName lastName email')
      .populate('processedBy', 'firstName lastName email');

    if (!paymentRequest) {
      return res.status(404).json({ message: 'Payment request not found' });
    }

    res.json({ data: paymentRequest });
  } catch (error: any) {
    console.error('Error fetching payment request:', error);
    res.status(500).json({ message: 'Failed to fetch payment request', error: error.message });
  }
};

// Update payment request status (mark as paid/rejected)
export const updatePaymentRequestStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    const companyId = req.user?.companyId;

    if (!companyId) {
      return res.status(400).json({ message: 'Company ID is required' });
    }

    if (!['pending', 'paid', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const paymentRequest = await PaymentRequest.findOne({ _id: id, companyId });

    if (!paymentRequest) {
      return res.status(404).json({ message: 'Payment request not found' });
    }

    // Update status and processing info
    paymentRequest.status = status;
    paymentRequest.notes = notes || paymentRequest.notes;
    
    if (status === 'paid' || status === 'rejected') {
      paymentRequest.processedBy = (req.user as any)?.userId;
      paymentRequest.processedDate = new Date();
    }

    await paymentRequest.save();

    // Populate the updated document
    const updatedRequest = await PaymentRequest.findById(id)
      .populate('propertyId', 'name address')
      .populate('tenantId', 'firstName lastName email')
      .populate('ownerId', 'firstName lastName email')
      .populate('requestedByUser', 'firstName lastName email')
      .populate('processedBy', 'firstName lastName email');

    res.json({
      message: `Payment request ${status} successfully`,
      data: updatedRequest
    });
  } catch (error: any) {
    console.error('Error updating payment request status:', error);
    res.status(500).json({ message: 'Failed to update payment request status', error: error.message });
  }
};

// Delete a payment request
export const deletePaymentRequest = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const companyId = req.user?.companyId;

    if (!companyId) {
      return res.status(400).json({ message: 'Company ID is required' });
    }

    const paymentRequest = await PaymentRequest.findOneAndDelete({ _id: id, companyId });

    if (!paymentRequest) {
      return res.status(404).json({ message: 'Payment request not found' });
    }

    res.json({ message: 'Payment request deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting payment request:', error);
    res.status(500).json({ message: 'Failed to delete payment request', error: error.message });
  }
};

// Get payment request statistics
export const getPaymentRequestStats = async (req: Request, res: Response) => {
  try {
    const companyId = req.user?.companyId || req.query.companyId as string;
    
    if (!companyId) {
      return res.status(400).json({ message: 'Company ID is required' });
    }

    const stats = await PaymentRequest.aggregate([
      { $match: { companyId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);

    const formattedStats = {
      pending: { count: 0, totalAmount: 0 },
      paid: { count: 0, totalAmount: 0 },
      rejected: { count: 0, totalAmount: 0 }
    };

    stats.forEach(stat => {
      formattedStats[stat._id as keyof typeof formattedStats] = {
        count: stat.count,
        totalAmount: stat.totalAmount
      };
    });

    res.json({ data: formattedStats });
  } catch (error: any) {
    console.error('Error fetching payment request stats:', error);
    res.status(500).json({ message: 'Failed to fetch payment request statistics', error: error.message });
  }
}; 