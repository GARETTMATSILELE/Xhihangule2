import mongoose, { Schema, Document } from 'mongoose';
import { COLLECTIONS } from '../config/collections';
import { triggerDashboardKpiRefresh } from '../services/dashboardKpiRefreshTrigger';

export type LeaseStatus =
  | 'draft'
  | 'pending_approval'
  | 'active'
  | 'expiring_soon'
  | 'expired'
  | 'renewed'
  | 'terminated'
  | 'pending_settlement'
  | 'closed';

export type BillingStatus = 'current' | 'partially_paid' | 'overdue' | 'in_arrears' | 'settled' | 'waived';

export interface ILease extends Document {
  propertyId: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  startDate: Date;
  endDate: Date;
  rentAmount: number;
  depositAmount: number;
  status: LeaseStatus;
  companyId: mongoose.Types.ObjectId;
  ownerId?: mongoose.Types.ObjectId; // Agent who created this lease
  previousLeaseId?: mongoose.Types.ObjectId | null;
  successorLeaseId?: mongoose.Types.ObjectId | null;
  lifecycleStatusChangedAt?: Date;
  renewalReminderDate?: Date;
  terminationDate?: Date;
  terminationReason?: string;
  moveOutDate?: Date;
  settlementClosedAt?: Date;
  billingStatus?: BillingStatus;
  billingRules?: {
    frequency?: 'monthly';
    rentDueDay?: number;
    escalationPercent?: number;
    escalationFrequencyMonths?: number;
    nextEscalationDate?: Date;
    recurringLevies?: number;
    recurringServiceCharges?: number;
    prorateMoveIn?: boolean;
  };
  financialSummary?: {
    totalBilled?: number;
    totalPaid?: number;
    outstandingBalance?: number;
    depositHeld?: number;
    penalties?: number;
    moveOutSettlement?: number;
  };
  depositSettlement?: {
    depositHeld?: number;
    deductions?: number;
    refundDue?: number;
    notes?: string;
    settledAt?: Date;
  };
  documentVersions?: Array<{
    name: string;
    type: 'signed_lease' | 'amendment' | 'renewal' | 'termination_notice' | 'other';
    url?: string;
    uploadedAt?: Date;
  }>;
  
  // Additional lease details
  monthlyRent: number;
  securityDeposit: number;
  petDeposit: number;
  isPetAllowed: boolean;
  maxOccupants: number;
  isUtilitiesIncluded: boolean;
  utilitiesDetails: string;
  rentDueDay: number;
  lateFee: number;
  gracePeriod: number;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

const LeaseSchema: Schema = new Schema({
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  rentAmount: { type: Number, required: true, min: 0 },
  depositAmount: { type: Number, required: true, min: 0 },
  status: {
    type: String,
    enum: ['draft', 'pending_approval', 'active', 'expiring_soon', 'expired', 'renewed', 'terminated', 'pending_settlement', 'closed'],
    default: 'active'
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
    required: true,
    immutable: true
  },
  previousLeaseId: { type: Schema.Types.ObjectId, ref: 'Lease', default: null },
  successorLeaseId: { type: Schema.Types.ObjectId, ref: 'Lease', default: null },
  lifecycleStatusChangedAt: { type: Date, default: Date.now },
  renewalReminderDate: { type: Date },
  terminationDate: { type: Date },
  terminationReason: { type: String, default: '' },
  moveOutDate: { type: Date },
  settlementClosedAt: { type: Date },
  billingStatus: {
    type: String,
    enum: ['current', 'partially_paid', 'overdue', 'in_arrears', 'settled', 'waived'],
    default: 'current'
  },
  billingRules: {
    frequency: { type: String, enum: ['monthly'], default: 'monthly' },
    rentDueDay: { type: Number, min: 1, max: 31 },
    escalationPercent: { type: Number, default: 0, min: 0 },
    escalationFrequencyMonths: { type: Number, default: 12, min: 1 },
    nextEscalationDate: { type: Date },
    recurringLevies: { type: Number, default: 0, min: 0 },
    recurringServiceCharges: { type: Number, default: 0, min: 0 },
    prorateMoveIn: { type: Boolean, default: true }
  },
  financialSummary: {
    totalBilled: { type: Number, default: 0 },
    totalPaid: { type: Number, default: 0 },
    outstandingBalance: { type: Number, default: 0 },
    depositHeld: { type: Number, default: 0 },
    penalties: { type: Number, default: 0 },
    moveOutSettlement: { type: Number, default: 0 }
  },
  depositSettlement: {
    depositHeld: { type: Number, default: 0 },
    deductions: { type: Number, default: 0 },
    refundDue: { type: Number, default: 0 },
    notes: { type: String, default: '' },
    settledAt: { type: Date }
  },
  documentVersions: [{
    name: { type: String, required: true },
    type: {
      type: String,
      enum: ['signed_lease', 'amendment', 'renewal', 'termination_notice', 'other'],
      default: 'other'
    },
    url: { type: String, default: '' },
    uploadedAt: { type: Date, default: Date.now }
  }],
  
  // Additional lease details
  monthlyRent: { type: Number, default: 0, min: 0 },
  securityDeposit: { type: Number, default: 0, min: 0 },
  petDeposit: { type: Number, default: 0, min: 0 },
  isPetAllowed: { type: Boolean, default: false },
  maxOccupants: { type: Number, default: 1, min: 1 },
  isUtilitiesIncluded: { type: Boolean, default: false },
  utilitiesDetails: { type: String, default: '' },
  rentDueDay: { type: Number, default: 1, min: 1, max: 31 },
  lateFee: { type: Number, default: 0, min: 0 },
  gracePeriod: { type: Number, default: 0, min: 0 },
}, {
  timestamps: true
});

// Add index for ownerId for faster filtering
LeaseSchema.index({ ownerId: 1 });
LeaseSchema.index({ companyId: 1, propertyId: 1, startDate: 1, endDate: 1 });
LeaseSchema.index({ companyId: 1, tenantId: 1, startDate: 1 });
LeaseSchema.index({ previousLeaseId: 1 });
LeaseSchema.index({ successorLeaseId: 1 });

const resolveCompanyId = (value: any): string | null => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value?.toString === 'function') return value.toString();
  return null;
};

LeaseSchema.post('save', function () {
  triggerDashboardKpiRefresh(resolveCompanyId((this as any).companyId));
});

LeaseSchema.post('findOneAndUpdate', function (doc: any) {
  const queryCompanyId = (this as any)?.getQuery?.()?.companyId;
  triggerDashboardKpiRefresh(resolveCompanyId(doc?.companyId || queryCompanyId));
});

export const Lease = mongoose.model<ILease>('Lease', LeaseSchema, COLLECTIONS.LEASES); 