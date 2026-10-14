import mongoose, { Document, Schema, Types } from 'mongoose';
import { COLLECTIONS } from '../config/collections';
import {
  TAX_STATUSES,
  TAX_TYPES,
  type CanonicalTaxType,
  type TaxObligationStatus
} from '../services/tax/taxTypes';

export interface ITaxObligation extends Document {
  companyId: Types.ObjectId;
  taxType: CanonicalTaxType;
  entityType: string;
  entityId?: string;
  propertyId?: Types.ObjectId;
  ownerId?: Types.ObjectId;
  sellerId?: Types.ObjectId;
  tenantId?: Types.ObjectId;
  paymentId?: Types.ObjectId;
  saleId?: Types.ObjectId;
  transactionId?: string;
  taxPeriod: string;
  transactionDate: Date;
  currency: string;
  taxCurrency?: string;
  exchangeRate?: number;
  exchangeRateSource?: string;
  exchangeRateDate?: Date;
  functionalAmount?: number;
  taxableAmount: number;
  taxRate: number;
  taxAmount: number;
  calculationBasis: string;
  calculationSnapshot?: Record<string, unknown>;
  status: TaxObligationStatus;
  calculatedAt: Date;
  withheldAt?: Date;
  dueDate?: Date;
  submittedAt?: Date;
  paidAt?: Date;
  reconciledAt?: Date;
  zimraReference?: string;
  paymentReference?: string;
  receiptDocumentId?: string;
  sourceLedger?: string;
  glAccount?: string;
  journalEntryId?: string;
  createdBy?: Types.ObjectId;
  approvedBy?: Types.ObjectId;
  reversalOf?: Types.ObjectId;
  reversedByObligationId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const TaxObligationSchema = new Schema<ITaxObligation>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true, immutable: true },
    taxType: { type: String, enum: TAX_TYPES, required: true, index: true },
    entityType: { type: String, required: true, default: 'payment' },
    entityId: { type: String, required: false },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: false, index: true },
    ownerId: { type: Schema.Types.ObjectId, required: false },
    sellerId: { type: Schema.Types.ObjectId, required: false },
    tenantId: { type: Schema.Types.ObjectId, required: false },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: false, index: true },
    saleId: { type: Schema.Types.ObjectId, required: false },
    transactionId: { type: String, required: false, index: true },
    taxPeriod: { type: String, required: true, index: true },
    transactionDate: { type: Date, required: true, index: true },
    currency: { type: String, default: 'USD' },
    taxCurrency: { type: String, required: false },
    exchangeRate: { type: Number, required: false },
    exchangeRateSource: { type: String, required: false },
    exchangeRateDate: { type: Date, required: false },
    functionalAmount: { type: Number, required: false },
    taxableAmount: { type: Number, required: true, default: 0 },
    taxRate: { type: Number, required: true, default: 0 },
    taxAmount: { type: Number, required: true, min: 0 },
    calculationBasis: { type: String, required: true },
    calculationSnapshot: { type: Schema.Types.Mixed, required: false },
    status: { type: String, enum: TAX_STATUSES, required: true, default: 'CALCULATED', index: true },
    calculatedAt: { type: Date, required: true, default: () => new Date() },
    withheldAt: { type: Date, required: false },
    dueDate: { type: Date, required: false },
    submittedAt: { type: Date, required: false },
    paidAt: { type: Date, required: false },
    reconciledAt: { type: Date, required: false },
    zimraReference: { type: String, required: false, trim: true },
    paymentReference: { type: String, required: false, trim: true },
    receiptDocumentId: { type: String, required: false },
    sourceLedger: { type: String, required: false },
    glAccount: { type: String, required: false },
    journalEntryId: { type: String, required: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    reversalOf: { type: Schema.Types.ObjectId, ref: 'TaxObligation', required: false, index: true },
    reversedByObligationId: { type: Schema.Types.ObjectId, ref: 'TaxObligation', required: false }
  },
  { timestamps: true }
);

TaxObligationSchema.index({ companyId: 1, taxType: 1, taxPeriod: 1, status: 1 });
TaxObligationSchema.index(
  { companyId: 1, paymentId: 1, taxType: 1, reversalOf: 1 },
  { unique: true, sparse: true }
);

export const TaxObligation = mongoose.model<ITaxObligation>(
  'TaxObligation',
  TaxObligationSchema,
  (COLLECTIONS as any).TAX_OBLIGATIONS || 'taxobligations'
);
