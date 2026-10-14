import mongoose, { Schema, Document, Types } from 'mongoose';
import { COLLECTIONS } from '../config/collections';
import { TAX_CALCULATION_STATUSES, type TaxCalculationStatus } from '../services/tax/taxMetadataTypes';
import {
  INPUT_VAT_ELIGIBILITIES,
  VAT_DIRECTIONS,
  VAT_TREATMENTS,
  type InputVatEligibility,
  type IndividualVatTreatment,
  type VatDirection
} from '../services/individualVatApplicability';

export const VAT_RECORD_KINDS = ['ORIGINAL', 'REVERSAL', 'ADJUSTMENT'] as const;
export type VatRecordKind = (typeof VAT_RECORD_KINDS)[number];

export interface IIndividualVatRecord extends Document {
  companyId: Types.ObjectId;
  propertyId?: Types.ObjectId | null;
  sourceType: 'Payment' | 'LandlordFinancialTransaction';
  sourceId: Types.ObjectId;
  snapshotId?: Types.ObjectId | null;
  taxPeriodId?: Types.ObjectId | null;
  taxPeriodKey: string;
  taxType: 'VAT';
  direction: VatDirection;
  recordKind: VatRecordKind;
  reversalOf?: Types.ObjectId | null;
  reversalReason?: string | null;
  reversalDate?: Date | null;
  reversalTransactionId?: string | null;
  treatment: IndividualVatTreatment;
  applicabilityReason: string;
  grossAmount: number | null;
  netAmount: number | null;
  taxableAmount: number | null;
  vatRate: number | null;
  vatAmount: number | null;
  chargedVatAmount: number | null;
  recoverableVatAmount: number | null;
  inputVatEligibility?: InputVatEligibility | null;
  calculationMethod: string;
  calculationStatus: TaxCalculationStatus;
  reviewReasons: string[];
  taxRuleId?: string | null;
  taxRuleVersion?: number | null;
  taxRuleCode?: string | null;
  taxRuleEffectiveFrom?: string | null;
  currency: string;
  baseCurrency: string;
  baseAmount?: number | null;
  exchangeRate?: number | null;
  exchangeRateDate?: Date | null;
  supplier?: string | null;
  supplierTin?: string | null;
  supplierVatNumber?: string | null;
  invoiceNumber?: string | null;
  counterpartyName?: string | null;
  incomeTaxAmount: null;
  presumptiveTaxAmount: null;
  calculatedAt: Date;
  calculatedBy?: Types.ObjectId | null;
  createdAt: Date;
}

const IndividualVatRecordSchema = new Schema<IIndividualVatRecord>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true, immutable: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', default: null, index: true },
    sourceType: { type: String, enum: ['Payment', 'LandlordFinancialTransaction'], required: true },
    sourceId: { type: Schema.Types.ObjectId, required: true, index: true },
    snapshotId: { type: Schema.Types.ObjectId, ref: 'TransactionTaxSnapshot', default: null, index: true },
    taxPeriodId: { type: Schema.Types.ObjectId, ref: 'TaxPeriod', default: null, index: true },
    taxPeriodKey: { type: String, required: true, index: true },
    taxType: { type: String, enum: ['VAT'], default: 'VAT', required: true },
    direction: { type: String, enum: VAT_DIRECTIONS, required: true, index: true },
    recordKind: { type: String, enum: VAT_RECORD_KINDS, default: 'ORIGINAL', index: true },
    reversalOf: { type: Schema.Types.ObjectId, ref: 'IndividualVatRecord', default: null, index: true },
    reversalReason: { type: String, default: null },
    reversalDate: { type: Date, default: null },
    reversalTransactionId: { type: String, default: null },
    treatment: { type: String, enum: VAT_TREATMENTS, required: true },
    applicabilityReason: { type: String, required: true },
    grossAmount: { type: Schema.Types.Mixed, default: null },
    netAmount: { type: Schema.Types.Mixed, default: null },
    taxableAmount: { type: Schema.Types.Mixed, default: null },
    vatRate: { type: Schema.Types.Mixed, default: null },
    vatAmount: { type: Schema.Types.Mixed, default: null },
    chargedVatAmount: { type: Schema.Types.Mixed, default: null },
    recoverableVatAmount: { type: Schema.Types.Mixed, default: null },
    inputVatEligibility: { type: String, enum: INPUT_VAT_ELIGIBILITIES, default: null },
    calculationMethod: { type: String, required: true },
    calculationStatus: { type: String, enum: TAX_CALCULATION_STATUSES, required: true, index: true },
    reviewReasons: { type: [String], default: [] },
    taxRuleId: { type: String, default: null },
    taxRuleVersion: { type: Number, default: null },
    taxRuleCode: { type: String, default: null },
    taxRuleEffectiveFrom: { type: String, default: null },
    currency: { type: String, default: 'USD' },
    baseCurrency: { type: String, default: 'USD' },
    baseAmount: { type: Schema.Types.Mixed, default: null },
    exchangeRate: { type: Number, default: null },
    exchangeRateDate: { type: Date, default: null },
    supplier: { type: String, default: null },
    supplierTin: { type: String, default: null },
    supplierVatNumber: { type: String, default: null },
    invoiceNumber: { type: String, default: null },
    counterpartyName: { type: String, default: null },
    incomeTaxAmount: { type: Schema.Types.Mixed, default: null },
    presumptiveTaxAmount: { type: Schema.Types.Mixed, default: null },
    calculatedAt: { type: Date, required: true, default: () => new Date() },
    calculatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);

IndividualVatRecordSchema.index(
  { companyId: 1, sourceType: 1, sourceId: 1, direction: 1, recordKind: 1 },
  { unique: true }
);
IndividualVatRecordSchema.index({ companyId: 1, taxPeriodKey: 1, direction: 1, calculationStatus: 1 });
IndividualVatRecordSchema.index({ companyId: 1, taxPeriodId: 1, direction: 1 });

IndividualVatRecordSchema.pre('findOneAndUpdate', function (next) {
  next(new Error('Individual VAT records cannot be updated in place. Post a reversal.'));
});
IndividualVatRecordSchema.pre('updateOne', function (next) {
  next(new Error('Individual VAT records cannot be updated in place. Post a reversal.'));
});
IndividualVatRecordSchema.pre('updateMany', function (next) {
  next(new Error('Individual VAT records cannot be updated in place. Post a reversal.'));
});
IndividualVatRecordSchema.pre('deleteOne', { document: false, query: true }, function (next) {
  next(new Error('Hard delete is disabled for individual VAT records.'));
});
IndividualVatRecordSchema.pre('deleteMany', { document: false, query: true }, function (next) {
  next(new Error('Hard delete is disabled for individual VAT records.'));
});

export const IndividualVatRecord = mongoose.model<IIndividualVatRecord>(
  'IndividualVatRecord',
  IndividualVatRecordSchema,
  COLLECTIONS.INDIVIDUAL_VAT_RECORDS
);
