import mongoose, { Document, Schema } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export type TaxType = 'CGT' | 'VAT' | 'VAT_ON_COMMISSION';

export interface ITaxRecord extends Document {
  companyId: mongoose.Types.ObjectId;
  trustAccountId: mongoose.Types.ObjectId;
  taxType: TaxType;
  amount: number;
  calculationBreakdown?: Record<string, unknown>;
  paidToZimra: boolean;
  paymentReference?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TaxRecordSchema: Schema<ITaxRecord> = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, immutable: true, index: true },
    trustAccountId: { type: Schema.Types.ObjectId, ref: 'TrustAccount', required: true, immutable: true, index: true },
    taxType: { type: String, enum: ['CGT', 'VAT', 'VAT_ON_COMMISSION'], required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    calculationBreakdown: { type: Schema.Types.Mixed, required: false },
    paidToZimra: { type: Boolean, required: true, default: false, index: true },
    paymentReference: { type: String, required: false, trim: true }
  },
  { timestamps: true }
);

TaxRecordSchema.index({ companyId: 1, trustAccountId: 1, taxType: 1, createdAt: -1 });

export const TaxRecord = mongoose.model<ITaxRecord>('TaxRecord', TaxRecordSchema, COLLECTIONS.TAX_RECORDS);
