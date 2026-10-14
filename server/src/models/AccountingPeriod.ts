import mongoose, { Schema, Document, Types } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export type AccountingPeriodStatus = 'OPEN' | 'SOFT_CLOSED' | 'CLOSED';

export interface IAccountingPeriod extends Document {
  companyId: Types.ObjectId;
  periodStart: Date;
  periodEnd: Date;
  status: AccountingPeriodStatus;
  closedBy?: Types.ObjectId;
  closedAt?: Date;
  closeReason?: string;
  reopenedBy?: Types.ObjectId;
  reopenedAt?: Date;
  reopenReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AccountingPeriodSchema = new Schema<IAccountingPeriod>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
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
    reopenReason: { type: String, required: false, trim: true }
  },
  { timestamps: true }
);

AccountingPeriodSchema.index({ companyId: 1, periodStart: 1, periodEnd: 1 }, { unique: true });
AccountingPeriodSchema.index({ companyId: 1, status: 1, periodStart: -1 });

export const AccountingPeriod = mongoose.model<IAccountingPeriod>(
  'AccountingPeriod',
  AccountingPeriodSchema,
  COLLECTIONS.ACCOUNTING_PERIODS
);
