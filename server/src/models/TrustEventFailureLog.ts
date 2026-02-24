import mongoose, { Document, Schema } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export interface ITrustEventFailureLog extends Document {
  companyId?: mongoose.Types.ObjectId;
  eventName: string;
  payload: Record<string, unknown>;
  errorMessage: string;
  attempts: number;
  status: 'pending' | 'resolved' | 'dead';
  nextRetryAt: Date;
  lastTriedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TrustEventFailureLogSchema = new Schema<ITrustEventFailureLog>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: false, index: true },
    eventName: { type: String, required: true, index: true },
    payload: { type: Schema.Types.Mixed, required: true },
    errorMessage: { type: String, required: true },
    attempts: { type: Number, required: true, default: 1, min: 1 },
    status: { type: String, enum: ['pending', 'resolved', 'dead'], default: 'pending', index: true },
    nextRetryAt: { type: Date, required: true, index: true },
    lastTriedAt: { type: Date, required: false }
  },
  { timestamps: true }
);

TrustEventFailureLogSchema.index({ status: 1, nextRetryAt: 1 });
TrustEventFailureLogSchema.index({ eventName: 1, createdAt: -1 });

export const TrustEventFailureLog = mongoose.model<ITrustEventFailureLog>(
  'TrustEventFailureLog',
  TrustEventFailureLogSchema,
  COLLECTIONS.TRUST_EVENT_FAILURE_LOGS
);
