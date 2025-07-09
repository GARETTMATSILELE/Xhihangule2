import { Property } from './property';
import { Tenant } from './tenant';
import { Payment } from './payment';

export type LeaseStatus = 'active' | 'expired' | 'terminated';

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