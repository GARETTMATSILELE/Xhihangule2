import mongoose, { Document, Schema, Types } from 'mongoose';

export type PaymentSessionStatus =
  | 'pending'
  | 'provider_created'
  | 'paid'
  | 'failed'
  | 'cancelled'
  | 'expired'
  | 'reconciled';

export interface IPaymentSession extends Document {
  companyId: Types.ObjectId;
  userId?: Types.ObjectId;
  subscriptionId?: Types.ObjectId;
  onboardingSessionId?: Types.ObjectId;
  billingPaymentId?: Types.ObjectId;
  idempotencyKey: string;
  provider: 'paynow' | 'cash' | 'manual';
  providerRef?: string;
  pollUrl?: string;
  plan: 'INDIVIDUAL' | 'SME' | 'ENTERPRISE';
  billingCycle: 'monthly' | 'yearly';
  amount: number;
  currency: 'USD' | 'ZWL';
  status: PaymentSessionStatus;
  paidAt?: Date;
  failedAt?: Date;
  lastWebhookEventId?: string;
  rawProviderResponse?: any;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSessionSchema = new Schema<IPaymentSession>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: false, index: true },
    subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription', required: false, index: true },
    onboardingSessionId: { type: Schema.Types.ObjectId, ref: 'OnboardingSession', required: false, index: true },
    billingPaymentId: { type: Schema.Types.ObjectId, ref: 'BillingPayment', required: false, index: true },
    idempotencyKey: { type: String, required: true, trim: true },
    provider: { type: String, enum: ['paynow', 'cash', 'manual'], required: true, index: true },
    providerRef: { type: String, trim: true, index: true },
    pollUrl: { type: String, trim: true },
    plan: { type: String, enum: ['INDIVIDUAL', 'SME', 'ENTERPRISE'], required: true },
    billingCycle: { type: String, enum: ['monthly', 'yearly'], required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: ['USD', 'ZWL'], default: 'USD' },
    status: {
      type: String,
      enum: ['pending', 'provider_created', 'paid', 'failed', 'cancelled', 'expired', 'reconciled'],
      default: 'pending',
      index: true
    },
    paidAt: { type: Date },
    failedAt: { type: Date },
    lastWebhookEventId: { type: String, trim: true },
    rawProviderResponse: { type: Schema.Types.Mixed },
    metadata: { type: Schema.Types.Mixed }
  },
  { timestamps: true }
);

PaymentSessionSchema.index({ idempotencyKey: 1 }, { unique: true });
PaymentSessionSchema.index({ provider: 1, providerRef: 1 }, { sparse: true });
PaymentSessionSchema.index({ companyId: 1, status: 1, createdAt: -1 });

export const PaymentSession = mongoose.model<IPaymentSession>('PaymentSession', PaymentSessionSchema, 'payment_sessions');
export default PaymentSession;
