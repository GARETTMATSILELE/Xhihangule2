import mongoose, { Document, Schema } from 'mongoose';
import { COLLECTIONS } from '../config/collections';
import type { TaxType } from './TaxRecord';

export interface ITaxPayout extends Document {
  companyId: mongoose.Types.ObjectId;
  trustAccountId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  taxType: TaxType;
  amount: number;
  payoutDate: Date;
  reference?: string;
  notes?: string;
  receiptFileName?: string;
  receiptContentType?: string;
  receiptData?: Buffer;
  receiptUploadedAt?: Date;
  receiptUploadedBy?: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const TaxPayoutSchema: Schema<ITaxPayout> = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    trustAccountId: { type: Schema.Types.ObjectId, ref: 'TrustAccount', required: true, index: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    taxType: { type: String, enum: ['CGT', 'VAT', 'VAT_ON_COMMISSION'], required: true, index: true },
    amount: { type: Number, required: true, min: 0.01 },
    payoutDate: { type: Date, required: true, default: () => new Date() },
    reference: { type: String, trim: true },
    notes: { type: String, trim: true },
    receiptFileName: { type: String },
    receiptContentType: { type: String },
    receiptData: { type: Buffer, select: false },
    receiptUploadedAt: { type: Date },
    receiptUploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true }
);

TaxPayoutSchema.index({ companyId: 1, taxType: 1, propertyId: 1, payoutDate: -1 });

export const TaxPayout = mongoose.model<ITaxPayout>(
  'TaxPayout',
  TaxPayoutSchema,
  (COLLECTIONS as any).TAX_PAYOUTS || 'taxpayouts'
);

