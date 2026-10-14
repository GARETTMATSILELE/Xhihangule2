import mongoose, { Schema, Document } from 'mongoose';

export interface IMaintenanceQuote extends Document {
  requestId: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  contractorId?: mongoose.Types.ObjectId;
  amount: number;
  description: string;
  fileUrl?: string;
  fileName?: string;
  submittedDate: Date;
  createdBy?: mongoose.Types.ObjectId;
  propertyId?: mongoose.Types.ObjectId;
  submittedBy?: mongoose.Types.ObjectId;
  lineItems?: Array<{ description: string; quantity: number; unitCost: number; total: number }>;
  subtotal?: number;
  tax?: number;
  total?: number;
  currency?: string;
  estimatedDuration?: string;
  estimatedStartDate?: Date;
  validUntil?: Date;
  attachments?: Array<{ name: string; url: string }>;
  notes?: string;
  status?: string;
  version?: number;
  parentQuoteId?: mongoose.Types.ObjectId;
  submittedAt?: Date;
  reviewedAt?: Date;
  approvedAt?: Date;
  declinedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MaintenanceQuoteSchema = new Schema<IMaintenanceQuote>(
  {
    requestId: { type: Schema.Types.ObjectId, ref: 'MaintenanceRequest', required: true, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    contractorId: { type: Schema.Types.ObjectId, ref: 'MaintenanceContractor', index: true },
    amount: { type: Number, required: true, min: 0 },
    description: { type: String, required: true },
    fileUrl: { type: String },
    fileName: { type: String },
    submittedDate: { type: Date, default: Date.now },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', index: true },
    submittedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    lineItems: [{
      description: { type: String, required: true },
      quantity: { type: Number, required: true, min: 0 },
      unitCost: { type: Number, required: true, min: 0 },
      total: { type: Number, required: true, min: 0 },
      _id: false
    }],
    subtotal: { type: Number, min: 0 },
    tax: { type: Number, min: 0, default: 0 },
    total: { type: Number, min: 0 },
    currency: { type: String, default: 'USD' },
    estimatedDuration: { type: String },
    estimatedStartDate: { type: Date },
    validUntil: { type: Date },
    attachments: [{ name: { type: String }, url: { type: String }, _id: false }],
    notes: { type: String },
    status: {
      type: String,
      enum: ['DRAFT', 'INVITED', 'SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED', 'SELECTED', 'SENT_TO_OWNER', 'OWNER_APPROVED', 'OWNER_DECLINED', 'EXPIRED', 'WITHDRAWN'],
      default: 'SUBMITTED',
      index: true
    },
    version: { type: Number, default: 1, min: 1 },
    parentQuoteId: { type: Schema.Types.ObjectId, ref: 'MaintenanceQuote' },
    submittedAt: { type: Date },
    reviewedAt: { type: Date },
    approvedAt: { type: Date },
    declinedAt: { type: Date },
  },
  { timestamps: true, collection: 'maintenance_quotes' }
);

export const MaintenanceQuote = mongoose.model<IMaintenanceQuote>(
  'MaintenanceQuote',
  MaintenanceQuoteSchema
);
