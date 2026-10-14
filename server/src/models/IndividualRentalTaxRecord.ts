import mongoose, { Schema, Document, Types } from 'mongoose';
import { COLLECTIONS } from '../config/collections';
import { RENTAL_TAX_CALCULATION_STATUSES, type RentalTaxCalculationStatus } from '../services/individualRentalTaxCalculation';
import { RENTAL_TAX_REGIMES, type RentalTaxRegime } from '../services/tax/rentalTaxTypes';

export const RENTAL_TAX_RECORD_KINDS = ['ORIGINAL', 'REVERSAL', 'ADJUSTMENT'] as const;
export type RentalTaxRecordKind = (typeof RENTAL_TAX_RECORD_KINDS)[number];

export interface IIndividualRentalTaxRecord extends Document {
  companyId: Types.ObjectId;
  ownerId?: Types.ObjectId | null;
  propertyId?: Types.ObjectId | null;
  sourceType: 'Payment' | 'LandlordFinancialTransaction';
  sourceId: Types.ObjectId;
  snapshotId?: Types.ObjectId | null;
  taxPeriodId?: Types.ObjectId | null;
  taxPeriodKey: string;
  taxType: 'PRESUMPTIVE_RENTAL_INCOME_TAX';
  recordKind: RentalTaxRecordKind;
  reversalOf?: Types.ObjectId | null;
  reversalReason?: string | null;
  reversalDate?: Date | null;
  reversalTransactionId?: string | null;
  rentalTaxRegime: RentalTaxRegime;
  applicabilityStatus: string;
  applicabilityReason: string;
  grossRentalAmount: number | null;
  excludedAmount: number | null;
  taxableRentalBase: number | null;
  taxRate: number | null;
  taxAmount: number | null;
  currency: string;
  transactionCurrency: string;
  baseCurrency: string;
  baseAmount?: number | null;
  exchangeRate?: number | null;
  exchangeRateDate?: Date | null;
  taxRuleId?: string | null;
  taxRuleVersion?: number | null;
  taxRuleCode?: string | null;
  taxRuleEffectiveFrom?: string | null;
  sourceReference?: string | null;
  calculationMethod: string;
  calculationStatus: RentalTaxCalculationStatus;
  reviewStatus: string;
  reviewReason?: string | null;
  reviewReasons: string[];
  incomeTaxAmount: null;
  vatAmount: null;
  calculatedAt: Date;
  calculatedBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const IndividualRentalTaxRecordSchema = new Schema<IIndividualRentalTaxRecord>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true, immutable: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', default: null, index: true },
    sourceType: { type: String, enum: ['Payment', 'LandlordFinancialTransaction'], required: true },
    sourceId: { type: Schema.Types.ObjectId, required: true, index: true },
    snapshotId: { type: Schema.Types.ObjectId, ref: 'TransactionTaxSnapshot', default: null, index: true },
    taxPeriodId: { type: Schema.Types.ObjectId, ref: 'TaxPeriod', default: null, index: true },
    taxPeriodKey: { type: String, required: true, index: true },
    taxType: { type: String, enum: ['PRESUMPTIVE_RENTAL_INCOME_TAX'], default: 'PRESUMPTIVE_RENTAL_INCOME_TAX', required: true },
    recordKind: { type: String, enum: RENTAL_TAX_RECORD_KINDS, default: 'ORIGINAL', index: true },
    reversalOf: { type: Schema.Types.ObjectId, ref: 'IndividualRentalTaxRecord', default: null, index: true },
    reversalReason: { type: String, default: null },
    reversalDate: { type: Date, default: null },
    reversalTransactionId: { type: String, default: null },
    rentalTaxRegime: { type: String, enum: RENTAL_TAX_REGIMES, required: true },
    applicabilityStatus: { type: String, required: true },
    applicabilityReason: { type: String, required: true },
    grossRentalAmount: { type: Schema.Types.Mixed, default: null },
    excludedAmount: { type: Schema.Types.Mixed, default: null },
    taxableRentalBase: { type: Schema.Types.Mixed, default: null },
    taxRate: { type: Schema.Types.Mixed, default: null },
    taxAmount: { type: Schema.Types.Mixed, default: null },
    currency: { type: String, default: 'USD' },
    transactionCurrency: { type: String, default: 'USD' },
    baseCurrency: { type: String, default: 'USD' },
    baseAmount: { type: Schema.Types.Mixed, default: null },
    exchangeRate: { type: Number, default: null },
    exchangeRateDate: { type: Date, default: null },
    taxRuleId: { type: String, default: null },
    taxRuleVersion: { type: Number, default: null },
    taxRuleCode: { type: String, default: null },
    taxRuleEffectiveFrom: { type: String, default: null },
    sourceReference: { type: String, default: null },
    calculationMethod: { type: String, required: true },
    calculationStatus: { type: String, enum: RENTAL_TAX_CALCULATION_STATUSES, required: true, index: true },
    reviewStatus: { type: String, required: true, index: true },
    reviewReason: { type: String, default: null },
    reviewReasons: { type: [String], default: [] },
    incomeTaxAmount: { type: Schema.Types.Mixed, default: null },
    vatAmount: { type: Schema.Types.Mixed, default: null },
    calculatedAt: { type: Date, required: true, default: () => new Date() },
    calculatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { timestamps: true }
);

IndividualRentalTaxRecordSchema.index(
  { companyId: 1, sourceType: 1, sourceId: 1, taxType: 1, recordKind: 1 },
  { unique: true }
);
IndividualRentalTaxRecordSchema.index({ companyId: 1, taxPeriodKey: 1, calculationStatus: 1 });
IndividualRentalTaxRecordSchema.index({ companyId: 1, taxPeriodId: 1 });
IndividualRentalTaxRecordSchema.index({ companyId: 1, propertyId: 1, taxPeriodKey: 1 });

IndividualRentalTaxRecordSchema.pre('findOneAndUpdate', function (next) {
  next(new Error('Individual rental tax records cannot be updated in place. Post a reversal.'));
});
IndividualRentalTaxRecordSchema.pre('updateOne', function (next) {
  next(new Error('Individual rental tax records cannot be updated in place. Post a reversal.'));
});
IndividualRentalTaxRecordSchema.pre('updateMany', function (next) {
  next(new Error('Individual rental tax records cannot be updated in place. Post a reversal.'));
});
IndividualRentalTaxRecordSchema.pre('deleteOne', { document: false, query: true }, function (next) {
  next(new Error('Hard delete is disabled for individual rental tax records.'));
});
IndividualRentalTaxRecordSchema.pre('deleteMany', { document: false, query: true }, function (next) {
  next(new Error('Hard delete is disabled for individual rental tax records.'));
});

export const IndividualRentalTaxRecord = mongoose.model<IIndividualRentalTaxRecord>(
  'IndividualRentalTaxRecord',
  IndividualRentalTaxRecordSchema,
  COLLECTIONS.INDIVIDUAL_RENTAL_TAX_RECORDS
);
