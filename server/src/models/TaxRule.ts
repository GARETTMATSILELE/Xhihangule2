import mongoose, { Schema, Document, Types } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export const TAX_RULE_STATUSES = ['ACTIVE', 'SUPERSEDED', 'DRAFT'] as const;
export type TaxRuleStatus = (typeof TAX_RULE_STATUSES)[number];

export interface ITaxRule extends Document {
  jurisdiction: string;
  taxType: string;
  ruleCode: string;
  version: number;
  description: string;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  rate?: number | null;
  supplyTreatment?: string | null;
  calculationMethod?: string | null;
  sourceReference: string;
  sourceDocument?: string | null;
  notes?: string | null;
  status: TaxRuleStatus;
  createdBy?: Types.ObjectId | null;
  updatedBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const TaxRuleSchema = new Schema<ITaxRule>(
  {
    jurisdiction: { type: String, required: true, default: 'ZW', index: true, trim: true },
    taxType: { type: String, required: true, index: true, trim: true },
    ruleCode: { type: String, required: true, index: true, trim: true, uppercase: true },
    version: { type: Number, required: true, min: 1, default: 1 },
    description: { type: String, required: true, trim: true },
    effectiveFrom: { type: Date, required: true, index: true },
    effectiveTo: { type: Date, default: null },
    rate: { type: Number, required: false, min: 0, default: null },
    supplyTreatment: { type: String, required: false, default: null, trim: true },
    calculationMethod: { type: String, required: false, default: null, trim: true },
    sourceReference: { type: String, required: true, trim: true },
    sourceDocument: { type: String, required: false, default: null, trim: true },
    notes: { type: String, required: false, default: null, trim: true },
    status: { type: String, enum: TAX_RULE_STATUSES, default: 'ACTIVE', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { timestamps: true }
);

TaxRuleSchema.index({ ruleCode: 1, version: 1 }, { unique: true });
TaxRuleSchema.index({ taxType: 1, effectiveFrom: 1, status: 1 });
TaxRuleSchema.index({ jurisdiction: 1, taxType: 1, effectiveFrom: 1 });

export const TaxRule = mongoose.model<ITaxRule>('TaxRule', TaxRuleSchema, COLLECTIONS.TAX_RULES);
