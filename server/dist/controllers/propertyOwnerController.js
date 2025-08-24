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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deletePropertyOwnerPublic = exports.updatePropertyOwnerPublic = exports.createPropertyOwnerPublic = exports.getPropertyOwnerByIdPublic = exports.getPropertyOwnersPublic = exports.deletePropertyOwner = exports.updatePropertyOwner = exports.getPropertyOwnerById = exports.getPropertyOwners = exports.createPropertyOwner = void 0;
const PropertyOwner_1 = require("../models/PropertyOwner");
const errorHandler_1 = require("../middleware/errorHandler");
const Property_1 = require("../models/Property");
const createPropertyOwner = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
        const existingOwner = yield PropertyOwner_1.PropertyOwner.findOne({ email, companyId: req.user.companyId });
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
        const owner = new PropertyOwner_1.PropertyOwner(ownerData);
        yield owner.save();
        res.status(201).json(owner);
    }
    catch (error) {
        console.error('Error creating property owner:', error);
        res.status(500).json({ message: 'Error creating property owner' });
    }
});
exports.createPropertyOwner = createPropertyOwner;
const getPropertyOwners = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!req.user) {
            throw new errorHandler_1.AppError('Authentication required', 401);
        }
        console.log('getPropertyOwners - User data:', {
            userId: req.user.userId,
            role: req.user.role,
            companyId: req.user.companyId
        });
        if (!req.user.companyId) {
            console.log('getPropertyOwners - Company ID not found');
            throw new errorHandler_1.AppError('Company ID not found', 401);
        }
        const query = { companyId: req.user.companyId };
        console.log('getPropertyOwners - Query:', query);
        const owners = yield PropertyOwner_1.PropertyOwner.find(query);
        res.json(owners);
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            throw error;
        }
        throw new errorHandler_1.AppError('Error fetching property owners', 500);
    }
});
exports.getPropertyOwners = getPropertyOwners;
const getPropertyOwnerById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!req.user) {
            throw new errorHandler_1.AppError('Authentication required', 401);
        }
        const { id } = req.params;
        if (!req.user.companyId) {
            throw new errorHandler_1.AppError('Company ID not found', 401);
        }
        const query = { _id: id, companyId: req.user.companyId };
        const owner = yield PropertyOwner_1.PropertyOwner.findOne(query);
        if (!owner) {
            throw new errorHandler_1.AppError('Property owner not found', 404);
        }
        res.json(owner);
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            throw error;
        }
        throw new errorHandler_1.AppError('Error fetching property owner', 500);
    }
});
exports.getPropertyOwnerById = getPropertyOwnerById;
const updatePropertyOwner = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!req.user) {
            throw new errorHandler_1.AppError('Authentication required', 401);
        }
        const { id } = req.params;
        const _a = req.body, { email, companyId: _ignoredCompanyId } = _a, updates = __rest(_a, ["email", "companyId"]); // ignore companyId changes
        if (!req.user.companyId) {
            throw new errorHandler_1.AppError('Company ID not found', 401);
        }
        const query = { _id: id, companyId: req.user.companyId };
        // If email is being updated, check if it's already in use
        if (email) {
            const existingOwner = yield PropertyOwner_1.PropertyOwner.findOne({
                email,
                _id: { $ne: id },
                companyId: req.user.companyId
            });
            if (existingOwner) {
                throw new errorHandler_1.AppError('Email already in use by another property owner', 400);
            }
        }
        const owner = yield PropertyOwner_1.PropertyOwner.findOneAndUpdate(query, Object.assign(Object.assign({}, updates), (email && { email })), { new: true, runValidators: true });
        if (!owner) {
            throw new errorHandler_1.AppError('Property owner not found', 404);
        }
        res.json(owner);
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            throw error;
        }
        throw new errorHandler_1.AppError('Error updating property owner', 500);
    }
});
exports.updatePropertyOwner = updatePropertyOwner;
const deletePropertyOwner = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!req.user) {
            throw new errorHandler_1.AppError('Authentication required', 401);
        }
        const { id } = req.params;
        if (!req.user.companyId) {
            throw new errorHandler_1.AppError('Company ID not found', 401);
        }
        const query = { _id: id, companyId: req.user.companyId };
        const owner = yield PropertyOwner_1.PropertyOwner.findOneAndDelete(query);
        if (!owner) {
            return res.status(404).json({ message: 'Property owner not found' });
        }
        // Only log _id and email if owner is not null and has those properties
        if (owner && owner._id && owner.email) {
            console.log('Property owner deleted successfully:', { id: owner._id, email: owner.email });
        }
        else {
            console.log('Property owner deleted successfully');
        }
        res.json({ message: 'Property owner deleted successfully' });
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            throw error;
        }
        throw new errorHandler_1.AppError('Error deleting property owner', 500);
    }
});
exports.deletePropertyOwner = deletePropertyOwner;
// Public endpoint for admin dashboard - no authentication required
const getPropertyOwnersPublic = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('Public property owners request:', {
            query: req.query,
            headers: req.headers
        });
        // Get company ID from query params or headers (for admin dashboard)
        const companyId = req.query.companyId || req.headers['x-company-id'];
        let query = {};
        // Filter by company ID if provided
        if (companyId) {
            query.companyId = companyId;
        }
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
        console.log('Public property owners query:', query);
        // Get property owners, excluding password field
        const owners = yield PropertyOwner_1.PropertyOwner.find(query)
            .select('-password')
            .sort({ createdAt: -1 }); // Sort by newest first
        console.log(`Found ${owners.length} property owners`);
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
// Public endpoint for getting a single property owner by ID - no authentication required
const getPropertyOwnerByIdPublic = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const companyId = req.query.companyId || req.headers['x-company-id'];
        console.log('Public property owner by ID request:', {
            id,
            companyId,
            query: req.query,
            headers: req.headers
        });
        let query = { _id: id };
        // Filter by company ID if provided
        if (companyId) {
            query.companyId = companyId;
        }
        console.log('Public property owner by ID query:', query);
        const owner = yield PropertyOwner_1.PropertyOwner.findOne(query).select('-password');
        if (!owner) {
            return res.status(404).json({
                message: 'Property owner not found',
                id,
                companyId: companyId || null
            });
        }
        console.log('Found property owner:', { id: owner._id, email: owner.email });
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
// Public endpoint for creating property owner - no authentication required
const createPropertyOwnerPublic = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
        const existingOwner = yield PropertyOwner_1.PropertyOwner.findOne({ email });
        if (existingOwner) {
            return res.status(400).json({ message: 'Property owner with this email already exists' });
        }
        const ownerData = {
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
        const owner = new PropertyOwner_1.PropertyOwner(ownerData);
        yield owner.save();
        // If propertyIds are provided, update the ownerId field of each property
        if (Array.isArray(propertyIds) && propertyIds.length > 0) {
            yield Promise.all(propertyIds.map((propertyId) => Property_1.Property.findByIdAndUpdate(propertyId, { ownerId: owner._id })));
        }
        // Return owner without password
        const ownerResponse = owner.toObject();
        delete ownerResponse.password;
        console.log('Property owner created successfully:', { id: owner._id, email: owner.email });
        res.status(201).json(ownerResponse);
    }
    catch (error) {
        console.error('Error creating property owner (public):', error);
        res.status(500).json({ message: 'Error creating property owner' });
    }
});
exports.createPropertyOwnerPublic = createPropertyOwnerPublic;
// Public endpoint for updating property owner - no authentication required
const updatePropertyOwnerPublic = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const _a = req.body, { email, properties, password } = _a, updates = __rest(_a, ["email", "properties", "password"]);
        const companyId = req.query.companyId || req.headers['x-company-id'];
        console.log('Public update property owner request:', {
            id,
            email,
            companyId,
            updates,
            properties
        });
        let query = { _id: id };
        if (companyId) {
            query.companyId = companyId;
        }
        // If email is being updated, check if it's already in use
        if (email) {
            const existingOwner = yield PropertyOwner_1.PropertyOwner.findOne(Object.assign({ email, _id: { $ne: id } }, (companyId && { companyId })));
            if (existingOwner) {
                return res.status(400).json({ message: 'Email already in use by another property owner' });
            }
        }
        // Build update object, only include password if it's not empty
        const updateObject = Object.assign({}, updates);
        if (email)
            updateObject.email = email;
        if (properties)
            updateObject.properties = properties;
        if (password && password.trim() !== '')
            updateObject.password = password;
        // Update the owner
        const owner = yield PropertyOwner_1.PropertyOwner.findOneAndUpdate(query, updateObject, { new: true, runValidators: true }).select('-password');
        if (!owner) {
            return res.status(404).json({ message: 'Property owner not found' });
        }
        // If properties are provided, update the ownerId field of each property
        if (Array.isArray(properties)) {
            // Remove ownerId from properties no longer owned
            yield Property_1.Property.updateMany({ ownerId: owner._id, _id: { $nin: properties } }, { $unset: { ownerId: "" } });
            // Set ownerId for new properties
            yield Property_1.Property.updateMany({ _id: { $in: properties } }, { ownerId: owner._id });
        }
        console.log('Property owner updated successfully:', { id: owner._id, email: owner.email });
        res.json(owner);
    }
    catch (error) {
        console.error('Error updating property owner (public):', error);
        res.status(500).json({ message: 'Error updating property owner' });
    }
});
exports.updatePropertyOwnerPublic = updatePropertyOwnerPublic;
// Public endpoint for deleting property owner - no authentication required
const deletePropertyOwnerPublic = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const companyId = req.query.companyId || req.headers['x-company-id'];
        console.log('Public delete property owner request:', {
            id,
            companyId
        });
        let query = { _id: id };
        // Filter by company ID if provided
        if (companyId) {
            query.companyId = companyId;
        }
        const owner = yield PropertyOwner_1.PropertyOwner.findOneAndDelete(query);
        if (!owner) {
            return res.status(404).json({ message: 'Property owner not found' });
        }
        // Only log _id and email if owner is not null and has those properties
        if (owner && owner._id && owner.email) {
            console.log('Property owner deleted successfully:', { id: owner._id, email: owner.email });
        }
        else {
            console.log('Property owner deleted successfully');
        }
        res.json({ message: 'Property owner deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting property owner (public):', error);
        res.status(500).json({ message: 'Error deleting property owner' });
    }
});
exports.deletePropertyOwnerPublic = deletePropertyOwnerPublic;
