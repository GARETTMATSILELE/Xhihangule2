import api from '../api/axios';

export interface ListUnitsParams {
  developmentId: string;
  status?: string;
  variationId?: string;
  page?: number;
  limit?: number;
  fields?: string;
  requireBuyer?: boolean;
}

export const developmentUnitService = {
  async list(params: ListUnitsParams) {
    const res = await api.get(`/developments/${params.developmentId}/units`, { params });
    return res.data?.items || res.data?.data || res.data;
  },
  async get(unitId: string) {
    const res = await api.get(`/development-units/${unitId}`);
    return res.data?.data || res.data;
  },
  async listPayments(developmentId: string, opts?: { unitId?: string; saleMode?: 'quick' | 'installment' }) {
    const res = await api.get(`/developments/${developmentId}/payments`, { params: { unitId: opts?.unitId, saleMode: opts?.saleMode } });
    return res.data?.items || res.data?.data || res.data;
  },
  async setBuyer(unitId: string, buyerId: string) {
    const res = await api.patch(`/development-units/${unitId}/buyer`, { buyerId });
    return res.data?.data || res.data;
  },
  async updateStatus(unitId: string, body: { to: 'available' | 'under_offer' | 'sold'; buyerId?: string; reservationMinutes?: number; dealId?: string; }) {
    const res = await api.patch(`/development-units/${unitId}/status`, body);
    return res.data?.data || res.data;
  },
  async updateDetails(unitId: string, body: { unitCode?: string; price?: number; meta?: { block?: string; floor?: string; bedrooms?: number; bathrooms?: number; standSize?: number } }) {
    const res = await api.patch(`/development-units/${unitId}`, body);
    return res.data?.data || res.data;
  },
  async addCollaborator(unitId: string, userId: string) {
    const res = await api.post(`/development-units/${unitId}/collaborators`, { userId });
    return res.data?.data || res.data;
  },
  async removeCollaborator(unitId: string, userId: string) {
    const res = await api.delete(`/development-units/${unitId}/collaborators`, { data: { userId } as any });
    return res.data?.data || res.data;
  }
};





