import mongoose, { Schema, Document, Types } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export const INCOME_TAX_PAYMENT_STATUSES = ['POSTED', 'REVERSED'] as const;
export type IncomeTaxPaymentStatus = (typeof INCOME_TAX_PAYMENT_STATUSES)[number];

export interface IIndividualIncomeTaxPayment extends Document {
  companyId: Types.ObjectId;
  ownerId?: Types.ObjectId | null;
  propertyId?: Types.ObjectId | null;
  taxPeriodId?: Types.ObjectId | null;
  taxPeriodKey: string;
  taxType: 'INCOME_TAX';
  amount: number;
  currency: string;
  paymentDate: Date;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  zimraReference?: string | null;
  documentId?: string | null;
  notes?: string | null;
  status: IncomeTaxPaymentStatus;
  recordedBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const IndividualIncomeTaxPaymentSchema = new Schema<IIndividualIncomeTaxPayment>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true, immutable: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', default: null, index: true },
    taxPeriodId: { type: Schema.Types.ObjectId, ref: 'TaxPeriod', default: null, index: true },
    taxPeriodKey: { type: String, required: true, index: true },
    taxType: { type: String, enum: ['INCOME_TAX'], default: 'INCOME_TAX', required: true },
    amount: { type: Number, required: true, min: 0.01 },
    currency: { type: String, default: 'USD' },
    paymentDate: { type: Date, required: true },
    paymentMethod: { type: String, default: null, trim: true },
    paymentReference: { type: String, default: null, trim: true },
    zimraReference: { type: String, default: null, trim: true },
    documentId: { type: String, default: null, trim: true },
    notes: { type: String, default: null, trim: true },
    status: { type: String, enum: INCOME_TAX_PAYMENT_STATUSES, default: 'POSTED', index: true },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { timestamps: true }
);

IndividualIncomeTaxPaymentSchema.index({ companyId: 1, taxPeriodKey: 1, paymentDate: -1 });
IndividualIncomeTaxPaymentSchema.index({ companyId: 1, taxPeriodId: 1, status: 1 });

export const IndividualIncomeTaxPayment = mongoose.model<IIndividualIncomeTaxPayment>(
  'IndividualIncomeTaxPayment',
  IndividualIncomeTaxPaymentSchema,
  COLLECTIONS.INDIVIDUAL_INCOME_TAX_PAYMENTS
);
