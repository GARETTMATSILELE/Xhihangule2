import mongoose, { Document, Schema } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export type TrustCustodyType =
  | 'AGENCY_CASH'
  | 'AGENCY_TRUST_BANK'
  | 'LAWYER_TRUST_ACCOUNT'
  | 'ESCROW'
  | 'DEVELOPER'
  | 'OTHER';

export type TrustMatterStatus = 'OPEN' | 'SETTLED' | 'CLOSED';

export type TrustMatterWorkflowStage =
  | 'TRUST_MATTER_OPENED'
  | 'BUYER_DEPOSIT_RECEIVED'
  | 'FUNDS_HELD'
  | 'SETTLEMENT_CALCULATED'
  | 'SETTLEMENT_APPROVED'
  | 'FUNDS_ALLOCATED'
  | 'SELLER_PAID'
  | 'TAXES_PAID'
  | 'TRUST_BALANCED'
  | 'TRUST_CLOSED';

export type TrustMatterDocumentType =
  | 'AGREEMENT_OF_SALE'
  | 'OFFER_LETTER'
  | 'PROOF_OF_PAYMENT'
  | 'DEPOSIT_SLIP'
  | 'TRANSFER_DOCUMENTS'
  | 'CGT_CLEARANCE'
  | 'RATES_CLEARANCE'
  | 'COMMISSION_INVOICE'
  | 'SELLER_STATEMENT'
  | 'BUYER_STATEMENT'
  | 'TAX_CERTIFICATE'
  | 'OTHER_DOCUMENTS';

export interface ITrustMatterDocument {
  type: TrustMatterDocumentType;
  label: string;
  status: 'MISSING' | 'REQUESTED' | 'RECEIVED' | 'APPROVED' | 'WAIVED';
  fileId?: mongoose.Types.ObjectId;
  fileName?: string;
  reference?: string;
  notes?: string;
  receivedAt?: Date;
  approvedAt?: Date;
  updatedBy?: mongoose.Types.ObjectId;
  updatedAt?: Date;
}

export interface ITrustMatter extends Document {
  companyId: mongoose.Types.ObjectId;
  trustAccountId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  buyerId?: mongoose.Types.ObjectId;
  sellerId?: mongoose.Types.ObjectId;
  dealId?: string;
  matterNumber: string;
  purchasePrice: number;
  custodyType: TrustCustodyType;
  custodyDetails: Record<string, unknown>;
  status: TrustMatterStatus;
  settlementStatus: string;
  workflowStage: TrustMatterWorkflowStage;
  dateOpened: Date;
  dateClosed?: Date;
  responsibleAccountant?: mongoose.Types.ObjectId;
  responsibleAgent?: mongoose.Types.ObjectId;
  responsiblePrincipal?: mongoose.Types.ObjectId;
  jurisdiction: {
    country: string;
    currency: string;
    trustRules: string;
    taxRules: string;
    defaultCustody: TrustCustodyType;
    vatEnabled: boolean;
    cgtEnabled: boolean;
    escrowEnabled: boolean;
  };
  documents: ITrustMatterDocument[];
  reconciliationMetadata: {
    lastReconciledAt?: Date;
    lastReconciledBy?: mongoose.Types.ObjectId;
    notes?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const TrustMatterDocumentSchema = new Schema<ITrustMatterDocument>(
  {
    type: {
      type: String,
      enum: [
        'AGREEMENT_OF_SALE',
        'OFFER_LETTER',
        'PROOF_OF_PAYMENT',
        'DEPOSIT_SLIP',
        'TRANSFER_DOCUMENTS',
        'CGT_CLEARANCE',
        'RATES_CLEARANCE',
        'COMMISSION_INVOICE',
        'SELLER_STATEMENT',
        'BUYER_STATEMENT',
        'TAX_CERTIFICATE',
        'OTHER_DOCUMENTS'
      ],
      required: true
    },
    label: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['MISSING', 'REQUESTED', 'RECEIVED', 'APPROVED', 'WAIVED'],
      default: 'MISSING'
    },
    fileId: { type: Schema.Types.ObjectId, ref: 'File', required: false },
    fileName: { type: String, required: false, trim: true },
    reference: { type: String, required: false, trim: true },
    notes: { type: String, required: false, trim: true },
    receivedAt: { type: Date, required: false },
    approvedAt: { type: Date, required: false },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    updatedAt: { type: Date, required: false }
  },
  { _id: false }
);

const TrustMatterSchema = new Schema<ITrustMatter>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, immutable: true, index: true },
    trustAccountId: { type: Schema.Types.ObjectId, ref: 'TrustAccount', required: true, immutable: true, unique: true, index: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true, immutable: true, index: true },
    buyerId: { type: Schema.Types.ObjectId, ref: 'Buyer', required: false, index: true },
    sellerId: { type: Schema.Types.ObjectId, ref: 'User', required: false, index: true },
    dealId: { type: String, required: false, trim: true },
    matterNumber: { type: String, required: true, trim: true, index: true },
    purchasePrice: { type: Number, required: true, default: 0, min: 0 },
    custodyType: {
      type: String,
      enum: ['AGENCY_CASH', 'AGENCY_TRUST_BANK', 'LAWYER_TRUST_ACCOUNT', 'ESCROW', 'DEVELOPER', 'OTHER'],
      default: 'AGENCY_TRUST_BANK',
      index: true
    },
    custodyDetails: { type: Schema.Types.Mixed, default: {} },
    status: { type: String, enum: ['OPEN', 'SETTLED', 'CLOSED'], default: 'OPEN', index: true },
    settlementStatus: { type: String, default: 'PENDING', trim: true },
    workflowStage: {
      type: String,
      enum: [
        'TRUST_MATTER_OPENED',
        'BUYER_DEPOSIT_RECEIVED',
        'FUNDS_HELD',
        'SETTLEMENT_CALCULATED',
        'SETTLEMENT_APPROVED',
        'FUNDS_ALLOCATED',
        'SELLER_PAID',
        'TAXES_PAID',
        'TRUST_BALANCED',
        'TRUST_CLOSED'
      ],
      default: 'TRUST_MATTER_OPENED',
      index: true
    },
    dateOpened: { type: Date, required: true, default: () => new Date(), index: true },
    dateClosed: { type: Date, required: false },
    responsibleAccountant: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    responsibleAgent: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    responsiblePrincipal: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    jurisdiction: {
      country: { type: String, default: 'Zimbabwe' },
      currency: { type: String, default: 'USD' },
      trustRules: { type: String, default: 'ZW_ESTATE_AGENCY_TRUST' },
      taxRules: { type: String, default: 'ZW_DEFAULT' },
      defaultCustody: { type: String, default: 'AGENCY_TRUST_BANK' },
      vatEnabled: { type: Boolean, default: true },
      cgtEnabled: { type: Boolean, default: true },
      escrowEnabled: { type: Boolean, default: true }
    },
    documents: { type: [TrustMatterDocumentSchema], default: [] },
    reconciliationMetadata: {
      lastReconciledAt: { type: Date, required: false },
      lastReconciledBy: { type: Schema.Types.ObjectId, ref: 'User', required: false },
      notes: { type: String, required: false, trim: true }
    }
  },
  { timestamps: true }
);

TrustMatterSchema.index({ companyId: 1, matterNumber: 1 }, { unique: true });
TrustMatterSchema.index({ companyId: 1, status: 1, workflowStage: 1, createdAt: -1 });
TrustMatterSchema.index({ companyId: 1, custodyType: 1, status: 1 });

export const TrustMatter = mongoose.model<ITrustMatter>('TrustMatter', TrustMatterSchema, COLLECTIONS.TRUST_MATTERS);
