import mongoose, { Schema, Document } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export type InspectionFrequency = 'quarterly' | 'ad_hoc';

export interface IInspection extends Document {
  propertyId: mongoose.Types.ObjectId;
  tenantId?: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId; // agent user who manages this
  scheduledDate: Date;
  nextInspectionDate?: Date;
  notes?: string;
  frequency: InspectionFrequency;
  // Report fields
  report?: {
    conditionSummary?: string;
    issuesFound?: string;
    actionsRequired?: string;
    inspectorName?: string;
    inspectedAt?: Date;
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
  companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, immutable: true },
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  scheduledDate: { type: Date, required: true },
  nextInspectionDate: { type: Date },
  notes: { type: String, default: '' },
  frequency: { type: String, enum: ['quarterly', 'ad_hoc'], default: 'quarterly' },
  report: {
    conditionSummary: { type: String, default: '' },
    issuesFound: { type: String, default: '' },
    actionsRequired: { type: String, default: '' },
    inspectorName: { type: String, default: '' },
    inspectedAt: { type: Date },
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
InspectionSchema.index({ propertyId: 1, scheduledDate: -1 });
InspectionSchema.index({ nextInspectionDate: 1 });

export const Inspection = mongoose.model<IInspection>('Inspection', InspectionSchema, COLLECTIONS.INSPECTIONS || 'inspections');


