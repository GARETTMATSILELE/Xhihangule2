import mongoose, { Document, Schema } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export type TrustTransactionType =
  | 'BUYER_PAYMENT'
  | 'TRANSFER_TO_SELLER'
  | 'CGT_DEDUCTION'
  | 'COMMISSION_DEDUCTION'
  | 'VAT_DEDUCTION'
  | 'VAT_ON_COMMISSION'
  | 'REFUND';

export interface ITrustTransaction extends Document {
  companyId: mongoose.Types.ObjectId;
  trustAccountId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  paymentId?: mongoose.Types.ObjectId;
  type: TrustTransactionType;
  debit: number;
  credit: number;
  vatComponent?: number;
  runningBalance: number;
  reference?: string;
  sourceEvent?: string;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const TrustTransactionSchema: Schema<ITrustTransaction> = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, immutable: true, index: true },
    trustAccountId: { type: Schema.Types.ObjectId, ref: 'TrustAccount', required: true, immutable: true, index: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true, immutable: true, index: true },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: false, immutable: true, index: true },
    type: {
      type: String,
      enum: ['BUYER_PAYMENT', 'TRANSFER_TO_SELLER', 'CGT_DEDUCTION', 'COMMISSION_DEDUCTION', 'VAT_DEDUCTION', 'VAT_ON_COMMISSION', 'REFUND'],
      required: true,
      index: true
    },
    debit: { type: Number, required: true, default: 0, min: 0 },
    credit: { type: Number, required: true, default: 0, min: 0 },
    vatComponent: { type: Number, required: false, min: 0, default: 0 },
    runningBalance: { type: Number, required: true },
    reference: { type: String, required: false, trim: true },
    sourceEvent: { type: String, required: false, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: false, immutable: true }
  },
  { timestamps: true }
);

TrustTransactionSchema.index({ trustAccountId: 1, createdAt: -1 });
TrustTransactionSchema.index({ companyId: 1, propertyId: 1, createdAt: -1 });
TrustTransactionSchema.index({ companyId: 1, type: 1, createdAt: -1 });
TrustTransactionSchema.index(
  { paymentId: 1 },
  { unique: true, partialFilterExpression: { paymentId: { $exists: true, $type: 'objectId' } } }
);

TrustTransactionSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function (next) {
  return next(new Error('Trust transactions are immutable. Create a correcting entry instead.'));
});

export const TrustTransaction = mongoose.model<ITrustTransaction>(
  'TrustTransaction',
  TrustTransactionSchema,
  COLLECTIONS.TRUST_TRANSACTIONS
);
