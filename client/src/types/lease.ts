import { Property } from './property';
import { Tenant } from './tenant';
import { Payment } from './payment';

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

export interface Lease {
  _id: string;
  propertyId: string;
  property?: Property;
  tenantId: string;
  tenant?: Tenant;
  startDate: string;
  endDate: string;
  rentAmount: number;
  depositAmount: number;
  status: LeaseStatus;
  previousLeaseId?: string | Lease | null;
  successorLeaseId?: string | Lease | null;
  lifecycleStatusChangedAt?: string;
  renewalReminderDate?: string;
  moveOutDate?: string;
  settlementClosedAt?: string;
  billingStatus?: BillingStatus;
  billingRules?: {
    frequency?: 'monthly';
    rentDueDay?: number;
    escalationPercent?: number;
    escalationFrequencyMonths?: number;
    nextEscalationDate?: string;
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
    settledAt?: string;
  };
  documentVersions?: Array<{
    name: string;
    type: 'signed_lease' | 'amendment' | 'renewal' | 'termination_notice' | 'other';
    url?: string;
    uploadedAt?: string;
  }>;
  createdAt: string;
  updatedAt: string;
  payments?: Payment[];
  terminationDate?: string;
  terminationReason?: string;
}

export interface LeaseFormData extends Omit<Lease, '_id' | 'createdAt' | 'updatedAt' | 'property' | 'tenant' | 'payments'> {
  propertyId: string;
  tenantId: string;
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
}

export interface LeaseFilter {
  status: 'all' | LeaseStatus;
  propertyId?: string;
  tenantId?: string;
  startDate?: string;
  endDate?: string;
} 