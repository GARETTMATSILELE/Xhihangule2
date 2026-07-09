import api from '../api/axios';
import {
  MaintenanceContractor,
  MaintenanceDashboardData,
  MaintenanceActivityItem,
  MaintenancePhoto,
  MaintenanceQuote,
  MaintenanceWorkOrder,
  PropertyMaintenanceHistoryItem,
} from '../types/maintenanceManagement';

const maintenanceManagementService = {
  async getDashboard(): Promise<MaintenanceDashboardData> {
    const res = await api.get('/maintenance/dashboard');
    return res.data;
  },

  async getTimeline(requestId: string): Promise<MaintenanceActivityItem[]> {
    const res = await api.get(`/maintenance/timeline/${requestId}`);
    return res.data;
  },

  async getDetailBundle(requestId: string) {
    const res = await api.get(`/maintenance/${requestId}/detail-bundle`);
    return res.data;
  },

  async createWorkOrder(maintenanceRequestId: string, data?: { notes?: string; targetCompletionDate?: string }) {
    const res = await api.post('/maintenance/work-order', { maintenanceRequestId, ...data });
    return res.data as MaintenanceWorkOrder;
  },

  async assignContractor(data: {
    maintenanceRequestId: string;
    contractorId: string;
    targetCompletionDate?: string;
    workOrderId?: string;
  }) {
    const res = await api.post('/maintenance/assign-contractor', data);
    return res.data;
  },

  async uploadPhoto(requestId: string, data: {
    type: 'BEFORE' | 'AFTER';
    fileUrl: string;
    fileName?: string;
    mimeType?: string;
  }) {
    const res = await api.post(`/maintenance/${requestId}/upload-photo`, { requestId, ...data });
    return res.data as MaintenancePhoto;
  },

  async addQuotation(requestId: string, data: {
    amount: number;
    description: string;
    contractorId?: string;
    fileUrl?: string;
    fileName?: string;
  }) {
    const res = await api.post(`/maintenance/${requestId}/quotation`, { requestId, ...data });
    return res.data as MaintenanceQuote;
  },

  async recordVerification(requestId: string, data: {
    outcome: 'Tenant Confirmed' | 'Tenant Rejected' | 'Unable To Reach';
    comments?: string;
  }) {
    const res = await api.post(`/maintenance/${requestId}/verification`, { requestId, ...data });
    return res.data;
  },

  async getPropertyHistory(propertyId: string): Promise<PropertyMaintenanceHistoryItem[]> {
    const res = await api.get(`/maintenance/property-history/${propertyId}`);
    return res.data;
  },

  async getContractors(params?: { active?: boolean; trade?: string }): Promise<MaintenanceContractor[]> {
    const res = await api.get('/maintenance/contractors', { params });
    return res.data;
  },

  async createContractor(data: Partial<MaintenanceContractor>): Promise<MaintenanceContractor> {
    const res = await api.post('/maintenance/contractors', data);
    return res.data;
  },

  async updateContractor(id: string, data: Partial<MaintenanceContractor>): Promise<MaintenanceContractor> {
    const res = await api.put(`/maintenance/contractors/${id}`, data);
    return res.data;
  },

  async getContractorPerformance() {
    const res = await api.get('/maintenance/contractors/performance');
    return res.data;
  },

  async updateWorkOrderStatus(requestId: string, workOrderId: string, status: string) {
    const res = await api.put(`/maintenance/${requestId}/work-order/${workOrderId}/status`, { status });
    return res.data;
  },

  async closeRequest(requestId: string) {
    const res = await api.put(`/maintenance/${requestId}/close`);
    return res.data;
  },

  async scheduleFollowUpInspection(requestId: string, data?: { scheduledDate?: string; scheduledTime?: string; notes?: string }) {
    const res = await api.post(`/maintenance/${requestId}/schedule-follow-up-inspection`, data || {});
    return res.data;
  },

  async getOwnerSummary() {
    const res = await api.get('/maintenance/owner-summary');
    return res.data;
  },

  getDocumentUrl(requestId: string, docType: string): string {
    const base = api.defaults.baseURL || '';
    return `${base}/maintenance/${requestId}/documents/${docType}`;
  },
};

export default maintenanceManagementService;
