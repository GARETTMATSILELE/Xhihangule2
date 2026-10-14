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
  cgtSnapshot?: Record<string, unknown>;
  cgwtSnapshot?: Record<string, unknown>;
  waterfall?: Record<string, unknown>;
  settlementStatus?: 'CALCULATED' | 'REQUIRES_TAX_REVIEW' | 'PROVISIONAL' | 'BLOCKED';
  cgwtApplicability?: 'APPLICABLE' | 'NOT_APPLICABLE' | 'REVIEW_REQUIRED';
  calculatedAt?: Date;
  calculatedBy?: mongoose.Types.ObjectId;
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
    cgtSnapshot: { type: Schema.Types.Mixed, required: false },
    cgwtSnapshot: { type: Schema.Types.Mixed, required: false },
    waterfall: { type: Schema.Types.Mixed, required: false },
    settlementStatus: {
      type: String,
      enum: ['CALCULATED', 'REQUIRES_TAX_REVIEW', 'PROVISIONAL', 'BLOCKED'],
      required: false
    },
    cgwtApplicability: {
      type: String,
      enum: ['APPLICABLE', 'NOT_APPLICABLE', 'REVIEW_REQUIRED'],
      required: false
    },
    calculatedAt: { type: Date, required: false },
    calculatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: false },
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
