import mongoose, { Document, Schema, Types } from 'mongoose';
import { COLLECTIONS } from '../config/collections';
import type { CanonicalTaxType } from '../services/tax/taxTypes';

export type TaxPaymentStatus = 'DRAFT' | 'POSTED' | 'REVERSED';

export interface ITaxPaymentAllocation {
  taxObligationId: Types.ObjectId;
  taxType: CanonicalTaxType;
  taxPeriod?: string;
  amount: number;
}

export interface ITaxPayment extends Document {
  companyId: Types.ObjectId;
  amount: number;
  currency: string;
  paymentDate: Date;
  bankAccountCode: string;
  zimraReference?: string;
  paymentReference?: string;
  notes?: string;
  status: TaxPaymentStatus;
  allocations: ITaxPaymentAllocation[];
  unallocatedAmount?: number;
  unallocatedReason?: string;
  journalEntryId?: string;
  receiptFileName?: string;
  receiptContentType?: string;
  receiptData?: Buffer;
  receiptUploadedAt?: Date;
  receiptUploadedBy?: Types.ObjectId;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const TaxPaymentSchema = new Schema<ITaxPayment>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    amount: { type: Number, required: true, min: 0.01 },
    currency: { type: String, default: 'USD' },
    paymentDate: { type: Date, required: true, default: () => new Date() },
    bankAccountCode: { type: String, required: true, default: '1001' },
    zimraReference: { type: String, trim: true },
    paymentReference: { type: String, trim: true },
    notes: { type: String, trim: true },
    status: { type: String, enum: ['DRAFT', 'POSTED', 'REVERSED'], default: 'POSTED', index: true },
    allocations: [
      {
        taxObligationId: { type: Schema.Types.ObjectId, ref: 'TaxObligation', required: true },
        taxType: { type: String, required: true },
        taxPeriod: { type: String, required: false },
        amount: { type: Number, required: true, min: 0.01 }
      }
    ],
    unallocatedAmount: { type: Number, required: false, min: 0, default: 0 },
    unallocatedReason: { type: String, trim: true },
    journalEntryId: { type: String, required: false },
    receiptFileName: { type: String },
    receiptContentType: { type: String },
    receiptData: { type: Buffer, select: false },
    receiptUploadedAt: { type: Date },
    receiptUploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true }
);

TaxPaymentSchema.index({ companyId: 1, paymentDate: -1 });
TaxPaymentSchema.index({ companyId: 1, 'allocations.taxObligationId': 1 });

export const TaxPayment = mongoose.model<ITaxPayment>(
  'TaxPayment',
  TaxPaymentSchema,
  (COLLECTIONS as any).TAX_PAYMENTS || 'taxpayments'
);
