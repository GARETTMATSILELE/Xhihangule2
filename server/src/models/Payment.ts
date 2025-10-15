import mongoose, { Schema, Document } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export interface IPayment extends Document {
  paymentType: 'sale' | 'rental' | 'introduction';
  saleMode?: 'quick' | 'installment';
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
  status: 'pending' | 'completed' | 'failed' | 'reversed' | 'refunded';
  currency: 'USD' | 'ZWL';
  leaseId?: mongoose.Types.ObjectId;
  recipientId?: mongoose.Types.ObjectId | string;
  recipientType?: string;
  reason?: string;
  idempotencyKey?: string;
  // Manual entry fields for properties/tenants not in database
  manualPropertyAddress?: string;
  manualTenantName?: string;
  // Sales-specific manual fields
  buyerName?: string;
  sellerName?: string;
  // Provisional workflow fields
  isProvisional?: boolean;
  isInSuspense?: boolean;
  commissionFinalized?: boolean;
  provisionalRelationshipType?: 'unknown' | 'management' | 'introduction';
  finalizedAt?: Date;
  finalizedBy?: mongoose.Types.ObjectId;
  // Sales contract linkage (for introduction payments)
  saleId?: mongoose.Types.ObjectId;
  // Optional linkage to development/unit for sales
  developmentId?: mongoose.Types.ObjectId;
  developmentUnitId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema: Schema = new Schema({
  paymentType: {
    type: String,
    enum: ['sale', 'rental', 'introduction'],
    required: true,
  },
  saleMode: {
    type: String,
    enum: ['quick', 'installment'],
    required: false,
    default: 'quick'
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
    required: function(this: any) { return this.paymentType === 'rental'; },
    min: 1,
    max: 12,
  },
  rentalPeriodYear: {
    type: Number,
    required: function(this: any) { return this.paymentType === 'rental'; },
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
    enum: ['pending', 'completed', 'failed', 'reversed', 'refunded'],
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
  buyerName: {
    type: String,
    required: false,
  },
  sellerName: {
    type: String,
    required: false,
  },
  // Provisional workflow fields
  isProvisional: {
    type: Boolean,
    default: false
  },
  isInSuspense: {
    type: Boolean,
    default: false
  },
  commissionFinalized: {
    type: Boolean,
    default: true
  },
  provisionalRelationshipType: {
    type: String,
    enum: ['unknown', 'management', 'introduction'],
    default: 'unknown'
  },
  finalizedAt: {
    type: Date,
    required: false
  },
  finalizedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  saleId: {
    type: Schema.Types.ObjectId,
    ref: 'SalesContract',
    required: false
  },
  developmentId: {
    type: Schema.Types.ObjectId,
    ref: 'Development',
    required: false
  },
  developmentUnitId: {
    type: Schema.Types.ObjectId,
    ref: 'DevelopmentUnit',
    required: false
  },
  idempotencyKey: {
    type: String,
    required: false,
    index: true
  },
}, {
  timestamps: true
});

// Add indexes for common queries
PaymentSchema.index({ companyId: 1, paymentDate: -1 });
PaymentSchema.index({ companyId: 1, paymentType: 1, paymentDate: -1 });
PaymentSchema.index({ propertyId: 1 });
PaymentSchema.index({ tenantId: 1 });
PaymentSchema.index({ agentId: 1 });
PaymentSchema.index({ status: 1 });
// Add compound index for agent commission queries
PaymentSchema.index({ agentId: 1, status: 1, paymentDate: -1 });
PaymentSchema.index({ saleId: 1 });
PaymentSchema.index({ developmentId: 1 });
PaymentSchema.index({ developmentUnitId: 1 });
PaymentSchema.index({ isProvisional: 1 });
PaymentSchema.index({ companyId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $exists: true, $type: 'string' } } });

export const Payment = mongoose.model<IPayment>('Payment', PaymentSchema, COLLECTIONS.PAYMENTS); 