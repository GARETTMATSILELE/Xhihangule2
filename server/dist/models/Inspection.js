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
Object.defineProperty(exports, "__esModule", { value: true });
exports.Inspection = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const collections_1 = require("../config/collections");
const InspectionSchema = new mongoose_1.Schema({
    propertyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Property', required: true },
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant' },
    leaseId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Lease', default: null },
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, immutable: true },
    ownerId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    scheduledDate: { type: Date, required: true },
    scheduledTime: { type: String, default: '' },
    originalScheduledDate: { type: Date },
    nextInspectionDate: { type: Date },
    startedAt: { type: Date },
    completedAt: { type: Date },
    completedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String, default: '' },
    frequency: { type: String, enum: ['monthly', 'quarterly', 'biannual', 'annual', 'custom', 'ad_hoc'], default: 'quarterly' },
    customIntervalDays: { type: Number, min: 1 },
    type: { type: String, enum: ['move_in', 'routine', 'follow_up', 'move_out', 'emergency', 'maintenance'], default: 'routine' },
    status: { type: String, enum: ['scheduled', 'upcoming', 'due_today', 'overdue', 'in_progress', 'draft', 'completed', 'reviewed', 'follow_up_required', 'missed', 'rescheduled', 'cancelled'], default: 'scheduled' },
    generatedBy: { type: String, enum: ['manual', 'lease_activation', 'lease_termination', 'recurrence', 'follow_up'], default: 'manual' },
    recurrenceGroupId: { type: mongoose_1.Schema.Types.ObjectId },
    reminders: [{
            type: { type: String, enum: ['agent', 'tenant'], default: 'agent' },
            remindAt: { type: Date, required: true },
            status: { type: String, enum: ['pending', 'sent', 'dismissed'], default: 'pending' },
            message: { type: String, default: '' }
        }],
    rescheduleHistory: [{
            originalDate: { type: Date, required: true },
            newDate: { type: Date, required: true },
            newTime: { type: String, default: '' },
            reason: { type: String, required: true },
            tenantConfirmationNotes: { type: String, default: '' },
            rescheduledBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
            rescheduledAt: { type: Date, default: Date.now }
        }],
    template: {
        name: { type: String, default: '' },
        propertyType: { type: String, default: '' }
    },
    checklist: [{
            room: { type: String, default: '' },
            category: { type: String, required: true },
            item: { type: String, required: true },
            status: { type: String, enum: ['pending', 'ok', 'attention_required', 'damaged', 'missing', 'not_working', 'repaired', 'na', 'pass', 'fail', 'not_applicable'], default: 'pending' },
            notes: { type: String, default: '' },
            severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'low' },
            photos: [{
                    fileName: { type: String, required: true },
                    fileType: { type: String, required: true },
                    fileUrl: { type: String, required: true },
                    caption: { type: String, default: '' },
                    category: { type: String, default: '' },
                    uploadedAt: { type: Date, default: () => new Date() },
                    uploadedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true }
                }]
        }],
    conditionScore: { type: Number, min: 0, max: 100 },
    conditionRating: { type: String, enum: ['excellent', 'good', 'needs_attention', 'critical'] },
    followUpRequired: { type: Boolean, default: false },
    followUpInspectionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Inspection' },
    sourceMaintenanceRequestId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'MaintenanceRequest', index: true },
    maintenanceRequestIds: [{ type: mongoose_1.Schema.Types.ObjectId, ref: 'MaintenanceRequest' }],
    executionTimeline: [{
            event: {
                type: String,
                enum: ['started', 'autosaved', 'photo_uploaded', 'issue_created', 'completed', 'pdf_generated', 'maintenance_escalated'],
                required: true
            },
            message: { type: String, default: '' },
            timestamp: { type: Date, default: Date.now },
            userId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
            payload: { type: mongoose_1.Schema.Types.Mixed }
        }],
    report: {
        conditionSummary: { type: String, default: '' },
        issuesFound: { type: String, default: '' },
        actionsRequired: { type: String, default: '' },
        inspectorName: { type: String, default: '' },
        inspectedAt: { type: Date },
        tenantSignature: { type: String, default: '' },
        agentSignature: { type: String, default: '' },
    },
    attachments: [
        {
            fileName: { type: String, required: true },
            fileType: { type: String, required: true },
            fileUrl: { type: String, required: true },
            uploadedAt: { type: Date, default: () => new Date() },
            uploadedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true }
        }
    ],
}, { timestamps: true });
InspectionSchema.index({ ownerId: 1 });
InspectionSchema.index({ companyId: 1 });
InspectionSchema.index({ companyId: 1, leaseId: 1, scheduledDate: 1 });
InspectionSchema.index({ propertyId: 1, scheduledDate: -1 });
InspectionSchema.index({ status: 1, scheduledDate: 1 });
InspectionSchema.index({ nextInspectionDate: 1 });
exports.Inspection = mongoose_1.default.model('Inspection', InspectionSchema, collections_1.COLLECTIONS.INSPECTIONS || 'inspections');
