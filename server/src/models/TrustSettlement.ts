import mongoose, { Document, Schema } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export interface ITrustSettlementDeduction {
  type: string;
  amount: number;
}

export interface ITrustSettlement extends Document {
  companyId: mongoose.Types.ObjectId;
  trustAccountId: mongoose.Types.ObjectId;
  salePrice: number;
  grossProceeds: number;
  deductions: ITrustSettlementDeduction[];
  netPayout: number;
  settlementDate: Date;
  locked: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TrustSettlementSchema = new Schema<ITrustSettlement>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, immutable: true, index: true },
    trustAccountId: { type: Schema.Types.ObjectId, ref: 'TrustAccount', required: true, immutable: true, index: true, unique: true },
    salePrice: { type: Number, required: true, min: 0 },
    grossProceeds: { type: Number, required: true, min: 0 },
    deductions: [
      {
        type: { type: String, required: true },
        amount: { type: Number, required: true, min: 0 }
      }
    ],
    netPayout: { type: Number, required: true, min: 0 },
    settlementDate: { type: Date, required: true, default: () => new Date() },
    locked: { type: Boolean, required: true, default: false, index: true }
  },
  { timestamps: true }
);

TrustSettlementSchema.index({ companyId: 1, settlementDate: -1 });

export const TrustSettlement = mongoose.model<ITrustSettlement>(
  'TrustSettlement',
  TrustSettlementSchema,
  COLLECTIONS.TRUST_SETTLEMENTS
);
