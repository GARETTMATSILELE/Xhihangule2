import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IBillingPayment extends Document {
  companyId: Types.ObjectId;
  userId?: Types.ObjectId;
  subscriptionId?: Types.ObjectId;
  onboardingSessionId?: Types.ObjectId;
  paymentSessionId?: Types.ObjectId;
  plan: 'INDIVIDUAL' | 'SME' | 'ENTERPRISE';
  cycle: 'monthly' | 'yearly';
  amount: number;
  currency: 'USD' | 'ZWL';
  method: 'card' | 'ecocash' | 'voucher';
  provider: 'paynow' | 'cash';
  providerRef?: string;
  pollUrl?: string;
  idempotencyKey?: string;
  invoiceRef?: string;
  status: 'pending' | 'paid' | 'failed' | 'cancelled';
  paidAt?: Date;
  failedAt?: Date;
  reconciledAt?: Date;
  rawResponse?: any;
  createdAt?: Date;
  updatedAt?: Date;
}

const billingPaymentSchema = new Schema<IBillingPayment>({
  companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: false, index: true },
  subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription' },
  onboardingSessionId: { type: Schema.Types.ObjectId, ref: 'OnboardingSession', required: false, index: true },
  paymentSessionId: { type: Schema.Types.ObjectId, ref: 'PaymentSession', required: false, index: true },
  plan: { type: String, enum: ['INDIVIDUAL','SME','ENTERPRISE'], required: true },
  cycle: { type: String, enum: ['monthly','yearly'], required: true },
  amount: { type: Number, required: true },
  currency: { type: String, enum: ['USD','ZWL'], default: 'USD' },
  method: { type: String, enum: ['card','ecocash','voucher'], required: true },
  provider: { type: String, enum: ['paynow','cash'], required: true },
  providerRef: { type: String },
  pollUrl: { type: String },
  idempotencyKey: { type: String, index: true },
  invoiceRef: { type: String, index: true },
  status: { type: String, enum: ['pending','paid','failed','cancelled'], default: 'pending' },
  paidAt: { type: Date },
  failedAt: { type: Date },
  reconciledAt: { type: Date },
  rawResponse: { type: Schema.Types.Mixed }
}, { timestamps: true });

billingPaymentSchema.index({ provider: 1, providerRef: 1 }, { sparse: true });
billingPaymentSchema.index({ companyId: 1, status: 1, createdAt: -1 });

export const BillingPayment = mongoose.model<IBillingPayment>('BillingPayment', billingPaymentSchema);
export default BillingPayment;



















