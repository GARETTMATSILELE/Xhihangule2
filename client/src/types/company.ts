export interface BankAccount {
  accountNumber: string;
  accountName: string;
  accountType: 'USD NOSTRO' | 'ZiG';
  bankName: string;
  branchName: string;
  branchCode: string;
}

export interface Company {
  _id: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  website?: string;
  registrationNumber: string;
  tinNumber: string;
  vatNumber?: string;
  ownerId: string;
  description?: string;
  logo?: string;
  isActive: boolean;
  subscriptionStatus: 'active' | 'inactive' | 'trial' | 'past_due' | 'suspended' | 'cancelled' | 'expired' | 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELLED' | 'EXPIRED';
  subscriptionEndDate?: Date;
  companyType?: 'INDIVIDUAL_LANDLORD' | 'REGISTERED_BUSINESS';
  workspaceType?: 'agency' | 'individual';
  tenantStatus?: 'active' | 'suspended' | 'pending' | 'archived';
  onboardingStatus?: 'PENDING_SETUP' | 'PENDING_PAYMENT' | 'PAYMENT_RECEIVED' | 'INITIALIZING_WORKSPACE' | 'ACTIVE' | 'FAILED_SETUP' | 'SUSPENDED';
  onboardingCompleted?: boolean;
  workspacePreferences?: {
    currency?: 'USD' | 'ZiG';
    timezone?: string;
    measurementUnits?: 'metric' | 'imperial';
    invoicePrefix?: string;
    invoiceNotes?: string;
  };
  bankAccounts: BankAccount[];
  commissionConfig?: {
    preaPercentOfTotal: number;
    agentPercentOfRemaining: number;
    agencyPercentOfRemaining: number;
    vatPercentOnCommission?: number;
  };
  plan?: 'INDIVIDUAL' | 'SME' | 'ENTERPRISE';
  propertyLimit?: number | null;
  featureFlags?: {
    commissionEnabled: boolean;
    agentAccounts: boolean;
    propertyAccounts: boolean;
    propertyOwners?: boolean;
    commissions?: boolean;
    trustAccounting?: boolean;
    maintenanceApprovals?: boolean;
    accounting?: boolean;
    agents?: boolean;
  };
  fiscalConfig?: {
    enabled?: boolean;
    providerName?: string; // Agent/Integrator name
    agentName?: string; // Optional separate agent name
    deviceSerial?: string; // Fiscal device serial/ID
    fdmsBaseUrl?: string; // Agent/FDMS gateway base URL
    apiKey?: string; // If applicable
    apiUsername?: string; // If applicable
    apiPassword?: string; // If applicable
  };
  receivablesCutover?: {
    year: number;
    month: number; // 1-12
  };
  rentReceivableOpeningBalance?: number;
  levyReceivableOpeningBalance?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCompany {
  name: string;
  address: string;
  phone: string;
  email: string;
  website?: string;
  registrationNumber: string;
  tinNumber: string;
  vatNumber?: string;
  description?: string;
  bankAccounts?: BankAccount[];
  workspaceType?: 'agency' | 'individual';
} 