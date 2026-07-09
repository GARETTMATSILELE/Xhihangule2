import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ISubscription extends Document {
  companyId: Types.ObjectId;
  userId?: Types.ObjectId;
  onboardingSessionId?: Types.ObjectId;
  plan: 'INDIVIDUAL' | 'SME' | 'ENTERPRISE';
  cycle: 'monthly' | 'yearly';
  status: 'trial' | 'active' | 'past_due' | 'canceled' | 'cancelled' | 'suspended' | 'expired' | 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELLED' | 'EXPIRED';
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  nextPaymentAt?: Date;
  gracePeriodEnd?: Date;
  paynowRef?: string;
  pollUrl?: string;
  provider?: 'paynow' | 'cash' | 'manual';
  lastPaymentSessionId?: Types.ObjectId;
  lastPaymentAt?: Date;
  lastReconciledAt?: Date;
  trialStartDate?: Date;
  trialEndDate?: Date;
  trialDurationDays?: number;
  cancelledAt?: Date;
  suspendedAt?: Date;
  suspensionReason?: string;
  adminOverride?: {
    enabled?: boolean;
    reason?: string;
    expiresAt?: Date;
    updatedBy?: Types.ObjectId;
    updatedAt?: Date;
  };
  warningHistory?: Array<{
    type: '14_days' | '7_days' | '3_days';
    sentAt: Date;
  }>;
}

const subscriptionSchema = new Schema<ISubscription>({
  companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: false, index: true },
  onboardingSessionId: { type: Schema.Types.ObjectId, ref: 'OnboardingSession', required: false, index: true },
  plan: { type: String, enum: ['INDIVIDUAL','SME','ENTERPRISE'], required: true },
  cycle: { type: String, enum: ['monthly','yearly'], required: true },
  status: { type: String, enum: ['trial','active','past_due','canceled','cancelled','suspended','expired','TRIAL','ACTIVE','PAST_DUE','SUSPENDED','CANCELLED','EXPIRED'], default: 'trial', index: true },
  currentPeriodStart: { type: Date },
  currentPeriodEnd: { type: Date },
  nextPaymentAt: { type: Date },
  gracePeriodEnd: { type: Date },
  paynowRef: { type: String },
  pollUrl: { type: String },
  provider: { type: String, enum: ['paynow', 'cash', 'manual'] },
  lastPaymentSessionId: { type: Schema.Types.ObjectId, ref: 'PaymentSession' },
  lastPaymentAt: { type: Date },
  lastReconciledAt: { type: Date },
  trialStartDate: { type: Date },
  trialEndDate: { type: Date },
  trialDurationDays: { type: Number, default: 14 },
  cancelledAt: { type: Date },
  suspendedAt: { type: Date },
  suspensionReason: { type: String },
  adminOverride: {
    enabled: { type: Boolean, default: false, index: true },
    reason: { type: String, trim: true },
    expiresAt: { type: Date },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedAt: { type: Date }
  },
  warningHistory: [{
    type: { type: String, enum: ['14_days', '7_days', '3_days'], required: true },
    sentAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

subscriptionSchema.index({ companyId: 1, status: 1 });
subscriptionSchema.index({ companyId: 1, currentPeriodEnd: 1 });
subscriptionSchema.index({ status: 1, currentPeriodEnd: 1 });

export const Subscription = mongoose.model<ISubscription>('Subscription', subscriptionSchema);
export default Subscription;















