import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IHistoricalAccountingRepair extends Document {
  companyId: Types.ObjectId;
  paymentId: Types.ObjectId;
  referenceNumber: string;
  propertyId?: Types.ObjectId;
  classification: string;
  fingerprint: string;
  originalState: Record<string, unknown>;
  expectedState: Record<string, unknown>;
  recordsCreated: string[];
  amountsPosted: Record<string, number>;
  reason: string;
  authorisedBy: Types.ObjectId;
  result: 'posted' | 'aborted' | 'failed';
  verification: string;
  createdAt: Date;
}

const HistoricalAccountingRepairSchema = new Schema<IHistoricalAccountingRepair>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: true, index: true },
    referenceNumber: { type: String, required: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: false },
    classification: { type: String, required: true },
    fingerprint: { type: String, required: true },
    originalState: { type: Schema.Types.Mixed, required: true },
    expectedState: { type: Schema.Types.Mixed, required: true },
    recordsCreated: { type: [String], default: [] },
    amountsPosted: { type: Schema.Types.Mixed, default: {} },
    reason: { type: String, required: true },
    authorisedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    result: { type: String, enum: ['posted', 'aborted', 'failed'], required: true },
    verification: { type: String, required: true }
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false }, collection: 'historicalaccountingrepairs' }
);

export const HistoricalAccountingRepair = mongoose.model<IHistoricalAccountingRepair>(
  'HistoricalAccountingRepair',
  HistoricalAccountingRepairSchema
);
