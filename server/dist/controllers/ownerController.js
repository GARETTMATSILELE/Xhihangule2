"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOwnerNetIncome = exports.addOwnerMaintenanceMessage = exports.approveOwnerMaintenanceRequest = exports.updateOwnerMaintenanceRequest = exports.getOwnerMaintenanceRequestById = exports.getOwnerMaintenanceRequests = exports.getOwnerPropertyById = exports.getOwnerProperties = void 0;
const PropertyOwner_1 = require("../models/PropertyOwner");
const Property_1 = require("../models/Property");
const MaintenanceRequest_1 = require("../models/MaintenanceRequest");
const User_1 = require("../models/User");
const errorHandler_1 = require("../middleware/errorHandler");
// Helper function to get property owner context (from either PropertyOwner or User collection)
const getPropertyOwnerContext = (ownerId) => __awaiter(void 0, void 0, void 0, function* () {
    // First, try to find the property owner document (this is the primary source)
    let propertyOwner = yield PropertyOwner_1.PropertyOwner.findById(ownerId);
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
    const user = yield User_1.User.findById(ownerId);
    if (!user || user.role !== 'owner') {
        throw new errorHandler_1.AppError('Property owner not found', 404);
    }
    console.log(`Found owner user in User collection: ${user.email}`);
    // Use the user as the property owner context
    return {
        _id: user._id,
        properties: [], // Will be populated from Property collection
        companyId: user.companyId
    };
});
// Get properties for the authenticated owner
const getOwnerProperties = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
            throw new errorHandler_1.AppError('Authentication required', 401);
        }
        const ownerId = req.user.userId;
        const propertyOwnerContext = yield getPropertyOwnerContext(ownerId);
        // Get properties using the properties array from PropertyOwner, or fallback to ownerId
        let properties;
        if (propertyOwnerContext.properties && propertyOwnerContext.properties.length > 0) {
            // Build query - filter by companyId from PropertyOwner context
            const query = { _id: { $in: propertyOwnerContext.properties } };
            if (propertyOwnerContext.companyId) {
                query.companyId = propertyOwnerContext.companyId;
            }
            properties = yield Property_1.Property.find(query).populate('ownerId', 'firstName lastName email');
        }
        else {
            // Fallback: get properties where ownerId matches - filter by companyId from PropertyOwner context
            const query = { ownerId: ownerId };
            if (propertyOwnerContext.companyId) {
                query.companyId = propertyOwnerContext.companyId;
            }
            properties = yield Property_1.Property.find(query).populate('ownerId', 'firstName lastName email');
        }
        if (!properties || properties.length === 0) {
            return res.json([]);
        }
        // Calculate additional metrics for each property
        const propertiesWithMetrics = yield Promise.all(properties.map((property) => __awaiter(void 0, void 0, void 0, function* () {
            // Get maintenance requests for this property
            const maintenanceRequests = yield MaintenanceRequest_1.MaintenanceRequest.find({
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
        })));
        res.json(propertiesWithMetrics);
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            throw error;
        }
        throw new errorHandler_1.AppError('Error fetching properties', 500);
    }
});
exports.getOwnerProperties = getOwnerProperties;
// Get a specific property for the authenticated owner
const getOwnerPropertyById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
            throw new errorHandler_1.AppError('Authentication required', 401);
        }
        const ownerId = req.user.userId;
        const propertyId = req.params.id;
        const propertyOwnerContext = yield getPropertyOwnerContext(ownerId);
        // Check if the property is in the owner's properties array
        const isOwnerProperty = (_b = propertyOwnerContext.properties) === null || _b === void 0 ? void 0 : _b.some((propId) => propId.toString() === propertyId);
        if (!isOwnerProperty) {
            // Fallback: check if property has this owner as ownerId
            const query = { _id: propertyId, ownerId: ownerId };
            if (propertyOwnerContext.companyId) {
                query.companyId = propertyOwnerContext.companyId;
            }
            const property = yield Property_1.Property.findOne(query);
            if (!property) {
                throw new errorHandler_1.AppError('Property not found or access denied', 404);
            }
        }
        // Get the property with full details
        const query = { _id: propertyId };
        if (propertyOwnerContext.companyId) {
            query.companyId = propertyOwnerContext.companyId;
        }
        const property = yield Property_1.Property.findOne(query).populate('ownerId', 'firstName lastName email');
        if (!property) {
            throw new errorHandler_1.AppError('Property not found', 404);
        }
        // Get maintenance requests for this property
        const maintenanceRequests = yield MaintenanceRequest_1.MaintenanceRequest.find({
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
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            throw error;
        }
        throw new errorHandler_1.AppError('Error fetching property', 500);
    }
});
exports.getOwnerPropertyById = getOwnerPropertyById;
// Get maintenance requests for the authenticated owner's properties
const getOwnerMaintenanceRequests = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        console.log('getOwnerMaintenanceRequests: Starting request processing');
        // Get user context from query parameters (for public API) or from authentication middleware
        let ownerId;
        let companyId;
        if ((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) {
            // Authenticated request
            ownerId = req.user.userId;
            companyId = req.user.companyId;
            console.log('getOwnerMaintenanceRequests: Using authenticated user context', { ownerId, companyId });
        }
        else {
            // Public request - get from query parameters
            ownerId = req.query.userId;
            companyId = req.query.companyId;
            if (!ownerId) {
                console.log('getOwnerMaintenanceRequests: Missing userId in query parameters');
                return res.status(400).json({ message: 'userId is required as query parameter' });
            }
            console.log('getOwnerMaintenanceRequests: Using public API context', { ownerId, companyId });
        }
        // Get property owner context
        console.log('getOwnerMaintenanceRequests: Getting property owner context for', ownerId);
        const propertyOwnerContext = yield getPropertyOwnerContext(ownerId);
        console.log('getOwnerMaintenanceRequests: Property owner context retrieved', {
            hasProperties: ((_b = propertyOwnerContext.properties) === null || _b === void 0 ? void 0 : _b.length) > 0,
            companyId: propertyOwnerContext.companyId
        });
        // Get property IDs for this owner
        let propertyIds = [];
        if (propertyOwnerContext.properties && propertyOwnerContext.properties.length > 0) {
            // Use properties from PropertyOwner context
            propertyIds = propertyOwnerContext.properties;
            console.log('getOwnerMaintenanceRequests: Using properties from PropertyOwner context', propertyIds.length);
        }
        else {
            // Fallback: get properties where ownerId matches
            console.log('getOwnerMaintenanceRequests: No properties in context, fetching from Property collection');
            const query = { ownerId: ownerId };
            if (propertyOwnerContext.companyId) {
                query.companyId = propertyOwnerContext.companyId;
            }
            const properties = yield Property_1.Property.find(query);
            propertyIds = properties.map(p => p._id);
            console.log('getOwnerMaintenanceRequests: Found properties from Property collection', propertyIds.length);
        }
        if (propertyIds.length === 0) {
            console.log('getOwnerMaintenanceRequests: No properties found, returning empty array');
            return res.json([]);
        }
        // Get maintenance requests for these properties
        console.log('getOwnerMaintenanceRequests: Fetching maintenance requests for properties', propertyIds);
        const maintenanceRequests = yield MaintenanceRequest_1.MaintenanceRequest.find({
            propertyId: { $in: propertyIds }
        })
            .populate('propertyId', 'name address')
            .populate('requestedBy', 'firstName lastName email')
            .populate('ownerId', 'firstName lastName email')
            .sort({ createdAt: -1 });
        console.log('getOwnerMaintenanceRequests: Found maintenance requests', maintenanceRequests.length);
        // Transform the data to match frontend interface
        const transformedRequests = maintenanceRequests.map(request => {
            var _a;
            try {
                // Handle property data safely
                let propertyName = 'Unknown Property';
                let propertyAddress = 'Unknown Address';
                let propertyId = '';
                if (request.propertyId) {
                    if (typeof request.propertyId === 'object' && request.propertyId !== null) {
                        // Populated property object
                        propertyName = request.propertyId.name || 'Unknown Property';
                        propertyAddress = request.propertyId.address || 'Unknown Address';
                        propertyId = ((_a = request.propertyId._id) === null || _a === void 0 ? void 0 : _a.toString()) || '';
                    }
                    else {
                        // Property ID string
                        propertyId = String(request.propertyId);
                    }
                }
                return {
                    _id: request._id.toString(),
                    propertyId: propertyId,
                    propertyName: propertyName,
                    propertyAddress: propertyAddress,
                    title: request.title || 'Untitled Request',
                    description: request.description || 'No description provided',
                    priority: request.priority || 'medium',
                    status: request.status || 'pending',
                    estimatedCost: request.estimatedCost || 0,
                    createdAt: request.createdAt
                };
            }
            catch (transformError) {
                console.error('getOwnerMaintenanceRequests: Error transforming request', request._id, transformError);
                // Return a safe fallback object
                return {
                    _id: request._id.toString(),
                    propertyId: '',
                    propertyName: 'Unknown Property',
                    propertyAddress: 'Unknown Address',
                    title: 'Error Loading Request',
                    description: 'This request could not be loaded properly',
                    priority: 'medium',
                    status: 'pending',
                    estimatedCost: 0,
                    createdAt: request.createdAt
                };
            }
        });
        console.log('getOwnerMaintenanceRequests: Successfully transformed requests', transformedRequests.length);
        res.json(transformedRequests);
    }
    catch (error) {
        console.error('getOwnerMaintenanceRequests: Unexpected error:', error);
        if (error instanceof errorHandler_1.AppError) {
            throw error;
        }
        // Return a more specific error message
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('getOwnerMaintenanceRequests: Throwing AppError with message:', errorMessage);
        throw new errorHandler_1.AppError(`Error fetching maintenance requests: ${errorMessage}`, 500);
    }
});
exports.getOwnerMaintenanceRequests = getOwnerMaintenanceRequests;
// Get a specific maintenance request for the authenticated owner
const getOwnerMaintenanceRequestById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        console.log('getOwnerMaintenanceRequestById: Starting request processing');
        // Get user context from query parameters (for public API) or from authentication middleware
        let ownerId;
        let companyId;
        if ((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) {
            // Authenticated request
            ownerId = req.user.userId;
            companyId = req.user.companyId;
            console.log('getOwnerMaintenanceRequestById: Using authenticated user context', { ownerId, companyId });
        }
        else {
            // Public request - get from query parameters
            ownerId = req.query.userId;
            companyId = req.query.companyId;
            if (!ownerId) {
                console.log('getOwnerMaintenanceRequestById: Missing userId in query parameters');
                return res.status(400).json({ message: 'userId is required as query parameter' });
            }
            console.log('getOwnerMaintenanceRequestById: Using public API context', { ownerId, companyId });
        }
        const requestId = req.params.id;
        console.log('getOwnerMaintenanceRequestById: Request ID', requestId);
        if (!requestId) {
            console.log('getOwnerMaintenanceRequestById: Missing request ID in params');
            return res.status(400).json({ message: 'Request ID is required' });
        }
        // Get property owner context
        console.log('getOwnerMaintenanceRequestById: Getting property owner context for', ownerId);
        const propertyOwnerContext = yield getPropertyOwnerContext(ownerId);
        console.log('getOwnerMaintenanceRequestById: Property owner context retrieved', {
            hasProperties: ((_b = propertyOwnerContext.properties) === null || _b === void 0 ? void 0 : _b.length) > 0,
            companyId: propertyOwnerContext.companyId
        });
        // Get property IDs for this owner
        let propertyIds = [];
        if (propertyOwnerContext.properties && propertyOwnerContext.properties.length > 0) {
            // Use properties from PropertyOwner context
            propertyIds = propertyOwnerContext.properties;
            console.log('getOwnerMaintenanceRequestById: Using properties from PropertyOwner context', propertyIds.length);
        }
        else {
            // Fallback: get properties where ownerId matches
            console.log('getOwnerMaintenanceRequestById: No properties in context, fetching from Property collection');
            const query = { ownerId: ownerId };
            if (propertyOwnerContext.companyId) {
                query.companyId = propertyOwnerContext.companyId;
            }
            const properties = yield Property_1.Property.find(query);
            propertyIds = properties.map(p => p._id);
            console.log('getOwnerMaintenanceRequestById: Found properties from Property collection', propertyIds.length);
        }
        if (propertyIds.length === 0) {
            console.log('getOwnerMaintenanceRequestById: No properties found for owner');
            throw new errorHandler_1.AppError('No properties found for this owner', 404);
        }
        // Get the maintenance request and verify it belongs to one of the owner's properties
        console.log('getOwnerMaintenanceRequestById: Fetching maintenance request', requestId, 'for properties', propertyIds);
        const maintenanceRequest = yield MaintenanceRequest_1.MaintenanceRequest.findOne({
            _id: requestId,
            propertyId: { $in: propertyIds }
        })
            .populate('propertyId', 'name address')
            .populate('requestedBy', 'firstName lastName email')
            .populate('ownerId', 'firstName lastName email')
            .populate('messages.sender', 'firstName lastName email');
        if (!maintenanceRequest) {
            console.log('getOwnerMaintenanceRequestById: Maintenance request not found or access denied', requestId);
            throw new errorHandler_1.AppError('Maintenance request not found or access denied', 404);
        }
        console.log('getOwnerMaintenanceRequestById: Successfully retrieved maintenance request', requestId);
        res.json(maintenanceRequest);
    }
    catch (error) {
        console.error('getOwnerMaintenanceRequestById: Unexpected error:', error);
        if (error instanceof errorHandler_1.AppError) {
            throw error;
        }
        // Return a more specific error message
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('getOwnerMaintenanceRequestById: Throwing AppError with message:', errorMessage);
        throw new errorHandler_1.AppError(`Error fetching maintenance request: ${errorMessage}`, 500);
    }
});
exports.getOwnerMaintenanceRequestById = getOwnerMaintenanceRequestById;
// Update a maintenance request (for owner approval, status changes, etc.)
const updateOwnerMaintenanceRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        // Get user context from query parameters (for public API) or from authentication middleware
        let ownerId;
        let companyId;
        if ((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) {
            // Authenticated request
            ownerId = req.user.userId;
            companyId = req.user.companyId;
        }
        else {
            // Public request - get from query parameters
            ownerId = req.query.userId;
            companyId = req.query.companyId;
            if (!ownerId) {
                return res.status(400).json({ message: 'userId is required as query parameter' });
            }
        }
        const requestId = req.params.id;
        const updates = req.body;
        const propertyOwnerContext = yield getPropertyOwnerContext(ownerId);
        let propertyIds = [];
        if (propertyOwnerContext.properties && propertyOwnerContext.properties.length > 0) {
            propertyIds = propertyOwnerContext.properties;
        }
        else {
            const query = { ownerId: ownerId };
            if (propertyOwnerContext.companyId) {
                query.companyId = propertyOwnerContext.companyId;
            }
            const properties = yield Property_1.Property.find(query);
            propertyIds = properties.map(p => p._id);
        }
        const maintenanceRequest = yield MaintenanceRequest_1.MaintenanceRequest.findOne({
            _id: requestId,
            propertyId: { $in: propertyIds }
        });
        if (!maintenanceRequest) {
            throw new errorHandler_1.AppError('Maintenance request not found or access denied', 404);
        }
        // Update the maintenance request
        const updatedRequest = yield MaintenanceRequest_1.MaintenanceRequest.findByIdAndUpdate(requestId, updates, { new: true, runValidators: true })
            .populate('propertyId', 'name address')
            .populate('tenantId', 'firstName lastName email')
            .populate('ownerId', 'firstName lastName email');
        res.json(updatedRequest);
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            throw error;
        }
        throw new errorHandler_1.AppError('Error updating maintenance request', 500);
    }
});
exports.updateOwnerMaintenanceRequest = updateOwnerMaintenanceRequest;
// Approve a maintenance request (owner action)
const approveOwnerMaintenanceRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        // Get user context from query parameters (for public API) or from authentication middleware
        let ownerId;
        let companyId;
        if ((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) {
            // Authenticated request
            ownerId = req.user.userId;
            companyId = req.user.companyId;
        }
        else {
            // Public request - get from query parameters
            ownerId = req.query.userId;
            companyId = req.query.companyId;
            if (!ownerId) {
                return res.status(400).json({ message: 'userId is required as query parameter' });
            }
        }
        const requestId = req.params.id;
        if (!requestId) {
            throw new errorHandler_1.AppError('Maintenance request ID is required', 400);
        }
        const propertyOwnerContext = yield getPropertyOwnerContext(ownerId);
        let propertyIds = [];
        if (propertyOwnerContext.properties && propertyOwnerContext.properties.length > 0) {
            propertyIds = propertyOwnerContext.properties;
        }
        else {
            const query = { ownerId: ownerId };
            if (propertyOwnerContext.companyId) {
                query.companyId = propertyOwnerContext.companyId;
            }
            const properties = yield Property_1.Property.find(query);
            propertyIds = properties.map(p => p._id);
        }
        if (propertyIds.length === 0) {
            throw new errorHandler_1.AppError('No properties found for this owner', 404);
        }
        const maintenanceRequest = yield MaintenanceRequest_1.MaintenanceRequest.findOne({
            _id: requestId,
            propertyId: { $in: propertyIds }
        });
        if (!maintenanceRequest) {
            throw new errorHandler_1.AppError('Maintenance request not found or access denied', 404);
        }
        // Check if request is in the correct status for approval
        if (maintenanceRequest.status !== 'pending_approval') {
            throw new errorHandler_1.AppError('Only requests with pending approval status can be approved', 400);
        }
        // Update status to approved
        maintenanceRequest.status = 'approved';
        yield maintenanceRequest.save();
        // After a short delay, change to pending_completion
        setTimeout(() => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const updatedRequest = yield MaintenanceRequest_1.MaintenanceRequest.findById(requestId);
                if (updatedRequest && updatedRequest.status === 'approved') {
                    updatedRequest.status = 'pending_completion';
                    yield updatedRequest.save();
                }
            }
            catch (error) {
                console.error('Error updating status to pending_completion:', error);
            }
        }), 1000);
        const updatedRequest = yield MaintenanceRequest_1.MaintenanceRequest.findById(requestId)
            .populate('propertyId', 'name address')
            .populate('requestedBy', 'firstName lastName email')
            .populate('ownerId', 'firstName lastName email');
        if (!updatedRequest) {
            throw new errorHandler_1.AppError('Error retrieving updated maintenance request', 500);
        }
        res.json(updatedRequest);
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            throw error;
        }
        console.error('Error approving maintenance request:', error);
        throw new errorHandler_1.AppError('Error approving maintenance request', 500);
    }
});
exports.approveOwnerMaintenanceRequest = approveOwnerMaintenanceRequest;
// Add a message to a maintenance request
const addOwnerMaintenanceMessage = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        // Get user context from query parameters (for public API) or from authentication middleware
        let ownerId;
        let companyId;
        if ((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) {
            // Authenticated request
            ownerId = req.user.userId;
            companyId = req.user.companyId;
        }
        else {
            // Public request - get from query parameters
            ownerId = req.query.userId;
            companyId = req.query.companyId;
            if (!ownerId) {
                return res.status(400).json({ message: 'userId is required as query parameter' });
            }
        }
        const requestId = req.params.id;
        const { content } = req.body;
        const propertyOwnerContext = yield getPropertyOwnerContext(ownerId);
        if (!content) {
            throw new errorHandler_1.AppError('Message content is required', 400);
        }
        let propertyIds = [];
        if (propertyOwnerContext.properties && propertyOwnerContext.properties.length > 0) {
            propertyIds = propertyOwnerContext.properties;
        }
        else {
            const query = { ownerId: ownerId };
            if (propertyOwnerContext.companyId) {
                query.companyId = propertyOwnerContext.companyId;
            }
            const properties = yield Property_1.Property.find(query);
            propertyIds = properties.map(p => p._id);
        }
        const maintenanceRequest = yield MaintenanceRequest_1.MaintenanceRequest.findOne({
            _id: requestId,
            propertyId: { $in: propertyIds }
        });
        if (!maintenanceRequest) {
            throw new errorHandler_1.AppError('Maintenance request not found or access denied', 404);
        }
        // Add the message
        const message = {
            sender: propertyOwnerContext._id,
            content,
            timestamp: new Date()
        };
        maintenanceRequest.messages = maintenanceRequest.messages || [];
        maintenanceRequest.messages.push(message);
        yield maintenanceRequest.save();
        const updatedRequest = yield MaintenanceRequest_1.MaintenanceRequest.findById(requestId)
            .populate('propertyId', 'name address')
            .populate('tenantId', 'firstName lastName email')
            .populate('ownerId', 'firstName lastName email')
            .populate('messages.sender', 'firstName lastName email');
        res.json(updatedRequest);
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            throw error;
        }
        throw new errorHandler_1.AppError('Error adding message to maintenance request', 500);
    }
});
exports.addOwnerMaintenanceMessage = addOwnerMaintenanceMessage;
// Get owner's net income from payments
const getOwnerNetIncome = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        console.log('getOwnerNetIncome: Starting request processing');
        // Get user context from query parameters (for public API) or from authentication middleware
        let ownerId;
        let companyId;
        if ((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) {
            // Authenticated request
            ownerId = req.user.userId;
            companyId = req.user.companyId;
            console.log('getOwnerNetIncome: Using authenticated user context', { ownerId, companyId });
        }
        else {
            // Public request - get from query parameters
            ownerId = req.query.userId;
            companyId = req.query.companyId;
            if (!ownerId) {
                console.log('getOwnerNetIncome: Missing userId in query parameters');
                return res.status(400).json({ message: 'userId is required as query parameter' });
            }
            console.log('getOwnerNetIncome: Using public API context', { ownerId, companyId });
        }
        // Get property owner context
        console.log('getOwnerNetIncome: Getting property owner context for', ownerId);
        const propertyOwnerContext = yield getPropertyOwnerContext(ownerId);
        console.log('getOwnerNetIncome: Property owner context retrieved', {
            hasProperties: ((_b = propertyOwnerContext.properties) === null || _b === void 0 ? void 0 : _b.length) > 0,
            companyId: propertyOwnerContext.companyId
        });
        // Get property IDs for this owner
        let propertyIds = [];
        if (propertyOwnerContext.properties && propertyOwnerContext.properties.length > 0) {
            // Use properties from PropertyOwner context
            propertyIds = propertyOwnerContext.properties;
            console.log('getOwnerNetIncome: Using properties from PropertyOwner context', propertyIds.length);
        }
        else {
            // Fallback: get properties where ownerId matches
            console.log('getOwnerNetIncome: No properties in context, fetching from Property collection');
            const query = { ownerId: ownerId };
            if (propertyOwnerContext.companyId) {
                query.companyId = propertyOwnerContext.companyId;
            }
            const properties = yield Property_1.Property.find(query);
            propertyIds = properties.map(p => p._id);
            console.log('getOwnerNetIncome: Found properties from Property collection', propertyIds.length);
        }
        if (propertyIds.length === 0) {
            console.log('getOwnerNetIncome: No properties found, returning zero net income');
            return res.json({ netIncome: 0 });
        }
        // Import Payment model
        const { Payment } = require('../models/Payment');
        // Get all payments for these properties and sum up the ownerAmount
        console.log('getOwnerNetIncome: Fetching payments for properties', propertyIds);
        const payments = yield Payment.find({
            propertyId: { $in: propertyIds },
            status: 'completed' // Only count completed payments
        }).select('commissionDetails.ownerAmount');
        console.log('getOwnerNetIncome: Found payments', payments.length);
        // Calculate total net income by summing ownerAmount
        const netIncome = payments.reduce((total, payment) => {
            var _a;
            const ownerAmount = ((_a = payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.ownerAmount) || 0;
            return total + ownerAmount;
        }, 0);
        console.log('getOwnerNetIncome: Calculated net income', netIncome);
        res.json({ netIncome });
    }
    catch (error) {
        console.error('getOwnerNetIncome: Unexpected error:', error);
        if (error instanceof errorHandler_1.AppError) {
            throw error;
        }
        // Return a more specific error message
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('getOwnerNetIncome: Throwing AppError with message:', errorMessage);
        throw new errorHandler_1.AppError(`Error calculating net income: ${errorMessage}`, 500);
    }
});
exports.getOwnerNetIncome = getOwnerNetIncome;
