import api from '../api/axios';

export interface CreateDevelopmentInput {
  name: string;
  type: 'stands' | 'apartments' | 'houses' | 'semidetached' | 'townhouses' | 'land';
  description?: string;
  address?: string;
  owner?: {
    firstName?: string;
    lastName?: string;
    companyName?: string;
    email?: string;
    idNumber?: string;
    phone?: string;
  };
  variations: Array<{ id: string; label: string; count: number; price?: number; size?: number }>;
  // Commission structure for development-wide payments
  commissionPercent?: number;
  commissionPreaPercent?: number;
  commissionAgencyPercentRemaining?: number;
  commissionAgentPercentRemaining?: number;
}

export const developmentService = {
  async create(input: CreateDevelopmentInput) {
    const res = await api.post('/developments', input);
    return res.data?.data || res.data;
  },
  async list() {
    const res = await api.get('/developments');
    return res.data?.data || res.data;
  }
};




