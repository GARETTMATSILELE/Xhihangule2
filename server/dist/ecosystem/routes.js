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
const express_1 = __importDefault(require("express"));
const crypto_1 = __importDefault(require("crypto"));
const errorHandler_1 = require("../middleware/errorHandler");
const middleware_1 = require("./middleware");
const tenantPortalService_1 = require("./services/tenantPortalService");
const maintenanceWorkflowService_1 = require("./services/maintenanceWorkflowService");
const tenantFacing_1 = require("./models/tenantFacing");
const maintenanceWorkflow_1 = require("./models/maintenanceWorkflow");
const engagement_1 = require("./models/engagement");
const commsAndPayments_1 = require("./models/commsAndPayments");
const MaintenanceRequest_1 = require("../models/MaintenanceRequest");
const MaintenanceAttachment_1 = require("../models/MaintenanceAttachment");
const MaintenanceContractor_1 = require("../models/MaintenanceContractor");
const Property_1 = require("../models/Property");
const Tenant_1 = require("../models/Tenant");
const User_1 = require("../models/User");
const Notification_1 = require("../models/Notification");
const Inspection_1 = require("../models/Inspection");
const Payment_1 = require("../models/Payment");
const notificationService_1 = require("./services/notificationService");
const paymentProvider_1 = require("./services/paymentProvider");
const access_1 = require("../utils/access");
const propertyAccess_1 = require("../utils/propertyAccess");
const Company_1 = require("../models/Company");
const listingUtils_1 = require("./listingUtils");
const router = express_1.default.Router();
function setAuthCookies(res, token, refreshToken) {
    const prod = process.env.NODE_ENV === 'production';
    res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: prod,
        sameSite: prod ? 'strict' : 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.cookie('accessToken', token, {
        httpOnly: true,
        secure: prod,
        sameSite: prod ? 'strict' : 'lax',
        path: '/',
        maxAge: 24 * 60 * 60 * 1000,
    });
    res.cookie('refreshCsrf', crypto_1.default.randomBytes(32).toString('hex'), {
        httpOnly: false,
        secure: prod,
        sameSite: prod ? 'strict' : 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000,
    });
}
router.get('/health', (_req, res) => {
    res.json({ status: 'ok', module: 'ecosystem' });
});
router.post('/auth/register', (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const role = req.body.role === 'contractor' ? 'contractor' : 'tenant';
    const result = yield (0, tenantPortalService_1.registerPortalUser)({
        role,
        email: req.body.email,
        password: req.body.password,
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        phone: req.body.phone,
        accountType: req.body.accountType === 'company' ? 'company' : 'individual',
        homeAddress: req.body.homeAddress,
        companyName: req.body.companyName,
        companyAddress: req.body.companyAddress,
        trade: req.body.trade,
        req,
    });
    setAuthCookies(res, result.tokens.token, result.tokens.refreshToken);
    res.status(201).json({
        user: {
            _id: result.user._id,
            email: result.user.email,
            firstName: result.user.firstName,
            lastName: result.user.lastName,
            role: result.user.role,
            roles: result.user.roles,
        },
        token: result.tokens.token,
    });
})));
router.get('/listings', (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.json(yield (0, tenantPortalService_1.searchListings)(req.query));
})));
router.get('/listings/:id', (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.json(yield (0, tenantPortalService_1.getPublicListing)(req.params.id));
})));
router.use(middleware_1.ecosystemAuth);
router.get('/me/profile', (0, middleware_1.requireTenant)(), (0, middleware_1.requireFlag)('tenantPortalEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const profile = yield tenantFacing_1.TenantProfile.findOne({ userId: (0, middleware_1.actorId)(req) });
    const prefs = yield commsAndPayments_1.CommunicationPreference.findOne({ userId: (0, middleware_1.actorId)(req) });
    res.json({ profile, preferences: prefs });
})));
router.put('/me/profile', (0, middleware_1.requireTenant)(), (0, middleware_1.requireFlag)('tenantPortalEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.json(yield (0, tenantPortalService_1.updateTenantProfile)((0, middleware_1.actorId)(req), req.body || {}));
})));
router.get('/me/overview', (0, middleware_1.requireTenant)(), (0, middleware_1.requireFlag)('tenantPortalEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const userId = (0, middleware_1.actorId)(req);
    const [profile, leases, payments, maintenance, viewings, applications, notifications] = yield Promise.all([
        tenantFacing_1.TenantProfile.findOne({ userId }).lean(),
        (0, tenantPortalService_1.getTenantLeases)(userId),
        (0, tenantPortalService_1.getTenantPayments)(userId),
        MaintenanceRequest_1.MaintenanceRequest.find({ requestedBy: userId }).sort({ createdAt: -1 }).limit(10).lean(),
        tenantFacing_1.ViewingRequest.find({ tenantUserId: userId }).sort({ createdAt: -1 }).limit(10).lean(),
        tenantFacing_1.RentalApplication.find({ tenantUserId: userId }).sort({ createdAt: -1 }).limit(10).lean(),
        Notification_1.Notification.find({ userId }).sort({ createdAt: -1 }).limit(10).lean(),
    ]);
    const activeLease = leases.find((l) => ['active', 'expiring_soon'].includes(l.status)) || leases[0];
    const due = ((_a = activeLease === null || activeLease === void 0 ? void 0 : activeLease.financialSummary) === null || _a === void 0 ? void 0 : _a.outstandingBalance) || 0;
    res.json({
        profile,
        lease: activeLease || null,
        rentDue: due,
        nextPayment: (activeLease === null || activeLease === void 0 ? void 0 : activeLease.billingRules) || null,
        openMaintenance: maintenance.filter((m) => { var _a; return m.status !== 'closed' && ((_a = m.ecosystemWorkflow) === null || _a === void 0 ? void 0 : _a.status) !== 'CLOSED'; }),
        recentReceipts: payments.slice(0, 5),
        messages: notifications,
        viewings: viewings.map(listingUtils_1.toTenantViewing),
        applications: applications.map(listingUtils_1.toTenantApplication),
    });
})));
router.get('/me/leases', (0, middleware_1.requireTenant)(), (0, middleware_1.requireFlag)('tenantPortalEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.json(yield (0, tenantPortalService_1.getTenantLeases)((0, middleware_1.actorId)(req)));
})));
router.get('/me/payments', (0, middleware_1.requireTenant)(), (0, middleware_1.requireFlag)('tenantPortalEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.json(yield (0, tenantPortalService_1.getTenantPayments)((0, middleware_1.actorId)(req)));
})));
router.get('/me/receipts/:paymentId', (0, middleware_1.requireTenant)(), (0, middleware_1.requireFlag)('tenantPortalEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const payments = yield (0, tenantPortalService_1.getTenantPayments)((0, middleware_1.actorId)(req));
    const match = payments.find((p) => String(p._id) === req.params.paymentId);
    if (!match)
        throw new errorHandler_1.AppError('Receipt not found', 404, 'NOT_FOUND');
    const payment = yield Payment_1.Payment.findById(req.params.paymentId).lean();
    res.json({
        receiptNumber: (payment === null || payment === void 0 ? void 0 : payment.referenceNumber) || (payment === null || payment === void 0 ? void 0 : payment._id),
        amount: payment === null || payment === void 0 ? void 0 : payment.amount,
        date: payment === null || payment === void 0 ? void 0 : payment.paymentDate,
        paymentMethod: payment === null || payment === void 0 ? void 0 : payment.paymentMethod,
        propertyId: payment === null || payment === void 0 ? void 0 : payment.propertyId,
    });
})));
router.get('/me/documents', (0, middleware_1.requireTenant)(), (0, middleware_1.requireFlag)('tenantPortalEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.json(yield (0, tenantPortalService_1.getTenantDocuments)((0, middleware_1.actorId)(req), req.query.leaseId));
})));
router.get('/me/documents/files/:id', (0, middleware_1.requireTenant)(), (0, middleware_1.requireFlag)('tenantPortalEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.json(yield (0, tenantPortalService_1.getTenantFile)((0, middleware_1.actorId)(req), req.params.id));
})));
router.post('/viewings', (0, middleware_1.requireTenant)(), (0, middleware_1.requireFlag)('tenantPortalEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const viewing = yield (0, tenantPortalService_1.createViewingRequest)({
        tenantUserId: (0, middleware_1.actorId)(req),
        propertyId: req.body.propertyId,
        requestedDate: new Date(req.body.requestedDate),
        preferredTime: req.body.preferredTime,
        attendees: req.body.attendees,
        message: req.body.message,
        req,
    });
    res.status(201).json(viewing);
})));
router.get('/me/viewings', (0, middleware_1.requireTenant)(), (0, middleware_1.requireFlag)('tenantPortalEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const rows = yield tenantFacing_1.ViewingRequest.find({ tenantUserId: (0, middleware_1.actorId)(req) }).sort({ createdAt: -1 }).lean();
    res.json(rows.map(listingUtils_1.toTenantViewing));
})));
router.post('/applications', (0, middleware_1.requireTenant)(), (0, middleware_1.requireFlag)('tenantPortalEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const app = yield (0, tenantPortalService_1.upsertApplication)({
        tenantUserId: (0, middleware_1.actorId)(req),
        propertyId: req.body.propertyId,
        notes: req.body.notes,
        documents: req.body.documents,
        submit: Boolean(req.body.submit),
        req,
    });
    res.status(201).json(app);
})));
router.get('/me/applications', (0, middleware_1.requireTenant)(), (0, middleware_1.requireFlag)('tenantPortalEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const rows = yield tenantFacing_1.RentalApplication.find({ tenantUserId: (0, middleware_1.actorId)(req) }).sort({ createdAt: -1 }).lean();
    res.json(rows.map(listingUtils_1.toTenantApplication));
})));
router.post('/maintenance', (0, middleware_1.requireTenant)(), (0, middleware_1.requireFlag)('tenantPortalEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const created = yield (0, tenantPortalService_1.createTenantMaintenance)({
        tenantUserId: (0, middleware_1.actorId)(req),
        propertyId: req.body.propertyId,
        title: req.body.title,
        description: req.body.description,
        category: req.body.category || 'OTHER',
        urgency: req.body.urgency || 'NORMAL',
        preferredAccessTime: req.body.preferredAccessTime,
        attachments: req.body.attachments,
        req,
    });
    res.status(201).json(created);
})));
router.get('/me/maintenance', (0, middleware_1.requireTenant)(), (0, middleware_1.requireFlag)('tenantPortalEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.json(yield MaintenanceRequest_1.MaintenanceRequest.find({ requestedBy: (0, middleware_1.actorId)(req) }).sort({ createdAt: -1 }).lean());
})));
router.post('/maintenance/:id/confirm', (0, middleware_1.requireTenant)(), (0, middleware_1.requireFlag)('tenantPortalEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.json(yield (0, maintenanceWorkflowService_1.tenantConfirmMaintenance)({
        requestId: req.params.id,
        tenantUserId: (0, middleware_1.actorId)(req),
        confirm: req.body.confirm !== false,
        comment: req.body.comment,
        req,
    }));
})));
router.post('/payments/online/initialize', (0, middleware_1.requireTenant)(), (0, middleware_1.requireFlag)('tenantPortalEnabled'), (0, middleware_1.requireFlag)('onlinePaymentsEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const intent = yield (0, paymentProvider_1.initializeTenantPayment)({
        tenantUserId: (0, middleware_1.actorId)(req),
        propertyId: req.body.propertyId,
        amount: Number(req.body.amount),
        idempotencyKey: req.body.idempotencyKey || `${(0, middleware_1.actorId)(req)}:${req.body.propertyId}:${req.body.amount}:${req.body.period || 'current'}`,
        leaseId: req.body.leaseId,
    });
    res.status(201).json(intent);
})));
router.post('/payments/online/:intentId/verify', (0, middleware_1.requireTenant)(), (0, middleware_1.requireFlag)('tenantPortalEnabled'), (0, middleware_1.requireFlag)('onlinePaymentsEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.json(yield (0, paymentProvider_1.verifyAndPostTenantPayment)(req.params.intentId, (0, middleware_1.actorId)(req)));
})));
router.get('/me/payment-intents', (0, middleware_1.requireTenant)(), (0, middleware_1.requireFlag)('tenantPortalEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.json(yield commsAndPayments_1.EcosystemPaymentIntent.find({ tenantUserId: (0, middleware_1.actorId)(req) }).sort({ createdAt: -1 }).lean());
})));
router.get('/me/notifications', (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.json(yield Notification_1.Notification.find({ userId: (0, middleware_1.actorId)(req) }).sort({ createdAt: -1 }).limit(100).lean());
})));
router.put('/me/preferences', (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const prefs = yield commsAndPayments_1.CommunicationPreference.findOneAndUpdate({ userId: (0, middleware_1.actorId)(req) }, { $set: req.body || {} }, { new: true, upsert: true });
    res.json(prefs);
})));
// Agency viewing / application queues
router.get('/agency/viewings', (0, middleware_1.requireAgencyStaff)(), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const ids = yield (0, propertyAccess_1.propertyIdsForCaller)(req);
    const filter = { companyId: (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId };
    if (ids !== 'company')
        filter.propertyId = { $in: ids };
    res.json(yield tenantFacing_1.ViewingRequest.find(filter).sort({ createdAt: -1 }).limit(200).lean());
})));
router.post('/agency/viewings/:id/status', (0, middleware_1.requireAgencyStaff)(), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const viewing = yield tenantFacing_1.ViewingRequest.findOne({ _id: req.params.id, companyId: (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId }).select('propertyId');
    if (!viewing || !(yield (0, propertyAccess_1.callerCanAccessProperty)(req, String(viewing.propertyId)))) {
        return res.status(404).json({ message: 'Viewing was not found in this company' });
    }
    res.json(yield (0, tenantPortalService_1.updateViewingStatus)({
        viewingId: req.params.id,
        companyId: String((_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId),
        actorId: (0, middleware_1.actorId)(req),
        status: req.body.status,
        notes: req.body.notes,
        proposedDate: req.body.proposedDate ? new Date(req.body.proposedDate) : undefined,
        req,
    }));
})));
router.get('/agency/applications', (0, middleware_1.requireAgencyStaff)(), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const ids = yield (0, propertyAccess_1.propertyIdsForCaller)(req);
    const filter = { companyId: (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId };
    if (ids !== 'company')
        filter.propertyId = { $in: ids };
    res.json(yield tenantFacing_1.RentalApplication.find(filter).sort({ createdAt: -1 }).limit(200).lean());
})));
router.post('/agency/applications/:id/status', (0, middleware_1.requireAgencyStaff)(), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    if (((_a = req.body) === null || _a === void 0 ? void 0 : _a.status) === 'OWNER_APPROVED' || ((_b = req.body) === null || _b === void 0 ? void 0 : _b.status) === 'OWNER_DECLINED') {
        return res.status(403).json({ message: 'Owner approval is a separate gate. An agent cannot approve an applicant from this route.' });
    }
    const application = yield tenantFacing_1.RentalApplication.findOne({ _id: req.params.id, companyId: (_c = req.user) === null || _c === void 0 ? void 0 : _c.companyId }).select('propertyId');
    if (!application || !(yield (0, propertyAccess_1.callerCanAccessProperty)(req, String(application.propertyId)))) {
        return res.status(404).json({ message: 'Application was not found in this company' });
    }
    res.json(yield (0, tenantPortalService_1.updateApplicationStatus)({
        applicationId: req.params.id,
        companyId: String((_d = req.user) === null || _d === void 0 ? void 0 : _d.companyId),
        actorId: (0, middleware_1.actorId)(req),
        status: req.body.status,
        note: req.body.note,
        req,
    }));
})));
router.get('/agency/maintenance', (0, middleware_1.requireAgencyStaff)(), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const ids = yield (0, propertyAccess_1.propertyIdsForCaller)(req);
    const filter = { companyId: (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId };
    if (ids !== 'company')
        filter.propertyId = { $in: ids };
    if (req.query.status)
        filter['ecosystemWorkflow.status'] = req.query.status;
    if (req.query.propertyId)
        filter.propertyId = req.query.propertyId;
    if (req.query.urgency)
        filter['ecosystemWorkflow.urgency'] = req.query.urgency;
    res.json(yield MaintenanceRequest_1.MaintenanceRequest.find(filter).sort({ updatedAt: -1 }).limit(200).lean());
})));
router.post('/agency/maintenance/:id/review', (0, middleware_1.requireAgencyStaff)(), (0, middleware_1.requireFlag)('maintenanceQuotesEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    res.json(yield (0, maintenanceWorkflowService_1.agentReviewRequest)({ requestId: req.params.id, companyId: String((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId), actorId: (0, middleware_1.actorId)(req), req }));
})));
router.post('/agency/maintenance/:id/invite', (0, middleware_1.requireAgencyStaff)(), (0, middleware_1.requireFlag)('maintenanceQuotesEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    res.json(yield (0, maintenanceWorkflowService_1.inviteContractors)({
        requestId: req.params.id,
        companyId: String((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId),
        actorId: (0, middleware_1.actorId)(req),
        contractorIds: req.body.contractorIds || [],
        req,
    }));
})));
router.get('/agency/maintenance/:id/quotes', (0, middleware_1.requireAgencyStaff)(), (0, middleware_1.requireFlag)('maintenanceQuotesEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    res.json(yield (0, maintenanceWorkflowService_1.listQuotesForAgent)(req.params.id, String((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId)));
})));
router.post('/agency/maintenance/:id/quotes/:quoteId/select', (0, middleware_1.requireAgencyStaff)(), (0, middleware_1.requireFlag)('maintenanceQuotesEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    res.json(yield (0, maintenanceWorkflowService_1.selectQuote)({
        requestId: req.params.id,
        companyId: String((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId),
        actorId: (0, middleware_1.actorId)(req),
        quoteId: req.params.quoteId,
        reason: req.body.reason,
        req,
    }));
})));
router.post('/agency/maintenance/:id/send-to-owner', (0, middleware_1.requireAgencyStaff)(), (0, middleware_1.requireFlag)('maintenanceQuotesEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    res.json(yield (0, maintenanceWorkflowService_1.sendQuoteToOwner)({ requestId: req.params.id, companyId: String((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId), actorId: (0, middleware_1.actorId)(req), req }));
})));
router.post('/agency/maintenance/:id/authorise', (0, middleware_1.requireAgencyStaff)(), (0, middleware_1.requireFlag)('maintenanceQuotesEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    res.json(yield (0, maintenanceWorkflowService_1.authoriseWork)({ requestId: req.params.id, companyId: String((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId), actorId: (0, middleware_1.actorId)(req), req }));
})));
router.get('/agency/maintenance/:id/change-orders', (0, middleware_1.requireAgencyStaff)(), (0, middleware_1.requireFlag)('maintenanceQuotesEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    res.json(yield maintenanceWorkflow_1.MaintenanceChangeOrder.find({ requestId: req.params.id, companyId: (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId }).sort({ createdAt: -1 }).lean());
})));
router.post('/agency/change-orders/:id/review', (0, middleware_1.requireAgencyStaff)(), (0, middleware_1.requireFlag)('maintenanceQuotesEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    res.json(yield (0, maintenanceWorkflowService_1.agentReviewChangeOrder)({
        changeOrderId: req.params.id,
        companyId: String((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId),
        actorId: (0, middleware_1.actorId)(req),
        req,
    }));
})));
router.get('/owner/maintenance', (0, middleware_1.requireOwnerOrAgency)(), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const filter = {};
    if ((0, access_1.hasAnyRole)(req, ['owner'])) {
        const owner = yield User_1.User.findById((0, middleware_1.actorId)(req)).select('email').lean();
        const ownerDoc = (owner === null || owner === void 0 ? void 0 : owner.email) ? yield (yield Promise.resolve().then(() => __importStar(require('../models/PropertyOwner')))).PropertyOwner.findOne({ email: owner.email }).lean() : null;
        const properties = yield Property_1.Property.find({
            $or: [
                { propertyOwnerId: ownerDoc === null || ownerDoc === void 0 ? void 0 : ownerDoc._id },
                { ownerId: (0, middleware_1.actorId)(req) },
            ],
        }).select('_id').lean();
        filter.propertyId = { $in: properties.map((p) => p._id) };
    }
    else {
        filter.companyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
    }
    res.json(yield MaintenanceRequest_1.MaintenanceRequest.find(filter).sort({ updatedAt: -1 }).limit(200).lean());
})));
router.post('/owner/maintenance/:id/decision', (0, middleware_1.requireOwnerOrAgency)(), (0, middleware_1.requireFlag)('maintenanceQuotesEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.json(yield (0, maintenanceWorkflowService_1.ownerDecideQuote)({
        requestId: req.params.id,
        ownerUserId: (0, middleware_1.actorId)(req),
        decision: req.body.decision,
        comment: req.body.comment,
        req,
    }));
})));
router.get('/owner/maintenance/:id/quote', (0, middleware_1.requireOwnerOrAgency)(), (0, middleware_1.requireFlag)('maintenanceQuotesEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const request = yield MaintenanceRequest_1.MaintenanceRequest.findById(req.params.id).lean();
    if (!request)
        throw new errorHandler_1.AppError('Maintenance request not found', 404, 'NOT_FOUND');
    const property = yield Property_1.Property.findById(request.propertyId).select('propertyOwnerId ownerId companyId').lean();
    yield (0, maintenanceWorkflowService_1.assertOwnerCanActOnProperty)({
        actorUserId: (0, middleware_1.actorId)(req),
        property,
        requestCompanyId: request.companyId,
    });
    const quoteId = (_a = request.ecosystemWorkflow) === null || _a === void 0 ? void 0 : _a.selectedQuoteId;
    if (!quoteId)
        throw new errorHandler_1.AppError('No quote has been sent for approval', 404, 'NOT_FOUND');
    const { MaintenanceQuote } = yield Promise.resolve().then(() => __importStar(require('../models/MaintenanceQuote')));
    const quote = yield MaintenanceQuote.findById(quoteId).select('amount total estimatedDuration status version description lineItems currency').lean();
    res.json({ request: { _id: request._id, title: request.title, description: request.description, status: (_b = request.ecosystemWorkflow) === null || _b === void 0 ? void 0 : _b.status }, quote });
})));
router.post('/owner/change-orders/:id/decision', (0, middleware_1.requireOwnerOrAgency)(), (0, middleware_1.requireFlag)('maintenanceQuotesEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.json(yield (0, maintenanceWorkflowService_1.ownerDecideChangeOrder)({
        changeOrderId: req.params.id,
        ownerUserId: (0, middleware_1.actorId)(req),
        decision: req.body.decision === 'DECLINE' ? 'DECLINE' : 'APPROVE',
        comment: req.body.comment,
        req,
    }));
})));
router.get('/contractor/me', (0, middleware_1.requireContractor)(), (0, middleware_1.requireFlag)('contractorPortalEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    let profile = yield MaintenanceContractor_1.MaintenanceContractor.findOne({ userId: (0, middleware_1.actorId)(req) });
    res.json(profile);
})));
router.put('/contractor/me', (0, middleware_1.requireContractor)(), (0, middleware_1.requireFlag)('contractorPortalEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const allowed = ['companyName', 'contactPerson', 'phone', 'email', 'trade', 'address', 'notes', 'skills', 'serviceAreas', 'availability', 'description'];
    const update = { userId: (0, middleware_1.actorId)(req) };
    for (const key of allowed)
        if (req.body[key] !== undefined)
            update[key] = req.body[key];
    const existing = yield MaintenanceContractor_1.MaintenanceContractor.findOne({ userId: (0, middleware_1.actorId)(req) });
    if (existing) {
        Object.assign(existing, update);
        yield existing.save();
        return res.json(existing);
    }
    if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId))
        throw new errorHandler_1.AppError('Create your company profile before saving contractor details', 400, 'NO_COMPANY');
    const created = yield MaintenanceContractor_1.MaintenanceContractor.create({
        companyId: req.user.companyId,
        companyName: req.body.companyName || `${req.body.contactPerson || 'Contractor'}`,
        contactPerson: req.body.contactPerson || 'Contact',
        phone: req.body.phone || '0000000000',
        email: req.body.email,
        trade: req.body.trade || 'General Contractor',
        userId: (0, middleware_1.actorId)(req),
        verificationStatus: 'UNVERIFIED',
        skills: req.body.skills || [],
        serviceAreas: req.body.serviceAreas || [],
    });
    res.status(201).json(created);
})));
router.get('/contractor/invitations', (0, middleware_1.requireContractor)(), (0, middleware_1.requireFlag)('contractorPortalEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const contractor = yield MaintenanceContractor_1.MaintenanceContractor.findOne({ userId: (0, middleware_1.actorId)(req) });
    if (!contractor)
        return res.json([]);
    const invitations = yield maintenanceWorkflow_1.QuoteInvitation.find({ contractorId: contractor._id }).sort({ createdAt: -1 }).lean();
    const requestIds = invitations.map((inv) => inv.requestId);
    const [jobs, photos] = yield Promise.all([
        maintenanceWorkflow_1.ContractorJobRecord.find({ contractorId: contractor._id, requestId: { $in: requestIds } }).select('_id requestId status').lean(),
        MaintenanceAttachment_1.MaintenanceAttachmentRecord.find({ requestId: { $in: requestIds }, type: 'BEFORE' }).select('requestId fileUrl fileName mimeType').lean(),
    ]);
    const jobByRequest = new Map(jobs.map((job) => [String(job.requestId), job]));
    res.json(invitations.map((inv) => {
        var _a, _b;
        return (Object.assign(Object.assign({}, inv), { jobId: (_a = jobByRequest.get(String(inv.requestId))) === null || _a === void 0 ? void 0 : _a._id, jobStatus: (_b = jobByRequest.get(String(inv.requestId))) === null || _b === void 0 ? void 0 : _b.status, photos: photos
                .filter((photo) => String(photo.requestId) === String(inv.requestId))
                .map((photo) => ({ fileUrl: photo.fileUrl, fileName: photo.fileName, mimeType: photo.mimeType })) }));
    }));
})));
router.get('/contractor/quotes', (0, middleware_1.requireContractor)(), (0, middleware_1.requireFlag)('contractorPortalEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const contractor = yield MaintenanceContractor_1.MaintenanceContractor.findOne({ userId: (0, middleware_1.actorId)(req) });
    if (!contractor)
        return res.json([]);
    const { MaintenanceQuote } = yield Promise.resolve().then(() => __importStar(require('../models/MaintenanceQuote')));
    res.json(yield MaintenanceQuote.find({ contractorId: contractor._id }).sort({ createdAt: -1 }).lean());
})));
router.post('/contractor/maintenance/:id/quotes', (0, middleware_1.requireContractor)(), (0, middleware_1.requireFlag)('contractorPortalEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.status(201).json(yield (0, maintenanceWorkflowService_1.submitQuote)({
        requestId: req.params.id,
        contractorUserId: (0, middleware_1.actorId)(req),
        description: req.body.description,
        lineItems: req.body.lineItems || [],
        estimatedDuration: req.body.estimatedDuration,
        estimatedStartDate: req.body.estimatedStartDate ? new Date(req.body.estimatedStartDate) : undefined,
        validUntil: req.body.validUntil ? new Date(req.body.validUntil) : undefined,
        notes: req.body.notes,
        attachments: req.body.attachments,
        req,
    }));
})));
router.get('/contractor/jobs', (0, middleware_1.requireContractor)(), (0, middleware_1.requireFlag)('contractorPortalEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const contractor = yield MaintenanceContractor_1.MaintenanceContractor.findOne({ userId: (0, middleware_1.actorId)(req) });
    if (!contractor)
        return res.json([]);
    const filter = { contractorId: contractor._id };
    if (req.query.status)
        filter.status = req.query.status;
    res.json(yield maintenanceWorkflow_1.ContractorJobRecord.find(filter).sort({ updatedAt: -1 }).lean());
})));
router.post('/contractor/jobs/:id/status', (0, middleware_1.requireContractor)(), (0, middleware_1.requireFlag)('contractorPortalEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.json(yield (0, maintenanceWorkflowService_1.contractorUpdateJob)({
        jobId: req.params.id,
        contractorUserId: (0, middleware_1.actorId)(req),
        status: req.body.status,
        scheduledAt: req.body.scheduledAt ? new Date(req.body.scheduledAt) : undefined,
        completion: req.body.completion,
        req,
    }));
})));
router.post('/contractor/jobs/:id/change-orders', (0, middleware_1.requireContractor)(), (0, middleware_1.requireFlag)('contractorPortalEnabled'), (0, middleware_1.requireFlag)('maintenanceQuotesEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.status(201).json(yield (0, maintenanceWorkflowService_1.requestChangeOrder)({
        jobId: req.params.id,
        contractorUserId: (0, middleware_1.actorId)(req),
        requestedAmount: Number(req.body.requestedAmount),
        description: req.body.description,
        req,
    }));
})));
router.post('/ratings', (0, middleware_1.requireFlag)('contractorRatingsEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const role = (0, access_1.hasAnyRole)(req, ['tenant']) ? 'tenant' : (0, access_1.hasAnyRole)(req, ['owner']) ? 'owner' : 'agent';
    res.status(201).json(yield (0, maintenanceWorkflowService_1.submitRating)({
        jobId: req.body.jobId,
        raterUserId: (0, middleware_1.actorId)(req),
        raterRole: role,
        scores: req.body.scores,
        comment: req.body.comment,
    }));
})));
router.get('/contractor/ratings', (0, middleware_1.requireContractor)(), (0, middleware_1.requireFlag)('contractorPortalEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const contractor = yield MaintenanceContractor_1.MaintenanceContractor.findOne({ userId: (0, middleware_1.actorId)(req) });
    if (!contractor)
        return res.json([]);
    res.json(yield engagement_1.Rating.find({ contractorId: contractor._id }).sort({ createdAt: -1 }).lean());
})));
router.post('/agency/references', (0, middleware_1.requireAgencyStaff)(), (0, middleware_1.requireFlag)('tenantReferencesEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    res.status(201).json(yield (0, maintenanceWorkflowService_1.createTenantReference)({
        companyId: String((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId),
        actorId: (0, middleware_1.actorId)(req),
        leaseId: req.body.leaseId,
        payload: {
            rentPaymentHistory: req.body.rentPaymentHistory,
            outstandingBalance: req.body.outstandingBalance,
            propertyCondition: req.body.propertyCondition,
            maintenanceCooperation: req.body.maintenanceCooperation,
            leaseCompliance: req.body.leaseCompliance,
            communication: req.body.communication,
            moveOutCondition: req.body.moveOutCondition,
            depositOutcome: req.body.depositOutcome,
            publicNotes: req.body.publicNotes,
            privateNotes: req.body.privateNotes,
        },
    }));
})));
router.get('/agency/references', (0, middleware_1.requireAgencyStaff)(), (0, middleware_1.requireFlag)('tenantReferencesEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const filter = { companyId: (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId };
    if (req.query.tenantId)
        filter.tenantId = req.query.tenantId;
    res.json(yield engagement_1.TenantReference.find(filter).sort({ createdAt: -1 }).lean());
})));
router.post('/agency/inspections', (0, middleware_1.requireAgencyStaff)(), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    res.status(201).json(yield (0, maintenanceWorkflowService_1.createMaintenanceInspection)({
        companyId: String((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId),
        actorId: (0, middleware_1.actorId)(req),
        requestId: req.body.requestId,
        checklist: req.body.checklist,
        notes: req.body.notes,
    }));
})));
router.post('/inspections/:id/acknowledge', (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const role = (0, access_1.hasAnyRole)(req, ['tenant']) ? 'tenant' : (0, access_1.hasAnyRole)(req, ['owner']) ? 'owner' : 'agent';
    res.json(yield (0, maintenanceWorkflowService_1.acknowledgeInspection)({
        inspectionId: req.params.id,
        userId: (0, middleware_1.actorId)(req),
        role: role,
        signature: req.body.signature || 'acknowledged',
    }));
})));
router.get('/me/inspections', (0, middleware_1.requireTenant)(), (0, middleware_1.requireFlag)('tenantPortalEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const tenants = yield Tenant_1.Tenant.find({ userId: (0, middleware_1.actorId)(req) });
    res.json(yield Inspection_1.Inspection.find({ tenantId: { $in: tenants.map((t) => t._id) } }).sort({ scheduledDate: -1 }).lean());
})));
router.post('/agency/broadcasts', (0, middleware_1.requireAgencyStaff)(), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f;
    const broadcast = yield engagement_1.Broadcast.create({
        companyId: (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId,
        senderId: (0, middleware_1.actorId)(req),
        title: req.body.title,
        message: req.body.message,
        priority: req.body.priority || 'NORMAL',
        scope: req.body.scope || 'ALL_AGENCY_TENANTS',
        audience: req.body.audience || {},
        attachments: req.body.attachments,
        scheduledAt: req.body.scheduledAt,
        expiresAt: req.body.expiresAt,
    });
    const tenantQuery = { companyId: (_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId };
    if (req.body.scope === 'PROPERTY' && ((_c = req.body.audience) === null || _c === void 0 ? void 0 : _c.propertyId)) {
        tenantQuery.$or = [
            { propertyId: req.body.audience.propertyId },
            { propertyIds: req.body.audience.propertyId },
        ];
    }
    if (req.body.scope === 'PORTFOLIO' && Array.isArray((_d = req.body.audience) === null || _d === void 0 ? void 0 : _d.propertyIds) && req.body.audience.propertyIds.length) {
        tenantQuery.$or = [
            { propertyId: { $in: req.body.audience.propertyIds } },
            { propertyIds: { $in: req.body.audience.propertyIds } },
        ];
    }
    if (req.body.scope === 'TENANT' && ((_e = req.body.audience) === null || _e === void 0 ? void 0 : _e.tenantId))
        tenantQuery._id = req.body.audience.tenantId;
    const tenants = yield Tenant_1.Tenant.find(tenantQuery).select('userId').lean();
    const recipientIds = tenants.map((t) => t.userId).filter(Boolean);
    for (const recipientId of recipientIds) {
        yield engagement_1.BroadcastDelivery.create({ broadcastId: broadcast._id, recipientUserId: recipientId, status: 'QUEUED' });
        yield (0, notificationService_1.notifyEvent)({
            recipientId: String(recipientId),
            companyId: String((_f = req.user) === null || _f === void 0 ? void 0 : _f.companyId),
            eventType: 'BROADCAST_MESSAGE',
            variables: { title: broadcast.title, message: broadcast.message },
            operational: broadcast.priority === 'EMERGENCY' || broadcast.priority === 'URGENT',
            idempotencyKey: `broadcast:${broadcast._id}:${recipientId}`,
        });
    }
    res.status(201).json({ broadcast, recipients: recipientIds.length });
})));
router.get('/me/broadcasts', (0, middleware_1.requireTenant)(), (0, middleware_1.requireFlag)('tenantPortalEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const deliveries = yield engagement_1.BroadcastDelivery.find({ recipientUserId: (0, middleware_1.actorId)(req) }).sort({ createdAt: -1 }).limit(50).lean();
    const ids = deliveries.map((d) => d.broadcastId);
    res.json(yield engagement_1.Broadcast.find({ _id: { $in: ids } }).sort({ createdAt: -1 }).lean());
})));
router.get('/agency/contractors', (0, middleware_1.requireAgencyStaff)(), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const filter = Object.assign(Object.assign({}, (0, MaintenanceContractor_1.contractorDirectoryFilter)(((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId) ? String(req.user.companyId) : undefined)), { active: { $ne: false } });
    if (req.query.trade)
        filter.trade = req.query.trade;
    if (req.query.verification)
        filter.verificationStatus = req.query.verification;
    if (req.query.serviceArea)
        filter.serviceAreas = req.query.serviceArea;
    res.json(yield MaintenanceContractor_1.MaintenanceContractor.find(filter).sort({ companyName: 1 }).lean());
})));
router.put('/agency/properties/:id/listing', (0, middleware_1.requireAgencyStaff)(), (0, middleware_1.requireFlag)('propertyMarketplaceEnabled'), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const property = yield Property_1.Property.findOne({ _id: req.params.id, companyId: (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId });
    if (!property || !(yield (0, propertyAccess_1.callerCanAccessProperty)(req, String(property._id))))
        throw new errorHandler_1.AppError('Property not found', 404, 'NOT_FOUND');
    if (req.body.publicListingEnabled !== undefined) {
        property.publicListingEnabled = Boolean(req.body.publicListingEnabled);
        property.listingPublishedAt = property.publicListingEnabled ? new Date() : undefined;
    }
    if (req.body.availableFrom)
        property.availableFrom = new Date(req.body.availableFrom);
    if (req.body.deposit !== undefined)
        property.deposit = Number(req.body.deposit);
    if (req.body.paymentTerms !== undefined)
        property.paymentTerms = req.body.paymentTerms;
    if (req.body.leaseRequirements !== undefined)
        property.leaseRequirements = req.body.leaseRequirements;
    if (req.body.videos)
        property.videos = req.body.videos;
    yield property.save();
    res.json({ _id: property._id, publicListingEnabled: property.publicListingEnabled });
})));
router.get('/agency/settings/ecosystem', (0, middleware_1.requireAgencyStaff)(), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const company = yield Company_1.Company.findById((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId).select('featureFlags').lean();
    res.json((company === null || company === void 0 ? void 0 : company.featureFlags) || {});
})));
router.put('/agency/settings/ecosystem', (0, middleware_1.requireAgencyStaff)(), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const allowed = [
        'tenantPortalEnabled', 'contractorPortalEnabled', 'propertyMarketplaceEnabled',
        'maintenanceQuotesEnabled', 'onlinePaymentsEnabled', 'multichannelNotificationsEnabled',
        'tenantReferencesEnabled', 'contractorRatingsEnabled',
    ];
    const $set = {};
    for (const key of allowed) {
        if (req.body[key] !== undefined)
            $set[`featureFlags.${key}`] = Boolean(req.body[key]);
    }
    const company = yield Company_1.Company.findByIdAndUpdate((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId, { $set }, { new: true }).select('featureFlags');
    res.json((company === null || company === void 0 ? void 0 : company.featureFlags) || {});
})));
router.get('/agency/dashboard', (0, middleware_1.requireAgencyStaff)(), (0, middleware_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const companyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
    const [maintenance, viewings, applications, jobs] = yield Promise.all([
        MaintenanceRequest_1.MaintenanceRequest.find({ companyId, 'ecosystemWorkflow.enabled': true }).select('title ecosystemWorkflow status propertyId').lean(),
        tenantFacing_1.ViewingRequest.find({ companyId, status: { $in: ['REQUESTED', 'UNDER_REVIEW'] } }).countDocuments(),
        tenantFacing_1.RentalApplication.find({ companyId, status: { $in: ['SUBMITTED', 'UNDER_REVIEW'] } }).countDocuments(),
        maintenanceWorkflow_1.ContractorJobRecord.find({ companyId, status: { $in: ['AUTHORISED', 'ACCEPTED', 'SCHEDULED', 'WORK_IN_PROGRESS'] } }).countDocuments(),
    ]);
    res.json({
        maintenanceRequests: maintenance.length,
        quotesAwaitingReview: maintenance.filter((m) => { var _a; return ((_a = m.ecosystemWorkflow) === null || _a === void 0 ? void 0 : _a.status) === 'QUOTE_RECEIVED'; }).length,
        quotesAwaitingOwner: maintenance.filter((m) => { var _a; return ((_a = m.ecosystemWorkflow) === null || _a === void 0 ? void 0 : _a.status) === 'OWNER_APPROVAL'; }).length,
        approvedWork: maintenance.filter((m) => { var _a; return ['APPROVED', 'AUTHORISED'].includes((_a = m.ecosystemWorkflow) === null || _a === void 0 ? void 0 : _a.status); }).length,
        contractorJobs: jobs,
        viewingRequests: viewings,
        applications,
    });
})));
exports.default = router;
