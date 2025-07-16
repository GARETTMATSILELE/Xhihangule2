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
exports.LeaseController = void 0;
const leaseRepository_1 = require("../repositories/leaseRepository");
const mongoose_1 = __importDefault(require("mongoose"));
class LeaseController {
    constructor() {
        this.leaseRepository = leaseRepository_1.LeaseRepository.getInstance();
    }
    static getInstance() {
        if (!LeaseController.instance) {
            LeaseController.instance = new LeaseController();
        }
        return LeaseController.instance;
    }
    getLeases(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const companyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
                const leases = companyId
                    ? yield this.leaseRepository.findByCompanyId(companyId)
                    : yield this.leaseRepository.find({});
                res.json(leases);
            }
            catch (error) {
                console.error('Error fetching leases:', error);
                res.status(500).json({ error: 'Failed to fetch leases' });
            }
        });
    }
    getLeaseById(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const lease = yield this.leaseRepository.findById(req.params.id);
                if (!lease) {
                    res.status(404).json({ error: 'Lease not found' });
                    return;
                }
                res.json(lease);
            }
            catch (error) {
                console.error('Error fetching lease:', error);
                res.status(500).json({ error: 'Failed to fetch lease' });
            }
        });
    }
    createLease(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            try {
                console.log('Creating lease with data:', JSON.stringify(req.body, null, 2));
                console.log('User info:', req.user);
                // Validate required fields - handle both field name variations
                const { propertyId, tenantId, startDate, endDate, rentAmount, depositAmount, monthlyRent, securityDeposit } = req.body;
                // Use monthlyRent/securityDeposit if rentAmount/depositAmount are not provided
                const finalRentAmount = rentAmount !== undefined ? rentAmount : monthlyRent;
                const finalDepositAmount = depositAmount !== undefined ? depositAmount : securityDeposit;
                console.log('Extracted required fields:', {
                    propertyId,
                    tenantId,
                    startDate,
                    endDate,
                    rentAmount: finalRentAmount,
                    depositAmount: finalDepositAmount,
                    originalRentAmount: rentAmount,
                    originalDepositAmount: depositAmount,
                    monthlyRent,
                    securityDeposit
                });
                console.log('Field validation results:', {
                    hasPropertyId: !!propertyId,
                    hasTenantId: !!tenantId,
                    hasStartDate: !!startDate,
                    hasEndDate: !!endDate,
                    hasRentAmount: finalRentAmount !== undefined && finalRentAmount !== null,
                    hasDepositAmount: finalDepositAmount !== undefined && finalDepositAmount !== null,
                    rentAmountType: typeof finalRentAmount,
                    depositAmountType: typeof finalDepositAmount
                });
                if (!propertyId || !tenantId || !startDate || !endDate || finalRentAmount === undefined || finalRentAmount === null || finalDepositAmount === undefined || finalDepositAmount === null) {
                    console.log('Missing required fields detected');
                    res.status(400).json({
                        error: 'Missing required fields: propertyId, tenantId, startDate, endDate, rentAmount, depositAmount',
                        received: { propertyId, tenantId, startDate, endDate, rentAmount: finalRentAmount, depositAmount: finalDepositAmount }
                    });
                    return;
                }
                // Check if amounts are valid numbers (including 0)
                if (isNaN(Number(finalRentAmount)) || isNaN(Number(finalDepositAmount))) {
                    console.log('Invalid numeric values detected');
                    res.status(400).json({
                        error: 'Rent amount and deposit amount must be valid numbers',
                        received: { rentAmount: finalRentAmount, depositAmount: finalDepositAmount }
                    });
                    return;
                }
                // Ensure companyId is available
                if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId) && !req.body.companyId) {
                    console.log('Missing companyId detected');
                    res.status(400).json({
                        error: 'Company ID is required',
                        received: { userCompanyId: (_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId, bodyCompanyId: req.body.companyId }
                    });
                    return;
                }
                // Transform and validate the data
                const leaseData = {
                    propertyId,
                    tenantId,
                    startDate: new Date(startDate),
                    endDate: new Date(endDate),
                    rentAmount: Number(finalRentAmount),
                    depositAmount: Number(finalDepositAmount),
                    status: req.body.status || 'active',
                    companyId: ((_c = req.user) === null || _c === void 0 ? void 0 : _c.companyId) ? new mongoose_1.default.Types.ObjectId(req.user.companyId) : (req.body.companyId ? new mongoose_1.default.Types.ObjectId(req.body.companyId) : undefined),
                    ownerId: req.body.ownerId, // <-- Add this line to save ownerId
                    // Additional fields with defaults
                    monthlyRent: Number(req.body.monthlyRent || finalRentAmount),
                    securityDeposit: Number(req.body.securityDeposit || finalDepositAmount),
                    petDeposit: Number(req.body.petDeposit || 0),
                    isPetAllowed: Boolean(req.body.isPetAllowed || false),
                    maxOccupants: Number(req.body.maxOccupants || 1),
                    isUtilitiesIncluded: Boolean(req.body.isUtilitiesIncluded || false),
                    utilitiesDetails: req.body.utilitiesDetails || '',
                    rentDueDay: Number(req.body.rentDueDay || 1),
                    lateFee: Number(req.body.lateFee || 0),
                    gracePeriod: Number(req.body.gracePeriod || 0)
                };
                // Validate date ranges
                if (leaseData.startDate >= leaseData.endDate) {
                    res.status(400).json({ error: 'End date must be after start date' });
                    return;
                }
                // Validate numeric fields
                if (leaseData.rentAmount < 0 || leaseData.depositAmount < 0) {
                    res.status(400).json({ error: 'Rent amount and deposit amount must be non-negative' });
                    return;
                }
                console.log('Processed lease data:', leaseData);
                const lease = yield this.leaseRepository.create(leaseData);
                console.log('Lease created successfully:', lease._id);
                res.status(201).json(lease);
            }
            catch (error) {
                console.error('Error creating lease:', error);
                // Handle Mongoose validation errors
                if (error.name === 'ValidationError') {
                    const validationErrors = Object.values(error.errors).map((err) => err.message);
                    res.status(400).json({
                        error: 'Validation failed',
                        details: validationErrors
                    });
                    return;
                }
                // Handle duplicate key errors
                if (error.code === 11000) {
                    res.status(400).json({
                        error: 'A lease with these details already exists'
                    });
                    return;
                }
                res.status(500).json({ error: 'Failed to create lease' });
            }
        });
    }
    updateLease(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                console.log('Updating lease with data:', req.body);
                const { id } = req.params;
                const updateData = Object.assign({}, req.body);
                // Transform numeric fields
                if (updateData.rentAmount !== undefined)
                    updateData.rentAmount = Number(updateData.rentAmount);
                if (updateData.depositAmount !== undefined)
                    updateData.depositAmount = Number(updateData.depositAmount);
                if (updateData.monthlyRent !== undefined)
                    updateData.monthlyRent = Number(updateData.monthlyRent);
                if (updateData.securityDeposit !== undefined)
                    updateData.securityDeposit = Number(updateData.securityDeposit);
                if (updateData.petDeposit !== undefined)
                    updateData.petDeposit = Number(updateData.petDeposit);
                if (updateData.maxOccupants !== undefined)
                    updateData.maxOccupants = Number(updateData.maxOccupants);
                if (updateData.rentDueDay !== undefined)
                    updateData.rentDueDay = Number(updateData.rentDueDay);
                if (updateData.lateFee !== undefined)
                    updateData.lateFee = Number(updateData.lateFee);
                if (updateData.gracePeriod !== undefined)
                    updateData.gracePeriod = Number(updateData.gracePeriod);
                // Transform boolean fields
                if (updateData.isPetAllowed !== undefined)
                    updateData.isPetAllowed = Boolean(updateData.isPetAllowed);
                if (updateData.isUtilitiesIncluded !== undefined)
                    updateData.isUtilitiesIncluded = Boolean(updateData.isUtilitiesIncluded);
                // Transform date fields
                if (updateData.startDate)
                    updateData.startDate = new Date(updateData.startDate);
                if (updateData.endDate)
                    updateData.endDate = new Date(updateData.endDate);
                // Validate date ranges if both dates are provided
                if (updateData.startDate && updateData.endDate && updateData.startDate >= updateData.endDate) {
                    res.status(400).json({ error: 'End date must be after start date' });
                    return;
                }
                // Validate numeric fields
                if (updateData.rentAmount !== undefined && updateData.rentAmount < 0) {
                    res.status(400).json({ error: 'Rent amount must be non-negative' });
                    return;
                }
                if (updateData.depositAmount !== undefined && updateData.depositAmount < 0) {
                    res.status(400).json({ error: 'Deposit amount must be non-negative' });
                    return;
                }
                console.log('Processed update data:', updateData);
                const lease = yield this.leaseRepository.update(id, updateData);
                if (!lease) {
                    res.status(404).json({ error: 'Lease not found' });
                    return;
                }
                console.log('Lease updated successfully:', lease._id);
                res.json(lease);
            }
            catch (error) {
                console.error('Error updating lease:', error);
                // Handle Mongoose validation errors
                if (error.name === 'ValidationError') {
                    const validationErrors = Object.values(error.errors).map((err) => err.message);
                    res.status(400).json({
                        error: 'Validation failed',
                        details: validationErrors
                    });
                    return;
                }
                res.status(500).json({ error: 'Failed to update lease' });
            }
        });
    }
    deleteLease(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const success = yield this.leaseRepository.delete(req.params.id);
                if (!success) {
                    res.status(404).json({ error: 'Lease not found' });
                    return;
                }
                res.status(204).send();
            }
            catch (error) {
                console.error('Error deleting lease:', error);
                res.status(500).json({ error: 'Failed to delete lease' });
            }
        });
    }
    getLeaseStats(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const stats = yield this.leaseRepository.getLeaseStats();
                res.json(stats);
            }
            catch (error) {
                console.error('Error fetching lease stats:', error);
                res.status(500).json({ error: 'Failed to fetch lease stats' });
            }
        });
    }
    getActiveLeases(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const leases = yield this.leaseRepository.findActiveLeases();
                res.json(leases);
            }
            catch (error) {
                console.error('Error fetching active leases:', error);
                res.status(500).json({ error: 'Failed to fetch active leases' });
            }
        });
    }
    getExpiringLeases(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const daysThreshold = parseInt(req.query.days) || 30;
                const leases = yield this.leaseRepository.findExpiringLeases(daysThreshold);
                res.json(leases);
            }
            catch (error) {
                console.error('Error fetching expiring leases:', error);
                res.status(500).json({ error: 'Failed to fetch expiring leases' });
            }
        });
    }
    updateLeaseStatus(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { status } = req.body;
                const lease = yield this.leaseRepository.updateLeaseStatus(req.params.id, status);
                if (!lease) {
                    res.status(404).json({ error: 'Lease not found' });
                    return;
                }
                res.json(lease);
            }
            catch (error) {
                console.error('Error updating lease status:', error);
                res.status(500).json({ error: 'Failed to update lease status' });
            }
        });
    }
    extendLease(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { newEndDate } = req.body;
                const lease = yield this.leaseRepository.extendLease(req.params.id, new Date(newEndDate));
                if (!lease) {
                    res.status(404).json({ error: 'Lease not found' });
                    return;
                }
                res.json(lease);
            }
            catch (error) {
                console.error('Error extending lease:', error);
                res.status(500).json({ error: 'Failed to extend lease' });
            }
        });
    }
    // Public endpoint for admin dashboard - no authentication required
    getLeasesPublic(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                console.log('Public leases request:', {
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
                if (req.query.status) {
                    query.status = req.query.status;
                }
                if (req.query.propertyId) {
                    query.propertyId = req.query.propertyId;
                }
                if (req.query.tenantId) {
                    query.tenantId = req.query.tenantId;
                }
                console.log('Public leases query:', query);
                const leases = yield this.leaseRepository.find(query);
                console.log(`Found ${leases.length} leases`);
                res.json({
                    status: 'success',
                    data: leases,
                    count: leases.length,
                    companyId: companyId || null
                });
            }
            catch (error) {
                console.error('Error fetching leases (public):', error);
                res.status(500).json({
                    status: 'error',
                    message: 'Error fetching leases',
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });
    }
    // Public endpoint for getting a single lease by ID - no authentication required
    getLeaseByIdPublic(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { id } = req.params;
                const companyId = req.query.companyId || req.headers['x-company-id'];
                console.log('Public lease by ID request:', {
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
                console.log('Public lease by ID query:', query);
                const lease = yield this.leaseRepository.findOne(query);
                if (!lease) {
                    res.status(404).json({
                        status: 'error',
                        message: 'Lease not found',
                        id,
                        companyId: companyId || null
                    });
                    return;
                }
                console.log('Found lease:', { id: lease._id, propertyId: lease.propertyId });
                res.json({
                    status: 'success',
                    data: lease
                });
            }
            catch (error) {
                console.error('Error fetching lease by ID (public):', error);
                res.status(500).json({
                    status: 'error',
                    message: 'Error fetching lease',
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });
    }
}
exports.LeaseController = LeaseController;
