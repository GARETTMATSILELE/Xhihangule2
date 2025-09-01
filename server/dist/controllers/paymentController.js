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
exports.finalizeProvisionalPayment = exports.getPaymentReceipt = exports.getPaymentReceiptDownload = exports.createPaymentPublic = exports.getPaymentByIdPublic = exports.getPaymentsPublic = exports.updatePaymentStatus = exports.getPaymentDetails = exports.getCompanyPayments = exports.deletePayment = exports.updatePayment = exports.createPaymentAccountant = exports.createPayment = exports.getPayment = exports.getPayments = void 0;
const Payment_1 = require("../models/Payment");
const mongoose_1 = __importDefault(require("mongoose"));
const Lease_1 = require("../models/Lease");
const Property_1 = require("../models/Property");
const User_1 = require("../models/User");
const Company_1 = require("../models/Company");
const propertyAccountService_1 = __importDefault(require("../services/propertyAccountService"));
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
// Helper function to calculate commission with company-specific splits
const calculateCommission = (amount, commissionPercentage, companyId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f;
    const { Company } = yield Promise.resolve().then(() => __importStar(require('../models/Company')));
    const company = yield Company.findById(companyId).lean();
    const totalCommission = (amount * commissionPercentage) / 100;
    const preaPercentOfTotal = Math.max(0, Math.min(1, (_b = (_a = company === null || company === void 0 ? void 0 : company.commissionConfig) === null || _a === void 0 ? void 0 : _a.preaPercentOfTotal) !== null && _b !== void 0 ? _b : 0.03));
    const agentPercentOfRemaining = Math.max(0, Math.min(1, (_d = (_c = company === null || company === void 0 ? void 0 : company.commissionConfig) === null || _c === void 0 ? void 0 : _c.agentPercentOfRemaining) !== null && _d !== void 0 ? _d : 0.6));
    const agencyPercentOfRemaining = Math.max(0, Math.min(1, (_f = (_e = company === null || company === void 0 ? void 0 : company.commissionConfig) === null || _e === void 0 ? void 0 : _e.agencyPercentOfRemaining) !== null && _f !== void 0 ? _f : 0.4));
    // PREA share comes off the top; handle 0% gracefully
    const preaFee = totalCommission * preaPercentOfTotal;
    const remainingCommission = totalCommission - preaFee;
    const agentShare = remainingCommission * agentPercentOfRemaining;
    const agencyShare = remainingCommission * agencyPercentOfRemaining;
    return {
        totalCommission,
        preaFee,
        agentShare,
        agencyShare,
        ownerAmount: amount - totalCommission,
    };
});
// Create a new payment (for lease-based payments)
const createPayment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
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
        // For advance payments, validate amount
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
            // For single month, validate amount
            if (amount !== rent) {
                return res.status(400).json({
                    status: 'error',
                    message: `Amount must equal rent (${rent}) for the selected month.`
                });
            }
        }
        // Calculate commission based on property commission percentage and company config
        const paymentCommissionDetails = yield calculateCommission(amount, property.commission || 0, new mongoose_1.default.Types.ObjectId(req.user.companyId));
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
        // Update agent commission
        yield User_1.User.findByIdAndUpdate(lease.tenantId, // Use tenant ID since no agent ID
        {
            $inc: {
                commission: paymentCommissionDetails.agentShare,
            },
        });
        // If it's a rental payment, update property owner's balance
        if (property.ownerId) {
            yield User_1.User.findByIdAndUpdate(property.ownerId, {
                $inc: {
                    balance: paymentCommissionDetails.ownerAmount,
                },
            });
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
    // Helper to perform the actual create logic, with optional transaction session
    const performCreate = (user, session) => __awaiter(void 0, void 0, void 0, function* () {
        const { paymentType, propertyType, propertyId, tenantId, agentId, paymentDate, paymentMethod, amount, depositAmount, referenceNumber, notes, currency, leaseId, rentalPeriodMonth, rentalPeriodYear, rentUsed, commissionDetails, processedBy, ownerId, manualPropertyAddress, manualTenantName, saleId } = req.body;
        // Validate required fields
        if (!amount || !paymentDate) {
            return { error: { status: 400, message: 'Missing required fields: amount and paymentDate' } };
        }
        // Check if using manual entries
        const manualProperty = propertyId && propertyId.startsWith('manual_');
        const manualTenant = tenantId && tenantId.startsWith('manual_');
        // Validate manual entries
        if (manualProperty && !manualPropertyAddress) {
            return { error: { status: 400, message: 'Manual property address is required when using manual property entry' } };
        }
        if (manualTenant && !manualTenantName) {
            return { error: { status: 400, message: 'Manual tenant name is required when using manual tenant entry' } };
        }
        // Validate that either propertyId/tenantId are provided or manual entries are used
        if (!propertyId && !manualPropertyAddress) {
            return { error: { status: 400, message: 'Either propertyId or manual property address is required' } };
        }
        if (!tenantId && !manualTenantName) {
            return { error: { status: 400, message: 'Either tenantId or manual tenant name is required' } };
        }
        // Calculate commission if not provided
        let finalCommissionDetails = commissionDetails;
        if (!finalCommissionDetails) {
            const baseCommissionRate = (propertyType || 'residential') === 'residential' ? 15 : 10;
            const totalCommission = (amount * baseCommissionRate) / 100;
            const preaFee = totalCommission * 0.03;
            const remainingCommission = totalCommission - preaFee;
            const agentShare = remainingCommission * 0.6;
            const agencyShare = remainingCommission * 0.4;
            finalCommissionDetails = {
                totalCommission,
                preaFee,
                agentShare,
                agencyShare,
                ownerAmount: amount - totalCommission,
            };
        }
        // Determine provisional flags
        const markProvisional = Boolean(manualProperty || manualTenant);
        // Create payment record
        const payment = new Payment_1.Payment({
            paymentType: paymentType || 'rental',
            propertyType: propertyType || 'residential',
            propertyId: manualProperty ? new mongoose_1.default.Types.ObjectId() : new mongoose_1.default.Types.ObjectId(propertyId), // Generate new ID for manual entries
            tenantId: manualTenant ? new mongoose_1.default.Types.ObjectId() : new mongoose_1.default.Types.ObjectId(tenantId), // Generate new ID for manual entries
            agentId: new mongoose_1.default.Types.ObjectId(agentId || user.userId),
            companyId: new mongoose_1.default.Types.ObjectId(user.companyId),
            paymentDate: new Date(paymentDate),
            paymentMethod,
            amount,
            depositAmount: depositAmount || 0,
            rentalPeriodMonth,
            rentalPeriodYear,
            referenceNumber: referenceNumber || `RCPT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            notes: notes || '',
            processedBy: new mongoose_1.default.Types.ObjectId(processedBy || user.userId),
            commissionDetails: finalCommissionDetails,
            status: 'completed',
            currency: currency || 'USD',
            leaseId: leaseId ? new mongoose_1.default.Types.ObjectId(leaseId) : undefined,
            rentUsed,
            // Add manual entry fields
            manualPropertyAddress: manualProperty ? manualPropertyAddress : undefined,
            manualTenantName: manualTenant ? manualTenantName : undefined,
            // Provisional flags
            isProvisional: markProvisional,
            isInSuspense: markProvisional,
            commissionFinalized: !markProvisional,
            provisionalRelationshipType: markProvisional ? 'unknown' : undefined,
            saleId: saleId ? new mongoose_1.default.Types.ObjectId(saleId) : undefined,
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
        // Post company revenue and agent commission only if not provisional
        if (!payment.isProvisional) {
            yield Company_1.Company.findByIdAndUpdate(new mongoose_1.default.Types.ObjectId(user.companyId), { $inc: { revenue: finalCommissionDetails.agencyShare } }, session ? { session } : undefined);
            yield User_1.User.findByIdAndUpdate(new mongoose_1.default.Types.ObjectId(agentId || user.userId), { $inc: { commission: finalCommissionDetails.agentShare } }, session ? { session } : undefined);
        }
        if (!payment.isProvisional) {
            if (paymentType === 'rental' && ownerId) {
                yield User_1.User.findByIdAndUpdate(new mongoose_1.default.Types.ObjectId(ownerId), { $inc: { balance: finalCommissionDetails.ownerAmount } }, session ? { session } : undefined);
            }
        }
        try {
            // Skip recording income in property accounts until finalized if provisional
            if (!payment.isProvisional) {
                yield propertyAccountService_1.default.recordIncomeFromPayment(payment._id.toString());
            }
        }
        catch (error) {
            console.error('Failed to record income in property account:', error);
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
        // Optional: filter for deposits only
        if (req.query.onlyDeposits === 'true') {
            query.depositAmount = { $gt: 0 };
        }
        const payments = yield Payment_1.Payment.find(query)
            .populate('propertyId', 'name')
            .populate('tenantId', 'firstName lastName')
            .populate('agentId', 'name')
            .sort({ paymentDate: -1 });
        res.json(payments);
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
        // For advance payments, validate amount
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
            // For single month, validate amount
            if (amount !== rent) {
                return res.status(400).json({
                    status: 'error',
                    message: `Amount must equal rent (${rent}) for the selected month.`
                });
            }
        }
        // Calculate commission based on property commission percentage
        const publicCommissionDetails = yield calculateCommission(amount, property.commission || 0, new mongoose_1.default.Types.ObjectId(lease.companyId));
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
            manualTenantName: payment.manualTenantName
        };
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
    let session = null;
    try {
        session = yield mongoose_1.default.startSession();
        session.startTransaction();
        const { id } = req.params;
        const { propertyId, tenantId, ownerId, relationshipType, // 'management' | 'introduction'
        overrideCommissionPercent } = req.body;
        if (!propertyId || !tenantId) {
            yield session.abortTransaction();
            return res.status(400).json({ message: 'propertyId and tenantId are required' });
        }
        const payment = yield Payment_1.Payment.findOne({ _id: id, companyId: req.user.companyId }).session(session);
        if (!payment) {
            yield session.abortTransaction();
            return res.status(404).json({ message: 'Payment not found' });
        }
        if (!payment.isProvisional) {
            yield session.abortTransaction();
            return res.status(400).json({ message: 'Payment is not provisional' });
        }
        const property = yield Property_1.Property.findById(propertyId).session(session);
        if (!property) {
            yield session.abortTransaction();
            return res.status(404).json({ message: 'Property not found' });
        }
        const commissionPercent = typeof overrideCommissionPercent === 'number' ? overrideCommissionPercent : (property.commission || 0);
        const finalCommission = yield calculateCommission(payment.amount, commissionPercent, new mongoose_1.default.Types.ObjectId(req.user.companyId));
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
        yield payment.save({ session });
        yield Company_1.Company.findByIdAndUpdate(new mongoose_1.default.Types.ObjectId(req.user.companyId), { $inc: { revenue: finalCommission.agencyShare } }, { session });
        yield User_1.User.findByIdAndUpdate(new mongoose_1.default.Types.ObjectId(payment.agentId), { $inc: { commission: finalCommission.agentShare } }, { session });
        if (payment.paymentType === 'rental' && (ownerId || property.ownerId)) {
            yield User_1.User.findByIdAndUpdate(new mongoose_1.default.Types.ObjectId(ownerId || (property.ownerId)), { $inc: { balance: finalCommission.ownerAmount } }, { session });
        }
        try {
            yield propertyAccountService_1.default.recordIncomeFromPayment(payment._id.toString());
        }
        catch (err) {
            console.error('Failed to record income in property account during finalize:', err);
        }
        yield session.commitTransaction();
        return res.json({ message: 'Payment finalized successfully', payment });
    }
    catch (error) {
        if (session) {
            try {
                yield session.abortTransaction();
            }
            catch (_a) { }
        }
        console.error('Error finalizing provisional payment:', error);
        return res.status(500).json({ message: 'Failed to finalize payment', error: (error === null || error === void 0 ? void 0 : error.message) || 'Unknown error' });
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
exports.finalizeProvisionalPayment = finalizeProvisionalPayment;
