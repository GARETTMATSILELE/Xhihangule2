import mongoose, { Schema, Document } from 'mongoose';

export interface IPaymentAllocation extends Document {
  companyId: mongoose.Types.ObjectId;
  paymentId: mongoose.Types.ObjectId;
  installmentId?: mongoose.Types.ObjectId;
  // For rental period allocations we can later extend with a period reference
  amount: number;
  currency: string;
  exchangeRate?: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentAllocationSchema: Schema = new Schema({
  companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: true, index: true },
  installmentId: { type: Schema.Types.ObjectId, ref: 'Installment' },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'USD' },
  exchangeRate: { type: Number },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

PaymentAllocationSchema.index({ companyId: 1, installmentId: 1 });
PaymentAllocationSchema.index({ companyId: 1, paymentId: 1 });

export const PaymentAllocation = mongoose.model<IPaymentAllocation>('PaymentAllocation', PaymentAllocationSchema, 'paymentallocations');




