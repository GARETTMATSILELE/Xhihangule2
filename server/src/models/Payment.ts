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
  // Add rental period fields
  rentalPeriodMonth: number; // 1-12
  rentalPeriodYear: number; // e.g., 2024
  // Advance payment fields
  advanceMonthsPaid?: number;
  advancePeriodStart?: { month: number; year: number };
  advancePeriodEnd?: { month: number; year: number };
  rentUsed?: number;
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
  recipientId?: mongoose.Types.ObjectId | string;
  recipientType?: string;
  reason?: string;
  // Manual entry fields for properties/tenants not in database
  manualPropertyAddress?: string;
  manualTenantName?: string;
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
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    immutable: true
  },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
    immutable: true
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
    required: false,
    default: '',
  },
  // Add rental period fields
  rentalPeriodMonth: {
    type: Number,
    required: true,
    min: 1,
    max: 12,
  },
  rentalPeriodYear: {
    type: Number,
    required: true,
  },
  // Advance payment fields
  advanceMonthsPaid: {
    type: Number,
    required: false,
    min: 1,
    default: 1,
  },
  advancePeriodStart: {
    month: { type: Number, min: 1, max: 12 },
    year: { type: Number },
  },
  advancePeriodEnd: {
    month: { type: Number, min: 1, max: 12 },
    year: { type: Number },
  },
  rentUsed: {
    type: Number,
    required: false,
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
  recipientId: {
    type: Schema.Types.Mixed, // ObjectId or string
    required: false,
  },
  recipientType: {
    type: String,
    required: false,
  },
  reason: {
    type: String,
    required: false,
  },
  // Manual entry fields for properties/tenants not in database
  manualPropertyAddress: {
    type: String,
    required: false,
  },
  manualTenantName: {
    type: String,
    required: false,
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