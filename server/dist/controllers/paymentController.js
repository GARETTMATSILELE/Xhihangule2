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
exports.getPaymentReceipt = exports.getPaymentReceiptDownload = exports.createPaymentPublic = exports.getPaymentByIdPublic = exports.getPaymentsPublic = exports.updatePaymentStatus = exports.getPaymentDetails = exports.getCompanyPayments = exports.deletePayment = exports.updatePayment = exports.createPaymentAccountant = exports.createPayment = exports.getPayment = exports.getPayments = void 0;
const Payment_1 = require("../models/Payment");
const mongoose_1 = __importDefault(require("mongoose"));
const Lease_1 = require("../models/Lease");
const Property_1 = require("../models/Property");
const User_1 = require("../models/User");
const Company_1 = require("../models/Company");
const Tenant_1 = require("../models/Tenant");
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
// Helper function to calculate commission
const calculateCommission = (amount, propertyType) => {
    const baseCommissionRate = propertyType === 'residential' ? 15 : 10;
    const totalCommission = (amount * baseCommissionRate) / 100;
    const preaFee = totalCommission * 0.03;
    const remainingCommission = totalCommission - preaFee;
    const agentShare = remainingCommission * 0.6;
    const agencyShare = remainingCommission * 0.4;
    return {
        totalCommission,
        preaFee,
        agentShare,
        agencyShare,
        ownerAmount: amount - totalCommission,
    };
};
// Create a new payment (for lease-based payments)
const createPayment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    try {
        const { leaseId, amount, paymentDate, paymentMethod, status, companyId, } = req.body;
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
            return res.status(404).json({
                message: 'Property not found',
            });
        }
        // Get agent details
        const agent = yield User_1.User.findById(lease.tenantId);
        if (!agent) {
            return res.status(404).json({
                message: 'Tenant not found',
            });
        }
        // Calculate commission based on property type
        const commissionDetails = calculateCommission(amount, 'residential');
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
            referenceNumber: `PAY-${Date.now()}`, // Generate reference number
            notes: '', // Default empty notes
            commissionDetails: {
                agentShare: 0,
                agencyShare: 0,
                totalCommission: 0,
                preaFee: 0,
                ownerAmount: amount, // Full amount goes to owner initially
            },
        });
        yield payment.save();
        // Update company revenue
        yield Company_1.Company.findByIdAndUpdate(companyId || lease.companyId, {
            $inc: {
                revenue: commissionDetails.agencyShare,
            },
        });
        // Update agent commission
        yield User_1.User.findByIdAndUpdate(lease.tenantId, // Use tenant ID since no agent ID
        {
            $inc: {
                commission: commissionDetails.agentShare,
            },
        });
        // If it's a rental payment, update property owner's balance
        if (property.ownerId) {
            yield User_1.User.findByIdAndUpdate(property.ownerId, {
                $inc: {
                    balance: commissionDetails.ownerAmount,
                },
            });
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
        return res.status(401).json({ message: 'Unauthorized' });
    }
    try {
        console.log('Creating accountant payment with data:', req.body);
        const { paymentType, propertyType, propertyId, tenantId, agentId, paymentDate, paymentMethod, amount, depositAmount, referenceNumber, notes, currency, companyId, processedBy, } = req.body;
        // Validate required fields
        if (!propertyId || !tenantId || !agentId || !amount || !paymentDate || !paymentMethod) {
            return res.status(400).json({
                status: 'error',
                message: 'Missing required fields: propertyId, tenantId, agentId, amount, paymentDate, paymentMethod',
            });
        }
        // Get property details
        const property = yield Property_1.Property.findById(propertyId);
        if (!property) {
            return res.status(404).json({
                status: 'error',
                message: 'Property not found',
            });
        }
        // Get tenant details
        const tenant = yield Tenant_1.Tenant.findById(tenantId);
        if (!tenant) {
            return res.status(404).json({
                status: 'error',
                message: 'Tenant not found',
            });
        }
        // Get agent details
        const agent = yield User_1.User.findById(agentId);
        if (!agent) {
            return res.status(404).json({
                status: 'error',
                message: 'Agent not found',
            });
        }
        // Calculate commission based on property type
        const commissionDetails = calculateCommission(amount, propertyType);
        // Create payment record
        const payment = new Payment_1.Payment({
            paymentType,
            propertyType,
            propertyId,
            tenantId,
            agentId,
            companyId: companyId || req.user.companyId,
            paymentDate,
            paymentMethod,
            amount,
            depositAmount: depositAmount || 0,
            referenceNumber: referenceNumber || `PAY-${Date.now()}`,
            notes: notes || '',
            processedBy: processedBy || req.user.userId,
            commissionDetails,
            status: 'completed',
            currency: currency || 'USD',
        });
        yield payment.save();
        // Update company revenue
        yield Company_1.Company.findByIdAndUpdate(companyId || req.user.companyId, {
            $inc: {
                revenue: commissionDetails.agencyShare,
            },
        });
        // Update agent commission
        yield User_1.User.findByIdAndUpdate(agentId, {
            $inc: {
                commission: commissionDetails.agentShare,
            },
        });
        // If it's a rental payment, update property owner's balance
        if (paymentType === 'rental' && property.ownerId) {
            yield User_1.User.findByIdAndUpdate(property.ownerId, {
                $inc: {
                    balance: commissionDetails.ownerAmount,
                },
            });
        }
        console.log('Accountant payment created successfully:', { id: payment._id, amount: payment.amount });
        res.status(201).json({
            status: 'success',
            data: payment,
            message: 'Payment processed successfully'
        });
    }
    catch (error) {
        console.error('Error creating accountant payment:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to process payment',
            error: error instanceof Error ? error.message : 'Unknown error',
        });
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
        const payments = yield Payment_1.Payment.find({ companyId: req.user.companyId })
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
    try {
        console.log('Public payment creation request:', {
            body: req.body,
            headers: req.headers
        });
        const { leaseId, amount, paymentDate, paymentMethod, status, companyId, } = req.body;
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
            referenceNumber: `PAY-${Date.now()}`, // Generate reference number
            notes: '', // Default empty notes
            commissionDetails: {
                agentShare: 0,
                agencyShare: 0,
                totalCommission: 0,
                preaFee: 0,
                ownerAmount: amount, // Full amount goes to owner initially
            },
        });
        yield payment.save();
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
            company = yield Company_1.Company.findById(payment.companyId).select('name address phone email website registrationNumber taxNumber logo description');
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
              ${(company === null || company === void 0 ? void 0 : company.taxNumber) ? `<div class="company-details">Tax No: ${company.taxNumber}</div>` : ''}
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
            company = yield Company_1.Company.findById(payment.companyId).select('name address phone email website registrationNumber taxNumber logo description');
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
            createdAt: payment.createdAt
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
