import mongoose, { Schema, Document, Types } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export type AccountType = 'revenue' | 'expense' | 'asset' | 'liability' | 'equity';

export interface IChartOfAccount extends Document {
  companyId: Types.ObjectId;
  code: string;
  name: string;
  type: AccountType;
  parentAccountId?: Types.ObjectId;
  balance: number;
  currency: 'USD' | 'ZWL';
  isActive: boolean;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ChartOfAccountSchema = new Schema<IChartOfAccount>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['revenue', 'expense', 'asset', 'liability', 'equity'],
      required: true
    },
    parentAccountId: { type: Schema.Types.ObjectId, ref: 'ChartOfAccount', required: false },
    balance: { type: Number, default: 0 },
    currency: { type: String, enum: ['USD', 'ZWL'], default: 'USD' },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, required: false }
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

ChartOfAccountSchema.index({ companyId: 1, code: 1 }, { unique: true });
ChartOfAccountSchema.index({ companyId: 1, type: 1 });
ChartOfAccountSchema.index({ companyId: 1, parentAccountId: 1 });

// Prevent hard deletes to keep auditability.
ChartOfAccountSchema.pre('deleteOne', { document: false, query: true }, function(next) {
  next(new Error('Hard delete is disabled for chart of accounts. Use soft delete.'));
});
ChartOfAccountSchema.pre('deleteMany', { document: false, query: true }, function(next) {
  next(new Error('Hard delete is disabled for chart of accounts. Use soft delete.'));
});
ChartOfAccountSchema.pre('findOneAndDelete', function(next) {
  next(new Error('Hard delete is disabled for chart of accounts. Use soft delete.'));
});

export const ChartOfAccount = mongoose.model<IChartOfAccount>(
  'ChartOfAccount',
  ChartOfAccountSchema,
  COLLECTIONS.CHART_OF_ACCOUNTS
);
