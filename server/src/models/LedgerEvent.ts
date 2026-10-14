import mongoose, { Schema, Document, Model } from 'mongoose';
import { LEDGER_EVENT_PROCESSOR_GENERATION } from '../services/ledgerMutationPolicy';

export type LedgerEventStatus = 'pending' | 'processing' | 'failed' | 'completed';

export type LedgerEventType =
  | 'owner_income'
  | 'payment_reversal'
  | 'agent_commission'
  | 'company_commission'
  | 'levy_collection'
  | 'levy_payout'
  | 'journal';

export interface ILedgerEvent extends Document {
  type: LedgerEventType;
  paymentId?: mongoose.Types.ObjectId;
  levyPaymentId?: mongoose.Types.ObjectId;
  status: LedgerEventStatus;
  attemptCount: number;
  nextAttemptAt?: Date;
  claimedAt?: Date;
  lastError?: string;
  processorGeneration: number;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const LedgerEventSchema = new Schema<ILedgerEvent>({
  type: {
    type: String,
    enum: ['owner_income', 'payment_reversal', 'agent_commission', 'company_commission', 'levy_collection', 'levy_payout', 'journal'],
    required: true
  },
  paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: false },
  levyPaymentId: { type: Schema.Types.ObjectId, required: false },
  status: { type: String, enum: ['pending', 'processing', 'failed', 'completed'], default: 'pending', index: true },
  attemptCount: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: () => new Date() },
  claimedAt: { type: Date, default: undefined },
  lastError: { type: String, default: undefined },
  processorGeneration: { type: Number, default: LEDGER_EVENT_PROCESSOR_GENERATION, index: true },
  metadata: { type: Schema.Types.Mixed, default: undefined }
}, { timestamps: true });

// Schema index declarations only. Phase 5B must not create these in MongoDB.
LedgerEventSchema.index({ status: 1, nextAttemptAt: 1, createdAt: 1, processorGeneration: 1 });
LedgerEventSchema.index({ type: 1, paymentId: 1, status: 1 });

export const LedgerEvent: Model<ILedgerEvent> = mongoose.models.LedgerEvent || mongoose.model<ILedgerEvent>('LedgerEvent', LedgerEventSchema);

export default LedgerEvent;
