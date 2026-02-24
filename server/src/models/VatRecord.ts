import mongoose, { Schema, Document, Types } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export interface IVatRecord extends Document {
  companyId: Types.ObjectId;
  transactionId: string;
  sourceType: string;
  vatCollected: number;
  vatPaid: number;
  vatRate: number;
  filingPeriod: string;
  status: 'pending' | 'submitted';
  createdAt: Date;
}

const VatRecordSchema = new Schema<IVatRecord>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    transactionId: { type: String, required: true },
    sourceType: { type: String, required: true },
    vatCollected: { type: Number, default: 0, min: 0 },
    vatPaid: { type: Number, default: 0, min: 0 },
    vatRate: { type: Number, default: 0, min: 0 },
    filingPeriod: { type: String, required: true },
    status: { type: String, enum: ['pending', 'submitted'], default: 'pending' }
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);

VatRecordSchema.index({ companyId: 1, filingPeriod: 1 });
VatRecordSchema.index({ companyId: 1, status: 1 });
VatRecordSchema.index({ companyId: 1, transactionId: 1, sourceType: 1 }, { unique: true });

export const VatRecord = mongoose.model<IVatRecord>(
  'VatRecord',
  VatRecordSchema,
  COLLECTIONS.VAT_RECORDS
);
