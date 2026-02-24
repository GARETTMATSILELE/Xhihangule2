import mongoose, { Schema, Document, Types } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export interface IBankTransaction extends Document {
  companyId: Types.ObjectId;
  bankAccountId: Types.ObjectId;
  amount: number;
  reference: string;
  matched: boolean;
  matchedTransactionId?: string;
  transactionDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

const BankTransactionSchema = new Schema<IBankTransaction>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    bankAccountId: { type: Schema.Types.ObjectId, ref: 'BankAccount', required: true },
    amount: { type: Number, required: true },
    reference: { type: String, required: true },
    matched: { type: Boolean, default: false },
    matchedTransactionId: { type: String, required: false },
    transactionDate: { type: Date, required: true }
  },
  { timestamps: true }
);

BankTransactionSchema.index({ companyId: 1, bankAccountId: 1, matched: 1 });

export const BankTransaction = mongoose.model<IBankTransaction>(
  'BankTransaction',
  BankTransactionSchema,
  COLLECTIONS.BANK_TRANSACTIONS
);
