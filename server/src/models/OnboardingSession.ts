import mongoose, { Document, Schema, Types } from 'mongoose';

export type OnboardingStatus =
  | 'PENDING_SETUP'
  | 'PENDING_PAYMENT'
  | 'PAYMENT_RECEIVED'
  | 'INITIALIZING_WORKSPACE'
  | 'ACTIVE'
  | 'FAILED_SETUP'
  | 'SUSPENDED'
  | 'EXPIRED';

export interface IOnboardingSession extends Document {
  userId?: Types.ObjectId;
  companyId?: Types.ObjectId;
  subscriptionId?: Types.ObjectId;
  paymentSessionId?: Types.ObjectId;
  idempotencyKey: string;
  status: OnboardingStatus;
  plan: 'INDIVIDUAL' | 'SME' | 'ENTERPRISE';
  billingCycle: 'monthly' | 'yearly';
  companyType: 'INDIVIDUAL_LANDLORD' | 'REGISTERED_BUSINESS';
  workspaceType: 'agency' | 'individual';
  currentStep?: string;
  retryCount: number;
  lastError?: string;
  metadata?: Record<string, any>;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const OnboardingSessionSchema = new Schema<IOnboardingSession>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: false, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: false, index: true },
    subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription', required: false, index: true },
    paymentSessionId: { type: Schema.Types.ObjectId, ref: 'PaymentSession', required: false, index: true },
    idempotencyKey: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['PENDING_SETUP', 'PENDING_PAYMENT', 'PAYMENT_RECEIVED', 'INITIALIZING_WORKSPACE', 'ACTIVE', 'FAILED_SETUP', 'SUSPENDED', 'EXPIRED'],
      default: 'PENDING_SETUP',
      index: true
    },
    plan: { type: String, enum: ['INDIVIDUAL', 'SME', 'ENTERPRISE'], required: true },
    billingCycle: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },
    companyType: { type: String, enum: ['INDIVIDUAL_LANDLORD', 'REGISTERED_BUSINESS'], required: true },
    workspaceType: { type: String, enum: ['agency', 'individual'], default: 'agency', index: true },
    currentStep: { type: String, required: false, index: true },
    retryCount: { type: Number, default: 0, min: 0 },
    lastError: { type: String, required: false },
    metadata: { type: Schema.Types.Mixed, required: false },
    completedAt: { type: Date, required: false }
  },
  { timestamps: true }
);

OnboardingSessionSchema.index({ idempotencyKey: 1 }, { unique: true });
OnboardingSessionSchema.index({ companyId: 1, status: 1 });

export const OnboardingSession = mongoose.model<IOnboardingSession>('OnboardingSession', OnboardingSessionSchema, 'onboarding_sessions');
export default OnboardingSession;
