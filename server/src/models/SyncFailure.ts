import mongoose, { Schema, Document } from 'mongoose';

export interface ISyncFailure extends Document {
  type: 'payment' | 'property' | 'user' | 'lease' | 'maintenance' | string;
  documentId: string;
  payload?: any;
  errorName?: string;
  errorCode?: number | string;
  errorMessage: string;
  errorLabels?: string[];
  retriable: boolean;
  attemptCount: number;
  nextAttemptAt?: Date;
  status: 'pending' | 'resolved' | 'discarded';
  lastErrorAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SyncFailureSchema = new Schema<ISyncFailure>({
  type: { type: String, required: true },
  documentId: { type: String, required: true },
  payload: { type: Schema.Types.Mixed },
  errorName: { type: String },
  errorCode: { type: Schema.Types.Mixed },
  errorMessage: { type: String, required: true },
  errorLabels: { type: [String], default: [] },
  retriable: { type: Boolean, default: false },
  attemptCount: { type: Number, default: 0 },
  nextAttemptAt: { type: Date },
  status: { type: String, enum: ['pending', 'resolved', 'discarded'], default: 'pending' },
  lastErrorAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

// Keep a single failure record per (type, documentId)
SyncFailureSchema.index({ type: 1, documentId: 1 }, { unique: true });
SyncFailureSchema.index({ nextAttemptAt: 1 });

export const SyncFailure = mongoose.model<ISyncFailure>('SyncFailure', SyncFailureSchema, 'sync_failures');

export default SyncFailure;





