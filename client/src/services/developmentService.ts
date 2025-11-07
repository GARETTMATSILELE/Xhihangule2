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
  variations: Array<{ id: string; label: string; count: number; price?: number; size?: number; unitCodes?: string[] }>;
  // Commission structure for development-wide payments
  commissionPercent?: number;
  commissionPreaPercent?: number;
  commissionAgencyPercentRemaining?: number;
  commissionAgentPercentRemaining?: number;
  // Agent commission split when collaborator sells
  collabOwnerAgentPercent?: number;
  collabCollaboratorAgentPercent?: number;
}

export const developmentService = {
  async create(input: CreateDevelopmentInput) {
    const res = await api.post('/developments', input);
    return res.data?.data || res.data;
  },
  async list() {
    const res = await api.get('/developments');
    return res.data?.data || res.data;
  },
  async delete(devId: string) {
    const res = await api.delete(`/developments/${devId}`);
    return res.data?.data || res.data;
  },
  async addCollaborator(devId: string, userId: string) {
    const res = await api.post(`/developments/${devId}/collaborators`, { userId });
    return res.data?.data || res.data;
  },
  async removeCollaborator(devId: string, userId: string) {
    const res = await api.delete(`/developments/${devId}/collaborators`, { data: { userId } as any });
    return res.data?.data || res.data;
  },
  async addVariations(devId: string, variations: Array<{ id: string; label: string; count: number; price?: number; size?: number; unitCodes?: string[] }>) {
    const res = await api.post(`/developments/${devId}/variations`, { variations });
    return res.data?.data || res.data;
  },
  async updateVariation(devId: string, variationId: string, body: { label?: string; price?: number; size?: number; addUnits?: number }) {
    const res = await api.patch(`/developments/${devId}/variations/${variationId}`, body);
    return res.data?.data || res.data;
  }
};




