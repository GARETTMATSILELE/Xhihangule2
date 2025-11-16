"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.finalizeProvisionalPayment = exports.getPaymentReceipt = exports.getPaymentReceiptDownload = exports.createPaymentPublic = exports.getPaymentByIdPublic = exports.getPaymentsPublic = exports.updatePaymentStatus = exports.getPaymentDetails = exports.getCompanyPayments = exports.deletePayment = exports.updatePayment = exports.createSalesPaymentAccountant = exports.createPaymentAccountant = exports.createPayment = exports.getPayment = exports.getPayments = exports.getCompanySalesPayments = void 0;
const Payment_1 = require("../models/Payment");
const Notification_1 = require("../models/Notification");
const mongoose_1 = __importDefault(require("mongoose"));
const Lease_1 = require("../models/Lease");
const Property_1 = require("../models/Property");
const User_1 = require("../models/User");
const Company_1 = require("../models/Company");
const SalesContract_1 = require("../models/SalesContract");
const propertyAccountService_1 = __importDefault(require("../services/propertyAccountService"));
const agentAccountService_1 = __importDefault(require("../services/agentAccountService"));
// List sales-only payments for a company
const getCompanySalesPayments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    try {
        const query = { companyId: req.user.companyId, paymentType: 'sale' };
        // Filters
        if (req.query.saleMode === 'quick' || req.query.saleMode === 'installment') {
            query.saleMode = req.query.saleMode;
        }
        if (req.query.status && typeof req.query.status === 'string') {
            query.status = req.query.status;
        }
        if (req.query.paymentMethod && typeof req.query.paymentMethod === 'string') {
            query.paymentMethod = req.query.paymentMethod;
        }
        if (req.query.propertyId && typeof req.query.propertyId === 'string') {
            try {
                query.propertyId = new mongoose_1.default.Types.ObjectId(req.query.propertyId);
            }
            catch (_a) {
                // ignore invalid id
            }
        }
        // Non-development filter: returns only payments not linked to a development
        if (String(req.query.noDevelopment) === 'true') {
            query.$or = [
                { developmentId: { $exists: false } },
                { developmentId: null }
            ];
        }
        // Date filtering
        if (req.query.startDate || req.query.endDate) {
            query.paymentDate = {};
            if (req.query.startDate) {
                query.paymentDate.$gte = new Date(String(req.query.startDate));
            }
            if (req.query.endDate) {
                query.paymentDate.$lte = new Date(String(req.query.endDate));
            }
        }
        const paginate = String(req.query.paginate) === 'true';
        const page = Math.max(1, Number(req.query.page || 1));
        const limit = Math.max(1, Math.min(200, Number(req.query.limit || 25)));
        const skip = (page - 1) * limit;
        // Base query with lean and minimal fields
        const base = Payment_1.Payment.find(query)
            .select({
            paymentType: 1,
            amount: 1,
            currency: 1,
            paymentDate: 1,
            paymentMethod: 1,
            status: 1,
            referenceNumber: 1,
            saleMode: 1,
            developmentId: 1,
            propertyId: 1,
            tenantId: 1,
            manualPropertyAddress: 1,
            createdAt: 1,
            updatedAt: 1,
        })
            .populate('propertyId', 'name address')
            .populate('tenantId', 'firstName lastName')
            .sort({ paymentDate: -1 })
            .lean();
        if (!paginate) {
            const payments = yield base.exec();
            return res.json(payments);
        }
        const [items, total] = yield Promise.all([
            base.skip(skip).limit(limit).exec(),
            Payment_1.Payment.countDocuments(query)
        ]);
        return res.json({
            items,
            total,
            page,
            pages: Math.ceil(total / limit)
        });
    }
    catch (error) {
        console.error('Error fetching sales payments:', error);
        return res.status(500).json({ message: 'Failed to fetch sales payments' });
    }
});
exports.getCompanySalesPayments = getCompanySalesPayments;
const getPayments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    try {
        const payments = yield Payment_1.Payment.find({ companyId: req.user.companyId });
        res.json(payments);
    }
    catch (error) {
        console.error('Error fetching payments:', error);
        res.status(500).json({ message: 'Error fetching payments' });
    }
});
exports.getPayments = getPayments;
const getPayment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    try {
        const payment = yield Payment_1.Payment.findOne({
            _id: req.params.id,
            companyId: req.user.companyId
        });
        if (!payment) {
            return res.status(404).json({ message: 'Payment not found' });
        }
        res.json(payment);
    }
    catch (error) {
        console.error('Error fetching payment:', error);
        res.status(500).json({ message: 'Error fetching payment' });
    }
});
exports.getPayment = getPayment;
const commissionService_1 = require("../services/commissionService");
// Create a new payment (for lease-based payments)
const createPayment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    // Allow Idempotency-Key header as an alternative to body field
    try {
        const headerKey = (req.headers['idempotency-key'] || req.headers['Idempotency-Key']);
        if (headerKey && !req.body.idempotencyKey) {
            req.body.idempotencyKey = String(headerKey);
        }
    }
    catch (_) { }
    try {
        const { leaseId, amount, paymentDate, paymentMethod, status, companyId, rentalPeriodMonth, rentalPeriodYear, advanceMonthsPaid, advancePeriodStart, advancePeriodEnd, } = req.body;
        // Validate required fields
        if (!leaseId || !amount || !paymentDate || !paymentMethod || !status) {
            return res.status(400).json({
                status: 'error',
                message: 'Missing required fields: leaseId, amount, paymentDate, paymentMethod, status',
            });
        }
        // Validate advance payment fields
        if (advanceMonthsPaid && advancePeriodStart && advancePeriodEnd) {
            // Check for overlapping advance payments for this lease
            const overlap = yield Payment_1.Payment.findOne({
                leaseId,
                $or: [
                    {
                        'advancePeriodStart.year': { $lte: advancePeriodEnd.year },
                        'advancePeriodEnd.year': { $gte: advancePeriodStart.year },
                        'advancePeriodStart.month': { $lte: advancePeriodEnd.month },
                        'advancePeriodEnd.month': { $gte: advancePeriodStart.month },
                    },
                    {
                        rentalPeriodYear: { $gte: advancePeriodStart.year, $lte: advancePeriodEnd.year },
                        rentalPeriodMonth: { $gte: advancePeriodStart.month, $lte: advancePeriodEnd.month },
                    }
                ]
            });
            if (overlap) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Overlapping advance payment already exists for this period.'
                });
            }
            // Validate amount
            const lease = yield Lease_1.Lease.findById(leaseId);
            if (lease && amount !== lease.rentAmount * advanceMonthsPaid) {
                return res.status(400).json({
                    status: 'error',
                    message: `Amount must equal rent (${lease.rentAmount}) x months (${advanceMonthsPaid}) = ${lease.rentAmount * advanceMonthsPaid}`
                });
            }
        }
        // Get lease details to extract property and tenant information
        const lease = yield Lease_1.Lease.findById(leaseId);
        if (!lease) {
            return res.status(404).json({
                status: 'error',
                message: 'Lease not found',
            });
        }
        // Get property details
        const property = yield Property_1.Property.findById(lease.propertyId);
        if (!property) {
            return res.status(404).json({
                message: 'Property not found',
            });
        }
        const rent = property.rent || lease.rentAmount;
        // For advance payments spanning multiple months, require full multiple of rent
        if (advanceMonthsPaid && advanceMonthsPaid > 1) {
            const expectedAmount = rent * advanceMonthsPaid;
            if (amount !== expectedAmount) {
                return res.status(400).json({
                    status: 'error',
                    message: `Amount must equal rent (${rent}) x months (${advanceMonthsPaid}) = ${expectedAmount}`
                });
            }
        }
        else {
            // Allow partial payments for a single month up to remaining balance
            const periodFilter = {
                companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId),
                paymentType: 'rental',
                tenantId: lease.tenantId,
                propertyId: lease.propertyId,
                rentalPeriodYear,
                rentalPeriodMonth,
                status: { $in: ['pending', 'completed'] }
            };
            const [agg] = yield Payment_1.Payment.aggregate([
                { $match: periodFilter },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]);
            const alreadyPaidCents = Math.round(((agg === null || agg === void 0 ? void 0 : agg.total) || 0) * 100);
            const rentCents = Math.round((rent || 0) * 100);
            const remainingCents = rentCents - alreadyPaidCents;
            if (remainingCents <= 0) {
                return res.status(409).json({ status: 'error', message: 'This month is fully paid. Change rental month.' });
            }
            const amountCents = Math.round((amount || 0) * 100);
            if (amountCents > remainingCents) {
                return res.status(400).json({ status: 'error', message: `Only ${(remainingCents / 100).toFixed(2)} remains for this month. Enter an amount ≤ remaining.` });
            }
        }
        // Idempotency check (optional client-provided key)
        if (req.body.idempotencyKey) {
            const dup = yield Payment_1.Payment.findOne({
                companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId),
                idempotencyKey: String(req.body.idempotencyKey)
            }).lean();
            if (dup) {
                return res.status(200).json({ message: 'Payment processed successfully', payment: dup });
            }
        }
        // Calculate commission based on property commission percentage and company config
        const paymentCommissionDetails = yield commissionService_1.CommissionService.calculate(amount, property.commission || 0, new mongoose_1.default.Types.ObjectId(req.user.companyId));
        // Create payment record
        const payment = new Payment_1.Payment({
            amount,
            paymentDate,
            paymentMethod,
            status,
            companyId: companyId || lease.companyId,
            paymentType: 'rental',
            propertyType: 'residential', // Default value
            propertyId: lease.propertyId,
            tenantId: lease.tenantId,
            agentId: lease.tenantId, // Use tenant ID as agent ID since lease doesn't have agentId
            processedBy: lease.tenantId, // Use tenant ID as processedBy since no agent ID
            depositAmount: 0, // Default value
            rentalPeriodMonth,
            rentalPeriodYear,
            advanceMonthsPaid,
            advancePeriodStart,
            advancePeriodEnd,
            referenceNumber: '', // Placeholder, will update after save
            notes: '', // Default empty notes
            commissionDetails: paymentCommissionDetails,
            rentUsed: rent, // Store the rent used for this payment
            idempotencyKey: req.body.idempotencyKey ? String(req.body.idempotencyKey) : undefined,
        });
        yield payment.save();
        // Generate reference number after save (using payment._id)
        payment.referenceNumber = `RCPT-${payment._id.toString().slice(-6).toUpperCase()}-${rentalPeriodYear}-${String(rentalPeriodMonth).padStart(2, '0')}`;
        yield payment.save();
        // If depositAmount > 0, record in rentaldeposits
        if (payment.depositAmount && payment.depositAmount > 0) {
            const { RentalDeposit } = require('../models/rentalDeposit');
            yield RentalDeposit.create({
                propertyId: payment.propertyId,
                agentId: payment.agentId,
                companyId: payment.companyId,
                tenantId: payment.tenantId,
                depositAmount: payment.depositAmount,
                depositDate: payment.paymentDate,
                paymentId: payment._id,
            });
        }
        // Update company revenue
        yield Company_1.Company.findByIdAndUpdate(companyId || lease.companyId, {
            $inc: {
                revenue: paymentCommissionDetails.agencyShare,
            },
        });
        // Sync commission from saved payment (SSOT)
        yield agentAccountService_1.default.syncCommissionForPayment(payment._id.toString());
        // If it's a rental payment, update property owner's balance
        if (property.ownerId) {
            yield User_1.User.findByIdAndUpdate(property.ownerId, {
                $inc: {
                    balance: paymentCommissionDetails.ownerAmount,
                },
            });
        }
        // Ensure owner income is recorded in property ledger (enqueue retry on failure)
        try {
            yield propertyAccountService_1.default.recordIncomeFromPayment(payment._id.toString());
        }
        catch (e) {
            try {
                const ledgerEventService = (yield Promise.resolve().then(() => __importStar(require('../services/ledgerEventService')))).default;
                yield ledgerEventService.enqueueOwnerIncomeEvent(payment._id.toString());
            }
            catch (_a) { }
            console.warn('Non-fatal: property account record failed (lease-based create), enqueued for retry', (e === null || e === void 0 ? void 0 : e.message) || e);
        }
        // Update property arrears after payment
        if (property.currentArrears !== undefined) {
            const arrears = property.currentArrears - amount;
            yield Property_1.Property.findByIdAndUpdate(property._id, { currentArrears: arrears < 0 ? 0 : arrears });
        }
        res.status(201).json({
            message: 'Payment processed successfully',
            payment,
        });
    }
    catch (error) {
        console.error('Error processing payment:', error);
        res.status(500).json({
            message: 'Failed to process payment',
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
exports.createPayment = createPayment;
// Create a new payment (for accountant dashboard - handles PaymentFormData structure)
const createPaymentAccountant = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (!req.user) {
        return res.status(401).json({ message: 'Authentication required' });
    }
    const currentUser = req.user;
    // Allow Idempotency-Key header as an alternative to body field
    try {
        const headerKey = (req.headers['idempotency-key'] || req.headers['Idempotency-Key']);
        if (headerKey && !req.body.idempotencyKey) {
            req.body.idempotencyKey = String(headerKey);
        }
    }
    catch (_) { }
    // Helper to perform the actual create logic, with optional transaction session
    const performCreate = (user, session) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        const { paymentType, propertyType, paymentDate, paymentMethod, amount, depositAmount, referenceNumber, notes, currency, rentalPeriodMonth, rentalPeriodYear, rentUsed, commissionDetails, manualPropertyAddress, manualTenantName, } = req.body;
        // Extract optional advance fields
        const { advanceMonthsPaid, advancePeriodStart, advancePeriodEnd } = req.body;
        // Safely extract ids (string or nested {_id})
        const extractId = (v) => {
            if (!v)
                return undefined;
            if (typeof v === 'string')
                return v;
            if (typeof v === 'object' && (v._id || v.id))
                return v._id || v.id;
            return undefined;
        };
        const rawPropertyId = extractId(req.body.propertyId);
        const rawTenantId = extractId(req.body.tenantId);
        const rawAgentId = extractId(req.body.agentId) || user.userId;
        const rawProcessedBy = extractId(req.body.processedBy) || user.userId;
        const rawLeaseId = extractId(req.body.leaseId);
        const rawOwnerId = extractId(req.body.ownerId);
        const rawSaleId = extractId(req.body.saleId);
        // Validate required fields
        if (!amount || !paymentDate) {
            return { error: { status: 400, message: 'Missing required fields: amount and paymentDate' } };
        }
        // Check if using manual entries
        const manualProperty = typeof rawPropertyId === 'string' && rawPropertyId.startsWith('manual_');
        const manualTenant = typeof rawTenantId === 'string' && rawTenantId.startsWith('manual_');
        // Validate manual entries
        if (manualProperty && !manualPropertyAddress) {
            return { error: { status: 400, message: 'Manual property address is required when using manual property entry' } };
        }
        if (manualTenant && !manualTenantName) {
            return { error: { status: 400, message: 'Manual tenant name is required when using manual tenant entry' } };
        }
        // Validate that either propertyId/tenantId are provided or manual entries are used
        if (!rawPropertyId && !manualPropertyAddress) {
            return { error: { status: 400, message: 'Either propertyId or manual property address is required' } };
        }
        if (!rawTenantId && !manualTenantName) {
            return { error: { status: 400, message: 'Either tenantId or manual tenant name is required' } };
        }
        // Validate ObjectId formats when not manual
        if (!manualProperty && rawPropertyId && !mongoose_1.default.Types.ObjectId.isValid(rawPropertyId)) {
            return { error: { status: 400, message: 'Invalid propertyId format' } };
        }
        if (!manualTenant && rawTenantId && !mongoose_1.default.Types.ObjectId.isValid(rawTenantId)) {
            return { error: { status: 400, message: 'Invalid tenantId format' } };
        }
        if (rawAgentId && !mongoose_1.default.Types.ObjectId.isValid(rawAgentId)) {
            return { error: { status: 400, message: 'Invalid agentId format' } };
        }
        if (rawProcessedBy && !mongoose_1.default.Types.ObjectId.isValid(rawProcessedBy)) {
            return { error: { status: 400, message: 'Invalid processedBy format' } };
        }
        if (rawLeaseId && !mongoose_1.default.Types.ObjectId.isValid(rawLeaseId)) {
            return { error: { status: 400, message: 'Invalid leaseId format' } };
        }
        if (rawSaleId && !mongoose_1.default.Types.ObjectId.isValid(rawSaleId)) {
            return { error: { status: 400, message: 'Invalid saleId format' } };
        }
        if (rawOwnerId && !mongoose_1.default.Types.ObjectId.isValid(rawOwnerId)) {
            return { error: { status: 400, message: 'Invalid ownerId format' } };
        }
        // Calculate commission if not provided
        let finalCommissionDetails = commissionDetails;
        if (!finalCommissionDetails) {
            try {
                // Use property's current commission percent when a real property is provided
                if (!manualProperty && rawPropertyId) {
                    const prop = yield Property_1.Property.findById(new mongoose_1.default.Types.ObjectId(rawPropertyId));
                    const commissionPercent = typeof (prop === null || prop === void 0 ? void 0 : prop.commission) === 'number'
                        ? prop.commission
                        : ((propertyType || 'residential') === 'residential' ? 15 : 10);
                    finalCommissionDetails = (yield commissionService_1.CommissionService.calculate(amount, commissionPercent, new mongoose_1.default.Types.ObjectId(user.companyId)));
                }
                else {
                    // Manual entries have no linked property; fall back to default base rates
                    const commissionPercent = (propertyType || 'residential') === 'residential' ? 15 : 10;
                    finalCommissionDetails = (yield commissionService_1.CommissionService.calculate(amount, commissionPercent, new mongoose_1.default.Types.ObjectId(user.companyId)));
                }
            }
            catch (err) {
                // As a safety net, fall back to default split if anything goes wrong
                const baseCommissionRate = (propertyType || 'residential') === 'residential' ? 15 : 10;
                const { totalCommission, preaFee, agentShare, agencyShare, ownerAmount } = (yield Promise.resolve().then(() => __importStar(require('../utils/money')))).computeCommissionFallback(amount, baseCommissionRate);
                finalCommissionDetails = {
                    totalCommission,
                    preaFee,
                    agentShare,
                    agencyShare,
                    ownerAmount,
                };
            }
        }
        // Remaining-balance enforcement for rental payments (single month or advance)
        if ((paymentType || 'rental') === 'rental') {
            const tenantObjectId = manualTenant ? undefined : (rawTenantId ? new mongoose_1.default.Types.ObjectId(rawTenantId) : undefined);
            const propertyObjectId = manualProperty ? undefined : (rawPropertyId ? new mongoose_1.default.Types.ObjectId(rawPropertyId) : undefined);
            // Only enforce when both real tenant and property are present
            if (tenantObjectId && propertyObjectId && rentalPeriodMonth && rentalPeriodYear) {
                const [agg] = yield Payment_1.Payment.aggregate([
                    {
                        $match: {
                            companyId: new mongoose_1.default.Types.ObjectId(user.companyId),
                            paymentType: 'rental',
                            tenantId: tenantObjectId,
                            propertyId: propertyObjectId,
                            rentalPeriodYear,
                            rentalPeriodMonth,
                            status: { $in: ['pending', 'completed'] }
                        }
                    },
                    { $group: { _id: null, total: { $sum: '$amount' } } }
                ]);
                const rentBaseline = typeof rentUsed === 'number' ? rentUsed : (() => {
                    const fallback = 0;
                    return fallback;
                })();
                // If commissionDetails was computed above and property was fetched, prefer rentUsed or compute from property when possible
                const rentCents = Math.round((rentBaseline || 0) * 100);
                const alreadyPaidCents = Math.round(((agg === null || agg === void 0 ? void 0 : agg.total) || 0) * 100);
                const remainingCents = rentCents - alreadyPaidCents;
                if (rentCents > 0) {
                    if (remainingCents <= 0) {
                        return { error: { status: 409, message: 'This month is fully paid. Change rental month.' } };
                    }
                    const amountCents = Math.round((amount || 0) * 100);
                    if (amountCents > remainingCents) {
                        return { error: { status: 400, message: `Only ${(remainingCents / 100).toFixed(2)} remains for this month. Enter an amount ≤ remaining.` } };
                    }
                }
            }
        }
        // Idempotency: short-circuit on duplicate key
        if (req.body.idempotencyKey) {
            const existing = yield Payment_1.Payment.findOne({ companyId: new mongoose_1.default.Types.ObjectId(user.companyId), idempotencyKey: String(req.body.idempotencyKey) }).lean();
            if (existing) {
                return { payment: existing };
            }
        }
        // Determine provisional flags
        const markProvisional = Boolean(manualProperty || manualTenant);
        // Create payment record
        const payment = new Payment_1.Payment({
            paymentType: paymentType || 'rental',
            propertyType: propertyType || 'residential',
            propertyId: manualProperty ? new mongoose_1.default.Types.ObjectId() : new mongoose_1.default.Types.ObjectId(rawPropertyId), // Generate new ID for manual entries
            tenantId: manualTenant ? new mongoose_1.default.Types.ObjectId() : new mongoose_1.default.Types.ObjectId(rawTenantId), // Generate new ID for manual entries
            agentId: new mongoose_1.default.Types.ObjectId(rawAgentId),
            companyId: new mongoose_1.default.Types.ObjectId(user.companyId),
            paymentDate: new Date(paymentDate),
            paymentMethod,
            amount,
            depositAmount: depositAmount || 0,
            rentalPeriodMonth,
            rentalPeriodYear,
            referenceNumber: referenceNumber || `RCPT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            notes: notes || '',
            processedBy: new mongoose_1.default.Types.ObjectId(rawProcessedBy),
            commissionDetails: finalCommissionDetails,
            status: 'completed',
            currency: currency || 'USD',
            leaseId: rawLeaseId ? new mongoose_1.default.Types.ObjectId(rawLeaseId) : undefined,
            rentUsed,
            advanceMonthsPaid: advanceMonthsPaid || 1,
            advancePeriodStart: advanceMonthsPaid && advanceMonthsPaid > 1 ? advancePeriodStart : undefined,
            advancePeriodEnd: advanceMonthsPaid && advanceMonthsPaid > 1 ? advancePeriodEnd : undefined,
            // Add manual entry fields
            manualPropertyAddress: manualProperty ? manualPropertyAddress : undefined,
            manualTenantName: manualTenant ? manualTenantName : undefined,
            // Provisional flags
            isProvisional: markProvisional,
            isInSuspense: markProvisional,
            commissionFinalized: !markProvisional,
            provisionalRelationshipType: markProvisional ? 'unknown' : undefined,
            idempotencyKey: req.body.idempotencyKey ? String(req.body.idempotencyKey) : undefined,
            saleId: rawSaleId ? new mongoose_1.default.Types.ObjectId(rawSaleId) : undefined,
        });
        // Save and related updates (with or without session)
        yield payment.save(session ? { session } : undefined);
        // If depositAmount > 0, record in rentaldeposits (ledger)
        if (payment.depositAmount && payment.depositAmount > 0) {
            const { RentalDeposit } = yield Promise.resolve().then(() => __importStar(require('../models/rentalDeposit')));
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
            yield deposit.save(session ? { session } : undefined);
        }
        // Post company revenue and sync agent commission only if not provisional
        if (!payment.isProvisional) {
            yield Company_1.Company.findByIdAndUpdate(new mongoose_1.default.Types.ObjectId(user.companyId), { $inc: { revenue: finalCommissionDetails.agencyShare } }, session ? { session } : undefined);
            yield agentAccountService_1.default.syncCommissionForPayment(payment._id.toString());
        }
        if (!payment.isProvisional) {
            if (paymentType === 'rental' && rawOwnerId) {
                yield User_1.User.findByIdAndUpdate(new mongoose_1.default.Types.ObjectId(rawOwnerId), { $inc: { balance: finalCommissionDetails.ownerAmount } }, session ? { session } : undefined);
            }
        }
        try {
            // Skip recording income in property accounts until finalized if provisional
            if (!payment.isProvisional) {
                yield propertyAccountService_1.default.recordIncomeFromPayment(payment._id.toString());
            }
        }
        catch (error) {
            try {
                const ledgerEventService = (yield Promise.resolve().then(() => __importStar(require('../services/ledgerEventService')))).default;
                yield ledgerEventService.enqueueOwnerIncomeEvent(payment._id.toString());
            }
            catch (_b) { }
            console.error('Failed to record income in property account, enqueued for retry:', error);
        }
        // Notify the primary agent (and split participants) when a completed sale payment is created
        try {
            if (!payment.isProvisional && payment.paymentType === 'sale') {
                const recipientIds = new Set();
                if (payment.agentId)
                    recipientIds.add(String(payment.agentId));
                const split = ((_a = (payment.commissionDetails || req.body.commissionDetails || {})) === null || _a === void 0 ? void 0 : _a.agentSplit) || {};
                if (split.ownerUserId)
                    recipientIds.add(String(split.ownerUserId));
                if (split.collaboratorUserId)
                    recipientIds.add(String(split.collaboratorUserId));
                const docs = Array.from(recipientIds).map((uid) => ({
                    companyId: String(req.user.companyId),
                    userId: new mongoose_1.default.Types.ObjectId(uid),
                    title: 'Sale payment recorded',
                    message: `Reference ${payment.referenceNumber} · Amount ${payment.amount} ${payment.currency || 'USD'}`,
                    link: '/sales-dashboard/notifications',
                    payload: { paymentId: payment._id, paymentType: payment.paymentType }
                }));
                if (docs.length) {
                    const saved = yield Notification_1.Notification.insertMany(docs);
                    try {
                        const { getIo } = yield Promise.resolve().then(() => __importStar(require('../config/socket')));
                        const io = getIo();
                        if (io) {
                            for (const n of saved) {
                                io.to(`user-${String(n.userId)}`).emit('newNotification', n);
                            }
                        }
                    }
                    catch (_c) { }
                }
            }
        }
        catch (e) {
            console.warn('Non-fatal: failed to create agent notification for payment', e);
        }
        return { payment };
    });
    let session = null;
    let useTransaction = false;
    try {
        // Try to use a transaction; if unsupported, we will fallback
        try {
            session = yield mongoose_1.default.startSession();
            session.startTransaction();
            useTransaction = true;
        }
        catch (e) {
            console.warn('Transactions not supported or failed to start. Proceeding without transaction.', e);
        }
        const result = yield performCreate(currentUser, session || undefined);
        if ('error' in result && result.error) {
            return res.status(result.error.status).json({ message: result.error.message });
        }
        if (useTransaction && session) {
            yield session.commitTransaction();
        }
        if ('payment' in result) {
            return res.status(201).json({
                message: 'Payment processed successfully',
                payment: result.payment,
            });
        }
        return res.status(500).json({ message: 'Unknown error creating payment' });
    }
    catch (error) {
        if (useTransaction && session) {
            try {
                yield session.abortTransaction();
            }
            catch (_a) { }
        }
        // Fallback: if error is due to transactions not supported, retry without session
        if ((error === null || error === void 0 ? void 0 : error.code) === 20 /* IllegalOperation */ || /Transaction numbers are only allowed/.test(String(error === null || error === void 0 ? void 0 : error.message))) {
            try {
                const result = yield performCreate(currentUser);
                if ('error' in result && result.error) {
                    return res.status(result.error.status).json({ message: result.error.message });
                }
                if ('payment' in result) {
                    return res.status(201).json({
                        message: 'Payment processed successfully',
                        payment: result.payment,
                    });
                }
                return res.status(500).json({ message: 'Unknown error creating payment' });
            }
            catch (fallbackErr) {
                console.error('Fallback create payment failed:', fallbackErr);
                return res.status(500).json({
                    message: 'Failed to process payment',
                    error: fallbackErr instanceof Error ? fallbackErr.message : 'Unknown error',
                });
            }
        }
        console.error('Error processing payment:', error);
        return res.status(500).json({
            message: 'Failed to process payment',
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
    finally {
        if (session) {
            try {
                session.endSession();
            }
            catch (_b) { }
        }
    }
});
exports.createPaymentAccountant = createPaymentAccountant;
// Create a sales payment explicitly (no rental validations, paymentType fixed to 'introduction')
const createSalesPaymentAccountant = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    if (!req.user) {
        return res.status(401).json({ message: 'Authentication required' });
    }
    try {
        const user = req.user;
        const { paymentDate, paymentMethod, amount, referenceNumber, notes, currency, commissionDetails, manualPropertyAddress, manualTenantName, buyerName, sellerName, propertyId, tenantId, agentId, processedBy, saleId, rentalPeriodMonth, rentalPeriodYear, saleMode, developmentId, developmentUnitId } = req.body;
        if (!amount || !paymentDate || !paymentMethod) {
            return res.status(400).json({ message: 'Missing required fields: amount, paymentDate, paymentMethod' });
        }
        const toObjectId = (v) => (v && mongoose_1.default.Types.ObjectId.isValid(v) ? new mongoose_1.default.Types.ObjectId(v) : undefined);
        const propId = toObjectId(propertyId);
        const tenId = toObjectId(tenantId);
        // Prefer explicit agentId when provided. For non-development sales, fallback to property's assigned agent.
        // Avoid blindly defaulting to the current user for sales to prevent mis-crediting commissions.
        let agId = toObjectId(agentId);
        const procBy = toObjectId(processedBy) || new mongoose_1.default.Types.ObjectId(user.userId);
        const saleObjId = toObjectId(saleId);
        const devId = toObjectId(developmentId);
        const unitId = toObjectId(developmentUnitId);
        // If no agent provided and this is a non-development sale, try to derive from property
        if (!agId && !devId && propId) {
            try {
                const prop = yield Property_1.Property.findById(propId).select('agentId').lean();
                if (prop && prop.agentId) {
                    agId = new mongoose_1.default.Types.ObjectId(String(prop.agentId));
                }
            }
            catch (_e) {
                // ignore and enforce requirement below
            }
        }
        // Require an explicit/derived agent for non-development sales to ensure commission is credited correctly
        if (!agId) {
            return res.status(400).json({ message: 'Sales agent is required for this sale payment' });
        }
        // Optional validation: if development/unit provided, ensure they belong to the same company and match
        let devAddressForManual;
        if (devId) {
            const dev = yield (yield Promise.resolve().then(() => __importStar(require('../models/Development')))).Development.findOne({ _id: devId, companyId: new mongoose_1.default.Types.ObjectId(user.companyId) }).lean();
            if (!dev) {
                return res.status(400).json({ message: 'Invalid developmentId' });
            }
            // Enforce createdBy exists (owner) and the agent is either owner or collaborator
            const devOwnerUserId = dev.createdBy ? new mongoose_1.default.Types.ObjectId(dev.createdBy) : undefined;
            if (!devOwnerUserId) {
                return res.status(400).json({ message: 'Development owner not set; cannot process sales payment' });
            }
            const isOwnerAgent = String(devOwnerUserId) === String(agId);
            const isCollabAgent = Array.isArray(dev.collaborators) && dev.collaborators.map(String).includes(String(agId));
            if (!isOwnerAgent && !isCollabAgent) {
                return res.status(400).json({ message: 'Agent must be development owner or collaborator to process sale for this development' });
            }
            devAddressForManual = [dev.name, dev.address].filter(Boolean).join(' - ');
            if (unitId) {
                const unit = yield (yield Promise.resolve().then(() => __importStar(require('../models/DevelopmentUnit')))).DevelopmentUnit.findOne({ _id: unitId, developmentId: devId }).lean();
                if (!unit) {
                    return res.status(400).json({ message: 'Selected unit does not belong to the selected development' });
                }
            }
        }
        else if (unitId) {
            // If only unitId provided, still verify it exists and derive development for consistency
            const unit = yield (yield Promise.resolve().then(() => __importStar(require('../models/DevelopmentUnit')))).DevelopmentUnit.findOne({ _id: unitId }).lean();
            if (!unit) {
                return res.status(400).json({ message: 'Invalid developmentUnitId' });
            }
            const dev = yield (yield Promise.resolve().then(() => __importStar(require('../models/Development')))).Development.findOne({ _id: unit.developmentId, companyId: new mongoose_1.default.Types.ObjectId(user.companyId) }).lean();
            if (!dev) {
                return res.status(400).json({ message: 'Unit belongs to a development not accessible in this company' });
            }
            devAddressForManual = [dev.name, dev.address].filter(Boolean).join(' - ');
        }
        // Calculate commission if not provided
        let finalCommissionDetails = commissionDetails;
        if (!finalCommissionDetails) {
            try {
                let percent = 15;
                if (propId) {
                    const prop = yield Property_1.Property.findById(propId);
                    percent = typeof (prop === null || prop === void 0 ? void 0 : prop.commission) === 'number' ? prop.commission : 15;
                }
                finalCommissionDetails = (yield commissionService_1.CommissionService.calculate(amount, percent, new mongoose_1.default.Types.ObjectId(user.companyId)));
            }
            catch (_f) {
                const fallback = (yield Promise.resolve().then(() => __importStar(require('../utils/money')))).computeCommissionFallback(amount, 15);
                finalCommissionDetails = {
                    totalCommission: fallback.totalCommission,
                    preaFee: fallback.preaFee,
                    agentShare: fallback.agentShare,
                    agencyShare: fallback.agencyShare,
                    ownerAmount: fallback.ownerAmount,
                };
            }
        }
        // Apply VAT on commission for sales using company-configured rate (default 15%)
        {
            const company = yield Company_1.Company.findById(new mongoose_1.default.Types.ObjectId(user.companyId)).lean();
            const configuredVat = Number((_b = (_a = company === null || company === void 0 ? void 0 : company.commissionConfig) === null || _a === void 0 ? void 0 : _a.vatPercentOnCommission) !== null && _b !== void 0 ? _b : 0.15);
            const vatRate = Math.max(0, Math.min(1, Number.isFinite(configuredVat) ? configuredVat : 0.15));
            const commissionBase = Number((finalCommissionDetails === null || finalCommissionDetails === void 0 ? void 0 : finalCommissionDetails.totalCommission) || 0);
            const vatOnCommission = Number((commissionBase * vatRate).toFixed(2));
            finalCommissionDetails.vatOnCommission = vatOnCommission;
            finalCommissionDetails.ownerAmount = Number((amount - commissionBase - vatOnCommission).toFixed(2));
        }
        // If development and agent are provided, and the agent is a collaborator on that development,
        // split the agentShare between development owner (creator) and the collaborator using development's split config.
        // If the agent is the owner, 100% of agentShare goes to owner by default.
        let ownerAgentIncrement = 0;
        let collaboratorAgentIncrement = 0;
        if (devId && agId) {
            const dev = yield (yield Promise.resolve().then(() => __importStar(require('../models/Development')))).Development.findOne({ _id: devId, companyId: new mongoose_1.default.Types.ObjectId(user.companyId) }).lean();
            if (dev) {
                const devOwnerUserId = dev.createdBy ? new mongoose_1.default.Types.ObjectId(dev.createdBy) : undefined;
                const isOwnerAgent = devOwnerUserId && (String(devOwnerUserId) === String(agId));
                const isCollaborator = Array.isArray(dev.collaborators) && dev.collaborators.map(String).includes(String(agId));
                if (isOwnerAgent) {
                    // Entire agentShare to owner
                    const agentShare = finalCommissionDetails.agentShare || 0;
                    finalCommissionDetails.agentSplit = {
                        ownerAgentShare: agentShare,
                        collaboratorAgentShare: 0,
                        ownerUserId: devOwnerUserId,
                        collaboratorUserId: undefined,
                        splitPercentOwner: 100,
                        splitPercentCollaborator: 0
                    };
                    ownerAgentIncrement = agentShare;
                    collaboratorAgentIncrement = 0;
                }
                else if (isCollaborator && devOwnerUserId) {
                    const agentShare = finalCommissionDetails.agentShare || 0;
                    const ownerPct = Math.max(0, Math.min(100, Number((_c = dev.collabOwnerAgentPercent) !== null && _c !== void 0 ? _c : 50)));
                    const collabPct = Math.max(0, Math.min(100, Number((_d = dev.collabCollaboratorAgentPercent) !== null && _d !== void 0 ? _d : (100 - ownerPct))));
                    const ownerShare = agentShare * (ownerPct / 100);
                    const collaboratorShare = agentShare * (collabPct / 100);
                    // Record split details
                    finalCommissionDetails.agentSplit = {
                        ownerAgentShare: ownerShare,
                        collaboratorAgentShare: collaboratorShare,
                        ownerUserId: devOwnerUserId,
                        collaboratorUserId: agId,
                        splitPercentOwner: ownerPct,
                        splitPercentCollaborator: collabPct
                    };
                    ownerAgentIncrement = ownerShare;
                    collaboratorAgentIncrement = collaboratorShare;
                    // Ensure agentShare stays the same total (owner+collaborator)
                    finalCommissionDetails.agentShare = ownerShare + collaboratorShare;
                }
            }
        }
        const manualProperty = !propId && manualPropertyAddress;
        const manualTenant = !tenId && manualTenantName;
        // Sanitize agentSplit: keep only for valid development splits; remove for non-development or empty splits
        try {
            if (!devId && (finalCommissionDetails === null || finalCommissionDetails === void 0 ? void 0 : finalCommissionDetails.agentSplit)) {
                delete finalCommissionDetails.agentSplit;
            }
            else if (finalCommissionDetails === null || finalCommissionDetails === void 0 ? void 0 : finalCommissionDetails.agentSplit) {
                const split = finalCommissionDetails.agentSplit;
                const ownerAmtOk = Number((split === null || split === void 0 ? void 0 : split.ownerAgentShare) || 0) > 0 && !!(split === null || split === void 0 ? void 0 : split.ownerUserId);
                const collabAmtOk = Number((split === null || split === void 0 ? void 0 : split.collaboratorAgentShare) || 0) > 0 && !!(split === null || split === void 0 ? void 0 : split.collaboratorUserId);
                if (!ownerAmtOk && !collabAmtOk) {
                    delete finalCommissionDetails.agentSplit;
                }
            }
        }
        catch ( /* no-op */_g) { /* no-op */ }
        const jsDate = new Date(paymentDate);
        const periodMonth = Number(rentalPeriodMonth !== null && rentalPeriodMonth !== void 0 ? rentalPeriodMonth : (jsDate.getMonth() + 1));
        const periodYear = Number(rentalPeriodYear !== null && rentalPeriodYear !== void 0 ? rentalPeriodYear : jsDate.getFullYear());
        const payment = new Payment_1.Payment({
            paymentType: 'sale',
            saleMode: (saleMode === 'installment' ? 'installment' : 'quick'),
            propertyType: 'residential',
            propertyId: propId || new mongoose_1.default.Types.ObjectId(),
            tenantId: tenId || new mongoose_1.default.Types.ObjectId(),
            agentId: agId,
            companyId: new mongoose_1.default.Types.ObjectId(user.companyId),
            paymentDate: new Date(paymentDate),
            paymentMethod,
            amount,
            depositAmount: 0,
            referenceNumber: referenceNumber || `SALE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            notes: notes || '',
            processedBy: procBy,
            commissionDetails: finalCommissionDetails,
            status: 'completed',
            currency: currency || 'USD',
            rentalPeriodMonth: periodMonth,
            rentalPeriodYear: periodYear,
            // Manual fields
            manualPropertyAddress: manualProperty ? (manualPropertyAddress || devAddressForManual) : (devAddressForManual || undefined),
            manualTenantName: manualTenant ? manualTenantName : undefined,
            buyerName: buyerName || (manualTenant ? manualTenantName : undefined),
            sellerName: sellerName,
            // Sales linkage
            saleId: saleObjId,
            developmentId: devId,
            developmentUnitId: unitId
        });
        yield payment.save();
        // Post company revenue and sync agent commission(s)
        try {
            yield Company_1.Company.findByIdAndUpdate(new mongoose_1.default.Types.ObjectId(user.companyId), { $inc: { revenue: finalCommissionDetails.agencyShare || 0 } });
            yield agentAccountService_1.default.syncCommissionForPayment(payment._id.toString());
        }
        catch (e) {
            console.warn('Non-fatal: commission posting failed', e);
        }
        // Record income in property accounts
        try {
            yield propertyAccountService_1.default.recordIncomeFromPayment(payment._id.toString());
        }
        catch (e) {
            try {
                const ledgerEventService = (yield Promise.resolve().then(() => __importStar(require('../services/ledgerEventService')))).default;
                yield ledgerEventService.enqueueOwnerIncomeEvent(payment._id.toString());
            }
            catch (_h) { }
            console.warn('Non-fatal: property account record failed (sales), enqueued for retry', e);
        }
        // Notify the primary agent and split participants for completed sale payment
        try {
            const recipientIds = new Set();
            if (payment.agentId)
                recipientIds.add(String(payment.agentId));
            const split = (finalCommissionDetails === null || finalCommissionDetails === void 0 ? void 0 : finalCommissionDetails.agentSplit) || {};
            if (split.ownerUserId)
                recipientIds.add(String(split.ownerUserId));
            if (split.collaboratorUserId)
                recipientIds.add(String(split.collaboratorUserId));
            const docs = Array.from(recipientIds).map((uid) => ({
                companyId: String(user.companyId),
                userId: new mongoose_1.default.Types.ObjectId(uid),
                title: 'Sale payment recorded',
                message: `Reference ${payment.referenceNumber} · Amount ${payment.amount} ${payment.currency || 'USD'}`,
                link: '/sales-dashboard/notifications',
                payload: { paymentId: payment._id, paymentType: payment.paymentType }
            }));
            if (docs.length) {
                const saved = yield Notification_1.Notification.insertMany(docs);
                try {
                    const { getIo } = yield Promise.resolve().then(() => __importStar(require('../config/socket')));
                    const io = getIo();
                    if (io) {
                        for (const n of saved) {
                            io.to(`user-${String(n.userId)}`).emit('newNotification', n);
                        }
                    }
                }
                catch (_j) { }
            }
        }
        catch (e) {
            console.warn('Non-fatal: failed to create agent notification for sale payment', e);
        }
        return res.status(201).json({ message: 'Sales payment processed successfully', payment });
    }
    catch (error) {
        console.error('Error creating sales payment:', error);
        return res.status(500).json({ message: 'Failed to process sales payment', error: (error === null || error === void 0 ? void 0 : error.message) || 'Unknown error' });
    }
});
exports.createSalesPaymentAccountant = createSalesPaymentAccountant;
const updatePayment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    try {
        const payment = yield Payment_1.Payment.findOneAndUpdate({
            _id: req.params.id,
            companyId: req.user.companyId
        }, req.body, { new: true });
        if (!payment) {
            return res.status(404).json({ message: 'Payment not found' });
        }
        res.json(payment);
    }
    catch (error) {
        console.error('Error updating payment:', error);
        res.status(500).json({ message: 'Error updating payment' });
    }
});
exports.updatePayment = updatePayment;
const deletePayment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    try {
        const payment = yield Payment_1.Payment.findOneAndDelete({
            _id: req.params.id,
            companyId: req.user.companyId
        });
        if (!payment) {
            return res.status(404).json({ message: 'Payment not found' });
        }
        res.json({ message: 'Payment deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting payment:', error);
        res.status(500).json({ message: 'Error deleting payment' });
    }
});
exports.deletePayment = deletePayment;
// Get all payments for a company
const getCompanyPayments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    try {
        const query = { companyId: req.user.companyId };
        // Exclude provisional from company payments by default (visible in accountant page via dedicated filters)
        if (req.query.includeProvisional !== 'true') {
            query.isProvisional = { $ne: true };
        }
        // Optional: filter for deposits only
        if (req.query.onlyDeposits === 'true') {
            query.depositAmount = { $gt: 0 };
        }
        // Date filtering
        if (req.query.startDate || req.query.endDate) {
            query.paymentDate = {};
            if (req.query.startDate) {
                query.paymentDate.$gte = new Date(String(req.query.startDate));
            }
            if (req.query.endDate) {
                query.paymentDate.$lte = new Date(String(req.query.endDate));
            }
        }
        // Status filter
        if (req.query.status) {
            query.status = req.query.status;
        }
        // Payment method filter
        if (req.query.paymentMethod) {
            query.paymentMethod = req.query.paymentMethod;
        }
        // Property filter
        if (req.query.propertyId) {
            try {
                query.propertyId = new mongoose_1.default.Types.ObjectId(String(req.query.propertyId));
            }
            catch (_a) {
                // ignore invalid id
            }
        }
        // Pagination controls
        const paginate = String(req.query.paginate || 'false') === 'true';
        const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
        const limit = Math.max(1, Math.min(200, parseInt(String(req.query.limit || '25'), 10)));
        const baseQuery = Payment_1.Payment.find(query).sort({ paymentDate: -1 });
        if (paginate) {
            const [items, total] = yield Promise.all([
                baseQuery
                    .select('paymentDate paymentType propertyId amount paymentMethod status referenceNumber currency tenantId isProvisional manualPropertyAddress manualTenantName rentalPeriodMonth rentalPeriodYear')
                    .populate('propertyId', 'name address')
                    .lean()
                    .skip((page - 1) * limit)
                    .limit(limit),
                Payment_1.Payment.countDocuments(query),
            ]);
            const pages = Math.max(1, Math.ceil(total / limit));
            return res.json({ items, total, page, pages });
        }
        // Non-paginated fallback (legacy)
        const payments = yield baseQuery
            .populate('propertyId', 'name')
            .populate('tenantId', 'firstName lastName')
            .populate('agentId', 'name');
        return res.json(payments);
    }
    catch (error) {
        console.error('Error fetching payments:', error);
        res.status(500).json({
            message: 'Failed to fetch payments',
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
exports.getCompanyPayments = getCompanyPayments;
// Get payment details
const getPaymentDetails = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    try {
        const payment = yield Payment_1.Payment.findById(req.params.id)
            .populate('propertyId', 'name')
            .populate('tenantId', 'firstName lastName')
            .populate('agentId', 'name')
            .populate('processedBy', 'name');
        if (!payment) {
            return res.status(404).json({
                message: 'Payment not found',
            });
        }
        // Check if user has access to this payment
        if (payment.companyId.toString() !== req.user.companyId) {
            return res.status(403).json({
                message: 'Access denied',
            });
        }
        res.json(payment);
    }
    catch (error) {
        console.error('Error fetching payment details:', error);
        res.status(500).json({
            message: 'Failed to fetch payment details',
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
exports.getPaymentDetails = getPaymentDetails;
// Update payment status
const updatePaymentStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    try {
        const { status } = req.body;
        if (!['pending', 'completed', 'failed'].includes(status)) {
            return res.status(400).json({
                message: 'Invalid status',
            });
        }
        const payment = yield Payment_1.Payment.findById(req.params.id);
        if (!payment) {
            return res.status(404).json({
                message: 'Payment not found',
            });
        }
        // Check if user has access to this payment
        if (payment.companyId.toString() !== req.user.companyId) {
            return res.status(403).json({
                message: 'Access denied',
            });
        }
        payment.status = status;
        yield payment.save();
        res.json({
            message: 'Payment status updated successfully',
            payment,
        });
    }
    catch (error) {
        console.error('Error updating payment status:', error);
        res.status(500).json({
            message: 'Failed to update payment status',
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
exports.updatePaymentStatus = updatePaymentStatus;
// Public endpoint for admin dashboard - no authentication required
const getPaymentsPublic = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('Public payments request:', {
            query: req.query,
            headers: req.headers
        });
        // Get company ID from query params or headers (for admin dashboard)
        const companyId = req.query.companyId || req.headers['x-company-id'];
        let query = {};
        // Filter by company ID if provided
        if (companyId) {
            query.companyId = new mongoose_1.default.Types.ObjectId(companyId);
        }
        // Additional filtering options
        if (req.query.status) {
            query.status = req.query.status;
        }
        if (req.query.paymentType) {
            query.paymentType = req.query.paymentType;
        }
        if (req.query.paymentMethod) {
            query.paymentMethod = req.query.paymentMethod;
        }
        if (req.query.propertyId) {
            query.propertyId = new mongoose_1.default.Types.ObjectId(req.query.propertyId);
        }
        // Filter by agentId when provided (ensure only that agent's payments are returned)
        if (req.query.agentId) {
            try {
                query.agentId = new mongoose_1.default.Types.ObjectId(req.query.agentId);
            }
            catch (_a) {
                // Ignore invalid ObjectId to avoid throwing on public endpoint
            }
        }
        // Date filtering
        if (req.query.startDate || req.query.endDate) {
            query.paymentDate = {};
            if (req.query.startDate) {
                query.paymentDate.$gte = new Date(req.query.startDate);
            }
            if (req.query.endDate) {
                query.paymentDate.$lte = new Date(req.query.endDate);
            }
        }
        console.log('Public payments query:', query);
        const payments = yield Payment_1.Payment.find(query)
            .populate('propertyId', 'name address')
            .populate('tenantId', 'firstName lastName')
            .populate('agentId', 'firstName lastName')
            .sort({ paymentDate: -1 });
        console.log(`Found ${payments.length} payments`);
        res.json({
            status: 'success',
            data: payments,
            count: payments.length,
            companyId: companyId || null
        });
    }
    catch (error) {
        console.error('Error fetching payments (public):', error);
        res.status(500).json({
            status: 'error',
            message: 'Error fetching payments',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
exports.getPaymentsPublic = getPaymentsPublic;
// Public endpoint for getting a single payment by ID - no authentication required
const getPaymentByIdPublic = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const companyId = req.query.companyId || req.headers['x-company-id'];
        console.log('Public payment by ID request:', {
            id,
            companyId,
            query: req.query,
            headers: req.headers
        });
        let query = { _id: id };
        // Filter by company ID if provided
        if (companyId) {
            query.companyId = new mongoose_1.default.Types.ObjectId(companyId);
        }
        console.log('Public payment by ID query:', query);
        const payment = yield Payment_1.Payment.findOne(query)
            .populate('propertyId', 'name address')
            .populate('tenantId', 'firstName lastName')
            .populate('agentId', 'firstName lastName');
        if (!payment) {
            return res.status(404).json({
                status: 'error',
                message: 'Payment not found',
                id,
                companyId: companyId || null
            });
        }
        console.log('Found payment:', { id: payment._id, amount: payment.amount });
        res.json({
            status: 'success',
            data: payment
        });
    }
    catch (error) {
        console.error('Error fetching payment by ID (public):', error);
        res.status(500).json({
            status: 'error',
            message: 'Error fetching payment',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
exports.getPaymentByIdPublic = getPaymentByIdPublic;
// Public endpoint for creating payments (for admin dashboard) - no authentication required
const createPaymentPublic = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    // Allow Idempotency-Key header as an alternative to body field
    try {
        const headerKey = (req.headers['idempotency-key'] || req.headers['Idempotency-Key']);
        if (headerKey && !req.body.idempotencyKey) {
            req.body.idempotencyKey = String(headerKey);
        }
    }
    catch (_) { }
    try {
        console.log('Public payment creation request:', {
            body: req.body,
            headers: req.headers
        });
        const { leaseId, amount, paymentDate, paymentMethod, status, companyId, rentalPeriodMonth, rentalPeriodYear, advanceMonthsPaid, advancePeriodStart, advancePeriodEnd, } = req.body;
        // Validate required fields
        if (!leaseId || !amount || !paymentDate || !paymentMethod || !status) {
            return res.status(400).json({
                status: 'error',
                message: 'Missing required fields: leaseId, amount, paymentDate, paymentMethod, status',
            });
        }
        // Get lease details to extract property and tenant information
        const lease = yield Lease_1.Lease.findById(leaseId);
        if (!lease) {
            return res.status(404).json({
                status: 'error',
                message: 'Lease not found',
            });
        }
        // Get property details
        const property = yield Property_1.Property.findById(lease.propertyId);
        if (!property) {
            return res.status(404).json({ message: 'Property not found' });
        }
        const rent = property.rent || lease.rentAmount;
        // For advance payments spanning multiple months, require full multiple of rent
        if (advanceMonthsPaid && advanceMonthsPaid > 1) {
            const expectedAmount = rent * advanceMonthsPaid;
            if (amount !== expectedAmount) {
                return res.status(400).json({
                    status: 'error',
                    message: `Amount must equal rent (${rent}) x months (${advanceMonthsPaid}) = ${expectedAmount}`
                });
            }
        }
        else {
            // Allow partial payments for a single month up to remaining balance
            const periodFilter = {
                companyId: new mongoose_1.default.Types.ObjectId(lease.companyId),
                paymentType: 'rental',
                tenantId: lease.tenantId,
                propertyId: lease.propertyId,
                rentalPeriodYear,
                rentalPeriodMonth,
                status: { $in: ['pending', 'completed'] }
            };
            const [agg] = yield Payment_1.Payment.aggregate([
                { $match: periodFilter },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]);
            const alreadyPaidCents = Math.round(((agg === null || agg === void 0 ? void 0 : agg.total) || 0) * 100);
            const rentCents = Math.round((rent || 0) * 100);
            const remainingCents = rentCents - alreadyPaidCents;
            if (remainingCents <= 0) {
                return res.status(409).json({ status: 'error', message: 'This month is fully paid. Change rental month.' });
            }
            const amountCents = Math.round((amount || 0) * 100);
            if (amountCents > remainingCents) {
                return res.status(400).json({ status: 'error', message: `Only ${(remainingCents / 100).toFixed(2)} remains for this month. Enter an amount ≤ remaining.` });
            }
        }
        // Idempotency check (optional client-provided key)
        if (req.body.idempotencyKey) {
            const dup = yield Payment_1.Payment.findOne({
                companyId: new mongoose_1.default.Types.ObjectId(lease.companyId),
                idempotencyKey: String(req.body.idempotencyKey)
            }).lean();
            if (dup) {
                return res.status(200).json({ status: 'success', data: dup, message: 'Payment created successfully' });
            }
        }
        // Calculate commission based on property commission percentage
        const publicCommissionDetails = yield commissionService_1.CommissionService.calculate(amount, property.commission || 0, new mongoose_1.default.Types.ObjectId(lease.companyId));
        // Create payment record
        const payment = new Payment_1.Payment({
            amount,
            paymentDate,
            paymentMethod,
            status,
            companyId: companyId || lease.companyId,
            paymentType: 'rental',
            propertyType: 'residential', // Default value
            propertyId: lease.propertyId,
            tenantId: lease.tenantId,
            agentId: lease.tenantId, // Use tenant ID as agent ID since lease doesn't have agentId
            processedBy: lease.tenantId, // Use tenant ID as processedBy since no agent ID
            depositAmount: 0, // Default value
            rentalPeriodMonth,
            rentalPeriodYear,
            advanceMonthsPaid,
            advancePeriodStart,
            advancePeriodEnd,
            referenceNumber: '', // Placeholder, will update after save
            notes: '', // Default empty notes
            commissionDetails: publicCommissionDetails,
            rentUsed: rent, // Store the rent used for this payment
            idempotencyKey: req.body.idempotencyKey ? String(req.body.idempotencyKey) : undefined,
        });
        yield payment.save();
        payment.referenceNumber = `RCPT-${payment._id.toString().slice(-6).toUpperCase()}-${rentalPeriodYear}-${String(rentalPeriodMonth).padStart(2, '0')}`;
        yield payment.save();
        // If depositAmount > 0, record in rentaldeposits
        if (payment.depositAmount && payment.depositAmount > 0) {
            const { RentalDeposit } = require('../models/rentalDeposit');
            yield RentalDeposit.create({
                propertyId: payment.propertyId,
                agentId: payment.agentId,
                companyId: payment.companyId,
                tenantId: payment.tenantId,
                depositAmount: payment.depositAmount,
                depositDate: payment.paymentDate,
                paymentId: payment._id,
            });
        }
        console.log('Payment created successfully:', { id: payment._id, amount: payment.amount });
        res.status(201).json({
            status: 'success',
            data: payment,
            message: 'Payment created successfully'
        });
    }
    catch (error) {
        console.error('Error creating payment (public):', error);
        res.status(500).json({
            status: 'error',
            message: 'Error creating payment',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
exports.createPaymentPublic = createPaymentPublic;
// Public endpoint for downloading a payment receipt as blob (no authentication required)
const getPaymentReceiptDownload = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    try {
        const { id } = req.params;
        const companyId = req.query.companyId || req.headers['x-company-id'];
        console.log('Payment receipt download request:', {
            id,
            companyId,
            query: req.query,
            headers: req.headers
        });
        let query = { _id: id };
        // Filter by company ID if provided
        if (companyId) {
            query.companyId = new mongoose_1.default.Types.ObjectId(companyId);
        }
        console.log('Payment receipt download query:', query);
        const payment = yield Payment_1.Payment.findOne(query)
            .populate('propertyId', 'name address')
            .populate('tenantId', 'firstName lastName email')
            .populate('agentId', 'firstName lastName')
            .populate('processedBy', 'firstName lastName');
        if (!payment) {
            return res.status(404).json({
                status: 'error',
                message: 'Payment not found',
                id,
                companyId: companyId || null
            });
        }
        // Get company details if available
        let company = null;
        if (payment.companyId) {
            company = yield Company_1.Company.findById(payment.companyId).select('name address phone email website registrationNumber tinNumber vatNumber logo description');
        }
        // Generate HTML receipt with logo
        const htmlReceipt = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Payment Receipt - ${payment.referenceNumber}</title>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; color: #333; }
            .receipt { max-width: 600px; margin: 0 auto; border: 1px solid #ccc; padding: 20px; background: white; }
            .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
            .company-logo { max-width: 150px; max-height: 60px; margin-bottom: 10px; display: block; margin-left: auto; margin-right: auto; }
            .company-name { font-size: 24px; font-weight: bold; margin: 10px 0; }
            .company-details { font-size: 12px; color: #666; margin: 5px 0; }
            .receipt-number { font-size: 18px; font-weight: bold; color: #333; margin-top: 15px; }
            .amount { font-size: 28px; font-weight: bold; color: #2e7d32; text-align: center; margin: 20px 0; padding: 10px; background: #f5f5f5; border-radius: 5px; }
            .details { margin: 20px 0; }
            .detail-row { display: flex; justify-content: space-between; margin: 8px 0; border-bottom: 1px solid #eee; padding-bottom: 5px; }
            .label { font-weight: bold; color: #666; min-width: 120px; }
            .value { color: #333; text-align: right; }
            .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #eee; padding-top: 15px; }
            @media print { body { margin: 0; } .receipt { border: none; } }
          </style>
        </head>
        <body>
          <div class="receipt">
            <div class="header">
              ${(company === null || company === void 0 ? void 0 : company.logo) ? `<img src="data:image/png;base64,${company.logo}" alt="Company Logo" class="company-logo">` : ''}
              <div class="company-name">${(company === null || company === void 0 ? void 0 : company.name) || 'Property Management'}</div>
              <div class="company-details">${(company === null || company === void 0 ? void 0 : company.address) || 'Address not available'}</div>
              <div class="company-details">Phone: ${(company === null || company === void 0 ? void 0 : company.phone) || 'Phone not available'} | Email: ${(company === null || company === void 0 ? void 0 : company.email) || 'Email not available'}</div>
              ${(company === null || company === void 0 ? void 0 : company.website) ? `<div class="company-details">Website: ${company.website}</div>` : ''}
              ${(company === null || company === void 0 ? void 0 : company.registrationNumber) ? `<div class="company-details">Reg. No: ${company.registrationNumber}</div>` : ''}
              ${(company === null || company === void 0 ? void 0 : company.tinNumber) ? `<div class="company-details">Tax No: ${company.tinNumber}</div>` : ''}
              <div class="receipt-number">Receipt #${payment.referenceNumber}</div>
            </div>
            
            <div class="amount">$${((_a = payment.amount) === null || _a === void 0 ? void 0 : _a.toFixed(2)) || '0.00'}</div>
            
            <div class="details">
              <div class="detail-row">
                <span class="label">Payment Date:</span>
                <span class="value">${new Date(payment.paymentDate).toLocaleDateString()}</span>
              </div>
              <div class="detail-row">
                <span class="label">Payment Method:</span>
                <span class="value">${((_b = payment.paymentMethod) === null || _b === void 0 ? void 0 : _b.replace('_', ' ').toUpperCase()) || 'N/A'}</span>
              </div>
              <div class="detail-row">
                <span class="label">Status:</span>
                <span class="value">${((_c = payment.status) === null || _c === void 0 ? void 0 : _c.toUpperCase()) || 'N/A'}</span>
              </div>
              <div class="detail-row">
                <span class="label">Property:</span>
                <span class="value">${((_d = payment.propertyId) === null || _d === void 0 ? void 0 : _d.name) || 'N/A'}</span>
              </div>
              <div class="detail-row">
                <span class="label">Tenant:</span>
                <span class="value">${(_e = payment.tenantId) === null || _e === void 0 ? void 0 : _e.firstName} ${(_f = payment.tenantId) === null || _f === void 0 ? void 0 : _f.lastName}</span>
              </div>
              <div class="detail-row">
                <span class="label">Agent:</span>
                <span class="value">${(_g = payment.agentId) === null || _g === void 0 ? void 0 : _g.firstName} ${((_h = payment.agentId) === null || _h === void 0 ? void 0 : _h.lastName) || 'N/A'}</span>
              </div>
              <div class="detail-row">
                <span class="label">Processed By:</span>
                <span class="value">${(_j = payment.processedBy) === null || _j === void 0 ? void 0 : _j.firstName} ${((_k = payment.processedBy) === null || _k === void 0 ? void 0 : _k.lastName) || 'N/A'}</span>
              </div>
              ${payment.notes ? `
              <div class="detail-row">
                <span class="label">Notes:</span>
                <span class="value">${payment.notes}</span>
              </div>
              ` : ''}
            </div>
            
            <div class="footer">
              <p>Thank you for your payment!</p>
              <p>Generated on ${new Date().toLocaleString()}</p>
            </div>
          </div>
        </body>
      </html>
    `;
        console.log('Generated HTML receipt for payment:', { id: payment._id, amount: payment.amount });
        // Set headers for HTML file download
        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Content-Disposition', `attachment; filename="receipt-${payment.referenceNumber || payment._id}.html"`);
        res.send(htmlReceipt);
    }
    catch (error) {
        console.error('Error generating payment receipt download:', error);
        res.status(500).json({
            status: 'error',
            message: 'Error generating receipt download',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
exports.getPaymentReceiptDownload = getPaymentReceiptDownload;
// Public endpoint for getting a payment receipt for printing
const getPaymentReceipt = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const companyId = req.query.companyId || req.headers['x-company-id'];
        console.log('Payment receipt request:', {
            id,
            companyId,
            query: req.query,
            headers: req.headers
        });
        let query = { _id: id };
        // Filter by company ID if provided
        if (companyId) {
            query.companyId = new mongoose_1.default.Types.ObjectId(companyId);
        }
        console.log('Payment receipt query:', query);
        const payment = yield Payment_1.Payment.findOne(query)
            .populate('propertyId', 'name address')
            .populate('tenantId', 'firstName lastName email')
            .populate('agentId', 'firstName lastName')
            .populate('processedBy', 'firstName lastName');
        if (!payment) {
            return res.status(404).json({
                status: 'error',
                message: 'Payment not found',
                id,
                companyId: companyId || null
            });
        }
        // Get company details if available
        let company = null;
        if (payment.companyId) {
            company = yield Company_1.Company.findById(payment.companyId).select('name address phone email website registrationNumber tinNumber vatNumber logo description');
        }
        // Create receipt data
        const receipt = {
            receiptNumber: payment.referenceNumber,
            paymentDate: payment.paymentDate,
            amount: payment.amount,
            currency: 'USD', // Default currency
            paymentMethod: payment.paymentMethod,
            status: payment.status,
            property: payment.propertyId,
            tenant: payment.tenantId,
            agent: payment.agentId,
            processedBy: payment.processedBy,
            company: company,
            commissionDetails: payment.commissionDetails,
            notes: payment.notes,
            createdAt: payment.createdAt,
            // Include manual entry fields
            manualPropertyAddress: payment.manualPropertyAddress,
            manualTenantName: payment.manualTenantName,
            // Sales names (buyer/seller) for sales receipts
            buyerName: payment.buyerName,
            sellerName: payment.sellerName,
            paymentType: payment.paymentType,
            saleId: payment.saleId,
            referenceNumber: payment.referenceNumber,
            levyPeriodMonth: payment.levyPeriodMonth,
            levyPeriodYear: payment.levyPeriodYear
        };
        // Generate a deterministic unique receipt code for sale payments
        if (payment.paymentType === 'sale') {
            const dt = new Date(payment.paymentDate || payment.createdAt);
            const y = dt.getFullYear();
            const m = String(dt.getMonth() + 1).padStart(2, '0');
            const d = String(dt.getDate()).padStart(2, '0');
            const suffix = String(payment._id || '').slice(-6).toUpperCase();
            const receiptCode = `SR-${y}${m}${d}-${suffix}`;
            receipt.receiptCode = receiptCode;
            receipt.receiptNumber = receiptCode;
        }
        // For sale payments, compute totals for consistency with UI outstanding column
        try {
            const isSale = payment.paymentType === 'sale';
            if (isSale) {
                let totalSalePrice = null;
                let saleCurrency = null;
                // Prefer linked sales contract
                if (payment.saleId) {
                    const sc = yield SalesContract_1.SalesContract.findOne({ _id: payment.saleId, companyId: payment.companyId });
                    if (sc) {
                        totalSalePrice = Number(sc.totalSalePrice || 0);
                        saleCurrency = sc.currency || null;
                    }
                }
                // Fallback: parse from notes (e.g., "Total Sale Price 280,000 USD")
                if (totalSalePrice == null && typeof payment.notes === 'string') {
                    const match = payment.notes.match(/Total\s+Sale\s+Price\s+([0-9,.]+)/i);
                    if (match && match[1]) {
                        const n = Number(match[1].replace(/,/g, ''));
                        if (Number.isFinite(n))
                            totalSalePrice = n;
                    }
                }
                // Derive currency from payment if not provided by sale
                if (!saleCurrency) {
                    saleCurrency = payment.currency || 'USD';
                }
                // Compute paid to date for this sale group (include current payment)
                let paidToDate = 0;
                const match = {
                    companyId: payment.companyId,
                    paymentType: 'sale',
                    status: 'completed'
                };
                if (payment.saleId) {
                    match.saleId = payment.saleId;
                }
                else {
                    match.$or = [
                        { referenceNumber: payment.referenceNumber || null },
                        { manualPropertyAddress: payment.manualPropertyAddress || null }
                    ];
                }
                const related = yield Payment_1.Payment.find(match).select('amount');
                paidToDate = related.reduce((sum, p) => sum + (p.amount || 0), 0);
                if (totalSalePrice != null) {
                    const outstanding = Math.max(0, totalSalePrice - paidToDate);
                    receipt.totalSalePrice = totalSalePrice;
                    receipt.paidToDate = paidToDate;
                    receipt.outstanding = outstanding;
                    if (saleCurrency)
                        receipt.currency = saleCurrency;
                }
            }
        }
        catch (calcErr) {
            console.warn('Failed to compute sale totals for receipt', calcErr === null || calcErr === void 0 ? void 0 : calcErr.message);
        }
        console.log('Generated receipt for payment:', { id: payment._id, amount: payment.amount });
        res.json({
            status: 'success',
            data: receipt
        });
    }
    catch (error) {
        console.error('Error generating payment receipt:', error);
        res.status(500).json({
            status: 'error',
            message: 'Error generating receipt',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
exports.getPaymentReceipt = getPaymentReceipt;
// Finalize a provisional payment by linking to real property/tenant and posting commissions
const finalizeProvisionalPayment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    try {
        const { id } = req.params;
        const { propertyId, tenantId, ownerId, relationshipType, // 'management' | 'introduction'
        overrideCommissionPercent } = req.body;
        if (!propertyId || !tenantId) {
            return res.status(400).json({ message: 'propertyId and tenantId are required' });
        }
        // Validate ObjectId formats to prevent cast errors
        try {
            new mongoose_1.default.Types.ObjectId(propertyId);
            new mongoose_1.default.Types.ObjectId(tenantId);
            if (ownerId)
                new mongoose_1.default.Types.ObjectId(ownerId);
        }
        catch (_a) {
            return res.status(400).json({ message: 'Invalid id format supplied' });
        }
        const payment = yield Payment_1.Payment.findOne({ _id: id, companyId: req.user.companyId });
        if (!payment) {
            return res.status(404).json({ message: 'Payment not found' });
        }
        if (!payment.isProvisional) {
            return res.status(400).json({ message: 'Payment is not provisional' });
        }
        // Agents can only finalize their own provisional manual payments
        if (req.user.role === 'agent') {
            if (String(payment.agentId) !== String(req.user.userId)) {
                return res.status(403).json({ message: 'Agents may only finalize their own provisional payments' });
            }
        }
        const property = yield Property_1.Property.findById(propertyId);
        if (!property) {
            return res.status(404).json({ message: 'Property not found' });
        }
        const commissionPercent = typeof overrideCommissionPercent === 'number' ? overrideCommissionPercent : (property.commission || 0);
        const finalCommission = yield commissionService_1.CommissionService.calculate(payment.amount, commissionPercent, new mongoose_1.default.Types.ObjectId(req.user.companyId));
        payment.propertyId = new mongoose_1.default.Types.ObjectId(propertyId);
        payment.tenantId = new mongoose_1.default.Types.ObjectId(tenantId);
        if (ownerId) {
            payment.ownerId = new mongoose_1.default.Types.ObjectId(ownerId);
        }
        payment.commissionDetails = finalCommission;
        payment.isProvisional = false;
        payment.isInSuspense = false;
        payment.commissionFinalized = true;
        payment.provisionalRelationshipType = relationshipType || payment.provisionalRelationshipType || 'unknown';
        payment.finalizedAt = new Date();
        payment.finalizedBy = new mongoose_1.default.Types.ObjectId(req.user.userId);
        yield payment.save();
        yield Company_1.Company.findByIdAndUpdate(new mongoose_1.default.Types.ObjectId(req.user.companyId), { $inc: { revenue: finalCommission.agencyShare } }, {});
        yield agentAccountService_1.default.syncCommissionForPayment(payment._id.toString());
        if (payment.paymentType === 'rental' && (ownerId || property.ownerId)) {
            yield User_1.User.findByIdAndUpdate(new mongoose_1.default.Types.ObjectId(ownerId || (property.ownerId)), { $inc: { balance: finalCommission.ownerAmount } }, {});
        }
        try {
            yield propertyAccountService_1.default.recordIncomeFromPayment(payment._id.toString());
        }
        catch (err) {
            try {
                const ledgerEventService = (yield Promise.resolve().then(() => __importStar(require('../services/ledgerEventService')))).default;
                yield ledgerEventService.enqueueOwnerIncomeEvent(payment._id.toString());
            }
            catch (_b) { }
            console.error('Failed to record income in property account during finalize; enqueued for retry:', err);
        }
        // Return populated payment so the UI can immediately show property/tenant details
        const populated = yield Payment_1.Payment.findById(payment._id)
            .populate('propertyId', 'name address')
            .populate('tenantId', 'firstName lastName')
            .populate('agentId', 'firstName lastName');
        return res.json({ message: 'Payment finalized successfully', payment: populated || payment });
    }
    catch (error) {
        console.error('Error finalizing provisional payment:', error);
        return res.status(500).json({ message: 'Failed to finalize payment', error: (error === null || error === void 0 ? void 0 : error.message) || 'Unknown error' });
    }
    finally {
        // no-op
    }
});
exports.finalizeProvisionalPayment = finalizeProvisionalPayment;
