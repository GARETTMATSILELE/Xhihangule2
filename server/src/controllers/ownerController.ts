import { Request, Response } from 'express';
import { PropertyOwner, IPropertyOwner } from '../models/PropertyOwner';
import { Property } from '../models/Property';
import { MaintenanceRequest } from '../models/MaintenanceRequest';
import { User } from '../models/User';
import { AppError } from '../middleware/errorHandler';
import { TransformedMaintenanceRequest, PopulatedMaintenanceRequest } from '../types/maintenance';
import mongoose from 'mongoose';

// Helper function to get property owner context (from either PropertyOwner or User collection)
const getPropertyOwnerContext = async (ownerId: string): Promise<{ _id: mongoose.Types.ObjectId; properties: mongoose.Types.ObjectId[]; companyId?: mongoose.Types.ObjectId }> => {
  // First, try to find the property owner document (this is the primary source)
  let propertyOwner = await PropertyOwner.findById(ownerId);
  
  if (propertyOwner) {
    console.log(`Found PropertyOwner record: ${propertyOwner.email} with companyId: ${propertyOwner.companyId}`);
    return {
      _id: propertyOwner._id,
      properties: propertyOwner.properties || [],
      companyId: propertyOwner.companyId
    };
  }
  
  // If not found in PropertyOwner collection, try User collection as fallback
  console.log(`PropertyOwner not found for ID: ${ownerId}, checking User collection...`);
  const user = await User.findById(ownerId);
  
  if (!user || user.role !== 'owner') {
    throw new AppError('Property owner not found', 404);
  }
  
  console.log(`Found owner user in User collection: ${user.email}`);
  
  // Use the user as the property owner context
  return {
    _id: user._id,
    properties: [], // Will be populated from Property collection
    companyId: user.companyId
  };
};

// Get properties for the authenticated owner
export const getOwnerProperties = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      throw new AppError('Authentication required', 401);
    }

    const ownerId = req.user.userId;
    const propertyOwnerContext = await getPropertyOwnerContext(ownerId);

    // Get properties using the properties array from PropertyOwner, or fallback to ownerId
    let properties;
    if (propertyOwnerContext.properties && propertyOwnerContext.properties.length > 0) {
      // Build query - filter by companyId from PropertyOwner context
      const query: any = { _id: { $in: propertyOwnerContext.properties } };
      if (propertyOwnerContext.companyId) {
        query.companyId = propertyOwnerContext.companyId;
      }
      
      properties = await Property.find(query).populate('ownerId', 'firstName lastName email');
    } else {
      // Fallback: get properties where ownerId matches - filter by companyId from PropertyOwner context
      const query: any = { ownerId: ownerId };
      if (propertyOwnerContext.companyId) {
        query.companyId = propertyOwnerContext.companyId;
      }
      
      properties = await Property.find(query).populate('ownerId', 'firstName lastName email');
    }

    if (!properties || properties.length === 0) {
      return res.json([]);
    }

    // Calculate additional metrics for each property
    const propertiesWithMetrics = await Promise.all(properties.map(async (property) => {
      // Get maintenance requests for this property
      const maintenanceRequests = await MaintenanceRequest.find({
        propertyId: property._id
      });

      // Calculate occupancy rate based on units
      const occupancyRate = property.units && property.units > 0 
        ? Math.round((property.occupiedUnits || 0) / property.units * 100)
        : 0;

      // Get total rent collected and current arrears from maintenance requests
      // This is a simplified calculation - in a real app, you'd get this from payment records
      const totalRentCollected = property.totalRentCollected || 0;
      const currentArrears = property.currentArrears || 0;

      return {
        _id: property._id,
        name: property.name,
        address: property.address,
        type: property.type,
        status: property.status,
        rent: property.rent,
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
        area: property.area,
        description: property.description,
        images: property.images,
        amenities: property.amenities,
        occupancyRate,
        totalRentCollected,
        currentArrears,
        nextLeaseExpiry: property.nextLeaseExpiry,
        units: property.units,
        occupiedUnits: property.occupiedUnits,
        maintenanceRequestCount: maintenanceRequests.length,
        createdAt: property.createdAt,
        updatedAt: property.updatedAt
      };
    }));

    res.json(propertiesWithMetrics);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Error fetching properties', 500);
  }
};

// Get a specific property for the authenticated owner
export const getOwnerPropertyById = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      throw new AppError('Authentication required', 401);
    }

    const ownerId = req.user.userId;
    const propertyId = req.params.id;
    const propertyOwnerContext = await getPropertyOwnerContext(ownerId);

    // Check if the property is in the owner's properties array
    const isOwnerProperty = propertyOwnerContext.properties?.some(
      (propId: mongoose.Types.ObjectId) => propId.toString() === propertyId
    );

    if (!isOwnerProperty) {
      // Fallback: check if property has this owner as ownerId
      const query: any = { _id: propertyId, ownerId: ownerId };
      if (propertyOwnerContext.companyId) {
        query.companyId = propertyOwnerContext.companyId;
      }
      
      const property = await Property.findOne(query);
      
      if (!property) {
        throw new AppError('Property not found or access denied', 404);
      }
    }

    // Get the property with full details
    const query: any = { _id: propertyId };
    if (propertyOwnerContext.companyId) {
      query.companyId = propertyOwnerContext.companyId;
    }
    
    const property = await Property.findOne(query).populate('ownerId', 'firstName lastName email');

    if (!property) {
      throw new AppError('Property not found', 404);
    }

    // Get maintenance requests for this property
    const maintenanceRequests = await MaintenanceRequest.find({ 
      propertyId: property._id 
    }).populate('tenantId', 'firstName lastName email');

    // Calculate occupancy rate
    const occupancyRate = property.units && property.units > 0 
      ? Math.round((property.occupiedUnits || 0) / property.units * 100)
      : 0;

    // Get total rent collected and current arrears
    const totalRentCollected = property.totalRentCollected || 0;
    const currentArrears = property.currentArrears || 0;

    const propertyWithMetrics = {
      _id: property._id,
      name: property.name,
      address: property.address,
      type: property.type,
      status: property.status,
      rent: property.rent,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      area: property.area,
      description: property.description,
      images: property.images,
      amenities: property.amenities,
      occupancyRate,
      totalRentCollected,
      currentArrears,
      nextLeaseExpiry: property.nextLeaseExpiry,
      units: property.units,
      occupiedUnits: property.occupiedUnits,
      maintenanceRequests,
      createdAt: property.createdAt,
      updatedAt: property.updatedAt
    };

    res.json(propertyWithMetrics);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Error fetching property', 500);
  }
};

// Get maintenance requests for the authenticated owner's properties
export const getOwnerMaintenanceRequests = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      throw new AppError('Authentication required', 401);
    }

    const ownerId = req.user.userId;
    const propertyOwnerContext = await getPropertyOwnerContext(ownerId);

    let propertyIds: mongoose.Types.ObjectId[] = [];

    if (propertyOwnerContext.properties && propertyOwnerContext.properties.length > 0) {
      propertyIds = propertyOwnerContext.properties;
    } else {
      // Fallback: get properties where ownerId matches - filter by companyId from PropertyOwner context
      const query: any = { ownerId: ownerId };
      if (propertyOwnerContext.companyId) {
        query.companyId = propertyOwnerContext.companyId;
      }
      
      const properties = await Property.find(query);
      propertyIds = properties.map(p => p._id);
    }

    if (propertyIds.length === 0) {
      return res.json([]);
    }

    // Get maintenance requests for these properties
    const maintenanceRequests = await MaintenanceRequest.find({
      propertyId: { $in: propertyIds }
    })
    .populate('propertyId', 'name address')
    .populate('tenantId', 'firstName lastName email')
    .populate('ownerId', 'firstName lastName email')
    .sort({ createdAt: -1 });

    // Transform the data to match frontend interface
    const transformedRequests: TransformedMaintenanceRequest[] = maintenanceRequests.map(request => {
      const populatedRequest = request as unknown as PopulatedMaintenanceRequest;
      return {
        _id: request._id.toString(),
        propertyId: populatedRequest.propertyId._id,
        propertyName: populatedRequest.propertyId.name,
        propertyAddress: populatedRequest.propertyId.address,
        title: request.title,
        description: request.description,
        priority: request.priority,
        status: request.status,
        estimatedCost: request.estimatedCost || 0,
        createdAt: request.createdAt
      };
    });

    res.json(transformedRequests);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Error fetching maintenance requests', 500);
  }
};

// Get a specific maintenance request for the authenticated owner
export const getOwnerMaintenanceRequestById = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      throw new AppError('Authentication required', 401);
    }

    const ownerId = req.user.userId;
    const requestId = req.params.id;
    const propertyOwnerContext = await getPropertyOwnerContext(ownerId);

    let propertyIds: mongoose.Types.ObjectId[] = [];

    if (propertyOwnerContext.properties && propertyOwnerContext.properties.length > 0) {
      propertyIds = propertyOwnerContext.properties;
    } else {
      // Fallback: get properties where ownerId matches - filter by companyId from PropertyOwner context
      const query: any = { ownerId: ownerId };
      if (propertyOwnerContext.companyId) {
        query.companyId = propertyOwnerContext.companyId;
      }
      
      const properties = await Property.find(query);
      propertyIds = properties.map(p => p._id);
    }

    // Get the maintenance request and verify it belongs to one of the owner's properties
    const maintenanceRequest = await MaintenanceRequest.findOne({
      _id: requestId,
      propertyId: { $in: propertyIds }
    })
    .populate('propertyId', 'name address')
    .populate('tenantId', 'firstName lastName email')
    .populate('ownerId', 'firstName lastName email');

    if (!maintenanceRequest) {
      throw new AppError('Maintenance request not found or access denied', 404);
    }

    // Transform the data to match frontend interface
    const populatedRequest = maintenanceRequest as unknown as PopulatedMaintenanceRequest;
    const transformedRequest: TransformedMaintenanceRequest = {
      _id: maintenanceRequest._id.toString(),
      propertyId: populatedRequest.propertyId._id,
      propertyName: populatedRequest.propertyId.name,
      propertyAddress: populatedRequest.propertyId.address,
      title: maintenanceRequest.title,
      description: maintenanceRequest.description,
      priority: maintenanceRequest.priority,
      status: maintenanceRequest.status,
      estimatedCost: maintenanceRequest.estimatedCost || 0,
      createdAt: maintenanceRequest.createdAt
    };

    res.json(transformedRequest);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Error fetching maintenance request', 500);
  }
};

// Update a maintenance request (for owner approval, status changes, etc.)
export const updateOwnerMaintenanceRequest = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      throw new AppError('Authentication required', 401);
    }

    const ownerId = req.user.userId;
    const requestId = req.params.id;
    const updates = req.body;
    const propertyOwnerContext = await getPropertyOwnerContext(ownerId);

    let propertyIds: mongoose.Types.ObjectId[] = [];

    if (propertyOwnerContext.properties && propertyOwnerContext.properties.length > 0) {
      propertyIds = propertyOwnerContext.properties;
    } else {
      const query: any = { ownerId: ownerId };
      if (propertyOwnerContext.companyId) {
        query.companyId = propertyOwnerContext.companyId;
      }
      
      const properties = await Property.find(query);
      propertyIds = properties.map(p => p._id);
    }

    const maintenanceRequest = await MaintenanceRequest.findOne({
      _id: requestId,
      propertyId: { $in: propertyIds }
    });

    if (!maintenanceRequest) {
      throw new AppError('Maintenance request not found or access denied', 404);
    }

    // Update the maintenance request
    const updatedRequest = await MaintenanceRequest.findByIdAndUpdate(
      requestId,
      updates,
      { new: true, runValidators: true }
    )
    .populate('propertyId', 'name address')
    .populate('tenantId', 'firstName lastName email')
    .populate('ownerId', 'firstName lastName email');

    res.json(updatedRequest);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Error updating maintenance request', 500);
  }
};

// Add a message to a maintenance request
export const addOwnerMaintenanceMessage = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      throw new AppError('Authentication required', 401);
    }

    const ownerId = req.user.userId;
    const requestId = req.params.id;
    const { content } = req.body;
    const propertyOwnerContext = await getPropertyOwnerContext(ownerId);

    if (!content) {
      throw new AppError('Message content is required', 400);
    }

    let propertyIds: mongoose.Types.ObjectId[] = [];

    if (propertyOwnerContext.properties && propertyOwnerContext.properties.length > 0) {
      propertyIds = propertyOwnerContext.properties;
    } else {
      const query: any = { ownerId: ownerId };
      if (propertyOwnerContext.companyId) {
        query.companyId = propertyOwnerContext.companyId;
      }
      
      const properties = await Property.find(query);
      propertyIds = properties.map(p => p._id);
    }

    const maintenanceRequest = await MaintenanceRequest.findOne({
      _id: requestId,
      propertyId: { $in: propertyIds }
    });

    if (!maintenanceRequest) {
      throw new AppError('Maintenance request not found or access denied', 404);
    }

    // Add the message
    const message = {
      sender: propertyOwnerContext._id,
      content,
      timestamp: new Date()
    };

    maintenanceRequest.messages = maintenanceRequest.messages || [];
    maintenanceRequest.messages.push(message);

    await maintenanceRequest.save();

    const updatedRequest = await MaintenanceRequest.findById(requestId)
      .populate('propertyId', 'name address')
      .populate('tenantId', 'firstName lastName email')
      .populate('ownerId', 'firstName lastName email');

    res.json(updatedRequest);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Error adding message to maintenance request', 500);
  }
}; 