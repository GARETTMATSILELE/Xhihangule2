import mongoose, { Schema, Document, Types } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export type FinancialControlExceptionStatus = 'OPEN' | 'UNDER_REVIEW' | 'EXPLAINED' | 'RESOLVED' | 'WAIVED';
export type FinancialControlSeverity = 'INFO' | 'WARNING' | 'HIGH' | 'CRITICAL';

export interface IFinancialControlException extends Document {
  companyId: Types.ObjectId;
  type: string;
  severity: FinancialControlSeverity;
  status: FinancialControlExceptionStatus;
  entityType?: string;
  entityId?: string;
  description: string;
  expected?: string | number;
  actual?: string | number;
  difference?: number;
  currency?: string;
  detectedAt: Date;
  detectedBy?: string;
  assignedTo?: Types.ObjectId;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  resolution?: string;
  resolutionReason?: string;
}

const FinancialControlExceptionSchema = new Schema<IFinancialControlException>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    type: { type: String, required: true, index: true },
    severity: {
      type: String,
      enum: ['INFO', 'WARNING', 'HIGH', 'CRITICAL'],
      required: true,
      default: 'WARNING'
    },
    status: {
      type: String,
      enum: ['OPEN', 'UNDER_REVIEW', 'EXPLAINED', 'RESOLVED', 'WAIVED'],
      required: true,
      default: 'OPEN',
      index: true
    },
    entityType: { type: String, required: false },
    entityId: { type: String, required: false },
    description: { type: String, required: true },
    expected: { type: Schema.Types.Mixed, required: false },
    actual: { type: Schema.Types.Mixed, required: false },
    difference: { type: Number, required: false },
    currency: { type: String, required: false, default: 'USD' },
    detectedAt: { type: Date, required: true, default: Date.now },
    detectedBy: { type: String, required: false },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    reviewedAt: { type: Date, required: false },
    resolution: { type: String, required: false },
    resolutionReason: { type: String, required: false }
  },
  { timestamps: false }
);

FinancialControlExceptionSchema.index({ companyId: 1, status: 1, type: 1, detectedAt: -1 });
FinancialControlExceptionSchema.index(
  { companyId: 1, type: 1, entityType: 1, entityId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['OPEN', 'UNDER_REVIEW'] } } }
);

FinancialControlExceptionSchema.pre('deleteOne', { document: false, query: true }, function (next) {
  next(new Error('Hard delete is disabled for financial control exceptions.'));
});
FinancialControlExceptionSchema.pre('deleteMany', { document: false, query: true }, function (next) {
  next(new Error('Hard delete is disabled for financial control exceptions.'));
});
FinancialControlExceptionSchema.pre('findOneAndDelete', function (next) {
  next(new Error('Hard delete is disabled for financial control exceptions.'));
});

export const FinancialControlException = mongoose.model<IFinancialControlException>(
  'FinancialControlException',
  FinancialControlExceptionSchema,
  COLLECTIONS.FINANCIAL_CONTROL_EXCEPTIONS
);
