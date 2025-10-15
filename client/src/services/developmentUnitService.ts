import api from '../api/axios';

export interface ListUnitsParams {
  developmentId: string;
  status?: string;
  variationId?: string;
  page?: number;
  limit?: number;
}

export const developmentUnitService = {
  async list(params: ListUnitsParams) {
    const res = await api.get(`/developments/${params.developmentId}/units`, { params });
    return res.data?.items || res.data?.data || res.data;
  },
  async listPayments(developmentId: string, opts?: { unitId?: string; saleMode?: 'quick' | 'installment' }) {
    const res = await api.get(`/developments/${developmentId}/payments`, { params: { unitId: opts?.unitId, saleMode: opts?.saleMode } });
    return res.data?.items || res.data?.data || res.data;
  },
  async updateStatus(unitId: string, body: { to: 'available' | 'under_offer' | 'sold'; buyerId?: string; reservationMinutes?: number; dealId?: string; }) {
    const res = await api.patch(`/development-units/${unitId}/status`, body);
    return res.data?.data || res.data;
  }
};





