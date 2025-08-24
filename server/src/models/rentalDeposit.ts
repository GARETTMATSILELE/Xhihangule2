import mongoose, { Schema, Document } from 'mongoose';

export interface IRentalDeposit extends Document {
  propertyId: mongoose.Types.ObjectId;
  agentId: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  depositAmount: number;
  depositDate: Date;
  paymentId: mongoose.Types.ObjectId;
  type?: 'payment' | 'payout';
  referenceNumber?: string;
  notes?: string;
  processedBy?: mongoose.Types.ObjectId;
  paymentMethod?: 'cash' | 'bank_transfer' | 'credit_card' | 'mobile_money';
  recipientName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const RentalDepositSchema: Schema = new Schema({
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true },
  agentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  depositAmount: { type: Number, required: true },
  depositDate: { type: Date, required: true },
  paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: false },
  type: { type: String, enum: ['payment', 'payout'], default: 'payment' },
  referenceNumber: { type: String, default: '' },
  notes: { type: String },
  processedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  paymentMethod: { type: String, enum: ['cash', 'bank_transfer', 'credit_card', 'mobile_money'] },
  recipientName: { type: String, required: false },
}, { timestamps: true });

export const RentalDeposit = mongoose.model<IRentalDeposit>('RentalDeposit', RentalDepositSchema, 'rentaldeposits'); 