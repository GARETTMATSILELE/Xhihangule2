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
exports.getMaintenanceRequests = exports.getMaintenanceRequestsPublic = exports.deleteMaintenanceRequest = exports.getMaintenanceRequestDetails = exports.completeMaintenanceRequest = exports.approveMaintenanceRequest = exports.updateMaintenanceRequest = exports.addMaintenanceMessage = exports.getPropertyMaintenanceRequests = exports.createMaintenanceRequest = void 0;
const MaintenanceRequest_1 = require("../models/MaintenanceRequest");
const Property_1 = require("../models/Property");
const errorHandler_1 = require("../middleware/errorHandler");
const mongoose_1 = __importDefault(require("mongoose"));
const maintenanceManagementService_1 = require("../services/maintenanceManagementService");
const maintenanceStatus_1 = require("../utils/maintenanceStatus");
// Create a new maintenance request
const createMaintenanceRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const companyId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId;
        if (!userId) {
            throw new errorHandler_1.AppError('User authentication required', 401);
        }
        if (!companyId) {
            throw new errorHandler_1.AppError('Company context required', 403);
        }
        const { propertyId, title, description, priority, estimatedCost, attachments, category, inspectionId } = req.body;
        // Validate required fields
        if (!propertyId || !title || !description) {
            throw new errorHandler_1.AppError('Property ID, title, and description are required', 400);
        }
        // Fetch the property to get ownerId and companyId
        const property = yield Property_1.Property.findOne({ _id: propertyId, companyId });
        if (!property) {
            throw new errorHandler_1.AppError('Property not found', 404);
        }
        if (!property.ownerId) {
            throw new errorHandler_1.AppError('Property owner not found', 404);
        }
        const maintenanceRequest = new MaintenanceRequest_1.MaintenanceRequest({
            propertyId,
            requestedBy: userId,
            ownerId: property.ownerId,
            companyId: property.companyId,
            title,
            description,
            priority: priority || 'medium',
            estimatedCost: estimatedCost || 0,
            requestedAmount: estimatedCost || 0,
            category: category || 'GENERAL',
            inspectionId: inspectionId || undefined,
            attachments: Array.isArray(attachments)
                ? attachments.filter((file) => file && file.name && file.url && file.type)
                : [],
            status: 'draft',
            lastActivityAt: new Date(),
        });
        yield maintenanceRequest.save();
        yield (0, maintenanceManagementService_1.logMaintenanceActivity)({
            requestId: maintenanceRequest._id,
            companyId: companyId,
            action: 'Request Created',
            description: title,
            createdBy: userId,
        });
        res.status(201).json(maintenanceRequest);
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            throw error;
        }
        console.error('Error creating maintenance request:', error);
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
            requestedBy: userId
        })
            .populate('requestedBy', 'firstName lastName email')
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
exports.getPropertyMaintenanceRequests = getPropertyMaintenanceRequests;
// Add message to maintenance request
const addMaintenanceMessage = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const companyId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId;
        const requestId = req.params.requestId || req.params.id;
        const { content } = req.body;
        const maintenanceRequest = yield MaintenanceRequest_1.MaintenanceRequest.findOne({
            _id: requestId,
            companyId,
            $or: [
                { requestedBy: userId },
                { ownerId: userId }
            ]
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
    var _a, _b;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const companyId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId;
        if (!userId) {
            throw new errorHandler_1.AppError('User authentication required', 401);
        }
        if (!companyId) {
            throw new errorHandler_1.AppError('Company context required', 403);
        }
        const { id } = req.params;
        if (!id) {
            throw new errorHandler_1.AppError('Maintenance request ID is required', 400);
        }
        const { status, estimatedCost, attachments } = req.body;
        const maintenanceRequest = yield MaintenanceRequest_1.MaintenanceRequest.findOne({ _id: id, companyId });
        if (!maintenanceRequest) {
            throw new errorHandler_1.AppError('Maintenance request not found', 404);
        }
        // Check if user has permission to update this request
        const property = yield Property_1.Property.findOne({ _id: maintenanceRequest.propertyId, companyId });
        if (!property) {
            throw new errorHandler_1.AppError('Property not found', 404);
        }
        // Allow updates if user is the requester, owner, or has admin access
        const isRequester = maintenanceRequest.requestedBy.toString() === userId;
        const isOwner = property.ownerId && property.ownerId.toString() === userId;
        if (!isRequester && !isOwner) {
            throw new errorHandler_1.AppError('Unauthorized - You can only update your own requests or requests for your properties', 403);
        }
        const previousStatus = maintenanceRequest.status;
        // Update fields with validation
        if (status && (0, maintenanceManagementService_1.isValidMaintenanceStatus)(status)) {
            maintenanceRequest.status = status;
        }
        if (estimatedCost !== undefined && estimatedCost >= 0) {
            maintenanceRequest.estimatedCost = estimatedCost;
            if (!maintenanceRequest.requestedAmount)
                maintenanceRequest.requestedAmount = estimatedCost;
        }
        if (attachments && Array.isArray(attachments)) {
            maintenanceRequest.attachments = attachments;
        }
        maintenanceRequest.lastActivityAt = new Date();
        yield maintenanceRequest.save();
        if (status && status !== previousStatus) {
            const actionMap = {
                awaiting_approval: 'Sent To Owner',
                pending_approval: 'Sent To Owner',
                approved: 'Approved By Owner',
                awaiting_payment: 'Payment Requested',
                funded: 'Payment Completed',
                assigned: 'Assigned To Contractor',
                in_progress: 'Work Started',
                completed: 'Completed',
                verified: 'Verified',
                closed: 'Closed',
                rejected: 'Rejected',
            };
            yield (0, maintenanceManagementService_1.logMaintenanceActivity)({
                requestId: maintenanceRequest._id,
                companyId,
                action: actionMap[status] || 'Status Updated',
                description: `Status changed from ${previousStatus} to ${status}`,
                createdBy: userId,
            });
        }
        // Populate related data before sending response
        const updatedRequest = yield MaintenanceRequest_1.MaintenanceRequest.findOne({ _id: id, companyId })
            .populate('propertyId', 'name address')
            .populate('requestedBy', 'firstName lastName')
            .populate('ownerId', 'firstName lastName');
        res.json(updatedRequest);
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            throw error;
        }
        console.error('Error updating maintenance request:', error);
        throw new errorHandler_1.AppError('Error updating maintenance request', 500);
    }
});
exports.updateMaintenanceRequest = updateMaintenanceRequest;
// Approve maintenance request (owner action)
const approveMaintenanceRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const companyId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId;
        if (!userId) {
            throw new errorHandler_1.AppError('User authentication required', 401);
        }
        if (!companyId) {
            throw new errorHandler_1.AppError('Company context required', 403);
        }
        const { id } = req.params;
        if (!id) {
            throw new errorHandler_1.AppError('Maintenance request ID is required', 400);
        }
        const maintenanceRequest = yield MaintenanceRequest_1.MaintenanceRequest.findOne({ _id: id, companyId });
        if (!maintenanceRequest) {
            throw new errorHandler_1.AppError('Maintenance request not found', 404);
        }
        // Check if request is in the correct status for approval
        const approvalPending = maintenanceStatus_1.APPROVAL_STATUSES.includes(maintenanceRequest.status) ||
            (0, maintenanceStatus_1.normalizeMaintenanceStatus)(maintenanceRequest.status) === 'awaiting_approval';
        if (!approvalPending) {
            throw new errorHandler_1.AppError('Only requests awaiting approval can be approved', 400);
        }
        // Check if user is the owner of the property
        const property = yield Property_1.Property.findOne({ _id: maintenanceRequest.propertyId, companyId });
        if (!property) {
            throw new errorHandler_1.AppError('Property not found', 404);
        }
        if (!property.ownerId || property.ownerId.toString() !== userId) {
            throw new errorHandler_1.AppError('Unauthorized - Only property owner can approve requests', 403);
        }
        // Update status to approved
        maintenanceRequest.status = 'approved';
        maintenanceRequest.lastActivityAt = new Date();
        yield maintenanceRequest.save();
        yield (0, maintenanceManagementService_1.logMaintenanceActivity)({
            requestId: maintenanceRequest._id,
            companyId,
            action: 'Approved By Owner',
            description: 'Maintenance request approved by property owner',
            createdBy: userId,
        });
        const updatedRequest = yield MaintenanceRequest_1.MaintenanceRequest.findOne({ _id: id, companyId })
            .populate('propertyId', 'name address')
            .populate('requestedBy', 'firstName lastName')
            .populate('ownerId', 'firstName lastName');
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
exports.approveMaintenanceRequest = approveMaintenanceRequest;
// Complete maintenance request (agent action)
const completeMaintenanceRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const companyId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId;
        if (!userId) {
            throw new errorHandler_1.AppError('User authentication required', 401);
        }
        if (!companyId) {
            throw new errorHandler_1.AppError('Company context required', 403);
        }
        const { id } = req.params;
        if (!id) {
            throw new errorHandler_1.AppError('Maintenance request ID is required', 400);
        }
        const maintenanceRequest = yield MaintenanceRequest_1.MaintenanceRequest.findOne({ _id: id, companyId });
        if (!maintenanceRequest) {
            throw new errorHandler_1.AppError('Maintenance request not found', 404);
        }
        // Check if request is in the correct status for completion
        const completable = ['pending_completion', 'in_progress', 'completed'].includes(maintenanceRequest.status) ||
            (0, maintenanceStatus_1.normalizeMaintenanceStatus)(maintenanceRequest.status) === 'in_progress';
        if (!completable && maintenanceRequest.status !== 'pending_completion') {
            throw new errorHandler_1.AppError('Only in-progress requests can be marked as completed', 400);
        }
        // Update status to completed
        maintenanceRequest.status = 'completed';
        maintenanceRequest.lastActivityAt = new Date();
        yield maintenanceRequest.save();
        yield (0, maintenanceManagementService_1.logMaintenanceActivity)({
            requestId: maintenanceRequest._id,
            companyId,
            action: 'Completed',
            description: 'Maintenance work marked as completed',
            createdBy: userId,
        });
        const updatedRequest = yield MaintenanceRequest_1.MaintenanceRequest.findOne({ _id: id, companyId })
            .populate('propertyId', 'name address')
            .populate('requestedBy', 'firstName lastName')
            .populate('ownerId', 'firstName lastName');
        res.json(updatedRequest);
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            throw error;
        }
        console.error('Error completing maintenance request:', error);
        throw new errorHandler_1.AppError('Error completing maintenance request', 500);
    }
});
exports.completeMaintenanceRequest = completeMaintenanceRequest;
// Get maintenance request details
const getMaintenanceRequestDetails = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const companyId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId;
        const requestId = req.params.requestId || req.params.id;
        if (!requestId || !mongoose_1.default.Types.ObjectId.isValid(requestId)) {
            throw new errorHandler_1.AppError('Invalid maintenance request ID', 400);
        }
        const maintenanceRequest = yield MaintenanceRequest_1.MaintenanceRequest.findOne({
            _id: requestId,
            companyId,
            $or: [
                { requestedBy: userId },
                { ownerId: userId }
            ]
        })
            .populate('propertyId', 'name address')
            .populate('requestedBy', 'firstName lastName email')
            .populate('ownerId', 'firstName lastName');
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
    var _a, _b;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const companyId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId;
        const requestId = req.params.requestId || req.params.id;
        const maintenanceRequest = yield MaintenanceRequest_1.MaintenanceRequest.findOneAndDelete({
            _id: requestId,
            companyId,
            $or: [
                { requestedBy: userId },
                { ownerId: userId }
            ]
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
        if (process.env.NODE_ENV !== 'production') {
            console.log('getMaintenanceRequestsPublic called');
        }
        const { propertyId, companyId } = req.query;
        const query = {};
        // If propertyId is specified, filter by that property
        if (propertyId) {
            if (typeof propertyId !== 'string') {
                throw new errorHandler_1.AppError('Invalid property ID format', 400);
            }
            query.propertyId = propertyId;
        }
        // If companyId is specified (for public requests), filter by company
        if (companyId) {
            if (typeof companyId !== 'string') {
                throw new errorHandler_1.AppError('Invalid company ID format', 400);
            }
            query.companyId = companyId;
        }
        if (process.env.NODE_ENV !== 'production') {
            console.log('Maintenance query to execute:', { propertyId: query.propertyId, companyId: query.companyId });
        }
        const maintenanceRequests = yield MaintenanceRequest_1.MaintenanceRequest.find(query)
            .populate('requestedBy', 'firstName lastName')
            .populate('propertyId', 'name address')
            .populate('ownerId', 'firstName lastName')
            .populate('contractorId', 'companyName trade')
            .sort({ lastActivityAt: -1, createdAt: -1 });
        if (process.env.NODE_ENV !== 'production') {
            console.log('Found maintenance requests:', maintenanceRequests.length);
        }
        // Return empty array if no requests found instead of error
        if (!maintenanceRequests || maintenanceRequests.length === 0) {
            return res.json([]);
        }
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
    var _a, _b, _c;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const companyId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId;
        const userRole = (_c = req.user) === null || _c === void 0 ? void 0 : _c.role;
        const { propertyId, role } = req.query;
        if (!userId) {
            throw new errorHandler_1.AppError('User authentication required', 401);
        }
        if (!companyId) {
            throw new errorHandler_1.AppError('Company context required', 403);
        }
        const query = { companyId };
        // If propertyId is specified, filter by that property
        if (propertyId) {
            query.propertyId = propertyId;
        }
        const elevatedRoles = ['admin', 'agent', 'accountant', 'principal', 'prea'];
        const canViewCompanyMaintenance = userRole && elevatedRoles.includes(userRole);
        // If role is specified as 'owner', filter by properties owned by the user
        if (role === 'owner') {
            const properties = yield Property_1.Property.find({ ownerId: userId, companyId });
            const propertyIds = properties.map((p) => p._id);
            query.propertyId = { $in: propertyIds };
        }
        // If role is specified as 'tenant', filter by maintenance requests created by the user
        else if (role === 'tenant') {
            query.requestedBy = userId;
        }
        else if (!canViewCompanyMaintenance) {
            // Non-elevated users can only see records tied directly to them.
            query.$or = [
                { requestedBy: userId },
                { ownerId: userId }
            ];
        }
        const maintenanceRequests = yield MaintenanceRequest_1.MaintenanceRequest.find(query)
            .populate('requestedBy', 'firstName lastName email')
            .populate('propertyId', 'name address')
            .populate('ownerId', 'firstName lastName')
            .populate('contractorId', 'companyName trade')
            .sort({ lastActivityAt: -1, createdAt: -1 });
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
