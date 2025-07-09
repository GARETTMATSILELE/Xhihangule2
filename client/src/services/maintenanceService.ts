import { MaintenanceRequest, MaintenancePriority } from '../types/maintenance';
import api from '../api/axios';

export const maintenanceService = {
  async getRequests(): Promise<MaintenanceRequest[]> {
    const response = await api.get('/maintenance');
    return response.data;
  },

  async createRequest(data: Partial<MaintenanceRequest>): Promise<MaintenanceRequest> {
    const response = await api.post('/maintenance', data);
    return response.data;
  },

  async updateRequest(id: string, data: Partial<MaintenanceRequest>): Promise<MaintenanceRequest> {
    const response = await api.put(`/maintenance/${id}`, data);
    return response.data;
  },

  async deleteRequest(id: string): Promise<void> {
    await api.delete(`/maintenance/${id}`);
  },

  async assignRequest(requestId: string, vendorId: string): Promise<MaintenanceRequest> {
    const response = await api.put(`/maintenance/${requestId}/assign`, { vendorId });
    return response.data;
  },

  async getEvents(): Promise<any[]> {
    const response = await api.get('/maintenance/events');
    return response.data;
  }
}; 