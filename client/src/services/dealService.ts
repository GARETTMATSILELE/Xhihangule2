import api from '../api/axios';

export interface DealDTO {
  _id: string;
  propertyId: string;
  buyerName: string;
  buyerEmail?: string;
  buyerPhone?: string;
  stage: 'Offer' | 'Due Diligence' | 'Contract' | 'Closing';
  offerPrice: number;
  closeDate?: string | null;
  won: boolean;
  notes?: string;
  companyId: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDealInput {
  propertyId: string;
  buyerName: string;
  buyerEmail?: string;
  buyerPhone?: string;
  stage?: 'Offer' | 'Due Diligence' | 'Contract' | 'Closing';
  offerPrice: number;
  closeDate?: string | null;
  notes?: string;
}

export const dealService = {
  async list(params?: { propertyId?: string }) {
    const response = await api.get('/deals', { params });
    return Array.isArray(response.data) ? response.data : response.data.data;
  },
  async create(input: CreateDealInput) {
    const response = await api.post('/deals', input);
    return response.data.data || response.data;
  },
  async update(id: string, updates: Partial<CreateDealInput & { won?: boolean }>) {
    const response = await api.put(`/deals/${id}`, updates);
    return response.data.data || response.data;
  },
  async remove(id: string) {
    await api.delete(`/deals/${id}`);
  }
};


