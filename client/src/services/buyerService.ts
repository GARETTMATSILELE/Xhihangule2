import api from '../api/axios';

export interface BuyerDTO {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  budgetMin?: number;
  budgetMax?: number;
  prefs?: string;
}

export interface CreateBuyerInput {
  name: string;
  email?: string;
  phone?: string;
  budgetMin?: number;
  budgetMax?: number;
  prefs?: string;
}

export const buyerService = {
  async list() {
    const res = await api.get('/buyers');
    return Array.isArray(res.data) ? res.data : res.data.data;
  },
  async create(input: CreateBuyerInput) {
    const res = await api.post('/buyers', input);
    return res.data.data || res.data;
  },
  async update(id: string, updates: Partial<CreateBuyerInput>) {
    const res = await api.put(`/buyers/${id}`, updates);
    return res.data.data || res.data;
  },
  async remove(id: string) {
    await api.delete(`/buyers/${id}`);
  }
};


