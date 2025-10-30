import { Request, Response } from 'express';
import { Property, IProperty } from '../models/Property';
import { SalesOwner } from '../models/SalesOwner';
import { ChartData } from '../models/ChartData';
import { JwtPayload } from '../types/auth';
import { updateChartMetrics } from './chartController';
import propertyAccountService from '../services/propertyAccountService';
import { AppError } from '../middleware/errorHandler';
import mongoose from 'mongoose';

// Helper function to extract user context from request
const getUserContext = (req: Request) => {
  // Try to get user context from query parameters first
  const userId = req.query.userId as string;
  const companyId = req.query.companyId as string;
  const userRole = req.query.userRole as string;
  
  // Fallback to headers if query params not available
  const headerUserId = req.headers['x-user-id'] as string;
  const headerCompanyId = req.headers['x-company-id'] as string;
  const headerUserRole = req.headers['x-user-role'] as string;
  
  return {
    userId: userId || headerUserId,
    companyId: companyId || headerCompanyId,
    userRole: userRole || headerUserRole
  };
};

// Public endpoint for getting properties with user-based filtering
export const getPublicProperties = async (req: Request, res: Response) => {
  try {
    console.log('getPublicProperties request received:', {
      headers: req.headers,
      query: req.query,
      params: req.params
    });

    const userContext = getUserContext(req);
    console.log('User context extracted:', userContext);

    // If no user context provided, return all properties (for admin dashboard)
    if (!userContext.userId && !userContext.companyId) {
      console.log('No user context provided, returning all properties');
      const allProperties = await Property.find({})
        .populate('ownerId', 'firstName lastName email')
        .sort({ createdAt: -1 });

      return res.json({
        status: 'success',
        data: allProperties
      });
    }

    // Validate user context
    if (!userContext.userId) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID is required',
        code: 'USER_ID_REQUIRED'
      });
    }

    if (!userContext.companyId) {
      console.log('User has no company ID, returning empty array');
      return res.json({
        status: 'success',
        data: []
      });
    }

    console.log('Fetching properties for user context:', {
      userId: userContext.userId,
      companyId: userContext.companyId,
      userRole: userContext.userRole
    });
    
    // Build query based on user role
    const query: any = { 
      companyId: new mongoose.Types.ObjectId(userContext.companyId)
    };
    
    // If user is not an admin, only show their properties
    if (userContext.userRole !== 'admin') {
      query.ownerId = new mongoose.Types.ObjectId(userContext.userId);
    }
    
    console.log('Executing property query:', {
      query,
      queryString: JSON.stringify(query)
    });

    // Get properties with populated owner information
    const properties = await Property.find(query)
      .populate('ownerId', 'firstName lastName email')
      .sort({ createdAt: -1 });

    console.log('Found properties:', {
      count: properties.length,
      properties: properties.map(p => ({
        id: p._id,
        name: p.name,
        address: p.address,
        type: p.type,
        ownerId: p.ownerId,
        companyId: p.companyId,
        status: p.status
      }))
    });

    return res.json({
      status: 'success',
      data: properties
    });

  } catch (error) {
    console.error('Error in getPublicProperties:', {
      error,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      errorStack: error instanceof Error ? error.stack : undefined
    });
    
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ 
        status: 'error',
        message: error.message,
        code: error.code
      });
    }
    
    // Check if it's a MongoDB error
    if (error instanceof mongoose.Error) {
      console.error('MongoDB error details:', {
        name: error.name,
        message: error.message,
        code: (error as any).code
      });
      return res.status(500).json({ 
        status: 'error',
        message: 'Database error occurred',
        code: 'DB_ERROR',
        error: error.message 
      });
    }
    
    return res.status(500).json({ 
      status: 'error',
      message: 'Error fetching properties',
      code: 'SERVER_ERROR',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const getProperties = async (req: Request, res: Response) => {
  try {
    console.log('getProperties request received:', {
      headers: req.headers,
      user: req.user,
      query: req.query,
      params: req.params
    });

    if (!req.user?.userId) {
      console.error('No user ID in request');
      return res.status(401).json({ 
        status: 'error',
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    // Check if user has a company ID
    if (!req.user?.companyId) {
      console.log('User has no company ID:', {
        userId: req.user.userId,
        role: req.user.role
      });
      return res.json([]); // Return empty array for users without a company
    }

    console.log('Fetching properties for company:', {
      companyId: req.user.companyId,
      userId: req.user.userId,
      role: req.user.role,
      companyIdType: typeof req.user.companyId
    });
    
    // Build query based on user role
    const query: any = { 
      companyId: new mongoose.Types.ObjectId(req.user.companyId)
    };

    // Apply rentalType filter only when explicitly requested or for sales users
    if (typeof req.query.rentalType === 'string' && req.query.rentalType.trim()) {
      query.rentalType = req.query.rentalType;
    }

    // Restrict visibility based on role
    if (req.user.role === 'sales') {
      // Sales users should only see sales properties assigned to them
      query.rentalType = 'sale';
      query.agentId = new mongoose.Types.ObjectId(req.user.userId);
    } else if (req.user.role !== 'admin' && req.user.role !== 'accountant') {
      // Non-admin/accountant users only see their assigned properties
      query.agentId = new mongoose.Types.ObjectId(req.user.userId);
    }
    
    console.log('Executing property query:', {
      query,
      queryString: JSON.stringify(query)
    });

    // Get properties with populated owner information
    const properties = await Property.find(query)
      .populate('ownerId', 'firstName lastName email')
      .sort({ createdAt: -1 }); // Sort by newest first

    console.log('Found properties:', {
      count: properties.length,
      properties: properties.map(p => ({
        id: p._id,
        name: p.name,
        address: p.address,
        type: p.type,
        ownerId: p.ownerId,
        companyId: p.companyId,
        status: p.status
      }))
    });

    return res.json({
      status: 'success',
      data: properties
    });

  } catch (error) {
    console.error('Error in getProperties:', {
      error,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      errorStack: error instanceof Error ? error.stack : undefined,
      userId: req.user?.userId,
      companyId: req.user?.companyId,
      role: req.user?.role
    });
    
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ 
        status: 'error',
        message: error.message,
        code: error.code
      });
    }
    
    // Check if it's a MongoDB error
    if (error instanceof mongoose.Error) {
      console.error('MongoDB error details:', {
        name: error.name,
        message: error.message,
        code: (error as any).code
      });
      return res.status(500).json({ 
        status: 'error',
        message: 'Database error occurred',
        code: 'DB_ERROR',
        error: error.message 
      });
    }
    
    return res.status(500).json({ 
      status: 'error',
      message: 'Error fetching properties',
      code: 'SERVER_ERROR',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const getProperty = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      throw new AppError('Authentication required', 401);
    }
    if (!req.user?.companyId) {
      throw new AppError('Company ID not found. Please ensure you are associated with a company.', 400);
    }

    // Build query based on user role
    const query: any = {
      _id: req.params.id,
      companyId: req.user.companyId
    };
    
    // If user is not an admin or accountant, only allow access to their properties
    if (req.user.role !== 'admin' && req.user.role !== 'accountant') {
      query.ownerId = req.user.userId;
    }

    const property = await Property.findOne(query)
      .populate('ownerId', 'firstName lastName email');
      
    if (!property) {
      throw new AppError('Property not found', 404);
    }
    
    res.json(property);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error fetching property' });
  }
};

export const createProperty = async (req: Request, res: Response) => {
  try {
    console.log('Property creation request received:', {
      headers: req.headers,
      body: req.body,
      user: req.user
    });

    if (!req.user?.userId) {
      throw new AppError('Authentication required', 401);
    }
    if (!req.user?.companyId) {
      throw new AppError('Company ID not found. Please ensure you are associated with a company.', 400);
    }

    const propertyData = {
      ...req.body,
      ownerId: req.user.userId,
      companyId: req.user.companyId,
      rentalType: req.body.rentalType,
      commission: req.body.commission
    };
    
    console.log('Processed property data:', propertyData);
    console.log('User context:', {
      userId: req.user.userId,
      companyId: req.user.companyId,
      role: req.user.role
    });
    
    // Validate required fields
    if (!propertyData.name || !propertyData.address) {
      throw new AppError('Missing required fields: Name and address are required', 400);
    }

    // Validate property type if provided
    if (propertyData.type && !['apartment', 'house', 'commercial', 'land'].includes(propertyData.type)) {
      throw new AppError('Invalid property type: Must be one of: apartment, house, commercial, land', 400);
    }

    console.log('Creating property with data:', propertyData);
    const property = new Property(propertyData);
    
    // Log the property object before saving
    console.log('Property object before save:', {
      name: property.name,
      address: property.address,
      type: property.type,
      ownerId: property.ownerId,
      companyId: property.companyId,
      status: property.status
    });
    
    try {
      console.log('About to save property to database...');
      await property.save();
      console.log('Property created successfully:', property._id);
      
      // Update chart metrics
      await updateChartMetrics(req.user.companyId);

      // Ensure a property account exists for this property (Individual plan and others)
      try {
        await propertyAccountService.getOrCreatePropertyAccount(property._id.toString());
      } catch (acctErr) {
        console.warn('Failed to ensure property account exists for new property:', (acctErr as any)?.message);
      }
      
      res.status(201).json(property);
    } catch (saveError: any) {
      console.error('Mongoose save error:', {
        error: saveError.message,
        validationErrors: saveError.errors,
        propertyData,
        errorName: saveError.name,
        errorCode: saveError.code
      });
      throw saveError;
    }
  } catch (error: any) {
    console.error('Property creation failed:', {
      error: error.message,
      stack: error.stack,
      propertyData: req.body,
      validationErrors: error.errors
    });
    
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        message: error.message,
        details: error.details
      });
    }
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        message: 'Validation failed',
        details: Object.values(error.errors).map((err: any) => err.message)
      });
    }
    
    res.status(500).json({ 
      message: 'Failed to create property', 
      details: error.message 
    });
  }
};

// Sales-specific property creation with commission split and area fields
export const createSalesProperty = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      throw new AppError('Authentication required', 401);
    }
    if (!req.user?.companyId) {
      throw new AppError('Company ID not found. Please ensure you are associated with a company.', 400);
    }

    const {
      name,
      address,
      price,
      type,
      bedrooms,
      bathrooms,
      status,
      builtArea,
      landArea,
      pricePerSqm,
      description,
      propertyOwnerId,
      agentId,
      commission,
      saleType,
      commissionPreaPercent,
      commissionAgencyPercentRemaining,
      commissionAgentPercentRemaining
    } = req.body || {};

    if (!name || !address) {
      throw new AppError('Missing required fields: name and address', 400);
    }

    // Map status from UI labels to backend enums if necessary
    const normalizedStatus = (status || 'available').toString().toLowerCase().replace(' ', '_');

    const typeNormalized = String(type || '').toLowerCase();
    const allowedTypes = ['apartment','house','commercial','land'];
    const isLand = typeNormalized === 'land';
    const computedPrice = isLand ? (Number(landArea || 0) * Number(pricePerSqm || 0)) : Number(price || 0);

    const property = new Property({
      name,
      address,
      type: (allowedTypes.includes(typeNormalized) ? typeNormalized : 'house') as any,
      status: normalizedStatus,
      price: computedPrice,
      pricePerSqm: isLand ? Number(pricePerSqm || 0) : 0,
      bedrooms: isLand ? 0 : Number(bedrooms || 0),
      bathrooms: isLand ? 0 : Number(bathrooms || 0),
      builtArea: Number(builtArea || 0),
      landArea: Number(landArea || 0),
      description: description || '',
      ownerId: req.user.userId,
      companyId: req.user.companyId,
      agentId: agentId || req.user.userId,
      propertyOwnerId: propertyOwnerId || undefined,
      rentalType: 'sale',
      saleType: (saleType === 'installment' ? 'installment' : 'cash'),
      commission: typeof commission === 'number' ? commission : Number(commission || 0),
      commissionPreaPercent: typeof commissionPreaPercent === 'number' ? commissionPreaPercent : Number(commissionPreaPercent || 0),
      commissionAgencyPercentRemaining: typeof commissionAgencyPercentRemaining === 'number' ? commissionAgencyPercentRemaining : Number(commissionAgencyPercentRemaining || 0),
      commissionAgentPercentRemaining: typeof commissionAgentPercentRemaining === 'number' ? commissionAgentPercentRemaining : Number(commissionAgentPercentRemaining || 0),
    });

    const saved = await property.save();

    // If a sales owner was selected, associate this property to the owner's properties list
    if (propertyOwnerId) {
      try {
        await SalesOwner.findOneAndUpdate(
          { _id: propertyOwnerId, companyId: req.user.companyId },
          { $addToSet: { properties: saved._id } }
        );
      } catch (assocErr) {
        // Non-fatal; log and continue returning the created property
        console.warn('Failed to associate property with sales owner', {
          error: (assocErr as any)?.message,
          propertyId: saved._id,
          propertyOwnerId
        });
      }
    }

    return res.status(201).json(saved);
  } catch (error) {
    console.error('Error creating sales property:', error);
    const status = (error as any)?.statusCode || 500;
    const message = (error as any)?.message || 'Error creating property';
    return res.status(status).json({ message });
  }
};

export const updateProperty = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      throw new AppError('Authentication required', 401);
    }
    if (!req.user?.companyId) {
      throw new AppError('Company ID not found. Please ensure you are associated with a company.', 400);
    }

    const property = await Property.findOneAndUpdate(
      { 
        _id: req.params.id, 
        ownerId: req.user.userId,
        companyId: req.user.companyId 
      },
      { 
        ...req.body, 
        ownerId: req.user.userId,
        companyId: req.user.companyId 
      },
      { new: true }
    );

    if (!property) {
      throw new AppError('Property not found', 404);
    }
    
    // Ensure a property account exists/updated after property changes (e.g., owner link)
    try {
      await propertyAccountService.getOrCreatePropertyAccount(property._id.toString());
    } catch (acctErr) {
      console.warn('Failed to ensure property account exists after update:', (acctErr as any)?.message);
    }

    res.json(property);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Error updating property:', error);
    res.status(500).json({ message: 'Error updating property' });
  }
};

export const deleteProperty = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      throw new AppError('Authentication required', 401);
    }
    if (!req.user?.companyId) {
      throw new AppError('Company ID not found. Please ensure you are associated with a company.', 400);
    }

    const property = await Property.findOneAndDelete({
      _id: req.params.id,
      ownerId: req.user.userId,
      companyId: req.user.companyId
    });
    if (!property) {
      throw new AppError('Property not found', 404);
    }
    
    res.json({ message: 'Property deleted successfully' });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error deleting property' });
  }
};

export const getVacantProperties = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      throw new AppError('Authentication required', 401);
    }
    if (!req.user?.companyId) {
      throw new AppError('Company ID not found. Please ensure you are associated with a company.', 400);
    }

    console.log('Fetching vacant properties for:', {
      userId: req.user.userId,
      companyId: req.user.companyId
    });

    const query = { 
      companyId: req.user.companyId,
      ownerId: req.user.userId,
      status: 'available'
    };

    console.log('Query:', JSON.stringify(query, null, 2));

    try {
      const properties = await Property.find(query).lean();
      console.log('Found properties:', properties.length);
      console.log('Properties:', JSON.stringify(properties, null, 2));
      
      res.json({ properties });
    } catch (dbError) {
      console.error('Database error:', dbError);
      throw new AppError('Error querying database', 500);
    }
  } catch (error) {
    console.error('Error in getVacantProperties:', error);
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ 
      message: 'Error fetching vacant properties',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const getAdminDashboardProperties = async (req: Request, res: Response) => {
  try {
    console.log('getAdminDashboardProperties request received');

    // Get all properties without authentication requirements
    const properties = await Property.find({})
      .populate('ownerId', 'firstName lastName email')
      .sort({ createdAt: -1 });

    console.log('Found properties for admin dashboard:', {
      count: properties.length,
      properties: properties.map(p => ({
        id: p._id,
        name: p.name,
        address: p.address,
        type: p.type,
        ownerId: p.ownerId,
        companyId: p.companyId,
        status: p.status
      }))
    });

    return res.json({
      status: 'success',
      data: properties
    });

  } catch (error) {
    console.error('Error in getAdminDashboardProperties:', {
      error,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      errorStack: error instanceof Error ? error.stack : undefined
    });
    
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ 
        status: 'error',
        message: error.message,
        code: error.code
      });
    }
    
    // Check if it's a MongoDB error
    if (error instanceof mongoose.Error) {
      console.error('MongoDB error details:', {
        name: error.name,
        message: error.message,
        code: (error as any).code
      });
      return res.status(500).json({ 
        status: 'error',
        message: 'Database error occurred',
        code: 'DB_ERROR',
        error: error.message 
      });
    }
    
    return res.status(500).json({ 
      status: 'error',
      message: 'Error fetching properties',
      code: 'SERVER_ERROR',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Public endpoint for creating property - no authentication required
export const createPropertyPublic = async (req: Request, res: Response) => {
  try {
    console.log('Public property creation request received:', {
      headers: req.headers,
      body: req.body,
      query: req.query
    });

    // Extract user context from query parameters or headers
    const userContext = getUserContext(req);
    
    console.log('User context for public property creation:', userContext);

    // Validate required user context
    if (!userContext.userId) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID is required for property creation',
        code: 'USER_ID_REQUIRED'
      });
    }

    if (!userContext.companyId) {
      return res.status(400).json({
        status: 'error',
        message: 'Company ID is required for property creation',
        code: 'COMPANY_ID_REQUIRED'
      });
    }

    const propertyData = {
      ...req.body,
      ownerId: userContext.userId,
      companyId: userContext.companyId,
      rentalType: req.body.rentalType,
      commission: req.body.commission
    };
    
    console.log('Processed public property data:', propertyData);
    
    // Validate required fields
    if (!propertyData.name || !propertyData.address) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields: Name and address are required',
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }

    // Validate property type if provided
    if (propertyData.type && !['apartment', 'house', 'commercial'].includes(propertyData.type)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid property type: Must be one of: apartment, house, commercial',
        code: 'INVALID_PROPERTY_TYPE'
      });
    }

    console.log('Creating property with public data:', propertyData);
    const property = new Property(propertyData);
    
    try {
      await property.save();
      console.log('Property created successfully via public API:', property._id);
      
      // Update chart metrics
      await updateChartMetrics(userContext.companyId);
      // Ensure property account exists for this property
      try {
        await propertyAccountService.getOrCreatePropertyAccount(property._id.toString());
      } catch (acctErr) {
        console.warn('Failed to ensure property account exists for new public property:', (acctErr as any)?.message);
      }
      
      res.status(201).json({
        status: 'success',
        message: 'Property created successfully',
        data: property
      });
    } catch (saveError: any) {
      console.error('Mongoose save error in public property creation:', {
        error: saveError.message,
        validationErrors: saveError.errors,
        propertyData
      });
      
      if (saveError.name === 'ValidationError') {
        return res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: Object.values(saveError.errors).map((err: any) => err.message)
        });
      }
      
      throw saveError;
    }
  } catch (error: any) {
    console.error('Public property creation failed:', {
      error: error.message,
      stack: error.stack,
      propertyData: req.body
    });
    
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        status: 'error',
        message: error.message,
        code: error.code
      });
    }
    
    res.status(500).json({ 
      status: 'error',
      message: 'Failed to create property', 
      code: 'SERVER_ERROR',
      details: error.message 
    });
  }
}; 