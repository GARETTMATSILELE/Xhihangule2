import mongoose, { Document, Schema, Types } from 'mongoose';

export type CashPaymentMethod = 'Cash' | 'EcoCash' | 'ZIPIT' | 'Bank Transfer' | 'Innbucks' | 'Mukuru';
export type CashPaymentStatus = 'Pending' | 'Approved' | 'Rejected' | 'More Info Requested';

export interface ICashPayment extends Document {
  companyId: Types.ObjectId;
  subscriptionId?: Types.ObjectId;
  billingPaymentId?: Types.ObjectId;
  paymentSessionId?: Types.ObjectId;
  plan: 'INDIVIDUAL' | 'SME' | 'ENTERPRISE';
  billingCycle: 'monthly' | 'yearly';
  amount: number;
  currency: 'USD' | 'ZiG' | 'ZWL';
  method: CashPaymentMethod;
  referenceNumber?: string;
  proofOfPayment?: string;
  proofFileName?: string;
  status: CashPaymentStatus;
  submittedBy?: Types.ObjectId;
  approvedBy?: Types.ObjectId;
  submittedAt: Date;
  approvedAt?: Date;
  rejectedAt?: Date;
  moreInfoRequestedAt?: Date;
  notes?: string;
  adminNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CashPaymentSchema = new Schema<ICashPayment>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription', index: true },
    billingPaymentId: { type: Schema.Types.ObjectId, ref: 'BillingPayment', index: true },
    paymentSessionId: { type: Schema.Types.ObjectId, ref: 'PaymentSession', index: true },
    plan: { type: String, enum: ['INDIVIDUAL', 'SME', 'ENTERPRISE'], required: true },
    billingCycle: { type: String, enum: ['monthly', 'yearly'], required: true, default: 'monthly' },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: ['USD', 'ZiG', 'ZWL'], default: 'USD' },
    method: { type: String, enum: ['Cash', 'EcoCash', 'ZIPIT', 'Bank Transfer', 'Innbucks', 'Mukuru'], required: true, index: true },
    referenceNumber: { type: String, trim: true, index: true },
    proofOfPayment: { type: String, trim: true },
    proofFileName: { type: String, trim: true },
    status: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'More Info Requested'], default: 'Pending', index: true },
    submittedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    submittedAt: { type: Date, default: Date.now, index: true },
    approvedAt: { type: Date },
    rejectedAt: { type: Date },
    moreInfoRequestedAt: { type: Date },
    notes: { type: String, trim: true },
    adminNotes: { type: String, trim: true }
  },
  { timestamps: true }
);

CashPaymentSchema.index({ companyId: 1, status: 1, submittedAt: -1 });
CashPaymentSchema.index({ status: 1, submittedAt: -1 });

export const CashPayment = mongoose.model<ICashPayment>('CashPayment', CashPaymentSchema, 'cashpayments');
export default CashPayment;
