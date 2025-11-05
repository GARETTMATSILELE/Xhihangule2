import api from '../api/axios';

export interface ViewingDTO {
  _id: string;
  propertyId: string;
  buyerId?: string;
  when: string;
  status: 'Scheduled' | 'Done' | 'No-show';
  notes?: string;
}

export interface CreateViewingInput {
  propertyId: string;
  buyerId?: string;
  leadId?: string;
  when: string;
  status?: ViewingDTO['status'];
  notes?: string;
}

export const viewingService = {
  async list(params?: { propertyId?: string }) {
    const res = await api.get('/viewings', { params });
    return Array.isArray(res.data) ? res.data : res.data.data;
  },
  async create(input: CreateViewingInput) {
    const res = await api.post('/viewings', input);
    return res.data.data || res.data;
  },
  async update(id: string, updates: Partial<CreateViewingInput>) {
    const res = await api.put(`/viewings/${id}`, updates);
    return res.data.data || res.data;
  },
  async remove(id: string) {
    await api.delete(`/viewings/${id}`);
  }
};


