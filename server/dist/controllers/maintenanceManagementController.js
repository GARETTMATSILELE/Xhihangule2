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
exports.getRequestDetailBundle = exports.getOwnerSummary = exports.scheduleFollowUp = exports.downloadDocument = exports.closeMaintenanceRequest = exports.updateWorkOrderStatus = exports.getRequestWorkOrder = exports.getRequestQuotes = exports.getRequestPhotos = exports.getContractorDashboard = exports.updateContractor = exports.createContractor = exports.listContractors = exports.getPropertyHistory = exports.postVerification = exports.postQuotation = exports.postUploadPhoto = exports.postAssignContractor = exports.postWorkOrder = exports.getTimeline = exports.getDashboard = void 0;
const MaintenanceVerification_1 = require("../models/MaintenanceVerification");
const errorHandler_1 = require("../middleware/errorHandler");
const MaintenanceContractor_1 = require("../models/MaintenanceContractor");
const MaintenanceWorkOrder_1 = require("../models/MaintenanceWorkOrder");
const MaintenanceQuote_1 = require("../models/MaintenanceQuote");
const MaintenanceAttachment_1 = require("../models/MaintenanceAttachment");
const MaintenanceRequest_1 = require("../models/MaintenanceRequest");
const auditService_1 = require("../services/auditService");
const maintenanceManagementService_1 = require("../services/maintenanceManagementService");
const Company_1 = require("../models/Company");
const Property_1 = require("../models/Property");
const ctx = (req) => {
    const user = req.user;
    if (!(user === null || user === void 0 ? void 0 : user.userId) || !(user === null || user === void 0 ? void 0 : user.companyId))
        throw new errorHandler_1.AppError('Authentication required', 401);
    return { userId: user.userId, companyId: user.companyId, role: user.role };
};
const getDashboard = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { companyId } = ctx(req);
    const data = yield (0, maintenanceManagementService_1.getMaintenanceDashboard)(companyId);
    res.json(data);
});
exports.getDashboard = getDashboard;
const getTimeline = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { companyId } = ctx(req);
    const timeline = yield (0, maintenanceManagementService_1.getMaintenanceTimeline)(req.params.id, companyId);
    res.json(timeline);
});
exports.getTimeline = getTimeline;
const postWorkOrder = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId, companyId } = ctx(req);
    const workOrder = yield (0, maintenanceManagementService_1.createWorkOrder)({
        maintenanceRequestId: req.body.maintenanceRequestId || req.params.id,
        companyId,
        userId,
        notes: req.body.notes,
        targetCompletionDate: req.body.targetCompletionDate,
    });
    const populated = yield MaintenanceWorkOrder_1.MaintenanceWorkOrder.findById(workOrder._id)
        .populate('maintenanceRequestId', 'title status')
        .populate('propertyId', 'name address');
    res.status(201).json(populated);
});
exports.postWorkOrder = postWorkOrder;
const postAssignContractor = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId, companyId } = ctx(req);
    const result = yield (0, maintenanceManagementService_1.assignContractor)({
        maintenanceRequestId: req.body.maintenanceRequestId || req.params.id,
        workOrderId: req.body.workOrderId,
        contractorId: req.body.contractorId,
        companyId,
        userId,
        targetCompletionDate: req.body.targetCompletionDate,
    });
    res.json(result);
});
exports.postAssignContractor = postAssignContractor;
const postUploadPhoto = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId, companyId } = ctx(req);
    const { type, fileUrl, fileName, mimeType, requestId } = req.body;
    if (!fileUrl || !type)
        throw new errorHandler_1.AppError('fileUrl and type are required', 400);
    const attachment = yield (0, maintenanceManagementService_1.uploadMaintenancePhoto)({
        requestId: requestId || req.params.id,
        companyId,
        userId,
        type,
        fileUrl,
        fileName,
        mimeType,
    });
    res.status(201).json(attachment);
});
exports.postUploadPhoto = postUploadPhoto;
const postQuotation = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId, companyId } = ctx(req);
    const quote = yield (0, maintenanceManagementService_1.addQuotation)({
        requestId: req.body.requestId || req.params.id,
        companyId,
        userId,
        contractorId: req.body.contractorId,
        amount: Number(req.body.amount),
        description: req.body.description,
        fileUrl: req.body.fileUrl,
        fileName: req.body.fileName,
    });
    res.status(201).json(quote);
});
exports.postQuotation = postQuotation;
const postVerification = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId, companyId } = ctx(req);
    const result = yield (0, maintenanceManagementService_1.recordVerification)({
        requestId: req.body.requestId || req.params.id,
        companyId,
        userId,
        outcome: req.body.outcome,
        comments: req.body.comments,
    });
    res.json(result);
});
exports.postVerification = postVerification;
const getPropertyHistory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { companyId } = ctx(req);
    const history = yield (0, maintenanceManagementService_1.getPropertyMaintenanceHistory)(req.params.propertyId, companyId);
    res.json(history);
});
exports.getPropertyHistory = getPropertyHistory;
const listContractors = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { companyId } = ctx(req);
    const query = { companyId };
    if (req.query.active === 'true')
        query.active = true;
    if (req.query.trade)
        query.trade = req.query.trade;
    const contractors = yield MaintenanceContractor_1.MaintenanceContractor.find(query).sort({ companyName: 1 });
    res.json(contractors);
});
exports.listContractors = listContractors;
const createContractor = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId, companyId } = ctx(req);
    const { companyName, contactPerson, phone, email, trade, address, notes, rating, active } = req.body;
    if (!companyName || !contactPerson || !phone || !email || !trade) {
        throw new errorHandler_1.AppError('companyName, contactPerson, phone, email, and trade are required', 400);
    }
    const contractor = yield MaintenanceContractor_1.MaintenanceContractor.create({
        companyId,
        companyName,
        contactPerson,
        phone,
        email,
        trade,
        address,
        notes,
        rating: rating !== null && rating !== void 0 ? rating : 0,
        active: active !== false,
    });
    yield (0, auditService_1.recordAuditEvent)({
        userId,
        companyId,
        action: 'maintenance.contractor.create',
        entityType: 'MaintenanceContractor',
        entityId: String(contractor._id),
    });
    res.status(201).json(contractor);
});
exports.createContractor = createContractor;
const updateContractor = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId, companyId } = ctx(req);
    const contractor = yield MaintenanceContractor_1.MaintenanceContractor.findOneAndUpdate({ _id: req.params.id, companyId }, { $set: req.body }, { new: true, runValidators: true });
    if (!contractor)
        throw new errorHandler_1.AppError('Contractor not found', 404);
    yield (0, auditService_1.recordAuditEvent)({
        userId,
        companyId,
        action: 'maintenance.contractor.update',
        entityType: 'MaintenanceContractor',
        entityId: String(contractor._id),
    });
    res.json(contractor);
});
exports.updateContractor = updateContractor;
const getContractorDashboard = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { companyId } = ctx(req);
    const performance = yield (0, maintenanceManagementService_1.getContractorPerformance)(companyId);
    res.json(performance);
});
exports.getContractorDashboard = getContractorDashboard;
const getRequestPhotos = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { companyId } = ctx(req);
    const photos = yield MaintenanceAttachment_1.MaintenanceAttachmentRecord.find({
        requestId: req.params.id,
        companyId,
    }).sort({ uploadedAt: -1 });
    res.json(photos);
});
exports.getRequestPhotos = getRequestPhotos;
const getRequestQuotes = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { companyId } = ctx(req);
    const quotes = yield MaintenanceQuote_1.MaintenanceQuote.find({ requestId: req.params.id, companyId })
        .populate('contractorId', 'companyName trade')
        .sort({ submittedDate: -1 });
    res.json(quotes);
});
exports.getRequestQuotes = getRequestQuotes;
const getRequestWorkOrder = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { companyId } = ctx(req);
    const workOrder = yield MaintenanceWorkOrder_1.MaintenanceWorkOrder.findOne({
        maintenanceRequestId: req.params.id,
        companyId,
    }).populate('contractorId', 'companyName contactPerson phone trade');
    res.json(workOrder || null);
});
exports.getRequestWorkOrder = getRequestWorkOrder;
const updateWorkOrderStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId, companyId } = ctx(req);
    const { status } = req.body;
    const workOrder = yield MaintenanceWorkOrder_1.MaintenanceWorkOrder.findOne({ _id: req.params.workOrderId, companyId });
    if (!workOrder)
        throw new errorHandler_1.AppError('Work order not found', 404);
    workOrder.status = status;
    if (status === 'In Progress') {
        yield MaintenanceRequest_1.MaintenanceRequest.updateOne({ _id: workOrder.maintenanceRequestId }, { $set: { status: 'in_progress' } });
        yield (0, maintenanceManagementService_1.logMaintenanceActivity)({
            requestId: workOrder.maintenanceRequestId,
            companyId,
            action: 'Work Started',
            description: `Work order ${workOrder.workOrderNumber} in progress`,
            createdBy: userId,
        });
    }
    if (status === 'Completed') {
        workOrder.completionDate = new Date();
        yield MaintenanceRequest_1.MaintenanceRequest.updateOne({ _id: workOrder.maintenanceRequestId }, { $set: { status: 'completed' } });
        yield (0, maintenanceManagementService_1.logMaintenanceActivity)({
            requestId: workOrder.maintenanceRequestId,
            companyId,
            action: 'Completed',
            description: `Work order ${workOrder.workOrderNumber} completed`,
            createdBy: userId,
        });
    }
    yield workOrder.save();
    res.json(workOrder);
});
exports.updateWorkOrderStatus = updateWorkOrderStatus;
const closeMaintenanceRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId, companyId } = ctx(req);
    const request = yield MaintenanceRequest_1.MaintenanceRequest.findOne({ _id: req.params.id, companyId });
    if (!request)
        throw new errorHandler_1.AppError('Maintenance request not found', 404);
    request.status = 'closed';
    yield request.save();
    yield (0, maintenanceManagementService_1.logMaintenanceActivity)({
        requestId: request._id,
        companyId,
        action: 'Closed',
        description: 'Maintenance request closed',
        createdBy: userId,
    });
    res.json(request);
});
exports.closeMaintenanceRequest = closeMaintenanceRequest;
const downloadDocument = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { companyId } = ctx(req);
    const type = (req.params.docType || 'maintenance-report');
    const company = yield Company_1.Company.findById(companyId).select('name').lean();
    const pdf = yield (0, maintenanceManagementService_1.generateMaintenanceDocument)({
        type,
        requestId: req.params.id,
        companyId,
        companyName: (company === null || company === void 0 ? void 0 : company.name) || 'Company',
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${type}-${req.params.id}.pdf"`);
    res.send(pdf);
});
exports.downloadDocument = downloadDocument;
const scheduleFollowUp = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId, companyId } = ctx(req);
    const followUp = yield (0, maintenanceManagementService_1.scheduleFollowUpInspection)({
        maintenanceRequestId: req.params.id,
        companyId,
        userId,
        scheduledDate: req.body.scheduledDate,
        scheduledTime: req.body.scheduledTime,
        notes: req.body.notes,
    });
    res.status(201).json(followUp);
});
exports.scheduleFollowUp = scheduleFollowUp;
const getOwnerSummary = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { companyId } = ctx(req);
    const userId = req.user.userId;
    const properties = yield Property_1.Property.find({ ownerId: userId, companyId }).select('_id').lean();
    const propertyIds = properties.map((p) => String(p._id));
    const summary = yield (0, maintenanceManagementService_1.getOwnerMaintenanceSummary)(propertyIds, companyId);
    res.json(summary);
});
exports.getOwnerSummary = getOwnerSummary;
const getRequestDetailBundle = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { companyId } = ctx(req);
    const request = yield MaintenanceRequest_1.MaintenanceRequest.findOne({ _id: req.params.id, companyId })
        .populate('propertyId', 'name address')
        .populate('requestedBy', 'firstName lastName email')
        .populate('ownerId', 'firstName lastName')
        .populate('contractorId', 'companyName trade contactPerson phone');
    if (!request)
        throw new errorHandler_1.AppError('Maintenance request not found', 404);
    const [timeline, photos, quotes, workOrder, verifications] = yield Promise.all([
        (0, maintenanceManagementService_1.getMaintenanceTimeline)(req.params.id, companyId),
        MaintenanceAttachment_1.MaintenanceAttachmentRecord.find({ requestId: req.params.id }).sort({ uploadedAt: -1 }),
        MaintenanceQuote_1.MaintenanceQuote.find({ requestId: req.params.id }).populate('contractorId', 'companyName'),
        MaintenanceWorkOrder_1.MaintenanceWorkOrder.findOne({ maintenanceRequestId: req.params.id }).populate('contractorId', 'companyName'),
        MaintenanceVerification_1.MaintenanceVerification.find({ requestId: req.params.id }).sort({ recordedAt: -1 }),
    ]);
    res.json({ request, timeline, photos, quotes, workOrder, verifications });
});
exports.getRequestDetailBundle = getRequestDetailBundle;
