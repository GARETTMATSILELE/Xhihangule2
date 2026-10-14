import mongoose, { Schema, Document, Types } from 'mongoose';
import { COLLECTIONS } from '../config/collections';
import { COMPLIANCE_ISSUE_TYPES, COMPLIANCE_REVIEW_STATUSES, COMPLIANCE_SEVERITIES } from '../services/tax/complianceTypes';

export interface IIndividualTaxComplianceReview extends Document {
  companyId: Types.ObjectId;
  taxYear: number;
  taxPeriodKey?: string | null;
  taxType: string;
  propertyId?: Types.ObjectId | null;
  sourceType: string;
  sourceId: string;
  issueType: string;
  severity: string;
  description: string;
  status: string;
  assignedTo?: Types.ObjectId | null;
  decision?: string | null;
  comment?: string | null;
  evidenceId?: Types.ObjectId | null;
  waiverReason?: string | null;
  createdBy?: Types.ObjectId | null;
  resolvedBy?: Types.ObjectId | null;
  resolvedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const IndividualTaxComplianceReviewSchema = new Schema<IIndividualTaxComplianceReview>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true, immutable: true },
    taxYear: { type: Number, required: true, index: true },
    taxPeriodKey: { type: String, default: null, index: true },
    taxType: { type: String, required: true, index: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', default: null },
    sourceType: { type: String, required: true },
    sourceId: { type: String, required: true },
    issueType: { type: String, enum: COMPLIANCE_ISSUE_TYPES, required: true },
    severity: { type: String, enum: COMPLIANCE_SEVERITIES, default: 'WARNING' },
    description: { type: String, required: true, trim: true },
    status: { type: String, enum: COMPLIANCE_REVIEW_STATUSES, default: 'OPEN', index: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    decision: { type: String, default: null, trim: true },
    comment: { type: String, default: null, trim: true },
    evidenceId: { type: Schema.Types.ObjectId, ref: 'IndividualTaxEvidence', default: null },
    waiverReason: { type: String, default: null, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

IndividualTaxComplianceReviewSchema.index({ companyId: 1, taxYear: 1, status: 1 });
IndividualTaxComplianceReviewSchema.index({ companyId: 1, sourceType: 1, sourceId: 1 });
IndividualTaxComplianceReviewSchema.index(
  { companyId: 1, taxYear: 1, taxType: 1, sourceType: 1, sourceId: 1, issueType: 1 },
  { unique: true }
);

IndividualTaxComplianceReviewSchema.pre('deleteOne', { document: false, query: true }, function (next) {
  next(new Error('Hard delete is disabled for tax compliance reviews.'));
});
IndividualTaxComplianceReviewSchema.pre('deleteMany', { document: false, query: true }, function (next) {
  next(new Error('Hard delete is disabled for tax compliance reviews.'));
});

export const IndividualTaxComplianceReview = mongoose.model<IIndividualTaxComplianceReview>(
  'IndividualTaxComplianceReview',
  IndividualTaxComplianceReviewSchema,
  COLLECTIONS.INDIVIDUAL_TAX_COMPLIANCE_REVIEWS
);
