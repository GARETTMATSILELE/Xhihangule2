import mongoose, { Schema, Document, Types } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export interface IJournalLine extends Document {
  companyId: Types.ObjectId;
  journalEntryId: Types.ObjectId;
  accountId: Types.ObjectId;
  debit: number;
  credit: number;
  runningBalanceSnapshot: number;
  propertyId?: Types.ObjectId;
  agentId?: Types.ObjectId;
  createdAt: Date;
}

const JournalLineSchema = new Schema<IJournalLine>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    journalEntryId: { type: Schema.Types.ObjectId, ref: 'JournalEntry', required: true },
    accountId: { type: Schema.Types.ObjectId, ref: 'ChartOfAccount', required: true },
    debit: { type: Number, default: 0, min: 0 },
    credit: { type: Number, default: 0, min: 0 },
    runningBalanceSnapshot: { type: Number, required: true, default: 0 },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: false },
    agentId: { type: Schema.Types.ObjectId, ref: 'User', required: false }
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);

JournalLineSchema.index({ companyId: 1, accountId: 1, createdAt: -1 });
JournalLineSchema.index({ companyId: 1, journalEntryId: 1 });

JournalLineSchema.pre('validate', function(next) {
  const debit = Number(this.debit || 0);
  const credit = Number(this.credit || 0);
  if ((debit > 0 && credit > 0) || (debit <= 0 && credit <= 0)) {
    return next(new Error('Each journal line must have either debit or credit.'));
  }
  return next();
});

export const JournalLine = mongoose.model<IJournalLine>(
  'JournalLine',
  JournalLineSchema,
  COLLECTIONS.JOURNAL_LINES
);
