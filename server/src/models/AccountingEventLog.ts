import mongoose, { Schema, Document, Types } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export interface IAccountingEventLog extends Document {
  companyId: Types.ObjectId;
  eventType: string;
  sourceModule: string;
  sourceId?: string;
  success: boolean;
  message?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const AccountingEventLogSchema = new Schema<IAccountingEventLog>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    eventType: { type: String, required: true },
    sourceModule: { type: String, required: true },
    sourceId: { type: String, required: false },
    success: { type: Boolean, default: true },
    message: { type: String, required: false },
    metadata: { type: Schema.Types.Mixed, required: false }
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);

AccountingEventLogSchema.index({ companyId: 1, createdAt: -1 });
AccountingEventLogSchema.index({ companyId: 1, sourceModule: 1, sourceId: 1 });

AccountingEventLogSchema.pre('save', function(next) {
  if (!this.isNew && this.isModified()) {
    return next(new Error('Accounting event logs are immutable.'));
  }
  return next();
});
AccountingEventLogSchema.pre('deleteOne', { document: false, query: true }, function(next) {
  next(new Error('Hard delete is disabled for accounting event logs.'));
});
AccountingEventLogSchema.pre('deleteMany', { document: false, query: true }, function(next) {
  next(new Error('Hard delete is disabled for accounting event logs.'));
});
AccountingEventLogSchema.pre('findOneAndDelete', function(next) {
  next(new Error('Hard delete is disabled for accounting event logs.'));
});

export const AccountingEventLog = mongoose.model<IAccountingEventLog>(
  'AccountingEventLog',
  AccountingEventLogSchema,
  COLLECTIONS.ACCOUNTING_EVENT_LOGS
);
