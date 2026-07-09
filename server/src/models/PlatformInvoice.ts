import mongoose, { Document, Schema, Types } from 'mongoose';

export type PlatformInvoiceStatus = 'Draft' | 'Issued' | 'Paid' | 'Overdue' | 'Cancelled';

export interface IPlatformInvoice extends Document {
  invoiceNumber: string;
  companyId: Types.ObjectId;
  plan: 'INDIVIDUAL' | 'SME' | 'ENTERPRISE';
  subscriptionId?: Types.ObjectId;
  amount: number;
  currency: 'USD' | 'ZiG' | 'ZWL';
  issueDate: Date;
  dueDate: Date;
  status: PlatformInvoiceStatus;
  billingCycle?: 'monthly' | 'yearly';
  notes?: string;
  sentAt?: Date;
  sentTo?: string;
  paidAt?: Date;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PlatformInvoiceSchema = new Schema<IPlatformInvoice>(
  {
    invoiceNumber: { type: String, required: true, unique: true, index: true, trim: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    plan: { type: String, enum: ['INDIVIDUAL', 'SME', 'ENTERPRISE'], required: true, index: true },
    subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription', index: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: ['USD', 'ZiG', 'ZWL'], default: 'USD' },
    issueDate: { type: Date, required: true, default: Date.now, index: true },
    dueDate: { type: Date, required: true, index: true },
    status: { type: String, enum: ['Draft', 'Issued', 'Paid', 'Overdue', 'Cancelled'], default: 'Draft', index: true },
    billingCycle: { type: String, enum: ['monthly', 'yearly'] },
    notes: { type: String, trim: true },
    sentAt: { type: Date },
    sentTo: { type: String, trim: true, lowercase: true },
    paidAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

PlatformInvoiceSchema.index({ companyId: 1, status: 1, dueDate: 1 });
PlatformInvoiceSchema.index({ status: 1, createdAt: -1 });

export const PlatformInvoice = mongoose.model<IPlatformInvoice>('PlatformInvoice', PlatformInvoiceSchema, 'platforminvoices');
export default PlatformInvoice;
