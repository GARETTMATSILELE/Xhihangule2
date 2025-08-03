import mongoose, { Schema, Document } from 'mongoose';

export interface IPaymentRequest extends Document {
  companyId: string;
  propertyId: string;
  tenantId?: string;
  ownerId?: string;
  amount: number;
  currency: 'USD' | 'ZWL';
  reason: string;
  requestDate: Date;
  dueDate: Date;
  status: 'pending' | 'paid' | 'rejected';
  notes?: string;
  requestedBy: string;
  processedBy?: string;
  processedDate?: Date;
  payTo: {
    name: string;
    surname: string;
    bankDetails?: string;
    accountNumber?: string;
    address?: string;
  };
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
    type: String,
    required: true,
    ref: 'Property'
  },
  tenantId: {
    type: String,
    ref: 'Tenant'
  },
  ownerId: {
    type: String,
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
  processedBy: {
    type: String,
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
  }
}, {
  timestamps: true
});

// Indexes for better query performance
PaymentRequestSchema.index({ companyId: 1, status: 1 });
PaymentRequestSchema.index({ companyId: 1, requestDate: -1 });
PaymentRequestSchema.index({ status: 1, dueDate: 1 });

export const PaymentRequest = mongoose.model<IPaymentRequest>('PaymentRequest', PaymentRequestSchema); 