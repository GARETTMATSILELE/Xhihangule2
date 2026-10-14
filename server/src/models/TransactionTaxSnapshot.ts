import mongoose, { Schema, Document, Types } from 'mongoose';
import { COLLECTIONS } from '../config/collections';
import {
  TAX_CALCULATION_STATUSES,
  TAX_CLASSIFICATION_SOURCES,
  TAX_PERIOD_ASSIGNMENT_STATUSES,
  TRANSACTION_TAX_SOURCE_KINDS,
  type TaxCalculationStatus,
  type TaxClassificationSource,
  type TaxPeriodAssignmentStatus,
  type TaxProfileSnapshot,
  type TaxRuleReference,
  type TransactionTaxSourceKind
} from '../services/tax/taxMetadataTypes';

export interface ITransactionTaxSnapshot extends Document {
  companyId: Types.ObjectId;
  propertyId?: Types.ObjectId | null;
  sourceType: 'Payment' | 'LandlordFinancialTransaction';
  sourceId: Types.ObjectId;
  sourceKind: TransactionTaxSourceKind;
  transactionDate: Date;
  accountingPeriodId?: Types.ObjectId | null;
  taxPeriodKey: string;
  taxPeriodId?: Types.ObjectId | null;
  periodAssignmentStatus: TaxPeriodAssignmentStatus;
  taxTypesRelevant: string[];
  taxRuleReferences: TaxRuleReference[];
  taxProfileSnapshot: TaxProfileSnapshot;
  vatTreatment: string;
  rentalTaxTreatment: string;
  rentalTaxRegime: string;
  deductibility?: string | null;
  capitalOrRevenue?: string | null;
  classificationSource: TaxClassificationSource;
  classificationStatus: TaxCalculationStatus;
  taxCalculationStatus: TaxCalculationStatus;
  reviewReasons: string[];
  taxAmount: null;
  taxableAmount: null;
  taxRate: null;
  vatAmount: null;
  presumptiveTaxAmount: null;
  incomeTaxAmount: null;
  classifiedAt: Date;
  classifiedBy?: Types.ObjectId | null;
  createdAt: Date;
}

const TaxRuleReferenceSchema = new Schema(
  {
    taxType: { type: String, required: true },
    ruleId: { type: String, default: null },
    ruleCode: { type: String, default: null },
    ruleVersion: { type: Number, default: null },
    effectiveFrom: { type: String, default: null },
    sourceReference: { type: String, default: null },
    configuredRate: { type: Number, default: null },
    taxAmount: { type: Schema.Types.Mixed, default: null },
    taxCalculationStatus: { type: String, enum: TAX_CALCULATION_STATUSES, required: true }
  },
  { _id: false }
);

const TaxProfileSnapshotSchema = new Schema(
  {
    vatRegistered: { type: Boolean, required: true },
    vatNumber: { type: String, default: '' },
    rentalTaxRegime: { type: String, required: true },
    incomeTaxRegistered: { type: Boolean, required: true },
    propertyUseClass: { type: String, default: null },
    vatSupplyTreatment: { type: String, required: true },
    rentalTaxTreatment: { type: String, required: true },
    ownerProfileVersion: { type: Number, required: true, default: 1 },
    propertyUpdatedAt: { type: String, default: null }
  },
  { _id: false }
);

const TransactionTaxSnapshotSchema = new Schema<ITransactionTaxSnapshot>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', default: null, index: true },
    sourceType: { type: String, enum: ['Payment', 'LandlordFinancialTransaction'], required: true },
    sourceId: { type: Schema.Types.ObjectId, required: true, index: true },
    sourceKind: { type: String, enum: TRANSACTION_TAX_SOURCE_KINDS, required: true, index: true },
    transactionDate: { type: Date, required: true, index: true },
    accountingPeriodId: { type: Schema.Types.ObjectId, ref: 'AccountingPeriod', default: null },
    taxPeriodKey: { type: String, required: true, index: true },
    taxPeriodId: { type: Schema.Types.ObjectId, ref: 'TaxPeriod', default: null, index: true },
    periodAssignmentStatus: { type: String, enum: TAX_PERIOD_ASSIGNMENT_STATUSES, required: true },
    taxTypesRelevant: { type: [String], default: [] },
    taxRuleReferences: { type: [TaxRuleReferenceSchema], default: [] },
    taxProfileSnapshot: { type: TaxProfileSnapshotSchema, required: true },
    vatTreatment: { type: String, required: true },
    rentalTaxTreatment: { type: String, required: true },
    rentalTaxRegime: { type: String, required: true },
    deductibility: { type: String, default: null },
    capitalOrRevenue: { type: String, default: null },
    classificationSource: { type: String, enum: TAX_CLASSIFICATION_SOURCES, required: true },
    classificationStatus: { type: String, enum: TAX_CALCULATION_STATUSES, required: true },
    taxCalculationStatus: { type: String, enum: TAX_CALCULATION_STATUSES, required: true, index: true },
    reviewReasons: { type: [String], default: [] },
    taxAmount: { type: Schema.Types.Mixed, default: null },
    taxableAmount: { type: Schema.Types.Mixed, default: null },
    taxRate: { type: Schema.Types.Mixed, default: null },
    vatAmount: { type: Schema.Types.Mixed, default: null },
    presumptiveTaxAmount: { type: Schema.Types.Mixed, default: null },
    incomeTaxAmount: { type: Schema.Types.Mixed, default: null },
    classifiedAt: { type: Date, required: true, default: () => new Date() },
    classifiedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);

TransactionTaxSnapshotSchema.index({ companyId: 1, sourceType: 1, sourceId: 1 }, { unique: true });
TransactionTaxSnapshotSchema.index({ companyId: 1, taxPeriodKey: 1, taxCalculationStatus: 1 });
TransactionTaxSnapshotSchema.index({ companyId: 1, propertyId: 1, transactionDate: -1 });

TransactionTaxSnapshotSchema.pre('save', function (next) {
  if (!this.isNew && this.isModified()) {
    return next(new Error('Tax snapshots are immutable after posting.'));
  }
  if (this.taxAmount != null || this.vatAmount != null || this.presumptiveTaxAmount != null || this.incomeTaxAmount != null) {
    return next(new Error('Phase D tax snapshots cannot store calculated tax amounts.'));
  }
  return next();
});
TransactionTaxSnapshotSchema.pre('findOneAndUpdate', function (next) {
  next(new Error('Tax snapshots cannot be updated in place.'));
});
TransactionTaxSnapshotSchema.pre('updateOne', function (next) {
  next(new Error('Tax snapshots cannot be updated in place.'));
});
TransactionTaxSnapshotSchema.pre('updateMany', function (next) {
  next(new Error('Tax snapshots cannot be updated in place.'));
});
TransactionTaxSnapshotSchema.pre('deleteOne', { document: false, query: true }, function (next) {
  next(new Error('Hard delete is disabled for tax snapshots.'));
});
TransactionTaxSnapshotSchema.pre('deleteMany', { document: false, query: true }, function (next) {
  next(new Error('Hard delete is disabled for tax snapshots.'));
});

export const TransactionTaxSnapshot = mongoose.model<ITransactionTaxSnapshot>(
  'TransactionTaxSnapshot',
  TransactionTaxSnapshotSchema,
  COLLECTIONS.TRANSACTION_TAX_SNAPSHOTS
);
