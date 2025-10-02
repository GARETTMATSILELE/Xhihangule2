import api from '../api/axios';

export interface CreateDevelopmentInput {
  name: string;
  type: 'stands' | 'apartments' | 'houses' | 'semidetached' | 'townhouses';
  description?: string;
  owner?: {
    firstName?: string;
    lastName?: string;
    companyName?: string;
    email?: string;
    idNumber?: string;
    phone?: string;
  };
  variations: Array<{ id: string; label: string; count: number; price?: number; size?: number }>;
}

export const developmentService = {
  async create(input: CreateDevelopmentInput) {
    // Creating developments can take longer due to unit generation; extend timeout
    const res = await api.post('/developments', input, { timeout: 60000 });
    return res.data?.data || res.data;
  },
  async list() {
    const res = await api.get('/developments');
    return res.data?.data || res.data;
  }
};




