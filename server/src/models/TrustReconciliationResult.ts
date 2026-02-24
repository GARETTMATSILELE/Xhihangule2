import mongoose, { Document, Schema } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export interface ITrustReconciliationResult extends Document {
  companyId: mongoose.Types.ObjectId;
  runAt: Date;
  checkedPayments: number;
  missingPostings: number;
  balanceMismatches: number;
  autoRepairs: number;
  details: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const TrustReconciliationResultSchema = new Schema<ITrustReconciliationResult>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    runAt: { type: Date, required: true, default: () => new Date(), index: true },
    checkedPayments: { type: Number, required: true, default: 0 },
    missingPostings: { type: Number, required: true, default: 0 },
    balanceMismatches: { type: Number, required: true, default: 0 },
    autoRepairs: { type: Number, required: true, default: 0 },
    details: { type: Schema.Types.Mixed, required: true, default: {} }
  },
  { timestamps: true }
);

TrustReconciliationResultSchema.index({ companyId: 1, runAt: -1 });

export const TrustReconciliationResult = mongoose.model<ITrustReconciliationResult>(
  'TrustReconciliationResult',
  TrustReconciliationResultSchema,
  COLLECTIONS.TRUST_RECONCILIATION_RESULTS
);
