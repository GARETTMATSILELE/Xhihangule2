import mongoose, { Schema, Document } from 'mongoose';
import { COLLECTIONS } from '../config/collections';
import { MAINTENANCE_STATUSES } from '../utils/maintenanceStatus';

export interface IMaintenanceAttachment {
  name: string;
  url: string;
  size: number;
  type: string;
}

export interface IMaintenanceRequest extends Document {
  propertyId: mongoose.Types.ObjectId;
  requestedBy: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  status: typeof MAINTENANCE_STATUSES[number];
  category?: string;
  inspectionId?: mongoose.Types.ObjectId;
  estimatedCost?: number;
  requestedAmount?: number;
  paidAmount?: number;
  paymentStatus?: 'awaiting_payment' | 'partially_paid' | 'paid';
  paymentDate?: Date;
  paymentReference?: string;
  paymentRequestId?: mongoose.Types.ObjectId;
  contractorId?: mongoose.Types.ObjectId;
  lastActivityAt?: Date;
  followUpInspectionId?: mongoose.Types.ObjectId;
  attachments?: IMaintenanceAttachment[];
  messages: {
    sender: mongoose.Types.ObjectId;
    content: string;
    timestamp: Date;
  }[];
  companyId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const MaintenanceAttachmentSchema: Schema = new Schema({
  name: {
    type: String,
    required: true
  },
  url: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  type: {
    type: String,
    required: true
  }
}, { _id: false });

const MaintenanceRequestSchema: Schema = new Schema({
  propertyId: {
    type: Schema.Types.ObjectId,
    ref: 'Property',
    required: true
  },
  requestedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  ownerId: {
    type: Schema.Types.ObjectId,
    ref: 'PropertyOwner',
    required: true
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: MAINTENANCE_STATUSES,
    default: 'draft'
  },
  category: {
    type: String,
    default: 'GENERAL'
  },
  inspectionId: {
    type: Schema.Types.ObjectId,
    ref: 'Inspection',
    index: true
  },
  estimatedCost: {
    type: Number,
    min: 0
  },
  requestedAmount: { type: Number, min: 0 },
  paidAmount: { type: Number, min: 0, default: 0 },
  paymentStatus: {
    type: String,
    enum: ['awaiting_payment', 'partially_paid', 'paid'],
    default: 'awaiting_payment'
  },
  paymentDate: { type: Date },
  paymentReference: { type: String },
  paymentRequestId: { type: Schema.Types.ObjectId, ref: 'PaymentRequest' },
  contractorId: { type: Schema.Types.ObjectId, ref: 'MaintenanceContractor', index: true },
  lastActivityAt: { type: Date, index: true },
  followUpInspectionId: { type: Schema.Types.ObjectId, ref: 'Inspection' },
  attachments: [MaintenanceAttachmentSchema],
  messages: [{
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    content: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  companyId: {
    type: Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  }
}, {
  timestamps: true
});

export const MaintenanceRequest = mongoose.model<IMaintenanceRequest>('MaintenanceRequest', MaintenanceRequestSchema, COLLECTIONS.MAINTENANCE_REQUESTS); 