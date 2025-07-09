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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTenantsPublic = exports.deleteTenant = exports.updateTenant = exports.createTenant = exports.getTenant = exports.getTenants = void 0;
const Tenant_1 = require("../models/Tenant");
const errorHandler_1 = require("../middleware/errorHandler");
const logger_1 = require("../utils/logger");
const mongoose_1 = __importDefault(require("mongoose"));
const Property_1 = require("../models/Property");
const getTenants = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('GetTenants - Request user:', req.user);
        console.log('GetTenants - Headers:', req.headers);
        console.log('GetTenants - Cookies:', req.cookies);
        if (!req.user) {
            console.log('GetTenants - No user in request');
            throw new errorHandler_1.AppError('Authentication required', 401, 'NO_USER');
        }
        if (!req.user.companyId) {
            console.log('GetTenants - No companyId in request user');
            throw new errorHandler_1.AppError('Company ID is required', 400, 'NO_COMPANY_ID');
        }
        const { page = 1, limit = 10, search = '' } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        console.log('GetTenants - Query params:', { page, limit, search });
        // Build search query
        const searchQuery = search
            ? {
                $or: [
                    { firstName: { $regex: search, $options: 'i' } },
                    { lastName: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } },
                    { phone: { $regex: search, $options: 'i' } }
                ],
                companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId)
            }
            : { companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId) };
        console.log('GetTenants - MongoDB query:', searchQuery);
        try {
            // Get total count for pagination
            const total = yield Tenant_1.Tenant.countDocuments(searchQuery);
            console.log('GetTenants - Total tenants found:', total);
            // Get tenants with pagination
            const tenants = yield Tenant_1.Tenant.find(searchQuery)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit));
            console.log('GetTenants - Tenants retrieved:', tenants.length);
            res.json({
                tenants,
                total,
                page: Number(page),
                totalPages: Math.ceil(total / Number(limit))
            });
        }
        catch (dbError) {
            console.error('GetTenants - Database error:', dbError);
            throw new errorHandler_1.AppError('Database error while fetching tenants', 500, 'DB_ERROR', dbError);
        }
    }
    catch (error) {
        console.error('GetTenants - Error:', error);
        if (error instanceof errorHandler_1.AppError) {
            next(error);
        }
        else {
            next(new errorHandler_1.AppError(error.message || 'Error fetching tenants', 500, 'UNKNOWN_ERROR', error));
        }
    }
});
exports.getTenants = getTenants;
const getTenant = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId)) {
            throw new errorHandler_1.AppError('Company ID not found', 401);
        }
        const { id } = req.params;
        logger_1.logger.info('Fetching tenant', { tenantId: id, companyId: req.user.companyId });
        const tenant = yield Tenant_1.Tenant.findOne({
            _id: id,
            companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId)
        }).lean();
        if (!tenant) {
            throw new errorHandler_1.AppError('Tenant not found', 404);
        }
        logger_1.logger.info('Tenant fetched successfully', { tenantId: id });
        res.json(tenant);
    }
    catch (error) {
        logger_1.logger.error('Error fetching tenant', { error, tenantId: req.params.id });
        if (error instanceof errorHandler_1.AppError) {
            res.status(error.statusCode).json({ message: error.message });
        }
        else {
            res.status(500).json({ message: 'Error fetching tenant' });
        }
    }
});
exports.getTenant = getTenant;
const createTenant = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId)) {
            throw new errorHandler_1.AppError('Company ID not found', 401);
        }
        const { firstName, lastName, email, phone, propertyId, status, idNumber, emergencyContact } = req.body;
        // Validate required fields
        if (!firstName || !lastName || !email || !phone) {
            throw new errorHandler_1.AppError('All fields are required', 400);
        }
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw new errorHandler_1.AppError('Invalid email format', 400);
        }
        logger_1.logger.info('Creating tenant', {
            email,
            companyId: req.user.companyId,
            propertyId
        });
        const existingTenant = yield Tenant_1.Tenant.findOne({
            email,
            companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId)
        });
        if (existingTenant) {
            throw new errorHandler_1.AppError('Tenant with this email already exists', 400);
        }
        const tenantData = {
            firstName,
            lastName,
            email,
            phone,
            companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId),
            status: status || 'Active',
            propertyId: propertyId ? new mongoose_1.default.Types.ObjectId(propertyId) : undefined,
            idNumber,
            emergencyContact
        };
        const newTenant = new Tenant_1.Tenant(tenantData);
        yield newTenant.save();
        // If property is assigned, update property status
        if (propertyId) {
            yield Property_1.Property.findByIdAndUpdate(propertyId, { status: 'rented' });
        }
        logger_1.logger.info('Tenant created successfully', {
            tenantId: newTenant._id,
            email,
            propertyId
        });
        res.status(201).json(newTenant);
    }
    catch (error) {
        logger_1.logger.error('Error creating tenant', { error, body: req.body });
        if (error instanceof errorHandler_1.AppError) {
            res.status(error.statusCode).json({ message: error.message });
        }
        else if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
            res.status(400).json({ message: 'Email already exists' });
        }
        else {
            res.status(500).json({ message: 'Error creating tenant' });
        }
    }
});
exports.createTenant = createTenant;
const updateTenant = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId)) {
            throw new errorHandler_1.AppError('Company ID not found', 401);
        }
        const { id } = req.params;
        const _c = req.body, { email, propertyId } = _c, updateData = __rest(_c, ["email", "propertyId"]);
        logger_1.logger.info('Updating tenant', {
            tenantId: id,
            companyId: req.user.companyId,
            updateFields: Object.keys(updateData),
            propertyId
        });
        if (email) {
            const existingTenant = yield Tenant_1.Tenant.findOne({
                email,
                companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId),
                _id: { $ne: id }
            });
            if (existingTenant) {
                throw new errorHandler_1.AppError('Email already in use by another tenant', 400);
            }
        }
        // Get the current tenant to check property changes
        const currentTenant = yield Tenant_1.Tenant.findById(id);
        if (!currentTenant) {
            throw new errorHandler_1.AppError('Tenant not found', 404);
        }
        // Handle property changes
        if (propertyId !== ((_b = currentTenant.propertyId) === null || _b === void 0 ? void 0 : _b.toString())) {
            // If tenant had a previous property, mark it as available
            if (currentTenant.propertyId) {
                yield Property_1.Property.findByIdAndUpdate(currentTenant.propertyId, { status: 'available' });
            }
            // If new property is assigned, mark it as rented
            if (propertyId) {
                yield Property_1.Property.findByIdAndUpdate(propertyId, { status: 'rented' });
            }
        }
        const updatedTenant = yield Tenant_1.Tenant.findOneAndUpdate({
            _id: id,
            companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId)
        }, Object.assign(Object.assign(Object.assign({}, updateData), (email && { email })), (propertyId && { propertyId: new mongoose_1.default.Types.ObjectId(propertyId) })), { new: true, runValidators: true });
        if (!updatedTenant) {
            throw new errorHandler_1.AppError('Tenant not found', 404);
        }
        logger_1.logger.info('Tenant updated successfully', { tenantId: id });
        res.json(updatedTenant);
    }
    catch (error) {
        logger_1.logger.error('Error updating tenant', { error, tenantId: req.params.id });
        if (error instanceof errorHandler_1.AppError) {
            res.status(error.statusCode).json({ message: error.message });
        }
        else if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
            res.status(400).json({ message: 'Email already exists' });
        }
        else {
            res.status(500).json({ message: 'Error updating tenant' });
        }
    }
});
exports.updateTenant = updateTenant;
const deleteTenant = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId)) {
            throw new errorHandler_1.AppError('Company ID not found', 401);
        }
        const { id } = req.params;
        logger_1.logger.info('Deleting tenant', { tenantId: id, companyId: req.user.companyId });
        // First find the tenant to get propertyId before deletion
        const tenantToDelete = yield Tenant_1.Tenant.findOne({
            _id: id,
            companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId)
        });
        if (!tenantToDelete) {
            throw new errorHandler_1.AppError('Tenant not found', 404);
        }
        // Store propertyId before deletion
        const propertyId = tenantToDelete.propertyId;
        // Delete the tenant
        const deleteResult = yield Tenant_1.Tenant.findOneAndDelete({
            _id: id,
            companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId)
        });
        if (!deleteResult) {
            throw new errorHandler_1.AppError('Tenant not found', 404);
        }
        // If tenant was assigned to a property, update property status
        if (propertyId) {
            yield Property_1.Property.findByIdAndUpdate(propertyId, { status: 'available' });
        }
        logger_1.logger.info('Tenant deleted successfully', { tenantId: id });
        res.json({ message: 'Tenant deleted successfully' });
    }
    catch (error) {
        logger_1.logger.error('Error deleting tenant', { error, tenantId: req.params.id });
        if (error instanceof errorHandler_1.AppError) {
            res.status(error.statusCode).json({ message: error.message });
        }
        else {
            res.status(500).json({ message: 'Error deleting tenant' });
        }
    }
});
exports.deleteTenant = deleteTenant;
// Public endpoint for admin dashboard - no authentication required
const getTenantsPublic = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Get company ID from query params or headers (for admin dashboard)
        const companyId = req.query.companyId || req.headers['x-company-id'];
        let query = {};
        if (companyId) {
            query = { companyId: new mongoose_1.default.Types.ObjectId(companyId) };
        }
        const tenants = yield Tenant_1.Tenant.find(query).sort({ createdAt: -1 });
        res.json({ tenants });
    }
    catch (error) {
        console.error('Error fetching tenants (public):', error);
        res.status(500).json({ message: 'Error fetching tenants' });
    }
});
exports.getTenantsPublic = getTenantsPublic;
