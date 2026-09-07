import mongoose, { Schema, Document, Types } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export type TaxType = 'VAT';

export interface ITaxRate extends Document {
  companyId: Types.ObjectId;
  taxType: TaxType;
  /** Percentage rate, e.g. 15.5 for 15.5%. Never used as a 0–1 decimal. */
  rate: number;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  isActive: boolean;
  createdBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const TaxRateSchema = new Schema<ITaxRate>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    taxType: { type: String, enum: ['VAT'], required: true, default: 'VAT', index: true },
    rate: {
      type: Number,
      required: true,
      min: [0, 'VAT rate cannot be negative']
    },
    effectiveFrom: { type: Date, required: true, index: true },
    effectiveTo: { type: Date, default: null },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { timestamps: true }
);

TaxRateSchema.index({ companyId: 1, taxType: 1, effectiveFrom: 1 });
TaxRateSchema.index({ companyId: 1, taxType: 1, isActive: 1 });

export const TaxRate = mongoose.model<ITaxRate>(
  'TaxRate',
  TaxRateSchema,
  COLLECTIONS.TAX_RATES
);
