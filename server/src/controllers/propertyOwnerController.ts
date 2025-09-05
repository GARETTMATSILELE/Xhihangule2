import { Request, Response } from 'express';
import { PropertyOwner, IPropertyOwner } from '../models/PropertyOwner';
import { AppError } from '../middleware/errorHandler';
import { JwtPayload } from '../types/auth';
import { Property } from '../models/Property';

export const createPropertyOwner = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    // Always require company scope
    if (!req.user.companyId) {
      return res.status(401).json({ message: 'Company ID not found' });
    }

    const { email, password, firstName, lastName, phone } = req.body;

    // Validate required fields
    if (!email || !password || !firstName || !lastName || !phone) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Check if owner already exists
    const existingOwner = await PropertyOwner.findOne({ email, companyId: req.user.companyId });
    if (existingOwner) {
      return res.status(400).json({ message: 'Property owner with this email already exists' });
    }

    const ownerData = {
      email,
      password,
      firstName,
      lastName,
      phone,
      companyId: req.user.companyId
    };

    const owner = new PropertyOwner(ownerData);
    await owner.save();
    res.status(201).json(owner);
  } catch (error) {
    console.error('Error creating property owner:', error);
    res.status(500).json({ message: 'Error creating property owner' });
  }
};

export const getPropertyOwners = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    console.log('getPropertyOwners - User data:', {
      userId: req.user.userId,
      role: req.user.role,
      companyId: req.user.companyId
    });

    if (!req.user.companyId) {
      console.log('getPropertyOwners - Company ID not found');
      throw new AppError('Company ID not found', 401);
    }
    const query: any = { companyId: req.user.companyId };

    console.log('getPropertyOwners - Query:', query);

    const owners = await PropertyOwner.find(query);
    res.json(owners);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Error fetching property owners', 500);
  }
};

export const getPropertyOwnerById = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const { id } = req.params;
    
    if (!req.user.companyId) {
      throw new AppError('Company ID not found', 401);
    }
    const query: any = { _id: id, companyId: req.user.companyId };
    
    const owner = await PropertyOwner.findOne(query);
    
    if (!owner) {
      throw new AppError('Property owner not found', 404);
    }
    
    res.json(owner);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Error fetching property owner', 500);
  }
};

export const updatePropertyOwner = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const { id } = req.params;
    const { email, companyId: _ignoredCompanyId, ...updates } = req.body; // ignore companyId changes

    if (!req.user.companyId) {
      throw new AppError('Company ID not found', 401);
    }
    const query: any = { _id: id, companyId: req.user.companyId };

    // If email is being updated, check if it's already in use
    if (email) {
      const existingOwner = await PropertyOwner.findOne({
        email,
        _id: { $ne: id },
        companyId: req.user.companyId
      });

      if (existingOwner) {
        throw new AppError('Email already in use by another property owner', 400);
      }
    }

    const owner = await PropertyOwner.findOneAndUpdate(
      query,
      { 
        ...updates,
        ...(email && { email })
      },
      { new: true, runValidators: true }
    );

    if (!owner) {
      throw new AppError('Property owner not found', 404);
    }

    res.json(owner);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Error updating property owner', 500);
  }
};

export const deletePropertyOwner = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const { id } = req.params;
    
    if (!req.user.companyId) {
      throw new AppError('Company ID not found', 401);
    }
    const query: any = { _id: id, companyId: req.user.companyId };
    
    const owner = await PropertyOwner.findOneAndDelete(query);
    
    if (!owner) {
      return res.status(404).json({ message: 'Property owner not found' });
    }

    // Only log _id and email if owner is not null and has those properties
    if (owner && (owner as any)._id && (owner as any).email) {
      console.log('Property owner deleted successfully:', { id: (owner as any)._id, email: (owner as any).email });
    } else {
      console.log('Property owner deleted successfully');
    }
    
    res.json({ message: 'Property owner deleted successfully' });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Error deleting property owner', 500);
  }
};

// Public endpoint for admin dashboard - no authentication required
export const getPropertyOwnersPublic = async (req: Request, res: Response) => {
  try {
    console.log('Public property owners request:', {
      query: req.query,
      headers: req.headers
    });

    // Get company ID from query params or headers (for admin dashboard)
    const companyId = req.query.companyId as string || req.headers['x-company-id'] as string;
    
    let query: any = {};
    
    // Filter by company ID if provided
    if (companyId) {
      query.companyId = companyId;
    }

    // Additional filtering options
    if (req.query.email) {
      query.email = { $regex: req.query.email as string, $options: 'i' };
    }

    if (req.query.firstName) {
      query.firstName = { $regex: req.query.firstName as string, $options: 'i' };
    }

    if (req.query.lastName) {
      query.lastName = { $regex: req.query.lastName as string, $options: 'i' };
    }

    console.log('Public property owners query:', query);

    // Get property owners, excluding password field
    const owners = await PropertyOwner.find(query)
      .select('-password')
      .sort({ createdAt: -1 }); // Sort by newest first

    console.log(`Found ${owners.length} property owners`);

    res.json({ 
      owners,
      count: owners.length,
      companyId: companyId || null
    });
  } catch (error) {
    console.error('Error fetching property owners (public):', error);
    res.status(500).json({ 
      message: 'Error fetching property owners',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Public endpoint for getting a single property owner by ID - no authentication required
export const getPropertyOwnerByIdPublic = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const companyId = req.query.companyId as string || req.headers['x-company-id'] as string;
    
    console.log('Public property owner by ID request:', {
      id,
      companyId,
      query: req.query,
      headers: req.headers
    });

    let query: any = { _id: id };
    
    // Filter by company ID if provided
    if (companyId) {
      query.companyId = companyId;
    }

    console.log('Public property owner by ID query:', query);

    const owner = await PropertyOwner.findOne(query).select('-password');
    
    if (!owner) {
      return res.status(404).json({ 
        message: 'Property owner not found',
        id,
        companyId: companyId || null
      });
    }

    console.log('Found property owner:', { id: owner._id, email: owner.email });

    res.json(owner);
  } catch (error) {
    console.error('Error fetching property owner by ID (public):', error);
    res.status(500).json({ 
      message: 'Error fetching property owner',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Public endpoint for creating property owner - no authentication required
export const createPropertyOwnerPublic = async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName, phone, companyId, propertyIds } = req.body;

    console.log('Public create property owner request:', {
      email,
      firstName,
      lastName,
      phone,
      companyId,
      propertyIds
    });

    // Validate required fields
    if (!email || !password || !firstName || !lastName || !phone) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Check if owner already exists
    const existingOwner = await PropertyOwner.findOne({ email });
    if (existingOwner) {
      return res.status(400).json({ message: 'Property owner with this email already exists' });
    }

    const ownerData: any = {
      email,
      password,
      firstName,
      lastName,
      phone,
      companyId
    };

    // If propertyIds are provided, assign them to the owner
    if (Array.isArray(propertyIds) && propertyIds.length > 0) {
      ownerData.properties = propertyIds;
    }

    const owner = new PropertyOwner(ownerData);
    await owner.save();

    // Do not modify Property.ownerId here; maintain linkage via PropertyOwner.properties only.
    
    // Return owner without password
    const ownerResponse = owner.toObject();
    delete (ownerResponse as Partial<typeof ownerResponse>).password;
    
    console.log('Property owner created successfully:', { id: owner._id, email: owner.email });
    
    res.status(201).json(ownerResponse);
  } catch (error) {
    console.error('Error creating property owner (public):', error);
    res.status(500).json({ message: 'Error creating property owner' });
  }
};

// Public endpoint for updating property owner - no authentication required
export const updatePropertyOwnerPublic = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { email, properties, password, ...updates } = req.body;
    const companyId = req.query.companyId as string || req.headers['x-company-id'] as string;

    console.log('Public update property owner request:', {
      id,
      email,
      companyId,
      updates,
      properties
    });

    let query: any = { _id: id };
    if (companyId) {
      query.companyId = companyId;
    }

    // If email is being updated, check if it's already in use
    if (email) {
      const existingOwner = await PropertyOwner.findOne({
        email,
        _id: { $ne: id },
        ...(companyId && { companyId })
      });
      if (existingOwner) {
        return res.status(400).json({ message: 'Email already in use by another property owner' });
      }
    }

    // Build update object, only include password if it's not empty
    const updateObject: any = { ...updates };
    if (email) updateObject.email = email;
    if (properties) updateObject.properties = properties;
    if (password && password.trim() !== '') updateObject.password = password;

    // Update the owner
    const owner = await PropertyOwner.findOneAndUpdate(
      query,
      updateObject,
      { new: true, runValidators: true }
    ).select('-password');

    if (!owner) {
      return res.status(404).json({ message: 'Property owner not found' });
    }

    // Do not modify Property.ownerId on public updates; linkage is via PropertyOwner.properties.

    console.log('Property owner updated successfully:', { id: owner._id, email: owner.email });
    res.json(owner);
  } catch (error) {
    console.error('Error updating property owner (public):', error);
    res.status(500).json({ message: 'Error updating property owner' });
  }
};

// Public endpoint for deleting property owner - no authentication required
export const deletePropertyOwnerPublic = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const companyId = req.query.companyId as string || req.headers['x-company-id'] as string;

    console.log('Public delete property owner request:', {
      id,
      companyId
    });

    let query: any = { _id: id };
    
    // Filter by company ID if provided
    if (companyId) {
      query.companyId = companyId;
    }

    const owner = await PropertyOwner.findOneAndDelete(query);
    
    if (!owner) {
      return res.status(404).json({ message: 'Property owner not found' });
    }

    // Only log _id and email if owner is not null and has those properties
    if (owner && (owner as any)._id && (owner as any).email) {
      console.log('Property owner deleted successfully:', { id: (owner as any)._id, email: (owner as any).email });
    } else {
      console.log('Property owner deleted successfully');
    }

    res.json({ message: 'Property owner deleted successfully' });
  } catch (error) {
    console.error('Error deleting property owner (public):', error);
    res.status(500).json({ message: 'Error deleting property owner' });
  }
}; 