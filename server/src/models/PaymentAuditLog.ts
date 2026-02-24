import mongoose, { Schema, Document } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export interface IPaymentAuditLog extends Document {
  companyId: mongoose.Types.ObjectId;
  paymentId: mongoose.Types.ObjectId;
  action: 'create' | 'edit' | 'post' | 'reverse' | 'delete' | 'void';
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  reason?: string;
  userId?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const PaymentAuditLogSchema = new Schema<IPaymentAuditLog>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: true, index: true },
    action: {
      type: String,
      enum: ['create', 'edit', 'post', 'reverse', 'delete', 'void'],
      required: true,
      index: true,
    },
    oldValues: { type: Schema.Types.Mixed, required: false },
    newValues: { type: Schema.Types.Mixed, required: false },
    reason: { type: String, required: false },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

PaymentAuditLogSchema.index({ companyId: 1, paymentId: 1, createdAt: -1 });

const collectionName = (COLLECTIONS as any).PAYMENT_AUDIT_LOGS || 'payment_audit_logs';
export const PaymentAuditLog = mongoose.model<IPaymentAuditLog>('PaymentAuditLog', PaymentAuditLogSchema, collectionName);

