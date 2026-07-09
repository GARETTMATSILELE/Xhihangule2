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
exports.uploadInspectionAttachment = exports.getInspectionReportHtml = exports.uploadInspectionItemPhoto = exports.getInspectionTemplates = exports.getInspectionCalendarEvents = exports.getInspectionComplianceMetrics = exports.getInspectionOperations = exports.dispatchInspectionReminders = exports.escalateInspectionToMaintenance = exports.createFollowUpInspection = exports.rescheduleInspection = exports.generateLeaseInspections = exports.updateInspectionReport = exports.deleteInspection = exports.completeInspectionExecution = exports.autosaveInspectionExecution = exports.startInspectionExecution = exports.updateInspection = exports.createInspection = exports.listInspections = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const errorHandler_1 = require("../middleware/errorHandler");
const Inspection_1 = require("../models/Inspection");
const Property_1 = require("../models/Property");
const Lease_1 = require("../models/Lease");
const MaintenanceRequest_1 = require("../models/MaintenanceRequest");
const maintenanceManagementService_1 = require("../services/maintenanceManagementService");
const MaintenanceAttachment_1 = require("../models/MaintenanceAttachment");
const inspectionScheduleEngine_1 = require("../services/inspectionScheduleEngine");
const inspectionNotificationService_1 = require("../services/inspectionNotificationService");
const ISSUE_STATUSES = ['attention_required', 'damaged', 'missing', 'not_working', 'fail'];
function calculateInspectionScore(checklist = []) {
    if (!checklist.length) {
        return { score: 100, rating: 'excellent', followUpRequired: false, issueCount: 0 };
    }
    const penalties = checklist.reduce((sum, item) => {
        if (!ISSUE_STATUSES.includes(String(item.status)))
            return sum;
        const severity = String(item.severity || 'medium');
        if (severity === 'critical')
            return sum + 18;
        if (severity === 'high')
            return sum + 12;
        if (severity === 'medium')
            return sum + 8;
        return sum + 4;
    }, 0);
    const issueCount = checklist.filter((item) => ISSUE_STATUSES.includes(String(item.status))).length;
    const score = Math.max(0, Math.min(100, 100 - penalties));
    const rating = score >= 90 ? 'excellent' : score >= 75 ? 'good' : score >= 50 ? 'needs_attention' : 'critical';
    return { score, rating, followUpRequired: issueCount > 0, issueCount };
}
function pushTimeline(update, event, message, userId, payload) {
    update.$push = update.$push || {};
    update.$push.executionTimeline = {
        event,
        message,
        timestamp: new Date(),
        userId: userId ? new mongoose_1.default.Types.ObjectId(userId) : undefined,
        payload
    };
}
function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
const listInspections = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId)) {
            throw new errorHandler_1.AppError('Authentication with company required', 401);
        }
        const query = { companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId) };
        if (((_b = req.user) === null || _b === void 0 ? void 0 : _b.role) === 'agent' && req.user.userId) {
            query.ownerId = new mongoose_1.default.Types.ObjectId(req.user.userId);
        }
        if (req.query.propertyId) {
            query.propertyId = new mongoose_1.default.Types.ObjectId(req.query.propertyId);
        }
        if (req.query.leaseId) {
            query.leaseId = new mongoose_1.default.Types.ObjectId(req.query.leaseId);
        }
        if (req.query.status) {
            query.status = req.query.status;
        }
        const inspections = yield Inspection_1.Inspection.find(query)
            .populate('propertyId', 'name address')
            .populate('tenantId', 'firstName lastName email')
            .populate('leaseId', 'startDate endDate status')
            .sort({ scheduledDate: -1 });
        const today = new Date();
        const staleInspections = inspections.filter((inspection) => {
            const status = (0, inspectionScheduleEngine_1.resolveInspectionStatus)(inspection.scheduledDate, inspection.completedAt, inspection.status);
            return status !== inspection.status && inspection.status !== 'rescheduled';
        });
        if (staleInspections.length) {
            yield Promise.all(staleInspections.map((inspection) => Inspection_1.Inspection.updateOne({ _id: inspection._id }, { $set: { status: (0, inspectionScheduleEngine_1.resolveInspectionStatus)(inspection.scheduledDate, inspection.completedAt, inspection.status) } })));
        }
        res.json(inspections.map(i => (Object.assign(Object.assign({}, i.toObject()), { property: i.get('propertyId'), effectiveStatus: (0, inspectionScheduleEngine_1.resolveInspectionStatus)(i.scheduledDate, i.completedAt, i.status), isOverdue: i.scheduledDate < today && !i.completedAt }))));
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError)
            throw error;
        console.error('Error listing inspections:', error);
        throw new errorHandler_1.AppError('Error listing inspections', 500);
    }
});
exports.listInspections = listInspections;
const createInspection = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) || !((_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId)) {
            throw new errorHandler_1.AppError('Authentication required', 401);
        }
        const { propertyId, tenantId, leaseId, scheduledDate, scheduledTime, notes, frequency, type, customIntervalDays, template, checklist } = req.body;
        if (!propertyId || !scheduledDate) {
            throw new errorHandler_1.AppError('propertyId and scheduledDate are required', 400);
        }
        const property = yield Property_1.Property.findOne({
            _id: new mongoose_1.default.Types.ObjectId(propertyId),
            companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId)
        });
        if (!property) {
            throw new errorHandler_1.AppError('Property not found in your company', 404);
        }
        const scheduled = new Date(scheduledDate);
        const finalFrequency = frequency || 'quarterly';
        const inspectionType = type || 'routine';
        const next = finalFrequency === 'ad_hoc' ? undefined : (0, inspectionScheduleEngine_1.addInspectionInterval)(scheduled, finalFrequency, customIntervalDays);
        const inspection = new Inspection_1.Inspection({
            propertyId: new mongoose_1.default.Types.ObjectId(propertyId),
            tenantId: tenantId ? new mongoose_1.default.Types.ObjectId(tenantId) : undefined,
            leaseId: leaseId ? new mongoose_1.default.Types.ObjectId(leaseId) : undefined,
            companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId),
            ownerId: new mongoose_1.default.Types.ObjectId(req.user.userId),
            scheduledDate: scheduled,
            originalScheduledDate: scheduled,
            scheduledTime: scheduledTime || '',
            nextInspectionDate: next,
            notes: notes || '',
            frequency: finalFrequency,
            customIntervalDays,
            type: inspectionType,
            status: (0, inspectionScheduleEngine_1.resolveInspectionStatus)(scheduled),
            generatedBy: 'manual',
            reminders: (0, inspectionScheduleEngine_1.buildInspectionReminders)(scheduled, property.name || property.address || 'Property'),
            template: template || { name: inspectionType === 'move_out' ? 'Move-Out inspection' : 'Routine inspection' },
            checklist: Array.isArray(checklist) && checklist.length ? checklist : (0, inspectionScheduleEngine_1.defaultChecklistForInspection)(inspectionType)
        });
        yield inspection.save();
        yield (0, inspectionNotificationService_1.notifyInspectionEvent)({
            companyId: req.user.companyId,
            userId: req.user.userId,
            title: 'Inspection scheduled',
            message: `${property.name || property.address || 'Property'} inspection scheduled for ${scheduled.toLocaleDateString()}`,
            inspectionId: inspection._id,
            eventType: 'scheduled',
        });
        const populated = yield Inspection_1.Inspection.findById(inspection._id)
            .populate('propertyId', 'name address')
            .populate('tenantId', 'firstName lastName email')
            .populate('leaseId', 'startDate endDate status');
        res.status(201).json(populated);
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError)
            throw error;
        console.error('Error creating inspection:', error);
        throw new errorHandler_1.AppError('Error creating inspection', 500);
    }
});
exports.createInspection = createInspection;
const updateInspection = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) || !((_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId)) {
            throw new errorHandler_1.AppError('Authentication required', 401);
        }
        const { id } = req.params;
        if (!mongoose_1.default.Types.ObjectId.isValid(id)) {
            throw new errorHandler_1.AppError('Invalid inspection ID', 400);
        }
        const { scheduledDate, scheduledTime, nextInspectionDate, notes, tenantId, leaseId, frequency, status, type, customIntervalDays, checklist, conditionScore, conditionRating, followUpRequired } = req.body;
        const update = {};
        if (scheduledDate)
            update.scheduledDate = new Date(scheduledDate);
        if (scheduledTime !== undefined)
            update.scheduledTime = scheduledTime;
        if (nextInspectionDate)
            update.nextInspectionDate = new Date(nextInspectionDate);
        if (notes !== undefined)
            update.notes = notes;
        if (tenantId !== undefined)
            update.tenantId = tenantId ? new mongoose_1.default.Types.ObjectId(tenantId) : undefined;
        if (leaseId !== undefined)
            update.leaseId = leaseId ? new mongoose_1.default.Types.ObjectId(leaseId) : undefined;
        if (frequency)
            update.frequency = frequency;
        if (status)
            update.status = status;
        if (type)
            update.type = type;
        if (customIntervalDays !== undefined)
            update.customIntervalDays = customIntervalDays;
        if (checklist !== undefined)
            update.checklist = checklist;
        if (conditionScore !== undefined)
            update.conditionScore = Number(conditionScore);
        if (conditionRating !== undefined)
            update.conditionRating = conditionRating;
        if (followUpRequired !== undefined)
            update.followUpRequired = Boolean(followUpRequired);
        if (update.scheduledDate && !status)
            update.status = (0, inspectionScheduleEngine_1.resolveInspectionStatus)(update.scheduledDate);
        const updated = yield Inspection_1.Inspection.findOneAndUpdate({ _id: new mongoose_1.default.Types.ObjectId(id), companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId) }, update, { new: true }).populate('propertyId', 'name address').populate('tenantId', 'firstName lastName email').populate('leaseId', 'startDate endDate status');
        if (!updated) {
            throw new errorHandler_1.AppError('Inspection not found', 404);
        }
        res.json(updated);
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError)
            throw error;
        console.error('Error updating inspection:', error);
        throw new errorHandler_1.AppError('Error updating inspection', 500);
    }
});
exports.updateInspection = updateInspection;
const startInspectionExecution = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) || !((_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId))
            throw new errorHandler_1.AppError('Authentication required', 401);
        const inspection = yield Inspection_1.Inspection.findOne({ _id: req.params.id, companyId: req.user.companyId });
        if (!inspection)
            throw new errorHandler_1.AppError('Inspection not found', 404);
        inspection.checklist = Array.isArray(inspection.checklist) && inspection.checklist.length
            ? inspection.checklist
            : (0, inspectionScheduleEngine_1.defaultChecklistForInspection)((inspection.type || 'routine'));
        inspection.status = 'in_progress';
        inspection.startedAt = inspection.startedAt || new Date();
        inspection.executionTimeline = [
            ...(inspection.executionTimeline || []),
            { event: 'started', message: 'Inspection execution started', timestamp: new Date(), userId: new mongoose_1.default.Types.ObjectId(req.user.userId) }
        ];
        yield inspection.save();
        const updated = yield Inspection_1.Inspection.findById(inspection._id)
            .populate('propertyId', 'name address images')
            .populate('tenantId', 'firstName lastName email phone')
            .populate('leaseId', 'startDate endDate status');
        res.json(updated);
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError)
            throw error;
        console.error('Error starting inspection execution:', error);
        throw new errorHandler_1.AppError('Error starting inspection execution', 500);
    }
});
exports.startInspectionExecution = startInspectionExecution;
const autosaveInspectionExecution = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) || !((_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId))
            throw new errorHandler_1.AppError('Authentication required', 401);
        const { checklist, notes, report, quickDraft = true } = req.body;
        const score = calculateInspectionScore(Array.isArray(checklist) ? checklist : []);
        const update = Object.assign(Object.assign(Object.assign(Object.assign({}, (Array.isArray(checklist) ? { checklist } : {})), (notes !== undefined ? { notes } : {})), (report !== undefined ? { report } : {})), { status: quickDraft ? 'draft' : 'in_progress', startedAt: req.body.startedAt ? new Date(req.body.startedAt) : new Date(), conditionScore: score.score, conditionRating: score.rating, followUpRequired: score.followUpRequired });
        pushTimeline(update, 'autosaved', 'Inspection progress autosaved', req.user.userId, { issueCount: score.issueCount });
        const updated = yield Inspection_1.Inspection.findOneAndUpdate({ _id: req.params.id, companyId: req.user.companyId }, update, { new: true }).populate('propertyId', 'name address images').populate('tenantId', 'firstName lastName email phone').populate('leaseId', 'startDate endDate status');
        if (!updated)
            throw new errorHandler_1.AppError('Inspection not found', 404);
        res.json(updated);
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError)
            throw error;
        console.error('Error autosaving inspection execution:', error);
        throw new errorHandler_1.AppError('Error autosaving inspection execution', 500);
    }
});
exports.autosaveInspectionExecution = autosaveInspectionExecution;
const completeInspectionExecution = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) || !((_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId))
            throw new errorHandler_1.AppError('Authentication required', 401);
        const inspection = yield Inspection_1.Inspection.findOne({ _id: req.params.id, companyId: req.user.companyId });
        if (!inspection)
            throw new errorHandler_1.AppError('Inspection not found', 404);
        if (Array.isArray(req.body.checklist))
            inspection.checklist = req.body.checklist;
        if (req.body.notes !== undefined)
            inspection.notes = req.body.notes;
        if (req.body.report)
            inspection.report = Object.assign(Object.assign({}, (inspection.report || {})), req.body.report);
        const score = calculateInspectionScore(inspection.checklist || []);
        inspection.conditionScore = score.score;
        inspection.conditionRating = score.rating;
        inspection.followUpRequired = score.followUpRequired;
        inspection.status = score.followUpRequired ? 'follow_up_required' : 'completed';
        inspection.completedAt = new Date();
        inspection.completedBy = new mongoose_1.default.Types.ObjectId(req.user.userId);
        inspection.executionTimeline = [
            ...(inspection.executionTimeline || []),
            { event: 'completed', message: 'Inspection completed', timestamp: new Date(), userId: new mongoose_1.default.Types.ObjectId(req.user.userId), payload: score }
        ];
        inspection.report = Object.assign(Object.assign({}, (inspection.report || {})), { inspectedAt: inspection.completedAt, inspectorName: ((_c = req.body.report) === null || _c === void 0 ? void 0 : _c.inspectorName) || ((_d = inspection.report) === null || _d === void 0 ? void 0 : _d.inspectorName) || '', conditionSummary: ((_e = req.body.report) === null || _e === void 0 ? void 0 : _e.conditionSummary) || ((_f = inspection.report) === null || _f === void 0 ? void 0 : _f.conditionSummary) || `${score.score}% ${String(score.rating).replace('_', ' ')} condition`, issuesFound: ((_g = req.body.report) === null || _g === void 0 ? void 0 : _g.issuesFound) || ((_h = inspection.report) === null || _h === void 0 ? void 0 : _h.issuesFound) || `${score.issueCount} issue${score.issueCount === 1 ? '' : 's'} flagged`, actionsRequired: ((_j = req.body.report) === null || _j === void 0 ? void 0 : _j.actionsRequired) || ((_k = inspection.report) === null || _k === void 0 ? void 0 : _k.actionsRequired) || (score.followUpRequired ? 'Review flagged issues and create maintenance requests where required.' : 'No immediate action required.') });
        yield inspection.save();
        yield (0, inspectionNotificationService_1.notifyInspectionEvent)({
            companyId: req.user.companyId,
            userId: req.user.userId,
            title: 'Inspection completed',
            message: `Inspection completed with a ${score.score}% condition score.`,
            inspectionId: inspection._id,
            eventType: 'completed',
        });
        const updated = yield Inspection_1.Inspection.findById(inspection._id)
            .populate('propertyId', 'name address images')
            .populate('tenantId', 'firstName lastName email phone')
            .populate('leaseId', 'startDate endDate status');
        res.json(updated);
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError)
            throw error;
        console.error('Error completing inspection execution:', error);
        throw new errorHandler_1.AppError('Error completing inspection execution', 500);
    }
});
exports.completeInspectionExecution = completeInspectionExecution;
const deleteInspection = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) || !((_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId)) {
            throw new errorHandler_1.AppError('Authentication required', 401);
        }
        const { id } = req.params;
        yield Inspection_1.Inspection.findOneAndDelete({
            _id: new mongoose_1.default.Types.ObjectId(id),
            companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId)
        });
        res.json({ message: 'Inspection deleted' });
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError)
            throw error;
        console.error('Error deleting inspection:', error);
        throw new errorHandler_1.AppError('Error deleting inspection', 500);
    }
});
exports.deleteInspection = deleteInspection;
const updateInspectionReport = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) || !((_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId)) {
            throw new errorHandler_1.AppError('Authentication required', 401);
        }
        const { id } = req.params;
        const { conditionSummary, issuesFound, actionsRequired, inspectorName, inspectedAt, tenantSignature, agentSignature, conditionScore, conditionRating, followUpRequired, checklist } = req.body;
        const update = {
            report: Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, (conditionSummary !== undefined ? { conditionSummary } : {})), (issuesFound !== undefined ? { issuesFound } : {})), (actionsRequired !== undefined ? { actionsRequired } : {})), (inspectorName !== undefined ? { inspectorName } : {})), (inspectedAt ? { inspectedAt: new Date(inspectedAt) } : {})), (tenantSignature !== undefined ? { tenantSignature } : {})), (agentSignature !== undefined ? { agentSignature } : {}))
        };
        if (conditionScore !== undefined)
            update.conditionScore = Number(conditionScore);
        if (conditionRating !== undefined)
            update.conditionRating = conditionRating;
        if (followUpRequired !== undefined)
            update.followUpRequired = Boolean(followUpRequired);
        if (checklist !== undefined)
            update.checklist = checklist;
        if (inspectedAt) {
            update.completedAt = new Date(inspectedAt);
            update.status = 'completed';
        }
        const updated = yield Inspection_1.Inspection.findOneAndUpdate({ _id: id, companyId: req.user.companyId }, update, { new: true });
        if (!updated)
            throw new errorHandler_1.AppError('Inspection not found', 404);
        res.json(updated);
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError)
            throw error;
        console.error('Error updating inspection report:', error);
        throw new errorHandler_1.AppError('Error updating inspection report', 500);
    }
});
exports.updateInspectionReport = updateInspectionReport;
const generateLeaseInspections = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) || !((_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId)) {
            throw new errorHandler_1.AppError('Authentication required', 401);
        }
        const { leaseId, frequency, customIntervalDays, includeMoveIn = true, includeMoveOut = true } = req.body;
        const leaseQuery = {
            companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId),
            status: { $in: ['active', 'expiring_soon', 'pending_approval'] }
        };
        if (req.user.role === 'agent') {
            leaseQuery.ownerId = new mongoose_1.default.Types.ObjectId(req.user.userId);
        }
        if (leaseId) {
            leaseQuery._id = new mongoose_1.default.Types.ObjectId(leaseId);
        }
        const leases = yield Lease_1.Lease.find(leaseQuery).populate('propertyId', 'name address');
        const created = [];
        for (const lease of leases) {
            const propertyLabel = ((_c = lease.propertyId) === null || _c === void 0 ? void 0 : _c.name) || ((_d = lease.propertyId) === null || _d === void 0 ? void 0 : _d.address) || 'Property';
            const schedules = (0, inspectionScheduleEngine_1.generateLeaseInspectionSchedule)(lease, {
                frequency: frequency || lease.inspectionFrequency || 'quarterly',
                customIntervalDays,
                propertyLabel,
                includeMoveIn,
                includeMoveOut,
            });
            for (const schedule of schedules) {
                const exists = yield Inspection_1.Inspection.exists({
                    companyId: schedule.companyId,
                    leaseId: schedule.leaseId,
                    type: schedule.type,
                    scheduledDate: schedule.scheduledDate
                });
                if (exists)
                    continue;
                const inspection = yield Inspection_1.Inspection.create(Object.assign(Object.assign({}, schedule), { originalScheduledDate: schedule.scheduledDate, checklist: (0, inspectionScheduleEngine_1.defaultChecklistForInspection)(schedule.type), template: {
                        name: schedule.type === 'move_in'
                            ? 'Move-In inspection'
                            : schedule.type === 'move_out'
                                ? 'Move-Out inspection'
                                : 'Routine inspection'
                    } }));
                created.push(inspection);
            }
        }
        if (created.length) {
            yield (0, inspectionNotificationService_1.notifyInspectionEvent)({
                companyId: req.user.companyId,
                userId: req.user.userId,
                title: 'Lease inspection schedules generated',
                message: `${created.length} lease-driven inspection${created.length === 1 ? '' : 's'} created from active occupancy records.`,
                eventType: 'generated_from_leases',
            });
        }
        res.status(201).json({ createdCount: created.length, inspections: created });
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError)
            throw error;
        console.error('Error generating lease inspections:', error);
        throw new errorHandler_1.AppError('Error generating lease inspections', 500);
    }
});
exports.generateLeaseInspections = generateLeaseInspections;
const rescheduleInspection = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) || !((_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId)) {
            throw new errorHandler_1.AppError('Authentication required', 401);
        }
        const { id } = req.params;
        const { scheduledDate, scheduledTime, reason, tenantConfirmationNotes } = req.body;
        if (!scheduledDate || !reason) {
            throw new errorHandler_1.AppError('scheduledDate and reason are required', 400);
        }
        const inspection = yield Inspection_1.Inspection.findOne({ _id: id, companyId: req.user.companyId });
        if (!inspection)
            throw new errorHandler_1.AppError('Inspection not found', 404);
        const newDate = new Date(scheduledDate);
        const history = {
            originalDate: inspection.scheduledDate,
            newDate,
            newTime: scheduledTime || '',
            reason,
            tenantConfirmationNotes: tenantConfirmationNotes || '',
            rescheduledBy: new mongoose_1.default.Types.ObjectId(req.user.userId),
            rescheduledAt: new Date()
        };
        inspection.originalScheduledDate = inspection.originalScheduledDate || inspection.scheduledDate;
        inspection.scheduledDate = newDate;
        inspection.scheduledTime = scheduledTime || inspection.scheduledTime || '';
        inspection.status = 'rescheduled';
        inspection.rescheduleHistory = [...(inspection.rescheduleHistory || []), history];
        inspection.reminders = (0, inspectionScheduleEngine_1.buildInspectionReminders)(newDate, 'Property');
        yield inspection.save();
        yield (0, inspectionNotificationService_1.notifyInspectionEvent)({
            companyId: req.user.companyId,
            userId: req.user.userId,
            title: 'Inspection rescheduled',
            message: `Inspection moved to ${newDate.toLocaleDateString()}${scheduledTime ? ` at ${scheduledTime}` : ''}. Reason: ${reason}`,
            inspectionId: inspection._id,
            eventType: 'rescheduled',
        });
        const updated = yield Inspection_1.Inspection.findById(inspection._id)
            .populate('propertyId', 'name address')
            .populate('tenantId', 'firstName lastName email')
            .populate('leaseId', 'startDate endDate status');
        res.json(updated);
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError)
            throw error;
        console.error('Error rescheduling inspection:', error);
        throw new errorHandler_1.AppError('Error rescheduling inspection', 500);
    }
});
exports.rescheduleInspection = rescheduleInspection;
const createFollowUpInspection = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) || !((_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId)) {
            throw new errorHandler_1.AppError('Authentication required', 401);
        }
        const source = yield Inspection_1.Inspection.findOne({ _id: req.params.id, companyId: req.user.companyId });
        if (!source)
            throw new errorHandler_1.AppError('Inspection not found', 404);
        const scheduledDate = req.body.scheduledDate ? new Date(req.body.scheduledDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        const followUp = yield Inspection_1.Inspection.create({
            propertyId: source.propertyId,
            tenantId: source.tenantId,
            leaseId: source.leaseId,
            companyId: source.companyId,
            ownerId: source.ownerId,
            scheduledDate,
            originalScheduledDate: scheduledDate,
            scheduledTime: req.body.scheduledTime || '',
            frequency: 'ad_hoc',
            type: 'follow_up',
            status: (0, inspectionScheduleEngine_1.resolveInspectionStatus)(scheduledDate),
            generatedBy: 'follow_up',
            notes: req.body.notes || `Follow-up for inspection ${source._id}`,
            reminders: (0, inspectionScheduleEngine_1.buildInspectionReminders)(scheduledDate, 'Property'),
            checklist: (0, inspectionScheduleEngine_1.defaultChecklistForInspection)('follow_up'),
            template: { name: 'Follow-Up inspection' }
        });
        source.followUpRequired = true;
        source.followUpInspectionId = followUp._id;
        yield source.save();
        yield (0, inspectionNotificationService_1.notifyInspectionEvent)({
            companyId: req.user.companyId,
            userId: req.user.userId,
            title: 'Follow-up inspection created',
            message: `Follow-up inspection scheduled for ${scheduledDate.toLocaleDateString()}.`,
            inspectionId: followUp._id,
            eventType: 'follow_up_created',
        });
        res.status(201).json(followUp);
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError)
            throw error;
        console.error('Error creating follow-up inspection:', error);
        throw new errorHandler_1.AppError('Error creating follow-up inspection', 500);
    }
});
exports.createFollowUpInspection = createFollowUpInspection;
const escalateInspectionToMaintenance = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) || !((_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId)) {
            throw new errorHandler_1.AppError('Authentication required', 401);
        }
        const inspection = yield Inspection_1.Inspection.findOne({ _id: req.params.id, companyId: req.user.companyId });
        if (!inspection)
            throw new errorHandler_1.AppError('Inspection not found', 404);
        const property = yield Property_1.Property.findOne({ _id: inspection.propertyId, companyId: req.user.companyId });
        if (!property)
            throw new errorHandler_1.AppError('Property not found', 404);
        if (!property.ownerId)
            throw new errorHandler_1.AppError('Property owner not found', 404);
        const failedItems = (inspection.checklist || []).filter((item) => item.status === 'fail');
        const category = req.body.category || (((_e = (_d = (_c = failedItems[0]) === null || _c === void 0 ? void 0 : _c.category) === null || _d === void 0 ? void 0 : _d.toUpperCase) === null || _e === void 0 ? void 0 : _e.call(_d)) || 'GENERAL');
        const inspectionPhotos = (inspection.checklist || [])
            .flatMap((item) => (item.photos || []).map((p) => p.url || p))
            .filter(Boolean);
        const maintenance = yield MaintenanceRequest_1.MaintenanceRequest.create({
            propertyId: inspection.propertyId,
            requestedBy: new mongoose_1.default.Types.ObjectId(req.user.userId),
            ownerId: property.ownerId,
            companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId),
            title: req.body.title || `Inspection issue: ${inspection.type || 'routine'} inspection`,
            description: req.body.description || [
                (_f = inspection.report) === null || _f === void 0 ? void 0 : _f.issuesFound,
                `Inspection reference: ${inspection._id}`,
                failedItems.map((item) => `${item.category}: ${item.item} (${item.severity}) ${item.notes || ''}`).join('\n')
            ].filter(Boolean).join('\n\n') || 'Maintenance issue detected during inspection.',
            priority: req.body.priority || (failedItems.some((item) => item.severity === 'critical' || item.severity === 'high') ? 'high' : 'medium'),
            category,
            inspectionId: inspection._id,
            estimatedCost: Number(req.body.estimatedCost || 0),
            requestedAmount: Number(req.body.estimatedCost || 0),
            attachments: [],
            status: 'draft',
            lastActivityAt: new Date(),
        });
        for (const url of inspectionPhotos.slice(0, 10)) {
            yield MaintenanceAttachment_1.MaintenanceAttachmentRecord.create({
                requestId: maintenance._id,
                companyId: req.user.companyId,
                type: 'BEFORE',
                fileUrl: typeof url === 'string' ? url : url.url,
                uploadedBy: req.user.userId,
                uploadedAt: new Date(),
            });
        }
        yield (0, maintenanceManagementService_1.logMaintenanceActivity)({
            requestId: maintenance._id,
            companyId: req.user.companyId,
            action: 'Request Created',
            description: `Created from inspection ${inspection._id}`,
            createdBy: req.user.userId,
        });
        inspection.maintenanceRequestIds = [...(inspection.maintenanceRequestIds || []), maintenance._id];
        yield inspection.save();
        yield (0, inspectionNotificationService_1.notifyInspectionEvent)({
            companyId: req.user.companyId,
            userId: req.user.userId,
            title: 'Maintenance request created from inspection',
            message: maintenance.title || 'Inspection finding escalated to maintenance.',
            inspectionId: inspection._id,
            eventType: 'maintenance_escalated',
        });
        res.status(201).json({ inspection, maintenanceRequest: maintenance });
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError)
            throw error;
        console.error('Error escalating inspection to maintenance:', error);
        throw new errorHandler_1.AppError('Error creating maintenance request from inspection', 500);
    }
});
exports.escalateInspectionToMaintenance = escalateInspectionToMaintenance;
const dispatchInspectionReminders = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId)) {
            throw new errorHandler_1.AppError('Authentication with company required', 401);
        }
        const sentCount = yield (0, inspectionNotificationService_1.dispatchDueInspectionReminders)(req.user.companyId, req.user.role === 'agent' ? req.user.userId : undefined);
        res.json({ sentCount });
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError)
            throw error;
        console.error('Error dispatching inspection reminders:', error);
        throw new errorHandler_1.AppError('Error dispatching inspection reminders', 500);
    }
});
exports.dispatchInspectionReminders = dispatchInspectionReminders;
const getInspectionOperations = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId)) {
            throw new errorHandler_1.AppError('Authentication with company required', 401);
        }
        const query = { companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId) };
        if (req.user.role === 'agent' && req.user.userId)
            query.ownerId = new mongoose_1.default.Types.ObjectId(req.user.userId);
        const inspections = yield Inspection_1.Inspection.find(query)
            .populate('propertyId', 'name address')
            .populate('tenantId', 'firstName lastName email')
            .populate('leaseId', 'startDate endDate status')
            .sort({ scheduledDate: 1 });
        const now = new Date();
        const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const enriched = inspections.map((inspection) => (Object.assign(Object.assign({}, inspection.toObject()), { property: inspection.get('propertyId'), effectiveStatus: (0, inspectionScheduleEngine_1.resolveInspectionStatus)(inspection.scheduledDate, inspection.completedAt, inspection.status) })));
        res.json({
            dueThisWeek: enriched.filter((i) => new Date(i.scheduledDate) >= now && new Date(i.scheduledDate) <= weekEnd && i.effectiveStatus !== 'completed'),
            overdue: enriched.filter((i) => i.effectiveStatus === 'overdue'),
            rescheduled: enriched.filter((i) => i.status === 'rescheduled'),
            awaitingFollowUp: enriched.filter((i) => i.followUpRequired && !i.followUpInspectionId),
            pendingMoveOut: enriched.filter((i) => i.type === 'move_out' && i.effectiveStatus !== 'completed'),
            recentlyCompleted: enriched.filter((i) => i.effectiveStatus === 'completed').slice(0, 10),
            all: enriched,
        });
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError)
            throw error;
        console.error('Error fetching inspection operations:', error);
        throw new errorHandler_1.AppError('Error fetching inspection operations', 500);
    }
});
exports.getInspectionOperations = getInspectionOperations;
const getInspectionComplianceMetrics = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId)) {
            throw new errorHandler_1.AppError('Authentication with company required', 401);
        }
        const query = { companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId) };
        if (req.user.role === 'agent' && req.user.userId)
            query.ownerId = new mongoose_1.default.Types.ObjectId(req.user.userId);
        const inspections = yield Inspection_1.Inspection.find(query).select('scheduledDate completedAt status type conditionScore conditionRating followUpRequired');
        const enriched = inspections.map((inspection) => (Object.assign(Object.assign({}, inspection.toObject()), { effectiveStatus: (0, inspectionScheduleEngine_1.resolveInspectionStatus)(inspection.scheduledDate, inspection.completedAt, inspection.status) })));
        const total = enriched.length;
        const completed = enriched.filter((inspection) => inspection.effectiveStatus === 'completed').length;
        const overdue = enriched.filter((inspection) => inspection.effectiveStatus === 'overdue').length;
        const upcoming = enriched.filter((inspection) => ['scheduled', 'upcoming', 'due_today'].includes(inspection.effectiveStatus)).length;
        const followUpRequired = enriched.filter((inspection) => inspection.followUpRequired).length;
        const moveOutPending = enriched.filter((inspection) => inspection.type === 'move_out' && inspection.effectiveStatus !== 'completed').length;
        res.json({
            total,
            completed,
            overdue,
            upcoming,
            followUpRequired,
            moveOutPending,
            compliancePercent: total ? Math.round((completed / total) * 100) : 100,
            overduePercent: total ? Math.round((overdue / total) * 100) : 0,
            upcomingPercent: total ? Math.round((upcoming / total) * 100) : 0,
            conditionAverage: enriched.length
                ? Math.round(enriched.reduce((sum, inspection) => sum + Number(inspection.conditionScore || 0), 0) / enriched.length)
                : null
        });
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError)
            throw error;
        console.error('Error fetching inspection compliance metrics:', error);
        throw new errorHandler_1.AppError('Error fetching inspection compliance metrics', 500);
    }
});
exports.getInspectionComplianceMetrics = getInspectionComplianceMetrics;
const getInspectionCalendarEvents = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId)) {
            throw new errorHandler_1.AppError('Authentication with company required', 401);
        }
        const query = { companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId) };
        if (req.user.role === 'agent' && req.user.userId)
            query.ownerId = new mongoose_1.default.Types.ObjectId(req.user.userId);
        if (req.query.start || req.query.end) {
            query.scheduledDate = {};
            if (req.query.start)
                query.scheduledDate.$gte = new Date(String(req.query.start));
            if (req.query.end)
                query.scheduledDate.$lte = new Date(String(req.query.end));
        }
        const inspections = yield Inspection_1.Inspection.find(query)
            .populate('propertyId', 'name address')
            .populate('tenantId', 'firstName lastName email phone')
            .populate('leaseId', 'startDate endDate status')
            .sort({ scheduledDate: 1 });
        res.json(inspections.map((inspection) => {
            var _a, _b;
            const status = (0, inspectionScheduleEngine_1.resolveInspectionStatus)(inspection.scheduledDate, inspection.completedAt, inspection.status);
            return {
                id: String(inspection._id),
                title: `${((_a = inspection.propertyId) === null || _a === void 0 ? void 0 : _a.name) || ((_b = inspection.propertyId) === null || _b === void 0 ? void 0 : _b.address) || 'Property'} - ${String(inspection.type || 'routine').replace('_', ' ')}`,
                start: inspection.scheduledDate,
                end: inspection.scheduledDate,
                status,
                type: inspection.type || 'routine',
                property: inspection.propertyId,
                tenant: inspection.tenantId,
                lease: inspection.leaseId,
                inspection
            };
        }));
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError)
            throw error;
        console.error('Error fetching inspection calendar events:', error);
        throw new errorHandler_1.AppError('Error fetching inspection calendar events', 500);
    }
});
exports.getInspectionCalendarEvents = getInspectionCalendarEvents;
const getInspectionTemplates = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.json([
        { name: 'Apartment inspection', propertyType: 'residential', checklist: (0, inspectionScheduleEngine_1.defaultChecklistForInspection)('routine') },
        { name: 'Commercial inspection', propertyType: 'commercial', checklist: (0, inspectionScheduleEngine_1.defaultChecklistForInspection)('routine') },
        { name: 'Move-In inspection', propertyType: 'residential', checklist: (0, inspectionScheduleEngine_1.defaultChecklistForInspection)('move_in') },
        { name: 'Move-Out inspection', propertyType: 'residential', checklist: (0, inspectionScheduleEngine_1.defaultChecklistForInspection)('move_out') },
    ]);
});
exports.getInspectionTemplates = getInspectionTemplates;
const uploadInspectionItemPhoto = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) || !((_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId))
            throw new errorHandler_1.AppError('Authentication required', 401);
        const file = req.file;
        if (!file)
            throw new errorHandler_1.AppError('No file uploaded', 400);
        const inspection = yield Inspection_1.Inspection.findOne({ _id: req.params.id, companyId: req.user.companyId });
        if (!inspection)
            throw new errorHandler_1.AppError('Inspection not found', 404);
        const itemId = req.params.itemId;
        const item = (inspection.checklist || []).find((entry, index) => String(entry._id) === itemId || String(index) === itemId);
        if (!item)
            throw new errorHandler_1.AppError('Inspection item not found', 404);
        item.photos = item.photos || [];
        item.photos.push({
            fileName: file.originalname,
            fileType: file.mimetype,
            fileUrl: file.buffer.toString('base64'),
            caption: ((_c = req.body) === null || _c === void 0 ? void 0 : _c.caption) || '',
            category: item.category || item.room || '',
            uploadedAt: new Date(),
            uploadedBy: new mongoose_1.default.Types.ObjectId(req.user.userId),
        });
        inspection.executionTimeline = [
            ...(inspection.executionTimeline || []),
            { event: 'photo_uploaded', message: `Photo uploaded for ${item.room || item.category}: ${item.item}`, timestamp: new Date(), userId: new mongoose_1.default.Types.ObjectId(req.user.userId) }
        ];
        yield inspection.save();
        res.status(201).json(inspection);
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError)
            throw error;
        console.error('Error uploading inspection item photo:', error);
        throw new errorHandler_1.AppError('Error uploading inspection item photo', 500);
    }
});
exports.uploadInspectionItemPhoto = uploadInspectionItemPhoto;
const getInspectionReportHtml = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId))
            throw new errorHandler_1.AppError('Authentication with company required', 401);
        const inspection = yield Inspection_1.Inspection.findOne({ _id: req.params.id, companyId: req.user.companyId })
            .populate('propertyId', 'name address')
            .populate('tenantId', 'firstName lastName email phone')
            .populate('leaseId', 'startDate endDate status');
        if (!inspection)
            throw new errorHandler_1.AppError('Inspection not found', 404);
        const grouped = (inspection.checklist || []).reduce((acc, item) => {
            const room = item.room || item.category || 'Inspection';
            acc[room] = acc[room] || [];
            acc[room].push(item);
            return acc;
        }, {});
        const property = inspection.propertyId;
        const tenant = inspection.tenantId;
        const lease = inspection.leaseId;
        const html = `
      <html>
        <head>
          <title>Inspection Report</title>
          <style>
            body { font-family: Arial, sans-serif; color: #0f172a; margin: 32px; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 24px; }
            .brand { font-size: 24px; font-weight: 800; color: #2563eb; }
            .muted { color: #64748b; font-size: 12px; }
            .card { border: 1px solid #e2e8f0; border-radius: 14px; padding: 16px; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border-bottom: 1px solid #e2e8f0; padding: 8px; text-align: left; font-size: 12px; }
            th { background: #f8fafc; color: #475569; }
            .score { font-size: 34px; font-weight: 900; color: #2563eb; }
            .status { font-weight: 700; text-transform: capitalize; }
            @media print { body { margin: 18px; } .no-print { display: none; } }
          </style>
        </head>
        <body>
          <button class="no-print" onclick="window.print()">Print / Save PDF</button>
          <div class="header">
            <div>
              <div class="brand">Mantis Property Management</div>
              <div class="muted">Inspection Report</div>
            </div>
            <div>
              <div class="score">${(_b = inspection.conditionScore) !== null && _b !== void 0 ? _b : 100}%</div>
              <div class="muted">${escapeHtml(String(inspection.conditionRating || 'good').replace('_', ' '))}</div>
            </div>
          </div>
          <div class="card">
            <h2>${escapeHtml((property === null || property === void 0 ? void 0 : property.name) || (property === null || property === void 0 ? void 0 : property.address) || 'Property')}</h2>
            <p>${escapeHtml((property === null || property === void 0 ? void 0 : property.address) || '')}</p>
            <p><strong>Tenant:</strong> ${escapeHtml(`${(tenant === null || tenant === void 0 ? void 0 : tenant.firstName) || ''} ${(tenant === null || tenant === void 0 ? void 0 : tenant.lastName) || ''}`.trim() || 'N/A')} ${(tenant === null || tenant === void 0 ? void 0 : tenant.phone) ? `(${escapeHtml(tenant.phone)})` : ''}</p>
            <p><strong>Lease:</strong> ${(lease === null || lease === void 0 ? void 0 : lease.startDate) ? `${new Date(lease.startDate).toLocaleDateString()} - ${new Date(lease.endDate).toLocaleDateString()}` : 'Legacy / no lease'}</p>
            <p><strong>Inspection date:</strong> ${inspection.completedAt ? inspection.completedAt.toLocaleDateString() : inspection.scheduledDate.toLocaleDateString()}</p>
          </div>
          ${Object.entries(grouped).map(([room, items]) => `
            <div class="card">
              <h3>${escapeHtml(room)}</h3>
              <table>
                <thead><tr><th>Item</th><th>Status</th><th>Severity</th><th>Notes</th></tr></thead>
                <tbody>${items.map((item) => `<tr><td>${escapeHtml(item.item)}</td><td class="status">${escapeHtml(String(item.status).replace('_', ' '))}</td><td>${escapeHtml(item.severity || '')}</td><td>${escapeHtml(item.notes || '')}</td></tr>`).join('')}</tbody>
              </table>
            </div>
          `).join('')}
          <div class="card">
            <h3>Summary</h3>
            <p>${escapeHtml(((_c = inspection.report) === null || _c === void 0 ? void 0 : _c.conditionSummary) || '')}</p>
            <h3>Issues</h3>
            <p>${escapeHtml(((_d = inspection.report) === null || _d === void 0 ? void 0 : _d.issuesFound) || '')}</p>
            <h3>Recommendations</h3>
            <p>${escapeHtml(((_e = inspection.report) === null || _e === void 0 ? void 0 : _e.actionsRequired) || '')}</p>
          </div>
        </body>
      </html>
    `;
        inspection.executionTimeline = [
            ...(inspection.executionTimeline || []),
            { event: 'pdf_generated', message: 'Printable report generated', timestamp: new Date(), userId: ((_f = req.user) === null || _f === void 0 ? void 0 : _f.userId) ? new mongoose_1.default.Types.ObjectId(req.user.userId) : undefined }
        ];
        yield inspection.save();
        res.type('html').send(html);
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError)
            throw error;
        console.error('Error generating inspection report:', error);
        throw new errorHandler_1.AppError('Error generating inspection report', 500);
    }
});
exports.getInspectionReportHtml = getInspectionReportHtml;
const uploadInspectionAttachment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) || !((_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId)) {
            throw new errorHandler_1.AppError('Authentication required', 401);
        }
        const { id } = req.params;
        const file = req.file;
        if (!file)
            throw new errorHandler_1.AppError('No file uploaded', 400);
        const fileDoc = {
            fileName: file.originalname,
            fileType: file.mimetype,
            fileUrl: file.buffer.toString('base64'),
            uploadedAt: new Date(),
            uploadedBy: req.user.userId,
        };
        const updated = yield Inspection_1.Inspection.findOneAndUpdate({ _id: id, companyId: req.user.companyId }, { $push: { attachments: fileDoc } }, { new: true });
        if (!updated)
            throw new errorHandler_1.AppError('Inspection not found', 404);
        res.status(201).json(updated);
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError)
            throw error;
        console.error('Error uploading inspection attachment:', error);
        throw new errorHandler_1.AppError('Error uploading inspection attachment', 500);
    }
});
exports.uploadInspectionAttachment = uploadInspectionAttachment;
