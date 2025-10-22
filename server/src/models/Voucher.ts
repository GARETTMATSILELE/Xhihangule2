import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IVoucher extends Document {
  code: string;
  pinHash: string;
  plan: 'INDIVIDUAL' | 'SME' | 'ENTERPRISE';
  cycle: 'monthly' | 'yearly';
  amount: number;
  validFrom?: Date;
  validUntil?: Date;
  maxRedemptions: number;
  redeemedBy?: Types.ObjectId;
  redeemedAt?: Date;
  metadata?: any;
}

const voucherSchema = new Schema<IVoucher>({
  code: { type: String, required: true, unique: true, index: true },
  pinHash: { type: String, required: true },
  plan: { type: String, enum: ['INDIVIDUAL','SME','ENTERPRISE'], required: true },
  cycle: { type: String, enum: ['monthly','yearly'], required: true },
  amount: { type: Number, required: true },
  validFrom: { type: Date },
  validUntil: { type: Date },
  maxRedemptions: { type: Number, default: 1 },
  redeemedBy: { type: Schema.Types.ObjectId, ref: 'Company' },
  redeemedAt: { type: Date },
  metadata: { type: Schema.Types.Mixed }
}, { timestamps: true });

export const Voucher = mongoose.model<IVoucher>('Voucher', voucherSchema);
export default Voucher;

















