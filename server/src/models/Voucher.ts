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
  status?: 'Unused' | 'Redeemed' | 'Expired' | 'Cancelled';
  redeemedBy?: Types.ObjectId;
  redeemedAt?: Date;
  cancelledBy?: Types.ObjectId;
  cancelledAt?: Date;
  auditHistory?: Array<{
    action: string;
    userId?: Types.ObjectId;
    companyId?: Types.ObjectId;
    plan?: 'INDIVIDUAL' | 'SME' | 'ENTERPRISE';
    details?: any;
    createdAt: Date;
  }>;
  metadata?: any;
}

const voucherSchema = new Schema<IVoucher>({
  code: { type: String, required: true, unique: true, index: true },
  pinHash: { type: String, required: true },
  plan: { type: String, enum: ['INDIVIDUAL','SME','ENTERPRISE'], required: true },
  cycle: { type: String, enum: ['monthly','yearly'], required: true },
  amount: { type: Number, required: true },
  validFrom: { type: Date },
  validUntil: { type: Date, index: true },
  maxRedemptions: { type: Number, default: 1 },
  status: { type: String, enum: ['Unused', 'Redeemed', 'Expired', 'Cancelled'], default: 'Unused', index: true },
  redeemedBy: { type: Schema.Types.ObjectId, ref: 'Company' },
  redeemedAt: { type: Date },
  cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
  cancelledAt: { type: Date },
  auditHistory: [{
    action: { type: String, required: true, trim: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company' },
    plan: { type: String, enum: ['INDIVIDUAL','SME','ENTERPRISE'] },
    details: { type: Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now }
  }],
  metadata: { type: Schema.Types.Mixed }
}, { timestamps: true });

voucherSchema.index({ status: 1, validUntil: 1 });
voucherSchema.index({ redeemedBy: 1, redeemedAt: -1 });

export const Voucher = mongoose.model<IVoucher>('Voucher', voucherSchema);
export default Voucher;



















