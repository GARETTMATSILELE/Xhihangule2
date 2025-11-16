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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPaymentRequestStats = exports.deletePaymentRequest = exports.rejectPaymentRequest = exports.approvePaymentRequest = exports.updatePaymentRequestStatus = exports.getPaymentRequest = exports.getPaymentRequests = exports.createPaymentRequest = void 0;
const PaymentRequest_1 = require("../models/PaymentRequest");
const Notification_1 = require("../models/Notification");
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
        const { propertyId, tenantId, ownerId, amount, currency, reason, requestDate, dueDate, notes, payTo, reportHtml, developmentId, developmentUnitId } = req.body;
        // Validate required fields (propertyId can be omitted for development/manual sales)
        if (!amount || !currency || !reason || !(payTo === null || payTo === void 0 ? void 0 : payTo.name) || !(payTo === null || payTo === void 0 ? void 0 : payTo.surname)) {
            return res.status(400).json({ message: 'Missing required fields' });
        }
        // Verify property exists and belongs to company when provided
        if (propertyId) {
            const property = yield Property_1.Property.findOne({ _id: propertyId, companyId });
            // If a propertyId is provided but not found, allow proceed if development linkage exists
            if (!property && !(developmentId || developmentUnitId)) {
                return res.status(404).json({ message: 'Property not found' });
            }
        }
        // Validate development or unit when provided
        if (!propertyId && (developmentId || developmentUnitId)) {
            try {
                let devId = developmentId;
                if (developmentUnitId) {
                    const { DevelopmentUnit } = yield Promise.resolve().then(() => __importStar(require('../models/DevelopmentUnit')));
                    const unit = yield DevelopmentUnit.findById(developmentUnitId).lean();
                    if (!unit)
                        return res.status(400).json({ message: 'Invalid developmentUnitId' });
                    devId = devId || (unit === null || unit === void 0 ? void 0 : unit.developmentId);
                }
                if (devId) {
                    const { Development } = yield Promise.resolve().then(() => __importStar(require('../models/Development')));
                    const dev = yield Development.findOne({ _id: devId, companyId }).lean();
                    if (!dev)
                        return res.status(400).json({ message: 'Invalid developmentId' });
                }
            }
            catch (e) {
                return res.status(400).json({ message: 'Invalid development linkage' });
            }
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
            developmentId,
            developmentUnitId,
            amount,
            currency,
            reason,
            requestDate: requestDate || new Date(),
            dueDate: dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
            notes,
            requestedBy: requestedByName,
            requestedByUser: (_c = req.user) === null || _c === void 0 ? void 0 : _c.userId,
            payTo,
            reportHtml,
            approval: { status: 'pending' },
            readyForAccounting: false
        });
        yield paymentRequest.save();
        // Notify Principal and PREA users in the company (if roles exist)
        try {
            const principals = yield User_1.User.find({ companyId, roles: { $in: ['principal', 'prea'] } }).select('_id').lean();
            const extra = yield User_1.User.find({ companyId, role: { $in: ['principal', 'prea'] } }).select('_id').lean();
            const ids = new Set();
            for (const r of principals)
                ids.add(String(r._id));
            for (const r of extra)
                ids.add(String(r._id));
            const docs = Array.from(ids).map(uid => ({
                companyId,
                userId: uid,
                title: 'Payment Request Approval Needed',
                message: `A new company disbursement request needs approval.`,
                link: '/admin-dashboard/approvals',
                payload: { paymentRequestId: paymentRequest._id }
            }));
            if (docs.length) {
                const saved = yield Notification_1.Notification.insertMany(docs);
                // Emit real-time notifications
                try {
                    const { getIo } = yield Promise.resolve().then(() => __importStar(require('../config/socket')));
                    const io = getIo();
                    if (io) {
                        for (const n of saved) {
                            io.to(`user-${String(n.userId)}`).emit('newNotification', n);
                        }
                    }
                }
                catch (_e) { }
            }
        }
        catch (_f) { }
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
        const { status, page = 1, limit = 10, readyForAccounting } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        // Build query - if agent, restrict to own requests
        const query = { companyId };
        if (((_b = req.user) === null || _b === void 0 ? void 0 : _b.role) === 'agent') {
            query.requestedByUser = (_c = req.user) === null || _c === void 0 ? void 0 : _c.userId;
        }
        if (status) {
            query.status = status;
        }
        if (typeof readyForAccounting !== 'undefined') {
            query.readyForAccounting = String(readyForAccounting) === 'true';
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
// Approve a payment request (Principal/PREA/Admin)
const approvePaymentRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e;
    try {
        const { id } = req.params;
        const companyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
        if (!companyId) {
            return res.status(400).json({ message: 'Company ID is required' });
        }
        const paymentRequest = yield PaymentRequest_1.PaymentRequest.findOne({ _id: id, companyId });
        if (!paymentRequest) {
            return res.status(404).json({ message: 'Payment request not found' });
        }
        const approver = yield User_1.User.findById((_b = req.user) === null || _b === void 0 ? void 0 : _b.userId).select('firstName lastName role').lean();
        const name = approver ? [approver.firstName, approver.lastName].filter(Boolean).join(' ').trim() : 'Unknown';
        paymentRequest.approval = Object.assign(Object.assign({}, (paymentRequest.approval || { status: 'pending' })), { status: 'approved', approvedBy: (_c = req.user) === null || _c === void 0 ? void 0 : _c.userId, approvedByName: name, approvedByRole: approver === null || approver === void 0 ? void 0 : approver.role, approvedAt: new Date() });
        paymentRequest.readyForAccounting = true;
        // Add APPROVED stamp when handing off to accounting (post-approval only)
        try {
            if (paymentRequest.reportHtml && typeof paymentRequest.reportHtml === 'string') {
                const approverId = String(((_d = req.user) === null || _d === void 0 ? void 0 : _d.userId) || '');
                const approvedAtIso = new Date().toISOString();
                const stamp = `
        <div style="position:fixed; top:16px; right:16px; z-index:9999; padding:8px 12px; border:2px solid #16a34a; color:#14532d; background:#dcfce7; border-radius:8px; font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,Arial; box-shadow:0 2px 6px rgba(0,0,0,0.1)">
          <div style="font-weight:700; letter-spacing:1px;">APPROVED</div>
          <div style="font-size:12px; margin-top:2px;">By: ${name} (${approverId})</div>
          <div style="font-size:12px;">On: ${new Date(approvedAtIso).toLocaleString()}</div>
        </div>`;
                const html = paymentRequest.reportHtml;
                const stamped = html.includes('<body')
                    ? html.replace(/<body[^>]*>/i, (m) => `${m}\n${stamp}\n`)
                    : `${stamp}\n${html}`;
                paymentRequest.reportHtml = stamped;
            }
        }
        catch (_f) { }
        yield paymentRequest.save();
        // Notify accountants that a request is ready to process
        try {
            const companyId = (_e = req.user) === null || _e === void 0 ? void 0 : _e.companyId;
            const accountants = yield User_1.User.find({ companyId, roles: { $in: ['accountant'] } }).select('_id').lean();
            const extra = yield User_1.User.find({ companyId, role: 'accountant' }).select('_id').lean();
            const ids = new Set();
            for (const r of accountants)
                ids.add(String(r._id));
            for (const r of extra)
                ids.add(String(r._id));
            const docs = Array.from(ids).map(uid => ({
                companyId,
                userId: uid,
                title: 'Payment Request Approved',
                message: 'An approved payment request is ready in Tasks.',
                link: '/accountant-dashboard/tasks',
                payload: { paymentRequestId: paymentRequest._id }
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
                catch (_g) { }
            }
        }
        catch (_h) { }
        const populated = yield PaymentRequest_1.PaymentRequest.findById(id)
            .populate('propertyId', 'name address')
            .populate('tenantId', 'firstName lastName email')
            .populate('ownerId', 'firstName lastName email')
            .populate('requestedByUser', 'firstName lastName email')
            .populate('processedBy', 'firstName lastName email');
        res.json({ message: 'Payment request approved', data: populated });
    }
    catch (error) {
        console.error('Error approving payment request:', error);
        res.status(500).json({ message: 'Failed to approve payment request', error: error.message });
    }
});
exports.approvePaymentRequest = approvePaymentRequest;
// Reject a payment request (Principal/PREA/Admin)
const rejectPaymentRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const { id } = req.params;
        const companyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
        const { notes } = req.body || {};
        if (!companyId) {
            return res.status(400).json({ message: 'Company ID is required' });
        }
        const paymentRequest = yield PaymentRequest_1.PaymentRequest.findOne({ _id: id, companyId });
        if (!paymentRequest) {
            return res.status(404).json({ message: 'Payment request not found' });
        }
        const approver = yield User_1.User.findById((_b = req.user) === null || _b === void 0 ? void 0 : _b.userId).select('firstName lastName role').lean();
        const name = approver ? [approver.firstName, approver.lastName].filter(Boolean).join(' ').trim() : 'Unknown';
        paymentRequest.approval = Object.assign(Object.assign({}, (paymentRequest.approval || { status: 'pending' })), { status: 'rejected', approvedBy: (_c = req.user) === null || _c === void 0 ? void 0 : _c.userId, approvedByName: name, approvedByRole: approver === null || approver === void 0 ? void 0 : approver.role, approvedAt: new Date(), notes });
        paymentRequest.readyForAccounting = false;
        yield paymentRequest.save();
        const populated = yield PaymentRequest_1.PaymentRequest.findById(id)
            .populate('propertyId', 'name address')
            .populate('tenantId', 'firstName lastName email')
            .populate('ownerId', 'firstName lastName email')
            .populate('requestedByUser', 'firstName lastName email')
            .populate('processedBy', 'firstName lastName email');
        res.json({ message: 'Payment request rejected', data: populated });
    }
    catch (error) {
        console.error('Error rejecting payment request:', error);
        res.status(500).json({ message: 'Failed to reject payment request', error: error.message });
    }
});
exports.rejectPaymentRequest = rejectPaymentRequest;
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
