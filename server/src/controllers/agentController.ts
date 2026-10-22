import { Request, Response } from 'express';
import { Property, IProperty } from '../models/Property';
import { Tenant } from '../models/Tenant';
import { Lease } from '../models/Lease';
import { Payment } from '../models/Payment';
import { LevyPayment } from '../models/LevyPayment';
import File, { IFile } from '../models/File';
import { PropertyOwner } from '../models/PropertyOwner';
import { User } from '../models/User';
import { AppError } from '../middleware/errorHandler';
import mongoose from 'mongoose';
import agentAccountService from '../services/agentAccountService';
import { sendAgentPaymentNotificationEmail } from '../services/agentPaymentNotificationService';
import { notifyOwnerOfRentPayment } from '../services/ownerRentNotificationService';
import { acquireRentalPeriodGuardsForPayment, findCoveredAdvanceMonth, sumRentalPeriodReservation } from '../services/rentalPeriodCoverage';
import { findLiveIdempotentPayment } from '../services/paymentIdempotency';
import { ensureLeaseInspectionSchedule } from '../services/inspectionAutomationService';
import { sanitizePropertyVatSettings } from '../services/propertyCommissionCalculator';
import { CommissionService, applyLevyPassThroughToSnapshot } from '../services/commissionService';
import { centralVatRateBlock, commissionVatFlagsFromPolicy, resolveCommissionVatPolicy, stampVatDecision } from '../services/vatPolicyService';
import { openReview } from '../services/taxObligationService';
import { initialAccountingIntegrityFields, ensureDepositLedgerFromPayment } from '../services/paymentAccountingReconciliation';
import { COMPLETED_PAYMENT_IMMUTABLE_MESSAGE, assertCompletedPaymentFinanciallyImmutable } from '../services/paymentFinancialImmutability';
import { prepareIntroductionRentalCommission } from '../services/introductionCommissionService';
import { introductionContextErrorResponse } from '../services/introductionLeaseContext';
import { salePaymentIncompleteResponse, validateSalePaymentCompleteness } from '../services/salePaymentCompleteness';
import { callerCanAccessProperty, callerCanMutatePropertyOwner, propertyIdsForCaller } from '../utils/propertyAccess';
import { safeAttachmentFilename } from '../utils/contentDisposition';

async function visiblePropertyIdList(req: Request): Promise<mongoose.Types.ObjectId[] | null> {
  const ids = await propertyIdsForCaller(req);
  return ids === 'company' ? null : ids;
}

async function propertiesAreVisible(req: Request, propertyIds: string[]): Promise<boolean> {
  for (const id of propertyIds) {
    if (!(await callerCanAccessProperty(req, String(id)))) return false;
  }
  return true;
}

const activePropertyVisibilityFilter = {
  isDeleted: { $ne: true },
  propertyOperationalStatus: { $ne: 'Archived' }
};

// Get properties managed by the agent
export const getAgentProperties = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      throw new AppError('Authentication required', 401);
    }
    if (!req.user?.companyId) {
      throw new AppError('Company ID not found. Please ensure you are associated with a company.', 400);
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log('Fetching properties for agent:', {
        companyId: req.user.companyId,
        userId: req.user.userId,
        role: req.user.role
      });
    }

    // Get only properties where the agent is the owner (ownerId matches the agent's userId)
    const showDeleted = String(req.query.deleted || '').toLowerCase() === 'true';
    const visibleIds = await visiblePropertyIdList(req);
    const query: any = {
      companyId: new mongoose.Types.ObjectId(req.user.companyId),
      isDeleted: showDeleted ? true : { $ne: true }
    };
    if (visibleIds) query._id = { $in: visibleIds };
    if (!showDeleted) {
      query.propertyOperationalStatus = { $ne: 'Archived' };
    }
    
    if (process.env.NODE_ENV !== 'production') {
      console.log('Agent properties query:', query);
    }
    
    const properties = await Property.find(query)
    .populate('ownerId', 'firstName lastName email')
    .populate('propertyOwnerId', 'firstName lastName email phone')
    .sort({ createdAt: -1 }); // Sort by newest first

    if (process.env.NODE_ENV !== 'production') {
      console.log('Found properties for agent:', {
        count: properties.length,
        agentId: req.user.userId
      });
    }

    res.json(properties);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Error fetching agent properties:', error);
    res.status(500).json({ message: 'Error fetching properties' });
  }
};

// Get a single property owner by id within the agent's company
export const getAgentPropertyOwnerById = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      throw new AppError('Authentication required', 401);
    }
    if (!req.user?.companyId) {
      throw new AppError('Company ID not found. Please ensure you are associated with a company.', 400);
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid owner ID format.' });
    }

    const owner = await PropertyOwner.findOne({
      _id: new mongoose.Types.ObjectId(id),
      companyId: new mongoose.Types.ObjectId(req.user.companyId)
    }).populate('properties', 'name address');

    if (!owner) {
      return res.status(404).json({ message: 'Property owner not found' });
    }
    const visible = await visiblePropertyIdList(req);
    if (visible) {
      const linked = (owner.properties || []).some((id: any) => visible.some((row) => String(row) === String(id?._id || id)));
      const byField = await Property.exists({
        _id: { $in: visible },
        propertyOwnerId: owner._id,
        companyId: req.user.companyId,
      });
      if (!linked && !byField) {
        return res.status(404).json({ message: 'Property owner not found' });
      }
    }

    res.json(owner);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Error fetching agent property owner by id:', error);
    res.status(500).json({ message: 'Error fetching property owner' });
  }
};

// Get tenants managed by the agent
export const getAgentTenants = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      throw new AppError('Authentication required', 401);
    }
    if (!req.user?.companyId) {
      throw new AppError('Company ID not found', 400);
    }

    // Fetch properties managed by this agent
    const visibleIds = await visiblePropertyIdList(req);
    const ownedProperties = await Property.find({
      companyId: new mongoose.Types.ObjectId(req.user.companyId),
      ...(visibleIds ? { _id: { $in: visibleIds } } : {}),
      ...activePropertyVisibilityFilter
    })
      .select('_id')
      .lean();
    const ownedPropertyIds = ownedProperties.map((p: any) => p._id);
    const activePropertyIdSet = new Set(ownedPropertyIds.map((id: any) => String(id)));

    // Get tenants either created by this agent OR linked to the agent's properties
    const tenants = await Tenant.find({
      companyId: new mongoose.Types.ObjectId(req.user.companyId),
      $or: [
        { ownerId: new mongoose.Types.ObjectId(req.user.userId) },
        { propertyId: { $in: ownedPropertyIds } },
        { propertyIds: { $in: ownedPropertyIds } }
      ]
    })
      .populate('propertyId', 'name address')
      .sort({ createdAt: -1 });

    const visibleTenants = tenants.filter((tenant: any) => {
      const linkedPropertyIds = [
        tenant.propertyId?._id || tenant.propertyId,
        ...(Array.isArray(tenant.propertyIds) ? tenant.propertyIds : [])
      ].filter(Boolean).map((id: any) => String(id));

      return linkedPropertyIds.length === 0 || linkedPropertyIds.some((id: string) => activePropertyIdSet.has(id));
    });

    res.json(visibleTenants);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Error fetching agent tenants:', error);
    res.status(500).json({ message: 'Error fetching tenants' });
  }
};

// Get leases managed by the agent
export const getAgentLeases = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      throw new AppError('Authentication required', 401);
    }
    if (!req.user?.companyId) {
      throw new AppError('Company ID not found', 400);
    }

    const visibleIds = await visiblePropertyIdList(req);
    const activePropertyIds = await Property.find({
      companyId: new mongoose.Types.ObjectId(req.user.companyId),
      ...(visibleIds ? { _id: { $in: visibleIds } } : {}),
      ...activePropertyVisibilityFilter
    }).distinct('_id');

    const leases = await Lease.find({ 
      companyId: new mongoose.Types.ObjectId(req.user.companyId),
      propertyId: { $in: activePropertyIds as any }
    })
    .populate('propertyId', 'name address')
    .populate('tenantId', 'firstName lastName email')
    .populate('previousLeaseId', 'startDate endDate status')
    .populate('successorLeaseId', 'startDate endDate status')
    .sort({ createdAt: -1 });

    res.json(leases);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Error fetching agent leases:', error);
    res.status(500).json({ message: 'Error fetching leases' });
  }
};

// Get files uploaded by the agent
export const getAgentFiles = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      throw new AppError('Authentication required', 401);
    }
    if (!req.user?.companyId) {
      throw new AppError('Company ID not found', 400);
    }

    // Determine properties that belong to this agent within the company
    const visibleIds = await visiblePropertyIdList(req);
    const agentPropertyIds = await Property.find({
      companyId: new mongoose.Types.ObjectId(req.user.companyId),
      ...(visibleIds ? { _id: { $in: visibleIds } } : {}),
      ...activePropertyVisibilityFilter
    }).distinct('_id');

    // Fetch files where propertyId is within the agent's properties and scoped to company
    const files = await File.find({
      companyId: new mongoose.Types.ObjectId(req.user.companyId),
      propertyId: { $in: agentPropertyIds as any }
    })
      .populate('propertyId', 'name address')
      .populate('uploadedBy', 'firstName lastName email')
      .sort({ uploadedAt: -1 });

    // Normalize/format for client
    const formatted = files.map((f: any) => ({
      _id: f._id,
      propertyId: f.propertyId?._id || f.propertyId,
      propertyName: f.propertyId?.name || 'N/A',
      fileName: f.fileName,
      fileType: f.fileType,
      fileUrl: f.fileUrl,
      uploadedAt: f.uploadedAt,
      uploadedByName: f.uploadedBy ? `${f.uploadedBy.firstName || ''} ${f.uploadedBy.lastName || ''}`.trim() || 'Unknown' : 'Unknown'
    }));

    res.json(formatted);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Error fetching agent files:', error);
    res.status(500).json({ message: 'Error fetching files' });
  }
};

// Get agent's monthly commission
export const getAgentCommission = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      throw new AppError('Authentication required', 401);
    }
    if (!req.user?.companyId) {
      throw new AppError('Company ID not found', 400);
    }

    // Current period (0-based month)
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const visibleIds = await visiblePropertyIdList(req);
    const activePropertyIds = await Property.find({
      companyId: new mongoose.Types.ObjectId(req.user.companyId),
      ...(visibleIds ? { _id: { $in: visibleIds } } : {}),
      ...activePropertyVisibilityFilter
    }).distinct('_id');

    // Fetch completed payments for this agent in this company
    const payments = await Payment.find({
      agentId: new mongoose.Types.ObjectId(req.user.userId),
      companyId: new mongoose.Types.ObjectId(req.user.companyId),
      propertyId: { $in: activePropertyIds as any },
      status: 'completed'
    }).select('commissionDetails paymentDate rentalPeriodMonth rentalPeriodYear advanceMonthsPaid advancePeriodStart advancePeriodEnd');

    let monthlyCommission = 0;

    for (const payment of payments as any[]) {
      // Determine covered rental months for this payment
      const coveredMonths: { year: number; month: number }[] = [];

      const advanceMonths = payment.advanceMonthsPaid as number | undefined;
      const startPeriod = payment.advancePeriodStart as { month: number; year: number } | undefined;
      const endPeriod = payment.advancePeriodEnd as { month: number; year: number } | undefined;

      if (advanceMonths && advanceMonths > 1 && startPeriod && endPeriod) {
        let y = startPeriod.year;
        let m0 = startPeriod.month - 1; // convert to 0-based
        const endY = endPeriod.year;
        const endM0 = endPeriod.month - 1;
        while (y < endY || (y === endY && m0 <= endM0)) {
          coveredMonths.push({ year: y, month: m0 });
          m0 += 1;
          if (m0 > 11) { m0 = 0; y += 1; }
        }
      } else if (typeof payment.rentalPeriodYear === 'number' && typeof payment.rentalPeriodMonth === 'number') {
        const y = payment.rentalPeriodYear as number;
        const m0 = (payment.rentalPeriodMonth as number) - 1;
        if (m0 >= 0 && m0 <= 11) {
          coveredMonths.push({ year: y, month: m0 });
        }
      }

      // Fallback to paymentDate month/year if rental period is not set
      if (coveredMonths.length === 0) {
        const d = new Date(payment.paymentDate);
        coveredMonths.push({ year: d.getFullYear(), month: d.getMonth() });
      }

      const totalAgentShare = payment.commissionDetails?.agentShare || 0;
      const perMonthAgentShare = coveredMonths.length > 0 ? totalAgentShare / coveredMonths.length : 0;

      // Sum only for the current month/year
      coveredMonths.forEach(({ year, month }) => {
        if (year === currentYear && month === currentMonth) {
          monthlyCommission += perMonthAgentShare;
        }
      });
    }

    res.json({ monthlyCommission });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Error calculating agent commission:', error);
    res.status(500).json({ message: 'Error calculating commission' });
  }
};

// Create a new property for the agent
export const createAgentProperty = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      throw new AppError('Authentication required', 401);
    }
    if (!req.user?.companyId) {
      throw new AppError('Company ID not found. Please ensure you are associated with a company.', 400);
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log('Agent creating property:', {
        userId: req.user.userId,
        companyId: req.user.companyId,
        role: req.user.role
      });
    }

    // Validate required fields
    if (!req.body.name || !req.body.address) {
      throw new AppError('Missing required fields: Name and address are required', 400);
    }

    // Validate property type if provided
    if (req.body.type && !['apartment', 'house', 'commercial'].includes(req.body.type)) {
      throw new AppError('Invalid property type: Must be one of: apartment, house, commercial', 400);
    }
    if (req.body.agentId) {
      const assigned = await User.findOne({ _id: req.body.agentId, companyId: req.user.companyId }).select('_id');
      if (!assigned) {
        throw new AppError('Assigned agent was not found in this company', 400);
      }
    }

    const vatSettings = sanitizePropertyVatSettings(req.body || {});
    const propertyData = {
      ...req.body,
      ownerId: new mongoose.Types.ObjectId(req.user.userId), // Creating user. This is not the landlord.
      agentId: req.body?.agentId || new mongoose.Types.ObjectId(req.user.userId),
      companyId: new mongoose.Types.ObjectId(req.user.companyId),
      status: req.body.status || 'available',
      type: req.body.type || 'apartment',
      description: req.body.description || '',
      rent: req.body.rent || 0,
      bedrooms: req.body.bedrooms || 0,
      bathrooms: req.body.bathrooms || 0,
      area: req.body.area || 0,
      images: req.body.images || [],
      amenities: req.body.amenities || [],
      createdAt: new Date(),
      updatedAt: new Date(),
      rentalType: req.body.rentalType,
      commission: req.body.commission,
      vatOnCommission: vatSettings.vatOnCommission,
      vatCommissionTreatment: vatSettings.vatCommissionTreatment
    };
    delete (propertyData as any).vatRate;
    delete (propertyData as any).vatPercentOnCommission;

    if (process.env.NODE_ENV !== 'production') {
      console.log('Creating property with data:', {
        name: (propertyData as any)?.name,
        companyId: (propertyData as any)?.companyId
      });
    }

    const property = new Property(propertyData);
    const savedProperty = await property.save();

    if (process.env.NODE_ENV !== 'production') {
      console.log('Property created successfully:', {
        id: savedProperty._id,
        name: savedProperty.name
      });
    }

    res.status(201).json(savedProperty);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Error creating agent property:', error);
    res.status(500).json({ message: 'Error creating property' });
  }
}; 

// Create a new tenant for the agent
export const createAgentTenant = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    if (!req.user?.companyId) {
      return res.status(400).json({ message: 'Company ID not found. Please ensure you are associated with a company.' });
    }

    // Only allow agents
    if (req.user.role !== 'agent') {
      return res.status(403).json({ message: 'Only agents can create tenants via this endpoint.' });
    }

    const { firstName, lastName, email, phone, propertyId, propertyIds, status, idNumber, emergencyContact } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email || !phone) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    // Validate property ownership for single or multiple properties
    if (Array.isArray(propertyIds) && propertyIds.length > 0) {
      const ids = propertyIds.map((id: any) => new mongoose.Types.ObjectId(String(id)));
      const visible = await visiblePropertyIdList(req);
      const allowedIds = visible
        ? ids.filter((id: mongoose.Types.ObjectId) => visible.some((row) => String(row) === String(id)))
        : ids;
      const ownedCount = await Property.countDocuments({
        _id: { $in: allowedIds },
        companyId: new mongoose.Types.ObjectId(req.user.companyId)
      });
      if (ownedCount !== ids.length) {
        return res.status(403).json({ message: 'You can only add tenants to your own properties.' });
      }
    } else {
      // Ensure the property belongs to this agent (single)
      const property = (await callerCanAccessProperty(req, String(propertyId)))
      ? await Property.findOne({ _id: new mongoose.Types.ObjectId(propertyId), companyId: new mongoose.Types.ObjectId(req.user.companyId) })
      : null;
      if (!property) {
        return res.status(403).json({ message: 'You can only add tenants to your own properties.' });
      }
    }

    // Check for existing tenant with same email in this company
    const existingTenant = await Tenant.findOne({ email, companyId: new mongoose.Types.ObjectId(req.user.companyId) });
    if (existingTenant) {
      return res.status(400).json({ message: 'Tenant with this email already exists' });
    }

    // Additionally check for duplicate by company + idNumber + name (case-insensitive)
    if (idNumber) {
      const existingByIdNumber = await Tenant.findOne({ idNumber, companyId: new mongoose.Types.ObjectId(req.user.companyId) });
      if (existingByIdNumber) {
        const sameFirst = (existingByIdNumber.firstName || '').toLowerCase() === (firstName || '').toLowerCase();
        const sameLast = (existingByIdNumber.lastName || '').toLowerCase() === (lastName || '').toLowerCase();
        if (sameFirst && sameLast) {
          return res.status(409).json({ message: 'Tenant already in database' });
        }
      }
    }

    const tenantData: any = {
      firstName,
      lastName,
      email,
      phone,
      companyId: new mongoose.Types.ObjectId(req.user.companyId),
      status: status || 'Active',
      propertyId: propertyId ? new mongoose.Types.ObjectId(propertyId) : undefined,
      ownerId: new mongoose.Types.ObjectId(req.user.userId), // Set the agent as the owner
      idNumber,
      emergencyContact
    };

    if (Array.isArray(propertyIds) && propertyIds.length > 0) {
      tenantData.propertyIds = propertyIds.map((id: any) => new mongoose.Types.ObjectId(String(id)));
      if (!propertyId) delete tenantData.propertyId;
    }

    const newTenant = new Tenant(tenantData);
    await newTenant.save();

    // Mark property/properties as rented
    if (Array.isArray(tenantData.propertyIds) && tenantData.propertyIds.length > 0) {
      await Property.updateMany({ _id: { $in: tenantData.propertyIds } }, { status: 'rented' });
    } else if (propertyId) {
      await Property.findByIdAndUpdate(new mongoose.Types.ObjectId(propertyId), { status: 'rented' });
    }

    res.status(201).json(newTenant);
  } catch (error) {
    console.error('Error creating agent tenant:', error);
    res.status(500).json({ message: 'Error creating tenant' });
  }
}; 

// Create a new lease for the agent
export const createAgentLease = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    if (!req.user?.companyId) {
      return res.status(400).json({ message: 'Company ID not found. Please ensure you are associated with a company.' });
    }

    // Only allow agents
    if (req.user.role !== 'agent') {
      return res.status(403).json({ message: 'Only agents can create leases via this endpoint.' });
    }

    const { propertyId, tenantId, startDate, endDate, rentAmount, depositAmount, monthlyRent, securityDeposit, status, monthlyRent: rent, securityDeposit: deposit, petDeposit, isPetAllowed, maxOccupants, isUtilitiesIncluded, utilitiesDetails, rentDueDay, lateFee, gracePeriod, previousLeaseId } = req.body;

    // Use monthlyRent/securityDeposit if rentAmount/depositAmount are not provided
    const finalRentAmount = rentAmount !== undefined ? rentAmount : monthlyRent;
    const finalDepositAmount = depositAmount !== undefined ? depositAmount : securityDeposit;

    // Validate required fields
    if (!propertyId || !tenantId || !startDate || !endDate || finalRentAmount === undefined || finalRentAmount === null || finalDepositAmount === undefined || finalDepositAmount === null) {
      return res.status(400).json({ 
        error: 'Missing required fields: propertyId, tenantId, startDate, endDate, rentAmount, depositAmount',
        received: { propertyId, tenantId, startDate, endDate, rentAmount: finalRentAmount, depositAmount: finalDepositAmount }
      });
    }

    // Check if amounts are valid numbers
    if (isNaN(Number(finalRentAmount)) || isNaN(Number(finalDepositAmount))) {
      return res.status(400).json({ 
        error: 'Rent amount and deposit amount must be valid numbers',
        received: { rentAmount: finalRentAmount, depositAmount: finalDepositAmount }
      });
    }

    // Ensure the property belongs to this agent
    const property = (await callerCanAccessProperty(req, String(propertyId)))
      ? await Property.findOne({ _id: new mongoose.Types.ObjectId(propertyId), companyId: new mongoose.Types.ObjectId(req.user.companyId) })
      : null;
    if (!property) {
      return res.status(403).json({ message: 'You can only create leases for your own properties.' });
    }

    // Ensure the tenant exists and belongs to the same company
    const tenant = await Tenant.findOne({ _id: new mongoose.Types.ObjectId(tenantId), companyId: new mongoose.Types.ObjectId(req.user.companyId) });
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found or does not belong to your company.' });
    }

    // Validate date ranges
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    if (startDateObj >= endDateObj) {
      return res.status(400).json({ error: 'End date must be after start date' });
    }

    // Validate numeric fields
    if (Number(finalRentAmount) < 0 || Number(finalDepositAmount) < 0) {
      return res.status(400).json({ error: 'Rent amount and deposit amount must be non-negative' });
    }

    const leaseData = {
      propertyId: new mongoose.Types.ObjectId(propertyId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
      startDate: startDateObj,
      endDate: endDateObj,
      rentAmount: Number(finalRentAmount),
      depositAmount: Number(finalDepositAmount),
      status: status || 'active',
      companyId: new mongoose.Types.ObjectId(req.user.companyId),
      ownerId: new mongoose.Types.ObjectId(req.user.userId), // Set the agent as the owner
      previousLeaseId: previousLeaseId && mongoose.Types.ObjectId.isValid(previousLeaseId) ? new mongoose.Types.ObjectId(previousLeaseId) : null,
      billingStatus: 'current',
      billingRules: {
        frequency: 'monthly' as const,
        rentDueDay: Number(rentDueDay || 1),
        escalationPercent: Number(req.body.escalationPercent || req.body.billingRules?.escalationPercent || 0),
        escalationFrequencyMonths: Number(req.body.escalationFrequencyMonths || req.body.billingRules?.escalationFrequencyMonths || 12),
        nextEscalationDate: req.body.nextEscalationDate || req.body.billingRules?.nextEscalationDate
          ? new Date(req.body.nextEscalationDate || req.body.billingRules.nextEscalationDate)
          : undefined,
        recurringLevies: Number(req.body.recurringLevies || req.body.billingRules?.recurringLevies || 0),
        recurringServiceCharges: Number(req.body.recurringServiceCharges || req.body.billingRules?.recurringServiceCharges || 0),
        prorateMoveIn: req.body.prorateMoveIn ?? req.body.billingRules?.prorateMoveIn ?? true,
      },
      financialSummary: {
        totalBilled: 0,
        totalPaid: 0,
        outstandingBalance: 0,
        depositHeld: Number(finalDepositAmount),
        penalties: 0,
        moveOutSettlement: 0,
      },
      
      // Additional fields with defaults
      monthlyRent: Number(monthlyRent || finalRentAmount),
      securityDeposit: Number(securityDeposit || finalDepositAmount),
      petDeposit: Number(petDeposit || 0),
      isPetAllowed: Boolean(isPetAllowed || false),
      maxOccupants: Number(maxOccupants || 1),
      isUtilitiesIncluded: Boolean(isUtilitiesIncluded || false),
      utilitiesDetails: utilitiesDetails || '',
      rentDueDay: Number(rentDueDay || 1),
      lateFee: Number(lateFee || 0),
      gracePeriod: Number(gracePeriod || 0)
    };

    const lease = new Lease(leaseData);
    await lease.save();
    if (leaseData.previousLeaseId) {
      await Lease.findByIdAndUpdate(leaseData.previousLeaseId, {
        successorLeaseId: lease._id,
        status: 'renewed',
        lifecycleStatusChangedAt: new Date()
      });
    }
    if (lease.status === 'active' || lease.status === 'pending_approval') {
      ensureLeaseInspectionSchedule(lease as any, property.name || property.address || 'Property').catch((error) => {
        console.error('Failed to create agent lease inspection schedule:', error);
      });
    }

    // Mark property as rented
    await Property.findByIdAndUpdate(new mongoose.Types.ObjectId(propertyId), { status: 'rented' });

    res.status(201).json(lease);
  } catch (error) {
    console.error('Error creating agent lease:', error);
    res.status(500).json({ message: 'Error creating lease' });
  }
};

// Update a property owned by the agent
export const updateAgentProperty = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      throw new AppError('Authentication required', 401);
    }
    if (!req.user?.companyId) {
      throw new AppError('Company ID not found. Please ensure you are associated with a company.', 400);
    }

    const propertyId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(propertyId)) {
      return res.status(400).json({ message: 'Invalid property ID format.' });
    }

    // Ensure the property belongs to this agent and company
    if (!(await callerCanAccessProperty(req, propertyId))) {
      return res.status(404).json({ message: 'Property not found' });
    }
    const existing = await Property.findOne({
      _id: new mongoose.Types.ObjectId(propertyId),
      companyId: new mongoose.Types.ObjectId(req.user.companyId),
      isDeleted: { $ne: true }
    });

    if (!existing) {
      return res.status(404).json({ message: 'Property not found or you do not have permission to update it.' });
    }

    const allowedFields = [
      'name',
      'address',
      'type',
      'propertyCategory',
      'propertySubtype',
      'propertySpecifications',
      'propertyOperationalStatus',
      'propertyUse',
      'status',
      'description',
      'rent',
      'bedrooms',
      'bathrooms',
      'area',
      'images',
      'amenities',
      'rentalType',
      'commission',
      'vatOnCommission',
      'vatCommissionTreatment',
      // Allow updating levy/municipal fields
      'levyOrMunicipalType',
      'levyOrMunicipalAmount'
    ] as const;
    const updateData: any = { updatedAt: new Date() };
    for (const key of allowedFields) {
      if (key in req.body) updateData[key] = (req.body as any)[key];
    }
    if ('vatOnCommission' in req.body || 'vatCommissionTreatment' in req.body) {
      const vatSettings = sanitizePropertyVatSettings({
        vatOnCommission: 'vatOnCommission' in req.body ? req.body.vatOnCommission : existing.vatOnCommission,
        vatCommissionTreatment: 'vatCommissionTreatment' in req.body ? req.body.vatCommissionTreatment : existing.vatCommissionTreatment
      });
      updateData.vatOnCommission = vatSettings.vatOnCommission;
      updateData.vatCommissionTreatment = vatSettings.vatCommissionTreatment;
    }

    const updated = await Property.findByIdAndUpdate(
      new mongoose.Types.ObjectId(propertyId),
      updateData,
      { new: true }
    );

    return res.json(updated);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Error updating agent property:', error);
    res.status(500).json({ message: 'Error updating property' });
  }
};

// Archive a property owned by the agent without using the delete lifecycle
export const archiveAgentProperty = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      throw new AppError('Authentication required', 401);
    }
    if (!req.user?.companyId) {
      throw new AppError('Company ID not found. Please ensure you are associated with a company.', 400);
    }

    const propertyId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(propertyId)) {
      return res.status(400).json({ message: 'Invalid property ID format.' });
    }
    if (!(await callerCanAccessProperty(req, propertyId))) {
      return res.status(404).json({ message: 'Property not found' });
    }

    const property = await Property.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(propertyId),
        companyId: new mongoose.Types.ObjectId(req.user.companyId),
        isDeleted: { $ne: true }
      },
      {
        $set: {
          propertyOperationalStatus: 'Archived',
          archivedAt: new Date(),
          archivedBy: new mongoose.Types.ObjectId(req.user.userId),
          updatedAt: new Date()
        }
      },
      { new: true }
    );

    if (!property) {
      return res.status(404).json({ message: 'Property not found or already deleted.' });
    }

    return res.json({ message: 'Property archived successfully.', property });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Error archiving agent property:', error);
    return res.status(500).json({ message: 'Error archiving property' });
  }
};

// Soft delete a property owned by the agent
export const deleteAgentProperty = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      throw new AppError('Authentication required', 401);
    }
    if (!req.user?.companyId) {
      throw new AppError('Company ID not found. Please ensure you are associated with a company.', 400);
    }

    const propertyId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(propertyId)) {
      return res.status(400).json({ message: 'Invalid property ID format.' });
    }
    if (!(await callerCanAccessProperty(req, propertyId))) {
      return res.status(404).json({ message: 'Property not found' });
    }

    const property = await Property.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(propertyId),
        companyId: new mongoose.Types.ObjectId(req.user.companyId),
        isDeleted: { $ne: true }
      },
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: new mongoose.Types.ObjectId(req.user.userId),
          updatedAt: new Date()
        }
      },
      { new: true }
    );

    if (!property) {
      return res.status(404).json({ message: 'Property not found or already deleted.' });
    }

    return res.json({ message: 'Property moved to deleted properties.', property });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Error deleting agent property:', error);
    return res.status(500).json({ message: 'Error deleting property' });
  }
};

// Restore a soft-deleted property owned by the agent
export const restoreAgentProperty = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      throw new AppError('Authentication required', 401);
    }
    if (!req.user?.companyId) {
      throw new AppError('Company ID not found. Please ensure you are associated with a company.', 400);
    }

    const propertyId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(propertyId)) {
      return res.status(400).json({ message: 'Invalid property ID format.' });
    }
    if (!(await callerCanAccessProperty(req, propertyId, { includeDeleted: true }))) {
      return res.status(404).json({ message: 'Property not found' });
    }

    const property = await Property.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(propertyId),
        companyId: new mongoose.Types.ObjectId(req.user.companyId),
        isDeleted: true
      },
      {
        $set: {
          isDeleted: false,
          deletedAt: null,
          deletedBy: null,
          updatedAt: new Date()
        }
      },
      { new: true }
    );

    if (!property) {
      return res.status(404).json({ message: 'Deleted property not found.' });
    }

    return res.json({ message: 'Property restored successfully.', property });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Error restoring agent property:', error);
    return res.status(500).json({ message: 'Error restoring property' });
  }
};

// Create a new payment for the agent
export const createAgentPayment = async (req: Request, res: Response) => {
  let releaseAgentRentalGuard: () => Promise<void> = async () => {};
  try {
    if (!req.user?.userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    if (!req.user?.companyId) {
      return res.status(400).json({ message: 'Company ID not found. Please ensure you are associated with a company.' });
    }

    // Only allow agents
    if (req.user.role !== 'agent') {
      return res.status(403).json({ message: 'Only agents can create payments via this endpoint.' });
    }

    const {
      propertyId,
      tenantId,
      leaseId,
      amount,
      paymentDate,
      paymentMethod,
      status,
      paymentType,
      propertyType,
      depositAmount,
      referenceNumber,
      notes,
      currency,
      rentalPeriodMonth,
      rentalPeriodYear,
      advanceMonthsPaid,
      advancePeriodStart,
      advancePeriodEnd,
    } = req.body;
    // Accept idempotency key from header or body
    const idempotencyKey = (req.headers?.['idempotency-key'] as string) || (req.body?.idempotencyKey as string) || undefined;

    // Validate required fields (allow deposit-only: amount=0 with depositAmount>0)
    const numericAmount = Number(amount || 0);
    const numericDeposit = Number(depositAmount || 0);
    if (!propertyId || !tenantId || !paymentDate || !paymentMethod) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields: propertyId, tenantId, paymentDate, paymentMethod',
      });
    }
    if (numericAmount <= 0 && numericDeposit <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Either amount or depositAmount must be greater than 0',
      });
    }

    // Ensure the property belongs to this agent
    const property = (await callerCanAccessProperty(req, String(propertyId)))
      ? await Property.findOne({ _id: new mongoose.Types.ObjectId(propertyId), companyId: new mongoose.Types.ObjectId(req.user.companyId) })
      : null;
    if (!property) {
      return res.status(403).json({ message: 'You can only create payments for your own properties.' });
    }

    // Ensure the tenant exists and belongs to the same company
    const tenant = await Tenant.findOne({ _id: new mongoose.Types.ObjectId(tenantId), companyId: new mongoose.Types.ObjectId(req.user.companyId) });
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found or does not belong to your company.' });
    }

    const propertyAccountService = (await import('../services/propertyAccountService')).default;
    const ledgerResolution = await propertyAccountService.resolveLedgerTypeForProperty(propertyId, 'agentController.createPayment');
    const suppliedPaymentType = paymentType ? String(paymentType).toLowerCase() : '';
    if (suppliedPaymentType === 'sale' && ledgerResolution.ledgerType !== 'sale') {
      return res.status(400).json({
        status: 'error',
        message: `Payment type sale does not match Property.rentalType (${ledgerResolution.businessType}) for property ${propertyId}`
      });
    }
    if (suppliedPaymentType && suppliedPaymentType !== 'sale' && ledgerResolution.ledgerType !== 'rental') {
      return res.status(400).json({
        status: 'error',
        message: `Payment type ${suppliedPaymentType} does not match Property.rentalType (${ledgerResolution.businessType}) for property ${propertyId}`
      });
    }
    const resolvedPaymentType = (paymentType as any) || (ledgerResolution.ledgerType === 'sale' ? 'sale' : 'rental');

    // Short-circuit for duplicate submissions using idempotency key
    if (idempotencyKey) {
      const existing = await findLiveIdempotentPayment({
        companyId: req.user.companyId,
        idempotencyKey: String(idempotencyKey)
      });
      if (existing) {
        return res.status(200).json({
          status: 'success',
          data: existing,
          message: 'Payment processed successfully'
        });
      }
    }

    // Prevent double-paying the same rental month; allow partials up to remaining
    let combinedAllocation: import('../services/combinedPaymentService').CombinedAllocationResult | null = null;
    if (resolvedPaymentType !== 'sale' && !(numericAmount <= 0 && numericDeposit > 0)) {
      releaseAgentRentalGuard = await acquireRentalPeriodGuardsForPayment({
        companyId: req.user.companyId,
        propertyId,
        tenantId,
        rentalPeriodYear,
        rentalPeriodMonth,
        advanceMonthsPaid,
        advancePeriodStart,
        advancePeriodEnd,
        paymentType: resolvedPaymentType,
        amount: numericAmount,
        depositAmount: numericDeposit,
        leaseId,
        currency,
      });
      const coveredAdvance = await findCoveredAdvanceMonth({
        companyId: req.user.companyId,
        propertyId,
        tenantId,
        rentalPeriodMonth,
        rentalPeriodYear,
        advanceMonthsPaid,
        advancePeriodStart,
        advancePeriodEnd,
        leaseId,
        currency,
      });
      if ('error' in coveredAdvance) {
        return res.status(400).json({ status: 'error', message: coveredAdvance.error, code: 'RENTAL_PERIOD_REQUIRED' });
      }
      if (coveredAdvance.covered) {
        return res.status(400).json({
          status: 'error',
          message: 'Overlapping advance payment already exists for this period.',
        });
      }
      if (idempotencyKey) {
        const existingAfterLock = await findLiveIdempotentPayment({
          companyId: req.user.companyId,
          idempotencyKey: String(idempotencyKey)
        });
        if (existingAfterLock) {
          return res.status(200).json({
            status: 'success',
            data: existingAfterLock,
            message: 'Payment processed successfully',
          });
        }
      }
    }
    if (resolvedPaymentType !== 'sale' && typeof rentalPeriodMonth === 'number' && typeof rentalPeriodYear === 'number') {
      const allocationResult = await (await import('../services/combinedPaymentService')).resolveCombinedRentalAllocation({
        companyId: new mongoose.Types.ObjectId(req.user.companyId),
        propertyId: new mongoose.Types.ObjectId(propertyId),
        tenantId: new mongoose.Types.ObjectId(tenantId),
        amount: numericAmount,
        depositAmount: numericDeposit,
        rentalPeriodMonth,
        rentalPeriodYear,
        advanceMonthsPaid: Number(advanceMonthsPaid || 1),
        advancePeriodStart,
        advancePeriodEnd,
        leaseId,
        currency,
        rentUsed: typeof (req.body as any).rentUsed === 'number' ? Number((req.body as any).rentUsed) : Number((property as any)?.rent || 0),
        levyUsed: typeof (req.body as any).levyUsed === 'number' ? Number((req.body as any).levyUsed) : undefined,
      });
      if ('status' in allocationResult) {
        return res.status(allocationResult.status).json({
          status: 'error',
          message: allocationResult.message,
        });
      }
      combinedAllocation = allocationResult;

      if (!combinedAllocation.hasLevy) {
      const rent = (property as any)?.rent || 0;
      if (advanceMonthsPaid && advanceMonthsPaid > 1) {
        if (rent > 0) {
          const expectedAmount = rent * advanceMonthsPaid;
          if (Number(amount) !== expectedAmount) {
            return res.status(400).json({
              status: 'error',
              message: `Amount must equal rent (${rent}) x months (${advanceMonthsPaid}) = ${expectedAmount}`
            });
          }
        }
      } else if (rent > 0) {
        const alreadyPaid = await sumRentalPeriodReservation({
          companyId: req.user.companyId,
          propertyId,
          tenantId,
          rentalPeriodYear,
          rentalPeriodMonth,
          currency: (req.body as any).currency
        });
        const alreadyPaidCents = Math.round(alreadyPaid * 100);
        const rentCents = Math.round((rent || 0) * 100);
        const remainingCents = rentCents - alreadyPaidCents;
        const amountCents = Math.round((Number(amount) || 0) * 100);
        const depositCents = Math.round(numericDeposit * 100);
        const isDepositOnly = amountCents === 0 && depositCents > 0;
        if (!isDepositOnly) {
          if (remainingCents <= 0) {
            return res.status(409).json({ status: 'error', message: 'This month is fully paid.' });
          }
          if (amountCents > remainingCents) {
            return res.status(400).json({ status: 'error', message: `Only ${(remainingCents/100).toFixed(2)} remains for this month. Enter an amount ≤ remaining.` });
          }
        }
      }
      }
    }

    const commissionBaseAmount = combinedAllocation ? combinedAllocation.rentAllocated : numericAmount;
    const levyAllocated = Number(combinedAllocation?.levyAllocated || 0);
    const commissionPercentage = Number(property.commission || 0);
    const isAgentRentalPayment = resolvedPaymentType !== 'sale';

    const propertyVatRequested = Boolean((property as any)?.vatOnCommission);
    const isIntroduction = String((property as any)?.rentalType || '').toLowerCase() === 'introduction';
    const commissionVatPolicy = await resolveCommissionVatPolicy({
      companyId: String(req.user.companyId),
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      property: {
        vatOnCommission: propertyVatRequested,
        vatCommissionTreatment: (property as any)?.vatCommissionTreatment
      },
      requestedVatOnCommission: propertyVatRequested,
      requestedTreatment: (property as any)?.vatCommissionTreatment,
      commissionType: isIntroduction ? 'introduction' : 'management'
    });
    const blockedVatRate = centralVatRateBlock(commissionVatPolicy);
    if (blockedVatRate) {
      return res.status(400).json({ message: blockedVatRate.message, code: blockedVatRate.code });
    }
    const commissionVat = commissionVatFlagsFromPolicy(commissionVatPolicy);
    if (commissionVatPolicy.reviewRequired && commissionVatPolicy.reviewReason) {
      await openReview({
        companyId: String(req.user.companyId),
        kind: commissionVatPolicy.reviewReason,
        title: 'VAT on commission requires review',
        detail: commissionVatPolicy.reason,
        propertyId: String(propertyId)
      });
    }

    let commissionDetails: any;
    let agentCommissionResult: Awaited<ReturnType<typeof CommissionService.calculateForProperty>> | null = null;
    let resolvedAgentIntroductionLeaseId: string | undefined = leaseId ? String(leaseId) : undefined;
    if (isAgentRentalPayment) {
      const isDepositOnly = numericAmount <= 0 && numericDeposit > 0;
      if (isIntroduction) {
        const prepared = await prepareIntroductionRentalCommission({
          companyId: req.user.companyId,
          propertyId,
          tenantId,
          leaseId,
          rentAllocated: isDepositOnly ? 0 : commissionBaseAmount,
          levyAllocated: isDepositOnly ? 0 : levyAllocated,
          vatOnCommission: commissionVat.vatOnCommission,
          vatTreatment: commissionVat.vatTreatment,
          vatRate: commissionVat.vatRate,
          paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
          propertyRent: Number((property as any)?.rent || 0)
        });
        if (!prepared.ok) {
          return res.status(400).json(introductionContextErrorResponse(prepared));
        }
        resolvedAgentIntroductionLeaseId = prepared.context.leaseId;
        agentCommissionResult = prepared.result;
        commissionDetails = prepared.snapshot;
      } else {
        agentCommissionResult = await CommissionService.calculateForProperty({
          companyId: req.user.companyId,
          grossRent: commissionBaseAmount,
          levy: 0,
          commissionPercentage,
          vatOnCommission: commissionVat.vatOnCommission,
          vatTreatment: commissionVat.vatTreatment,
          vatRate: commissionVat.vatRate,
          paymentDate: paymentDate ? new Date(paymentDate) : new Date()
        });
        commissionDetails = applyLevyPassThroughToSnapshot(
          agentCommissionResult,
          commissionBaseAmount,
          levyAllocated
        );
      }
      commissionDetails = stampVatDecision(commissionDetails, commissionVatPolicy);
    } else {
      commissionDetails = await CommissionService.calculate(
        commissionBaseAmount,
        commissionPercentage,
        new mongoose.Types.ObjectId(req.user.companyId)
      );
      if (levyAllocated > 0) {
        commissionDetails.ownerAmount = Number(commissionDetails.ownerAmount || 0) + levyAllocated;
      }
      const saleCheck = validateSalePaymentCompleteness({
        amount: commissionBaseAmount,
        commissionDetails
      });
      if (!saleCheck.ok) {
        return res.status(400).json(salePaymentIncompleteResponse(saleCheck.missing));
      }
    }

    // Create payment record
    const payment = new Payment({
      paymentType: resolvedPaymentType,
      transactionDomain: resolvedPaymentType === 'sale' ? 'SALE' : 'RENTAL',
      propertyType: propertyType || 'residential',
      propertyId: new mongoose.Types.ObjectId(propertyId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
      leaseId: resolvedAgentIntroductionLeaseId
        ? new mongoose.Types.ObjectId(resolvedAgentIntroductionLeaseId)
        : undefined,
      agentId: new mongoose.Types.ObjectId(req.user.userId), // Set the agent as the agent
      companyId: new mongoose.Types.ObjectId(req.user.companyId),
      paymentDate,
      paymentMethod,
      amount,
      depositAmount: depositAmount || 0,
      rentalPeriodMonth,
      rentalPeriodYear,
      referenceNumber: '', // Placeholder, will update after save
      notes: notes || '',
      processedBy: new mongoose.Types.ObjectId(req.user.userId),
      commissionDetails,
      applyVatOnCommission: agentCommissionResult?.vatOnCommission,
      vatOnCommissionRate: agentCommissionResult?.vatRate || 0,
      vatCommissionTreatment: agentCommissionResult?.vatTreatment,
      status: status || 'completed',
      ...initialAccountingIntegrityFields({ status: status || 'completed' }),
      currency: currency || 'USD',
      advanceMonthsPaid: advanceMonthsPaid || 1,
      advancePeriodStart: advanceMonthsPaid && advanceMonthsPaid > 1 ? advancePeriodStart : undefined,
      advancePeriodEnd: advanceMonthsPaid && advanceMonthsPaid > 1 ? advancePeriodEnd : undefined,
      rentUsed: combinedAllocation?.rentUsed ?? (req.body as any).rentUsed,
      levyUsed: combinedAllocation?.levyUsed,
      rentAllocated: combinedAllocation?.rentAllocated,
      levyAllocated: combinedAllocation?.levyAllocated,
      idempotencyKey: idempotencyKey ? String(idempotencyKey) : undefined
    });

    await payment.save();
    payment.referenceNumber = `RCPT-${payment._id.toString().slice(-6).toUpperCase()}-${rentalPeriodYear}-${String(rentalPeriodMonth).padStart(2, '0')}`;
    await payment.save();

    if (combinedAllocation?.levyAllocated && combinedAllocation.levyAllocated > 0) {
      const { createLinkedLevyPayment } = await import('../services/combinedPaymentService');
      const levyId = await createLinkedLevyPayment({
        _id: payment._id as mongoose.Types.ObjectId,
        propertyId: payment.propertyId,
        companyId: payment.companyId,
        paymentDate: payment.paymentDate,
        paymentMethod: payment.paymentMethod,
        currency: payment.currency,
        referenceNumber: payment.referenceNumber,
        notes: payment.notes,
        processedBy: payment.processedBy,
        levyAllocated: combinedAllocation.levyAllocated,
        levyUsed: combinedAllocation.levyUsed,
        rentalPeriodMonth: payment.rentalPeriodMonth,
        rentalPeriodYear: payment.rentalPeriodYear,
        advanceMonthsPaid: payment.advanceMonthsPaid,
        advancePeriodStart: payment.advancePeriodStart,
        advancePeriodEnd: payment.advancePeriodEnd,
      });
      if (levyId) {
        payment.linkedLevyPaymentId = levyId;
        await payment.save();
      }
    }

    // If depositAmount > 0, record in rentaldeposits (ledger)
    if (payment.depositAmount && payment.depositAmount > 0) {
      try {
        await ensureDepositLedgerFromPayment(payment);
      } catch (depositErr) {
        console.error('Failed to record rental deposit for agent payment:', depositErr);
        // Do not fail the payment creation if deposit ledger write fails
      }
    }

    const { ensurePaymentAccountingPosted } = await import('../services/paymentAccountingReconciliation');
    const postResult = await ensurePaymentAccountingPosted(payment._id.toString(), { createdBy: req.user.userId });
    if (postResult.accountingComplete === true && String(payment.status) === 'completed' && !payment.isProvisional) {
      void notifyOwnerOfRentPayment(payment, { accountingComplete: true });
    }

    // Notify agent by email with payment details (fire-and-forget)
    void sendAgentPaymentNotificationEmail(payment);

    res.status(201).json({
      status: 'success',
      data: payment,
      message: 'Payment processed successfully',
      receiptStatus: 'PAYMENT_RECEIVED',
      accountingComplete: postResult.accountingComplete,
      accountingStatus: postResult.accountingStatus,
      accountingState: postResult.accountingComplete ? 'ACCOUNTING_COMPLETE' : 'ACCOUNTING_INCOMPLETE'
    });
  } catch (error) {
    console.error('Error creating agent payment:', error);
    const statusCode = error instanceof AppError ? (error.statusCode || 500) : 500;
    res.status(statusCode).json({
      status: 'error',
      message: error instanceof AppError ? error.message : 'Failed to process payment',
      error: error instanceof Error ? error.message : 'Unknown error',
      ...(error instanceof AppError && error.code ? { code: error.code } : {})
    });
  } finally {
    await releaseAgentRentalGuard();
  }
};

// Update a payment for the agent
export const updateAgentPayment = async (req: Request, res: Response) => {
  try {
    if (process.env.NODE_ENV !== 'production') {
      console.log('updateAgentPayment called with:', {
        paymentId: req.params.id,
        userId: req.user?.userId,
        companyId: req.user?.companyId,
        role: req.user?.role
      });
    }

    if (!req.user?.userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    if (!req.user?.companyId) {
      return res.status(400).json({ message: 'Company ID not found. Please ensure you are associated with a company.' });
    }

    // Only allow agents
    if (req.user.role !== 'agent') {
      return res.status(403).json({ message: 'Only agents can update payments via this endpoint.' });
    }

    const paymentId = req.params.id;
    const updateData = req.body;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(paymentId)) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('Invalid ObjectId:', paymentId);
      }
      return res.status(400).json({ message: 'Invalid payment ID format.' });
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log('Looking for payment with:', {
        paymentId,
        agentId: req.user.userId,
        companyId: req.user.companyId
      });
    }

    // Find the payment and ensure it belongs to this agent
    const payment = await Payment.findOne({ 
      _id: new mongoose.Types.ObjectId(paymentId), 
      agentId: new mongoose.Types.ObjectId(req.user.userId), 
      companyId: new mongoose.Types.ObjectId(req.user.companyId) 
    });

    if (process.env.NODE_ENV !== 'production') {
      console.log('Payment found:', payment ? 'Yes' : 'No');
    }

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found or you do not have permission to update it.' });
    }

    try {
      assertCompletedPaymentFinanciallyImmutable(payment, updateData);
    } catch (immErr: any) {
      return res.status(immErr?.statusCode || 409).json({
        message: immErr?.message || COMPLETED_PAYMENT_IMMUTABLE_MESSAGE
      });
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log('Original payment:', {
        id: payment._id,
        amount: payment.amount,
        propertyType: payment.propertyType
      });
    }

    // If amount is being updated, recalculate commission from canonical calculators.
    if (updateData.amount != null && Number(updateData.amount) !== Number(payment.amount)) {
      const linkedProperty = await Property.findById(payment.propertyId);
      const nextAmount = Number(updateData.amount);
      const paymentKind = String(payment.paymentType || '').toLowerCase();
      if (paymentKind === 'sale' || paymentKind === 'sales') {
        const commissionPercentage = Number(linkedProperty?.commission || 0);
        updateData.commissionDetails = await CommissionService.calculate(
          nextAmount,
          commissionPercentage,
          new mongoose.Types.ObjectId(req.user.companyId)
        );
        const saleCheck = validateSalePaymentCompleteness({
          amount: nextAmount,
          commissionDetails: updateData.commissionDetails
        });
        if (!saleCheck.ok) {
          return res.status(400).json(salePaymentIncompleteResponse(saleCheck.missing));
        }
      } else {
        const rentAllocated = Number(
          updateData.rentAllocated ?? (payment as any).rentAllocated ?? nextAmount
        );
        const levyAllocated = Number(
          updateData.levyAllocated ?? (payment as any).levyAllocated ?? 0
        );
        const isIntroduction = String((linkedProperty as any)?.rentalType || '').toLowerCase() === 'introduction';
        const propertyVatRequested = Boolean((linkedProperty as any)?.vatOnCommission);
        const updatePaymentDate = updateData.paymentDate ? new Date(updateData.paymentDate) : payment.paymentDate;
        const commissionVatPolicy = await resolveCommissionVatPolicy({
          companyId: String(req.user.companyId),
          paymentDate: updatePaymentDate ? new Date(updatePaymentDate) : new Date(),
          property: {
            vatOnCommission: propertyVatRequested,
            vatCommissionTreatment: (linkedProperty as any)?.vatCommissionTreatment
          },
          requestedVatOnCommission: propertyVatRequested,
          requestedTreatment: (linkedProperty as any)?.vatCommissionTreatment,
          commissionType: isIntroduction ? 'introduction' : 'management'
        });
        const blockedVatRate = centralVatRateBlock(commissionVatPolicy);
        if (blockedVatRate) {
          return res.status(400).json({ message: blockedVatRate.message, code: blockedVatRate.code });
        }
        const commissionVat = commissionVatFlagsFromPolicy(commissionVatPolicy);
        if (commissionVatPolicy.reviewRequired && commissionVatPolicy.reviewReason) {
          await openReview({
            companyId: String(req.user.companyId),
            kind: commissionVatPolicy.reviewReason,
            title: 'VAT on commission requires review',
            detail: commissionVatPolicy.reason,
            propertyId: String(payment.propertyId || '')
          });
        }
        if (isIntroduction) {
          const prepared = await prepareIntroductionRentalCommission({
            companyId: req.user.companyId,
            propertyId: payment.propertyId,
            tenantId: payment.tenantId,
            leaseId: updateData.leaseId || (payment as any).leaseId,
            rentAllocated,
            levyAllocated,
            vatOnCommission: commissionVat.vatOnCommission,
            vatTreatment: commissionVat.vatTreatment,
            vatRate: commissionVat.vatRate,
            paymentDate: updatePaymentDate,
            excludePaymentId: payment._id,
            propertyRent: Number((linkedProperty as any)?.rent || 0),
            rentUsed: typeof (payment as any).rentUsed === 'number' ? Number((payment as any).rentUsed) : undefined
          });
          if (!prepared.ok) {
            return res.status(400).json(introductionContextErrorResponse(prepared));
          }
          updateData.commissionDetails = stampVatDecision(prepared.snapshot, commissionVatPolicy);
          updateData.applyVatOnCommission = prepared.result.vatOnCommission;
          updateData.vatOnCommissionRate = prepared.result.vatRate || 0;
          updateData.vatCommissionTreatment = prepared.result.vatTreatment;
          updateData.leaseId = prepared.context.leaseId;
        } else {
          const result = await CommissionService.calculateForProperty({
            companyId: req.user.companyId,
            grossRent: rentAllocated,
            levy: 0,
            commissionPercentage: Number(linkedProperty?.commission || 0),
            vatOnCommission: commissionVat.vatOnCommission,
            vatTreatment: commissionVat.vatTreatment,
            vatRate: commissionVat.vatRate,
            paymentDate: updatePaymentDate
          });
          updateData.commissionDetails = stampVatDecision(
            applyLevyPassThroughToSnapshot(result, rentAllocated, levyAllocated),
            commissionVatPolicy
          );
          updateData.applyVatOnCommission = result.vatOnCommission;
          updateData.vatOnCommissionRate = result.vatRate || 0;
          updateData.vatCommissionTreatment = result.vatTreatment;
        }
      }

      if (process.env.NODE_ENV !== 'production') {
        console.log('Recalculated commission for payment', paymentId);
      }
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log('Updating payment', paymentId);
    }

    payment.set(updateData);
    const updatedPayment = await payment.save();

    if (process.env.NODE_ENV !== 'production') {
      console.log('Payment updated successfully:', updatedPayment ? 'Yes' : 'No');
    }

    res.json({
      status: 'success',
      data: updatedPayment,
      message: 'Payment updated successfully'
    });
  } catch (error) {
    console.error('Error updating agent payment:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update payment',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Get payments for properties owned by the agent
export const getAgentPayments = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    if (!req.user?.companyId) {
      return res.status(400).json({ message: 'Company ID not found. Please ensure you are associated with a company.' });
    }

    // Find agent's property IDs
    const visibleIds = await visiblePropertyIdList(req);
    const agentPropertyIds = await Property.find({
      companyId: new mongoose.Types.ObjectId(req.user.companyId),
      ...(visibleIds ? { _id: { $in: visibleIds } } : {}),
      ...activePropertyVisibilityFilter
    }).distinct('_id');

    // Build base query
    const baseQuery: any = {
      companyId: new mongoose.Types.ObjectId(req.user.companyId),
      $or: [
        { propertyId: { $in: agentPropertyIds as any } },
        // Include agent's own provisional manual entries (not yet tied to a real property)
        { isProvisional: true, agentId: new mongoose.Types.ObjectId(req.user.userId) }
      ]
    };

    // Optional filtering
    if (req.query.provisionalOnly === 'true') {
      baseQuery.isProvisional = true;
    }
    if (req.query.status) {
      baseQuery.status = req.query.status;
    }
    if (req.query.paymentMethod) {
      baseQuery.paymentMethod = req.query.paymentMethod;
    }
    if (req.query.propertyId) {
      baseQuery.propertyId = new mongoose.Types.ObjectId(req.query.propertyId as string);
    }
    if (req.query.startDate || req.query.endDate) {
      baseQuery.paymentDate = {};
      if (req.query.startDate) baseQuery.paymentDate.$gte = new Date(req.query.startDate as string);
      if (req.query.endDate) baseQuery.paymentDate.$lte = new Date(req.query.endDate as string);
    }

    // Fetch payments for those properties or agent's provisional ones
    const payments = await Payment.find(baseQuery)
      .populate('propertyId', 'name address')
      .populate('tenantId', 'firstName lastName email')
      .populate('agentId', 'firstName lastName')
      .sort({ paymentDate: -1 });

    return res.json(payments);
  } catch (error) {
    console.error('Error fetching agent payments:', error);
    return res.status(500).json({ message: 'Error fetching payments' });
  }
};

// Get levy payments for properties owned by the agent
export const getAgentLevyPayments = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    if (!req.user?.companyId) {
      return res.status(400).json({ message: 'Company ID not found. Please ensure you are associated with a company.' });
    }

    const visibleIds = await visiblePropertyIdList(req);
    const agentPropertyIds = await Property.find({
      companyId: new mongoose.Types.ObjectId(req.user.companyId),
      ...(visibleIds ? { _id: { $in: visibleIds } } : {}),
      ...activePropertyVisibilityFilter
    }).distinct('_id');

    const levies = await LevyPayment.find({
      companyId: new mongoose.Types.ObjectId(req.user.companyId),
      propertyId: { $in: agentPropertyIds as any }
    })
      .populate('propertyId', 'name address')
      .populate('processedBy', 'firstName lastName email')
      .sort({ paymentDate: -1 });

    return res.json(levies);
  } catch (error) {
    console.error('Error fetching agent levy payments:', error);
    return res.status(500).json({ message: 'Error fetching levy payments' });
  }
};

// Create a new file for the agent
export const createAgentFile = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    if (!req.user?.companyId) {
      return res.status(400).json({ message: 'Company ID not found. Please ensure you are associated with a company.' });
    }

    // Only allow agents
    if (req.user.role !== 'agent') {
      return res.status(403).json({ message: 'Only agents can create files via this endpoint.' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const { propertyId, fileType } = req.body;

    if (!propertyId || !fileType) {
      return res.status(400).json({ 
        message: 'Missing required fields: propertyId and fileType are required'
      });
    }

    // Ensure the property belongs to this agent
    const property = (await callerCanAccessProperty(req, String(propertyId)))
      ? await Property.findOne({ _id: new mongoose.Types.ObjectId(propertyId), companyId: new mongoose.Types.ObjectId(req.user.companyId) })
      : null;
    if (!property) {
      return res.status(403).json({ message: 'You can only upload files for your own properties.' });
    }

    // Create file record
    const file = new File({
      propertyId: new mongoose.Types.ObjectId(propertyId),
      companyId: new mongoose.Types.ObjectId(req.user.companyId),
      fileName: safeAttachmentFilename(req.file.originalname),
      fileType,
      fileUrl: req.file.buffer.toString('base64'),
      uploadedBy: new mongoose.Types.ObjectId(req.user.userId),
      ownerId: new mongoose.Types.ObjectId(req.user.userId) // Set the agent as the owner
    });

    await file.save();

    res.status(201).json({
      message: 'File uploaded successfully',
      file: {
        _id: file._id,
        fileName: file.fileName,
        fileType: file.fileType,
        propertyId: file.propertyId,
        uploadedBy: file.uploadedBy,
        uploadedAt: file.uploadedAt
      }
    });
  } catch (error) {
    console.error('Error creating agent file:', error);
    res.status(500).json({ message: 'Error uploading file' });
  }
};

// Get property owners for the agent's company
export const getAgentPropertyOwners = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      throw new AppError('Authentication required', 401);
    }
    if (!req.user?.companyId) {
      throw new AppError('Company ID not found. Please ensure you are associated with a company.', 400);
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log('Fetching property owners for agent:', {
        companyId: req.user.companyId,
        userId: req.user.userId,
        role: req.user.role
      });
    }

    const visible = await visiblePropertyIdList(req);
    const ownerQuery: any = { companyId: new mongoose.Types.ObjectId(req.user.companyId) };
    if (visible) {
      const linkedOwnerIds = await Property.find({
        _id: { $in: visible },
        companyId: req.user.companyId,
        propertyOwnerId: { $exists: true },
      }).distinct('propertyOwnerId');
      ownerQuery.$or = [
        { properties: { $in: visible } },
        { _id: { $in: linkedOwnerIds } },
      ];
    }
    const owners = await PropertyOwner.find(ownerQuery).populate('properties', 'name address');

    res.json({ owners });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error fetching agent property owners:', error);
    res.status(500).json({ message: 'Error fetching property owners' });
  }
};

// Create a new property owner for the agent's company
export const createAgentPropertyOwner = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    if (!req.user?.companyId) {
      return res.status(400).json({ message: 'Company ID not found. Please ensure you are associated with a company.' });
    }

    // Only allow agents
    if (req.user.role !== 'agent') {
      return res.status(403).json({ message: 'Only agents can create property owners via this endpoint.' });
    }

    const { email, password, firstName, lastName, phone, propertyIds } = req.body;

    // Validate required fields
    if (!email || !password || !firstName || !lastName || !phone) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Check if owner already exists
    const existingOwner = await PropertyOwner.findOne({ email });
    if (existingOwner) {
      return res.status(400).json({ message: 'Property owner with this email already exists' });
    }

    if (propertyIds && propertyIds.length > 0 && !(await propertiesAreVisible(req, propertyIds))) {
      return res.status(403).json({ message: 'All properties must belong to your authorized portfolio.' });
    }

    const ownerData = {
      email,
      password,
      firstName,
      lastName,
      phone,
      companyId: req.user.companyId,
      properties: propertyIds || []
    };

    const owner = new PropertyOwner(ownerData);
    await owner.save();

    // Also create a corresponding user with role 'owner' if not already present
    try {
      const existingUser = await User.findOne({ 
        email: owner.email, 
        companyId: new mongoose.Types.ObjectId(req.user.companyId) 
      });
      if (!existingUser) {
        const newUser = new User({
          email: owner.email,
          password: password, // Will be hashed by User pre-save hook
          firstName: owner.firstName,
          lastName: owner.lastName,
          role: 'owner',
          companyId: new mongoose.Types.ObjectId(req.user.companyId),
          isActive: true
        });
        await newUser.save();
      }
    } catch (userError) {
      console.error('Error creating corresponding user for property owner:', userError);
      // Do not fail the main request if user creation fails; property owner was created successfully
    }

    // Note: Do not modify Property.ownerId here. ownerId refers to the agent (User) who owns the property.
    // The association between PropertyOwner and properties is maintained via PropertyOwner.properties only.

    res.status(201).json(owner);
  } catch (error) {
    console.error('Error creating agent property owner:', error);
    res.status(500).json({ message: 'Error creating property owner' });
  }
};

// Update a property owner for the agent's company
export const updateAgentPropertyOwner = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    if (!req.user?.companyId) {
      return res.status(400).json({ message: 'Company ID not found. Please ensure you are associated with a company.' });
    }

    // Only allow agents
    if (req.user.role !== 'agent') {
      return res.status(403).json({ message: 'Only agents can update property owners via this endpoint.' });
    }

    const { id } = req.params;
    const { firstName, lastName, email, phone, propertyIds } = req.body;

    // Find the property owner and ensure it belongs to the agent's company
    const owner = await PropertyOwner.findOne({ 
      _id: id, 
      companyId: new mongoose.Types.ObjectId(req.user.companyId) 
    });

    if (!owner || !(await callerCanMutatePropertyOwner(req, String(owner._id)))) {
      return res.status(404).json({ message: 'Property owner not found' });
    }

    if (propertyIds && propertyIds.length > 0 && !(await propertiesAreVisible(req, propertyIds))) {
      return res.status(403).json({ message: 'All properties must belong to your authorized portfolio.' });
    }
    if (propertyIds && propertyIds.length > 0) {
      const companyProperties = await Property.find({ 
        _id: { $in: propertyIds.map((id: string) => new mongoose.Types.ObjectId(id)) },
        companyId: new mongoose.Types.ObjectId(req.user.companyId)
      });
      
      if (companyProperties.length !== propertyIds.length) {
        return res.status(403).json({ message: 'All properties must belong to your company.' });
      }
    }

    // Update owner data
    const updateData: any = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (email) updateData.email = email;
    if (phone) updateData.phone = phone;
    if (propertyIds) updateData.properties = propertyIds;

    const updatedOwner = await PropertyOwner.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );

    // Note: Do not modify Property.ownerId here. Keep property ownership with the agent (User).
    // The owner-to-property linkage is handled by the PropertyOwner.properties field above.

    res.json(updatedOwner);
  } catch (error) {
    console.error('Error updating agent property owner:', error);
    res.status(500).json({ message: 'Error updating property owner' });
  }
};

// Delete a property owner for the agent's company
export const deleteAgentPropertyOwner = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    if (!req.user?.companyId) {
      return res.status(400).json({ message: 'Company ID not found. Please ensure you are associated with a company.' });
    }

    // Only allow agents
    if (req.user.role !== 'agent') {
      return res.status(403).json({ message: 'Only agents can delete property owners via this endpoint.' });
    }

    const { id } = req.params;

    // Find the property owner and ensure it belongs to the agent's company
    const owner = await PropertyOwner.findOne({ 
      _id: id, 
      companyId: new mongoose.Types.ObjectId(req.user.companyId) 
    });

    if (!owner || !(await callerCanMutatePropertyOwner(req, String(owner._id)))) {
      return res.status(404).json({ message: 'Property owner not found' });
    }

    // Delete the property owner
    await PropertyOwner.findByIdAndDelete(id);

    res.json({ message: 'Property owner deleted successfully' });
  } catch (error) {
    console.error('Error deleting agent property owner:', error);
    res.status(500).json({ message: 'Error deleting property owner' });
  }
}; 