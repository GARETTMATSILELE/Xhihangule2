import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IAuditLog extends Document {
  userId?: Types.ObjectId;
  companyId?: Types.ObjectId;
  action: string;
  entityType: string;
  entityId?: Types.ObjectId | string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
  status: 'success' | 'failure';
  metadata?: Record<string, any>;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: false, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: false, index: true },
    action: { type: String, required: true, trim: true, index: true },
    entityType: { type: String, required: true, trim: true, index: true },
    entityId: { type: Schema.Types.Mixed, required: false, index: true },
    ip: { type: String, required: false },
    userAgent: { type: String, required: false },
    requestId: { type: String, required: false, index: true },
    status: { type: String, enum: ['success', 'failure'], default: 'success', index: true },
    metadata: { type: Schema.Types.Mixed, required: false }
  },
  {
    timestamps: { createdAt: true, updatedAt: false }
  }
);

AuditLogSchema.index({ companyId: 1, action: 1, createdAt: -1 });
AuditLogSchema.index({ userId: 1, createdAt: -1 });

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema, 'audit_logs');
export default AuditLog;
