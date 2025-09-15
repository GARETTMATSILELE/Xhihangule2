import { Request, Response } from 'express';
import { Payment, IPayment } from '../models/Payment';
import { IUser } from '../models/User';
import { AppError } from '../middleware/errorHandler';
import { JwtPayload } from '../types/auth';
import mongoose from 'mongoose';
import { Lease } from '../models/Lease';
import { Property } from '../models/Property';
import { User } from '../models/User';
import { Company } from '../models/Company';
import { Tenant } from '../models/Tenant';
import propertyAccountService from '../services/propertyAccountService';

// List sales-only payments for a company
export const getCompanySalesPayments = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const query: any = { companyId: req.user.companyId, paymentType: 'sale' };
    if (req.query.saleMode === 'quick' || req.query.saleMode === 'installment') {
      query.saleMode = req.query.saleMode;
    }
    const payments = await Payment.find(query).sort({ paymentDate: -1 });
    return res.json(payments);
  } catch (error) {
    console.error('Error fetching sales payments:', error);
    return res.status(500).json({ message: 'Failed to fetch sales payments' });
  }
};

export const getPayments = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const payments = await Payment.find({ companyId: req.user.companyId });
    res.json(payments);
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ message: 'Error fetching payments' });
  }
};

export const getPayment = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const payment = await Payment.findOne({
      _id: req.params.id,
      companyId: req.user.companyId
    });
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }
    res.json(payment);
  } catch (error) {
    console.error('Error fetching payment:', error);
    res.status(500).json({ message: 'Error fetching payment' });
  }
};

// Helper function to calculate commission with company-specific splits
const calculateCommission = async (
  amount: number,
  commissionPercentage: number,
  companyId: mongoose.Types.ObjectId
) => {
  const { Company } = await import('../models/Company');
  const company = await Company.findById(companyId).lean();
  const totalCommission = (amount * commissionPercentage) / 100;
  const preaPercentOfTotal = Math.max(0, Math.min(1, company?.commissionConfig?.preaPercentOfTotal ?? 0.03));
  const agentPercentOfRemaining = Math.max(0, Math.min(1, company?.commissionConfig?.agentPercentOfRemaining ?? 0.6));
  const agencyPercentOfRemaining = Math.max(0, Math.min(1, company?.commissionConfig?.agencyPercentOfRemaining ?? 0.4));

  // PREA share comes off the top; handle 0% gracefully
  const preaFee = totalCommission * preaPercentOfTotal;
  const remainingCommission = totalCommission - preaFee;
  const agentShare = remainingCommission * agentPercentOfRemaining;
  const agencyShare = remainingCommission * agencyPercentOfRemaining;
  return {
    totalCommission,
    preaFee,
    agentShare,
    agencyShare,
    ownerAmount: amount - totalCommission,
  };
};

// Create a new payment (for lease-based payments)
export const createPayment = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const {
      leaseId,
      amount,
      paymentDate,
      paymentMethod,
      status,
      companyId,
      rentalPeriodMonth,
      rentalPeriodYear,
      advanceMonthsPaid,
      advancePeriodStart,
      advancePeriodEnd,
    } = req.body;

    // Validate required fields
    if (!leaseId || !amount || !paymentDate || !paymentMethod || !status) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields: leaseId, amount, paymentDate, paymentMethod, status',
      });
    }
    // Validate advance payment fields
    if (advanceMonthsPaid && advancePeriodStart && advancePeriodEnd) {
      // Check for overlapping advance payments for this lease
      const overlap = await Payment.findOne({
        leaseId,
        $or: [
          {
            'advancePeriodStart.year': { $lte: advancePeriodEnd.year },
            'advancePeriodEnd.year': { $gte: advancePeriodStart.year },
            'advancePeriodStart.month': { $lte: advancePeriodEnd.month },
            'advancePeriodEnd.month': { $gte: advancePeriodStart.month },
          },
          {
            rentalPeriodYear: { $gte: advancePeriodStart.year, $lte: advancePeriodEnd.year },
            rentalPeriodMonth: { $gte: advancePeriodStart.month, $lte: advancePeriodEnd.month },
          }
        ]
      });
      if (overlap) {
        return res.status(400).json({
          status: 'error',
          message: 'Overlapping advance payment already exists for this period.'
        });
      }
      // Validate amount
      const lease = await Lease.findById(leaseId);
      if (lease && amount !== lease.rentAmount * advanceMonthsPaid) {
        return res.status(400).json({
          status: 'error',
          message: `Amount must equal rent (${lease.rentAmount}) x months (${advanceMonthsPaid}) = ${lease.rentAmount * advanceMonthsPaid}`
        });
      }
    }

    // Get lease details to extract property and tenant information
    const lease = await Lease.findById(leaseId);
    if (!lease) {
      return res.status(404).json({
        status: 'error',
        message: 'Lease not found',
      });
    }

    // Get property details
    const property = await Property.findById(lease.propertyId);
    if (!property) {
      return res.status(404).json({
        message: 'Property not found',
      });
    }
    const rent = property.rent || lease.rentAmount;
    // For advance payments, validate amount
    if (advanceMonthsPaid && advanceMonthsPaid > 1) {
      const expectedAmount = rent * advanceMonthsPaid;
      if (amount !== expectedAmount) {
        return res.status(400).json({
          status: 'error',
          message: `Amount must equal rent (${rent}) x months (${advanceMonthsPaid}) = ${expectedAmount}`
        });
      }
    } else {
      // For single month, validate amount
      if (amount !== rent) {
        return res.status(400).json({
          status: 'error',
          message: `Amount must equal rent (${rent}) for the selected month.`
        });
      }
    }

    // Calculate commission based on property commission percentage and company config
    const paymentCommissionDetails = await calculateCommission(
      amount,
      property.commission || 0,
      new mongoose.Types.ObjectId(req.user.companyId)
    );

    // Create payment record
    const payment = new Payment({
      amount,
      paymentDate,
      paymentMethod,
      status,
      companyId: companyId || lease.companyId,
      paymentType: 'rental',
      propertyType: 'residential', // Default value
      propertyId: lease.propertyId,
      tenantId: lease.tenantId,
      agentId: lease.tenantId, // Use tenant ID as agent ID since lease doesn't have agentId
      processedBy: lease.tenantId, // Use tenant ID as processedBy since no agent ID
      depositAmount: 0, // Default value
      rentalPeriodMonth,
      rentalPeriodYear,
      advanceMonthsPaid,
      advancePeriodStart,
      advancePeriodEnd,
      referenceNumber: '', // Placeholder, will update after save
      notes: '', // Default empty notes
      commissionDetails: paymentCommissionDetails,
      rentUsed: rent, // Store the rent used for this payment
    });

    await payment.save();
    // Generate reference number after save (using payment._id)
    payment.referenceNumber = `RCPT-${payment._id.toString().slice(-6).toUpperCase()}-${rentalPeriodYear}-${String(rentalPeriodMonth).padStart(2, '0')}`;
    await payment.save();

    // If depositAmount > 0, record in rentaldeposits
    if (payment.depositAmount && payment.depositAmount > 0) {
      const { RentalDeposit } = require('../models/rentalDeposit');
      await RentalDeposit.create({
        propertyId: payment.propertyId,
        agentId: payment.agentId,
        companyId: payment.companyId,
        tenantId: payment.tenantId,
        depositAmount: payment.depositAmount,
        depositDate: payment.paymentDate,
        paymentId: payment._id,
      });
    }

    // Update company revenue
    await Company.findByIdAndUpdate(
      companyId || lease.companyId,
      {
        $inc: {
          revenue: paymentCommissionDetails.agencyShare,
        },
      }
    );

    // Update agent commission
    await User.findByIdAndUpdate(
      lease.tenantId, // Use tenant ID since no agent ID
      {
        $inc: {
          commission: paymentCommissionDetails.agentShare,
        },
      }
    );

    // If it's a rental payment, update property owner's balance
    if (property.ownerId) {
      await User.findByIdAndUpdate(
        property.ownerId,
        {
          $inc: {
            balance: paymentCommissionDetails.ownerAmount,
          },
        }
      );
    }

    // Update property arrears after payment
    if (property.currentArrears !== undefined) {
      const arrears = property.currentArrears - amount;
      await Property.findByIdAndUpdate(property._id, { currentArrears: arrears < 0 ? 0 : arrears });
    }

    res.status(201).json({
      message: 'Payment processed successfully',
      payment,
    });
  } catch (error) {
    console.error('Error processing payment:', error);
    res.status(500).json({
      message: 'Failed to process payment',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Create a new payment (for accountant dashboard - handles PaymentFormData structure)
export const createPaymentAccountant = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  const currentUser = req.user as JwtPayload;

  type CreateResult = { payment: IPayment } | { error: { status: number; message: string } };

  // Helper to perform the actual create logic, with optional transaction session
  const performCreate = async (user: JwtPayload, session?: mongoose.ClientSession): Promise<CreateResult> => {
    const {
      paymentType,
      propertyType,
      paymentDate,
      paymentMethod,
      amount,
      depositAmount,
      referenceNumber,
      notes,
      currency,
      rentalPeriodMonth,
      rentalPeriodYear,
      rentUsed,
      commissionDetails,
      manualPropertyAddress,
      manualTenantName,
    } = req.body as any;
    // Extract optional advance fields
    const { advanceMonthsPaid, advancePeriodStart, advancePeriodEnd } = (req.body as any);

    // Safely extract ids (string or nested {_id})
    const extractId = (v: any): string | undefined => {
      if (!v) return undefined;
      if (typeof v === 'string') return v;
      if (typeof v === 'object' && (v._id || v.id)) return v._id || v.id;
      return undefined;
    };

    const rawPropertyId = extractId((req.body as any).propertyId);
    const rawTenantId = extractId((req.body as any).tenantId);
    const rawAgentId = extractId((req.body as any).agentId) || user.userId;
    const rawProcessedBy = extractId((req.body as any).processedBy) || user.userId;
    const rawLeaseId = extractId((req.body as any).leaseId);
    const rawOwnerId = extractId((req.body as any).ownerId);
    const rawSaleId = extractId((req.body as any).saleId);

    // Validate required fields
    if (!amount || !paymentDate) {
      return { error: { status: 400, message: 'Missing required fields: amount and paymentDate' } };
    }
    
    // Check if using manual entries
    const manualProperty = typeof rawPropertyId === 'string' && rawPropertyId.startsWith('manual_');
    const manualTenant = typeof rawTenantId === 'string' && rawTenantId.startsWith('manual_');
    
    // Validate manual entries
    if (manualProperty && !manualPropertyAddress) {
      return { error: { status: 400, message: 'Manual property address is required when using manual property entry' } };
    }
    if (manualTenant && !manualTenantName) {
      return { error: { status: 400, message: 'Manual tenant name is required when using manual tenant entry' } };
    }
    
    // Validate that either propertyId/tenantId are provided or manual entries are used
    if (!rawPropertyId && !manualPropertyAddress) {
      return { error: { status: 400, message: 'Either propertyId or manual property address is required' } };
    }
    if (!rawTenantId && !manualTenantName) {
      return { error: { status: 400, message: 'Either tenantId or manual tenant name is required' } };
    }

    // Validate ObjectId formats when not manual
    if (!manualProperty && rawPropertyId && !mongoose.Types.ObjectId.isValid(rawPropertyId)) {
      return { error: { status: 400, message: 'Invalid propertyId format' } };
    }
    if (!manualTenant && rawTenantId && !mongoose.Types.ObjectId.isValid(rawTenantId)) {
      return { error: { status: 400, message: 'Invalid tenantId format' } };
    }
    if (rawAgentId && !mongoose.Types.ObjectId.isValid(rawAgentId)) {
      return { error: { status: 400, message: 'Invalid agentId format' } };
    }
    if (rawProcessedBy && !mongoose.Types.ObjectId.isValid(rawProcessedBy)) {
      return { error: { status: 400, message: 'Invalid processedBy format' } };
    }
    if (rawLeaseId && !mongoose.Types.ObjectId.isValid(rawLeaseId)) {
      return { error: { status: 400, message: 'Invalid leaseId format' } };
    }
    if (rawSaleId && !mongoose.Types.ObjectId.isValid(rawSaleId)) {
      return { error: { status: 400, message: 'Invalid saleId format' } };
    }
    if (rawOwnerId && !mongoose.Types.ObjectId.isValid(rawOwnerId)) {
      return { error: { status: 400, message: 'Invalid ownerId format' } };
    }

    // Calculate commission if not provided
    let finalCommissionDetails = commissionDetails;
    if (!finalCommissionDetails) {
      try {
        // Use property's current commission percent when a real property is provided
        if (!manualProperty && rawPropertyId) {
          const prop = await Property.findById(new mongoose.Types.ObjectId(rawPropertyId));
          const commissionPercent = typeof prop?.commission === 'number'
            ? prop.commission
            : ((propertyType || 'residential') === 'residential' ? 15 : 10);
          finalCommissionDetails = await calculateCommission(
            amount,
            commissionPercent,
            new mongoose.Types.ObjectId(user.companyId)
          ) as any;
        } else {
          // Manual entries have no linked property; fall back to default base rates
          const commissionPercent = (propertyType || 'residential') === 'residential' ? 15 : 10;
          finalCommissionDetails = await calculateCommission(
            amount,
            commissionPercent,
            new mongoose.Types.ObjectId(user.companyId)
          ) as any;
        }
      } catch (err) {
        // As a safety net, fall back to default split if anything goes wrong
        const baseCommissionRate = (propertyType || 'residential') === 'residential' ? 15 : 10;
        const totalCommission = (amount * baseCommissionRate) / 100;
        const preaFee = totalCommission * 0.03;
        const remainingCommission = totalCommission - preaFee;
        const agentShare = remainingCommission * 0.6;
        const agencyShare = remainingCommission * 0.4;
        finalCommissionDetails = {
          totalCommission,
          preaFee,
          agentShare,
          agencyShare,
          ownerAmount: amount - totalCommission,
        } as any;
      }
    }

    // Determine provisional flags
    const markProvisional = Boolean(manualProperty || manualTenant);
    // Create payment record
    const payment = new Payment({
      paymentType: paymentType || 'rental',
      propertyType: propertyType || 'residential',
      propertyId: manualProperty ? new mongoose.Types.ObjectId() : new mongoose.Types.ObjectId(rawPropertyId!), // Generate new ID for manual entries
      tenantId: manualTenant ? new mongoose.Types.ObjectId() : new mongoose.Types.ObjectId(rawTenantId!), // Generate new ID for manual entries
      agentId: new mongoose.Types.ObjectId(rawAgentId),
      companyId: new mongoose.Types.ObjectId(user.companyId),
      paymentDate: new Date(paymentDate),
      paymentMethod,
      amount,
      depositAmount: depositAmount || 0,
      rentalPeriodMonth,
      rentalPeriodYear,
      referenceNumber: referenceNumber || `RCPT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      notes: notes || '',
      processedBy: new mongoose.Types.ObjectId(rawProcessedBy),
      commissionDetails: finalCommissionDetails,
      status: 'completed',
      currency: currency || 'USD',
      leaseId: rawLeaseId ? new mongoose.Types.ObjectId(rawLeaseId) : undefined,
      rentUsed,
      advanceMonthsPaid: advanceMonthsPaid || 1,
      advancePeriodStart: advanceMonthsPaid && advanceMonthsPaid > 1 ? advancePeriodStart : undefined,
      advancePeriodEnd: advanceMonthsPaid && advanceMonthsPaid > 1 ? advancePeriodEnd : undefined,
      // Add manual entry fields
      manualPropertyAddress: manualProperty ? manualPropertyAddress : undefined,
      manualTenantName: manualTenant ? manualTenantName : undefined,
      // Provisional flags
      isProvisional: markProvisional,
      isInSuspense: markProvisional,
      commissionFinalized: !markProvisional,
      provisionalRelationshipType: markProvisional ? 'unknown' : undefined,
      saleId: rawSaleId ? new mongoose.Types.ObjectId(rawSaleId) : undefined,
    });
    // Save and related updates (with or without session)
    await payment.save(session ? { session } : undefined);

    // If depositAmount > 0, record in rentaldeposits (ledger)
    if (payment.depositAmount && payment.depositAmount > 0) {
      const { RentalDeposit } = await import('../models/rentalDeposit');
      const deposit = new RentalDeposit({
        propertyId: payment.propertyId,
        agentId: payment.agentId,
        companyId: payment.companyId,
        tenantId: payment.tenantId,
        depositAmount: payment.depositAmount,
        depositDate: payment.paymentDate,
        paymentId: payment._id,
        type: 'payment',
        referenceNumber: payment.referenceNumber,
        notes: notes || '',
        processedBy: payment.processedBy,
        paymentMethod
      } as any);
      await deposit.save(session ? { session } : undefined);
    }

    // Post company revenue and agent commission only if not provisional
    if (!payment.isProvisional) {
      await Company.findByIdAndUpdate(
        new mongoose.Types.ObjectId(user.companyId),
        { $inc: { revenue: finalCommissionDetails.agencyShare } },
        session ? { session } : undefined
      );

      await User.findByIdAndUpdate(
        new mongoose.Types.ObjectId(rawAgentId || user.userId),
        { $inc: { commission: finalCommissionDetails.agentShare } },
        session ? { session } : undefined
      );
    }

    if (!payment.isProvisional) {
      if (paymentType === 'rental' && rawOwnerId) {
        await User.findByIdAndUpdate(
          new mongoose.Types.ObjectId(rawOwnerId),
          { $inc: { balance: finalCommissionDetails.ownerAmount } },
          session ? { session } : undefined
        );
      }
    }

    try {
      // Skip recording income in property accounts until finalized if provisional
      if (!payment.isProvisional) {
        await propertyAccountService.recordIncomeFromPayment(payment._id.toString());
      }
    } catch (error) {
      console.error('Failed to record income in property account:', error);
    }

    return { payment };
  };

  let session: mongoose.ClientSession | null = null;
  let useTransaction = false;

  try {
    // Try to use a transaction; if unsupported, we will fallback
    try {
      session = await mongoose.startSession();
      session.startTransaction();
      useTransaction = true;
    } catch (e) {
      console.warn('Transactions not supported or failed to start. Proceeding without transaction.', e);
    }

    const result: CreateResult = await performCreate(currentUser, session || undefined);
    if ('error' in result && result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    if (useTransaction && session) {
      await session.commitTransaction();
    }

    if ('payment' in result) {
      return res.status(201).json({
        message: 'Payment processed successfully',
        payment: result.payment,
      });
    }
    return res.status(500).json({ message: 'Unknown error creating payment' });
  } catch (error: any) {
    if (useTransaction && session) {
      try { await session.abortTransaction(); } catch {}
    }
    // Fallback: if error is due to transactions not supported, retry without session
    if (error?.code === 20 /* IllegalOperation */ || /Transaction numbers are only allowed/.test(String(error?.message))) {
      try {
        const result: CreateResult = await performCreate(currentUser);
        if ('error' in result && result.error) {
          return res.status(result.error.status).json({ message: result.error.message });
        }
        if ('payment' in result) {
          return res.status(201).json({
            message: 'Payment processed successfully',
            payment: result.payment,
          });
        }
        return res.status(500).json({ message: 'Unknown error creating payment' });
      } catch (fallbackErr: any) {
        console.error('Fallback create payment failed:', fallbackErr);
        return res.status(500).json({
          message: 'Failed to process payment',
          error: fallbackErr instanceof Error ? fallbackErr.message : 'Unknown error',
        });
      }
    }
    console.error('Error processing payment:', error);
    return res.status(500).json({
      message: 'Failed to process payment',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  } finally {
    if (session) {
      try { session.endSession(); } catch {}
    }
  }
};

// Create a sales payment explicitly (no rental validations, paymentType fixed to 'introduction')
export const createSalesPaymentAccountant = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const user = req.user as JwtPayload;
    const {
      paymentDate,
      paymentMethod,
      amount,
      referenceNumber,
      notes,
      currency,
      commissionDetails,
      manualPropertyAddress,
      manualTenantName,
      propertyId,
      tenantId,
      agentId,
      processedBy,
      saleId,
      rentalPeriodMonth,
      rentalPeriodYear,
      saleMode
    } = req.body as any;

    if (!amount || !paymentDate || !paymentMethod) {
      return res.status(400).json({ message: 'Missing required fields: amount, paymentDate, paymentMethod' });
    }

    const toObjectId = (v?: string) => (v && mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(v) : undefined);
    const propId = toObjectId(propertyId);
    const tenId = toObjectId(tenantId);
    const agId = toObjectId(agentId) || new mongoose.Types.ObjectId(user.userId);
    const procBy = toObjectId(processedBy) || new mongoose.Types.ObjectId(user.userId);
    const saleObjId = toObjectId(saleId);

    // Calculate commission if not provided
    let finalCommissionDetails = commissionDetails;
    if (!finalCommissionDetails) {
      try {
        let percent = 15;
        if (propId) {
          const prop = await Property.findById(propId);
          percent = typeof prop?.commission === 'number' ? (prop as any).commission : 15;
        }
        finalCommissionDetails = await (async () => {
          const c = await (async () => {
            const { totalCommission, preaFee, agentShare, agencyShare, ownerAmount } = await (await calculateCommission(amount, percent, new mongoose.Types.ObjectId(user.companyId))) as any;
            return { totalCommission, preaFee, agentShare, agencyShare, ownerAmount };
          })();
          return c;
        })();
      } catch {
        const base = (amount * 0.15);
        const prea = base * 0.03;
        const remaining = base - prea;
        finalCommissionDetails = {
          totalCommission: base,
          preaFee: prea,
          agentShare: remaining * 0.6,
          agencyShare: remaining * 0.4,
          ownerAmount: amount - base,
        } as any;
      }
    }

    const manualProperty = !propId && manualPropertyAddress;
    const manualTenant = !tenId && manualTenantName;

    const jsDate = new Date(paymentDate);
    const periodMonth = Number(rentalPeriodMonth ?? (jsDate.getMonth() + 1));
    const periodYear = Number(rentalPeriodYear ?? jsDate.getFullYear());

    const payment = new Payment({
      paymentType: 'sale',
      saleMode: (saleMode === 'installment' ? 'installment' : 'quick'),
      propertyType: 'residential',
      propertyId: propId || new mongoose.Types.ObjectId(),
      tenantId: tenId || new mongoose.Types.ObjectId(),
      agentId: agId,
      companyId: new mongoose.Types.ObjectId(user.companyId),
      paymentDate: new Date(paymentDate),
      paymentMethod,
      amount,
      depositAmount: 0,
      referenceNumber: referenceNumber || `SALE-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      notes: notes || '',
      processedBy: procBy,
      commissionDetails: finalCommissionDetails,
      status: 'completed',
      currency: currency || 'USD',
      rentalPeriodMonth: periodMonth,
      rentalPeriodYear: periodYear,
      // Manual fields
      manualPropertyAddress: manualProperty ? manualPropertyAddress : undefined,
      manualTenantName: manualTenant ? manualTenantName : undefined,
      // Sales linkage
      saleId: saleObjId,
    });

    await payment.save();

    // Post company and agent shares
    try {
      await Company.findByIdAndUpdate(new mongoose.Types.ObjectId(user.companyId), { $inc: { revenue: (finalCommissionDetails as any).agencyShare || 0 } });
      await User.findByIdAndUpdate(agId, { $inc: { commission: (finalCommissionDetails as any).agentShare || 0 } });
    } catch (e) {
      console.warn('Non-fatal: commission posting failed', e);
    }

    // Record income in property accounts
    try { await propertyAccountService.recordIncomeFromPayment(payment._id.toString()); } catch (e) { console.warn('Non-fatal: property account record failed', e); }

    return res.status(201).json({ message: 'Sales payment processed successfully', payment });
  } catch (error: any) {
    console.error('Error creating sales payment:', error);
    return res.status(500).json({ message: 'Failed to process sales payment', error: error?.message || 'Unknown error' });
  }
};

export const updatePayment = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const payment = await Payment.findOneAndUpdate(
      { 
        _id: req.params.id,
        companyId: req.user.companyId 
      },
      req.body,
      { new: true }
    );
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }
    res.json(payment);
  } catch (error) {
    console.error('Error updating payment:', error);
    res.status(500).json({ message: 'Error updating payment' });
  }
};

export const deletePayment = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const payment = await Payment.findOneAndDelete({
      _id: req.params.id,
      companyId: req.user.companyId
    });
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }
    res.json({ message: 'Payment deleted successfully' });
  } catch (error) {
    console.error('Error deleting payment:', error);
    res.status(500).json({ message: 'Error deleting payment' });
  }
};

// Get all payments for a company
export const getCompanyPayments = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const query: any = { companyId: req.user.companyId };
    // Exclude provisional from company payments by default (visible in accountant page via dedicated filters)
    if (req.query.includeProvisional !== 'true') {
      query.isProvisional = { $ne: true };
    }
    // Optional: filter for deposits only
    if (req.query.onlyDeposits === 'true') {
      query.depositAmount = { $gt: 0 };
    }
    // Date filtering
    if (req.query.startDate || req.query.endDate) {
      query.paymentDate = {} as any;
      if (req.query.startDate) {
        (query.paymentDate as any).$gte = new Date(String(req.query.startDate));
      }
      if (req.query.endDate) {
        (query.paymentDate as any).$lte = new Date(String(req.query.endDate));
      }
    }
    // Status filter
    if (req.query.status) {
      query.status = req.query.status;
    }
    // Payment method filter
    if (req.query.paymentMethod) {
      query.paymentMethod = req.query.paymentMethod;
    }
    // Property filter
    if (req.query.propertyId) {
      try {
        query.propertyId = new mongoose.Types.ObjectId(String(req.query.propertyId));
      } catch {
        // ignore invalid id
      }
    }

    // Pagination controls
    const paginate = String(req.query.paginate || 'false') === 'true';
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.max(1, Math.min(200, parseInt(String(req.query.limit || '25'), 10)));

    const baseQuery = Payment.find(query).sort({ paymentDate: -1 });

    if (paginate) {
      const [items, total] = await Promise.all([
        baseQuery
          .select('paymentDate paymentType propertyId amount paymentMethod status referenceNumber currency tenantId isProvisional')
          .lean()
          .skip((page - 1) * limit)
          .limit(limit),
        Payment.countDocuments(query),
      ]);
      const pages = Math.max(1, Math.ceil(total / limit));
      return res.json({ items, total, page, pages });
    }

    // Non-paginated fallback (legacy)
    const payments = await baseQuery
      .populate('propertyId', 'name')
      .populate('tenantId', 'firstName lastName')
      .populate('agentId', 'name');

    return res.json(payments);
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({
      message: 'Failed to fetch payments',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Get payment details
export const getPaymentDetails = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const payment = await Payment.findById(req.params.id)
      .populate('propertyId', 'name')
      .populate('tenantId', 'firstName lastName')
      .populate('agentId', 'name')
      .populate('processedBy', 'name');

    if (!payment) {
      return res.status(404).json({
        message: 'Payment not found',
      });
    }

    // Check if user has access to this payment
    if (payment.companyId.toString() !== req.user.companyId) {
      return res.status(403).json({
        message: 'Access denied',
      });
    }

    res.json(payment);
  } catch (error) {
    console.error('Error fetching payment details:', error);
    res.status(500).json({
      message: 'Failed to fetch payment details',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Update payment status
export const updatePaymentStatus = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const { status } = req.body;

    if (!['pending', 'completed', 'failed'].includes(status)) {
      return res.status(400).json({
        message: 'Invalid status',
      });
    }

    const payment = await Payment.findById(req.params.id);

    if (!payment) {
      return res.status(404).json({
        message: 'Payment not found',
      });
    }

    // Check if user has access to this payment
    if (payment.companyId.toString() !== req.user.companyId) {
      return res.status(403).json({
        message: 'Access denied',
      });
    }

    payment.status = status;
    await payment.save();

    res.json({
      message: 'Payment status updated successfully',
      payment,
    });
  } catch (error) {
    console.error('Error updating payment status:', error);
    res.status(500).json({
      message: 'Failed to update payment status',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Public endpoint for admin dashboard - no authentication required
export const getPaymentsPublic = async (req: Request, res: Response) => {
  try {
    console.log('Public payments request:', {
      query: req.query,
      headers: req.headers
    });

    // Get company ID from query params or headers (for admin dashboard)
    const companyId = req.query.companyId as string || req.headers['x-company-id'] as string;
    
    let query: any = {};
    
    // Filter by company ID if provided
    if (companyId) {
      query.companyId = new mongoose.Types.ObjectId(companyId);
    }

    // Additional filtering options
    if (req.query.status) {
      query.status = req.query.status;
    }

    if (req.query.paymentType) {
      query.paymentType = req.query.paymentType;
    }

    if (req.query.paymentMethod) {
      query.paymentMethod = req.query.paymentMethod;
    }

    if (req.query.propertyId) {
      query.propertyId = new mongoose.Types.ObjectId(req.query.propertyId as string);
    }

    // Filter by agentId when provided (ensure only that agent's payments are returned)
    if (req.query.agentId) {
      try {
        query.agentId = new mongoose.Types.ObjectId(req.query.agentId as string);
      } catch {
        // Ignore invalid ObjectId to avoid throwing on public endpoint
      }
    }

    // Date filtering
    if (req.query.startDate || req.query.endDate) {
      query.paymentDate = {};
      if (req.query.startDate) {
        query.paymentDate.$gte = new Date(req.query.startDate as string);
      }
      if (req.query.endDate) {
        query.paymentDate.$lte = new Date(req.query.endDate as string);
      }
    }

    console.log('Public payments query:', query);

    const payments = await Payment.find(query)
      .populate('propertyId', 'name address')
      .populate('tenantId', 'firstName lastName')
      .populate('agentId', 'firstName lastName')
      .sort({ paymentDate: -1 });

    console.log(`Found ${payments.length} payments`);

    res.json({
      status: 'success',
      data: payments,
      count: payments.length,
      companyId: companyId || null
    });
  } catch (error) {
    console.error('Error fetching payments (public):', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching payments',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Public endpoint for getting a single payment by ID - no authentication required
export const getPaymentByIdPublic = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const companyId = req.query.companyId as string || req.headers['x-company-id'] as string;
    
    console.log('Public payment by ID request:', {
      id,
      companyId,
      query: req.query,
      headers: req.headers
    });

    let query: any = { _id: id };
    
    // Filter by company ID if provided
    if (companyId) {
      query.companyId = new mongoose.Types.ObjectId(companyId);
    }

    console.log('Public payment by ID query:', query);

    const payment = await Payment.findOne(query)
      .populate('propertyId', 'name address')
      .populate('tenantId', 'firstName lastName')
      .populate('agentId', 'firstName lastName');

    if (!payment) {
      return res.status(404).json({
        status: 'error',
        message: 'Payment not found',
        id,
        companyId: companyId || null
      });
    }

    console.log('Found payment:', { id: payment._id, amount: payment.amount });

    res.json({
      status: 'success',
      data: payment
    });
  } catch (error) {
    console.error('Error fetching payment by ID (public):', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching payment',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Public endpoint for creating payments (for admin dashboard) - no authentication required
export const createPaymentPublic = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    console.log('Public payment creation request:', {
      body: req.body,
      headers: req.headers
    });

    const {
      leaseId,
      amount,
      paymentDate,
      paymentMethod,
      status,
      companyId,
      rentalPeriodMonth,
      rentalPeriodYear,
      advanceMonthsPaid,
      advancePeriodStart,
      advancePeriodEnd,
    } = req.body;

    // Validate required fields
    if (!leaseId || !amount || !paymentDate || !paymentMethod || !status) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields: leaseId, amount, paymentDate, paymentMethod, status',
      });
    }

    // Get lease details to extract property and tenant information
    const lease = await Lease.findById(leaseId);
    if (!lease) {
      return res.status(404).json({
        status: 'error',
        message: 'Lease not found',
      });
    }

    // Get property details
    const property = await Property.findById(lease.propertyId);
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }
    const rent = property.rent || lease.rentAmount;
    // For advance payments, validate amount
    if (advanceMonthsPaid && advanceMonthsPaid > 1) {
      const expectedAmount = rent * advanceMonthsPaid;
      if (amount !== expectedAmount) {
        return res.status(400).json({
          status: 'error',
          message: `Amount must equal rent (${rent}) x months (${advanceMonthsPaid}) = ${expectedAmount}`
        });
      }
    } else {
      // For single month, validate amount
      if (amount !== rent) {
        return res.status(400).json({
          status: 'error',
          message: `Amount must equal rent (${rent}) for the selected month.`
        });
      }
    }
    // Calculate commission based on property commission percentage
    const publicCommissionDetails = await calculateCommission(amount, property.commission || 0, new mongoose.Types.ObjectId(lease.companyId));

    // Create payment record
    const payment = new Payment({
      amount,
      paymentDate,
      paymentMethod,
      status,
      companyId: companyId || lease.companyId,
      paymentType: 'rental',
      propertyType: 'residential', // Default value
      propertyId: lease.propertyId,
      tenantId: lease.tenantId,
      agentId: lease.tenantId, // Use tenant ID as agent ID since lease doesn't have agentId
      processedBy: lease.tenantId, // Use tenant ID as processedBy since no agent ID
      depositAmount: 0, // Default value
      rentalPeriodMonth,
      rentalPeriodYear,
      advanceMonthsPaid,
      advancePeriodStart,
      advancePeriodEnd,
      referenceNumber: '', // Placeholder, will update after save
      notes: '', // Default empty notes
      commissionDetails: publicCommissionDetails,
      rentUsed: rent, // Store the rent used for this payment
    });

    await payment.save();
    payment.referenceNumber = `RCPT-${payment._id.toString().slice(-6).toUpperCase()}-${rentalPeriodYear}-${String(rentalPeriodMonth).padStart(2, '0')}`;
    await payment.save();

    // If depositAmount > 0, record in rentaldeposits
    if (payment.depositAmount && payment.depositAmount > 0) {
      const { RentalDeposit } = require('../models/rentalDeposit');
      await RentalDeposit.create({
        propertyId: payment.propertyId,
        agentId: payment.agentId,
        companyId: payment.companyId,
        tenantId: payment.tenantId,
        depositAmount: payment.depositAmount,
        depositDate: payment.paymentDate,
        paymentId: payment._id,
      });
    }

    console.log('Payment created successfully:', { id: payment._id, amount: payment.amount });

    res.status(201).json({
      status: 'success',
      data: payment,
      message: 'Payment created successfully'
    });
  } catch (error) {
    console.error('Error creating payment (public):', error);
    res.status(500).json({
      status: 'error',
      message: 'Error creating payment',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Public endpoint for downloading a payment receipt as blob (no authentication required)
export const getPaymentReceiptDownload = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const companyId = req.query.companyId as string || req.headers['x-company-id'] as string;
    
    console.log('Payment receipt download request:', {
      id,
      companyId,
      query: req.query,
      headers: req.headers
    });

    let query: any = { _id: id };
    
    // Filter by company ID if provided
    if (companyId) {
      query.companyId = new mongoose.Types.ObjectId(companyId);
    }

    console.log('Payment receipt download query:', query);

    const payment = await Payment.findOne(query)
      .populate('propertyId', 'name address')
      .populate('tenantId', 'firstName lastName email')
      .populate('agentId', 'firstName lastName')
      .populate('processedBy', 'firstName lastName');

    if (!payment) {
      return res.status(404).json({
        status: 'error',
        message: 'Payment not found',
        id,
        companyId: companyId || null
      });
    }

    // Get company details if available
    let company = null;
    if (payment.companyId) {
      company = await Company.findById(payment.companyId).select(
        'name address phone email website registrationNumber tinNumber vatNumber logo description'
      );
    }

    // Generate HTML receipt with logo
    const htmlReceipt = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Payment Receipt - ${payment.referenceNumber}</title>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; color: #333; }
            .receipt { max-width: 600px; margin: 0 auto; border: 1px solid #ccc; padding: 20px; background: white; }
            .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
            .company-logo { max-width: 150px; max-height: 60px; margin-bottom: 10px; display: block; margin-left: auto; margin-right: auto; }
            .company-name { font-size: 24px; font-weight: bold; margin: 10px 0; }
            .company-details { font-size: 12px; color: #666; margin: 5px 0; }
            .receipt-number { font-size: 18px; font-weight: bold; color: #333; margin-top: 15px; }
            .amount { font-size: 28px; font-weight: bold; color: #2e7d32; text-align: center; margin: 20px 0; padding: 10px; background: #f5f5f5; border-radius: 5px; }
            .details { margin: 20px 0; }
            .detail-row { display: flex; justify-content: space-between; margin: 8px 0; border-bottom: 1px solid #eee; padding-bottom: 5px; }
            .label { font-weight: bold; color: #666; min-width: 120px; }
            .value { color: #333; text-align: right; }
            .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #eee; padding-top: 15px; }
            @media print { body { margin: 0; } .receipt { border: none; } }
          </style>
        </head>
        <body>
          <div class="receipt">
            <div class="header">
              ${company?.logo ? `<img src="data:image/png;base64,${company.logo}" alt="Company Logo" class="company-logo">` : ''}
              <div class="company-name">${company?.name || 'Property Management'}</div>
              <div class="company-details">${company?.address || 'Address not available'}</div>
              <div class="company-details">Phone: ${company?.phone || 'Phone not available'} | Email: ${company?.email || 'Email not available'}</div>
              ${company?.website ? `<div class="company-details">Website: ${company.website}</div>` : ''}
              ${company?.registrationNumber ? `<div class="company-details">Reg. No: ${company.registrationNumber}</div>` : ''}
              ${company?.tinNumber ? `<div class="company-details">Tax No: ${company.tinNumber}</div>` : ''}
              <div class="receipt-number">Receipt #${payment.referenceNumber}</div>
            </div>
            
            <div class="amount">$${payment.amount?.toFixed(2) || '0.00'}</div>
            
            <div class="details">
              <div class="detail-row">
                <span class="label">Payment Date:</span>
                <span class="value">${new Date(payment.paymentDate).toLocaleDateString()}</span>
              </div>
              <div class="detail-row">
                <span class="label">Payment Method:</span>
                <span class="value">${payment.paymentMethod?.replace('_', ' ').toUpperCase() || 'N/A'}</span>
              </div>
              <div class="detail-row">
                <span class="label">Status:</span>
                <span class="value">${payment.status?.toUpperCase() || 'N/A'}</span>
              </div>
              <div class="detail-row">
                <span class="label">Property:</span>
                <span class="value">${(payment.propertyId as any)?.name || 'N/A'}</span>
              </div>
              <div class="detail-row">
                <span class="label">Tenant:</span>
                <span class="value">${(payment.tenantId as any)?.firstName} ${(payment.tenantId as any)?.lastName}</span>
              </div>
              <div class="detail-row">
                <span class="label">Agent:</span>
                <span class="value">${(payment.agentId as any)?.firstName} ${(payment.agentId as any)?.lastName || 'N/A'}</span>
              </div>
              <div class="detail-row">
                <span class="label">Processed By:</span>
                <span class="value">${(payment.processedBy as any)?.firstName} ${(payment.processedBy as any)?.lastName || 'N/A'}</span>
              </div>
              ${payment.notes ? `
              <div class="detail-row">
                <span class="label">Notes:</span>
                <span class="value">${payment.notes}</span>
              </div>
              ` : ''}
            </div>
            
            <div class="footer">
              <p>Thank you for your payment!</p>
              <p>Generated on ${new Date().toLocaleString()}</p>
            </div>
          </div>
        </body>
      </html>
    `;

    console.log('Generated HTML receipt for payment:', { id: payment._id, amount: payment.amount });

    // Set headers for HTML file download
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename="receipt-${payment.referenceNumber || payment._id}.html"`);
    
    res.send(htmlReceipt);
  } catch (error) {
    console.error('Error generating payment receipt download:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error generating receipt download',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Public endpoint for getting a payment receipt for printing
export const getPaymentReceipt = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const companyId = req.query.companyId as string || req.headers['x-company-id'] as string;
    
    console.log('Payment receipt request:', {
      id,
      companyId,
      query: req.query,
      headers: req.headers
    });

    let query: any = { _id: id };
    
    // Filter by company ID if provided
    if (companyId) {
      query.companyId = new mongoose.Types.ObjectId(companyId);
    }

    console.log('Payment receipt query:', query);

    const payment = await Payment.findOne(query)
      .populate('propertyId', 'name address')
      .populate('tenantId', 'firstName lastName email')
      .populate('agentId', 'firstName lastName')
      .populate('processedBy', 'firstName lastName');

    if (!payment) {
      return res.status(404).json({
        status: 'error',
        message: 'Payment not found',
        id,
        companyId: companyId || null
      });
    }

    // Get company details if available
    let company = null;
    if (payment.companyId) {
      company = await Company.findById(payment.companyId).select(
        'name address phone email website registrationNumber tinNumber vatNumber logo description'
      );
    }

    // Create receipt data
    const receipt = {
      receiptNumber: payment.referenceNumber,
      paymentDate: payment.paymentDate,
      amount: payment.amount,
      currency: 'USD', // Default currency
      paymentMethod: payment.paymentMethod,
      status: payment.status,
      property: payment.propertyId,
      tenant: payment.tenantId,
      agent: payment.agentId,
      processedBy: payment.processedBy,
      company: company,
      commissionDetails: payment.commissionDetails,
      notes: payment.notes,
      createdAt: payment.createdAt,
      // Include manual entry fields
      manualPropertyAddress: payment.manualPropertyAddress,
      manualTenantName: payment.manualTenantName
    };

    console.log('Generated receipt for payment:', { id: payment._id, amount: payment.amount });

    res.json({
      status: 'success',
      data: receipt
    });
  } catch (error) {
    console.error('Error generating payment receipt:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error generating receipt',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}; 

// Finalize a provisional payment by linking to real property/tenant and posting commissions
export const finalizeProvisionalPayment = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {

    const { id } = req.params;
    const {
      propertyId,
      tenantId,
      ownerId,
      relationshipType, // 'management' | 'introduction'
      overrideCommissionPercent
    } = req.body as {
      propertyId: string;
      tenantId: string;
      ownerId?: string;
      relationshipType?: 'management' | 'introduction';
      overrideCommissionPercent?: number;
    };

    if (!propertyId || !tenantId) {
      return res.status(400).json({ message: 'propertyId and tenantId are required' });
    }

    // Validate ObjectId formats to prevent cast errors
    try {
      new mongoose.Types.ObjectId(propertyId);
      new mongoose.Types.ObjectId(tenantId);
      if (ownerId) new mongoose.Types.ObjectId(ownerId);
    } catch {
      return res.status(400).json({ message: 'Invalid id format supplied' });
    }

    const payment = await Payment.findOne({ _id: id, companyId: req.user.companyId });
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }
    if (!payment.isProvisional) {
      return res.status(400).json({ message: 'Payment is not provisional' });
    }

    // Agents can only finalize their own provisional manual payments
    if ((req.user as any).role === 'agent') {
      if (String(payment.agentId) !== String((req.user as any).userId)) {
        return res.status(403).json({ message: 'Agents may only finalize their own provisional payments' });
      }
    }

    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }

    const commissionPercent = typeof overrideCommissionPercent === 'number' ? overrideCommissionPercent : (property.commission || 0);
    const finalCommission = await calculateCommission(
      payment.amount,
      commissionPercent,
      new mongoose.Types.ObjectId(req.user.companyId)
    );

    payment.propertyId = new mongoose.Types.ObjectId(propertyId) as any;
    payment.tenantId = new mongoose.Types.ObjectId(tenantId) as any;
    if (ownerId) {
      (payment as any).ownerId = new mongoose.Types.ObjectId(ownerId);
    }
    payment.commissionDetails = finalCommission as any;
    payment.isProvisional = false;
    payment.isInSuspense = false;
    payment.commissionFinalized = true;
    payment.provisionalRelationshipType = (relationshipType as any) || payment.provisionalRelationshipType || 'unknown';
    (payment as any).finalizedAt = new Date();
    (payment as any).finalizedBy = new mongoose.Types.ObjectId(req.user.userId);

    await payment.save();

    await Company.findByIdAndUpdate(
      new mongoose.Types.ObjectId(req.user.companyId),
      { $inc: { revenue: finalCommission.agencyShare } },
      {}
    );

    await User.findByIdAndUpdate(
      new mongoose.Types.ObjectId(payment.agentId),
      { $inc: { commission: finalCommission.agentShare } },
      {}
    );

    if (payment.paymentType === 'rental' && (ownerId || (property as any).ownerId)) {
      await User.findByIdAndUpdate(
        new mongoose.Types.ObjectId(ownerId || ((property as any).ownerId)),
        { $inc: { balance: finalCommission.ownerAmount } },
        {}
      );
    }

    try {
      await propertyAccountService.recordIncomeFromPayment(payment._id.toString());
    } catch (err) {
      console.error('Failed to record income in property account during finalize:', err);
    }

    // Return populated payment so the UI can immediately show property/tenant details
    const populated = await Payment.findById(payment._id)
      .populate('propertyId', 'name address')
      .populate('tenantId', 'firstName lastName')
      .populate('agentId', 'firstName lastName');

    return res.json({ message: 'Payment finalized successfully', payment: populated || payment });
  } catch (error: any) {
    console.error('Error finalizing provisional payment:', error);
    return res.status(500).json({ message: 'Failed to finalize payment', error: error?.message || 'Unknown error' });
  } finally {
    // no-op
  }
};
