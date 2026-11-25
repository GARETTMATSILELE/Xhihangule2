import mongoose, { Schema, Document, Types } from 'mongoose';

export type SubscriptionCaseStatus = 'open' | 'confirmed_duplicate' | 'not_duplicate' | 'resolved';

export interface SubscriptionPaymentSide {
  sessionId: Types.ObjectId;
  billingPaymentId?: Types.ObjectId;
  provider: 'dodo' | 'paynow';
  providerReference: string;
  checkoutReference?: string;
  amount: number;
  currency: string;
  paidAt?: Date;
}

export interface SubscriptionCaseHistory {
  at: Date;
  adminUserId: Types.ObjectId;
  resolution: SubscriptionCaseStatus;
  notes: string;
  externalRefundReference?: string;
}

export interface ISubscriptionPaymentCase extends Document {
  companyId: Types.ObjectId;
  customerUserId?: Types.ObjectId;
  subscriptionId: Types.ObjectId;
  status: SubscriptionCaseStatus;
  original: SubscriptionPaymentSide;
  additional: SubscriptionPaymentSide;
  externalRefundReference?: string;
  notes?: string;
  history: SubscriptionCaseHistory[];
  notifiedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const sideSchema = new Schema<SubscriptionPaymentSide>({
  sessionId: { type: Schema.Types.ObjectId, ref: 'PaymentSession', required: true },
  billingPaymentId: { type: Schema.Types.ObjectId, ref: 'BillingPayment' },
  provider: { type: String, enum: ['dodo', 'paynow'], required: true },
  providerReference: { type: String, required: true, trim: true },
  checkoutReference: { type: String, trim: true },
  amount: { type: Number, required: true },
  currency: { type: String, required: true, trim: true },
  paidAt: { type: Date }
}, { _id: false });

const historySchema = new Schema<SubscriptionCaseHistory>({
  at: { type: Date, required: true },
  adminUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  resolution: { type: String, enum: ['open', 'confirmed_duplicate', 'not_duplicate', 'resolved'], required: true },
  notes: { type: String, default: '' },
  externalRefundReference: { type: String, trim: true }
}, { _id: false });

const subscriptionPaymentCaseSchema = new Schema<ISubscriptionPaymentCase>({
  companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  customerUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription', required: true, index: true },
  status: { type: String, enum: ['open', 'confirmed_duplicate', 'not_duplicate', 'resolved'], default: 'open', index: true },
  original: { type: sideSchema, required: true },
  additional: { type: sideSchema, required: true },
  externalRefundReference: { type: String, trim: true },
  notes: { type: String, default: '' },
  history: { type: [historySchema], default: [] },
  notifiedAt: { type: Date }
}, { timestamps: true });

subscriptionPaymentCaseSchema.index({ 'additional.sessionId': 1 }, { unique: true });

export const SubscriptionPaymentCase = mongoose.model<ISubscriptionPaymentCase>('SubscriptionPaymentCase', subscriptionPaymentCaseSchema);
export default SubscriptionPaymentCase;
