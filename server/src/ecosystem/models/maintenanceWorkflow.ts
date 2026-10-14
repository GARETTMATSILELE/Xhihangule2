import mongoose, { Document, Schema } from 'mongoose';

export interface IQuoteInvitation extends Document {
  requestId: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  contractorId: mongoose.Types.ObjectId;
  invitedBy: mongoose.Types.ObjectId;
  scopeSnapshot: Record<string, any>;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

const QuoteInvitationSchema = new Schema<IQuoteInvitation>(
  {
    requestId: { type: Schema.Types.ObjectId, ref: 'MaintenanceRequest', required: true, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true },
    contractorId: { type: Schema.Types.ObjectId, ref: 'MaintenanceContractor', required: true, index: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    scopeSnapshot: { type: Schema.Types.Mixed, default: {} },
    status: { type: String, enum: ['INVITED', 'SUBMITTED', 'WITHDRAWN'], default: 'INVITED', index: true },
  },
  { timestamps: true, collection: 'quote_invitations' }
);

QuoteInvitationSchema.index({ requestId: 1, contractorId: 1 }, { unique: true });

export const QuoteInvitation = mongoose.model<IQuoteInvitation>('QuoteInvitation', QuoteInvitationSchema);

export interface IOwnerQuoteDecision extends Document {
  requestId: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  quoteId: mongoose.Types.ObjectId;
  quoteVersion: number;
  ownerUserId: mongoose.Types.ObjectId;
  decision: string;
  comment?: string;
  decidedAt: Date;
  createdAt: Date;
}

const OwnerQuoteDecisionSchema = new Schema<IOwnerQuoteDecision>(
  {
    requestId: { type: Schema.Types.ObjectId, ref: 'MaintenanceRequest', required: true, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    quoteId: { type: Schema.Types.ObjectId, ref: 'MaintenanceQuote', required: true, index: true },
    quoteVersion: { type: Number, required: true, min: 1 },
    ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    decision: {
      type: String,
      enum: ['APPROVE', 'DECLINE', 'REQUEST_CHANGES', 'REQUEST_ANOTHER_QUOTE'],
      required: true,
    },
    comment: { type: String },
    decidedAt: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'owner_quote_decisions' }
);

OwnerQuoteDecisionSchema.index({ quoteId: 1, quoteVersion: 1, ownerUserId: 1 }, { unique: true });

export const OwnerQuoteDecision = mongoose.model<IOwnerQuoteDecision>('OwnerQuoteDecision', OwnerQuoteDecisionSchema);

export interface IContractorJobRecord extends Document {
  requestId: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  contractorId: mongoose.Types.ObjectId;
  quoteId?: mongoose.Types.ObjectId;
  ownerApprovalId?: mongoose.Types.ObjectId;
  authorisedBy?: mongoose.Types.ObjectId;
  authorisedAt?: Date;
  status: string;
  scheduledAt?: Date;
  completionNotes?: string;
  completionPhotos?: Array<{ url: string; name: string }>;
  actualCompletionDate?: Date;
  materialsUsed?: string;
  additionalCosts?: number;
  invoiceUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ContractorJobRecordSchema = new Schema<IContractorJobRecord>(
  {
    requestId: { type: Schema.Types.ObjectId, ref: 'MaintenanceRequest', required: true, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true },
    contractorId: { type: Schema.Types.ObjectId, ref: 'MaintenanceContractor', required: true, index: true },
    quoteId: { type: Schema.Types.ObjectId, ref: 'MaintenanceQuote' },
    ownerApprovalId: { type: Schema.Types.ObjectId, ref: 'OwnerQuoteDecision' },
    authorisedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    authorisedAt: { type: Date },
    status: {
      type: String,
      enum: ['INVITED', 'QUOTE_REQUESTED', 'QUOTE_SUBMITTED', 'SELECTED', 'AUTHORISED', 'ACCEPTED', 'SCHEDULED', 'WORK_IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'DISPUTED', 'CLOSED'],
      default: 'INVITED',
      index: true,
    },
    scheduledAt: { type: Date },
    completionNotes: { type: String },
    completionPhotos: [{ url: { type: String }, name: { type: String }, _id: false }],
    actualCompletionDate: { type: Date },
    materialsUsed: { type: String },
    additionalCosts: { type: Number, min: 0, default: 0 },
    invoiceUrl: { type: String },
  },
  { timestamps: true, collection: 'contractor_job_records' }
);

ContractorJobRecordSchema.index({ requestId: 1, contractorId: 1 });

export const ContractorJobRecord = mongoose.model<IContractorJobRecord>('ContractorJobRecord', ContractorJobRecordSchema);

export interface IMaintenanceChangeOrder extends Document {
  requestId: mongoose.Types.ObjectId;
  jobId: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  originalQuoteId: mongoose.Types.ObjectId;
  requestedAmount: number;
  description: string;
  status: string;
  agentReviewedBy?: mongoose.Types.ObjectId;
  ownerDecision?: string;
  ownerDecidedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const MaintenanceChangeOrderSchema = new Schema<IMaintenanceChangeOrder>(
  {
    requestId: { type: Schema.Types.ObjectId, ref: 'MaintenanceRequest', required: true, index: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'ContractorJobRecord', required: true, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    originalQuoteId: { type: Schema.Types.ObjectId, ref: 'MaintenanceQuote', required: true },
    requestedAmount: { type: Number, required: true, min: 0 },
    description: { type: String, required: true },
    status: {
      type: String,
      enum: ['REQUESTED', 'AGENT_REVIEW', 'OWNER_APPROVED', 'OWNER_DECLINED'],
      default: 'REQUESTED',
      index: true,
    },
    agentReviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    ownerDecision: { type: String },
    ownerDecidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'maintenance_change_orders' }
);

export const MaintenanceChangeOrder = mongoose.model<IMaintenanceChangeOrder>('MaintenanceChangeOrder', MaintenanceChangeOrderSchema);
