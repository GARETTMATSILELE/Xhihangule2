import mongoose, { Schema, Document } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export type InspectionFrequency = 'monthly' | 'quarterly' | 'biannual' | 'annual' | 'custom' | 'ad_hoc';
export type InspectionType = 'move_in' | 'routine' | 'follow_up' | 'move_out' | 'emergency' | 'maintenance';
export type InspectionStatus = 'scheduled' | 'upcoming' | 'due_today' | 'overdue' | 'in_progress' | 'draft' | 'completed' | 'reviewed' | 'follow_up_required' | 'missed' | 'rescheduled' | 'cancelled';
export type ConditionRating = 'excellent' | 'good' | 'needs_attention' | 'critical';
export type InspectionItemStatus = 'pending' | 'ok' | 'attention_required' | 'damaged' | 'missing' | 'not_working' | 'repaired' | 'na' | 'pass' | 'fail' | 'not_applicable';

export interface IInspection extends Document {
  propertyId: mongoose.Types.ObjectId;
  tenantId?: mongoose.Types.ObjectId;
  leaseId?: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId; // agent user who manages this
  scheduledDate: Date;
  scheduledTime?: string;
  originalScheduledDate?: Date;
  nextInspectionDate?: Date;
  startedAt?: Date;
  completedAt?: Date;
  completedBy?: mongoose.Types.ObjectId;
  notes?: string;
  frequency: InspectionFrequency;
  customIntervalDays?: number;
  type?: InspectionType;
  status?: InspectionStatus;
  generatedBy?: 'manual' | 'lease_activation' | 'lease_termination' | 'recurrence' | 'follow_up';
  recurrenceGroupId?: mongoose.Types.ObjectId;
  reminders?: Array<{
    type: 'agent' | 'tenant';
    remindAt: Date;
    status: 'pending' | 'sent' | 'dismissed';
    message?: string;
  }>;
  rescheduleHistory?: Array<{
    originalDate: Date;
    newDate: Date;
    newTime?: string;
    reason: string;
    tenantConfirmationNotes?: string;
    rescheduledBy?: mongoose.Types.ObjectId;
    rescheduledAt: Date;
  }>;
  template?: {
    name?: string;
    propertyType?: string;
  };
  checklist?: Array<{
    room?: string;
    category: string;
    item: string;
    status: InspectionItemStatus;
    notes?: string;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    photos?: Array<{
      fileName: string;
      fileType: string;
      fileUrl: string;
      caption?: string;
      category?: string;
      uploadedAt: Date;
      uploadedBy: mongoose.Types.ObjectId;
    }>;
  }>;
  conditionScore?: number;
  conditionRating?: ConditionRating;
  followUpRequired?: boolean;
  followUpInspectionId?: mongoose.Types.ObjectId;
  sourceMaintenanceRequestId?: mongoose.Types.ObjectId;
  maintenanceRequestIds?: mongoose.Types.ObjectId[];
  executionTimeline?: Array<{
    event: 'started' | 'autosaved' | 'photo_uploaded' | 'issue_created' | 'completed' | 'pdf_generated' | 'maintenance_escalated';
    message?: string;
    timestamp: Date;
    userId?: mongoose.Types.ObjectId;
    payload?: any;
  }>;
  // Report fields
  report?: {
    conditionSummary?: string;
    issuesFound?: string;
    actionsRequired?: string;
    inspectorName?: string;
    inspectedAt?: Date;
    tenantSignature?: string;
    agentSignature?: string;
  };
  attachments?: Array<{
    _id?: mongoose.Types.ObjectId;
    fileName: string;
    fileType: string;
    fileUrl: string; // store base64 or external URL
    uploadedAt: Date;
    uploadedBy: mongoose.Types.ObjectId;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const InspectionSchema: Schema = new Schema({
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant' },
  leaseId: { type: Schema.Types.ObjectId, ref: 'Lease', default: null },
  companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, immutable: true },
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  scheduledDate: { type: Date, required: true },
  scheduledTime: { type: String, default: '' },
  originalScheduledDate: { type: Date },
  nextInspectionDate: { type: Date },
  startedAt: { type: Date },
  completedAt: { type: Date },
  completedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  notes: { type: String, default: '' },
  frequency: { type: String, enum: ['monthly', 'quarterly', 'biannual', 'annual', 'custom', 'ad_hoc'], default: 'quarterly' },
  customIntervalDays: { type: Number, min: 1 },
  type: { type: String, enum: ['move_in', 'routine', 'follow_up', 'move_out', 'emergency', 'maintenance'], default: 'routine' },
  status: { type: String, enum: ['scheduled', 'upcoming', 'due_today', 'overdue', 'in_progress', 'draft', 'completed', 'reviewed', 'follow_up_required', 'missed', 'rescheduled', 'cancelled'], default: 'scheduled' },
  generatedBy: { type: String, enum: ['manual', 'lease_activation', 'lease_termination', 'recurrence', 'follow_up'], default: 'manual' },
  recurrenceGroupId: { type: Schema.Types.ObjectId },
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
    rescheduledBy: { type: Schema.Types.ObjectId, ref: 'User' },
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
      uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
    }]
  }],
  conditionScore: { type: Number, min: 0, max: 100 },
  conditionRating: { type: String, enum: ['excellent', 'good', 'needs_attention', 'critical'] },
  followUpRequired: { type: Boolean, default: false },
  followUpInspectionId: { type: Schema.Types.ObjectId, ref: 'Inspection' },
  sourceMaintenanceRequestId: { type: Schema.Types.ObjectId, ref: 'MaintenanceRequest', index: true },
  maintenanceRequestIds: [{ type: Schema.Types.ObjectId, ref: 'MaintenanceRequest' }],
  executionTimeline: [{
    event: {
      type: String,
      enum: ['started', 'autosaved', 'photo_uploaded', 'issue_created', 'completed', 'pdf_generated', 'maintenance_escalated'],
      required: true
    },
    message: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    payload: { type: Schema.Types.Mixed }
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
      uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
    }
  ],
}, { timestamps: true });

InspectionSchema.index({ ownerId: 1 });
InspectionSchema.index({ companyId: 1 });
InspectionSchema.index({ companyId: 1, leaseId: 1, scheduledDate: 1 });
InspectionSchema.index({ propertyId: 1, scheduledDate: -1 });
InspectionSchema.index({ status: 1, scheduledDate: 1 });
InspectionSchema.index({ nextInspectionDate: 1 });

export const Inspection = mongoose.model<IInspection>('Inspection', InspectionSchema, COLLECTIONS.INSPECTIONS || 'inspections');


