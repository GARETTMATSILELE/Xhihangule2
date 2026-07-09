import api from '../api/axios';

export type ChargeTypeCategory =
  | 'PROPERTY_INCOME'
  | 'PASS_THROUGH'
  | 'PROPERTY_EXPENSE'
  | 'LIABILITY'
  | 'OWNER_WITHDRAWAL'
  | 'SYSTEM';

export interface ChargeType {
  _id: string;
  name: string;
  code: string;
  category: ChargeTypeCategory;
  ownerIncome: boolean;
  requiresPayout: boolean;
  requiresThirdPartyPayment: boolean;
  defaultLedger: string;
  active: boolean;
  isSystemDefault?: boolean;
}

export type ChargeTypePayload = Omit<ChargeType, '_id' | 'isSystemDefault'>;

const unwrap = (response: any) => response?.data?.data ?? response?.data;

export const chargeTypeService = {
  async list(includeInactive = true): Promise<ChargeType[]> {
    const response = await api.get('/accountants/charge-types', { params: { includeInactive } });
    return unwrap(response) || [];
  },

  async create(payload: ChargeTypePayload): Promise<ChargeType> {
    const response = await api.post('/accountants/charge-types', payload);
    return unwrap(response);
  },

  async update(id: string, payload: Partial<ChargeTypePayload>): Promise<ChargeType> {
    const response = await api.put(`/accountants/charge-types/${id}`, payload);
    return unwrap(response);
  },

  async deactivate(id: string): Promise<ChargeType> {
    const response = await api.post(`/accountants/charge-types/${id}/deactivate`);
    return unwrap(response);
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/accountants/charge-types/${id}`);
  }
};

export default chargeTypeService;
