import mongoose, { Document, Schema } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export type TrustAccountStatus = 'OPEN' | 'SETTLED' | 'CLOSED';
export type TrustWorkflowState =
  | 'VALUED'
  | 'LISTED'
  | 'DEPOSIT_RECEIVED'
  | 'TRUST_OPEN'
  | 'TAX_PENDING'
  | 'SETTLED'
  | 'TRANSFER_COMPLETE'
  | 'TRUST_CLOSED';

export interface ITrustAccount extends Document {
  companyId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  buyerId?: mongoose.Types.ObjectId;
  sellerId?: mongoose.Types.ObjectId;
  dealId?: string;
  openingBalance: number;
  runningBalance: number;
  closingBalance: number;
  purchasePrice: number;
  amountReceived: number;
  amountOutstanding: number;
  status: TrustAccountStatus;
  workflowState: TrustWorkflowState;
  lastTransactionAt?: Date;
  lockReason?: string;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
}

const TrustAccountSchema: Schema<ITrustAccount> = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, immutable: true, index: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true, immutable: true, index: true },
    buyerId: { type: Schema.Types.ObjectId, ref: 'Buyer', required: false, index: true },
    sellerId: { type: Schema.Types.ObjectId, ref: 'User', required: false, index: true },
    dealId: { type: String, required: false },
    openingBalance: { type: Number, required: true, default: 0, min: 0 },
    runningBalance: { type: Number, required: true, default: 0 },
    closingBalance: { type: Number, required: true, default: 0 },
    purchasePrice: { type: Number, required: true, default: 0, min: 0 },
    amountReceived: { type: Number, required: true, default: 0, min: 0 },
    amountOutstanding: { type: Number, required: true, default: 0, min: 0 },
    status: { type: String, enum: ['OPEN', 'SETTLED', 'CLOSED'], default: 'OPEN', index: true },
    workflowState: {
      type: String,
      enum: ['VALUED', 'LISTED', 'DEPOSIT_RECEIVED', 'TRUST_OPEN', 'TAX_PENDING', 'SETTLED', 'TRANSFER_COMPLETE', 'TRUST_CLOSED'],
      default: 'TRUST_OPEN'
    },
    lastTransactionAt: { type: Date, required: false },
    lockReason: { type: String, required: false },
    closedAt: { type: Date, required: false }
  },
  { timestamps: true }
);

TrustAccountSchema.index({ companyId: 1, propertyId: 1, status: 1 });
TrustAccountSchema.index(
  { propertyId: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['OPEN', 'SETTLED'] } } }
);
TrustAccountSchema.index({ companyId: 1, buyerId: 1, status: 1 });
TrustAccountSchema.index({ companyId: 1, status: 1, createdAt: -1 });
TrustAccountSchema.index(
  { companyId: 1, propertyId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['OPEN', 'SETTLED'] } } }
);

export const TrustAccount = mongoose.model<ITrustAccount>('TrustAccount', TrustAccountSchema, COLLECTIONS.TRUST_ACCOUNTS);
