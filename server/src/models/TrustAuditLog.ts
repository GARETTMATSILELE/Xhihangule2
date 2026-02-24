import mongoose, { Document, Schema } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export interface ITrustAuditLog extends Document {
  companyId: mongoose.Types.ObjectId;
  entityType: string;
  entityId: string;
  action: string;
  sourceEvent?: string;
  migrationId?: string;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  performedBy?: mongoose.Types.ObjectId;
  timestamp: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TrustAuditLogSchema = new Schema<ITrustAuditLog>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, immutable: true, index: true },
    entityType: { type: String, required: true, index: true },
    entityId: { type: String, required: true, index: true },
    action: { type: String, required: true, index: true },
    sourceEvent: { type: String, required: false, index: true },
    migrationId: { type: String, required: false, index: true },
    oldValue: { type: Schema.Types.Mixed, required: false, default: null },
    newValue: { type: Schema.Types.Mixed, required: false, default: null },
    performedBy: { type: Schema.Types.ObjectId, ref: 'User', required: false, immutable: true },
    timestamp: { type: Date, required: true, default: () => new Date(), immutable: true, index: true }
  },
  { timestamps: true }
);

TrustAuditLogSchema.index({ companyId: 1, entityType: 1, entityId: 1, timestamp: -1 });

TrustAuditLogSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete'], function (next) {
  return next(new Error('Audit logs are immutable.'));
});

export const TrustAuditLog = mongoose.model<ITrustAuditLog>(
  'TrustAuditLog',
  TrustAuditLogSchema,
  COLLECTIONS.TRUST_AUDIT_LOGS
);
