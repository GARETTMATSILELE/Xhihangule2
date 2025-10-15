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
exports.uploadInspectionAttachment = exports.updateInspectionReport = exports.deleteInspection = exports.updateInspection = exports.createInspection = exports.listInspections = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const errorHandler_1 = require("../middleware/errorHandler");
const Inspection_1 = require("../models/Inspection");
const Property_1 = require("../models/Property");
const addQuarter = (date) => {
    const d = new Date(date);
    d.setMonth(d.getMonth() + 3);
    return d;
};
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
        const inspections = yield Inspection_1.Inspection.find(query)
            .populate('propertyId', 'name address')
            .populate('tenantId', 'firstName lastName email')
            .sort({ scheduledDate: -1 });
        res.json(inspections.map(i => (Object.assign(Object.assign({}, i.toObject()), { property: i.get('propertyId') }))));
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
        const { propertyId, tenantId, scheduledDate, notes, frequency } = req.body;
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
        const next = (frequency || 'quarterly') === 'quarterly' ? addQuarter(scheduled) : undefined;
        const inspection = new Inspection_1.Inspection({
            propertyId: new mongoose_1.default.Types.ObjectId(propertyId),
            tenantId: tenantId ? new mongoose_1.default.Types.ObjectId(tenantId) : undefined,
            companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId),
            ownerId: new mongoose_1.default.Types.ObjectId(req.user.userId),
            scheduledDate: scheduled,
            nextInspectionDate: next,
            notes: notes || '',
            frequency: frequency || 'quarterly'
        });
        yield inspection.save();
        const populated = yield Inspection_1.Inspection.findById(inspection._id)
            .populate('propertyId', 'name address')
            .populate('tenantId', 'firstName lastName email');
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
        const { scheduledDate, nextInspectionDate, notes, tenantId, frequency } = req.body;
        const update = {};
        if (scheduledDate)
            update.scheduledDate = new Date(scheduledDate);
        if (nextInspectionDate)
            update.nextInspectionDate = new Date(nextInspectionDate);
        if (notes !== undefined)
            update.notes = notes;
        if (tenantId !== undefined)
            update.tenantId = tenantId ? new mongoose_1.default.Types.ObjectId(tenantId) : undefined;
        if (frequency)
            update.frequency = frequency;
        const updated = yield Inspection_1.Inspection.findOneAndUpdate({ _id: new mongoose_1.default.Types.ObjectId(id), companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId) }, update, { new: true }).populate('propertyId', 'name address').populate('tenantId', 'firstName lastName email');
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
        const { conditionSummary, issuesFound, actionsRequired, inspectorName, inspectedAt } = req.body;
        const update = {
            report: Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, (conditionSummary !== undefined ? { conditionSummary } : {})), (issuesFound !== undefined ? { issuesFound } : {})), (actionsRequired !== undefined ? { actionsRequired } : {})), (inspectorName !== undefined ? { inspectorName } : {})), (inspectedAt ? { inspectedAt: new Date(inspectedAt) } : {}))
        };
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
