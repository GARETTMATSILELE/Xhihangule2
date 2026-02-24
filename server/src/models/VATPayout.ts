import mongoose, { Schema, Document } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export interface IVATPayout extends Document {
  companyId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  ownerId?: mongoose.Types.ObjectId;
  paymentIds: mongoose.Types.ObjectId[]; // Payments whose VAT was included
  totalAmount: number;
  currency: 'USD' | 'ZWL' | 'ZiG' | 'ZAR';
  recipientId?: mongoose.Types.ObjectId;
  recipientName?: string;
  recipientBankDetails?: string;
  payoutMethod: 'cash' | 'bank_transfer' | 'mobile_money' | 'cheque';
  referenceNumber: string;
  status: 'pending' | 'completed' | 'cancelled';
  date: Date;
  notes?: string;
  receiptFileName?: string;
  receiptContentType?: string;
  receiptData?: Buffer;
  receiptUploadedAt?: Date;
  receiptUploadedBy?: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const VATPayoutSchema: Schema<IVATPayout> = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    paymentIds: [{ type: Schema.Types.ObjectId, ref: 'Payment', required: true }],
    totalAmount: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: ['USD', 'ZWL', 'ZiG', 'ZAR'], default: 'USD' },
    recipientId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    recipientName: { type: String },
    recipientBankDetails: { type: String },
    payoutMethod: { type: String, enum: ['cash', 'bank_transfer', 'mobile_money', 'cheque'], default: 'bank_transfer' },
    referenceNumber: { type: String, required: true, index: true, unique: true },
    status: { type: String, enum: ['pending', 'completed', 'cancelled'], default: 'completed' },
    date: { type: Date, default: () => new Date() },
    notes: { type: String },
    receiptFileName: { type: String },
    receiptContentType: { type: String },
    receiptData: { type: Buffer, select: false },
    receiptUploadedAt: { type: Date },
    receiptUploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// Compound index to speed property/company scoped queries
VATPayoutSchema.index({ companyId: 1, propertyId: 1, date: -1 });

export const VATPayout = mongoose.model<IVATPayout>('VATPayout', VATPayoutSchema, (COLLECTIONS as any).VAT_PAYOUTS || 'vatpayouts');

