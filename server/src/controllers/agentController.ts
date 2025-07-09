import { Request, Response } from 'express';
import { Property, IProperty } from '../models/Property';
import { Tenant } from '../models/Tenant';
import { Lease } from '../models/Lease';
import { Payment } from '../models/Payment';
import { AppError } from '../middleware/errorHandler';

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

    // Get all properties associated with the company
    const properties = await Property.find({ 
      companyId: req.user.companyId 
    })
    .populate('ownerId', 'firstName lastName email')
    .sort({ createdAt: -1 }); // Sort by newest first

    console.log('Found properties for agent:', {
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

    const tenants = await Tenant.find({ 
      companyId: req.user.companyId 
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

    const leases = await Lease.find({ 
      companyId: req.user.companyId 
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

// Get agent's monthly commission
export const getAgentCommission = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      throw new AppError('Authentication required', 401);
    }
    if (!req.user?.companyId) {
      throw new AppError('Company ID not found', 400);
    }

    // Calculate commission based on active leases
    const leases = await Lease.find({ 
      companyId: req.user.companyId,
      status: 'active'
    })
    .populate<{ propertyId: IProperty }>('propertyId', 'rent');

    const totalCommission = leases.reduce((sum, lease) => {
      const rent = lease.propertyId?.rent || 0;
      const commission = rent * 0.1; // 10% commission
      return sum + commission;
    }, 0);

    res.json({ totalCommission });
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
      ownerId: req.user.userId, // Agent becomes the owner
      companyId: req.user.companyId,
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
      updatedAt: new Date()
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