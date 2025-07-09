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
exports.createAgentProperty = exports.getAgentCommission = exports.getAgentLeases = exports.getAgentTenants = exports.getAgentProperties = void 0;
const Property_1 = require("../models/Property");
const Tenant_1 = require("../models/Tenant");
const Lease_1 = require("../models/Lease");
const errorHandler_1 = require("../middleware/errorHandler");
// Get properties managed by the agent
const getAgentProperties = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
            throw new errorHandler_1.AppError('Authentication required', 401);
        }
        if (!((_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId)) {
            throw new errorHandler_1.AppError('Company ID not found. Please ensure you are associated with a company.', 400);
        }
        console.log('Fetching properties for agent:', {
            companyId: req.user.companyId,
            userId: req.user.userId,
            role: req.user.role
        });
        // Get all properties associated with the company
        const properties = yield Property_1.Property.find({
            companyId: req.user.companyId
        })
            .populate('ownerId', 'firstName lastName email')
            .sort({ createdAt: -1 }); // Sort by newest first
        console.log('Found properties for agent:', {
            count: properties.length,
            properties: properties.map(p => ({
                id: p._id,
                name: p.name,
                address: p.address,
                type: p.type,
                ownerId: p.ownerId,
                companyId: p.companyId,
                status: p.status
            }))
        });
        res.json(properties);
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        console.error('Error fetching agent properties:', error);
        res.status(500).json({ message: 'Error fetching properties' });
    }
});
exports.getAgentProperties = getAgentProperties;
// Get tenants managed by the agent
const getAgentTenants = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
            throw new errorHandler_1.AppError('Authentication required', 401);
        }
        if (!((_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId)) {
            throw new errorHandler_1.AppError('Company ID not found', 400);
        }
        const tenants = yield Tenant_1.Tenant.find({
            companyId: req.user.companyId
        })
            .populate('propertyId', 'name address')
            .sort({ createdAt: -1 });
        res.json(tenants);
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        console.error('Error fetching agent tenants:', error);
        res.status(500).json({ message: 'Error fetching tenants' });
    }
});
exports.getAgentTenants = getAgentTenants;
// Get leases managed by the agent
const getAgentLeases = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
            throw new errorHandler_1.AppError('Authentication required', 401);
        }
        if (!((_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId)) {
            throw new errorHandler_1.AppError('Company ID not found', 400);
        }
        const leases = yield Lease_1.Lease.find({
            companyId: req.user.companyId
        })
            .populate('propertyId', 'name address')
            .populate('tenantId', 'firstName lastName email')
            .sort({ createdAt: -1 });
        res.json(leases);
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        console.error('Error fetching agent leases:', error);
        res.status(500).json({ message: 'Error fetching leases' });
    }
});
exports.getAgentLeases = getAgentLeases;
// Get agent's monthly commission
const getAgentCommission = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
            throw new errorHandler_1.AppError('Authentication required', 401);
        }
        if (!((_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId)) {
            throw new errorHandler_1.AppError('Company ID not found', 400);
        }
        // Calculate commission based on active leases
        const leases = yield Lease_1.Lease.find({
            companyId: req.user.companyId,
            status: 'active'
        })
            .populate('propertyId', 'rent');
        const totalCommission = leases.reduce((sum, lease) => {
            var _a;
            const rent = ((_a = lease.propertyId) === null || _a === void 0 ? void 0 : _a.rent) || 0;
            const commission = rent * 0.1; // 10% commission
            return sum + commission;
        }, 0);
        res.json({ totalCommission });
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        console.error('Error calculating agent commission:', error);
        res.status(500).json({ message: 'Error calculating commission' });
    }
});
exports.getAgentCommission = getAgentCommission;
// Create a new property for the agent
const createAgentProperty = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
            throw new errorHandler_1.AppError('Authentication required', 401);
        }
        if (!((_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId)) {
            throw new errorHandler_1.AppError('Company ID not found. Please ensure you are associated with a company.', 400);
        }
        console.log('Agent creating property:', {
            userId: req.user.userId,
            companyId: req.user.companyId,
            role: req.user.role,
            body: req.body
        });
        // Validate required fields
        if (!req.body.name || !req.body.address) {
            throw new errorHandler_1.AppError('Missing required fields: Name and address are required', 400);
        }
        // Validate property type if provided
        if (req.body.type && !['apartment', 'house', 'commercial'].includes(req.body.type)) {
            throw new errorHandler_1.AppError('Invalid property type: Must be one of: apartment, house, commercial', 400);
        }
        const propertyData = Object.assign(Object.assign({}, req.body), { ownerId: req.user.userId, companyId: req.user.companyId, status: req.body.status || 'available', type: req.body.type || 'apartment', description: req.body.description || '', rent: req.body.rent || 0, bedrooms: req.body.bedrooms || 0, bathrooms: req.body.bathrooms || 0, area: req.body.area || 0, images: req.body.images || [], amenities: req.body.amenities || [], createdAt: new Date(), updatedAt: new Date() });
        console.log('Creating property with data:', propertyData);
        const property = new Property_1.Property(propertyData);
        const savedProperty = yield property.save();
        console.log('Property created successfully:', {
            id: savedProperty._id,
            name: savedProperty.name,
            address: savedProperty.address,
            type: savedProperty.type,
            ownerId: savedProperty.ownerId,
            companyId: savedProperty.companyId
        });
        res.status(201).json(savedProperty);
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        console.error('Error creating agent property:', error);
        res.status(500).json({ message: 'Error creating property' });
    }
});
exports.createAgentProperty = createAgentProperty;
