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
exports.getPaymentRequestStats = exports.deletePaymentRequest = exports.updatePaymentRequestStatus = exports.getPaymentRequest = exports.getPaymentRequests = exports.createPaymentRequest = void 0;
const PaymentRequest_1 = require("../models/PaymentRequest");
const Property_1 = require("../models/Property");
const User_1 = require("../models/User");
// Create a new payment request
const createPaymentRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const companyId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId) || req.body.companyId;
        if (!companyId) {
            return res.status(400).json({ message: 'Company ID is required' });
        }
        const { propertyId, tenantId, ownerId, amount, currency, reason, requestDate, dueDate, notes, payTo } = req.body;
        // Validate required fields
        if (!propertyId || !amount || !currency || !reason || !(payTo === null || payTo === void 0 ? void 0 : payTo.name) || !(payTo === null || payTo === void 0 ? void 0 : payTo.surname)) {
            return res.status(400).json({ message: 'Missing required fields' });
        }
        // Verify property exists and belongs to company
        const property = yield Property_1.Property.findOne({ _id: propertyId, companyId });
        if (!property) {
            return res.status(404).json({ message: 'Property not found' });
        }
        // Resolve requester name safely from DB using authenticated user id
        let requestedByName = 'Unknown';
        try {
            const requesterId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.userId;
            if (requesterId) {
                const requester = yield User_1.User.findById(requesterId).select('firstName lastName').lean();
                if (requester) {
                    const parts = [requester.firstName, requester.lastName].filter(Boolean);
                    requestedByName = parts.length ? parts.join(' ').trim() : 'Unknown';
                }
            }
        }
        catch (_d) {
            // keep default 'Unknown' if lookup fails
        }
        const paymentRequest = new PaymentRequest_1.PaymentRequest({
            companyId,
            propertyId,
            tenantId,
            ownerId,
            amount,
            currency,
            reason,
            requestDate: requestDate || new Date(),
            dueDate: dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
            notes,
            requestedBy: requestedByName,
            requestedByUser: (_c = req.user) === null || _c === void 0 ? void 0 : _c.userId,
            payTo
        });
        yield paymentRequest.save();
        res.status(201).json({
            message: 'Payment request created successfully',
            data: paymentRequest
        });
    }
    catch (error) {
        console.error('Error creating payment request:', error);
        res.status(500).json({ message: 'Failed to create payment request', error: error.message });
    }
});
exports.createPaymentRequest = createPaymentRequest;
// Get all payment requests for a company
const getPaymentRequests = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const companyId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId) || req.query.companyId;
        if (!companyId) {
            return res.status(400).json({ message: 'Company ID is required' });
        }
        const { status, page = 1, limit = 10 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        // Build query - if agent, restrict to own requests
        const query = { companyId };
        if (((_b = req.user) === null || _b === void 0 ? void 0 : _b.role) === 'agent') {
            query.requestedByUser = (_c = req.user) === null || _c === void 0 ? void 0 : _c.userId;
        }
        if (status) {
            query.status = status;
        }
        // Get payment requests with populated data
        const paymentRequests = yield PaymentRequest_1.PaymentRequest.find(query)
            .populate('propertyId', 'name address')
            .populate('tenantId', 'firstName lastName email')
            .populate('ownerId', 'firstName lastName email')
            .populate('requestedByUser', 'firstName lastName email')
            .populate('processedBy', 'firstName lastName email')
            .sort({ requestDate: -1 })
            .skip(skip)
            .limit(Number(limit));
        // Get total count
        const total = yield PaymentRequest_1.PaymentRequest.countDocuments(query);
        res.json({
            data: paymentRequests,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                pages: Math.ceil(total / Number(limit))
            }
        });
    }
    catch (error) {
        console.error('Error fetching payment requests:', error);
        res.status(500).json({ message: 'Failed to fetch payment requests', error: error.message });
    }
});
exports.getPaymentRequests = getPaymentRequests;
// Get a single payment request
const getPaymentRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const companyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
        if (!companyId) {
            return res.status(400).json({ message: 'Company ID is required' });
        }
        const paymentRequest = yield PaymentRequest_1.PaymentRequest.findOne({ _id: id, companyId })
            .populate('propertyId', 'name address')
            .populate('tenantId', 'firstName lastName email')
            .populate('ownerId', 'firstName lastName email')
            .populate('requestedByUser', 'firstName lastName email')
            .populate('processedBy', 'firstName lastName email');
        if (!paymentRequest) {
            return res.status(404).json({ message: 'Payment request not found' });
        }
        res.json({ data: paymentRequest });
    }
    catch (error) {
        console.error('Error fetching payment request:', error);
        res.status(500).json({ message: 'Failed to fetch payment request', error: error.message });
    }
});
exports.getPaymentRequest = getPaymentRequest;
// Update payment request status (mark as paid/rejected)
const updatePaymentRequestStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { id } = req.params;
        const { status, notes } = req.body;
        const companyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
        if (!companyId) {
            return res.status(400).json({ message: 'Company ID is required' });
        }
        if (!['pending', 'paid', 'rejected'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }
        const paymentRequest = yield PaymentRequest_1.PaymentRequest.findOne({ _id: id, companyId });
        if (!paymentRequest) {
            return res.status(404).json({ message: 'Payment request not found' });
        }
        // Update status and processing info
        paymentRequest.status = status;
        paymentRequest.notes = notes || paymentRequest.notes;
        if (status === 'paid' || status === 'rejected') {
            paymentRequest.processedBy = (_b = req.user) === null || _b === void 0 ? void 0 : _b.userId;
            paymentRequest.processedDate = new Date();
        }
        yield paymentRequest.save();
        // Populate the updated document
        const updatedRequest = yield PaymentRequest_1.PaymentRequest.findById(id)
            .populate('propertyId', 'name address')
            .populate('tenantId', 'firstName lastName email')
            .populate('ownerId', 'firstName lastName email')
            .populate('requestedByUser', 'firstName lastName email')
            .populate('processedBy', 'firstName lastName email');
        res.json({
            message: `Payment request ${status} successfully`,
            data: updatedRequest
        });
    }
    catch (error) {
        console.error('Error updating payment request status:', error);
        res.status(500).json({ message: 'Failed to update payment request status', error: error.message });
    }
});
exports.updatePaymentRequestStatus = updatePaymentRequestStatus;
// Delete a payment request
const deletePaymentRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const companyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
        if (!companyId) {
            return res.status(400).json({ message: 'Company ID is required' });
        }
        const paymentRequest = yield PaymentRequest_1.PaymentRequest.findOneAndDelete({ _id: id, companyId });
        if (!paymentRequest) {
            return res.status(404).json({ message: 'Payment request not found' });
        }
        res.json({ message: 'Payment request deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting payment request:', error);
        res.status(500).json({ message: 'Failed to delete payment request', error: error.message });
    }
});
exports.deletePaymentRequest = deletePaymentRequest;
// Get payment request statistics
const getPaymentRequestStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const companyId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId) || req.query.companyId;
        if (!companyId) {
            return res.status(400).json({ message: 'Company ID is required' });
        }
        const stats = yield PaymentRequest_1.PaymentRequest.aggregate([
            { $match: { companyId } },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    totalAmount: { $sum: '$amount' }
                }
            }
        ]);
        const formattedStats = {
            pending: { count: 0, totalAmount: 0 },
            paid: { count: 0, totalAmount: 0 },
            rejected: { count: 0, totalAmount: 0 }
        };
        stats.forEach(stat => {
            formattedStats[stat._id] = {
                count: stat.count,
                totalAmount: stat.totalAmount
            };
        });
        res.json({ data: formattedStats });
    }
    catch (error) {
        console.error('Error fetching payment request stats:', error);
        res.status(500).json({ message: 'Failed to fetch payment request statistics', error: error.message });
    }
});
exports.getPaymentRequestStats = getPaymentRequestStats;
