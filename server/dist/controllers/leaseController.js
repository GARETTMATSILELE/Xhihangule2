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
const Lease_1 = require("../models/Lease");
const Payment_1 = require("../models/Payment");
const Property_1 = require("../models/Property");
const leaseBillingEngine_1 = require("../services/leaseBillingEngine");
const inspectionAutomationService_1 = require("../services/inspectionAutomationService");
const LEASE_STATUSES = [
    'draft',
    'pending_approval',
    'active',
    'expiring_soon',
    'expired',
    'renewed',
    'terminated',
    'pending_settlement',
    'closed',
];
const IMMUTABLE_LEASE_STATUSES = [
    'active',
    'expiring_soon',
    'expired',
    'renewed',
    'terminated',
    'pending_settlement',
    'closed',
];
const IMMUTABLE_LEASE_FIELDS = [
    'propertyId',
    'tenantId',
    'startDate',
    'endDate',
    'rentAmount',
    'depositAmount',
    'monthlyRent',
    'securityDeposit',
    'previousLeaseId',
    'successorLeaseId',
    'billingRules',
];
const asObjectIdOrUndefined = (value) => {
    if (!value || !mongoose_1.default.Types.ObjectId.isValid(String(value)))
        return undefined;
    return new mongoose_1.default.Types.ObjectId(String(value));
};
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
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
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
                    status: LEASE_STATUSES.includes(req.body.status) ? req.body.status : 'active',
                    companyId: ((_c = req.user) === null || _c === void 0 ? void 0 : _c.companyId) ? new mongoose_1.default.Types.ObjectId(req.user.companyId) : (req.body.companyId ? new mongoose_1.default.Types.ObjectId(req.body.companyId) : undefined),
                    // Always stamp ownerId from the authenticated user context (required by schema)
                    ownerId: ((_d = req.user) === null || _d === void 0 ? void 0 : _d.userId) ? new mongoose_1.default.Types.ObjectId(req.user.userId) : undefined,
                    previousLeaseId: asObjectIdOrUndefined(req.body.previousLeaseId) || null,
                    renewalReminderDate: req.body.renewalReminderDate ? new Date(req.body.renewalReminderDate) : undefined,
                    billingStatus: req.body.billingStatus || 'current',
                    billingRules: {
                        frequency: 'monthly',
                        rentDueDay: Number(req.body.rentDueDay || 1),
                        escalationPercent: Number(req.body.escalationPercent || ((_e = req.body.billingRules) === null || _e === void 0 ? void 0 : _e.escalationPercent) || 0),
                        escalationFrequencyMonths: Number(req.body.escalationFrequencyMonths || ((_f = req.body.billingRules) === null || _f === void 0 ? void 0 : _f.escalationFrequencyMonths) || 12),
                        nextEscalationDate: req.body.nextEscalationDate || ((_g = req.body.billingRules) === null || _g === void 0 ? void 0 : _g.nextEscalationDate)
                            ? new Date(req.body.nextEscalationDate || req.body.billingRules.nextEscalationDate)
                            : undefined,
                        recurringLevies: Number(req.body.recurringLevies || ((_h = req.body.billingRules) === null || _h === void 0 ? void 0 : _h.recurringLevies) || 0),
                        recurringServiceCharges: Number(req.body.recurringServiceCharges || ((_j = req.body.billingRules) === null || _j === void 0 ? void 0 : _j.recurringServiceCharges) || 0),
                        prorateMoveIn: (_m = (_k = req.body.prorateMoveIn) !== null && _k !== void 0 ? _k : (_l = req.body.billingRules) === null || _l === void 0 ? void 0 : _l.prorateMoveIn) !== null && _m !== void 0 ? _m : true,
                    },
                    financialSummary: {
                        totalBilled: 0,
                        totalPaid: 0,
                        outstandingBalance: 0,
                        depositHeld: Number(finalDepositAmount),
                        penalties: 0,
                        moveOutSettlement: 0,
                    },
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
                if (leaseData.previousLeaseId) {
                    yield this.leaseRepository.linkSuccessor(String(leaseData.previousLeaseId), lease._id);
                }
                if (lease.status === 'active' || lease.status === 'pending_approval') {
                    (0, inspectionAutomationService_1.ensureLeaseInspectionSchedule)(lease).catch((error) => {
                        console.error('Failed to create lease inspection schedule:', error);
                    });
                }
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
                const existingLease = yield this.leaseRepository.findById(id);
                if (!existingLease) {
                    res.status(404).json({ error: 'Lease not found' });
                    return;
                }
                if (IMMUTABLE_LEASE_STATUSES.includes(existingLease.status)) {
                    const destructiveFields = IMMUTABLE_LEASE_FIELDS.filter((field) => field in updateData);
                    if (destructiveFields.length > 0) {
                        res.status(409).json({
                            error: 'Active and historical leases are immutable. Create a renewal lease or controlled amendment instead.',
                            blockedFields: destructiveFields,
                        });
                        return;
                    }
                }
                if (updateData.status && !LEASE_STATUSES.includes(updateData.status)) {
                    res.status(400).json({ error: 'Invalid lease status' });
                    return;
                }
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
                if (updateData.status && updateData.status !== existingLease.status) {
                    updateData.lifecycleStatusChangedAt = new Date();
                }
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
                if (!LEASE_STATUSES.includes(status)) {
                    res.status(400).json({ error: 'Invalid lease status' });
                    return;
                }
                const lease = yield this.leaseRepository.updateLeaseStatus(req.params.id, status);
                if (!lease) {
                    res.status(404).json({ error: 'Lease not found' });
                    return;
                }
                if (status === 'active') {
                    (0, inspectionAutomationService_1.ensureLeaseInspectionSchedule)(lease).catch((error) => {
                        console.error('Failed to create active lease inspection schedule:', error);
                    });
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
                const lease = yield this.leaseRepository.findById(req.params.id);
                if (!lease) {
                    res.status(404).json({ error: 'Lease not found' });
                    return;
                }
                const successor = yield this.createSuccessorLease(lease, Object.assign(Object.assign({}, req.body), { startDate: new Date(lease.endDate.getTime() + 24 * 60 * 60 * 1000), endDate: new Date(newEndDate) }));
                res.status(201).json(successor);
            }
            catch (error) {
                console.error('Error extending lease:', error);
                res.status(500).json({ error: 'Failed to renew lease' });
            }
        });
    }
    renewLease(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const lease = yield this.leaseRepository.findById(req.params.id);
                if (!lease) {
                    res.status(404).json({ error: 'Lease not found' });
                    return;
                }
                const successor = yield this.createSuccessorLease(lease, req.body);
                res.status(201).json(successor);
            }
            catch (error) {
                console.error('Error renewing lease:', error);
                res.status(500).json({ error: error.message || 'Failed to renew lease' });
            }
        });
    }
    terminateLease(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const lease = yield Lease_1.Lease.findById(req.params.id);
                if (!lease) {
                    res.status(404).json({ error: 'Lease not found' });
                    return;
                }
                const payments = yield Payment_1.Payment.find({
                    leaseId: lease._id,
                    status: { $in: ['pending', 'completed'] }
                });
                const totalPaid = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
                const generatedPeriods = leaseBillingEngine_1.LeaseBillingEngine.generateMonthlyPeriods(lease, lease.startDate, req.body.moveOutDate ? new Date(req.body.moveOutDate) : new Date());
                const totalBilled = generatedPeriods.reduce((sum, period) => sum + period.totalAmount, 0);
                const outstandingBalance = Math.max(0, totalBilled - totalPaid);
                const depositHeld = Number(lease.depositAmount || lease.securityDeposit || 0);
                const deductions = Number(req.body.deductions || req.body.damages || 0);
                const refundDue = Math.max(0, depositHeld - deductions - outstandingBalance);
                lease.status = 'pending_settlement';
                lease.terminationDate = req.body.terminationDate ? new Date(req.body.terminationDate) : new Date();
                lease.terminationReason = req.body.reason || req.body.terminationReason || 'Move-out initiated';
                lease.moveOutDate = req.body.moveOutDate ? new Date(req.body.moveOutDate) : lease.terminationDate;
                lease.lifecycleStatusChangedAt = new Date();
                lease.financialSummary = {
                    totalBilled,
                    totalPaid,
                    outstandingBalance,
                    depositHeld,
                    penalties: Number(req.body.penalties || 0),
                    moveOutSettlement: refundDue,
                };
                lease.depositSettlement = {
                    depositHeld,
                    deductions,
                    refundDue,
                    notes: req.body.settlementNotes || '',
                };
                yield lease.save();
                (0, inspectionAutomationService_1.ensureMoveOutInspection)(lease, lease.moveOutDate || lease.terminationDate || new Date()).catch((error) => {
                    console.error('Failed to create move-out inspection:', error);
                });
                res.json(lease);
            }
            catch (error) {
                console.error('Error terminating lease:', error);
                res.status(500).json({ error: 'Failed to terminate lease' });
            }
        });
    }
    closeSettlement(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const lease = yield Lease_1.Lease.findById(req.params.id);
                if (!lease) {
                    res.status(404).json({ error: 'Lease not found' });
                    return;
                }
                lease.status = 'closed';
                lease.settlementClosedAt = new Date();
                lease.lifecycleStatusChangedAt = new Date();
                if (lease.depositSettlement) {
                    lease.depositSettlement.settledAt = new Date();
                    lease.depositSettlement.notes = req.body.notes || lease.depositSettlement.notes;
                }
                yield lease.save();
                const activeSuccessor = yield Lease_1.Lease.findOne({
                    propertyId: lease.propertyId,
                    status: { $in: ['active', 'expiring_soon', 'pending_approval'] },
                    _id: { $ne: lease._id }
                });
                if (!activeSuccessor) {
                    yield Property_1.Property.findByIdAndUpdate(lease.propertyId, { status: 'vacant' });
                }
                res.json(lease);
            }
            catch (error) {
                console.error('Error closing settlement:', error);
                res.status(500).json({ error: 'Failed to close lease settlement' });
            }
        });
    }
    createSuccessorLease(previousLease, body) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12, _13, _14, _15, _16, _17, _18, _19, _20, _21, _22, _23, _24;
            const startDate = body.startDate ? new Date(body.startDate) : new Date(previousLease.endDate.getTime() + 24 * 60 * 60 * 1000);
            const endDate = body.endDate ? new Date(body.endDate) : new Date(startDate.getFullYear() + 1, startDate.getMonth(), startDate.getDate() - 1);
            if (startDate >= endDate) {
                throw new Error('Renewal end date must be after start date');
            }
            const successor = yield Lease_1.Lease.create({
                propertyId: body.propertyId || previousLease.propertyId,
                tenantId: body.tenantId || previousLease.tenantId,
                startDate,
                endDate,
                rentAmount: Number((_b = (_a = body.rentAmount) !== null && _a !== void 0 ? _a : body.monthlyRent) !== null && _b !== void 0 ? _b : previousLease.rentAmount),
                depositAmount: Number((_d = (_c = body.depositAmount) !== null && _c !== void 0 ? _c : body.securityDeposit) !== null && _d !== void 0 ? _d : previousLease.depositAmount),
                status: body.status || 'pending_approval',
                companyId: previousLease.companyId,
                ownerId: previousLease.ownerId,
                previousLeaseId: previousLease._id,
                monthlyRent: Number((_g = (_f = (_e = body.monthlyRent) !== null && _e !== void 0 ? _e : body.rentAmount) !== null && _f !== void 0 ? _f : previousLease.monthlyRent) !== null && _g !== void 0 ? _g : previousLease.rentAmount),
                securityDeposit: Number((_k = (_j = (_h = body.securityDeposit) !== null && _h !== void 0 ? _h : body.depositAmount) !== null && _j !== void 0 ? _j : previousLease.securityDeposit) !== null && _k !== void 0 ? _k : previousLease.depositAmount),
                petDeposit: Number((_m = (_l = body.petDeposit) !== null && _l !== void 0 ? _l : previousLease.petDeposit) !== null && _m !== void 0 ? _m : 0),
                isPetAllowed: (_p = (_o = body.isPetAllowed) !== null && _o !== void 0 ? _o : previousLease.isPetAllowed) !== null && _p !== void 0 ? _p : false,
                maxOccupants: Number((_r = (_q = body.maxOccupants) !== null && _q !== void 0 ? _q : previousLease.maxOccupants) !== null && _r !== void 0 ? _r : 1),
                isUtilitiesIncluded: (_t = (_s = body.isUtilitiesIncluded) !== null && _s !== void 0 ? _s : previousLease.isUtilitiesIncluded) !== null && _t !== void 0 ? _t : false,
                utilitiesDetails: (_v = (_u = body.utilitiesDetails) !== null && _u !== void 0 ? _u : previousLease.utilitiesDetails) !== null && _v !== void 0 ? _v : '',
                rentDueDay: Number((_x = (_w = body.rentDueDay) !== null && _w !== void 0 ? _w : previousLease.rentDueDay) !== null && _x !== void 0 ? _x : 1),
                lateFee: Number((_z = (_y = body.lateFee) !== null && _y !== void 0 ? _y : previousLease.lateFee) !== null && _z !== void 0 ? _z : 0),
                gracePeriod: Number((_1 = (_0 = body.gracePeriod) !== null && _0 !== void 0 ? _0 : previousLease.gracePeriod) !== null && _1 !== void 0 ? _1 : 0),
                billingStatus: 'current',
                billingRules: {
                    frequency: 'monthly',
                    rentDueDay: Number((_5 = (_4 = (_2 = body.rentDueDay) !== null && _2 !== void 0 ? _2 : (_3 = previousLease.billingRules) === null || _3 === void 0 ? void 0 : _3.rentDueDay) !== null && _4 !== void 0 ? _4 : previousLease.rentDueDay) !== null && _5 !== void 0 ? _5 : 1),
                    escalationPercent: Number((_8 = (_6 = body.escalationPercent) !== null && _6 !== void 0 ? _6 : (_7 = previousLease.billingRules) === null || _7 === void 0 ? void 0 : _7.escalationPercent) !== null && _8 !== void 0 ? _8 : 0),
                    escalationFrequencyMonths: Number((_11 = (_9 = body.escalationFrequencyMonths) !== null && _9 !== void 0 ? _9 : (_10 = previousLease.billingRules) === null || _10 === void 0 ? void 0 : _10.escalationFrequencyMonths) !== null && _11 !== void 0 ? _11 : 12),
                    nextEscalationDate: body.nextEscalationDate ? new Date(body.nextEscalationDate) : (_12 = previousLease.billingRules) === null || _12 === void 0 ? void 0 : _12.nextEscalationDate,
                    recurringLevies: Number((_15 = (_13 = body.recurringLevies) !== null && _13 !== void 0 ? _13 : (_14 = previousLease.billingRules) === null || _14 === void 0 ? void 0 : _14.recurringLevies) !== null && _15 !== void 0 ? _15 : 0),
                    recurringServiceCharges: Number((_18 = (_16 = body.recurringServiceCharges) !== null && _16 !== void 0 ? _16 : (_17 = previousLease.billingRules) === null || _17 === void 0 ? void 0 : _17.recurringServiceCharges) !== null && _18 !== void 0 ? _18 : 0),
                    prorateMoveIn: (_21 = (_19 = body.prorateMoveIn) !== null && _19 !== void 0 ? _19 : (_20 = previousLease.billingRules) === null || _20 === void 0 ? void 0 : _20.prorateMoveIn) !== null && _21 !== void 0 ? _21 : true,
                },
                financialSummary: {
                    totalBilled: 0,
                    totalPaid: 0,
                    outstandingBalance: 0,
                    depositHeld: Number((_24 = (_23 = (_22 = body.depositAmount) !== null && _22 !== void 0 ? _22 : body.securityDeposit) !== null && _23 !== void 0 ? _23 : previousLease.depositAmount) !== null && _24 !== void 0 ? _24 : 0),
                    penalties: 0,
                    moveOutSettlement: 0,
                },
            });
            previousLease.successorLeaseId = successor._id;
            previousLease.status = 'renewed';
            previousLease.lifecycleStatusChangedAt = new Date();
            yield previousLease.save();
            if (successor.status === 'active' || successor.status === 'pending_approval') {
                (0, inspectionAutomationService_1.ensureLeaseInspectionSchedule)(successor).catch((error) => {
                    console.error('Failed to create renewal inspection schedule:', error);
                });
            }
            return successor;
        });
    }
    // Legacy public endpoint for admin dashboard; now authenticated and company-scoped.
    getLeasesPublic(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const companyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
                if (!companyId) {
                    res.status(401).json({ message: 'Authentication required' });
                    return;
                }
                let query = { companyId };
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
                const leases = yield this.leaseRepository.find(query);
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
    // Legacy public endpoint for getting a single lease by ID.
    getLeaseByIdPublic(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const { id } = req.params;
                const companyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
                if (!companyId) {
                    res.status(401).json({ message: 'Authentication required' });
                    return;
                }
                let query = { _id: id, companyId };
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
