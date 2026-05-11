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
const createPropertyOwner = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
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
        const query = { companyId: req.user.companyId };
        console.log('getPropertyOwners - Query:', query);
        const owners = yield PropertyOwner_1.PropertyOwner.find(query);
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
        const owner = yield PropertyOwner_1.PropertyOwner.findOne(query);
        if (!owner) {
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
        const _a = req.body, { email, companyId: _ignoredCompanyId } = _a, updates = __rest(_a, ["email", "companyId"]); // ignore companyId changes
        if (!req.user.companyId) {
            return next(new errorHandler_1.AppError('Company ID not found', 401));
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
                return next(new errorHandler_1.AppError('Email already in use by another property owner', 400));
            }
        }
        const owner = yield PropertyOwner_1.PropertyOwner.findOneAndUpdate(query, Object.assign(Object.assign({}, updates), (email && { email })), { new: true, runValidators: true });
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
            .select('-password')
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
        if (!owner) {
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
        // Validate required fields
        if (!email || !password || !firstName || !lastName || !phone) {
            return res.status(400).json({ message: 'All fields are required' });
        }
        // Check if owner already exists
        const existingOwner = yield PropertyOwner_1.PropertyOwner.findOne({ email, companyId });
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
        // Do not modify Property.ownerId here; maintain linkage via PropertyOwner.properties only.
        // Return owner without password
        const ownerResponse = owner.toObject();
        delete ownerResponse.password;
        res.status(201).json(ownerResponse);
    }
    catch (error) {
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
        const _b = req.body, { email, properties, password } = _b, updates = __rest(_b, ["email", "properties", "password"]);
        const companyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
        if (!companyId) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        let query = { _id: id, companyId };
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
        // Do not modify Property.ownerId on public updates; linkage is via PropertyOwner.properties.
        res.json(owner);
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
