import { Request, Response } from 'express';
import { Property, IProperty } from '../models/Property';
import { Tenant } from '../models/Tenant';
import { Lease } from '../models/Lease';
import { Payment } from '../models/Payment';
import File, { IFile } from '../models/File';
import { AppError } from '../middleware/errorHandler';
import mongoose from 'mongoose';

// Get properties managed by the agent
export const getAgentProperties = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      throw new AppError('Authentication required', 401);
    }
    if (!req.user?.companyId) {
      throw new AppError('Company ID not found. Please ensure you are associated with a company.', 400);
    }

    console.log('Fetching properties for agent:', {
      companyId: req.user.companyId,
      userId: req.user.userId,
      role: req.user.role
    });

    // Get only properties where the agent is the owner (ownerId matches the agent's userId)
    const query = { 
      companyId: new mongoose.Types.ObjectId(req.user.companyId),
      ownerId: new mongoose.Types.ObjectId(req.user.userId) // Only properties owned by this agent
    };
    
    console.log('Agent properties query:', query);
    
    // First, let's see all properties in the company to understand the data
    const allCompanyProperties = await Property.find({ companyId: req.user.companyId });
    console.log('All company properties:', {
      total: allCompanyProperties.length,
      properties: allCompanyProperties.map(p => ({
        id: p._id,
        name: p.name,
        ownerId: p.ownerId?.toString(),
        agentUserId: req.user!.userId,
        isOwnedByAgent: p.ownerId?.toString() === req.user!.userId
      }))
    });
    
    const properties = await Property.find(query)
    .populate('ownerId', 'firstName lastName email')
    .sort({ createdAt: -1 }); // Sort by newest first

    console.log('Found properties for agent:', {
      count: properties.length,
      agentId: req.user.userId,
      query: query,
      properties: properties.map(p => ({
        id: p._id,
        name: p.name,
        address: p.address,
        type: p.type,
        ownerId: p.ownerId?._id || p.ownerId, // Show the actual ID, not the populated object
        ownerIdType: typeof p.ownerId,
        companyId: p.companyId,
        status: p.status
      }))
    });

    res.json(properties);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Error fetching agent properties:', error);
    res.status(500).json({ message: 'Error fetching properties' });
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

    // Get tenants created by this agent (using ownerId)
    const tenants = await Tenant.find({ 
      companyId: new mongoose.Types.ObjectId(req.user.companyId),
      ownerId: new mongoose.Types.ObjectId(req.user.userId) // Filter by agent who created the tenant
    })
    .populate('propertyId', 'name address')
    .sort({ createdAt: -1 });

    res.json(tenants);
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

    // Get leases created by this agent (using ownerId)
    const leases = await Lease.find({ 
      companyId: new mongoose.Types.ObjectId(req.user.companyId),
      ownerId: new mongoose.Types.ObjectId(req.user.userId) // Filter by agent who created the lease
    })
    .populate('propertyId', 'name address')
    .populate('tenantId', 'firstName lastName email')
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

    // Get files uploaded by this agent (using ownerId)
    const files = await File.find({ 
      ownerId: new mongoose.Types.ObjectId(req.user.userId) // Filter by agent who uploaded the file
    })
    .populate('propertyId', 'name address')
    .populate('uploadedBy', 'firstName lastName email')
    .sort({ uploadedAt: -1 });

    res.json(files);
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

    // Get current month and year
    const now = new Date();
    const currentMonth = now.getMonth(); // 0-indexed
    const currentYear = now.getFullYear();

    // Find all payments for this agent in this company, for the current month and year
    const payments = await Payment.find({
      agentId: new mongoose.Types.ObjectId(req.user.userId),
      companyId: new mongoose.Types.ObjectId(req.user.companyId),
      status: 'completed',
      paymentDate: {
        $gte: new Date(currentYear, currentMonth, 1),
        $lt: new Date(currentYear, currentMonth + 1, 1)
      }
    });

    // Sum agentShare from commissionDetails
    const monthlyCommission = payments.reduce((sum, payment) => {
      const agentShare = payment.commissionDetails?.agentShare || 0;
      return sum + agentShare;
    }, 0);

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

    console.log('Agent creating property:', {
      userId: req.user.userId,
      companyId: req.user.companyId,
      role: req.user.role,
      body: req.body
    });

    // Validate required fields
    if (!req.body.name || !req.body.address) {
      throw new AppError('Missing required fields: Name and address are required', 400);
    }

    // Validate property type if provided
    if (req.body.type && !['apartment', 'house', 'commercial'].includes(req.body.type)) {
      throw new AppError('Invalid property type: Must be one of: apartment, house, commercial', 400);
    }

    const propertyData = {
      ...req.body,
      ownerId: new mongoose.Types.ObjectId(req.user.userId), // Agent becomes the owner
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
      commission: req.body.commission
    };

    console.log('Creating property with data:', propertyData);

    const property = new Property(propertyData);
    const savedProperty = await property.save();

    console.log('Property created successfully:', {
      id: savedProperty._id,
      name: savedProperty.name,
      address: savedProperty.address,
      type: savedProperty.type,
      ownerId: savedProperty.ownerId,
      companyId: savedProperty.companyId
    });

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

    const { firstName, lastName, email, phone, propertyId, status, idNumber, emergencyContact } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email || !phone) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    // Ensure the property belongs to this agent
    const property = await Property.findOne({ _id: new mongoose.Types.ObjectId(propertyId), ownerId: new mongoose.Types.ObjectId(req.user.userId), companyId: new mongoose.Types.ObjectId(req.user.companyId) });
    if (!property) {
      return res.status(403).json({ message: 'You can only add tenants to your own properties.' });
    }

    // Check for existing tenant with same email in this company
    const existingTenant = await Tenant.findOne({ email, companyId: new mongoose.Types.ObjectId(req.user.companyId) });
    if (existingTenant) {
      return res.status(400).json({ message: 'Tenant with this email already exists' });
    }

    const tenantData = {
      firstName,
      lastName,
      email,
      phone,
      companyId: new mongoose.Types.ObjectId(req.user.companyId),
      status: status || 'Active',
      propertyId: new mongoose.Types.ObjectId(propertyId),
      ownerId: new mongoose.Types.ObjectId(req.user.userId), // Set the agent as the owner
      idNumber,
      emergencyContact
    };

    const newTenant = new Tenant(tenantData);
    await newTenant.save();

    // Mark property as rented
    await Property.findByIdAndUpdate(new mongoose.Types.ObjectId(propertyId), { status: 'rented' });

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

    const { propertyId, tenantId, startDate, endDate, rentAmount, depositAmount, monthlyRent, securityDeposit, status, monthlyRent: rent, securityDeposit: deposit, petDeposit, isPetAllowed, maxOccupants, isUtilitiesIncluded, utilitiesDetails, rentDueDay, lateFee, gracePeriod } = req.body;

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
    const property = await Property.findOne({ _id: new mongoose.Types.ObjectId(propertyId), ownerId: new mongoose.Types.ObjectId(req.user.userId), companyId: new mongoose.Types.ObjectId(req.user.companyId) });
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

    // Mark property as rented
    await Property.findByIdAndUpdate(new mongoose.Types.ObjectId(propertyId), { status: 'rented' });

    res.status(201).json(lease);
  } catch (error) {
    console.error('Error creating agent lease:', error);
    res.status(500).json({ message: 'Error creating lease' });
  }
};

// Create a new payment for the agent
export const createAgentPayment = async (req: Request, res: Response) => {
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
    } = req.body;

    // Validate required fields
    if (!propertyId || !tenantId || !amount || !paymentDate || !paymentMethod) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields: propertyId, tenantId, amount, paymentDate, paymentMethod',
      });
    }

    // Ensure the property belongs to this agent
    const property = await Property.findOne({ _id: new mongoose.Types.ObjectId(propertyId), ownerId: new mongoose.Types.ObjectId(req.user.userId), companyId: new mongoose.Types.ObjectId(req.user.companyId) });
    if (!property) {
      return res.status(403).json({ message: 'You can only create payments for your own properties.' });
    }

    // Ensure the tenant exists and belongs to the same company
    const tenant = await Tenant.findOne({ _id: new mongoose.Types.ObjectId(tenantId), companyId: new mongoose.Types.ObjectId(req.user.companyId) });
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found or does not belong to your company.' });
    }

    // Calculate commission based on property type
    const baseCommissionRate = (propertyType || 'residential') === 'residential' ? 15 : 10;
    const totalCommission = (amount * baseCommissionRate) / 100;
    const preaFee = totalCommission * 0.03;
    const remainingCommission = totalCommission - preaFee;
    const agentShare = remainingCommission * 0.6;
    const agencyShare = remainingCommission * 0.4;

    const commissionDetails = {
      totalCommission,
      preaFee,
      agentShare,
      agencyShare,
      ownerAmount: amount - totalCommission,
    };

    // Create payment record
    const payment = new Payment({
      paymentType: paymentType || 'rental',
      propertyType: propertyType || 'residential',
      propertyId: new mongoose.Types.ObjectId(propertyId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
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
      status: status || 'completed',
      currency: currency || 'USD',
    });

    await payment.save();
    payment.referenceNumber = `RCPT-${payment._id.toString().slice(-6).toUpperCase()}-${rentalPeriodYear}-${String(rentalPeriodMonth).padStart(2, '0')}`;
    await payment.save();

    // Update company revenue
    await mongoose.model('Company').findByIdAndUpdate(
      new mongoose.Types.ObjectId(req.user.companyId),
      {
        $inc: {
          revenue: commissionDetails.agencyShare,
        },
      }
    );

    // Update agent commission
    await mongoose.model('User').findByIdAndUpdate(
      new mongoose.Types.ObjectId(req.user.userId),
      {
        $inc: {
          commission: commissionDetails.agentShare,
        },
      }
    );

    // If it's a rental payment, update property owner's balance
    if ((paymentType || 'rental') === 'rental' && property.ownerId) {
      await mongoose.model('User').findByIdAndUpdate(
        property.ownerId,
        {
          $inc: {
            balance: commissionDetails.ownerAmount,
          },
        }
      );
    }

    res.status(201).json({
      status: 'success',
      data: payment,
      message: 'Payment processed successfully'
    });
  } catch (error) {
    console.error('Error creating agent payment:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to process payment',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Update a payment for the agent
export const updateAgentPayment = async (req: Request, res: Response) => {
  try {
    console.log('updateAgentPayment called with:', {
      paymentId: req.params.id,
      userId: req.user?.userId,
      companyId: req.user?.companyId,
      role: req.user?.role,
      body: req.body
    });

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
      console.log('Invalid ObjectId:', paymentId);
      return res.status(400).json({ message: 'Invalid payment ID format.' });
    }

    console.log('Looking for payment with:', {
      paymentId,
      agentId: req.user.userId,
      companyId: req.user.companyId
    });

    // Find the payment and ensure it belongs to this agent
    const payment = await Payment.findOne({ 
      _id: new mongoose.Types.ObjectId(paymentId), 
      agentId: new mongoose.Types.ObjectId(req.user.userId), 
      companyId: new mongoose.Types.ObjectId(req.user.companyId) 
    });

    console.log('Payment found:', payment ? 'Yes' : 'No');

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found or you do not have permission to update it.' });
    }

    console.log('Original payment:', {
      id: payment._id,
      amount: payment.amount,
      propertyType: payment.propertyType
    });

    // If amount is being updated, recalculate commission
    if (updateData.amount && updateData.amount !== payment.amount) {
      const propertyType = updateData.propertyType || payment.propertyType || 'residential';
      const baseCommissionRate = propertyType === 'residential' ? 15 : 10;
      const totalCommission = (updateData.amount * baseCommissionRate) / 100;
      const preaFee = totalCommission * 0.03;
      const remainingCommission = totalCommission - preaFee;
      const agentShare = remainingCommission * 0.6;
      const agencyShare = remainingCommission * 0.4;

      updateData.commissionDetails = {
        totalCommission,
        preaFee,
        agentShare,
        agencyShare,
        ownerAmount: updateData.amount - totalCommission,
      };

      console.log('Recalculated commission:', updateData.commissionDetails);
    }

    console.log('Updating payment with data:', updateData);

    // Update the payment
    const updatedPayment = await Payment.findByIdAndUpdate(
      new mongoose.Types.ObjectId(paymentId),
      updateData,
      { new: true }
    );

    console.log('Payment updated successfully:', updatedPayment ? 'Yes' : 'No');

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
    const property = await Property.findOne({ _id: new mongoose.Types.ObjectId(propertyId), ownerId: new mongoose.Types.ObjectId(req.user.userId), companyId: new mongoose.Types.ObjectId(req.user.companyId) });
    if (!property) {
      return res.status(403).json({ message: 'You can only upload files for your own properties.' });
    }

    // Create file record
    const file = new File({
      propertyId: new mongoose.Types.ObjectId(propertyId),
      fileName: req.file.originalname,
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
    res.status(500).json({ 
      message: 'Error uploading file',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}; 