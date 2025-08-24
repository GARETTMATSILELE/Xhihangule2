import api from '../api/axios';

export interface LeadDTO {
  _id: string;
  name: string;
  source?: string;
  interest?: string;
  email?: string;
  phone?: string;
  status: 'New' | 'Contacted' | 'Qualified' | 'Viewing' | 'Offer' | 'Won' | 'Lost';
  createdAt: string;
}

export interface CreateLeadInput {
  name: string;
  source?: string;
  interest?: string;
  email?: string;
  phone?: string;
  status?: LeadDTO['status'];
}

export const leadService = {
  async list() {
    const res = await api.get('/leads');
    return Array.isArray(res.data) ? res.data : res.data.data;
  },
  async create(input: CreateLeadInput) {
    const res = await api.post('/leads', input);
    return res.data.data || res.data;
  },
  async update(id: string, updates: Partial<CreateLeadInput>) {
    const res = await api.put(`/leads/${id}`, updates);
    return res.data.data || res.data;
  },
  async remove(id: string) {
    await api.delete(`/leads/${id}`);
  }
};


