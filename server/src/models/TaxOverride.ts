import mongoose, { Document, Schema, Types } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export interface ITaxOverride extends Document {
  companyId: Types.ObjectId;
  entityType: string;
  entityId: string;
  field: string;
  originalValue: unknown;
  newValue: unknown;
  reason: string;
  userId: Types.ObjectId;
  timestamp: Date;
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  supportingDocumentId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TaxOverrideSchema = new Schema<ITaxOverride>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    entityType: { type: String, required: true },
    entityId: { type: String, required: true },
    field: { type: String, required: true },
    originalValue: { type: Schema.Types.Mixed, required: true },
    newValue: { type: Schema.Types.Mixed, required: true },
    reason: { type: String, required: true, trim: true, minlength: 1 },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    timestamp: { type: Date, required: true, default: () => new Date() },
    approvalStatus: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
    supportingDocumentId: { type: String, required: false }
  },
  { timestamps: true }
);

TaxOverrideSchema.index({ companyId: 1, entityType: 1, entityId: 1, timestamp: -1 });

TaxOverrideSchema.pre('validate', function (next) {
  if (!String(this.reason || '').trim()) {
    return next(new Error('A reason is required for every tax override'));
  }
  return next();
});

export const TaxOverride = mongoose.model<ITaxOverride>(
  'TaxOverride',
  TaxOverrideSchema,
  (COLLECTIONS as any).TAX_OVERRIDES || 'taxoverrides'
);
