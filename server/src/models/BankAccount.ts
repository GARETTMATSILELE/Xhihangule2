import mongoose, { Schema, Document, Types } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export interface IBankAccount extends Document {
  companyId: Types.ObjectId;
  name: string;
  accountNumber: string;
  currentBalance: number;
  lastReconciledDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const BankAccountSchema = new Schema<IBankAccount>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    name: { type: String, required: true, trim: true },
    accountNumber: { type: String, required: true, trim: true },
    currentBalance: { type: Number, default: 0 },
    lastReconciledDate: { type: Date, required: false }
  },
  { timestamps: true }
);

BankAccountSchema.index({ companyId: 1, accountNumber: 1 }, { unique: true });

export const BankAccount = mongoose.model<IBankAccount>(
  'BankAccount',
  BankAccountSchema,
  COLLECTIONS.BANK_ACCOUNTS
);
