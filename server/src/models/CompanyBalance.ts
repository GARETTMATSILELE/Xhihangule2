import mongoose, { Schema, Document, Types } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export interface ICompanyBalance extends Document {
  _id: string;
  companyId: Types.ObjectId;
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  vatPayable: number;
  commissionLiability: number;
  lastUpdated: Date;
}

const CompanyBalanceSchema = new Schema<ICompanyBalance>(
  {
    _id: { type: String, required: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, unique: true },
    totalRevenue: { type: Number, default: 0 },
    totalExpenses: { type: Number, default: 0 },
    netProfit: { type: Number, default: 0 },
    vatPayable: { type: Number, default: 0 },
    commissionLiability: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now }
  },
  { versionKey: false }
);

CompanyBalanceSchema.index({ companyId: 1 }, { unique: true });
CompanyBalanceSchema.index({ lastUpdated: -1 });

export const getCompanyBalanceId = (companyId: string): string => `${companyId}:company_financials`;

export const CompanyBalance = mongoose.model<ICompanyBalance>(
  'CompanyBalance',
  CompanyBalanceSchema,
  COLLECTIONS.COMPANY_BALANCES
);
