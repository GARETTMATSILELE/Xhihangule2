import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IBillingPayment extends Document {
  companyId: Types.ObjectId;
  subscriptionId?: Types.ObjectId;
  plan: 'INDIVIDUAL' | 'SME' | 'ENTERPRISE';
  cycle: 'monthly' | 'yearly';
  amount: number;
  currency: 'USD' | 'ZWL';
  method: 'card' | 'ecocash' | 'voucher';
  provider: 'paynow' | 'cash';
  providerRef?: string;
  pollUrl?: string;
  status: 'pending' | 'paid' | 'failed' | 'cancelled';
  rawResponse?: any;
}

const billingPaymentSchema = new Schema<IBillingPayment>({
  companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription' },
  plan: { type: String, enum: ['INDIVIDUAL','SME','ENTERPRISE'], required: true },
  cycle: { type: String, enum: ['monthly','yearly'], required: true },
  amount: { type: Number, required: true },
  currency: { type: String, enum: ['USD','ZWL'], default: 'USD' },
  method: { type: String, enum: ['card','ecocash','voucher'], required: true },
  provider: { type: String, enum: ['paynow','cash'], required: true },
  providerRef: { type: String },
  pollUrl: { type: String },
  status: { type: String, enum: ['pending','paid','failed','cancelled'], default: 'pending' },
  rawResponse: { type: Schema.Types.Mixed }
}, { timestamps: true });

export const BillingPayment = mongoose.model<IBillingPayment>('BillingPayment', billingPaymentSchema);
export default BillingPayment;






