import mongoose, { Schema, Document } from 'mongoose';

export interface IPaymentRequest extends Document {
  companyId: string;
  propertyId: mongoose.Types.ObjectId;
  tenantId?: mongoose.Types.ObjectId;
  ownerId?: mongoose.Types.ObjectId;
  developmentId?: mongoose.Types.ObjectId;
  developmentUnitId?: mongoose.Types.ObjectId;
  amount: number;
  currency: 'USD' | 'ZWL';
  reason: string;
  requestDate: Date;
  dueDate: Date;
  status: 'pending' | 'paid' | 'rejected';
  notes?: string;
  requestedBy: string;
  requestedByUser?: mongoose.Types.ObjectId;
  processedBy?: mongoose.Types.ObjectId;
  processedDate?: Date;
  payTo: {
    name: string;
    surname: string;
    bankDetails?: string;
    accountNumber?: string;
    address?: string;
  };
  // Optional embedded HTML for the company disbursement report
  reportHtml?: string;
  // Approval workflow for Principal/PREA
  approval?: {
    status: 'pending' | 'approved' | 'rejected';
    approvedBy?: mongoose.Types.ObjectId;
    approvedByName?: string;
    approvedByRole?: 'principal' | 'prea' | 'admin';
    approvedAt?: Date;
    notes?: string;
  };
  // When true, show in accountant tasks list
  readyForAccounting?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentRequestSchema = new Schema<IPaymentRequest>({
  companyId: {
    type: String,
    required: true,
    index: true
  },
  propertyId: {
    type: mongoose.Schema.Types.ObjectId,
    required: false,
    ref: 'Property'
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant'
  },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PropertyOwner'
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    enum: ['USD', 'ZWL'],
    required: true
  },
  reason: {
    type: String,
    required: true
  },
  requestDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  dueDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'paid', 'rejected'],
    default: 'pending'
  },
  notes: {
    type: String
  },
  requestedBy: {
    type: String,
    required: true
  },
  requestedByUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  processedDate: {
    type: Date
  },
  payTo: {
    name: {
      type: String,
      required: true
    },
    surname: {
      type: String,
      required: true
    },
    bankDetails: String,
    accountNumber: String,
    address: String
  },
  developmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Development'
  },
  developmentUnitId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DevelopmentUnit'
  },
  reportHtml: { type: String },
  approval: {
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedByName: { type: String },
    approvedByRole: { type: String, enum: ['principal', 'prea', 'admin'] },
    approvedAt: { type: Date },
    notes: { type: String }
  },
  readyForAccounting: { type: Boolean, default: false }
}, {
  timestamps: true
});

// Indexes for better query performance
PaymentRequestSchema.index({ companyId: 1, status: 1 });
PaymentRequestSchema.index({ companyId: 1, requestDate: -1 });
PaymentRequestSchema.index({ status: 1, dueDate: 1 });

export const PaymentRequest = mongoose.model<IPaymentRequest>('PaymentRequest', PaymentRequestSchema); 