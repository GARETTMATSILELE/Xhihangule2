import mongoose, { Schema, Document, Types } from 'mongoose';
import { accountingConnection } from '../config/database';
import { COLLECTIONS } from '../config/collections';
import type { AccountingTreatment, TransactionCategory } from './PropertyAccount';

export const LANDLORD_SOURCE_KINDS = [
  'EXPENSE',
  'OTHER_INCOME',
  'MAINTENANCE',
  'CAPITAL',
  'LIABILITY',
  'REVERSAL'
] as const;
export type LandlordSourceKind = (typeof LANDLORD_SOURCE_KINDS)[number];

export const VAT_MODES = ['NO_VAT', 'VAT_INCLUSIVE', 'VAT_EXCLUSIVE', 'UNKNOWN', 'ACCOUNTANT_REVIEW'] as const;
export type LandlordVatMode = (typeof VAT_MODES)[number];

export const DEDUCTIBILITY = [
  'DEDUCTIBLE',
  'NON_DEDUCTIBLE',
  'PARTIALLY_DEDUCTIBLE',
  'CAPITAL',
  'ACCOUNTANT_REVIEW',
  'NOT_APPLICABLE'
] as const;
export type Deductibility = (typeof DEDUCTIBILITY)[number];

export const CAPITAL_OR_REVENUE = ['REVENUE', 'CAPITAL', 'MIXED', 'ACCOUNTANT_REVIEW'] as const;
export type CapitalOrRevenue = (typeof CAPITAL_OR_REVENUE)[number];

export interface ILandlordFinancialTransaction extends Document {
  companyId: Types.ObjectId;
  propertyId: Types.ObjectId;
  createdBy: Types.ObjectId;
  sourceKind: LandlordSourceKind;
  category: string;
  description: string;
  amount: number;
  currency: string;
  date: Date;
  supplier?: string;
  supplierTin?: string;
  supplierVatNumber?: string;
  invoiceNumber?: string;
  paymentMethod?: string;
  referenceNumber?: string;
  notes?: string;
  attachments?: string[];
  vatMode: LandlordVatMode;
  accountingTreatment: AccountingTreatment;
  transactionCategory?: TransactionCategory;
  capitalOrRevenue: CapitalOrRevenue;
  deductibility: Deductibility;
  inputVatEligibility?: string;
  taxReviewStatus: 'UNCLASSIFIED' | 'READY' | 'ACCOUNTANT_REVIEW';
  idempotencyKey: string;
  propertyAccountId?: Types.ObjectId;
  propertyAccountTransactionId?: Types.ObjectId;
  reversalOf?: Types.ObjectId;
  reversedBy?: Types.ObjectId;
  status: 'POSTED' | 'REVERSED';
  accountingPeriodId?: Types.ObjectId;
  sourceMaintenanceId?: Types.ObjectId;
  taxSnapshotId?: Types.ObjectId;
  taxCalculationStatus?: string;
  taxPeriodKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

const LandlordFinancialTransactionSchema = new Schema<ILandlordFinancialTransaction>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    sourceKind: { type: String, enum: LANDLORD_SOURCE_KINDS, required: true, index: true },
    category: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'USD', trim: true },
    date: { type: Date, required: true, index: true },
    supplier: { type: String, trim: true },
    supplierTin: { type: String, trim: true },
    supplierVatNumber: { type: String, trim: true },
    invoiceNumber: { type: String, trim: true },
    paymentMethod: { type: String, trim: true },
    referenceNumber: { type: String, trim: true },
    notes: { type: String, trim: true },
    attachments: { type: [String], default: [] },
    vatMode: { type: String, enum: VAT_MODES, default: 'UNKNOWN' },
    accountingTreatment: { type: String, required: true },
    transactionCategory: { type: String, required: false },
    capitalOrRevenue: { type: String, enum: CAPITAL_OR_REVENUE, default: 'REVENUE' },
    deductibility: { type: String, enum: DEDUCTIBILITY, default: 'ACCOUNTANT_REVIEW' },
    inputVatEligibility: { type: String, required: false, trim: true },
    taxReviewStatus: {
      type: String,
      enum: ['UNCLASSIFIED', 'READY', 'ACCOUNTANT_REVIEW'],
      default: 'UNCLASSIFIED',
      index: true
    },
    idempotencyKey: { type: String, required: true },
    propertyAccountId: { type: Schema.Types.ObjectId },
    propertyAccountTransactionId: { type: Schema.Types.ObjectId },
    reversalOf: { type: Schema.Types.ObjectId, ref: 'LandlordFinancialTransaction' },
    reversedBy: { type: Schema.Types.ObjectId, ref: 'LandlordFinancialTransaction' },
    status: { type: String, enum: ['POSTED', 'REVERSED'], default: 'POSTED', index: true },
    accountingPeriodId: { type: Schema.Types.ObjectId, ref: 'AccountingPeriod' },
    sourceMaintenanceId: { type: Schema.Types.ObjectId, ref: 'MaintenanceRequest' },
    taxSnapshotId: { type: Schema.Types.ObjectId, ref: 'TransactionTaxSnapshot', required: false, index: true },
    taxCalculationStatus: { type: String, required: false, index: true },
    taxPeriodKey: { type: String, required: false, index: true }
  },
  { timestamps: true }
);

LandlordFinancialTransactionSchema.index({ companyId: 1, idempotencyKey: 1 }, { unique: true });
LandlordFinancialTransactionSchema.index({ companyId: 1, propertyId: 1, date: -1 });
LandlordFinancialTransactionSchema.index({ companyId: 1, sourceKind: 1, status: 1, date: -1 });
LandlordFinancialTransactionSchema.index({ companyId: 1, taxPeriodKey: 1, taxCalculationStatus: 1 });

function onlyAllowedCanonicalUpdate(update: Record<string, unknown> | null | undefined): boolean {
  const set = (update?.$set || update || {}) as Record<string, unknown>;
  const keys = Object.keys(set).filter((key) => key !== 'updatedAt');
  const allowed = new Set(['status', 'reversedBy', 'propertyAccountId', 'propertyAccountTransactionId', 'taxSnapshotId', 'taxCalculationStatus', 'taxPeriodKey']);
  return keys.length > 0 && keys.every((key) => allowed.has(key));
}

LandlordFinancialTransactionSchema.pre('findOneAndUpdate', function (next) {
  if (onlyAllowedCanonicalUpdate(this.getUpdate() as Record<string, unknown>)) return next();
  next(new Error('Landlord financial transactions cannot be updated in place. Post a reversal.'));
});
LandlordFinancialTransactionSchema.pre('updateOne', function (next) {
  if (onlyAllowedCanonicalUpdate(this.getUpdate() as Record<string, unknown>)) return next();
  next(new Error('Landlord financial transactions cannot be updated in place. Post a reversal.'));
});
LandlordFinancialTransactionSchema.pre('updateMany', function (next) {
  next(new Error('Landlord financial transactions cannot be updated in place. Post a reversal.'));
});
LandlordFinancialTransactionSchema.pre('deleteOne', { document: false, query: true }, function (next) {
  next(new Error('Hard delete is disabled for landlord financial transactions.'));
});
LandlordFinancialTransactionSchema.pre('deleteMany', { document: false, query: true }, function (next) {
  next(new Error('Hard delete is disabled for landlord financial transactions.'));
});

export const LandlordFinancialTransaction = accountingConnection.model<ILandlordFinancialTransaction>(
  'LandlordFinancialTransaction',
  LandlordFinancialTransactionSchema,
  COLLECTIONS.LANDLORD_FINANCIAL_TRANSACTIONS
);

export default LandlordFinancialTransaction;
