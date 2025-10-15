import mongoose, { Schema, Document } from 'mongoose';

export type InstallmentStatus = 'scheduled' | 'due' | 'partial' | 'paid' | 'overdue' | 'written_off' | 'waived';

export interface IInstallment extends Document {
  companyId: mongoose.Types.ObjectId;
  planId: mongoose.Types.ObjectId;
  dueDate: Date;
  amountDue: number;
  principalDue?: number;
  interestDue?: number;
  paidAmount: number;
  status: InstallmentStatus;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

const InstallmentSchema: Schema = new Schema({
  companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  planId: { type: Schema.Types.ObjectId, ref: 'InstallmentPlan', required: true, index: true },
  dueDate: { type: Date, required: true, index: true },
  amountDue: { type: Number, required: true, min: 0 },
  principalDue: { type: Number, default: 0 },
  interestDue: { type: Number, default: 0 },
  paidAmount: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['scheduled', 'due', 'partial', 'paid', 'overdue', 'written_off', 'waived'], default: 'scheduled', index: true },
  currency: { type: String, default: 'USD' }
}, { timestamps: true });

InstallmentSchema.index({ companyId: 1, planId: 1, dueDate: 1 });

export const Installment = mongoose.model<IInstallment>('Installment', InstallmentSchema, 'installments');




