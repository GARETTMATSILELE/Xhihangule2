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
exports.deleteAgentPropertyOwner = exports.updateAgentPropertyOwner = exports.createAgentPropertyOwner = exports.getAgentPropertyOwners = exports.createAgentFile = exports.getAgentLevyPayments = exports.getAgentPayments = exports.updateAgentPayment = exports.createAgentPayment = exports.updateAgentProperty = exports.createAgentLease = exports.createAgentTenant = exports.createAgentProperty = exports.getAgentCommission = exports.getAgentFiles = exports.getAgentLeases = exports.getAgentTenants = exports.getAgentProperties = void 0;
const Property_1 = require("../models/Property");
const Tenant_1 = require("../models/Tenant");
const Lease_1 = require("../models/Lease");
const Payment_1 = require("../models/Payment");
const LevyPayment_1 = require("../models/LevyPayment");
const File_1 = __importDefault(require("../models/File"));
const PropertyOwner_1 = require("../models/PropertyOwner");
const User_1 = require("../models/User");
const Company_1 = require("../models/Company");
const errorHandler_1 = require("../middleware/errorHandler");
const mongoose_1 = __importDefault(require("mongoose"));
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
        // Get only properties where the agent is the owner (ownerId matches the agent's userId)
        const query = {
            companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId),
            ownerId: new mongoose_1.default.Types.ObjectId(req.user.userId) // Only properties owned by this agent
        };
        console.log('Agent properties query:', query);
        // First, let's see all properties in the company to understand the data
        const allCompanyProperties = yield Property_1.Property.find({ companyId: req.user.companyId });
        console.log('All company properties:', {
            total: allCompanyProperties.length,
            properties: allCompanyProperties.map(p => {
                var _a, _b;
                return ({
                    id: p._id,
                    name: p.name,
                    ownerId: (_a = p.ownerId) === null || _a === void 0 ? void 0 : _a.toString(),
                    agentUserId: req.user.userId,
                    isOwnedByAgent: ((_b = p.ownerId) === null || _b === void 0 ? void 0 : _b.toString()) === req.user.userId
                });
            })
        });
        const properties = yield Property_1.Property.find(query)
            .populate('ownerId', 'firstName lastName email')
            .sort({ createdAt: -1 }); // Sort by newest first
        console.log('Found properties for agent:', {
            count: properties.length,
            agentId: req.user.userId,
            query: query,
            properties: properties.map(p => {
                var _a;
                return ({
                    id: p._id,
                    name: p.name,
                    address: p.address,
                    type: p.type,
                    ownerId: ((_a = p.ownerId) === null || _a === void 0 ? void 0 : _a._id) || p.ownerId, // Show the actual ID, not the populated object
                    ownerIdType: typeof p.ownerId,
                    companyId: p.companyId,
                    status: p.status
                });
            })
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
        // Get tenants created by this agent (using ownerId)
        const tenants = yield Tenant_1.Tenant.find({
            companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId),
            ownerId: new mongoose_1.default.Types.ObjectId(req.user.userId) // Filter by agent who created the tenant
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
        // Get leases created by this agent (using ownerId)
        const leases = yield Lease_1.Lease.find({
            companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId),
            ownerId: new mongoose_1.default.Types.ObjectId(req.user.userId) // Filter by agent who created the lease
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
// Get files uploaded by the agent
const getAgentFiles = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
            throw new errorHandler_1.AppError('Authentication required', 401);
        }
        if (!((_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId)) {
            throw new errorHandler_1.AppError('Company ID not found', 400);
        }
        // Determine properties that belong to this agent within the company
        const agentPropertyIds = yield Property_1.Property.find({
            ownerId: new mongoose_1.default.Types.ObjectId(req.user.userId),
            companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId)
        }).distinct('_id');
        // Fetch files where propertyId is within the agent's properties and scoped to company
        const files = yield File_1.default.find({
            companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId),
            propertyId: { $in: agentPropertyIds }
        })
            .populate('propertyId', 'name address')
            .populate('uploadedBy', 'firstName lastName email')
            .sort({ uploadedAt: -1 });
        // Normalize/format for client
        const formatted = files.map((f) => {
            var _a, _b;
            return ({
                _id: f._id,
                propertyId: ((_a = f.propertyId) === null || _a === void 0 ? void 0 : _a._id) || f.propertyId,
                propertyName: ((_b = f.propertyId) === null || _b === void 0 ? void 0 : _b.name) || 'N/A',
                fileName: f.fileName,
                fileType: f.fileType,
                fileUrl: f.fileUrl,
                uploadedAt: f.uploadedAt,
                uploadedByName: f.uploadedBy ? `${f.uploadedBy.firstName || ''} ${f.uploadedBy.lastName || ''}`.trim() || 'Unknown' : 'Unknown'
            });
        });
        res.json(formatted);
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        console.error('Error fetching agent files:', error);
        res.status(500).json({ message: 'Error fetching files' });
    }
});
exports.getAgentFiles = getAgentFiles;
// Get agent's monthly commission
const getAgentCommission = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
            throw new errorHandler_1.AppError('Authentication required', 401);
        }
        if (!((_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId)) {
            throw new errorHandler_1.AppError('Company ID not found', 400);
        }
        // Current period (0-based month)
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        // Fetch completed payments for this agent in this company
        const payments = yield Payment_1.Payment.find({
            agentId: new mongoose_1.default.Types.ObjectId(req.user.userId),
            companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId),
            status: 'completed'
        }).select('commissionDetails paymentDate rentalPeriodMonth rentalPeriodYear advanceMonthsPaid advancePeriodStart advancePeriodEnd');
        let monthlyCommission = 0;
        for (const payment of payments) {
            // Determine covered rental months for this payment
            const coveredMonths = [];
            const advanceMonths = payment.advanceMonthsPaid;
            const startPeriod = payment.advancePeriodStart;
            const endPeriod = payment.advancePeriodEnd;
            if (advanceMonths && advanceMonths > 1 && startPeriod && endPeriod) {
                let y = startPeriod.year;
                let m0 = startPeriod.month - 1; // convert to 0-based
                const endY = endPeriod.year;
                const endM0 = endPeriod.month - 1;
                while (y < endY || (y === endY && m0 <= endM0)) {
                    coveredMonths.push({ year: y, month: m0 });
                    m0 += 1;
                    if (m0 > 11) {
                        m0 = 0;
                        y += 1;
                    }
                }
            }
            else if (typeof payment.rentalPeriodYear === 'number' && typeof payment.rentalPeriodMonth === 'number') {
                const y = payment.rentalPeriodYear;
                const m0 = payment.rentalPeriodMonth - 1;
                if (m0 >= 0 && m0 <= 11) {
                    coveredMonths.push({ year: y, month: m0 });
                }
            }
            // Fallback to paymentDate month/year if rental period is not set
            if (coveredMonths.length === 0) {
                const d = new Date(payment.paymentDate);
                coveredMonths.push({ year: d.getFullYear(), month: d.getMonth() });
            }
            const totalAgentShare = ((_c = payment.commissionDetails) === null || _c === void 0 ? void 0 : _c.agentShare) || 0;
            const perMonthAgentShare = coveredMonths.length > 0 ? totalAgentShare / coveredMonths.length : 0;
            // Sum only for the current month/year
            coveredMonths.forEach(({ year, month }) => {
                if (year === currentYear && month === currentMonth) {
                    monthlyCommission += perMonthAgentShare;
                }
            });
        }
        res.json({ monthlyCommission });
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
        const propertyData = Object.assign(Object.assign({}, req.body), { ownerId: new mongoose_1.default.Types.ObjectId(req.user.userId), companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId), status: req.body.status || 'available', type: req.body.type || 'apartment', description: req.body.description || '', rent: req.body.rent || 0, bedrooms: req.body.bedrooms || 0, bathrooms: req.body.bathrooms || 0, area: req.body.area || 0, images: req.body.images || [], amenities: req.body.amenities || [], createdAt: new Date(), updatedAt: new Date(), rentalType: req.body.rentalType, commission: req.body.commission });
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
// Create a new tenant for the agent
const createAgentTenant = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        if (!((_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId)) {
            return res.status(400).json({ message: 'Company ID not found. Please ensure you are associated with a company.' });
        }
        // Only allow agents
        if (req.user.role !== 'agent') {
            return res.status(403).json({ message: 'Only agents can create tenants via this endpoint.' });
        }
        const { firstName, lastName, email, phone, propertyId, status, idNumber, emergencyContact } = req.body;
        // Validate required fields
        if (!firstName || !lastName || !email || !phone) {
            return res.status(400).json({ message: 'All fields are required' });
        }
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ message: 'Invalid email format' });
        }
        // Ensure the property belongs to this agent
        const property = yield Property_1.Property.findOne({ _id: new mongoose_1.default.Types.ObjectId(propertyId), ownerId: new mongoose_1.default.Types.ObjectId(req.user.userId), companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId) });
        if (!property) {
            return res.status(403).json({ message: 'You can only add tenants to your own properties.' });
        }
        // Check for existing tenant with same email in this company
        const existingTenant = yield Tenant_1.Tenant.findOne({ email, companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId) });
        if (existingTenant) {
            return res.status(400).json({ message: 'Tenant with this email already exists' });
        }
        const tenantData = {
            firstName,
            lastName,
            email,
            phone,
            companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId),
            status: status || 'Active',
            propertyId: new mongoose_1.default.Types.ObjectId(propertyId),
            ownerId: new mongoose_1.default.Types.ObjectId(req.user.userId), // Set the agent as the owner
            idNumber,
            emergencyContact
        };
        const newTenant = new Tenant_1.Tenant(tenantData);
        yield newTenant.save();
        // Mark property as rented
        yield Property_1.Property.findByIdAndUpdate(new mongoose_1.default.Types.ObjectId(propertyId), { status: 'rented' });
        res.status(201).json(newTenant);
    }
    catch (error) {
        console.error('Error creating agent tenant:', error);
        res.status(500).json({ message: 'Error creating tenant' });
    }
});
exports.createAgentTenant = createAgentTenant;
// Create a new lease for the agent
const createAgentLease = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        if (!((_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId)) {
            return res.status(400).json({ message: 'Company ID not found. Please ensure you are associated with a company.' });
        }
        // Only allow agents
        if (req.user.role !== 'agent') {
            return res.status(403).json({ message: 'Only agents can create leases via this endpoint.' });
        }
        const { propertyId, tenantId, startDate, endDate, rentAmount, depositAmount, monthlyRent, securityDeposit, status, monthlyRent: rent, securityDeposit: deposit, petDeposit, isPetAllowed, maxOccupants, isUtilitiesIncluded, utilitiesDetails, rentDueDay, lateFee, gracePeriod } = req.body;
        // Use monthlyRent/securityDeposit if rentAmount/depositAmount are not provided
        const finalRentAmount = rentAmount !== undefined ? rentAmount : monthlyRent;
        const finalDepositAmount = depositAmount !== undefined ? depositAmount : securityDeposit;
        // Validate required fields
        if (!propertyId || !tenantId || !startDate || !endDate || finalRentAmount === undefined || finalRentAmount === null || finalDepositAmount === undefined || finalDepositAmount === null) {
            return res.status(400).json({
                error: 'Missing required fields: propertyId, tenantId, startDate, endDate, rentAmount, depositAmount',
                received: { propertyId, tenantId, startDate, endDate, rentAmount: finalRentAmount, depositAmount: finalDepositAmount }
            });
        }
        // Check if amounts are valid numbers
        if (isNaN(Number(finalRentAmount)) || isNaN(Number(finalDepositAmount))) {
            return res.status(400).json({
                error: 'Rent amount and deposit amount must be valid numbers',
                received: { rentAmount: finalRentAmount, depositAmount: finalDepositAmount }
            });
        }
        // Ensure the property belongs to this agent
        const property = yield Property_1.Property.findOne({ _id: new mongoose_1.default.Types.ObjectId(propertyId), ownerId: new mongoose_1.default.Types.ObjectId(req.user.userId), companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId) });
        if (!property) {
            return res.status(403).json({ message: 'You can only create leases for your own properties.' });
        }
        // Ensure the tenant exists and belongs to the same company
        const tenant = yield Tenant_1.Tenant.findOne({ _id: new mongoose_1.default.Types.ObjectId(tenantId), companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId) });
        if (!tenant) {
            return res.status(404).json({ message: 'Tenant not found or does not belong to your company.' });
        }
        // Validate date ranges
        const startDateObj = new Date(startDate);
        const endDateObj = new Date(endDate);
        if (startDateObj >= endDateObj) {
            return res.status(400).json({ error: 'End date must be after start date' });
        }
        // Validate numeric fields
        if (Number(finalRentAmount) < 0 || Number(finalDepositAmount) < 0) {
            return res.status(400).json({ error: 'Rent amount and deposit amount must be non-negative' });
        }
        const leaseData = {
            propertyId: new mongoose_1.default.Types.ObjectId(propertyId),
            tenantId: new mongoose_1.default.Types.ObjectId(tenantId),
            startDate: startDateObj,
            endDate: endDateObj,
            rentAmount: Number(finalRentAmount),
            depositAmount: Number(finalDepositAmount),
            status: status || 'active',
            companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId),
            ownerId: new mongoose_1.default.Types.ObjectId(req.user.userId), // Set the agent as the owner
            // Additional fields with defaults
            monthlyRent: Number(monthlyRent || finalRentAmount),
            securityDeposit: Number(securityDeposit || finalDepositAmount),
            petDeposit: Number(petDeposit || 0),
            isPetAllowed: Boolean(isPetAllowed || false),
            maxOccupants: Number(maxOccupants || 1),
            isUtilitiesIncluded: Boolean(isUtilitiesIncluded || false),
            utilitiesDetails: utilitiesDetails || '',
            rentDueDay: Number(rentDueDay || 1),
            lateFee: Number(lateFee || 0),
            gracePeriod: Number(gracePeriod || 0)
        };
        const lease = new Lease_1.Lease(leaseData);
        yield lease.save();
        // Mark property as rented
        yield Property_1.Property.findByIdAndUpdate(new mongoose_1.default.Types.ObjectId(propertyId), { status: 'rented' });
        res.status(201).json(lease);
    }
    catch (error) {
        console.error('Error creating agent lease:', error);
        res.status(500).json({ message: 'Error creating lease' });
    }
});
exports.createAgentLease = createAgentLease;
// Update a property owned by the agent
const updateAgentProperty = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
            throw new errorHandler_1.AppError('Authentication required', 401);
        }
        if (!((_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId)) {
            throw new errorHandler_1.AppError('Company ID not found. Please ensure you are associated with a company.', 400);
        }
        const propertyId = req.params.id;
        if (!mongoose_1.default.Types.ObjectId.isValid(propertyId)) {
            return res.status(400).json({ message: 'Invalid property ID format.' });
        }
        // Ensure the property belongs to this agent and company
        const existing = yield Property_1.Property.findOne({
            _id: new mongoose_1.default.Types.ObjectId(propertyId),
            ownerId: new mongoose_1.default.Types.ObjectId(req.user.userId),
            companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId)
        });
        if (!existing) {
            return res.status(404).json({ message: 'Property not found or you do not have permission to update it.' });
        }
        const allowedFields = [
            'name', 'address', 'type', 'status', 'description', 'rent', 'bedrooms', 'bathrooms', 'area', 'images', 'amenities', 'rentalType', 'commission'
        ];
        const updateData = { updatedAt: new Date() };
        for (const key of allowedFields) {
            if (key in req.body)
                updateData[key] = req.body[key];
        }
        const updated = yield Property_1.Property.findByIdAndUpdate(new mongoose_1.default.Types.ObjectId(propertyId), updateData, { new: true });
        return res.json(updated);
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        console.error('Error updating agent property:', error);
        res.status(500).json({ message: 'Error updating property' });
    }
});
exports.updateAgentProperty = updateAgentProperty;
// Create a new payment for the agent
const createAgentPayment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        if (!((_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId)) {
            return res.status(400).json({ message: 'Company ID not found. Please ensure you are associated with a company.' });
        }
        // Only allow agents
        if (req.user.role !== 'agent') {
            return res.status(403).json({ message: 'Only agents can create payments via this endpoint.' });
        }
        const { propertyId, tenantId, amount, paymentDate, paymentMethod, status, paymentType, propertyType, depositAmount, referenceNumber, notes, currency, rentalPeriodMonth, rentalPeriodYear, } = req.body;
        // Validate required fields
        if (!propertyId || !tenantId || !amount || !paymentDate || !paymentMethod) {
            return res.status(400).json({
                status: 'error',
                message: 'Missing required fields: propertyId, tenantId, amount, paymentDate, paymentMethod',
            });
        }
        // Ensure the property belongs to this agent
        const property = yield Property_1.Property.findOne({ _id: new mongoose_1.default.Types.ObjectId(propertyId), ownerId: new mongoose_1.default.Types.ObjectId(req.user.userId), companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId) });
        if (!property) {
            return res.status(403).json({ message: 'You can only create payments for your own properties.' });
        }
        // Ensure the tenant exists and belongs to the same company
        const tenant = yield Tenant_1.Tenant.findOne({ _id: new mongoose_1.default.Types.ObjectId(tenantId), companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId) });
        if (!tenant) {
            return res.status(404).json({ message: 'Tenant not found or does not belong to your company.' });
        }
        // Calculate commission based on property's commission percentage and company-specific splits
        const company = yield Company_1.Company.findById(new mongoose_1.default.Types.ObjectId(req.user.companyId)).lean();
        const commissionPercentage = Number(property.commission || 0);
        const totalCommission = (amount * commissionPercentage) / 100;
        const preaPercentOfTotal = Math.max(0, Math.min(1, (_d = (_c = company === null || company === void 0 ? void 0 : company.commissionConfig) === null || _c === void 0 ? void 0 : _c.preaPercentOfTotal) !== null && _d !== void 0 ? _d : 0.03));
        const agentPercentOfRemaining = Math.max(0, Math.min(1, (_f = (_e = company === null || company === void 0 ? void 0 : company.commissionConfig) === null || _e === void 0 ? void 0 : _e.agentPercentOfRemaining) !== null && _f !== void 0 ? _f : 0.6));
        const agencyPercentOfRemaining = Math.max(0, Math.min(1, (_h = (_g = company === null || company === void 0 ? void 0 : company.commissionConfig) === null || _g === void 0 ? void 0 : _g.agencyPercentOfRemaining) !== null && _h !== void 0 ? _h : 0.4));
        const preaFee = totalCommission * preaPercentOfTotal;
        const remainingCommission = totalCommission - preaFee;
        const agentShare = remainingCommission * agentPercentOfRemaining;
        const agencyShare = remainingCommission * agencyPercentOfRemaining;
        const commissionDetails = {
            totalCommission,
            preaFee,
            agentShare,
            agencyShare,
            ownerAmount: amount - totalCommission,
        };
        // Create payment record
        const payment = new Payment_1.Payment({
            paymentType: paymentType || 'rental',
            propertyType: propertyType || 'residential',
            propertyId: new mongoose_1.default.Types.ObjectId(propertyId),
            tenantId: new mongoose_1.default.Types.ObjectId(tenantId),
            agentId: new mongoose_1.default.Types.ObjectId(req.user.userId), // Set the agent as the agent
            companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId),
            paymentDate,
            paymentMethod,
            amount,
            depositAmount: depositAmount || 0,
            rentalPeriodMonth,
            rentalPeriodYear,
            referenceNumber: '', // Placeholder, will update after save
            notes: notes || '',
            processedBy: new mongoose_1.default.Types.ObjectId(req.user.userId),
            commissionDetails,
            status: status || 'completed',
            currency: currency || 'USD',
        });
        yield payment.save();
        payment.referenceNumber = `RCPT-${payment._id.toString().slice(-6).toUpperCase()}-${rentalPeriodYear}-${String(rentalPeriodMonth).padStart(2, '0')}`;
        yield payment.save();
        // If depositAmount > 0, record in rentaldeposits (ledger)
        if (payment.depositAmount && payment.depositAmount > 0) {
            try {
                const { RentalDeposit } = require('../models/rentalDeposit');
                const deposit = new RentalDeposit({
                    propertyId: payment.propertyId,
                    agentId: payment.agentId,
                    companyId: payment.companyId,
                    tenantId: payment.tenantId,
                    depositAmount: payment.depositAmount,
                    depositDate: payment.paymentDate,
                    paymentId: payment._id,
                    type: 'payment',
                    referenceNumber: payment.referenceNumber,
                    notes: notes || '',
                    processedBy: payment.processedBy,
                    paymentMethod
                });
                yield deposit.save();
            }
            catch (depositErr) {
                console.error('Failed to record rental deposit for agent payment:', depositErr);
                // Do not fail the payment creation if deposit ledger write fails
            }
        }
        // Update company revenue
        yield mongoose_1.default.model('Company').findByIdAndUpdate(new mongoose_1.default.Types.ObjectId(req.user.companyId), {
            $inc: {
                revenue: commissionDetails.agencyShare,
            },
        });
        // Update agent commission
        yield mongoose_1.default.model('User').findByIdAndUpdate(new mongoose_1.default.Types.ObjectId(req.user.userId), {
            $inc: {
                commission: commissionDetails.agentShare,
            },
        });
        // If it's a rental payment, update property owner's balance
        if ((paymentType || 'rental') === 'rental' && property.ownerId) {
            yield mongoose_1.default.model('User').findByIdAndUpdate(property.ownerId, {
                $inc: {
                    balance: commissionDetails.ownerAmount,
                },
            });
        }
        res.status(201).json({
            status: 'success',
            data: payment,
            message: 'Payment processed successfully'
        });
    }
    catch (error) {
        console.error('Error creating agent payment:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to process payment',
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
exports.createAgentPayment = createAgentPayment;
// Update a payment for the agent
const updateAgentPayment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    try {
        console.log('updateAgentPayment called with:', {
            paymentId: req.params.id,
            userId: (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId,
            companyId: (_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId,
            role: (_c = req.user) === null || _c === void 0 ? void 0 : _c.role,
            body: req.body
        });
        if (!((_d = req.user) === null || _d === void 0 ? void 0 : _d.userId)) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        if (!((_e = req.user) === null || _e === void 0 ? void 0 : _e.companyId)) {
            return res.status(400).json({ message: 'Company ID not found. Please ensure you are associated with a company.' });
        }
        // Only allow agents
        if (req.user.role !== 'agent') {
            return res.status(403).json({ message: 'Only agents can update payments via this endpoint.' });
        }
        const paymentId = req.params.id;
        const updateData = req.body;
        // Validate ObjectId
        if (!mongoose_1.default.Types.ObjectId.isValid(paymentId)) {
            console.log('Invalid ObjectId:', paymentId);
            return res.status(400).json({ message: 'Invalid payment ID format.' });
        }
        console.log('Looking for payment with:', {
            paymentId,
            agentId: req.user.userId,
            companyId: req.user.companyId
        });
        // Find the payment and ensure it belongs to this agent
        const payment = yield Payment_1.Payment.findOne({
            _id: new mongoose_1.default.Types.ObjectId(paymentId),
            agentId: new mongoose_1.default.Types.ObjectId(req.user.userId),
            companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId)
        });
        console.log('Payment found:', payment ? 'Yes' : 'No');
        if (!payment) {
            return res.status(404).json({ message: 'Payment not found or you do not have permission to update it.' });
        }
        console.log('Original payment:', {
            id: payment._id,
            amount: payment.amount,
            propertyType: payment.propertyType
        });
        // If amount is being updated, recalculate commission using property's commission and company splits
        if (updateData.amount && updateData.amount !== payment.amount) {
            const linkedProperty = yield Property_1.Property.findById(payment.propertyId);
            const company = yield Company_1.Company.findById(new mongoose_1.default.Types.ObjectId(req.user.companyId)).lean();
            const commissionPercentage = Number((linkedProperty === null || linkedProperty === void 0 ? void 0 : linkedProperty.commission) || 0);
            const totalCommission = (updateData.amount * commissionPercentage) / 100;
            const preaPercentOfTotal = Math.max(0, Math.min(1, (_g = (_f = company === null || company === void 0 ? void 0 : company.commissionConfig) === null || _f === void 0 ? void 0 : _f.preaPercentOfTotal) !== null && _g !== void 0 ? _g : 0.03));
            const agentPercentOfRemaining = Math.max(0, Math.min(1, (_j = (_h = company === null || company === void 0 ? void 0 : company.commissionConfig) === null || _h === void 0 ? void 0 : _h.agentPercentOfRemaining) !== null && _j !== void 0 ? _j : 0.6));
            const agencyPercentOfRemaining = Math.max(0, Math.min(1, (_l = (_k = company === null || company === void 0 ? void 0 : company.commissionConfig) === null || _k === void 0 ? void 0 : _k.agencyPercentOfRemaining) !== null && _l !== void 0 ? _l : 0.4));
            const preaFee = totalCommission * preaPercentOfTotal;
            const remainingCommission = totalCommission - preaFee;
            const agentShare = remainingCommission * agentPercentOfRemaining;
            const agencyShare = remainingCommission * agencyPercentOfRemaining;
            updateData.commissionDetails = {
                totalCommission,
                preaFee,
                agentShare,
                agencyShare,
                ownerAmount: updateData.amount - totalCommission,
            };
            console.log('Recalculated commission:', updateData.commissionDetails);
        }
        console.log('Updating payment with data:', updateData);
        // Update the payment
        const updatedPayment = yield Payment_1.Payment.findByIdAndUpdate(new mongoose_1.default.Types.ObjectId(paymentId), updateData, { new: true });
        console.log('Payment updated successfully:', updatedPayment ? 'Yes' : 'No');
        res.json({
            status: 'success',
            data: updatedPayment,
            message: 'Payment updated successfully'
        });
    }
    catch (error) {
        console.error('Error updating agent payment:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to update payment',
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
exports.updateAgentPayment = updateAgentPayment;
// Get payments for properties owned by the agent
const getAgentPayments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        if (!((_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId)) {
            return res.status(400).json({ message: 'Company ID not found. Please ensure you are associated with a company.' });
        }
        // Find agent's property IDs
        const agentPropertyIds = yield Property_1.Property.find({
            ownerId: new mongoose_1.default.Types.ObjectId(req.user.userId),
            companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId)
        }).distinct('_id');
        // Build base query
        const baseQuery = {
            companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId),
            $or: [
                { propertyId: { $in: agentPropertyIds } },
                // Include agent's own provisional manual entries (not yet tied to a real property)
                { isProvisional: true, agentId: new mongoose_1.default.Types.ObjectId(req.user.userId) }
            ]
        };
        // Optional filtering
        if (req.query.provisionalOnly === 'true') {
            baseQuery.isProvisional = true;
        }
        if (req.query.status) {
            baseQuery.status = req.query.status;
        }
        if (req.query.paymentMethod) {
            baseQuery.paymentMethod = req.query.paymentMethod;
        }
        if (req.query.propertyId) {
            baseQuery.propertyId = new mongoose_1.default.Types.ObjectId(req.query.propertyId);
        }
        if (req.query.startDate || req.query.endDate) {
            baseQuery.paymentDate = {};
            if (req.query.startDate)
                baseQuery.paymentDate.$gte = new Date(req.query.startDate);
            if (req.query.endDate)
                baseQuery.paymentDate.$lte = new Date(req.query.endDate);
        }
        // Fetch payments for those properties or agent's provisional ones
        const payments = yield Payment_1.Payment.find(baseQuery)
            .populate('propertyId', 'name address')
            .populate('tenantId', 'firstName lastName email')
            .populate('agentId', 'firstName lastName')
            .sort({ paymentDate: -1 });
        return res.json(payments);
    }
    catch (error) {
        console.error('Error fetching agent payments:', error);
        return res.status(500).json({ message: 'Error fetching payments' });
    }
});
exports.getAgentPayments = getAgentPayments;
// Get levy payments for properties owned by the agent
const getAgentLevyPayments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        if (!((_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId)) {
            return res.status(400).json({ message: 'Company ID not found. Please ensure you are associated with a company.' });
        }
        const agentPropertyIds = yield Property_1.Property.find({
            ownerId: new mongoose_1.default.Types.ObjectId(req.user.userId),
            companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId)
        }).distinct('_id');
        const levies = yield LevyPayment_1.LevyPayment.find({
            companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId),
            propertyId: { $in: agentPropertyIds }
        })
            .populate('propertyId', 'name address')
            .populate('processedBy', 'firstName lastName email')
            .sort({ paymentDate: -1 });
        return res.json(levies);
    }
    catch (error) {
        console.error('Error fetching agent levy payments:', error);
        return res.status(500).json({ message: 'Error fetching levy payments' });
    }
});
exports.getAgentLevyPayments = getAgentLevyPayments;
// Create a new file for the agent
const createAgentFile = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        if (!((_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId)) {
            return res.status(400).json({ message: 'Company ID not found. Please ensure you are associated with a company.' });
        }
        // Only allow agents
        if (req.user.role !== 'agent') {
            return res.status(403).json({ message: 'Only agents can create files via this endpoint.' });
        }
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
        const { propertyId, fileType } = req.body;
        if (!propertyId || !fileType) {
            return res.status(400).json({
                message: 'Missing required fields: propertyId and fileType are required'
            });
        }
        // Ensure the property belongs to this agent
        const property = yield Property_1.Property.findOne({ _id: new mongoose_1.default.Types.ObjectId(propertyId), ownerId: new mongoose_1.default.Types.ObjectId(req.user.userId), companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId) });
        if (!property) {
            return res.status(403).json({ message: 'You can only upload files for your own properties.' });
        }
        // Create file record
        const file = new File_1.default({
            propertyId: new mongoose_1.default.Types.ObjectId(propertyId),
            fileName: req.file.originalname,
            fileType,
            fileUrl: req.file.buffer.toString('base64'),
            uploadedBy: new mongoose_1.default.Types.ObjectId(req.user.userId),
            ownerId: new mongoose_1.default.Types.ObjectId(req.user.userId) // Set the agent as the owner
        });
        yield file.save();
        res.status(201).json({
            message: 'File uploaded successfully',
            file: {
                _id: file._id,
                fileName: file.fileName,
                fileType: file.fileType,
                propertyId: file.propertyId,
                uploadedBy: file.uploadedBy,
                uploadedAt: file.uploadedAt
            }
        });
    }
    catch (error) {
        console.error('Error creating agent file:', error);
        res.status(500).json({
            message: 'Error uploading file',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
exports.createAgentFile = createAgentFile;
// Get property owners for the agent's company
const getAgentPropertyOwners = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
            throw new errorHandler_1.AppError('Authentication required', 401);
        }
        if (!((_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId)) {
            throw new errorHandler_1.AppError('Company ID not found. Please ensure you are associated with a company.', 400);
        }
        console.log('Fetching property owners for agent:', {
            companyId: req.user.companyId,
            userId: req.user.userId,
            role: req.user.role
        });
        // Get property owners for the agent's company
        const owners = yield PropertyOwner_1.PropertyOwner.find({
            companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId)
        }).populate('properties', 'name address');
        res.json({ owners });
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            throw error;
        }
        console.error('Error fetching agent property owners:', error);
        res.status(500).json({ message: 'Error fetching property owners' });
    }
});
exports.getAgentPropertyOwners = getAgentPropertyOwners;
// Create a new property owner for the agent's company
const createAgentPropertyOwner = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        if (!((_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId)) {
            return res.status(400).json({ message: 'Company ID not found. Please ensure you are associated with a company.' });
        }
        // Only allow agents
        if (req.user.role !== 'agent') {
            return res.status(403).json({ message: 'Only agents can create property owners via this endpoint.' });
        }
        const { email, password, firstName, lastName, phone, propertyIds } = req.body;
        // Validate required fields
        if (!email || !password || !firstName || !lastName || !phone) {
            return res.status(400).json({ message: 'All fields are required' });
        }
        // Check if owner already exists
        const existingOwner = yield PropertyOwner_1.PropertyOwner.findOne({ email });
        if (existingOwner) {
            return res.status(400).json({ message: 'Property owner with this email already exists' });
        }
        // Validate that all properties belong to this agent
        if (propertyIds && propertyIds.length > 0) {
            const agentProperties = yield Property_1.Property.find({
                _id: { $in: propertyIds.map((id) => new mongoose_1.default.Types.ObjectId(id)) },
                ownerId: new mongoose_1.default.Types.ObjectId(req.user.userId),
                companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId)
            });
            if (agentProperties.length !== propertyIds.length) {
                return res.status(403).json({ message: 'You can only assign your own properties to property owners.' });
            }
        }
        const ownerData = {
            email,
            password,
            firstName,
            lastName,
            phone,
            companyId: req.user.companyId,
            properties: propertyIds || []
        };
        const owner = new PropertyOwner_1.PropertyOwner(ownerData);
        yield owner.save();
        // Also create a corresponding user with role 'owner' if not already present
        try {
            const existingUser = yield User_1.User.findOne({
                email: owner.email,
                companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId)
            });
            if (!existingUser) {
                const newUser = new User_1.User({
                    email: owner.email,
                    password: password, // Will be hashed by User pre-save hook
                    firstName: owner.firstName,
                    lastName: owner.lastName,
                    role: 'owner',
                    companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId),
                    isActive: true
                });
                yield newUser.save();
            }
        }
        catch (userError) {
            console.error('Error creating corresponding user for property owner:', userError);
            // Do not fail the main request if user creation fails; property owner was created successfully
        }
        // Update properties to assign them to the new owner
        if (propertyIds && propertyIds.length > 0) {
            yield Property_1.Property.updateMany({ _id: { $in: propertyIds.map((id) => new mongoose_1.default.Types.ObjectId(id)) } }, { $set: { ownerId: owner._id } });
        }
        res.status(201).json(owner);
    }
    catch (error) {
        console.error('Error creating agent property owner:', error);
        res.status(500).json({ message: 'Error creating property owner' });
    }
});
exports.createAgentPropertyOwner = createAgentPropertyOwner;
// Update a property owner for the agent's company
const updateAgentPropertyOwner = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        if (!((_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId)) {
            return res.status(400).json({ message: 'Company ID not found. Please ensure you are associated with a company.' });
        }
        // Only allow agents
        if (req.user.role !== 'agent') {
            return res.status(403).json({ message: 'Only agents can update property owners via this endpoint.' });
        }
        const { id } = req.params;
        const { firstName, lastName, email, phone, propertyIds } = req.body;
        // Find the property owner and ensure it belongs to the agent's company
        const owner = yield PropertyOwner_1.PropertyOwner.findOne({
            _id: id,
            companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId)
        });
        if (!owner) {
            return res.status(404).json({ message: 'Property owner not found' });
        }
        // Validate that all properties belong to this agent
        if (propertyIds && propertyIds.length > 0) {
            const agentProperties = yield Property_1.Property.find({
                _id: { $in: propertyIds.map((id) => new mongoose_1.default.Types.ObjectId(id)) },
                ownerId: new mongoose_1.default.Types.ObjectId(req.user.userId),
                companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId)
            });
            if (agentProperties.length !== propertyIds.length) {
                return res.status(403).json({ message: 'You can only assign your own properties to property owners.' });
            }
        }
        // Update owner data
        const updateData = {};
        if (firstName)
            updateData.firstName = firstName;
        if (lastName)
            updateData.lastName = lastName;
        if (email)
            updateData.email = email;
        if (phone)
            updateData.phone = phone;
        if (propertyIds)
            updateData.properties = propertyIds;
        const updatedOwner = yield PropertyOwner_1.PropertyOwner.findByIdAndUpdate(id, updateData, { new: true });
        // Update property assignments
        if (propertyIds) {
            // Remove owner from all properties first
            yield Property_1.Property.updateMany({ ownerId: new mongoose_1.default.Types.ObjectId(id) }, { $unset: { ownerId: 1 } });
            // Assign new properties to the owner
            if (propertyIds.length > 0) {
                yield Property_1.Property.updateMany({ _id: { $in: propertyIds.map((id) => new mongoose_1.default.Types.ObjectId(id)) } }, { $set: { ownerId: new mongoose_1.default.Types.ObjectId(id) } });
            }
        }
        res.json(updatedOwner);
    }
    catch (error) {
        console.error('Error updating agent property owner:', error);
        res.status(500).json({ message: 'Error updating property owner' });
    }
});
exports.updateAgentPropertyOwner = updateAgentPropertyOwner;
// Delete a property owner for the agent's company
const deleteAgentPropertyOwner = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        if (!((_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId)) {
            return res.status(400).json({ message: 'Company ID not found. Please ensure you are associated with a company.' });
        }
        // Only allow agents
        if (req.user.role !== 'agent') {
            return res.status(403).json({ message: 'Only agents can delete property owners via this endpoint.' });
        }
        const { id } = req.params;
        // Find the property owner and ensure it belongs to the agent's company
        const owner = yield PropertyOwner_1.PropertyOwner.findOne({
            _id: id,
            companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId)
        });
        if (!owner) {
            return res.status(404).json({ message: 'Property owner not found' });
        }
        // Remove owner from all properties
        yield Property_1.Property.updateMany({ ownerId: new mongoose_1.default.Types.ObjectId(id) }, { $unset: { ownerId: 1 } });
        // Delete the property owner
        yield PropertyOwner_1.PropertyOwner.findByIdAndDelete(id);
        res.json({ message: 'Property owner deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting agent property owner:', error);
        res.status(500).json({ message: 'Error deleting property owner' });
    }
});
exports.deleteAgentPropertyOwner = deleteAgentPropertyOwner;
