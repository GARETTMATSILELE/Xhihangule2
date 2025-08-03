import { Request, Response } from 'express';
import { MaintenanceRequest, IMaintenanceRequest, IMaintenanceAttachment } from '../models/MaintenanceRequest';
import { Property, IProperty } from '../models/Property';
import { AppError } from '../middleware/errorHandler';
import { JwtPayload } from '../types/auth';
import mongoose from 'mongoose';

// Create a new maintenance request
export const createMaintenanceRequest = async (req: Request, res: Response) => {
  try {
    const userId = (req.user as JwtPayload)?.userId;
    if (!userId) {
      throw new AppError('User authentication required', 401);
    }

    const { propertyId, title, description, priority, estimatedCost } = req.body;

    // Validate required fields
    if (!propertyId || !title || !description) {
      throw new AppError('Property ID, title, and description are required', 400);
    }

    // Fetch the property to get ownerId and companyId
    const property = await Property.findOne({ _id: propertyId });
    if (!property) {
      throw new AppError('Property not found', 404);
    }

    if (!property.ownerId) {
      throw new AppError('Property owner not found', 404);
    }

    const maintenanceRequest = new MaintenanceRequest({
      propertyId,
      requestedBy: userId,
      ownerId: property.ownerId,
      companyId: property.companyId,
      title,
      description,
      priority: priority || 'medium',
      estimatedCost: estimatedCost || 0,
      status: 'pending'
    });

    await maintenanceRequest.save();
    res.status(201).json(maintenanceRequest);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error creating maintenance request:', error);
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
    if (!userId) {
      throw new AppError('User authentication required', 401);
    }

    const { id } = req.params;
    if (!id) {
      throw new AppError('Maintenance request ID is required', 400);
    }

    const { status, estimatedCost, attachments } = req.body;

    const maintenanceRequest = await MaintenanceRequest.findById(id);
    if (!maintenanceRequest) {
      throw new AppError('Maintenance request not found', 404);
    }

    // Check if user has permission to update this request
    const property = await Property.findOne({ _id: maintenanceRequest.propertyId });
    if (!property) {
      throw new AppError('Property not found', 404);
    }

    // Allow updates if user is the requester, owner, or has admin access
    const isRequester = maintenanceRequest.requestedBy.toString() === userId;
    const isOwner = property.ownerId && property.ownerId.toString() === userId;
    
    if (!isRequester && !isOwner) {
      throw new AppError('Unauthorized - You can only update your own requests or requests for your properties', 403);
    }

    // Update fields with validation
    if (status && ['pending', 'pending_approval', 'approved', 'pending_completion', 'in_progress', 'completed', 'cancelled'].includes(status)) {
      maintenanceRequest.status = status;
    }
    
    if (estimatedCost !== undefined && estimatedCost >= 0) {
      maintenanceRequest.estimatedCost = estimatedCost;
    }
    
    if (attachments && Array.isArray(attachments)) {
      maintenanceRequest.attachments = attachments;
    }

    await maintenanceRequest.save();
    
    // Populate related data before sending response
    const updatedRequest = await MaintenanceRequest.findById(id)
      .populate('propertyId', 'name address')
      .populate('requestedBy', 'firstName lastName')
      .populate('ownerId', 'firstName lastName');

    res.json(updatedRequest);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error updating maintenance request:', error);
    throw new AppError('Error updating maintenance request', 500);
  }
};

// Approve maintenance request (owner action)
export const approveMaintenanceRequest = async (req: Request, res: Response) => {
  try {
    const userId = (req.user as JwtPayload)?.userId;
    if (!userId) {
      throw new AppError('User authentication required', 401);
    }

    const { id } = req.params;
    if (!id) {
      throw new AppError('Maintenance request ID is required', 400);
    }

    const maintenanceRequest = await MaintenanceRequest.findById(id);
    if (!maintenanceRequest) {
      throw new AppError('Maintenance request not found', 404);
    }

    // Check if request is in the correct status for approval
    if (maintenanceRequest.status !== 'pending_approval') {
      throw new AppError('Only requests with pending approval status can be approved', 400);
    }

    // Check if user is the owner of the property
    const property = await Property.findOne({ _id: maintenanceRequest.propertyId });
    if (!property) {
      throw new AppError('Property not found', 404);
    }
    
    if (!property.ownerId || property.ownerId.toString() !== userId) {
      throw new AppError('Unauthorized - Only property owner can approve requests', 403);
    }

    // Update status to approved
    maintenanceRequest.status = 'approved';
    await maintenanceRequest.save();

    // After a short delay, change to pending_completion
    setTimeout(async () => {
      try {
        const updatedRequest = await MaintenanceRequest.findById(id);
        if (updatedRequest && updatedRequest.status === 'approved') {
          updatedRequest.status = 'pending_completion';
          await updatedRequest.save();
        }
      } catch (error) {
        console.error('Error updating status to pending_completion:', error);
      }
    }, 1000);

    const updatedRequest = await MaintenanceRequest.findById(id)
      .populate('propertyId', 'name address')
      .populate('requestedBy', 'firstName lastName')
      .populate('ownerId', 'firstName lastName');

    res.json(updatedRequest);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error approving maintenance request:', error);
    throw new AppError('Error approving maintenance request', 500);
  }
};

// Complete maintenance request (agent action)
export const completeMaintenanceRequest = async (req: Request, res: Response) => {
  try {
    const userId = (req.user as JwtPayload)?.userId;
    if (!userId) {
      throw new AppError('User authentication required', 401);
    }

    const { id } = req.params;
    if (!id) {
      throw new AppError('Maintenance request ID is required', 400);
    }

    const maintenanceRequest = await MaintenanceRequest.findById(id);
    if (!maintenanceRequest) {
      throw new AppError('Maintenance request not found', 404);
    }

    // Check if request is in the correct status for completion
    if (maintenanceRequest.status !== 'pending_completion') {
      throw new AppError('Only requests with pending completion status can be marked as completed', 400);
    }

    // Check if user is the requester (agent)
    if (maintenanceRequest.requestedBy.toString() !== userId) {
      throw new AppError('Unauthorized - Only the requesting agent can complete the request', 403);
    }

    // Update status to completed
    maintenanceRequest.status = 'completed';
    await maintenanceRequest.save();

    const updatedRequest = await MaintenanceRequest.findById(id)
      .populate('propertyId', 'name address')
      .populate('requestedBy', 'firstName lastName')
      .populate('ownerId', 'firstName lastName');

    res.json(updatedRequest);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error completing maintenance request:', error);
    throw new AppError('Error completing maintenance request', 500);
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
      if (typeof propertyId !== 'string') {
        throw new AppError('Invalid property ID format', 400);
      }
      query.propertyId = propertyId;
    }

    // If companyId is specified (for public requests), filter by company
    if (companyId) {
      if (typeof companyId !== 'string') {
        throw new AppError('Invalid company ID format', 400);
      }
      query.companyId = companyId;
    }

    console.log('Query to execute:', query);

    const maintenanceRequests = await MaintenanceRequest.find(query)
      .populate('requestedBy', 'firstName lastName')
      .populate('propertyId', 'name address')
      .populate('ownerId', 'firstName lastName')
      .sort({ createdAt: -1 });

    console.log('Found maintenance requests:', maintenanceRequests.length);

    // Return empty array if no requests found instead of error
    if (!maintenanceRequests || maintenanceRequests.length === 0) {
      return res.json([]);
    }

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