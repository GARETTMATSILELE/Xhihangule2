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
exports.logMaintenanceActivity = logMaintenanceActivity;
exports.generateWorkOrderNumber = generateWorkOrderNumber;
exports.getMaintenanceDashboard = getMaintenanceDashboard;
exports.getMaintenanceTimeline = getMaintenanceTimeline;
exports.createWorkOrder = createWorkOrder;
exports.assignContractor = assignContractor;
exports.uploadMaintenancePhoto = uploadMaintenancePhoto;
exports.addQuotation = addQuotation;
exports.recordVerification = recordVerification;
exports.getPropertyMaintenanceHistory = getPropertyMaintenanceHistory;
exports.getContractorPerformance = getContractorPerformance;
exports.syncPaymentFromRequest = syncPaymentFromRequest;
exports.getOwnerMaintenanceSummary = getOwnerMaintenanceSummary;
exports.generateMaintenanceDocument = generateMaintenanceDocument;
exports.isValidMaintenanceStatus = isValidMaintenanceStatus;
exports.scheduleFollowUpInspection = scheduleFollowUpInspection;
const mongoose_1 = __importDefault(require("mongoose"));
const MaintenanceRequest_1 = require("../models/MaintenanceRequest");
const MaintenanceWorkOrder_1 = require("../models/MaintenanceWorkOrder");
const MaintenanceActivity_1 = require("../models/MaintenanceActivity");
const MaintenanceAttachment_1 = require("../models/MaintenanceAttachment");
const MaintenanceQuote_1 = require("../models/MaintenanceQuote");
const MaintenanceVerification_1 = require("../models/MaintenanceVerification");
const MaintenanceContractor_1 = require("../models/MaintenanceContractor");
const PaymentRequest_1 = require("../models/PaymentRequest");
const Property_1 = require("../models/Property");
const errorHandler_1 = require("../middleware/errorHandler");
const auditService_1 = require("./auditService");
const maintenanceStatus_1 = require("../utils/maintenanceStatus");
const reportGenerator_1 = require("./reportGenerator");
const Inspection_1 = require("../models/Inspection");
const inspectionScheduleEngine_1 = require("./inspectionScheduleEngine");
const inspectionNotificationService_1 = require("./inspectionNotificationService");
function logMaintenanceActivity(input) {
    return __awaiter(this, void 0, void 0, function* () {
        yield MaintenanceActivity_1.MaintenanceActivity.create({
            requestId: input.requestId,
            companyId: input.companyId,
            action: input.action,
            description: input.description,
            createdBy: input.createdBy,
            createdAt: new Date(),
        });
        yield MaintenanceRequest_1.MaintenanceRequest.updateOne({ _id: input.requestId }, { $set: { lastActivityAt: new Date() } });
    });
}
function generateWorkOrderNumber(companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        const year = new Date().getFullYear();
        const prefix = `WO-${year}-`;
        const latest = yield MaintenanceWorkOrder_1.MaintenanceWorkOrder.findOne({
            companyId,
            workOrderNumber: new RegExp(`^${prefix}`),
        })
            .sort({ workOrderNumber: -1 })
            .select('workOrderNumber')
            .lean();
        let seq = 1;
        if (latest === null || latest === void 0 ? void 0 : latest.workOrderNumber) {
            const parts = latest.workOrderNumber.split('-');
            const lastSeq = parseInt(parts[2] || '0', 10);
            if (!Number.isNaN(lastSeq))
                seq = lastSeq + 1;
        }
        return `${prefix}${String(seq).padStart(4, '0')}`;
    });
}
function getMaintenanceDashboard(companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        const cid = new mongoose_1.default.Types.ObjectId(companyId);
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const requests = yield MaintenanceRequest_1.MaintenanceRequest.find({ companyId: cid }).lean();
        const normalized = requests.map((r) => (Object.assign(Object.assign({}, r), { normStatus: (0, maintenanceStatus_1.normalizeMaintenanceStatus)(r.status) })));
        const openRequests = normalized.filter((r) => maintenanceStatus_1.OPEN_STATUSES.includes(r.normStatus) && !['closed', 'rejected', 'verified'].includes(r.normStatus)).length;
        const awaitingApproval = normalized.filter((r) => maintenanceStatus_1.APPROVAL_STATUSES.includes(r.status) || r.normStatus === 'awaiting_approval').length;
        const awaitingPayment = normalized.filter((r) => ['awaiting_payment', 'pending_completion'].includes(r.status) || r.normStatus === 'awaiting_payment').length;
        const inProgress = normalized.filter((r) => maintenanceStatus_1.IN_PROGRESS_STATUSES.includes(r.normStatus) || r.status === 'in_progress').length;
        const completedThisMonth = normalized.filter((r) => {
            const s = r.normStatus;
            if (!['completed', 'verified', 'closed'].includes(s) && r.status !== 'completed')
                return false;
            const d = r.updatedAt ? new Date(r.updatedAt) : null;
            return d && d >= monthStart;
        }).length;
        const completedRequests = normalized.filter((r) => ['completed', 'verified', 'closed'].includes(r.normStatus) || r.status === 'completed');
        let totalResolutionMs = 0;
        let resolutionCount = 0;
        for (const r of completedRequests) {
            if (r.createdAt && r.updatedAt) {
                totalResolutionMs += new Date(r.updatedAt).getTime() - new Date(r.createdAt).getTime();
                resolutionCount += 1;
            }
        }
        const avgResolutionDays = resolutionCount
            ? Math.round((totalResolutionMs / resolutionCount / (1000 * 60 * 60 * 24)) * 10) / 10
            : 0;
        const statusCounts = {};
        for (const r of normalized) {
            const key = r.normStatus;
            statusCounts[key] = (statusCounts[key] || 0) + 1;
        }
        const requestsByStatus = Object.entries(statusCounts).map(([status, count]) => ({ status, count }));
        const categoryCounts = {};
        for (const r of requests) {
            const cat = r.category || 'GENERAL';
            categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
        }
        const requestsByCategory = Object.entries(categoryCounts).map(([category, count]) => ({ category, count }));
        const monthlySpend = {};
        for (const r of requests) {
            const d = r.updatedAt ? new Date(r.updatedAt) : new Date(r.createdAt);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const cost = Number(r.paidAmount || r.estimatedCost || 0);
            if (cost > 0 && ['completed', 'verified', 'closed', 'funded', 'in_progress', 'assigned'].includes((0, maintenanceStatus_1.normalizeMaintenanceStatus)(r.status))) {
                monthlySpend[key] = (monthlySpend[key] || 0) + cost;
            }
        }
        const monthlyMaintenanceSpend = Object.entries(monthlySpend)
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(-12)
            .map(([month, amount]) => ({ month, amount }));
        const propertyCost = {};
        for (const r of requests) {
            const pid = String(r.propertyId);
            const cost = Number(r.paidAmount || r.estimatedCost || 0);
            if (!propertyCost[pid])
                propertyCost[pid] = { propertyId: pid, propertyName: pid, cost: 0, count: 0 };
            propertyCost[pid].cost += cost;
            propertyCost[pid].count += 1;
        }
        const properties = yield Property_1.Property.find({ companyId: cid }).select('name').lean();
        const propNameMap = new Map(properties.map((p) => [String(p._id), p.name]));
        const topPropertiesByCost = Object.values(propertyCost)
            .map((p) => (Object.assign(Object.assign({}, p), { propertyName: propNameMap.get(p.propertyId) || p.propertyName })))
            .sort((a, b) => b.cost - a.cost)
            .slice(0, 10);
        return {
            kpis: {
                openRequests,
                awaitingApproval,
                awaitingPayment,
                inProgress,
                completedThisMonth,
                averageResolutionDays: avgResolutionDays,
            },
            charts: {
                requestsByStatus,
                requestsByCategory,
                monthlyMaintenanceSpend,
                topPropertiesByCost,
            },
        };
    });
}
function getMaintenanceTimeline(requestId, companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        return MaintenanceActivity_1.MaintenanceActivity.find({ requestId, companyId })
            .populate('createdBy', 'firstName lastName email')
            .sort({ createdAt: -1 })
            .lean();
    });
}
function createWorkOrder(input) {
    return __awaiter(this, void 0, void 0, function* () {
        const request = yield MaintenanceRequest_1.MaintenanceRequest.findOne({
            _id: input.maintenanceRequestId,
            companyId: input.companyId,
        });
        if (!request)
            throw new errorHandler_1.AppError('Maintenance request not found', 404);
        const norm = (0, maintenanceStatus_1.normalizeMaintenanceStatus)(request.status);
        if (!['approved', 'funded', 'awaiting_payment', 'pending_completion'].includes(norm) && !(0, maintenanceStatus_1.isOwnerApproved)(request.status)) {
            throw new errorHandler_1.AppError('Work order can only be generated for approved requests', 400);
        }
        const existing = yield MaintenanceWorkOrder_1.MaintenanceWorkOrder.findOne({ maintenanceRequestId: request._id });
        if (existing)
            throw new errorHandler_1.AppError('Work order already exists for this request', 409);
        const workOrderNumber = yield generateWorkOrderNumber(input.companyId);
        const workOrder = yield MaintenanceWorkOrder_1.MaintenanceWorkOrder.create({
            workOrderNumber,
            maintenanceRequestId: request._id,
            propertyId: request.propertyId,
            companyId: input.companyId,
            status: 'Assigned',
            notes: input.notes,
            targetCompletionDate: input.targetCompletionDate ? new Date(input.targetCompletionDate) : undefined,
            assignedBy: input.userId,
            assignedDate: new Date(),
        });
        request.status = 'assigned';
        yield request.save();
        yield logMaintenanceActivity({
            requestId: request._id,
            companyId: input.companyId,
            action: 'Work Order Generated',
            description: `Work order ${workOrderNumber} created`,
            createdBy: input.userId,
        });
        yield (0, auditService_1.recordAuditEvent)({
            userId: input.userId,
            companyId: input.companyId,
            action: 'maintenance.work_order.create',
            entityType: 'MaintenanceWorkOrder',
            entityId: String(workOrder._id),
            metadata: { workOrderNumber, maintenanceRequestId: input.maintenanceRequestId },
        });
        return workOrder;
    });
}
function assignContractor(input) {
    return __awaiter(this, void 0, void 0, function* () {
        const contractor = yield MaintenanceContractor_1.MaintenanceContractor.findOne(Object.assign(Object.assign({ _id: input.contractorId }, (0, MaintenanceContractor_1.contractorDirectoryFilter)(input.companyId)), { active: true }));
        if (!contractor)
            throw new errorHandler_1.AppError('Contractor not found or inactive', 404);
        const request = yield MaintenanceRequest_1.MaintenanceRequest.findOne({
            _id: input.maintenanceRequestId,
            companyId: input.companyId,
        });
        if (!request)
            throw new errorHandler_1.AppError('Maintenance request not found', 404);
        let workOrder = input.workOrderId
            ? yield MaintenanceWorkOrder_1.MaintenanceWorkOrder.findOne({ _id: input.workOrderId, companyId: input.companyId })
            : yield MaintenanceWorkOrder_1.MaintenanceWorkOrder.findOne({ maintenanceRequestId: request._id, companyId: input.companyId });
        if (!workOrder) {
            workOrder = yield createWorkOrder({
                maintenanceRequestId: input.maintenanceRequestId,
                companyId: input.companyId,
                userId: input.userId,
                targetCompletionDate: input.targetCompletionDate,
            });
        }
        workOrder.contractorId = contractor._id;
        workOrder.assignedBy = new mongoose_1.default.Types.ObjectId(input.userId);
        workOrder.assignedDate = new Date();
        workOrder.status = 'Assigned';
        if (input.targetCompletionDate)
            workOrder.targetCompletionDate = new Date(input.targetCompletionDate);
        yield workOrder.save();
        request.contractorId = contractor._id;
        request.status = 'assigned';
        yield request.save();
        yield logMaintenanceActivity({
            requestId: request._id,
            companyId: input.companyId,
            action: 'Assigned To Contractor',
            description: `Assigned to ${contractor.companyName} (${contractor.trade})`,
            createdBy: input.userId,
        });
        return { workOrder, contractor, request };
    });
}
function uploadMaintenancePhoto(input) {
    return __awaiter(this, void 0, void 0, function* () {
        if (input.mimeType && !MaintenanceAttachment_1.ALLOWED_ATTACHMENT_MIME.includes(input.mimeType)) {
            throw new errorHandler_1.AppError('Unsupported file type. Allowed: jpg, jpeg, png, webp, pdf', 400);
        }
        const request = yield MaintenanceRequest_1.MaintenanceRequest.findOne({ _id: input.requestId, companyId: input.companyId });
        if (!request)
            throw new errorHandler_1.AppError('Maintenance request not found', 404);
        const attachment = yield MaintenanceAttachment_1.MaintenanceAttachmentRecord.create({
            requestId: input.requestId,
            companyId: input.companyId,
            type: input.type,
            fileUrl: input.fileUrl,
            fileName: input.fileName,
            mimeType: input.mimeType,
            uploadedBy: input.userId,
            uploadedAt: new Date(),
        });
        yield logMaintenanceActivity({
            requestId: input.requestId,
            companyId: input.companyId,
            action: input.type === 'BEFORE' ? 'Problem Photo Uploaded' : 'Completion Photo Uploaded',
            description: input.fileName || 'Photo uploaded',
            createdBy: input.userId,
        });
        return attachment;
    });
}
function addQuotation(input) {
    return __awaiter(this, void 0, void 0, function* () {
        const request = yield MaintenanceRequest_1.MaintenanceRequest.findOne({ _id: input.requestId, companyId: input.companyId });
        if (!request)
            throw new errorHandler_1.AppError('Maintenance request not found', 404);
        const quote = yield MaintenanceQuote_1.MaintenanceQuote.create({
            requestId: input.requestId,
            companyId: input.companyId,
            contractorId: input.contractorId,
            amount: input.amount,
            description: input.description,
            fileUrl: input.fileUrl,
            fileName: input.fileName,
            submittedDate: new Date(),
            createdBy: input.userId,
        });
        if (!request.estimatedCost || request.estimatedCost === 0) {
            request.estimatedCost = input.amount;
            request.requestedAmount = input.amount;
            yield request.save();
        }
        yield logMaintenanceActivity({
            requestId: input.requestId,
            companyId: input.companyId,
            action: 'Quotation Submitted',
            description: `Quote for $${input.amount.toFixed(2)}: ${input.description}`,
            createdBy: input.userId,
        });
        return quote;
    });
}
function recordVerification(input) {
    return __awaiter(this, void 0, void 0, function* () {
        const request = yield MaintenanceRequest_1.MaintenanceRequest.findOne({ _id: input.requestId, companyId: input.companyId });
        if (!request)
            throw new errorHandler_1.AppError('Maintenance request not found', 404);
        const norm = (0, maintenanceStatus_1.normalizeMaintenanceStatus)(request.status);
        if (norm !== 'completed' && request.status !== 'completed') {
            throw new errorHandler_1.AppError('Verification is only available after work is completed', 400);
        }
        const verification = yield MaintenanceVerification_1.MaintenanceVerification.create({
            requestId: input.requestId,
            companyId: input.companyId,
            outcome: input.outcome,
            comments: input.comments,
            recordedBy: input.userId,
            recordedAt: new Date(),
        });
        if (input.outcome === 'Tenant Rejected') {
            request.status = 'in_progress';
            const workOrder = yield MaintenanceWorkOrder_1.MaintenanceWorkOrder.findOne({ maintenanceRequestId: request._id });
            if (workOrder) {
                workOrder.status = 'In Progress';
                workOrder.completionDate = undefined;
                yield workOrder.save();
            }
        }
        else if (input.outcome === 'Tenant Confirmed') {
            request.status = 'verified';
        }
        else {
            request.status = 'completed';
        }
        yield request.save();
        yield logMaintenanceActivity({
            requestId: input.requestId,
            companyId: input.companyId,
            action: 'Tenant Verification',
            description: `${input.outcome}${input.comments ? `: ${input.comments}` : ''}`,
            createdBy: input.userId,
        });
        return { verification, request };
    });
}
function getPropertyMaintenanceHistory(propertyId, companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        const requests = yield MaintenanceRequest_1.MaintenanceRequest.find({ propertyId, companyId })
            .populate('contractorId', 'companyName trade')
            .sort({ createdAt: -1 })
            .lean();
        const workOrders = yield MaintenanceWorkOrder_1.MaintenanceWorkOrder.find({ propertyId, companyId }).lean();
        const woMap = new Map(workOrders.map((w) => [String(w.maintenanceRequestId), w]));
        return requests.map((r) => {
            var _a, _b;
            const wo = woMap.get(String(r._id));
            return {
                _id: r._id,
                date: r.createdAt,
                issue: r.title,
                description: r.description,
                cost: Number(r.paidAmount || r.estimatedCost || 0),
                contractor: ((_a = r.contractorId) === null || _a === void 0 ? void 0 : _a.companyName) || null,
                contractorTrade: ((_b = r.contractorId) === null || _b === void 0 ? void 0 : _b.trade) || null,
                status: (0, maintenanceStatus_1.normalizeMaintenanceStatus)(r.status),
                statusRaw: r.status,
                priority: r.priority,
                category: r.category,
                workOrderNumber: (wo === null || wo === void 0 ? void 0 : wo.workOrderNumber) || null,
                paymentStatus: r.paymentStatus,
            };
        });
    });
}
function getContractorPerformance(companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        const contractors = yield MaintenanceContractor_1.MaintenanceContractor.find({ companyId, active: true }).lean();
        const workOrders = yield MaintenanceWorkOrder_1.MaintenanceWorkOrder.find({ companyId })
            .populate('maintenanceRequestId', 'estimatedCost paidAmount')
            .lean();
        return contractors.map((c) => {
            const jobs = workOrders.filter((w) => String(w.contractorId) === String(c._id));
            const completed = jobs.filter((j) => j.status === 'Completed');
            let totalMs = 0;
            let completedWithDates = 0;
            for (const j of completed) {
                if (j.assignedDate && j.completionDate) {
                    totalMs += new Date(j.completionDate).getTime() - new Date(j.assignedDate).getTime();
                    completedWithDates += 1;
                }
            }
            const totalValue = jobs.reduce((sum, j) => {
                const req = j.maintenanceRequestId;
                return sum + Number((req === null || req === void 0 ? void 0 : req.paidAmount) || (req === null || req === void 0 ? void 0 : req.estimatedCost) || 0);
            }, 0);
            return {
                contractor: c,
                jobsCompleted: completed.length,
                averageCompletionDays: completedWithDates
                    ? Math.round((totalMs / completedWithDates / (1000 * 60 * 60 * 24)) * 10) / 10
                    : 0,
                totalValueOfJobs: totalValue,
                openJobs: jobs.filter((j) => ['Assigned', 'In Progress'].includes(j.status)).length,
            };
        });
    });
}
function syncPaymentFromRequest(paymentRequestId, paidAmount, reference) {
    return __awaiter(this, void 0, void 0, function* () {
        const pr = yield PaymentRequest_1.PaymentRequest.findById(paymentRequestId);
        if (!pr || !pr.maintenanceRequestId)
            return;
        const request = yield MaintenanceRequest_1.MaintenanceRequest.findById(pr.maintenanceRequestId);
        if (!request)
            return;
        const requested = Number(request.requestedAmount || request.estimatedCost || pr.amount || 0);
        const paid = Number(paidAmount || 0);
        request.paidAmount = paid;
        request.paymentReference = reference;
        request.paymentDate = new Date();
        request.paymentRequestId = pr._id;
        if (paid <= 0) {
            request.paymentStatus = 'awaiting_payment';
        }
        else if (paid < requested) {
            request.paymentStatus = 'partially_paid';
            request.status = 'awaiting_payment';
        }
        else {
            request.paymentStatus = 'paid';
            request.status = 'funded';
        }
        yield request.save();
        yield logMaintenanceActivity({
            requestId: request._id,
            companyId: request.companyId,
            action: 'Payment Completed',
            description: `Payment of $${paid.toFixed(2)} recorded${reference ? ` (Ref: ${reference})` : ''}`,
        });
    });
}
function getOwnerMaintenanceSummary(ownerPropertyIds, companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        const query = { propertyId: { $in: ownerPropertyIds } };
        if (companyId)
            query.companyId = companyId;
        const requests = yield MaintenanceRequest_1.MaintenanceRequest.find(query)
            .populate('propertyId', 'name address')
            .populate('contractorId', 'companyName')
            .sort({ updatedAt: -1 })
            .lean();
        const workOrders = yield MaintenanceWorkOrder_1.MaintenanceWorkOrder.find({ propertyId: { $in: ownerPropertyIds } })
            .sort({ createdAt: -1 })
            .limit(20)
            .lean();
        const openRequests = requests.filter((r) => maintenanceStatus_1.OPEN_STATUSES.includes((0, maintenanceStatus_1.normalizeMaintenanceStatus)(r.status)) &&
            !['closed', 'rejected', 'verified'].includes((0, maintenanceStatus_1.normalizeMaintenanceStatus)(r.status)));
        const approvedRequests = requests.filter((r) => (0, maintenanceStatus_1.isOwnerApproved)(r.status));
        const maintenanceSpend = requests.reduce((s, r) => s + Number(r.paidAmount || r.estimatedCost || 0), 0);
        const requestIds = requests.map((r) => r._id);
        const photos = yield MaintenanceAttachment_1.MaintenanceAttachmentRecord.find({ requestId: { $in: requestIds } })
            .sort({ uploadedAt: -1 })
            .lean();
        const completedRepairs = requests.filter((r) => ['completed', 'verified', 'closed'].includes((0, maintenanceStatus_1.normalizeMaintenanceStatus)(r.status)));
        return {
            openRequests,
            approvedRequests,
            maintenanceSpend,
            recentWorkOrders: workOrders,
            propertyMaintenanceHistory: requests.map((r) => {
                var _a, _b;
                return ({
                    _id: r._id,
                    date: r.createdAt,
                    issue: r.title,
                    cost: Number(r.paidAmount || r.estimatedCost || 0),
                    contractor: ((_a = r.contractorId) === null || _a === void 0 ? void 0 : _a.companyName) || null,
                    status: (0, maintenanceStatus_1.normalizeMaintenanceStatus)(r.status),
                    propertyName: (_b = r.propertyId) === null || _b === void 0 ? void 0 : _b.name,
                });
            }),
            photos,
            completedRepairs,
        };
    });
}
function generateMaintenanceDocument(input) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const request = yield MaintenanceRequest_1.MaintenanceRequest.findOne({ _id: input.requestId, companyId: input.companyId })
            .populate('propertyId', 'name address')
            .populate('contractorId', 'companyName contactPerson phone')
            .populate('requestedBy', 'firstName lastName')
            .lean();
        if (!request)
            throw new errorHandler_1.AppError('Maintenance request not found', 404);
        const [activities, quotes, workOrder, photos] = yield Promise.all([
            MaintenanceActivity_1.MaintenanceActivity.find({ requestId: input.requestId }).sort({ createdAt: -1 }).lean(),
            MaintenanceQuote_1.MaintenanceQuote.find({ requestId: input.requestId }).lean(),
            MaintenanceWorkOrder_1.MaintenanceWorkOrder.findOne({ maintenanceRequestId: input.requestId }).lean(),
            MaintenanceAttachment_1.MaintenanceAttachmentRecord.find({ requestId: input.requestId }).lean(),
        ]);
        const propertyLabel = ((_a = request.propertyId) === null || _a === void 0 ? void 0 : _a.name) || 'Property';
        const rows = [];
        if (input.type === 'work-order' && workOrder) {
            rows.push({ Field: 'Work Order', Value: workOrder.workOrderNumber }, { Field: 'Status', Value: workOrder.status }, { Field: 'Target Completion', Value: workOrder.targetCompletionDate ? new Date(workOrder.targetCompletionDate).toLocaleDateString() : 'N/A' }, { Field: 'Contractor', Value: ((_b = request.contractorId) === null || _b === void 0 ? void 0 : _b.companyName) || 'Unassigned' }, { Field: 'Issue', Value: request.title }, { Field: 'Description', Value: request.description });
        }
        else if (input.type === 'quotation-summary') {
            for (const q of quotes) {
                rows.push({ Contractor: q.contractorId || 'N/A', Amount: q.amount, Description: q.description, Date: new Date(q.submittedDate).toLocaleDateString() });
            }
        }
        else if (input.type === 'completion-certificate') {
            rows.push({ Field: 'Issue', Value: request.title }, { Field: 'Completed', Value: request.updatedAt ? new Date(request.updatedAt).toLocaleDateString() : 'N/A' }, { Field: 'Contractor', Value: ((_c = request.contractorId) === null || _c === void 0 ? void 0 : _c.companyName) || 'N/A' }, { Field: 'Cost', Value: Number(request.paidAmount || request.estimatedCost || 0) }, { Field: 'Completion Photos', Value: photos.filter((p) => p.type === 'AFTER').length });
        }
        else {
            rows.push({ Field: 'Title', Value: request.title }, { Field: 'Status', Value: request.status }, { Field: 'Priority', Value: request.priority }, { Field: 'Estimated Cost', Value: Number(request.estimatedCost || 0) }, { Field: 'Paid', Value: Number(request.paidAmount || 0) });
            for (const a of activities.slice(0, 20)) {
                rows.push({ Timeline: a.action, Detail: a.description, Date: new Date(a.createdAt).toLocaleString() });
            }
        }
        return (0, reportGenerator_1.generateTrustReportPdf)({
            reportType: input.type,
            companyName: input.companyName,
            propertyLabel,
            auditReference: String(request._id),
            rows,
            totals: { estimatedCost: Number(request.estimatedCost || 0), paidAmount: Number(request.paidAmount || 0) },
        });
    });
}
function isValidMaintenanceStatus(status) {
    return maintenanceStatus_1.MAINTENANCE_STATUSES.includes(status);
}
function scheduleFollowUpInspection(input) {
    return __awaiter(this, void 0, void 0, function* () {
        const request = yield MaintenanceRequest_1.MaintenanceRequest.findOne({
            _id: input.maintenanceRequestId,
            companyId: input.companyId,
        });
        if (!request)
            throw new errorHandler_1.AppError('Maintenance request not found', 404);
        const norm = (0, maintenanceStatus_1.normalizeMaintenanceStatus)(request.status);
        if (!['completed', 'verified', 'closed'].includes(norm) && request.status !== 'completed') {
            throw new errorHandler_1.AppError('Follow-up inspection can only be scheduled after work is completed', 400);
        }
        if (request.followUpInspectionId) {
            throw new errorHandler_1.AppError('Follow-up inspection already scheduled for this request', 409);
        }
        const scheduledDate = input.scheduledDate
            ? new Date(input.scheduledDate)
            : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
        const property = yield Property_1.Property.findById(request.propertyId).select('name').lean();
        const propertyName = (property === null || property === void 0 ? void 0 : property.name) || 'Property';
        const followUp = yield Inspection_1.Inspection.create({
            propertyId: request.propertyId,
            companyId: input.companyId,
            ownerId: new mongoose_1.default.Types.ObjectId(input.userId),
            scheduledDate,
            originalScheduledDate: scheduledDate,
            scheduledTime: input.scheduledTime || '',
            frequency: 'ad_hoc',
            type: 'follow_up',
            status: (0, inspectionScheduleEngine_1.resolveInspectionStatus)(scheduledDate),
            generatedBy: 'follow_up',
            sourceMaintenanceRequestId: request._id,
            maintenanceRequestIds: [request._id],
            notes: input.notes || `Follow-up inspection for maintenance: ${request.title}`,
            reminders: (0, inspectionScheduleEngine_1.buildInspectionReminders)(scheduledDate, propertyName),
            checklist: (0, inspectionScheduleEngine_1.defaultChecklistForInspection)('follow_up'),
            template: { name: 'Maintenance Follow-Up' },
        });
        request.followUpInspectionId = followUp._id;
        yield request.save();
        yield logMaintenanceActivity({
            requestId: request._id,
            companyId: input.companyId,
            action: 'Follow-Up Inspection Scheduled',
            description: `Scheduled for ${scheduledDate.toLocaleDateString()}`,
            createdBy: input.userId,
        });
        yield (0, inspectionNotificationService_1.notifyInspectionEvent)({
            companyId: input.companyId,
            userId: input.userId,
            title: 'Follow-up inspection scheduled',
            message: `Follow-up for "${request.title}" on ${scheduledDate.toLocaleDateString()}.`,
            inspectionId: followUp._id,
            eventType: 'follow_up_created',
        });
        return followUp;
    });
}
