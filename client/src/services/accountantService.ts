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

  // Get PREA commission
  getPREACommission: async (): Promise<PREACommission> => {
    const response = await api.get('/accountants/prea-commission');
    return response.data;
  },

  // Get all commission data
  getAllCommissions: async (agencyFilters?: {
    year?: number;
    month?: number;
    week?: number;
    day?: number;
    filterType?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  }) => {
    const [agentData, agencyData, preaData] = await Promise.all([
      accountantService.getAgentCommissions(),
      accountantService.getAgencyCommission(agencyFilters),
      accountantService.getPREACommission()
    ]);

    return {
      agentCommissions: agentData,
      agencyCommission: agencyData,
      preaCommission: preaData
    };
  }
};

export default accountantService; 