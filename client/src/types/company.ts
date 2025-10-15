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
  subscriptionStatus: 'active' | 'inactive' | 'trial';
  subscriptionEndDate?: Date;
  bankAccounts: BankAccount[];
  commissionConfig?: {
    preaPercentOfTotal: number;
    agentPercentOfRemaining: number;
    agencyPercentOfRemaining: number;
  };
  plan?: 'INDIVIDUAL' | 'SME' | 'ENTERPRISE';
  propertyLimit?: number | null;
  featureFlags?: {
    commissionEnabled: boolean;
    agentAccounts: boolean;
    propertyAccounts: boolean;
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
} 