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
exports.deletePropertyOwnerPublic = exports.updatePropertyOwnerPublic = exports.createPropertyOwnerPublic = exports.getPropertyOwnerByIdPublic = exports.getPropertyOwnersPublic = exports.deletePropertyOwner = exports.updatePropertyOwner = exports.getPropertyOwnerById = exports.getPropertyOwners = exports.createPropertyOwner = void 0;
const PropertyOwner_1 = require("../models/PropertyOwner");
const errorHandler_1 = require("../middleware/errorHandler");
const propertyAccess_1 = require("../utils/propertyAccess");
const access_1 = require("../utils/access");
const propertyOwnerGuards_1 = require("../services/propertyOwnerGuards");
const ownerPropertyLinkService_1 = require("../services/ownerPropertyLinkService");
const ownerRetirementService_1 = require("../services/ownerRetirementService");
const canManageOwners = (req) => (0, access_1.hasAnyRole)(req, ['agent', 'sales', 'admin', 'accountant', 'principal', 'prea', 'system_admin']);
const createPropertyOwner = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        // Always require company scope
        if (!req.user.companyId) {
            return res.status(401).json({ message: 'Company ID not found' });
        }
        if (!canManageOwners(req)) {
            return res.status(403).json({ message: 'You do not have permission to manage property owners' });
        }
        const { email, password, firstName, lastName, phone } = req.body;
        const invalid = (0, propertyOwnerGuards_1.validateNewPropertyOwner)({ email, password, firstName, lastName, phone });
        if (invalid)
            return res.status(400).json({ message: invalid });
        const normalizedEmail = (0, propertyOwnerGuards_1.normalizeOwnerEmail)(email);
        const existingOwner = yield PropertyOwner_1.PropertyOwner.findOne({ email: normalizedEmail, companyId: req.user.companyId });
        if (existingOwner) {
            return res.status(400).json({ message: 'Property owner with this email already exists' });
        }
        const requestedPropertyIds = Array.isArray(req.body.propertyIds)
            ? req.body.propertyIds
            : (Array.isArray(req.body.properties) ? req.body.properties : []);
        const assignment = requestedPropertyIds.length
            ? yield (0, ownerPropertyLinkService_1.validateOwnerPropertyAssignment)(req, null, [], requestedPropertyIds)
            : { properties: [], selectedByCaller: [], removed: [] };
        const owner = new PropertyOwner_1.PropertyOwner({
            email: normalizedEmail,
            password,
            firstName: String(firstName).trim(),
            lastName: String(lastName).trim(),
            phone: String(phone).trim(),
            companyId: req.user.companyId,
            properties: assignment.properties,
        });
        yield owner.save();
        if (assignment.properties.length) {
            yield (0, ownerPropertyLinkService_1.commitOwnerPropertyLinks)(req.user.companyId, owner._id, assignment);
        }
        res.status(201).json(owner);
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError)
            return res.status(error.statusCode).json({ message: error.message });
        console.error('Error creating property owner:', error);
        next(new errorHandler_1.AppError('Error creating property owner', 500));
    }
});
exports.createPropertyOwner = createPropertyOwner;
const getPropertyOwners = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!req.user) {
            return next(new errorHandler_1.AppError('Authentication required', 401));
        }
        console.log('getPropertyOwners - User data:', {
            userId: req.user.userId,
            role: req.user.role,
            companyId: req.user.companyId
        });
        if (!req.user.companyId) {
            console.log('getPropertyOwners - Company ID not found');
            return next(new errorHandler_1.AppError('Company ID not found', 401));
        }
        const visibleOwnerIds = yield (0, propertyAccess_1.propertyOwnerIdsForCaller)(req);
        const query = { companyId: req.user.companyId };
        if (visibleOwnerIds !== 'company')
            query._id = { $in: visibleOwnerIds };
        console.log('getPropertyOwners - Query:', query);
        const owners = yield PropertyOwner_1.PropertyOwner.find(query).select('-password');
        res.json(owners);
    }
    catch (error) {
        next(error instanceof errorHandler_1.AppError ? error : new errorHandler_1.AppError('Error fetching property owners', 500));
    }
});
exports.getPropertyOwners = getPropertyOwners;
const getPropertyOwnerById = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!req.user) {
            return next(new errorHandler_1.AppError('Authentication required', 401));
        }
        const { id } = req.params;
        if (!req.user.companyId) {
            return next(new errorHandler_1.AppError('Company ID not found', 401));
        }
        const query = { _id: id, companyId: req.user.companyId };
        const owner = yield PropertyOwner_1.PropertyOwner.findOne(query).select('-password');
        if (!owner || !(yield (0, propertyAccess_1.callerCanReadPropertyOwner)(req, String(owner._id)))) {
            return next(new errorHandler_1.AppError('Property owner not found', 404));
        }
        res.json(owner);
    }
    catch (error) {
        next(error instanceof errorHandler_1.AppError ? error : new errorHandler_1.AppError('Error fetching property owner', 500));
    }
});
exports.getPropertyOwnerById = getPropertyOwnerById;
const updatePropertyOwner = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!req.user) {
            return next(new errorHandler_1.AppError('Authentication required', 401));
        }
        const { id } = req.params;
        const { email } = req.body;
        if (!req.user.companyId) {
            return next(new errorHandler_1.AppError('Company ID not found', 401));
        }
        if (!canManageOwners(req)) {
            return res.status(403).json({ message: 'You do not have permission to manage property owners' });
        }
        const query = { _id: id, companyId: req.user.companyId };
        if (!(yield (0, propertyAccess_1.callerCanMutatePropertyOwner)(req, id))) {
            return next(new errorHandler_1.AppError('Property owner not found', 404));
        }
        const existing = yield PropertyOwner_1.PropertyOwner.findOne(query);
        if (!existing)
            return next(new errorHandler_1.AppError('Property owner not found', 404));
        const allowed = ['firstName', 'lastName', 'phone', 'nationalId', 'passportNumber', 'taxNumber', 'address', 'active'];
        const scalar = {};
        for (const key of allowed) {
            if (req.body[key] !== undefined)
                scalar[key] = req.body[key];
        }
        if (email)
            scalar.email = (0, propertyOwnerGuards_1.normalizeOwnerEmail)(email);
        const contactError = (0, propertyOwnerGuards_1.validateOwnerContact)({ email: scalar.email, phone: scalar.phone });
        if (contactError)
            return res.status(400).json({ message: contactError });
        if (scalar.email) {
            const duplicate = yield PropertyOwner_1.PropertyOwner.findOne({
                email: scalar.email,
                _id: { $ne: id },
                companyId: req.user.companyId
            }).select('_id');
            if (duplicate)
                return next(new errorHandler_1.AppError('Email already in use by another property owner', 400));
        }
        const requestedPropertyIds = Array.isArray(req.body.properties)
            ? req.body.properties
            : (Array.isArray(req.body.propertyIds) ? req.body.propertyIds : null);
        const assignment = requestedPropertyIds
            ? yield (0, ownerPropertyLinkService_1.validateOwnerPropertyAssignment)(req, id, (existing.properties || []).map((propertyId) => String(propertyId)), requestedPropertyIds)
            : null;
        if (assignment)
            scalar.properties = assignment.properties;
        const owner = yield PropertyOwner_1.PropertyOwner.findOneAndUpdate(query, { $set: scalar }, { new: true, runValidators: true }).select('-password -tokens');
        if (owner && assignment) {
            yield (0, ownerPropertyLinkService_1.commitOwnerPropertyLinks)(req.user.companyId, owner._id, assignment);
        }
        if (owner && (scalar.email || scalar.firstName || scalar.lastName)) {
            yield (0, ownerRetirementService_1.syncOwnerPortalProfile)({
                previousEmail: existing.email,
                companyId: req.user.companyId,
                email: typeof scalar.email === 'string' ? scalar.email : undefined,
                firstName: typeof scalar.firstName === 'string' ? scalar.firstName : undefined,
                lastName: typeof scalar.lastName === 'string' ? scalar.lastName : undefined,
            });
        }
        if (!owner) {
            return next(new errorHandler_1.AppError('Property owner not found', 404));
        }
        res.json(owner);
    }
    catch (error) {
        next(error instanceof errorHandler_1.AppError ? error : new errorHandler_1.AppError('Error updating property owner', 500));
    }
});
exports.updatePropertyOwner = updatePropertyOwner;
const deletePropertyOwner = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!req.user) {
            return next(new errorHandler_1.AppError('Authentication required', 401));
        }
        const { id } = req.params;
        if (!req.user.companyId) {
            return next(new errorHandler_1.AppError('Company ID not found', 401));
        }
        if (!canManageOwners(req)) {
            return res.status(403).json({ message: 'You do not have permission to manage property owners' });
        }
        if (!(yield (0, propertyAccess_1.callerCanMutatePropertyOwner)(req, id))) {
            return res.status(404).json({ message: 'Property owner not found' });
        }
        const result = yield (0, ownerRetirementService_1.retirePropertyOwner)(id, req.user.companyId);
        res.json(result);
    }
    catch (error) {
        next(error instanceof errorHandler_1.AppError ? error : new errorHandler_1.AppError('Error deleting property owner', 500));
    }
});
exports.deletePropertyOwner = deletePropertyOwner;
// Legacy public endpoint for admin dashboard. Route-level middleware now
// requires authentication; always scope to the authenticated company.
const getPropertyOwnersPublic = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const companyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
        if (!companyId) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        let query = { companyId };
        const visibleOwnerIds = yield (0, propertyAccess_1.propertyOwnerIdsForCaller)(req);
        if (visibleOwnerIds !== 'company')
            query._id = { $in: visibleOwnerIds };
        // Additional filtering options
        if (req.query.email) {
            query.email = { $regex: req.query.email, $options: 'i' };
        }
        if (req.query.firstName) {
            query.firstName = { $regex: req.query.firstName, $options: 'i' };
        }
        if (req.query.lastName) {
            query.lastName = { $regex: req.query.lastName, $options: 'i' };
        }
        // Get property owners, excluding password field
        const owners = yield PropertyOwner_1.PropertyOwner.find(query)
            .select('-password -tokens')
            .sort({ createdAt: -1 }); // Sort by newest first
        res.json({
            owners,
            count: owners.length,
            companyId: companyId || null
        });
    }
    catch (error) {
        console.error('Error fetching property owners (public):', error);
        res.status(500).json({
            message: 'Error fetching property owners',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
exports.getPropertyOwnersPublic = getPropertyOwnersPublic;
// Legacy public endpoint for getting a single property owner by ID.
const getPropertyOwnerByIdPublic = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const companyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
        if (!companyId) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        let query = { _id: id, companyId };
        const owner = yield PropertyOwner_1.PropertyOwner.findOne(query).select('-password');
        if (!owner || !(yield (0, propertyAccess_1.callerCanReadPropertyOwner)(req, String(owner._id)))) {
            return res.status(404).json({
                message: 'Property owner not found',
                id,
                companyId: companyId || null
            });
        }
        res.json(owner);
    }
    catch (error) {
        console.error('Error fetching property owner by ID (public):', error);
        res.status(500).json({
            message: 'Error fetching property owner',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
exports.getPropertyOwnerByIdPublic = getPropertyOwnerByIdPublic;
// Legacy public endpoint for creating property owner.
const createPropertyOwnerPublic = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { email, password, firstName, lastName, phone, propertyIds } = req.body;
        const companyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
        if (!companyId) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        if (!canManageOwners(req)) {
            return res.status(403).json({ message: 'You do not have permission to manage property owners' });
        }
        const invalid = (0, propertyOwnerGuards_1.validateNewPropertyOwner)({ email, password, firstName, lastName, phone });
        if (invalid)
            return res.status(400).json({ message: invalid });
        const normalizedEmail = (0, propertyOwnerGuards_1.normalizeOwnerEmail)(email);
        const existingOwner = yield PropertyOwner_1.PropertyOwner.findOne({ email: normalizedEmail, companyId });
        if (existingOwner) {
            return res.status(400).json({ message: 'Property owner with this email already exists' });
        }
        const requestedPropertyIds = Array.isArray(propertyIds) ? propertyIds : [];
        const assignment = requestedPropertyIds.length
            ? yield (0, ownerPropertyLinkService_1.validateOwnerPropertyAssignment)(req, null, [], requestedPropertyIds)
            : { properties: [], selectedByCaller: [], removed: [] };
        const owner = new PropertyOwner_1.PropertyOwner({
            email: normalizedEmail,
            password,
            firstName: String(firstName).trim(),
            lastName: String(lastName).trim(),
            phone: String(phone).trim(),
            companyId,
            properties: assignment.properties,
        });
        yield owner.save();
        if (assignment.properties.length) {
            yield (0, ownerPropertyLinkService_1.commitOwnerPropertyLinks)(companyId, owner._id, assignment);
        }
        res.status(201).json(owner.toObject());
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError)
            return res.status(error.statusCode).json({ message: error.message });
        console.error('Error creating property owner (public):', error);
        res.status(500).json({ message: 'Error creating property owner' });
    }
});
exports.createPropertyOwnerPublic = createPropertyOwnerPublic;
// Legacy public endpoint for updating property owner.
const updatePropertyOwnerPublic = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const companyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
        if (!companyId) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        if (!canManageOwners(req) || !(yield (0, propertyAccess_1.callerCanMutatePropertyOwner)(req, id))) {
            return res.status(404).json({ message: 'Property owner not found' });
        }
        req.body.properties = req.body.properties || req.body.propertyIds;
        return (0, exports.updatePropertyOwner)(req, res, (error) => {
            const status = error instanceof errorHandler_1.AppError ? error.statusCode : 500;
            res.status(status).json({ message: error instanceof Error ? error.message : 'Error updating property owner' });
        });
    }
    catch (error) {
        console.error('Error updating property owner (public):', error);
        res.status(500).json({ message: 'Error updating property owner' });
    }
});
exports.updatePropertyOwnerPublic = updatePropertyOwnerPublic;
// Legacy public endpoint for deleting property owner.
const deletePropertyOwnerPublic = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const companyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
        if (!companyId) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        let query = { _id: id, companyId };
        if (!canManageOwners(req) || !(yield (0, propertyAccess_1.callerCanMutatePropertyOwner)(req, id))) {
            return res.status(404).json({ message: 'Property owner not found' });
        }
        const result = yield (0, ownerRetirementService_1.retirePropertyOwner)(id, companyId);
        res.json(result);
    }
    catch (error) {
        console.error('Error deleting property owner (public):', error);
        res.status(500).json({ message: 'Error deleting property owner' });
    }
});
exports.deletePropertyOwnerPublic = deletePropertyOwnerPublic;
