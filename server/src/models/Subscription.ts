import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ISubscription extends Document {
  companyId: Types.ObjectId;
  plan: 'INDIVIDUAL' | 'SME' | 'ENTERPRISE';
  cycle: 'monthly' | 'yearly';
  status: 'trial' | 'active' | 'past_due' | 'canceled' | 'expired';
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  nextPaymentAt?: Date;
  paynowRef?: string;
  pollUrl?: string;
  trialStartDate?: Date;
  trialEndDate?: Date;
  trialDurationDays?: number;
}

const subscriptionSchema = new Schema<ISubscription>({
  companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  plan: { type: String, enum: ['INDIVIDUAL','SME','ENTERPRISE'], required: true },
  cycle: { type: String, enum: ['monthly','yearly'], required: true },
  status: { type: String, enum: ['trial','active','past_due','canceled','expired'], default: 'trial' },
  currentPeriodStart: { type: Date },
  currentPeriodEnd: { type: Date },
  nextPaymentAt: { type: Date },
  paynowRef: { type: String },
  pollUrl: { type: String },
  trialStartDate: { type: Date },
  trialEndDate: { type: Date },
  trialDurationDays: { type: Number, default: 14 }
}, { timestamps: true });

export const Subscription = mongoose.model<ISubscription>('Subscription', subscriptionSchema);
export default Subscription;















