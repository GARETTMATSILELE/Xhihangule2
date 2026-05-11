import api from '../api/axios';

export interface CommissionData {
  monthly: number;
  yearly: number;
  total: number;
  details: {
    agentId: string;
    agentName: string;
    commission: number;
    monthlyCommissions: {
      month: number;
      year: number;
      commission: number;
    }[];
    commissionEntries: {
      paymentId: string;
      propertyId: string;
      propertyName: string;
      propertyAddress?: string;
      paymentDate: string;
      referenceNumber?: string;
      year: number;
      month: number; // 0-based
      amount: number;
    }[];
    properties: {
      propertyId: string;
      propertyName: string;
      rent: number;
      commission: number;
      hasPayment: boolean;
    }[];
  }[];
}

export interface AgencyCommission {
  monthly: number;
  yearly: number;
  total: number;
  details: {
    paymentId: string;
    paymentDate: Date;
    propertyId: string;
    propertyName: string;
    propertyAddress: string;
    rentalAmount: number;
    agencyShare: number;
  }[];
}

export interface PREACommission {
  monthly: number;
  yearly: number;
  total: number;
  details: {
    propertyId: string;
    propertyName: string;
    rent: number;
    commission: number;
  }[];
}

export interface CommissionAccountEntry {
  entryId: string;
  date: Date;
  description: string;
  propertyAddress?: string;
  agentName?: string;
  debit: number;
  credit: number;
  balance: number;
  sourceType: 'commission_received' | 'agent_payout';
  reference?: string;
}

export interface CommissionAccountData {
  totalCommissionReceived: number;
  totalPayouts: number;
  balance: number;
  openingBalance?: number;
  entries: CommissionAccountEntry[];
}

export interface PropertyCommissionReportEntry {
  entryId: string;
  accountKey: string;
  date: Date;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  sourceType: 'opening' | 'payment';
}

export interface PropertyCommissionReport {
  propertyId: string;
  propertyTitle: string;
  propertyAddress: string;
  totalExpectedCommission: number;
  totalReceivedCommission: number;
  closingBalance: number;
  entries: PropertyCommissionReportEntry[];
}

export interface CommissionReportsData {
  properties: PropertyCommissionReport[];
}

export type TaxType = 'VAT' | 'VAT_ON_COMMISSION' | 'CGT';

export interface TaxLedgerEntry {
  entryId: string;
  date: Date;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  sourceType: 'opening' | 'payout';
  reference?: string;
  payoutId?: string;
  receiptFileName?: string;
  receiptContentType?: string;
  receiptUploadedAt?: string;
}

export interface TaxPropertyLedger {
  propertyId: string;
  trustAccountId: string;
  propertyName: string;
  propertyAddress: string;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  entries: TaxLedgerEntry[];
}

export interface TaxLedgersResponse {
  VAT: TaxPropertyLedger[];
  VAT_ON_COMMISSION: TaxPropertyLedger[];
  CGT: TaxPropertyLedger[];
}

export const accountantService = {
  // Get agent commissions
  getAgentCommissions: async (): Promise<CommissionData> => {
    const response = await api.get('/accountants/agent-commissions');
    return response.data;
  },

  // Get agency commission
  getAgencyCommission: async (filters?: {
    year?: number;
    month?: number;
    week?: number;
    day?: number;
    filterType?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  }): Promise<AgencyCommission> => {
    const params = new URLSearchParams();
    if (filters?.year) params.append('year', filters.year.toString());
    if (filters?.month !== undefined) params.append('month', filters.month.toString());
    if (filters?.week !== undefined) params.append('week', filters.week.toString());
    if (filters?.day !== undefined) params.append('day', filters.day.toString());
    if (filters?.filterType) params.append('filterType', filters.filterType);
    
    const response = await api.get(`/accountants/agency-commission?${params.toString()}`);
    return response.data;
  },

  // Get PREA commission with filters
  getPREACommission: async (filters?: {
    year?: number;
    month?: number;
    week?: number;
    day?: number;
    filterType?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  }): Promise<PREACommission> => {
    const params = new URLSearchParams();
    if (filters?.year) params.append('year', filters.year.toString());
    if (filters?.month !== undefined) params.append('month', filters.month.toString());
    if (filters?.week !== undefined) params.append('week', filters.week.toString());
    if (filters?.day !== undefined) params.append('day', filters.day.toString());
    if (filters?.filterType) params.append('filterType', filters.filterType);
    const response = await api.get(`/accountants/prea-commission?${params.toString()}`);
    return response.data;
  },

  // Get company commission account ledger
  getCommissionAccount: async (filters?: {
    fromYear?: number;
    fromMonth?: number; // 1-12
    toYear?: number;
    toMonth?: number; // 1-12
  }): Promise<CommissionAccountData> => {
    const params = new URLSearchParams();
    if (filters?.fromYear !== undefined) params.append('fromYear', String(filters.fromYear));
    if (filters?.fromMonth !== undefined) params.append('fromMonth', String(filters.fromMonth));
    if (filters?.toYear !== undefined) params.append('toYear', String(filters.toYear));
    if (filters?.toMonth !== undefined) params.append('toMonth', String(filters.toMonth));
    const query = params.toString();
    const response = await api.get(`/accountants/commission-account${query ? `?${query}` : ''}`);
    return response.data;
  },

  // Get per-property commission reports ledger
  getCommissionReports: async (): Promise<CommissionReportsData> => {
    const response = await api.get('/accountants/commission-reports');
    return response.data;
  },

  getTaxLedgers: async (): Promise<TaxLedgersResponse> => {
    const response = await api.get('/accountants/tax-ledgers');
    return response.data;
  },

  createTaxPayout: async (payload: {
    propertyId: string;
    taxType: TaxType;
    amount: number;
    payoutDate?: string;
    reference?: string;
    notes?: string;
  }) => {
    const response = await api.post('/accountants/tax-payouts', payload);
    return response.data;
  },

  uploadTaxPayoutReceipt: async (payoutId: string, file: File) => {
    const formData = new FormData();
    formData.append('receipt', file);
    const response = await api.post(`/accountants/tax-payouts/${encodeURIComponent(payoutId)}/receipt`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  },

  openTaxPayoutReceipt: async (payoutId: string) => {
    const response = await api.get(`/accountants/tax-payouts/${encodeURIComponent(payoutId)}/receipt`, {
      responseType: 'blob'
    } as any);
    const blob = response?.data instanceof Blob ? response.data : new Blob([response?.data]);
    const objectUrl = window.URL.createObjectURL(blob);
    window.open(objectUrl, '_blank');
    window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60_000);
  },

  openTaxPropertyReport: async (propertyId: string, taxType: TaxType) => {
    const response = await api.get(`/accountants/tax-reports/${encodeURIComponent(propertyId)}?taxType=${encodeURIComponent(taxType)}`, {
      responseType: 'blob'
    } as any);
    const blob = response?.data instanceof Blob ? response.data : new Blob([response?.data], { type: 'text/html' });
    const objectUrl = window.URL.createObjectURL(blob);
    window.open(objectUrl, '_blank');
    window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60_000);
  },

  // Get all commission data
  getAllCommissions: async (agencyFilters?: {
    year?: number;
    month?: number;
    week?: number;
    day?: number;
    filterType?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  }, commissionFilters?: {
    fromYear?: number;
    fromMonth?: number; // 1-12
    toYear?: number;
    toMonth?: number; // 1-12
  }) => {
    const [agentData, agencyData, preaData, commissionAccountData, commissionReportsData] = await Promise.all([
      accountantService.getAgentCommissions(),
      accountantService.getAgencyCommission(agencyFilters),
      accountantService.getPREACommission(agencyFilters),
      accountantService.getCommissionAccount(commissionFilters),
      accountantService.getCommissionReports()
    ]);

    return {
      agentCommissions: agentData,
      agencyCommission: agencyData,
      preaCommission: preaData,
      commissionAccount: commissionAccountData,
      commissionReports: commissionReportsData
    };
  }
};

export default accountantService; 

// Sales contracts API (accountant)
export const salesContractService = {
  async create(contract: {
    propertyId?: string;
    manualPropertyAddress?: string;
    buyerName: string;
    sellerName?: string;
    currency?: string;
    totalSalePrice: number;
    commissionPercent?: number;
    preaPercentOfCommission?: number;
    agencyPercentRemaining?: number;
    agentPercentRemaining?: number;
    reference?: string;
  }) {
    const res = await api.post('/accountants/sales', contract);
    return res.data?.data || res.data;
  },
  async list(params?: { reference?: string; status?: string }) {
    const res = await api.get('/accountants/sales', { params });
    return res.data?.data || res.data;
  },
  async get(id: string) {
    const res = await api.get(`/accountants/sales/${id}`);
    return res.data?.data || res.data;
  }
};