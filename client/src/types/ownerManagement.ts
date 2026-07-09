export interface OwnersDashboardKpis {
  totalOwners: number;
  totalProperties: number;
  occupiedProperties: number;
  vacantProperties: number;
  ownersAwaitingApproval: number;
  ownersWithOutstandingBalances: number;
  totalOutstandingBalance?: number;
}

export interface OwnerListSummary {
  _id: string;
  ownerName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  active: boolean;
  propertyCount: number;
  occupiedCount: number;
  vacantCount: number;
  monthlyRevenue: number;
  outstandingBalance: number;
  pendingMaintenanceCount: number;
  lastActivity: string;
}

export interface OwnersDashboardResponse {
  kpis: OwnersDashboardKpis;
  owners: OwnerListSummary[];
}

export interface OwnerPortfolioProperty {
  _id: string;
  propertyName: string;
  address: string;
  tenantName: string | null;
  leaseStatus: string;
  monthlyRent: number;
  /** Tenant arrears — matches Property.currentArrears */
  outstandingBalance: number;
  /** Trust ledger balance — matches accountant property account runningBalance */
  trustBalance?: number;
  totalIncome?: number;
  totalOwnerPayouts?: number;
  propertyAccountId?: string;
  occupancyStatus: string;
  leaseId?: string;
  tenantId?: string;
}

export interface OwnerPortfolioResponse {
  owner: Record<string, unknown>;
  header: {
    ownerName: string;
    email: string;
    phone: string;
    totalProperties: number;
    occupiedUnits: number;
    vacantUnits: number;
  };
  portfolio: OwnerPortfolioProperty[];
}

export interface OwnerFinancialsResponse {
  summary: {
    rentCollected: number;
    outstandingRent: number;
    ownerPayouts: number;
    commissionEarned: number;
    netRevenue: number;
    monthlyRevenue: number;
    trustBalance?: number;
  };
  dataSource?: string;
  charts: {
    monthlyRentCollection: { month: string; amount: number }[];
    ownerRevenueTrend: { month: string; amount: number }[];
    outstandingBalances: { propertyName: string; amount: number }[];
  };
  recentPayments: unknown[];
}

export interface OwnerMaintenanceResponse {
  summary: { open: number; awaitingApproval: number; inProgress: number; completed: number };
  requests: {
    _id: string;
    issue: string;
    propertyName?: string;
    status: string;
    statusRaw?: string;
    cost: number;
    createdAt: string;
  }[];
}

export interface OwnerDocumentRecord {
  _id: string;
  documentType: string;
  fileName: string;
  fileUrl: string;
  mimeType?: string;
  fileSize?: number;
  version: number;
  uploadedAt: string;
}

export interface OwnerProfileExtras {
  banking: Record<string, string> | null;
  preferences: Record<string, boolean> | null;
}

export type OwnerReportType =
  | 'owner-statement'
  | 'portfolio-report'
  | 'outstanding-rent'
  | 'maintenance-summary'
  | 'ownership-history';

export const OWNER_DOCUMENT_TYPES = [
  'Management Agreement',
  'Title Deed',
  'National ID',
  'Passport',
  'Tax Document',
  'Banking Document',
  'Other',
] as const;
