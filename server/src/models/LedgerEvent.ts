import mongoose, { Schema, Document, Model } from 'mongoose';

export type LedgerEventStatus = 'pending' | 'processing' | 'failed' | 'completed';

export interface ILedgerEvent extends Document {
  type: 'owner_income';
  paymentId: mongoose.Types.ObjectId;
  status: LedgerEventStatus;
  attemptCount: number;
  nextAttemptAt?: Date;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

const LedgerEventSchema = new Schema<ILedgerEvent>({
  type: { type: String, enum: ['owner_income'], required: true },
  paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: true },
  status: { type: String, enum: ['pending', 'processing', 'failed', 'completed'], default: 'pending', index: true },
  attemptCount: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: () => new Date() },
  lastError: { type: String, default: undefined }
}, { timestamps: true });

// Helpful index to pick work
LedgerEventSchema.index({ status: 1, nextAttemptAt: 1, createdAt: 1 });
// Idempotency guard so we don't pile up events for the same payment/type in non-completed states
LedgerEventSchema.index({ type: 1, paymentId: 1, status: 1 });

export const LedgerEvent: Model<ILedgerEvent> = mongoose.models.LedgerEvent || mongoose.model<ILedgerEvent>('LedgerEvent', LedgerEventSchema);

export default LedgerEvent;


