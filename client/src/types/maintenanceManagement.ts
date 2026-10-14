export type MaintenanceLifecycleStatus =
  | 'draft'
  | 'awaiting_approval'
  | 'approved'
  | 'awaiting_payment'
  | 'funded'
  | 'assigned'
  | 'in_progress'
  | 'completed'
  | 'verified'
  | 'closed'
  | 'rejected'
  | 'pending'
  | 'pending_approval'
  | 'pending_completion'
  | 'cancelled';

export const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  awaiting_approval: 'Awaiting Approval',
  approved: 'Approved',
  awaiting_payment: 'Awaiting Payment',
  funded: 'Funded',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  completed: 'Completed',
  verified: 'Verified',
  closed: 'Closed',
  rejected: 'Rejected',
  pending: 'Draft',
  pending_approval: 'Awaiting Approval',
  pending_completion: 'Awaiting Payment',
  cancelled: 'Rejected',
};

export const STATUS_COLORS: Record<string, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'> = {
  draft: 'default',
  awaiting_approval: 'warning',
  approved: 'info',
  awaiting_payment: 'warning',
  funded: 'success',
  assigned: 'primary',
  in_progress: 'primary',
  completed: 'success',
  verified: 'success',
  closed: 'default',
  rejected: 'error',
};

export interface MaintenanceKpis {
  openRequests: number;
  awaitingApproval: number;
  awaitingPayment: number;
  inProgress: number;
  completedThisMonth: number;
  averageResolutionDays: number;
}

export interface MaintenanceDashboardData {
  kpis: MaintenanceKpis;
  charts: {
    requestsByStatus: { status: string; count: number }[];
    requestsByCategory: { category: string; count: number }[];
    monthlyMaintenanceSpend: { month: string; amount: number }[];
    topPropertiesByCost: { propertyId: string; propertyName: string; cost: number; count: number }[];
  };
}

export interface MaintenanceContractor {
  _id: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  email: string;
  trade: string;
  address?: string;
  notes?: string;
  rating: number;
  active: boolean;
  skills?: string[];
  serviceAreas?: string[];
  availability?: string;
  description?: string;
  verificationStatus?: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'SUSPENDED';
  profileImage?: string;
  profileImageType?: string;
}

export interface MaintenanceWorkOrder {
  _id: string;
  workOrderNumber: string;
  maintenanceRequestId: string;
  propertyId: string;
  contractorId?: MaintenanceContractor | string;
  assignedDate?: string;
  targetCompletionDate?: string;
  completionDate?: string;
  status: 'Assigned' | 'In Progress' | 'Completed' | 'Cancelled';
  notes?: string;
}

export interface MaintenanceActivityItem {
  _id: string;
  action: string;
  description: string;
  createdAt: string;
  createdBy?: { firstName?: string; lastName?: string; email?: string };
}

export interface MaintenancePhoto {
  _id: string;
  type: 'BEFORE' | 'AFTER';
  fileUrl: string;
  fileName?: string;
  mimeType?: string;
  uploadedAt: string;
}

export interface MaintenanceQuote {
  _id: string;
  amount: number;
  description: string;
  fileUrl?: string;
  fileName?: string;
  submittedDate: string;
  contractorId?: MaintenanceContractor | string;
}

export interface MaintenanceVerification {
  _id: string;
  outcome: 'Tenant Confirmed' | 'Tenant Rejected' | 'Unable To Reach';
  comments?: string;
  recordedAt: string;
}

export interface MaintenanceRequestExtended {
  _id: string;
  title: string;
  description: string;
  priority: string;
  status?: string;
  category?: string;
  estimatedCost?: number;
  requestedAmount?: number;
  paidAmount?: number;
  paymentStatus?: 'awaiting_payment' | 'partially_paid' | 'paid';
  paymentDate?: string | Date;
  paymentReference?: string;
  paymentRequestId?: string;
  propertyId?: { _id: string; name: string; address?: string } | string;
  contractorId?: MaintenanceContractor | string;
  lastActivityAt?: string | Date;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  inspectionId?: string;
  followUpInspectionId?: string;
  attachments?: { name: string; url: string; size: number; type: string }[];
}

export interface PropertyMaintenanceHistoryItem {
  _id: string;
  date: string;
  issue: string;
  cost: number;
  contractor: string | null;
  status: string;
  workOrderNumber?: string | null;
}

export function statusLabel(status?: string): string {
  return STATUS_LABELS[status || ''] || status || 'Unknown';
}

export function normalizeStatus(status?: string): string {
  const map: Record<string, string> = {
    pending: 'draft',
    pending_approval: 'awaiting_approval',
    pending_completion: 'awaiting_payment',
    cancelled: 'rejected',
  };
  return map[status || ''] || status || 'draft';
}

export function isOwnerApproved(status?: string): boolean {
  const n = normalizeStatus(status);
  return ['approved', 'awaiting_payment', 'funded', 'assigned', 'in_progress', 'completed', 'verified', 'closed', 'pending_completion'].includes(n);
}
