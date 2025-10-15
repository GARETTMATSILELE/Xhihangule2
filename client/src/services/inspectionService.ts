import api from '../api/axios';

export type InspectionFrequency = 'quarterly' | 'ad_hoc';

export interface InspectionInput {
  propertyId: string;
  tenantId?: string;
  scheduledDate: Date | string;
  notes?: string;
  frequency?: InspectionFrequency;
}

export interface InspectionRecord {
  _id: string;
  propertyId: string;
  tenantId?: string;
  scheduledDate: string;
  nextInspectionDate?: string;
  notes?: string;
  frequency: InspectionFrequency;
  createdAt: string;
  updatedAt: string;
  // Optional populated
  property?: { name?: string; address?: string };
  report?: {
    conditionSummary?: string;
    issuesFound?: string;
    actionsRequired?: string;
    inspectorName?: string;
    inspectedAt?: string;
  };
  attachments?: Array<{
    _id?: string;
    fileName: string;
    fileType: string;
    fileUrl: string;
    uploadedAt: string;
    uploadedBy: string;
  }>;
}

export const inspectionService = {
  async getInspections(): Promise<InspectionRecord[]> {
    const res = await api.get('/inspections');
    return Array.isArray(res.data) ? res.data : (res.data?.data || []);
  },

  async createInspection(input: InspectionInput): Promise<InspectionRecord> {
    const res = await api.post('/inspections', input);
    return res.data;
  },

  async updateInspection(id: string, input: Partial<InspectionInput & { nextInspectionDate?: string | Date }>): Promise<InspectionRecord> {
    const res = await api.put(`/inspections/${id}`, input);
    return res.data;
  },

  async deleteInspection(id: string): Promise<void> {
    await api.delete(`/inspections/${id}`);
  },

  async updateReport(id: string, report: Partial<InspectionRecord['report']>): Promise<InspectionRecord> {
    const res = await api.put(`/inspections/${id}/report`, report);
    return res.data;
  },

  async uploadAttachment(id: string, file: File): Promise<InspectionRecord> {
    const form = new FormData();
    form.append('file', file);
    const res = await api.post(`/inspections/${id}/attachments`, form, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return res.data;
  }
};


