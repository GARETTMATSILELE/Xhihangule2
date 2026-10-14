import mongoose, { Schema, Document, Types } from 'mongoose';
import { COLLECTIONS } from '../config/collections';
import { EVIDENCE_DOCUMENT_TYPES, EVIDENCE_STATUSES } from '../services/tax/complianceTypes';

export interface IIndividualTaxEvidence extends Document {
  companyId: Types.ObjectId;
  taxYear: number;
  taxPeriodId?: Types.ObjectId | null;
  taxPeriodKey?: string | null;
  taxType: string;
  sourceType: string;
  sourceId: string;
  documentId: Types.ObjectId;
  documentType: string;
  documentStatus: string;
  description?: string | null;
  uploadedBy?: Types.ObjectId | null;
  uploadedAt: Date;
  reviewStatus: string;
  reviewedBy?: Types.ObjectId | null;
  reviewedAt?: Date | null;
  auditEventId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const IndividualTaxEvidenceSchema = new Schema<IIndividualTaxEvidence>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true, immutable: true },
    taxYear: { type: Number, required: true, index: true },
    taxPeriodId: { type: Schema.Types.ObjectId, ref: 'TaxPeriod', default: null },
    taxPeriodKey: { type: String, default: null, index: true },
    taxType: { type: String, required: true, index: true },
    sourceType: { type: String, required: true },
    sourceId: { type: String, required: true, index: true },
    documentId: { type: Schema.Types.ObjectId, ref: 'File', required: true, index: true },
    documentType: { type: String, enum: EVIDENCE_DOCUMENT_TYPES, default: 'OTHER' },
    documentStatus: { type: String, enum: EVIDENCE_STATUSES, default: 'UPLOADED', index: true },
    description: { type: String, default: null, trim: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    uploadedAt: { type: Date, required: true, default: () => new Date() },
    reviewStatus: { type: String, default: 'REQUIRES_REVIEW', index: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    auditEventId: { type: String, default: null }
  },
  { timestamps: true }
);

IndividualTaxEvidenceSchema.index({ companyId: 1, taxYear: 1, taxType: 1 });
IndividualTaxEvidenceSchema.index({ companyId: 1, sourceType: 1, sourceId: 1 });
IndividualTaxEvidenceSchema.index({ companyId: 1, documentId: 1, sourceId: 1 }, { unique: true });

export const IndividualTaxEvidence = mongoose.model<IIndividualTaxEvidence>(
  'IndividualTaxEvidence',
  IndividualTaxEvidenceSchema,
  COLLECTIONS.INDIVIDUAL_TAX_EVIDENCE
);
