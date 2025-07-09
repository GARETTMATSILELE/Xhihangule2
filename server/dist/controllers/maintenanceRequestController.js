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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMaintenanceRequests = exports.getMaintenanceRequestsPublic = exports.deleteMaintenanceRequest = exports.getMaintenanceRequestDetails = exports.updateMaintenanceRequest = exports.addMaintenanceMessage = exports.getPropertyMaintenanceRequests = exports.createMaintenanceRequest = void 0;
const MaintenanceRequest_1 = require("../models/MaintenanceRequest");
const Property_1 = require("../models/Property");
const errorHandler_1 = require("../middleware/errorHandler");
const mongoose_1 = __importDefault(require("mongoose"));
// Create a new maintenance request
const createMaintenanceRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const { propertyId, description, priority, estimatedCost } = req.body;
        const property = yield Property_1.Property.findOne({ _id: propertyId, ownerId: userId });
        if (!property) {
            throw new errorHandler_1.AppError('Property not found', 404);
        }
        const maintenanceRequest = new MaintenanceRequest_1.MaintenanceRequest({
            propertyId,
            tenantId: userId,
            description,
            priority,
            estimatedCost,
            status: 'pending'
        });
        yield maintenanceRequest.save();
        res.status(201).json(maintenanceRequest);
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            throw error;
        }
        throw new errorHandler_1.AppError('Error creating maintenance request', 500);
    }
});
exports.createMaintenanceRequest = createMaintenanceRequest;
// Get maintenance requests for a property
const getPropertyMaintenanceRequests = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const { propertyId } = req.params;
        const maintenanceRequests = yield MaintenanceRequest_1.MaintenanceRequest.find({
            propertyId,
            tenantId: userId
        })
            .populate('tenantId', 'name email')
            .sort({ createdAt: -1 });
        res.json(maintenanceRequests);
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            throw error;
        }
        throw new errorHandler_1.AppError('Error fetching maintenance requests', 500);
    }
});
exports.getPropertyMaintenanceRequests = getPropertyMaintenanceRequests;
// Add message to maintenance request
const addMaintenanceMessage = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const { requestId } = req.params;
        const { content } = req.body;
        const maintenanceRequest = yield MaintenanceRequest_1.MaintenanceRequest.findOne({
            _id: requestId,
            tenantId: userId
        });
        if (!maintenanceRequest) {
            throw new errorHandler_1.AppError('Maintenance request not found', 404);
        }
        const message = {
            sender: new mongoose_1.default.Types.ObjectId(userId),
            content,
            timestamp: new Date()
        };
        maintenanceRequest.messages.push(message);
        yield maintenanceRequest.save();
        res.json(maintenanceRequest);
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            throw error;
        }
        throw new errorHandler_1.AppError('Error adding message to maintenance request', 500);
    }
});
exports.addMaintenanceMessage = addMaintenanceMessage;
// Update maintenance request
const updateMaintenanceRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const { id } = req.params;
        const { status, estimatedCost } = req.body;
        const maintenanceRequest = yield MaintenanceRequest_1.MaintenanceRequest.findById(id);
        if (!maintenanceRequest) {
            throw new errorHandler_1.AppError('Maintenance request not found', 404);
        }
        const property = yield Property_1.Property.findOne({ _id: maintenanceRequest.propertyId, ownerId: userId });
        if (!property) {
            throw new errorHandler_1.AppError('Unauthorized', 403);
        }
        maintenanceRequest.status = status;
        if (estimatedCost)
            maintenanceRequest.estimatedCost = estimatedCost;
        yield maintenanceRequest.save();
        res.json(maintenanceRequest);
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            throw error;
        }
        throw new errorHandler_1.AppError('Error updating maintenance request', 500);
    }
});
exports.updateMaintenanceRequest = updateMaintenanceRequest;
// Get maintenance request details
const getMaintenanceRequestDetails = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const { requestId } = req.params;
        const maintenanceRequest = yield MaintenanceRequest_1.MaintenanceRequest.findOne({
            _id: requestId,
            tenantId: userId
        })
            .populate('propertyId', 'name address')
            .populate('tenantId', 'name email');
        if (!maintenanceRequest) {
            throw new errorHandler_1.AppError('Maintenance request not found', 404);
        }
        res.json(maintenanceRequest);
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            throw error;
        }
        throw new errorHandler_1.AppError('Error fetching maintenance request details', 500);
    }
});
exports.getMaintenanceRequestDetails = getMaintenanceRequestDetails;
const deleteMaintenanceRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const { requestId } = req.params;
        const maintenanceRequest = yield MaintenanceRequest_1.MaintenanceRequest.findOneAndDelete({
            _id: requestId,
            tenantId: userId
        });
        if (!maintenanceRequest) {
            throw new errorHandler_1.AppError('Maintenance request not found', 404);
        }
        res.json({ message: 'Maintenance request deleted successfully' });
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            throw error;
        }
        throw new errorHandler_1.AppError('Error deleting maintenance request', 500);
    }
});
exports.deleteMaintenanceRequest = deleteMaintenanceRequest;
// Public function for getting maintenance requests (no authentication required)
const getMaintenanceRequestsPublic = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('getMaintenanceRequestsPublic called with query:', req.query);
        const { propertyId, companyId } = req.query;
        const query = {};
        // If propertyId is specified, filter by that property
        if (propertyId) {
            query.propertyId = propertyId;
        }
        // If companyId is specified (for public requests), filter by company
        if (companyId) {
            query.companyId = companyId;
        }
        console.log('Query to execute:', query);
        const maintenanceRequests = yield MaintenanceRequest_1.MaintenanceRequest.find(query)
            .populate('requestedBy', 'firstName lastName')
            .populate('propertyId', 'name address')
            .populate('ownerId', 'firstName lastName')
            .sort({ createdAt: -1 });
        console.log('Found maintenance requests:', maintenanceRequests.length);
        res.json(maintenanceRequests);
    }
    catch (error) {
        console.error('Error in getMaintenanceRequestsPublic:', error);
        if (error instanceof errorHandler_1.AppError) {
            throw error;
        }
        throw new errorHandler_1.AppError('Error fetching maintenance requests', 500);
    }
});
exports.getMaintenanceRequestsPublic = getMaintenanceRequestsPublic;
const getMaintenanceRequests = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const { propertyId, role, companyId } = req.query;
        const query = {};
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
                const properties = yield Property_1.Property.find({ ownerId: userId });
                const propertyIds = properties.map((p) => p._id);
                query.propertyId = { $in: propertyIds };
            }
            // If role is specified as 'tenant', filter by maintenance requests created by the user
            else if (role === 'tenant') {
                query.tenantId = userId;
            }
            // If no role specified, try to determine based on user's properties
            else {
                // Check if user owns any properties
                const ownedProperties = yield Property_1.Property.find({ ownerId: userId });
                if (ownedProperties.length > 0) {
                    // User is a property owner, show maintenance requests for their properties
                    const propertyIds = ownedProperties.map((p) => p._id);
                    query.propertyId = { $in: propertyIds };
                }
                else {
                    // User is likely a tenant, show their own maintenance requests
                    query.tenantId = userId;
                }
            }
        }
        const maintenanceRequests = yield MaintenanceRequest_1.MaintenanceRequest.find(query)
            .populate('tenantId', 'name email')
            .populate('propertyId', 'name address')
            .sort({ createdAt: -1 });
        res.json(maintenanceRequests);
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            throw error;
        }
        throw new errorHandler_1.AppError('Error fetching maintenance requests', 500);
    }
});
exports.getMaintenanceRequests = getMaintenanceRequests;
