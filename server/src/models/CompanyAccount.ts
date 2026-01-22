import { Schema, Document, Types } from 'mongoose';
import { accountingConnection } from '../config/database';

/**
 * SECURITY NOTE
 *  - Company account transactions form an immutable ledger.
 *  - We forbid any in-place edits/removals of existing items.
 *  - Only appends to the transactions array are allowed.
 */
export type CompanyTransactionType = 'income' | 'expense';
export type CompanyIncomeSource = 'rental_commission' | 'sales_commission' | 'other';
export type CompanyPaymentMethod = 'cash' | 'bank_transfer' | 'credit_card' | 'mobile_money' | 'other';

export interface CompanyTransaction {
  _id?: Types.ObjectId;
  type: CompanyTransactionType;
  source?: CompanyIncomeSource;
  amount: number;
  date: Date;
  currency?: 'USD' | 'ZWL' | string;
  paymentMethod?: CompanyPaymentMethod;
  paymentId?: Types.ObjectId;
  referenceNumber?: string;
  description?: string;
  processedBy?: Types.ObjectId;
  notes?: string;
  // Soft archive flag for duplicate/correction entries
  isArchived?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ICompanyAccount extends Document {
  companyId: Types.ObjectId;
  transactions: CompanyTransaction[];
  runningBalance: number;
  totalIncome: number;
  totalExpenses: number;
  lastUpdated?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CompanyTransactionSchema = new Schema<CompanyTransaction>({
  type: { type: String, enum: ['income', 'expense'], required: true },
  source: { type: String, enum: ['rental_commission', 'sales_commission', 'other'], required: false },
  amount: { type: Number, required: true },
  date: { type: Date, required: true },
  currency: { type: String, required: false, default: 'USD' },
  paymentMethod: { type: String, required: false },
  paymentId: { type: Schema.Types.ObjectId, required: false },
  referenceNumber: { type: String },
  description: { type: String },
  processedBy: { type: Schema.Types.ObjectId, required: false },
  notes: { type: String },
  isArchived: { type: Boolean, default: false },
}, { timestamps: true });

const CompanyAccountSchema = new Schema<ICompanyAccount>({
  companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  transactions: { type: [CompanyTransactionSchema], default: [] },
  runningBalance: { type: Number, default: 0 },
  totalIncome: { type: Number, default: 0 },
  totalExpenses: { type: Number, default: 0 },
  lastUpdated: { type: Date },
}, { timestamps: true });

CompanyAccountSchema.index({ companyId: 1, 'transactions.date': -1 });
// Prevent double-posting the same payment into company ledger (ignore archived duplicates)
CompanyAccountSchema.index(
  { companyId: 1, 'transactions.paymentId': 1 },
  { unique: true, partialFilterExpression: { 'transactions.isArchived': { $ne: true } } }
);

// Immutability guard for update operations
function isIllegalCompanyLedgerMutation(update: Record<string, any>): boolean {
  const illegalSetters = ['$set', '$unset', '$inc'];
  const illegalRemovers = ['$pull', '$pullAll', '$pop'];
  const allowedAppends = ['$push', '$addToSet'];
  const root = 'transactions';
  const startsWithRoot = (k: string) => k === root || k.startsWith(`${root}.`) || k.startsWith(`${root}.$`);

  for (const op of illegalSetters) {
    const payload = (update as any)[op];
    if (!payload) continue;
    for (const path of Object.keys(payload)) {
      if (startsWithRoot(path)) return true;
    }
  }
  for (const op of illegalRemovers) {
    const payload = (update as any)[op];
    if (!payload) continue;
    for (const path of Object.keys(payload)) {
      if (startsWithRoot(path)) return true;
    }
  }
  for (const op of allowedAppends) {
    const payload = (update as any)[op];
    if (!payload) continue;
    for (const path of Object.keys(payload)) {
      if (path !== root) return true; // only allow appending at root transactions
    }
  }
  return false;
}

CompanyAccountSchema.pre(['updateOne','updateMany','findOneAndUpdate'], function(next) {
  try {
    const update = (this as any).getUpdate?.() || {};
    if (isIllegalCompanyLedgerMutation(update)) {
      return next(new Error('CompanyAccount ledger is immutable. Use correction entries; do not mutate or delete history.'));
    }
    return next();
  } catch (e) {
    return next(e as any);
  }
});

export const CompanyAccount = accountingConnection.model<ICompanyAccount>('CompanyAccount', CompanyAccountSchema, 'companyaccounts');


