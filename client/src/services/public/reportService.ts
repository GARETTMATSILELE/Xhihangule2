import publicApi from '../../api/publicApi';
import authenticatedApi from '../../api/axios';
import { useAuth } from '../../contexts/AuthContext';

// Types for report data
export interface OwnerStatementData {
  ownerId: string;
  ownerName: string;
  properties: Array<{
    propertyId: string;
    propertyName: string;
    address: string;
    rentCollected: number;
    expenses: number;
    netIncome: number;
    period: string;
  }>;
  totalRentCollected: number;
  totalExpenses: number;
  totalNetIncome: number;
  period: string;
}

export interface IncomeExpenseData {
  period: string;
  income: {
    rent: number;
    lateFees: number;
    other: number;
    total: number;
  };
  expenses: {
    maintenance: number;
    utilities: number;
    insurance: number;
    propertyTax: number;
    other: number;
    total: number;
  };
  netIncome: number;
  properties: Array<{
    propertyId: string;
    propertyName: string;
    income: number;
    expenses: number;
    netIncome: number;
  }>;
}

export interface RentRollData {
  propertyId: string;
  propertyName: string;
  address: string;
  unitNumber: string;
  tenantName: string;
  leaseStartDate: string;
  leaseEndDate: string;
  monthlyRent: number;
  currentBalance: number;
  status: 'occupied' | 'vacant' | 'maintenance';
  lastPaymentDate: string;
}

export interface ReceivablesData {
  tenantId: string;
  tenantName: string;
  propertyName: string;
  unitNumber: string;
  currentBalance: number;
  daysOverdue: number;
  lastPaymentDate: string;
  nextPaymentDue: string;
  status: 'current' | 'overdue' | 'delinquent';
}

export interface PayablesData {
  vendorId: string;
  vendorName: string;
  invoiceNumber: string;
  description: string;
  amount: number;
  dueDate: string;
  daysOverdue: number;
  status: 'paid' | 'pending' | 'overdue';
}

export interface MaintenanceData {
  requestId: string;
  propertyName: string;
  unitNumber: string;
  tenantName: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'emergency';
  status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: string;
  completedAt?: string;
  cost: number;
}

export interface VacancyData {
  propertyId: string;
  propertyName: string;
  address: string;
  unitNumber: string;
  daysVacant: number;
  lastTenantName: string;
  lastRentAmount: number;
  estimatedRent: number;
  vacancyReason: string;
}

export interface TenantLedgerData {
  tenantId: string;
  tenantName: string;
  propertyName: string;
  unitNumber: string;
  transactions: Array<{
    date: string;
    description: string;
    charges: number;
    payments: number;
    balance: number;
    type: 'rent' | 'late_fee' | 'maintenance' | 'payment' | 'adjustment';
  }>;
  currentBalance: number;
}

export interface DelinquencyData {
  tenantId: string;
  tenantName: string;
  propertyName: string;
  unitNumber: string;
  currentBalance: number;
  daysOverdue: number;
  lastPaymentDate: string;
  nextPaymentDue: string;
  evictionStatus: 'none' | 'notice_sent' | 'court_filed' | 'evicted';
}

export interface LeaseExpiryData {
  leaseId: string;
  tenantName: string;
  propertyName: string;
  unitNumber: string;
  leaseStartDate: string;
  leaseEndDate: string;
  daysUntilExpiry: number;
  monthlyRent: number;
  renewalStatus: 'pending' | 'renewed' | 'terminating' | 'unknown';
}

export interface PortfolioSummaryData {
  totalProperties: number;
  totalUnits: number;
  occupiedUnits: number;
  vacantUnits: number;
  occupancyRate: number;
  totalMonthlyRent: number;
  averageRent: number;
  totalValue: number;
  properties: Array<{
    propertyId: string;
    propertyName: string;
    address: string;
    units: number;
    occupiedUnits: number;
    monthlyRent: number;
    propertyValue: number;
  }>;
}

export interface CapitalExpenditureData {
  propertyId: string;
  propertyName: string;
  description: string;
  amount: number;
  date: string;
  category: 'repair' | 'improvement' | 'replacement' | 'addition';
  vendor: string;
  status: 'planned' | 'in_progress' | 'completed';
}

export interface EvictionData {
  evictionId: string;
  tenantName: string;
  propertyName: string;
  unitNumber: string;
  filingDate: string;
  courtDate: string;
  status: 'filed' | 'hearing_scheduled' | 'judgment_entered' | 'eviction_ordered' | 'completed';
  reason: string;
  amountOwed: number;
}

export interface ForecastData {
  period: string;
  projectedIncome: number;
  projectedExpenses: number;
  projectedNetIncome: number;
  assumptions: Array<{
    category: string;
    assumption: string;
    impact: number;
  }>;
}

// Helper function to get the appropriate API instance
const getApiInstance = (isAuthenticated: boolean) => {
  return isAuthenticated ? authenticatedApi : publicApi;
};

// Report service functions
export const reportService = {
  // Owner Statement Report
  getOwnerStatement: async (isAuthenticated: boolean = false, ownerId?: string, period?: string): Promise<OwnerStatementData[]> => {
    const api = getApiInstance(isAuthenticated);
    const params = new URLSearchParams();
    if (ownerId) params.append('ownerId', ownerId);
    if (period) params.append('period', period);
    
    const endpoint = isAuthenticated ? '/reports/owner-statement' : '/public/reports/owner-statement';
    const res = await api.get(`${endpoint}?${params.toString()}`);
    return res.data;
  },

  // Income & Expense Report
  getIncomeExpense: async (isAuthenticated: boolean = false, period?: string, propertyId?: string): Promise<IncomeExpenseData> => {
    const api = getApiInstance(isAuthenticated);
    const params = new URLSearchParams();
    if (period) params.append('period', period);
    if (propertyId) params.append('propertyId', propertyId);
    
    const endpoint = isAuthenticated ? '/reports/income-expense' : '/public/reports/income-expense';
    const res = await api.get(`${endpoint}?${params.toString()}`);
    return res.data;
  },

  // Rent Roll Report
  getRentRoll: async (isAuthenticated: boolean = false, propertyId?: string): Promise<RentRollData[]> => {
    const api = getApiInstance(isAuthenticated);
    const params = new URLSearchParams();
    if (propertyId) params.append('propertyId', propertyId);
    
    const endpoint = isAuthenticated ? '/reports/rent-roll' : '/public/reports/rent-roll';
    const res = await api.get(`${endpoint}?${params.toString()}`);
    return res.data;
  },

  // Receivables Report
  getReceivables: async (isAuthenticated: boolean = false, daysOverdue?: number): Promise<ReceivablesData[]> => {
    const api = getApiInstance(isAuthenticated);
    const params = new URLSearchParams();
    if (daysOverdue) params.append('daysOverdue', daysOverdue.toString());
    
    const endpoint = isAuthenticated ? '/reports/receivables' : '/public/reports/receivables';
    const res = await api.get(`${endpoint}?${params.toString()}`);
    return res.data;
  },

  // Payables Report
  getPayables: async (isAuthenticated: boolean = false, status?: string): Promise<PayablesData[]> => {
    const api = getApiInstance(isAuthenticated);
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    
    const endpoint = isAuthenticated ? '/reports/payables' : '/public/reports/payables';
    const res = await api.get(`${endpoint}?${params.toString()}`);
    return res.data;
  },

  // Maintenance Report
  getMaintenance: async (isAuthenticated: boolean = false, status?: string, priority?: string): Promise<MaintenanceData[]> => {
    const api = getApiInstance(isAuthenticated);
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (priority) params.append('priority', priority);
    
    const endpoint = isAuthenticated ? '/reports/maintenance' : '/public/reports/maintenance';
    const res = await api.get(`${endpoint}?${params.toString()}`);
    return res.data;
  },

  // Vacancy Report
  getVacancy: async (isAuthenticated: boolean = false): Promise<VacancyData[]> => {
    const api = getApiInstance(isAuthenticated);
    const endpoint = isAuthenticated ? '/reports/vacancy' : '/public/reports/vacancy';
    const res = await api.get(endpoint);
    return res.data;
  },

  // Tenant Ledger Report
  getTenantLedger: async (isAuthenticated: boolean = false, tenantId: string): Promise<TenantLedgerData> => {
    const api = getApiInstance(isAuthenticated);
    const endpoint = isAuthenticated ? '/reports/tenant-ledger' : '/public/reports/tenant-ledger';
    const res = await api.get(`${endpoint}?tenantId=${tenantId}`);
    return res.data;
  },

  // Delinquency Report
  getDelinquency: async (isAuthenticated: boolean = false, daysOverdue?: number): Promise<DelinquencyData[]> => {
    const api = getApiInstance(isAuthenticated);
    const params = new URLSearchParams();
    if (daysOverdue) params.append('daysOverdue', daysOverdue.toString());
    
    const endpoint = isAuthenticated ? '/reports/delinquency' : '/public/reports/delinquency';
    const res = await api.get(`${endpoint}?${params.toString()}`);
    return res.data;
  },

  // Lease Expiry Report
  getLeaseExpiry: async (isAuthenticated: boolean = false, daysUntilExpiry?: number): Promise<LeaseExpiryData[]> => {
    const api = getApiInstance(isAuthenticated);
    const params = new URLSearchParams();
    if (daysUntilExpiry) params.append('daysUntilExpiry', daysUntilExpiry.toString());
    
    const endpoint = isAuthenticated ? '/reports/lease-expiry' : '/public/reports/lease-expiry';
    const res = await api.get(`${endpoint}?${params.toString()}`);
    return res.data;
  },

  // Portfolio Summary Report
  getPortfolioSummary: async (isAuthenticated: boolean = false): Promise<PortfolioSummaryData> => {
    const api = getApiInstance(isAuthenticated);
    const endpoint = isAuthenticated ? '/reports/portfolio-summary' : '/public/reports/portfolio-summary';
    const res = await api.get(endpoint);
    return res.data;
  },

  // Capital Expenditure Report
  getCapitalExpenditure: async (isAuthenticated: boolean = false, year?: number): Promise<CapitalExpenditureData[]> => {
    const api = getApiInstance(isAuthenticated);
    const params = new URLSearchParams();
    if (year) params.append('year', year.toString());
    
    const endpoint = isAuthenticated ? '/reports/capital-expenditure' : '/public/reports/capital-expenditure';
    const res = await api.get(`${endpoint}?${params.toString()}`);
    return res.data;
  },

  // Eviction Report
  getEviction: async (isAuthenticated: boolean = false, status?: string): Promise<EvictionData[]> => {
    const api = getApiInstance(isAuthenticated);
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    
    const endpoint = isAuthenticated ? '/reports/eviction' : '/public/reports/eviction';
    const res = await api.get(`${endpoint}?${params.toString()}`);
    return res.data;
  },

  // Forecast Report
  getForecast: async (isAuthenticated: boolean = false, periods?: number): Promise<ForecastData[]> => {
    const api = getApiInstance(isAuthenticated);
    const params = new URLSearchParams();
    if (periods) params.append('periods', periods.toString());
    
    const endpoint = isAuthenticated ? '/reports/forecast' : '/public/reports/forecast';
    const res = await api.get(`${endpoint}?${params.toString()}`);
    return res.data;
  },
};

export default reportService; 