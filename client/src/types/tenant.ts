import { Lease } from './lease';
import { Payment } from './payment';

export type TenantStatus = 'Active' | 'Inactive' | 'Pending';

export interface Tenant {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  companyId: string;
  status: TenantStatus;
  propertyId?: string;
  ownerId?: string; // Agent who created this tenant
  idNumber?: string;
  emergencyContact?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TenantResponse {
  tenants: Tenant[];
  total: number;
  page: number;
  pages: number;
}

export interface TenantFormData {
  _id?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  status?: TenantStatus;
  propertyId?: string;
  ownerId?: string; // Agent who created this tenant
  idNumber?: string;
  emergencyContact?: string;
  companyId: string;
}

export interface TenantFilter {
  status: 'all' | TenantStatus;
  search: string;
  propertyId?: string;
}

// Alias for backward compatibility
export type ITenant = Tenant; 