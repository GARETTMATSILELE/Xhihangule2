import mongoose, { Schema, Document, Types } from 'mongoose';
import { COLLECTIONS } from '../config/collections';
import { INCOME_TAX_CALCULATION_STATUSES, INCOME_TAX_CLASSIFICATIONS, type IncomeTaxCalculationStatus, type IncomeTaxClassification } from '../services/tax/incomeTaxTypes';

export const INCOME_TAX_RECORD_KINDS = ['ORIGINAL', 'REVERSAL'] as const;
export type IncomeTaxRecordKind = (typeof INCOME_TAX_RECORD_KINDS)[number];

export interface IIndividualIncomeTaxRecord extends Document {
  companyId: Types.ObjectId;
  taxpayerId?: Types.ObjectId | null;
  ownerId?: Types.ObjectId | null;
  propertyId?: Types.ObjectId | null;
  sourceType: 'Payment' | 'LandlordFinancialTransaction';
  sourceId: Types.ObjectId;
  snapshotId?: Types.ObjectId | null;
  taxpayerProfileSnapshotId?: string | null;
  taxPeriodId?: Types.ObjectId | null;
  taxPeriodKey: string;
  taxType: 'INCOME_TAX';
  recordKind: IncomeTaxRecordKind;
  reversalOf?: Types.ObjectId | null;
  reversalRecordId?: Types.ObjectId | null;
  reversalReason?: string | null;
  reversalDate?: Date | null;
  incomeTaxRegime: string;
  classification: IncomeTaxClassification;
  accountingIncome: number | null;
  accountingExpenses: number | null;
  taxableIncomeBeforeAdjustments: number | null;
  addBacks: number | null;
  deductions: number | null;
  exemptIncome: number | null;
  capitalAdjustments: number | null;
  otherTaxAdjustments: number | null;
  taxableIncome: number | null;
  taxableContribution: number | null;
  taxRate: number | null;
  taxAmount: null;
  taxCurrency: string;
  currency: string;
  transactionCurrency: string;
  baseCurrency: string;
  exchangeRate?: number | null;
  exchangeRateDate?: Date | null;
  exchangeRateSource?: string | null;
  taxRuleId?: string | null;
  taxRuleVersion?: number | null;
  taxRuleCode?: string | null;
  taxRuleEffectiveFrom?: string | null;
  taxRuleEffectiveTo?: string | null;
  sourceReference?: string | null;
  calculationMethod: string;
  calculationStatus: IncomeTaxCalculationStatus;
  reviewStatus: string;
  reviewReason?: string | null;
  reviewReasons: string[];
  supportingDocumentStatus: string;
  vatAmount: null;
  presumptiveTaxAmount: null;
  calculatedAt: Date;
  finalizedAt?: Date | null;
  calculatedBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const IndividualIncomeTaxRecordSchema = new Schema<IIndividualIncomeTaxRecord>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true, immutable: true },
    taxpayerId: { type: Schema.Types.ObjectId, ref: 'Company', default: null },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', default: null, index: true },
    sourceType: { type: String, enum: ['Payment', 'LandlordFinancialTransaction'], required: true },
    sourceId: { type: Schema.Types.ObjectId, required: true, index: true },
    snapshotId: { type: Schema.Types.ObjectId, ref: 'TransactionTaxSnapshot', default: null, index: true },
    taxpayerProfileSnapshotId: { type: String, default: null },
    taxPeriodId: { type: Schema.Types.ObjectId, ref: 'TaxPeriod', default: null, index: true },
    taxPeriodKey: { type: String, required: true, index: true },
    taxType: { type: String, enum: ['INCOME_TAX'], default: 'INCOME_TAX', required: true },
    recordKind: { type: String, enum: INCOME_TAX_RECORD_KINDS, default: 'ORIGINAL', index: true },
    reversalOf: { type: Schema.Types.ObjectId, ref: 'IndividualIncomeTaxRecord', default: null, index: true },
    reversalRecordId: { type: Schema.Types.ObjectId, ref: 'IndividualIncomeTaxRecord', default: null },
    reversalReason: { type: String, default: null },
    reversalDate: { type: Date, default: null },
    incomeTaxRegime: { type: String, required: true },
    classification: { type: String, enum: INCOME_TAX_CLASSIFICATIONS, required: true, index: true },
    accountingIncome: { type: Schema.Types.Mixed, default: null },
    accountingExpenses: { type: Schema.Types.Mixed, default: null },
    taxableIncomeBeforeAdjustments: { type: Schema.Types.Mixed, default: null },
    addBacks: { type: Schema.Types.Mixed, default: null },
    deductions: { type: Schema.Types.Mixed, default: null },
    exemptIncome: { type: Schema.Types.Mixed, default: null },
    capitalAdjustments: { type: Schema.Types.Mixed, default: null },
    otherTaxAdjustments: { type: Schema.Types.Mixed, default: null },
    taxableIncome: { type: Schema.Types.Mixed, default: null },
    taxableContribution: { type: Schema.Types.Mixed, default: null },
    taxRate: { type: Schema.Types.Mixed, default: null },
    taxAmount: { type: Schema.Types.Mixed, default: null },
    taxCurrency: { type: String, default: 'USD' },
    currency: { type: String, default: 'USD' },
    transactionCurrency: { type: String, default: 'USD' },
    baseCurrency: { type: String, default: 'USD' },
    exchangeRate: { type: Number, default: null },
    exchangeRateDate: { type: Date, default: null },
    exchangeRateSource: { type: String, default: null },
    taxRuleId: { type: String, default: null },
    taxRuleVersion: { type: Number, default: null },
    taxRuleCode: { type: String, default: null },
    taxRuleEffectiveFrom: { type: String, default: null },
    taxRuleEffectiveTo: { type: String, default: null },
    sourceReference: { type: String, default: null },
    calculationMethod: { type: String, required: true },
    calculationStatus: { type: String, enum: INCOME_TAX_CALCULATION_STATUSES, required: true, index: true },
    reviewStatus: { type: String, required: true, index: true },
    reviewReason: { type: String, default: null },
    reviewReasons: { type: [String], default: [] },
    supportingDocumentStatus: { type: String, default: 'NOT_REQUIRED' },
    vatAmount: { type: Schema.Types.Mixed, default: null },
    presumptiveTaxAmount: { type: Schema.Types.Mixed, default: null },
    calculatedAt: { type: Date, required: true, default: () => new Date() },
    finalizedAt: { type: Date, default: null },
    calculatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { timestamps: true }
);

IndividualIncomeTaxRecordSchema.index(
  { companyId: 1, sourceType: 1, sourceId: 1, taxType: 1, recordKind: 1 },
  { unique: true }
);
IndividualIncomeTaxRecordSchema.index({ companyId: 1, taxPeriodId: 1 });
IndividualIncomeTaxRecordSchema.index({ companyId: 1, taxPeriodKey: 1 });
IndividualIncomeTaxRecordSchema.index({ companyId: 1, propertyId: 1, taxPeriodKey: 1 });
IndividualIncomeTaxRecordSchema.index({ companyId: 1, calculationStatus: 1 });

IndividualIncomeTaxRecordSchema.pre('findOneAndUpdate', function (next) {
  next(new Error('Individual income tax records cannot be updated in place. Post a reversal.'));
});
IndividualIncomeTaxRecordSchema.pre('updateOne', function (next) {
  next(new Error('Individual income tax records cannot be updated in place. Post a reversal.'));
});
IndividualIncomeTaxRecordSchema.pre('updateMany', function (next) {
  next(new Error('Individual income tax records cannot be updated in place. Post a reversal.'));
});
IndividualIncomeTaxRecordSchema.pre('deleteOne', { document: false, query: true }, function (next) {
  next(new Error('Hard delete is disabled for individual income tax records.'));
});
IndividualIncomeTaxRecordSchema.pre('deleteMany', { document: false, query: true }, function (next) {
  next(new Error('Hard delete is disabled for individual income tax records.'));
});

export const IndividualIncomeTaxRecord = mongoose.model<IIndividualIncomeTaxRecord>(
  'IndividualIncomeTaxRecord',
  IndividualIncomeTaxRecordSchema,
  COLLECTIONS.INDIVIDUAL_INCOME_TAX_RECORDS
);
