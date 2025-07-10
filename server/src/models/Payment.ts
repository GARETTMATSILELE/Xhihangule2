import mongoose, { Schema, Document } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export interface IPayment extends Document {
  paymentType: 'introduction' | 'rental';
  propertyType: 'residential' | 'commercial';
  propertyId: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  agentId: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  paymentDate: Date;
  paymentMethod: 'cash' | 'bank_transfer' | 'credit_card' | 'mobile_money';
  amount: number;
  depositAmount: number;
  referenceNumber: string;
  notes: string;
  processedBy: mongoose.Types.ObjectId;
  commissionDetails: {
    totalCommission: number;
    preaFee: number;
    agentShare: number;
    agencyShare: number;
    ownerAmount: number;
  };
  status: 'pending' | 'completed' | 'failed';
  currency: 'USD' | 'ZWL';
  leaseId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema: Schema = new Schema({
  paymentType: {
    type: String,
    enum: ['introduction', 'rental'],
    required: true,
  },
  propertyType: {
    type: String,
    enum: ['residential', 'commercial'],
    required: true,
  },
  propertyId: {
    type: Schema.Types.ObjectId,
    ref: 'Property',
    required: true,
  },
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
  },
  agentId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  companyId: {
    type: Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
  },
  paymentDate: {
    type: Date,
    required: true,
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'bank_transfer', 'credit_card', 'mobile_money'],
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  depositAmount: {
    type: Number,
    required: false,
    default: 0,
  },
  referenceNumber: {
    type: String,
    required: true,
  },
  notes: {
    type: String,
  },
  processedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  commissionDetails: {
    totalCommission: {
      type: Number,
      required: true,
    },
    preaFee: {
      type: Number,
      required: true,
    },
    agentShare: {
      type: Number,
      required: true,
    },
    agencyShare: {
      type: Number,
      required: true,
    },
    ownerAmount: {
      type: Number,
      required: true,
    },
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending',
  },
  currency: {
    type: String,
    enum: ['USD', 'ZWL'],
    default: 'USD',
  },
  leaseId: {
    type: Schema.Types.ObjectId,
    ref: 'Lease',
  },
}, {
  timestamps: true
});

// Add indexes for common queries
PaymentSchema.index({ companyId: 1, paymentDate: -1 });
PaymentSchema.index({ propertyId: 1 });
PaymentSchema.index({ tenantId: 1 });
PaymentSchema.index({ agentId: 1 });
PaymentSchema.index({ status: 1 });

export const Payment = mongoose.model<IPayment>('Payment', PaymentSchema, COLLECTIONS.PAYMENTS); 