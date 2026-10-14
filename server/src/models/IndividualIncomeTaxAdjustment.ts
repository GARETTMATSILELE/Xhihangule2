import mongoose, { Schema, Document, Types } from 'mongoose';
import { COLLECTIONS } from '../config/collections';
import { INCOME_TAX_ADJUSTMENT_TYPES } from '../services/tax/incomeTaxTypes';

export const INCOME_TAX_ADJUSTMENT_STATUSES = ['PENDING', 'APPROVED', 'REVERSED'] as const;
export type IncomeTaxAdjustmentStatus = (typeof INCOME_TAX_ADJUSTMENT_STATUSES)[number];

export interface IIndividualIncomeTaxAdjustment extends Document {
  companyId: Types.ObjectId;
  ownerId?: Types.ObjectId | null;
  propertyId?: Types.ObjectId | null;
  taxPeriodId?: Types.ObjectId | null;
  taxPeriodKey: string;
  taxType: 'INCOME_TAX';
  adjustmentType: string;
  amount: number;
  currency: string;
  reason: string;
  explanation?: string | null;
  sourceTransactionIds: string[];
  supportingDocumentIds: string[];
  ruleId?: string | null;
  ruleVersion?: number | null;
  sourceReference?: string | null;
  status: IncomeTaxAdjustmentStatus;
  reviewStatus: string;
  createdBy?: Types.ObjectId | null;
  approvedBy?: Types.ObjectId | null;
  approvedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const IndividualIncomeTaxAdjustmentSchema = new Schema<IIndividualIncomeTaxAdjustment>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true, immutable: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', default: null, index: true },
    taxPeriodId: { type: Schema.Types.ObjectId, ref: 'TaxPeriod', default: null, index: true },
    taxPeriodKey: { type: String, required: true, index: true },
    taxType: { type: String, enum: ['INCOME_TAX'], default: 'INCOME_TAX', required: true },
    adjustmentType: { type: String, enum: INCOME_TAX_ADJUSTMENT_TYPES, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
    reason: { type: String, required: true, trim: true },
    explanation: { type: String, default: null, trim: true },
    sourceTransactionIds: { type: [String], default: [] },
    supportingDocumentIds: { type: [String], default: [] },
    ruleId: { type: String, default: null },
    ruleVersion: { type: Number, default: null },
    sourceReference: { type: String, default: null },
    status: { type: String, enum: INCOME_TAX_ADJUSTMENT_STATUSES, default: 'PENDING', index: true },
    reviewStatus: { type: String, default: 'REVIEW_REQUIRED', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

IndividualIncomeTaxAdjustmentSchema.index({ companyId: 1, taxPeriodKey: 1, status: 1 });
IndividualIncomeTaxAdjustmentSchema.index({ companyId: 1, taxPeriodId: 1 });

export const IndividualIncomeTaxAdjustment = mongoose.model<IIndividualIncomeTaxAdjustment>(
  'IndividualIncomeTaxAdjustment',
  IndividualIncomeTaxAdjustmentSchema,
  COLLECTIONS.INDIVIDUAL_INCOME_TAX_ADJUSTMENTS
);
