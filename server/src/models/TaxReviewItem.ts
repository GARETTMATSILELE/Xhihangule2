import mongoose, { Document, Schema, Types } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export type TaxReviewKind =
  | 'CGT_MISSING_ACQUISITION_COST'
  | 'SALE_VAT_APPLICABILITY_UNCERTAIN'
  | 'VAT_CHARGED_WHILE_COMPANY_NOT_REGISTERED'
  | 'TAX_PAYMENT_WITHOUT_ZIMRA_REFERENCE'
  | 'TAX_RECEIPT_WITHOUT_MATCHING_PAYMENT'
  | 'TRUST_ACCOUNT_MISMATCH'
  | 'MANUAL_TAX_OVERRIDE'
  | 'NEGATIVE_CLIENT_BALANCE'
  | 'UNRECONCILED_TAX_OBLIGATION'
  | 'LEGACY_CGT_ON_GROSS_SALE_PRICE'
  | 'VAT_REGISTRATION_STATUS_MISSING'
  | 'CGWT_MISSING'
  | 'CGWT_RATE_NOT_CONFIGURED'
  | 'CGT_RATE_NOT_CONFIGURED'
  | 'VAT_REQUESTED_ON_NON_TAXABLE_SUPPLY'
  | 'FISCALISATION_NOT_CONFIRMED'
  | 'VAT_RATE_2026_NOT_CONFIGURED'
  | 'CGT_SETTLEMENT_REVIEW_REQUIRED'
  | 'CGWT_RATE_MISSING'
  | 'CGWT_APPLICABILITY_UNDECIDED'
  | 'FX_REVIEW_REQUIRED'
  | 'VAT_RATE_MISSING'
  | 'LEGACY_CGT_CALCULATION';

export type TaxReviewStatus =
  | 'open'
  | 'resolved'
  | 'ignored'
  | 'OPEN'
  | 'UNDER_REVIEW'
  | 'ACKNOWLEDGED'
  | 'CORRECTED_MANUALLY'
  | 'NO_ACTION_REQUIRED';

export interface ITaxReviewItem extends Document {
  companyId: Types.ObjectId;
  kind: TaxReviewKind;
  status: TaxReviewStatus;
  title: string;
  detail?: string;
  paymentId?: Types.ObjectId;
  propertyId?: Types.ObjectId;
  trustAccountId?: Types.ObjectId;
  taxObligationId?: Types.ObjectId;
  metadata?: Record<string, unknown>;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH';
  currentAmount?: number;
  expectedBasis?: string;
  detectedAt: Date;
  resolvedAt?: Date;
  resolvedBy?: Types.ObjectId;
  resolution?: string;
}

const TaxReviewItemSchema = new Schema<ITaxReviewItem>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    kind: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['open', 'resolved', 'ignored', 'OPEN', 'UNDER_REVIEW', 'ACKNOWLEDGED', 'CORRECTED_MANUALLY', 'NO_ACTION_REQUIRED'],
      default: 'OPEN',
      index: true
    },
    title: { type: String, required: true },
    detail: { type: String, required: false },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: false, index: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: false },
    trustAccountId: { type: Schema.Types.ObjectId, required: false },
    taxObligationId: { type: Schema.Types.ObjectId, ref: 'TaxObligation', required: false },
    metadata: { type: Schema.Types.Mixed, required: false },
    severity: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], required: false, default: 'MEDIUM' },
    currentAmount: { type: Number, required: false },
    expectedBasis: { type: String, required: false },
    detectedAt: { type: Date, required: true, default: () => new Date() },
    resolvedAt: { type: Date },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    resolution: { type: String }
  },
  { timestamps: true }
);

TaxReviewItemSchema.index({ companyId: 1, status: 1, kind: 1, detectedAt: -1 });
TaxReviewItemSchema.index(
  { companyId: 1, kind: 1, paymentId: 1, taxObligationId: 1 },
  { unique: true, sparse: true }
);

export const TaxReviewItem = mongoose.model<ITaxReviewItem>(
  'TaxReviewItem',
  TaxReviewItemSchema,
  (COLLECTIONS as any).TAX_REVIEW_ITEMS || 'taxreviewitems'
);
