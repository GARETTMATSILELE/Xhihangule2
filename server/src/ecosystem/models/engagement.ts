import mongoose, { Document, Schema } from 'mongoose';

export interface IEcosystemDocument extends Document {
  ownerUserId: mongoose.Types.ObjectId;
  companyId?: mongoose.Types.ObjectId;
  entityType: string;
  entityId: string;
  documentType: string;
  fileName: string;
  fileUrl: string;
  uploadedBy: mongoose.Types.ObjectId;
  accessRoles?: string[];
  createdAt: Date;
}

const EcosystemDocumentSchema = new Schema<IEcosystemDocument>(
  {
    ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', index: true },
    entityType: { type: String, required: true, index: true },
    entityId: { type: String, required: true, index: true },
    documentType: { type: String, required: true, index: true },
    fileName: { type: String, required: true },
    fileUrl: { type: String, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    accessRoles: [{ type: String }],
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'ecosystem_documents' }
);

export const EcosystemDocument = mongoose.model<IEcosystemDocument>('EcosystemDocument', EcosystemDocumentSchema);

export interface IRating extends Document {
  companyId: mongoose.Types.ObjectId;
  raterUserId: mongoose.Types.ObjectId;
  rateeUserId?: mongoose.Types.ObjectId;
  contractorId?: mongoose.Types.ObjectId;
  jobId: mongoose.Types.ObjectId;
  raterRole: string;
  quality: number;
  professionalism: number;
  timeliness: number;
  communication: number;
  overall: number;
  comment?: string;
  createdAt: Date;
}

const RatingSchema = new Schema<IRating>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    raterUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    rateeUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    contractorId: { type: Schema.Types.ObjectId, ref: 'MaintenanceContractor', index: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'ContractorJobRecord', required: true, index: true },
    raterRole: { type: String, enum: ['tenant', 'owner', 'agent', 'admin'], required: true },
    quality: { type: Number, min: 1, max: 5, required: true },
    professionalism: { type: Number, min: 1, max: 5, required: true },
    timeliness: { type: Number, min: 1, max: 5, required: true },
    communication: { type: Number, min: 1, max: 5, required: true },
    overall: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'ecosystem_ratings' }
);

RatingSchema.index({ jobId: 1, raterUserId: 1 }, { unique: true });

export const Rating = mongoose.model<IRating>('EcosystemRating', RatingSchema);

export interface ITenantReference extends Document {
  companyId: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  leaseId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  rentPaymentHistory?: string;
  outstandingBalance?: number;
  propertyCondition?: string;
  maintenanceCooperation?: string;
  leaseCompliance?: string;
  communication?: string;
  moveOutCondition?: string;
  depositOutcome?: string;
  publicNotes?: string;
  privateNotes?: string;
  createdAt: Date;
}

const TenantReferenceSchema = new Schema<ITenantReference>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    leaseId: { type: Schema.Types.ObjectId, ref: 'Lease', required: true, index: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    rentPaymentHistory: { type: String },
    outstandingBalance: { type: Number, min: 0 },
    propertyCondition: { type: String },
    maintenanceCooperation: { type: String },
    leaseCompliance: { type: String },
    communication: { type: String },
    moveOutCondition: { type: String },
    depositOutcome: { type: String },
    publicNotes: { type: String },
    privateNotes: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'tenant_references' }
);

TenantReferenceSchema.index({ leaseId: 1 }, { unique: true });

export const TenantReference = mongoose.model<ITenantReference>('TenantReference', TenantReferenceSchema);

export interface IBroadcast extends Document {
  companyId: mongoose.Types.ObjectId;
  senderId: mongoose.Types.ObjectId;
  title: string;
  message: string;
  priority: string;
  scope: string;
  audience: Record<string, any>;
  attachments?: Array<{ name: string; url: string }>;
  scheduledAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
}

const BroadcastSchema = new Schema<IBroadcast>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    priority: { type: String, enum: ['NORMAL', 'IMPORTANT', 'URGENT', 'EMERGENCY'], default: 'NORMAL' },
    scope: { type: String, enum: ['TENANT', 'PROPERTY', 'BUILDING', 'PORTFOLIO', 'ALL_AGENCY_TENANTS'], required: true },
    audience: { type: Schema.Types.Mixed, default: {} },
    attachments: [{ name: { type: String }, url: { type: String }, _id: false }],
    scheduledAt: { type: Date },
    expiresAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'broadcasts' }
);

export const Broadcast = mongoose.model<IBroadcast>('Broadcast', BroadcastSchema);

export interface IBroadcastDelivery extends Document {
  broadcastId: mongoose.Types.ObjectId;
  recipientUserId: mongoose.Types.ObjectId;
  status: string;
  createdAt: Date;
}

const BroadcastDeliverySchema = new Schema<IBroadcastDelivery>(
  {
    broadcastId: { type: Schema.Types.ObjectId, ref: 'Broadcast', required: true, index: true },
    recipientUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: { type: String, enum: ['QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED'], default: 'QUEUED' },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'broadcast_deliveries' }
);

BroadcastDeliverySchema.index({ broadcastId: 1, recipientUserId: 1 }, { unique: true });

export const BroadcastDelivery = mongoose.model<IBroadcastDelivery>('BroadcastDelivery', BroadcastDeliverySchema);
