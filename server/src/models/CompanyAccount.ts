import { Schema, Document, Types } from 'mongoose';
import { accountingConnection } from '../config/database';

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

export const CompanyAccount = accountingConnection.model<ICompanyAccount>('CompanyAccount', CompanyAccountSchema, 'companyaccounts');


