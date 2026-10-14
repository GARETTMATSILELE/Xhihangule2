import mongoose, { Schema, Document, Types } from 'mongoose';
import { COLLECTIONS } from '../config/collections';
import { TAX_PACK_STATUSES } from '../services/tax/complianceTypes';

export interface IIndividualTaxPack extends Document {
  companyId: Types.ObjectId;
  taxYear: number;
  status: string;
  version: number;
  generatedAt: Date;
  generatedBy?: Types.ObjectId | null;
  finalizedAt?: Date | null;
  finalizedBy?: Types.ObjectId | null;
  supersedesPackId?: Types.ObjectId | null;
  supersedeReason?: string | null;
  accountingSummary: Record<string, unknown>;
  vatSummary: Record<string, unknown>;
  rentalTaxSummary: Record<string, unknown>;
  incomeTaxSummary: Record<string, unknown>;
  reviewSummary: Record<string, unknown>;
  evidenceSummary: Record<string, unknown>;
  paymentSummary: Record<string, unknown>;
  taxRuleReferences: Array<Record<string, unknown>>;
  sourceProjectionReferences: Array<Record<string, unknown>>;
  readinessStatus: string;
  disclaimer: string;
  createdAt: Date;
  updatedAt: Date;
}

const IndividualTaxPackSchema = new Schema<IIndividualTaxPack>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true, immutable: true },
    taxYear: { type: Number, required: true, index: true, immutable: true },
    status: { type: String, enum: TAX_PACK_STATUSES, default: 'GENERATED', index: true },
    version: { type: Number, required: true, min: 1, default: 1 },
    generatedAt: { type: Date, required: true, default: () => new Date() },
    generatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    finalizedAt: { type: Date, default: null },
    finalizedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    supersedesPackId: { type: Schema.Types.ObjectId, ref: 'IndividualTaxPack', default: null },
    supersedeReason: { type: String, default: null, trim: true },
    accountingSummary: { type: Schema.Types.Mixed, default: {} },
    vatSummary: { type: Schema.Types.Mixed, default: {} },
    rentalTaxSummary: { type: Schema.Types.Mixed, default: {} },
    incomeTaxSummary: { type: Schema.Types.Mixed, default: {} },
    reviewSummary: { type: Schema.Types.Mixed, default: {} },
    evidenceSummary: { type: Schema.Types.Mixed, default: {} },
    paymentSummary: { type: Schema.Types.Mixed, default: {} },
    taxRuleReferences: { type: Schema.Types.Mixed, default: [] },
    sourceProjectionReferences: { type: Schema.Types.Mixed, default: [] },
    readinessStatus: { type: String, default: 'IN_PROGRESS' },
    disclaimer: { type: String, required: true }
  },
  { timestamps: true }
);

IndividualTaxPackSchema.index({ companyId: 1, taxYear: 1, version: 1 }, { unique: true });
IndividualTaxPackSchema.index({ companyId: 1, taxYear: 1, status: 1 });

IndividualTaxPackSchema.pre('findOneAndUpdate', function (next) {
  next(new Error('Individual tax packs cannot be updated in place. Generate a new version.'));
});
IndividualTaxPackSchema.pre('updateOne', function (next) {
  next(new Error('Individual tax packs cannot be updated in place. Generate a new version.'));
});
IndividualTaxPackSchema.pre('updateMany', function (next) {
  next(new Error('Individual tax packs cannot be updated in place. Generate a new version.'));
});
IndividualTaxPackSchema.pre('deleteOne', { document: false, query: true }, function (next) {
  next(new Error('Hard delete is disabled for individual tax packs.'));
});
IndividualTaxPackSchema.pre('deleteMany', { document: false, query: true }, function (next) {
  next(new Error('Hard delete is disabled for individual tax packs.'));
});

export const IndividualTaxPack = mongoose.model<IIndividualTaxPack>(
  'IndividualTaxPack',
  IndividualTaxPackSchema,
  COLLECTIONS.INDIVIDUAL_TAX_PACKS
);
