import mongoose, { Schema, Document } from 'mongoose';

export interface ISalesContract extends Document {
  companyId: mongoose.Types.ObjectId;
  propertyId?: mongoose.Types.ObjectId;
  manualPropertyAddress?: string;
  buyerName: string;
  sellerName?: string;
  currency: 'USD' | 'ZWL' | string;
  totalSalePrice: number;
  commissionPercent: number; // default 5
  preaPercentOfCommission: number; // default 3
  agencyPercentRemaining: number; // default 50
  agentPercentRemaining: number; // default 50
  reference?: string; // free-form identifier
  status: 'open' | 'closed';
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SalesContractSchema: Schema = new Schema({
  companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property' },
  manualPropertyAddress: { type: String },
  buyerName: { type: String, required: true },
  sellerName: { type: String },
  currency: { type: String, default: 'USD' },
  totalSalePrice: { type: Number, required: true },
  commissionPercent: { type: Number, default: 5 },
  preaPercentOfCommission: { type: Number, default: 3 },
  agencyPercentRemaining: { type: Number, default: 50 },
  agentPercentRemaining: { type: Number, default: 50 },
  reference: { type: String, index: true },
  status: { type: String, enum: ['open', 'closed'], default: 'open' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

SalesContractSchema.index({ companyId: 1, reference: 1 }, { unique: false });

export const SalesContract = mongoose.model<ISalesContract>('SalesContract', SalesContractSchema, 'salescontracts');



