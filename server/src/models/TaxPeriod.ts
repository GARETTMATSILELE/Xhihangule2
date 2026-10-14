import mongoose, { Schema, Document, Types } from 'mongoose';
import { COLLECTIONS } from '../config/collections';
import { TAX_PERIOD_STATUSES, TAX_PERIOD_TAX_TYPES, type TaxPeriodStatus, type TaxPeriodTaxType } from '../services/tax/taxMetadataTypes';

export interface ITaxPeriod extends Document {
  companyId: Types.ObjectId;
  taxType: TaxPeriodTaxType;
  periodKey: string;
  periodStart: Date;
  periodEnd: Date;
  status: TaxPeriodStatus;
  currency: string;
  openedAt: Date;
  openedBy?: Types.ObjectId | null;
  closedAt?: Date | null;
  closedBy?: Types.ObjectId | null;
  reviewedAt?: Date | null;
  reviewedBy?: Types.ObjectId | null;
  notes?: string;
  accountingPeriodId?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const TaxPeriodSchema = new Schema<ITaxPeriod>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    taxType: { type: String, enum: TAX_PERIOD_TAX_TYPES, required: true, index: true },
    periodKey: { type: String, required: true, index: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    status: { type: String, enum: TAX_PERIOD_STATUSES, default: 'OPEN', index: true },
    currency: { type: String, default: 'USD', trim: true },
    openedAt: { type: Date, required: true, default: () => new Date() },
    openedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    closedAt: { type: Date, default: null },
    closedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    notes: { type: String, trim: true },
    accountingPeriodId: { type: Schema.Types.ObjectId, ref: 'AccountingPeriod', default: null }
  },
  { timestamps: true }
);

TaxPeriodSchema.index({ companyId: 1, taxType: 1, periodKey: 1 }, { unique: true });
TaxPeriodSchema.index({ companyId: 1, taxType: 1, periodStart: 1, periodEnd: 1 });
TaxPeriodSchema.index({ companyId: 1, status: 1, periodStart: -1 });

export const TaxPeriod = mongoose.model<ITaxPeriod>('TaxPeriod', TaxPeriodSchema, COLLECTIONS.TAX_PERIODS);
