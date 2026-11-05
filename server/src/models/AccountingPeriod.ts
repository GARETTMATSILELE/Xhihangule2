import mongoose, { Schema, Document, Types } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export type AccountingPeriodStatus = 'OPEN' | 'SOFT_CLOSED' | 'CLOSED';

export interface IAccountingPeriod extends Document {
  companyId: Types.ObjectId;
  financialYear: number;
  /** Calendar month 1–12. Stored again as month so the identity index matches the activation key. */
  period: number;
  month: number;
  periodStart: Date;
  periodEnd: Date;
  startDate: Date;
  endDate: Date;
  status: AccountingPeriodStatus;
  createdBy?: Types.ObjectId;
  closedBy?: Types.ObjectId;
  closedAt?: Date;
  closeReason?: string;
  reopenedBy?: Types.ObjectId;
  reopenedAt?: Date;
  reopenReason?: string;
  reopeningReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AccountingPeriodSchema = new Schema<IAccountingPeriod>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    financialYear: { type: Number, required: true, min: 1900, max: 2100 },
    period: { type: Number, required: true, min: 1, max: 12 },
    month: { type: Number, required: true, min: 1, max: 12 },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    status: {
      type: String,
      enum: ['OPEN', 'SOFT_CLOSED', 'CLOSED'],
      required: true,
      default: 'OPEN',
      index: true
    },
    closedBy: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    closedAt: { type: Date, required: false },
    closeReason: { type: String, required: false, trim: true },
    reopenedBy: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    reopenedAt: { type: Date, required: false },
    reopenReason: { type: String, required: false, trim: true },
    reopeningReason: { type: String, required: false, trim: true }
  },
  { timestamps: true }
);

AccountingPeriodSchema.index({ companyId: 1, periodStart: 1, periodEnd: 1 }, { unique: true });
AccountingPeriodSchema.index(
  { companyId: 1, financialYear: 1, month: 1 },
  { unique: true, name: 'company_financial_year_month_unique' }
);
AccountingPeriodSchema.index({ companyId: 1, status: 1, periodStart: -1 });

export const AccountingPeriod = mongoose.model<IAccountingPeriod>(
  'AccountingPeriod',
  AccountingPeriodSchema,
  COLLECTIONS.ACCOUNTING_PERIODS
);
