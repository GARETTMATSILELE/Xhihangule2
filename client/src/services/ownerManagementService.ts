import api from '../api/axios';
import {
  OwnersDashboardResponse,
  OwnerPortfolioResponse,
  OwnerFinancialsResponse,
  OwnerMaintenanceResponse,
  OwnerDocumentRecord,
  OwnerProfileExtras,
  OwnerReportType,
} from '../types/ownerManagement';

const base = '/agents/property-owners';

const ownerManagementService = {
  getDashboard: async (): Promise<OwnersDashboardResponse> => {
    const { data } = await api.get(`${base}/dashboard`);
    return data;
  },

  getPortfolio: async (ownerId: string): Promise<OwnerPortfolioResponse> => {
    const { data } = await api.get(`${base}/${ownerId}/portfolio`);
    return data;
  },

  getFinancials: async (ownerId: string): Promise<OwnerFinancialsResponse> => {
    const { data } = await api.get(`${base}/${ownerId}/financials`);
    return data;
  },

  getMaintenance: async (ownerId: string): Promise<OwnerMaintenanceResponse> => {
    const { data } = await api.get(`${base}/${ownerId}/maintenance`);
    return data;
  },

  getDocuments: async (ownerId: string): Promise<OwnerDocumentRecord[]> => {
    const { data } = await api.get(`${base}/${ownerId}/documents`);
    return data;
  },

  getProfileExtras: async (ownerId: string): Promise<OwnerProfileExtras> => {
    const { data } = await api.get(`${base}/${ownerId}/profile-extras`);
    return data;
  },

  getHistory: async (ownerId: string) => {
    const { data } = await api.get(`${base}/${ownerId}/history`);
    return data;
  },

  patchProfile: async (ownerId: string, payload: Record<string, unknown>) => {
    const { data } = await api.patch(`${base}/${ownerId}/profile`, payload);
    return data;
  },

  saveBanking: async (ownerId: string, payload: Record<string, string>) => {
    const { data } = await api.post(`${base}/${ownerId}/banking`, payload);
    return data;
  },

  savePreferences: async (ownerId: string, payload: Record<string, boolean>) => {
    const { data } = await api.post(`${base}/${ownerId}/preferences`, payload);
    return data;
  },

  uploadDocument: async (payload: {
    ownerId: string;
    documentType: string;
    fileName: string;
    fileUrl: string;
    mimeType?: string;
    fileSize?: number;
  }) => {
    const { data } = await api.post(`${base}/${payload.ownerId}/documents`, payload);
    return data;
  },

  addOwnershipHistory: async (payload: {
    ownerId: string;
    propertyId: string;
    startDate: string;
    endDate?: string;
    ownershipPercentage?: number;
    notes?: string;
  }) => {
    const { data } = await api.post(`${base}/ownership-history`, payload);
    return data;
  },

  downloadReport: async (ownerId: string, docType: OwnerReportType): Promise<Blob> => {
    const { data } = await api.get(`${base}/${ownerId}/documents/${docType}`, { responseType: 'blob' });
    return data;
  },
};

export default ownerManagementService;
