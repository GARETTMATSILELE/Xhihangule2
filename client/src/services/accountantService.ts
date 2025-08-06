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
  getAgencyCommission: async (): Promise<AgencyCommission> => {
    const response = await api.get('/accountants/agency-commission');
    return response.data;
  },

  // Get PREA commission
  getPREACommission: async (): Promise<PREACommission> => {
    const response = await api.get('/accountants/prea-commission');
    return response.data;
  },

  // Get all commission data
  getAllCommissions: async () => {
    const [agentData, agencyData, preaData] = await Promise.all([
      accountantService.getAgentCommissions(),
      accountantService.getAgencyCommission(),
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