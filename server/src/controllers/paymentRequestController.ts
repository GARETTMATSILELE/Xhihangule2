import { Request, Response } from 'express';
import { PaymentRequest } from '../models/PaymentRequest';
import { Notification } from '../models/Notification';
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
      payTo,
      reportHtml,
      developmentId,
      developmentUnitId
    } = req.body;

    // Validate required fields (propertyId can be omitted for development/manual sales)
    if (!amount || !currency || !reason || !payTo?.name || !payTo?.surname) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Verify property exists and belongs to company when provided
    if (propertyId) {
      const property = await Property.findOne({ _id: propertyId, companyId });
      // If a propertyId is provided but not found, allow proceed if development linkage exists
      if (!property && !(developmentId || developmentUnitId)) {
        return res.status(404).json({ message: 'Property not found' });
      }
    }
    // Validate development or unit when provided
    if (!propertyId && (developmentId || developmentUnitId)) {
      try {
        let devId = developmentId;
        if (developmentUnitId) {
          const { DevelopmentUnit } = await import('../models/DevelopmentUnit');
          const unit = await DevelopmentUnit.findById(developmentUnitId).lean();
          if (!unit) return res.status(400).json({ message: 'Invalid developmentUnitId' });
          devId = devId || (unit as any)?.developmentId;
        }
        if (devId) {
          const { Development } = await import('../models/Development');
          const dev = await Development.findOne({ _id: devId, companyId }).lean();
          if (!dev) return res.status(400).json({ message: 'Invalid developmentId' });
        }
      } catch (e) {
        return res.status(400).json({ message: 'Invalid development linkage' });
      }
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
      developmentId,
      developmentUnitId,
      amount,
      currency,
      reason,
      requestDate: requestDate || new Date(),
      dueDate: dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      notes,
      requestedBy: requestedByName,
      requestedByUser: (req.user as any)?.userId,
      payTo,
      reportHtml,
      approval: { status: 'pending' },
      readyForAccounting: false
    });

    await paymentRequest.save();

    // Notify Principal and PREA users in the company (if roles exist)
    try {
      const principals = await User.find({ companyId, roles: { $in: ['principal', 'prea'] } }).select('_id').lean();
      const extra = await User.find({ companyId, role: { $in: ['principal', 'prea'] } }).select('_id').lean();
      const ids = new Set<string>();
      for (const r of principals) ids.add(String((r as any)._id));
      for (const r of extra) ids.add(String((r as any)._id));
      const docs = Array.from(ids).map(uid => ({
        companyId,
        userId: uid as any,
        title: 'Payment Request Approval Needed',
        message: `A new company disbursement request needs approval.`,
        link: '/admin-dashboard/approvals',
        payload: { paymentRequestId: paymentRequest._id }
      }));
      if (docs.length) {
        const saved = await Notification.insertMany(docs);
        // Emit real-time notifications
        try {
          const { getIo } = await import('../config/socket');
          const io = getIo();
          if (io) {
            for (const n of saved) {
              io.to(`user-${String((n as any).userId)}`).emit('newNotification', n);
            }
          }
        } catch {}
      }
    } catch {}

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

    const { status, page = 1, limit = 10, readyForAccounting } = req.query as any;
    const skip = (Number(page) - 1) * Number(limit);

    // Build query - if agent, restrict to own requests
    const query: any = { companyId };
    if ((req.user as any)?.role === 'agent') {
      query.requestedByUser = (req.user as any)?.userId;
    }
    if (status) {
      query.status = status;
    }
    if (typeof readyForAccounting !== 'undefined') {
      query.readyForAccounting = String(readyForAccounting) === 'true';
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

// Approve a payment request (Principal/PREA/Admin)
export const approvePaymentRequest = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ message: 'Company ID is required' });
    }
    const paymentRequest = await PaymentRequest.findOne({ _id: id, companyId });
    if (!paymentRequest) {
      return res.status(404).json({ message: 'Payment request not found' });
    }
    const approver = await User.findById((req.user as any)?.userId).select('firstName lastName role').lean();
    const name = approver ? [approver.firstName, approver.lastName].filter(Boolean).join(' ').trim() : 'Unknown';
    paymentRequest.approval = {
      ...(paymentRequest.approval || { status: 'pending' }),
      status: 'approved',
      approvedBy: (req.user as any)?.userId,
      approvedByName: name,
      approvedByRole: (approver as any)?.role as any,
      approvedAt: new Date()
    } as any;
    paymentRequest.readyForAccounting = true;
  // Add APPROVED stamp when handing off to accounting (post-approval only)
  try {
    if (paymentRequest.reportHtml && typeof paymentRequest.reportHtml === 'string') {
      const approverId = String((req.user as any)?.userId || '');
      const approvedAtIso = new Date().toISOString();
      const stamp = `
        <div style="position:fixed; top:16px; right:16px; z-index:9999; padding:8px 12px; border:2px solid #16a34a; color:#14532d; background:#dcfce7; border-radius:8px; font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,Arial; box-shadow:0 2px 6px rgba(0,0,0,0.1)">
          <div style="font-weight:700; letter-spacing:1px;">APPROVED</div>
          <div style="font-size:12px; margin-top:2px;">By: ${name} (${approverId})</div>
          <div style="font-size:12px;">On: ${new Date(approvedAtIso).toLocaleString()}</div>
        </div>`;
      const html = paymentRequest.reportHtml;
      const stamped = html.includes('<body')
        ? html.replace(/<body[^>]*>/i, (m) => `${m}\n${stamp}\n`)
        : `${stamp}\n${html}`;
      (paymentRequest as any).reportHtml = stamped;
    }
  } catch {}
    await paymentRequest.save();
    // Notify accountants that a request is ready to process
    try {
      const companyId = (req.user as any)?.companyId;
      const accountants = await User.find({ companyId, roles: { $in: ['accountant'] } }).select('_id').lean();
      const extra = await User.find({ companyId, role: 'accountant' }).select('_id').lean();
      const ids = new Set<string>();
      for (const r of accountants) ids.add(String((r as any)._id));
      for (const r of extra) ids.add(String((r as any)._id));
      const docs = Array.from(ids).map(uid => ({
        companyId,
        userId: uid as any,
        title: 'Payment Request Approved',
        message: 'An approved payment request is ready in Tasks.',
        link: '/accountant-dashboard/tasks',
        payload: { paymentRequestId: paymentRequest._id }
      }));
      if (docs.length) {
        const saved = await Notification.insertMany(docs);
        try {
          const { getIo } = await import('../config/socket');
          const io = getIo();
          if (io) {
            for (const n of saved) {
              io.to(`user-${String((n as any).userId)}`).emit('newNotification', n);
            }
          }
        } catch {}
      }
    } catch {}
    const populated = await PaymentRequest.findById(id)
      .populate('propertyId', 'name address')
      .populate('tenantId', 'firstName lastName email')
      .populate('ownerId', 'firstName lastName email')
      .populate('requestedByUser', 'firstName lastName email')
      .populate('processedBy', 'firstName lastName email');
    res.json({ message: 'Payment request approved', data: populated });
  } catch (error: any) {
    console.error('Error approving payment request:', error);
    res.status(500).json({ message: 'Failed to approve payment request', error: error.message });
  }
};

// Reject a payment request (Principal/PREA/Admin)
export const rejectPaymentRequest = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const companyId = req.user?.companyId;
    const { notes } = req.body || {};
    if (!companyId) {
      return res.status(400).json({ message: 'Company ID is required' });
    }
    const paymentRequest = await PaymentRequest.findOne({ _id: id, companyId });
    if (!paymentRequest) {
      return res.status(404).json({ message: 'Payment request not found' });
    }
    const approver = await User.findById((req.user as any)?.userId).select('firstName lastName role').lean();
    const name = approver ? [approver.firstName, approver.lastName].filter(Boolean).join(' ').trim() : 'Unknown';
    paymentRequest.approval = {
      ...(paymentRequest.approval || { status: 'pending' }),
      status: 'rejected',
      approvedBy: (req.user as any)?.userId,
      approvedByName: name,
      approvedByRole: (approver as any)?.role as any,
      approvedAt: new Date(),
      notes
    } as any;
    paymentRequest.readyForAccounting = false;
    await paymentRequest.save();
    const populated = await PaymentRequest.findById(id)
      .populate('propertyId', 'name address')
      .populate('tenantId', 'firstName lastName email')
      .populate('ownerId', 'firstName lastName email')
      .populate('requestedByUser', 'firstName lastName email')
      .populate('processedBy', 'firstName lastName email');
    res.json({ message: 'Payment request rejected', data: populated });
  } catch (error: any) {
    console.error('Error rejecting payment request:', error);
    res.status(500).json({ message: 'Failed to reject payment request', error: error.message });
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