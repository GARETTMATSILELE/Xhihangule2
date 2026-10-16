import mongoose, { Schema, Document, Types } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export type AccountingExceptionKind = 'incomplete_projection' | 'orphan_accounting' | 'financial_review';
export type AccountingExceptionStatus = 'open' | 'resolved' | 'ignored';
export type AccountingExceptionIssueType = 'missing' | 'mismatched' | 'orphaned';
export type AccountingExceptionLedger =
  | 'property'
  | 'agent'
  | 'company'
  | 'journal'
  | 'vat'
  | 'deposit';

export interface IAccountingException extends Document {
  kind: AccountingExceptionKind;
  status: AccountingExceptionStatus;
  issueType?: AccountingExceptionIssueType;
  component?: string;
  expected?: string | number;
  actual?: string | number;
  difference?: number;
  issues?: Array<{
    component?: string;
    expected?: string | number;
    actual?: string | number;
    difference?: string | number;
    status?: string;
    paymentId?: string;
  }>;
  paymentId?: Types.ObjectId;
  companyId?: Types.ObjectId;
  propertyId?: Types.ObjectId;
  ledger?: AccountingExceptionLedger;
  accountingRef?: {
    collection?: string;
    accountId?: string;
    transactionId?: string;
  };
  missingComponents?: string[];
  error?: string;
  detectedAt: Date;
  lastCheckedAt: Date;
  resolvedAt?: Date;
  resolvedBy?: Types.ObjectId;
  resolution?: string;
}

const AccountingExceptionSchema = new Schema<IAccountingException>(
  {
    kind: {
      type: String,
      enum: ['incomplete_projection', 'orphan_accounting', 'financial_review'],
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ['open', 'resolved', 'ignored'],
      required: true,
      default: 'open',
      index: true
    },
    issueType: {
      type: String,
      enum: ['missing', 'mismatched', 'orphaned'],
      required: false,
      index: true
    },
    component: { type: String, required: false },
    expected: { type: Schema.Types.Mixed, required: false },
    actual: { type: Schema.Types.Mixed, required: false },
    difference: { type: Number, required: false },
    issues: { type: [Schema.Types.Mixed], required: false },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: false, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: false, index: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: false },
    ledger: {
      type: String,
      enum: ['property', 'agent', 'company', 'journal', 'vat', 'deposit'],
      required: false
    },
    accountingRef: {
      collection: { type: String, required: false },
      accountId: { type: String, required: false },
      transactionId: { type: String, required: false }
    },
    missingComponents: { type: [String], required: false },
    error: { type: String, required: false },
    detectedAt: { type: Date, required: true, default: Date.now },
    lastCheckedAt: { type: Date, required: true, default: Date.now },
    resolvedAt: { type: Date, required: false },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    resolution: { type: String, required: false }
  },
  { timestamps: false }
);

AccountingExceptionSchema.index({ kind: 1, paymentId: 1, status: 1 });
AccountingExceptionSchema.index({ kind: 1, 'accountingRef.accountId': 1, 'accountingRef.transactionId': 1 });
AccountingExceptionSchema.index({ companyId: 1, status: 1, kind: 1, detectedAt: -1 });

export const AccountingException = mongoose.model<IAccountingException>(
  'AccountingException',
  AccountingExceptionSchema,
  COLLECTIONS.ACCOUNTING_EXCEPTIONS
);
