import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ISubscription extends Document {
  companyId: Types.ObjectId;
  plan: 'INDIVIDUAL' | 'SME' | 'ENTERPRISE';
  cycle: 'monthly' | 'yearly';
  status: 'trial' | 'active' | 'past_due' | 'canceled';
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  nextPaymentAt?: Date;
  paynowRef?: string;
  pollUrl?: string;
}

const subscriptionSchema = new Schema<ISubscription>({
  companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  plan: { type: String, enum: ['INDIVIDUAL','SME','ENTERPRISE'], required: true },
  cycle: { type: String, enum: ['monthly','yearly'], required: true },
  status: { type: String, enum: ['trial','active','past_due','canceled'], default: 'trial' },
  currentPeriodStart: { type: Date },
  currentPeriodEnd: { type: Date },
  nextPaymentAt: { type: Date },
  paynowRef: { type: String },
  pollUrl: { type: String }
}, { timestamps: true });

export const Subscription = mongoose.model<ISubscription>('Subscription', subscriptionSchema);
export default Subscription;









