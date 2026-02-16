import api from '../api/axios';

export interface LeadDTO {
  _id: string;
  name: string;
  source?: string;
  interest?: string;
  notes?: string;
  email?: string;
  phone?: string;
  status: 'New' | 'Contacted' | 'Qualified' | 'Viewing' | 'Offer' | 'Won' | 'Lost';
  // Optional requirements (for suggestions only)
  budgetMin?: number;
  budgetMax?: number;
  preferredSuburbs?: string[];
  propertyType?: string;
  minBedrooms?: number;
  features?: string[];
  createdAt: string;
}

export interface CreateLeadInput {
  name: string;
  source?: string;
  interest?: string;
  notes?: string;
  email?: string;
  phone?: string;
  status?: LeadDTO['status'];
  budgetMin?: number;
  budgetMax?: number;
  preferredSuburbs?: string[] | string;
  propertyType?: string;
  minBedrooms?: number;
  features?: string[];
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
  async update(id: string, updates: Partial<CreateLeadInput & { propertyId?: string }>) {
    const res = await api.put(`/leads/${id}`, updates as any);
    return res.data.data || res.data;
  },
  async suggestedProperties(leadId: string, opts?: { includeUnderOffer?: boolean }) {
    const res = await api.get(`/leads/${leadId}/suggested-properties`, {
      params: { includeUnderOffer: opts?.includeUnderOffer === false ? '0' : '1' }
    });
    return res.data?.data || res.data;
  },
  async remove(id: string) {
    await api.delete(`/leads/${id}`);
  }
};


