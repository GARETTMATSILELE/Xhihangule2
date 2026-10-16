import mongoose, { Document, Schema, Types } from 'mongoose';
import { accountingConnection } from '../config/database';

/**
 * One claim document per company and idempotency key.
 * The unique index is declared here and is not created at application startup.
 * Do not add this model to createIndexes() until the rollout review is approved.
 * A unique index on an embedded transaction array is not the lock.
 */
export type CompanyExpenseClaimStatus = 'claimed' | 'appending' | 'posted' | 'post_failed';

export interface ICompanyExpenseClaim extends Document {
  companyId: Types.ObjectId;
  idempotencyKey: string;
  fingerprint: string;
  amount: number;
  type: 'income' | 'expense';
  reference?: string;
  description?: string;
  transactionId?: Types.ObjectId;
  status: CompanyExpenseClaimStatus;
  createdAt: Date;
  updatedAt: Date;
}

const CompanyExpenseClaimSchema = new Schema<ICompanyExpenseClaim>({
  companyId: { type: Schema.Types.ObjectId, required: true },
  idempotencyKey: { type: String, required: true },
  fingerprint: { type: String, required: true },
  amount: { type: Number, required: true },
  type: { type: String, enum: ['income', 'expense'], required: true },
  reference: { type: String, required: false },
  description: { type: String, required: false },
  transactionId: { type: Schema.Types.ObjectId, required: false },
  status: { type: String, enum: ['claimed', 'appending', 'posted', 'post_failed'], default: 'claimed' }
}, { timestamps: true });

CompanyExpenseClaimSchema.index({ companyId: 1, idempotencyKey: 1 }, { unique: true, name: 'company_expense_claim_identity' });

export const CompanyExpenseClaim = accountingConnection.model<ICompanyExpenseClaim>(
  'CompanyExpenseClaim',
  CompanyExpenseClaimSchema,
  'companyexpenseclaims'
);
