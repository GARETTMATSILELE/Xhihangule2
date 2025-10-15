import { Request, Response, NextFunction } from 'express';
import { Tenant } from '../models/Tenant';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import mongoose from 'mongoose';
import { Property } from '../models/Property';

export const getTenants = async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log('GetTenants - Request user:', req.user);
    console.log('GetTenants - Headers:', req.headers);
    console.log('GetTenants - Cookies:', req.cookies);

    if (!req.user) {
      console.log('GetTenants - No user in request');
      throw new AppError('Authentication required', 401, 'NO_USER');
    }

    if (!req.user.companyId) {
      console.log('GetTenants - No companyId in request user');
      throw new AppError('Company ID is required', 400, 'NO_COMPANY_ID');
    }

    const { page = 1, limit = 10, search = '' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    console.log('GetTenants - Query params:', { page, limit, search });

    // Build search query
    const searchQuery = search
      ? {
          $or: [
            { firstName: { $regex: search, $options: 'i' } },
            { lastName: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
            { phone: { $regex: search, $options: 'i' } }
          ],
          companyId: new mongoose.Types.ObjectId(req.user.companyId)
        }
      : { companyId: new mongoose.Types.ObjectId(req.user.companyId) };

    console.log('GetTenants - MongoDB query:', searchQuery);

    try {
      // Get total count for pagination
      const total = await Tenant.countDocuments(searchQuery);
      console.log('GetTenants - Total tenants found:', total);

      // Get tenants with pagination
      const tenants = await Tenant.find(searchQuery)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit));

      console.log('GetTenants - Tenants retrieved:', tenants.length);

      res.json({
        tenants,
        total,
        page: Number(page),
        totalPages: Math.ceil(total / Number(limit))
      });
    } catch (dbError) {
      console.error('GetTenants - Database error:', dbError);
      throw new AppError('Database error while fetching tenants', 500, 'DB_ERROR', dbError);
    }
  } catch (error: any) {
    console.error('GetTenants - Error:', error);
    if (error instanceof AppError) {
      next(error);
    } else {
      next(new AppError(
        error.message || 'Error fetching tenants',
        500,
        'UNKNOWN_ERROR',
        error
      ));
    }
  }
};

export const getTenant = async (req: Request, res: Response) => {
  try {
    if (!req.user?.companyId) {
      throw new AppError('Company ID not found', 401);
    }

    const { id } = req.params;
    logger.info('Fetching tenant', { tenantId: id, companyId: req.user.companyId });

    const tenant = await Tenant.findOne({
      _id: id,
      companyId: new mongoose.Types.ObjectId(req.user.companyId)
    }).lean();

    if (!tenant) {
      throw new AppError('Tenant not found', 404);
    }

    logger.info('Tenant fetched successfully', { tenantId: id });
    res.json(tenant);
  } catch (error) {
    logger.error('Error fetching tenant', { error, tenantId: req.params.id });
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ message: error.message });
    } else {
      res.status(500).json({ message: 'Error fetching tenant' });
    }
  }
};

export const createTenant = async (req: Request, res: Response) => {
  try {
    if (!req.user?.companyId) {
      throw new AppError('Company ID not found', 401);
    }
    // Allow only admin, owner, or agent to create tenants
    if (!['admin', 'owner', 'agent'].includes(req.user.role)) {
      throw new AppError('Access denied. Admin, Owner, or Agent role required to create tenants.', 403);
    }

    const { firstName, lastName, email, phone, propertyId, propertyIds, status, idNumber, emergencyContact } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email || !phone) {
      throw new AppError('All fields are required', 400);
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new AppError('Invalid email format', 400);
    }

    logger.info('Creating tenant', {
      email,
      companyId: req.user.companyId,
      propertyId,
      propertyIdsCount: Array.isArray(propertyIds) ? propertyIds.length : 0
    });

    const existingTenant = await Tenant.findOne({
      email,
      companyId: new mongoose.Types.ObjectId(req.user.companyId)
    });

    if (existingTenant) {
      throw new AppError('Tenant with this email already exists', 400);
    }

    const tenantData: any = {
      firstName,
      lastName,
      email,
      phone,
      companyId: new mongoose.Types.ObjectId(req.user.companyId),
      status: status || 'Active',
      propertyId: propertyId ? new mongoose.Types.ObjectId(propertyId) : undefined,
      // Ensure ownerId is captured for admin/owner flows as required by schema
      ownerId: new mongoose.Types.ObjectId(req.user.userId),
      idNumber,
      emergencyContact
    };

    // If propertyIds provided, normalize them to ObjectIds
    if (Array.isArray(propertyIds) && propertyIds.length > 0) {
      tenantData.propertyIds = propertyIds
        .filter((id: any) => !!id)
        .map((id: any) => new mongoose.Types.ObjectId(String(id)));
      // If multi selected, clear single propertyId unless explicitly provided
      if (!propertyId) {
        delete tenantData.propertyId;
      }
    }

    const newTenant = new Tenant(tenantData);
    await newTenant.save();

    // If properties are assigned, update their statuses
    if (Array.isArray(tenantData.propertyIds) && tenantData.propertyIds.length > 0) {
      await Property.updateMany({ _id: { $in: tenantData.propertyIds } }, { status: 'rented' });
    } else if (propertyId) {
      await Property.findByIdAndUpdate(propertyId, { status: 'rented' });
    }

    logger.info('Tenant created successfully', {
      tenantId: newTenant._id,
      email,
      propertyId,
      propertyIdsCount: Array.isArray(tenantData.propertyIds) ? tenantData.propertyIds.length : 0
    });

    res.status(201).json(newTenant);
  } catch (error: unknown) {
    logger.error('Error creating tenant', { error, body: req.body });
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ message: error.message });
    } else if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
      res.status(400).json({ message: 'Email already exists' });
    } else {
      res.status(500).json({ message: 'Error creating tenant' });
    }
  }
};

export const updateTenant = async (req: Request, res: Response) => {
  try {
    if (!req.user?.companyId) {
      throw new AppError('Company ID not found', 401);
    }

    const { id } = req.params;
    const { email, propertyId, propertyIds, ...updateData } = req.body;

    logger.info('Updating tenant', {
      tenantId: id,
      companyId: req.user.companyId,
      updateFields: Object.keys(updateData),
      propertyId,
      propertyIdsCount: Array.isArray(propertyIds) ? propertyIds.length : 0
    });

    if (email) {
      const existingTenant = await Tenant.findOne({
        email,
        companyId: new mongoose.Types.ObjectId(req.user.companyId),
        _id: { $ne: id }
      });

      if (existingTenant) {
        throw new AppError('Email already in use by another tenant', 400);
      }
    }

    // Get the current tenant to check property changes
    const currentTenant = await Tenant.findById(id);
    if (!currentTenant) {
      throw new AppError('Tenant not found', 404);
    }

    // Handle property changes for single propertyId
    if (typeof propertyId !== 'undefined' && propertyId !== currentTenant.propertyId?.toString()) {
      if (currentTenant.propertyId) {
        await Property.findByIdAndUpdate(currentTenant.propertyId, { status: 'available' });
      }
      if (propertyId) {
        await Property.findByIdAndUpdate(propertyId, { status: 'rented' });
      }
    }

    // Handle propertyIds changes (multi)
    if (Array.isArray(propertyIds)) {
      const currentIds = (currentTenant as any).propertyIds || [];
      const currentIdsStr = currentIds.map((id: mongoose.Types.ObjectId) => id.toString());
      const nextIds = propertyIds.map((id: any) => String(id));

      const removed = currentIdsStr.filter((id: string) => !nextIds.includes(id));
      const added = nextIds.filter((id: string) => !currentIdsStr.includes(id));

      if (removed.length > 0) {
        await Property.updateMany({ _id: { $in: removed } }, { status: 'available' });
      }
      if (added.length > 0) {
        await Property.updateMany({ _id: { $in: added } }, { status: 'rented' });
      }
      // Normalize updateData.propertyIds to ObjectIds
      (updateData as any).propertyIds = nextIds.map((id: string) => new mongoose.Types.ObjectId(id));
    }

    const updatedTenant = await Tenant.findOneAndUpdate(
      { 
        _id: id, 
        companyId: new mongoose.Types.ObjectId(req.user.companyId)
      },
      { 
        ...updateData, 
        ...(email && { email }),
        ...(typeof propertyId !== 'undefined' && propertyId !== '' ? { propertyId: new mongoose.Types.ObjectId(propertyId) } : { propertyId: undefined })
      },
      { new: true, runValidators: true }
    );

    if (!updatedTenant) {
      throw new AppError('Tenant not found', 404);
    }

    logger.info('Tenant updated successfully', { tenantId: id });
    res.json(updatedTenant);
  } catch (error: unknown) {
    logger.error('Error updating tenant', { error, tenantId: req.params.id });
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ message: error.message });
    } else if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
      res.status(400).json({ message: 'Email already exists' });
    } else {
      res.status(500).json({ message: 'Error updating tenant' });
    }
  }
};

export const deleteTenant = async (req: Request, res: Response) => {
  try {
    if (!req.user?.companyId) {
      throw new AppError('Company ID not found', 401);
    }

    const { id } = req.params;
    logger.info('Deleting tenant', { tenantId: id, companyId: req.user.companyId });

    // First find the tenant to get propertyId before deletion
    const tenantToDelete = await Tenant.findOne({
      _id: id,
      companyId: new mongoose.Types.ObjectId(req.user.companyId)
    });

    if (!tenantToDelete) {
      throw new AppError('Tenant not found', 404);
    }

    // Store propertyId before deletion
    const propertyId = tenantToDelete.propertyId;

    // Delete the tenant
    const deleteResult = await Tenant.findOneAndDelete({
      _id: id,
      companyId: new mongoose.Types.ObjectId(req.user.companyId)
    });

    if (!deleteResult) {
      throw new AppError('Tenant not found', 404);
    }

    // If tenant was assigned to a property, update property status
    if (propertyId) {
      await Property.findByIdAndUpdate(propertyId, { status: 'available' });
    }

    logger.info('Tenant deleted successfully', { tenantId: id });
    res.json({ message: 'Tenant deleted successfully' });
  } catch (error) {
    logger.error('Error deleting tenant', { error, tenantId: req.params.id });
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ message: error.message });
    } else {
      res.status(500).json({ message: 'Error deleting tenant' });
    }
  }
};

// Public endpoint for admin dashboard - no authentication required
export const getTenantsPublic = async (req: Request, res: Response) => {
  try {
    // Get company ID from query params or headers (for admin dashboard)
    const companyId = req.query.companyId as string || req.headers['x-company-id'] as string;
    
    let query = {};
    if (companyId) {
      query = { companyId: new mongoose.Types.ObjectId(companyId) };
    }

    const tenants = await Tenant.find(query).sort({ createdAt: -1 });
    res.json({ tenants });
  } catch (error) {
    console.error('Error fetching tenants (public):', error);
    res.status(500).json({ message: 'Error fetching tenants' });
  }
}; 