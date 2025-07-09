import { Request, Response } from 'express';
import { MaintenanceRequest, IMaintenanceRequest } from '../models/MaintenanceRequest';
import { Property, IProperty } from '../models/Property';
import { AppError } from '../middleware/errorHandler';
import { JwtPayload } from '../types/auth';
import mongoose from 'mongoose';

// Create a new maintenance request
export const createMaintenanceRequest = async (req: Request, res: Response) => {
  try {
    const userId = (req.user as JwtPayload)?.userId;
    const { propertyId, description, priority, estimatedCost } = req.body;

    const property = await Property.findOne({ _id: propertyId, ownerId: userId });
    if (!property) {
      throw new AppError('Property not found', 404);
    }

    const maintenanceRequest = new MaintenanceRequest({
      propertyId,
      tenantId: userId,
      description,
      priority,
      estimatedCost,
      status: 'pending'
    });

    await maintenanceRequest.save();
    res.status(201).json(maintenanceRequest);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Error creating maintenance request', 500);
  }
};

// Get maintenance requests for a property
export const getPropertyMaintenanceRequests = async (req: Request, res: Response) => {
  try {
    const userId = (req.user as JwtPayload)?.userId;
    const { propertyId } = req.params;
    const maintenanceRequests = await MaintenanceRequest.find({
      propertyId,
      tenantId: userId
    })
      .populate('tenantId', 'name email')
      .sort({ createdAt: -1 });

    res.json(maintenanceRequests);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Error fetching maintenance requests', 500);
  }
};

// Add message to maintenance request
export const addMaintenanceMessage = async (req: Request, res: Response) => {
  try {
    const userId = (req.user as JwtPayload)?.userId;
    const { requestId } = req.params;
    const { content } = req.body;

    const maintenanceRequest = await MaintenanceRequest.findOne({
      _id: requestId,
      tenantId: userId
    });

    if (!maintenanceRequest) {
      throw new AppError('Maintenance request not found', 404);
    }

    const message = {
      sender: new mongoose.Types.ObjectId(userId),
      content,
      timestamp: new Date()
    };

    maintenanceRequest.messages.push(message);
    await maintenanceRequest.save();
    res.json(maintenanceRequest);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Error adding message to maintenance request', 500);
  }
};

// Update maintenance request
export const updateMaintenanceRequest = async (req: Request, res: Response) => {
  try {
    const userId = (req.user as JwtPayload)?.userId;
    const { id } = req.params;
    const { status, estimatedCost } = req.body;

    const maintenanceRequest = await MaintenanceRequest.findById(id);
    if (!maintenanceRequest) {
      throw new AppError('Maintenance request not found', 404);
    }

    const property = await Property.findOne({ _id: maintenanceRequest.propertyId, ownerId: userId });
    if (!property) {
      throw new AppError('Unauthorized', 403);
    }

    maintenanceRequest.status = status;
    if (estimatedCost) maintenanceRequest.estimatedCost = estimatedCost;

    await maintenanceRequest.save();
    res.json(maintenanceRequest);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Error updating maintenance request', 500);
  }
};

// Get maintenance request details
export const getMaintenanceRequestDetails = async (req: Request, res: Response) => {
  try {
    const userId = (req.user as JwtPayload)?.userId;
    const { requestId } = req.params;
    const maintenanceRequest = await MaintenanceRequest.findOne({
      _id: requestId,
      tenantId: userId
    })
      .populate('propertyId', 'name address')
      .populate('tenantId', 'name email');

    if (!maintenanceRequest) {
      throw new AppError('Maintenance request not found', 404);
    }

    res.json(maintenanceRequest);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Error fetching maintenance request details', 500);
  }
};

export const deleteMaintenanceRequest = async (req: Request, res: Response) => {
  try {
    const userId = (req.user as JwtPayload)?.userId;
    const { requestId } = req.params;
    const maintenanceRequest = await MaintenanceRequest.findOneAndDelete({
      _id: requestId,
      tenantId: userId
    });

    if (!maintenanceRequest) {
      throw new AppError('Maintenance request not found', 404);
    }

    res.json({ message: 'Maintenance request deleted successfully' });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Error deleting maintenance request', 500);
  }
};

// Public function for getting maintenance requests (no authentication required)
export const getMaintenanceRequestsPublic = async (req: Request, res: Response) => {
  try {
    console.log('getMaintenanceRequestsPublic called with query:', req.query);
    const { propertyId, companyId } = req.query;

    const query: any = {};
    
    // If propertyId is specified, filter by that property
    if (propertyId) {
      query.propertyId = propertyId;
    }

    // If companyId is specified (for public requests), filter by company
    if (companyId) {
      query.companyId = companyId;
    }

    console.log('Query to execute:', query);

    const maintenanceRequests = await MaintenanceRequest.find(query)
      .populate('requestedBy', 'firstName lastName')
      .populate('propertyId', 'name address')
      .populate('ownerId', 'firstName lastName')
      .sort({ createdAt: -1 });

    console.log('Found maintenance requests:', maintenanceRequests.length);

    res.json(maintenanceRequests);
  } catch (error) {
    console.error('Error in getMaintenanceRequestsPublic:', error);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Error fetching maintenance requests', 500);
  }
};

export const getMaintenanceRequests = async (req: Request, res: Response) => {
  try {
    const userId = (req.user as JwtPayload)?.userId;
    const { propertyId, role, companyId } = req.query;

    const query: any = {};
    
    // If propertyId is specified, filter by that property
    if (propertyId) {
      query.propertyId = propertyId;
    }

    // If companyId is specified (for public requests), filter by company
    if (companyId) {
      query.companyId = companyId;
    }

    // If user is authenticated, apply role-based filtering
    if (userId) {
      // If role is specified as 'owner', filter by properties owned by the user
      if (role === 'owner') {
        const properties = await Property.find({ ownerId: userId });
        const propertyIds = properties.map((p: IProperty) => p._id);
        query.propertyId = { $in: propertyIds };
      }
      // If role is specified as 'tenant', filter by maintenance requests created by the user
      else if (role === 'tenant') {
        query.tenantId = userId;
      }
      // If no role specified, try to determine based on user's properties
      else {
        // Check if user owns any properties
        const ownedProperties = await Property.find({ ownerId: userId });
        if (ownedProperties.length > 0) {
          // User is a property owner, show maintenance requests for their properties
          const propertyIds = ownedProperties.map((p: IProperty) => p._id);
          query.propertyId = { $in: propertyIds };
        } else {
          // User is likely a tenant, show their own maintenance requests
          query.tenantId = userId;
        }
      }
    }

    const maintenanceRequests = await MaintenanceRequest.find(query)
      .populate('tenantId', 'name email')
      .populate('propertyId', 'name address')
      .sort({ createdAt: -1 });

    res.json(maintenanceRequests);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Error fetching maintenance requests', 500);
  }
}; 