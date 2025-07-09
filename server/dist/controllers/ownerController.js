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
exports.addOwnerMaintenanceMessage = exports.updateOwnerMaintenanceRequest = exports.getOwnerMaintenanceRequestById = exports.getOwnerMaintenanceRequests = exports.getOwnerPropertyById = exports.getOwnerProperties = void 0;
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
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
            throw new errorHandler_1.AppError('Authentication required', 401);
        }
        const ownerId = req.user.userId;
        const propertyOwnerContext = yield getPropertyOwnerContext(ownerId);
        let propertyIds = [];
        if (propertyOwnerContext.properties && propertyOwnerContext.properties.length > 0) {
            propertyIds = propertyOwnerContext.properties;
        }
        else {
            // Fallback: get properties where ownerId matches - filter by companyId from PropertyOwner context
            const query = { ownerId: ownerId };
            if (propertyOwnerContext.companyId) {
                query.companyId = propertyOwnerContext.companyId;
            }
            const properties = yield Property_1.Property.find(query);
            propertyIds = properties.map(p => p._id);
        }
        if (propertyIds.length === 0) {
            return res.json([]);
        }
        // Get maintenance requests for these properties
        const maintenanceRequests = yield MaintenanceRequest_1.MaintenanceRequest.find({
            propertyId: { $in: propertyIds }
        })
            .populate('propertyId', 'name address')
            .populate('tenantId', 'firstName lastName email')
            .populate('ownerId', 'firstName lastName email')
            .sort({ createdAt: -1 });
        // Transform the data to match frontend interface
        const transformedRequests = maintenanceRequests.map(request => {
            const populatedRequest = request;
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
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            throw error;
        }
        throw new errorHandler_1.AppError('Error fetching maintenance requests', 500);
    }
});
exports.getOwnerMaintenanceRequests = getOwnerMaintenanceRequests;
// Get a specific maintenance request for the authenticated owner
const getOwnerMaintenanceRequestById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
            throw new errorHandler_1.AppError('Authentication required', 401);
        }
        const ownerId = req.user.userId;
        const requestId = req.params.id;
        const propertyOwnerContext = yield getPropertyOwnerContext(ownerId);
        let propertyIds = [];
        if (propertyOwnerContext.properties && propertyOwnerContext.properties.length > 0) {
            propertyIds = propertyOwnerContext.properties;
        }
        else {
            // Fallback: get properties where ownerId matches - filter by companyId from PropertyOwner context
            const query = { ownerId: ownerId };
            if (propertyOwnerContext.companyId) {
                query.companyId = propertyOwnerContext.companyId;
            }
            const properties = yield Property_1.Property.find(query);
            propertyIds = properties.map(p => p._id);
        }
        // Get the maintenance request and verify it belongs to one of the owner's properties
        const maintenanceRequest = yield MaintenanceRequest_1.MaintenanceRequest.findOne({
            _id: requestId,
            propertyId: { $in: propertyIds }
        })
            .populate('propertyId', 'name address')
            .populate('tenantId', 'firstName lastName email')
            .populate('ownerId', 'firstName lastName email');
        if (!maintenanceRequest) {
            throw new errorHandler_1.AppError('Maintenance request not found or access denied', 404);
        }
        // Transform the data to match frontend interface
        const populatedRequest = maintenanceRequest;
        const transformedRequest = {
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
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            throw error;
        }
        throw new errorHandler_1.AppError('Error fetching maintenance request', 500);
    }
});
exports.getOwnerMaintenanceRequestById = getOwnerMaintenanceRequestById;
// Update a maintenance request (for owner approval, status changes, etc.)
const updateOwnerMaintenanceRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
            throw new errorHandler_1.AppError('Authentication required', 401);
        }
        const ownerId = req.user.userId;
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
// Add a message to a maintenance request
const addOwnerMaintenanceMessage = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
            throw new errorHandler_1.AppError('Authentication required', 401);
        }
        const ownerId = req.user.userId;
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
            .populate('ownerId', 'firstName lastName email');
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
