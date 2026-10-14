import mongoose, { Document, Schema, Types } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export type VatReturnStatus = 'OPEN' | 'PREPARED' | 'REVIEWED' | 'SUBMITTED' | 'PAID' | 'RECONCILED';

export interface IVatReturn extends Document {
  companyId: Types.ObjectId;
  filingPeriod: string;
  status: VatReturnStatus;
  taxableSupplies: number;
  exemptSupplies: number;
  zeroRatedSupplies: number;
  outputVat: number;
  inputVat: number;
  vatOnCommission: number;
  vatOnSales: number;
  vatWithholdingCredits: number;
  adjustments: number;
  netVatPayable: number;
  glOutputVat?: number;
  obligationOutputVat?: number;
  reconciliationDifference?: number;
  reconciliationStatus?: 'MATCHED' | 'RECONCILIATION_REQUIRED' | 'TIMING_DIFFERENCE';
  reconciliationNote?: string;
  zimraReturnReference?: string;
  submittedAt?: Date;
  amountSubmitted?: number;
  paymentDate?: Date;
  paymentReference?: string;
  receiptDocumentId?: string;
  notes?: string;
  preparedBy?: Types.ObjectId;
  reviewedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const VatReturnSchema = new Schema<IVatReturn>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    filingPeriod: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['OPEN', 'PREPARED', 'REVIEWED', 'SUBMITTED', 'PAID', 'RECONCILED'],
      default: 'OPEN',
      index: true
    },
    taxableSupplies: { type: Number, default: 0 },
    exemptSupplies: { type: Number, default: 0 },
    zeroRatedSupplies: { type: Number, default: 0 },
    outputVat: { type: Number, default: 0 },
    inputVat: { type: Number, default: 0 },
    vatOnCommission: { type: Number, default: 0 },
    vatOnSales: { type: Number, default: 0 },
    vatWithholdingCredits: { type: Number, default: 0 },
    adjustments: { type: Number, default: 0 },
    netVatPayable: { type: Number, default: 0 },
    glOutputVat: { type: Number, default: 0 },
    obligationOutputVat: { type: Number, default: 0 },
    reconciliationDifference: { type: Number, default: 0 },
    reconciliationStatus: { type: String, enum: ['MATCHED', 'RECONCILIATION_REQUIRED', 'TIMING_DIFFERENCE'], required: false },
    reconciliationNote: { type: String, trim: true },
    zimraReturnReference: { type: String, trim: true },
    submittedAt: { type: Date },
    amountSubmitted: { type: Number },
    paymentDate: { type: Date },
    paymentReference: { type: String, trim: true },
    receiptDocumentId: { type: String },
    notes: { type: String, trim: true },
    preparedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

VatReturnSchema.index({ companyId: 1, filingPeriod: 1 }, { unique: true });

export const VatReturn = mongoose.model<IVatReturn>(
  'VatReturn',
  VatReturnSchema,
  (COLLECTIONS as any).VAT_RETURNS || 'vatreturns'
);
