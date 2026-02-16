import { Request, Response } from 'express';
import { Property, IProperty } from '../models/Property';
import { SalesOwner } from '../models/SalesOwner';
import { ChartData } from '../models/ChartData';
import { JwtPayload } from '../types/auth';
import { updateChartMetrics } from './chartController';
import propertyAccountService from '../services/propertyAccountService';
import { AppError } from '../middleware/errorHandler';
import { Valuation } from '../models/Valuation';
import { Deal } from '../models/Deal';
import mongoose from 'mongoose';
import { hasAnyRole, hasRole } from '../utils/access';
import { Buyer } from '../models/Buyer';

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

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const isRetryableMongoConnectionError = (error: any): boolean => {
  const labels: Set<string> | undefined = error?.[Symbol.for('errorLabels')];
  const hasRetryLabel =
    (labels instanceof Set && (labels.has('ResetPool') || labels.has('RetryableWriteError'))) ||
    (Array.isArray(error?.errorLabels) && error.errorLabels.some((l: string) => l === 'ResetPool' || l === 'RetryableWriteError'));
  const message = String(error?.message || '').toLowerCase();
  const name = String(error?.name || '').toLowerCase();

  return hasRetryLabel || name.includes('mongonetworkerror') || (message.includes('connection') && message.includes('closed'));
};

async function syncValuationOnPropertySold(params: {
  companyId: string;
  propertyId: mongoose.Types.ObjectId;
  fallbackSoldPrice?: number | null;
  fallbackSoldDate?: Date | null;
}) {
  const { companyId, propertyId, fallbackSoldPrice, fallbackSoldDate } = params;

  // Find the linked valuation (if any)
  const valuation = await Valuation.findOne({
    companyId: new mongoose.Types.ObjectId(companyId),
    convertedPropertyId: propertyId
  })
    .select('_id actualSoldPrice soldDate')
    .lean();

  // If there's no linked valuation, or it's already captured a sold price, don't overwrite history.
  if (!valuation || valuation.actualSoldPrice != null) return;

  // Prefer a "Won" deal price as the final sale price (source of truth).
  const wonDeal = await Deal.findOne({
    companyId: new mongoose.Types.ObjectId(companyId),
    propertyId,
    $or: [{ won: true }, { stage: 'Won' }]
  })
    .sort({ updatedAt: -1 })
    .select('offerPrice closeDate')
    .lean();

  const dealSoldPrice = (wonDeal as any)?.offerPrice;
  const soldPriceCandidate =
    (typeof dealSoldPrice === 'number' && Number.isFinite(dealSoldPrice) && dealSoldPrice > 0)
      ? dealSoldPrice
      : (typeof fallbackSoldPrice === 'number' && Number.isFinite(fallbackSoldPrice) && fallbackSoldPrice > 0)
        ? fallbackSoldPrice
        : null;

  if (soldPriceCandidate == null) return;

  const soldDateCandidate =
    ((wonDeal as any)?.closeDate ? new Date((wonDeal as any).closeDate) : null) ||
    (fallbackSoldDate || null) ||
    new Date();

  // Update only if still unset, to preserve historical accuracy.
  await Valuation.updateOne(
    {
      _id: (valuation as any)._id,
      $or: [{ actualSoldPrice: { $exists: false } }, { actualSoldPrice: null }]
    },
    {
      $set: { actualSoldPrice: soldPriceCandidate, soldDate: soldDateCandidate }
    }
  );
}

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
    
    // If user is not in a company-wide visibility role, only show their own properties
    const companyWideRoles = ['admin', 'accountant', 'principal', 'prea'];
    if (!companyWideRoles.includes(userContext.userRole)) {
      query.ownerId = new mongoose.Types.ObjectId(userContext.userId);
    }
    
    console.log('Executing property query:', {
      query,
      queryString: JSON.stringify(query)
    });

    // Optional lightweight search and projection for fast autocomplete
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const saleOnly = String(req.query.saleOnly) === 'true';
    const fields = typeof req.query.fields === 'string' ? req.query.fields : '';
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 20)));
    const page = Math.max(1, Number(req.query.page || 1));

    if (saleOnly) {
      (query as any).rentalType = 'sale';
    }

    if (q) {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      (query as any).$or = [{ name: regex }, { address: regex }];
    }

    // Build projection from fields list; default to lightweight fields for autocomplete
    let projection: any = undefined;
    if (fields) {
      projection = fields.split(',').reduce((acc: any, f: string) => {
        const key = f.trim();
        if (key) acc[key] = 1;
        return acc;
      }, {});
    } else {
      projection = {
        name: 1,
        address: 1,
        price: 1,
        commission: 1,
        commissionPreaPercent: 1,
        commissionAgencyPercentRemaining: 1,
        commissionAgentPercentRemaining: 1,
        propertyOwnerId: 1,
        buyerId: 1,
        rentalType: 1
      };
    }

    // Get properties with optional projection; avoid heavy populate for autocomplete.
    // Retry once for transient connection resets from managed Mongo services.
    let properties: any[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        properties = await Property.find(query)
          .select(projection)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean();
        break;
      } catch (queryError: any) {
        const shouldRetry = attempt === 0 && isRetryableMongoConnectionError(queryError);
        if (!shouldRetry) {
          throw queryError;
        }
        console.warn('Transient Mongo connection error in getPublicProperties; retrying once', {
          message: queryError?.message,
          name: queryError?.name
        });
        await wait(200);
      }
    }

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

    // Restrict visibility based on role (multi-role aware)
    const isAdminOrAccountant = hasAnyRole(req, ['admin', 'accountant']);
    const isSales = hasRole(req, 'sales');
    if (isSales && !isAdminOrAccountant) {
      // Pure sales users should only see their own sales properties
      query.rentalType = 'sale';
      query.agentId = new mongoose.Types.ObjectId(req.user.userId);
    } else if (!isAdminOrAccountant && hasRole(req, 'owner')) {
      // Property owners should see properties they own (unless they are also admin/accountant)
      query.ownerId = new mongoose.Types.ObjectId(req.user.userId);
    } else if (!isAdminOrAccountant) {
      // Other non-admin/accountant users only see properties assigned to them as agent
      query.agentId = new mongoose.Types.ObjectId(req.user.userId);
    }
    
    console.log('Executing property query:', {
      query,
      queryString: JSON.stringify(query)
    });

    // Get properties with populated owner information.
    // Retry once for transient connection resets from managed Mongo services.
    let properties: IProperty[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        properties = await Property.find(query)
          .populate('ownerId', 'firstName lastName email')
          .sort({ createdAt: -1 }); // Sort by newest first
        break;
      } catch (queryError: any) {
        const shouldRetry = attempt === 0 && isRetryableMongoConnectionError(queryError);
        if (!shouldRetry) {
          throw queryError;
        }
        console.warn('Transient Mongo connection error in getProperties; retrying once', {
          message: queryError?.message,
          name: queryError?.name
        });
        await wait(200);
      }
    }

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
    if (!hasAnyRole(req, ['admin', 'accountant'])) {
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
      images,
      propertyOwnerId,
      agentId,
      commission,
      saleType,
      commissionPreaPercent,
      commissionAgencyPercentRemaining,
      commissionAgentPercentRemaining,
      sourceValuationId
    } = req.body || {};

    if (!name || !address) {
      throw new AppError('Missing required fields: name and address', 400);
    }

    // Optional: link a valuation permanently to the created listing (hot-load conversion)
    let sourceValuationObjectId: mongoose.Types.ObjectId | null = null;
    if (sourceValuationId != null && String(sourceValuationId).trim() !== '') {
      const rawId = String(sourceValuationId);
      if (!mongoose.Types.ObjectId.isValid(rawId)) {
        throw new AppError('Invalid sourceValuationId', 400);
      }
      sourceValuationObjectId = new mongoose.Types.ObjectId(rawId);

      const valuation = await Valuation.findOne({
        _id: sourceValuationObjectId,
        companyId: new mongoose.Types.ObjectId(req.user.companyId)
      })
        .select('_id convertedPropertyId')
        .lean();

      if (!valuation) {
        throw new AppError('Valuation not found for conversion', 404);
      }
      if ((valuation as any)?.convertedPropertyId) {
        // Data integrity: a valuation can link to only one property.
        throw new AppError('This valuation has already been converted to a listing', 409);
      }
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
      images: Array.isArray(images) ? images.filter((u:any)=> typeof u === 'string' && u.trim() !== '') : [],
      ownerId: req.user.userId,
      companyId: req.user.companyId,
      agentId: agentId || req.user.userId,
      propertyOwnerId: propertyOwnerId || undefined,
      ...(sourceValuationObjectId ? { sourceValuationId: sourceValuationObjectId } : {}),
      rentalType: 'sale',
      saleType: (saleType === 'installment' ? 'installment' : 'cash'),
      commission: typeof commission === 'number' ? commission : Number(commission || 0),
      commissionPreaPercent: typeof commissionPreaPercent === 'number' ? commissionPreaPercent : Number(commissionPreaPercent || 0),
      commissionAgencyPercentRemaining: typeof commissionAgencyPercentRemaining === 'number' ? commissionAgencyPercentRemaining : Number(commissionAgencyPercentRemaining || 0),
      commissionAgentPercentRemaining: typeof commissionAgentPercentRemaining === 'number' ? commissionAgentPercentRemaining : Number(commissionAgentPercentRemaining || 0),
    });

    const saved = await property.save();

    // Persist valuation -> property lifecycle link (do not overwrite if already linked)
    if (sourceValuationObjectId) {
      try {
        await Valuation.findOneAndUpdate(
          {
            _id: sourceValuationObjectId,
            companyId: new mongoose.Types.ObjectId(req.user.companyId),
            $or: [{ convertedPropertyId: { $exists: false } }, { convertedPropertyId: null }]
          },
          {
            $set: { convertedPropertyId: saved._id, status: 'converted' }
          },
          { new: true }
        ).lean();
      } catch (linkErr) {
        // Non-fatal: property creation succeeds; link is best-effort.
        console.warn('Failed to link valuation to created property', {
          error: (linkErr as any)?.message,
          sourceValuationId: String(sourceValuationObjectId),
          propertyId: String(saved._id)
        });
      }
    }

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

    const match = {
      _id: req.params.id,
      ownerId: req.user.userId,
      companyId: req.user.companyId
    } as any;

    const before = await Property.findOne(match).select('status price buyerId').lean();
    if (!before) {
      throw new AppError('Property not found', 404);
    }

    // Special handling for buyer linkage: validate buyerId, allow clearing, and keep Buyer.propertyId in sync.
    let nextBuyerId: mongoose.Types.ObjectId | null | undefined = undefined; // undefined = not updating
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'buyerId')) {
      const raw = (req.body as any)?.buyerId;
      if (raw == null || String(raw).trim() === '') {
        nextBuyerId = null;
      } else {
        const rawId = String(raw);
        if (!mongoose.Types.ObjectId.isValid(rawId)) {
          throw new AppError('Invalid buyerId', 400);
        }
        const exists = await Buyer.findOne({
          _id: new mongoose.Types.ObjectId(rawId),
          companyId: new mongoose.Types.ObjectId(req.user.companyId)
        })
          .select('_id')
          .lean();
        if (!exists) {
          throw new AppError('Buyer not found', 404);
        }
        nextBuyerId = new mongoose.Types.ObjectId(rawId);
      }
    }

    const updateDoc: any = {
      ...req.body,
      ownerId: req.user.userId,
      companyId: req.user.companyId
    };
    // Ensure we only ever write a validated buyerId
    if (Object.prototype.hasOwnProperty.call(updateDoc, 'buyerId')) {
      delete updateDoc.buyerId;
    }
    if (nextBuyerId !== undefined) {
      updateDoc.buyerId = nextBuyerId;
    }

    const property = await Property.findOneAndUpdate(
      match,
      updateDoc,
      { new: true }
    );

    if (!property) {
      throw new AppError('Property not found', 404);
    }

    // Keep Buyer.propertyId in sync with Property.buyerId (best-effort; non-fatal).
    if (nextBuyerId !== undefined) {
      try {
        const propObjectId = new mongoose.Types.ObjectId(String(property._id));
        if (nextBuyerId === null) {
          // Clear any buyers pointing at this property (including previous buyer).
          await Buyer.updateMany(
            { companyId: new mongoose.Types.ObjectId(req.user.companyId), propertyId: propObjectId },
            { $unset: { propertyId: '' } }
          );
        } else {
          // Link selected buyer to this property.
          await Buyer.updateOne(
            { _id: nextBuyerId, companyId: new mongoose.Types.ObjectId(req.user.companyId) },
            { $set: { propertyId: propObjectId } }
          );
          // Ensure no other buyer still points at this property.
          await Buyer.updateMany(
            {
              companyId: new mongoose.Types.ObjectId(req.user.companyId),
              propertyId: propObjectId,
              _id: { $ne: nextBuyerId }
            },
            { $unset: { propertyId: '' } }
          );
        }
      } catch (syncErr) {
        console.warn('Failed to sync property buyer linkage:', {
          error: (syncErr as any)?.message,
          propertyId: String(property._id),
          buyerId: nextBuyerId ? String(nextBuyerId) : null
        });
      }
    }
    
    // Lifecycle tracking: when a linked property is marked sold, capture sold price/date on valuation automatically.
    const prevStatus = String((before as any)?.status || '').toLowerCase();
    const nextStatus = String((property as any)?.status || '').toLowerCase();
    if (prevStatus !== 'sold' && nextStatus === 'sold') {
      try {
        await syncValuationOnPropertySold({
          companyId: String(req.user.companyId),
          propertyId: property._id,
          // Fallback to property.price if no Won deal exists yet (keeps feature non-blocking).
          fallbackSoldPrice: typeof (property as any)?.price === 'number' ? (property as any).price : undefined,
          fallbackSoldDate: new Date()
        });
      } catch (syncErr) {
        console.warn('Failed to sync valuation sold info', {
          error: (syncErr as any)?.message,
          propertyId: String(property._id)
        });
      }
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