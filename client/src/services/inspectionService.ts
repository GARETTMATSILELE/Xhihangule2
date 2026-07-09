import api from '../api/axios';

export type InspectionFrequency = 'monthly' | 'quarterly' | 'biannual' | 'annual' | 'custom' | 'ad_hoc';
export type InspectionStatus = 'scheduled' | 'upcoming' | 'due_today' | 'overdue' | 'in_progress' | 'draft' | 'completed' | 'reviewed' | 'follow_up_required' | 'missed' | 'rescheduled' | 'cancelled';
export type InspectionType = 'move_in' | 'routine' | 'follow_up' | 'move_out' | 'emergency';
export type InspectionItemStatus = 'pending' | 'ok' | 'attention_required' | 'damaged' | 'missing' | 'not_working' | 'repaired' | 'na' | 'pass' | 'fail' | 'not_applicable';

export interface InspectionInput {
  propertyId: string;
  tenantId?: string;
  leaseId?: string;
  scheduledDate: Date | string;
  scheduledTime?: string;
  notes?: string;
  frequency?: InspectionFrequency;
  customIntervalDays?: number;
  type?: InspectionType;
}

export interface InspectionRecord {
  _id: string;
  propertyId: string;
  tenantId?: string;
  leaseId?: string;
  scheduledDate: string;
  scheduledTime?: string;
  originalScheduledDate?: string;
  nextInspectionDate?: string;
  completedAt?: string;
  notes?: string;
  frequency: InspectionFrequency;
  customIntervalDays?: number;
  type?: InspectionType;
  status?: InspectionStatus;
  effectiveStatus?: InspectionStatus;
  generatedBy?: string;
  conditionScore?: number;
  conditionRating?: 'excellent' | 'good' | 'needs_attention' | 'critical';
  followUpRequired?: boolean;
  followUpInspectionId?: string;
  maintenanceRequestIds?: string[];
  startedAt?: string;
  completedBy?: string;
  executionTimeline?: Array<{
    event: string;
    message?: string;
    timestamp: string;
    payload?: any;
  }>;
  rescheduleHistory?: Array<{
    originalDate: string;
    newDate: string;
    newTime?: string;
    reason: string;
    tenantConfirmationNotes?: string;
    rescheduledAt: string;
  }>;
  checklist?: Array<{
    _id?: string;
    room?: string;
    category: string;
    item: string;
    status: InspectionItemStatus;
    notes?: string;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    photos?: Array<{
      fileName: string;
      fileType: string;
      fileUrl: string;
      caption?: string;
      category?: string;
      uploadedAt: string;
      uploadedBy: string;
    }>;
  }>;
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
    tenantSignature?: string;
    agentSignature?: string;
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

export type InspectionReportUpdate = Partial<NonNullable<InspectionRecord['report']>> & {
  conditionScore?: number;
  conditionRating?: InspectionRecord['conditionRating'];
  followUpRequired?: boolean;
  checklist?: InspectionRecord['checklist'];
};

export const inspectionService = {
  async getInspections(filters?: { propertyId?: string; leaseId?: string; status?: InspectionStatus }): Promise<InspectionRecord[]> {
    const res = await api.get('/inspections', { params: filters });
    return Array.isArray(res.data) ? res.data : (res.data?.data || []);
  },

  async getOperations(): Promise<any> {
    const res = await api.get('/inspections/operations');
    return res.data;
  },

  async getComplianceMetrics(): Promise<any> {
    const res = await api.get('/inspections/compliance');
    return res.data;
  },

  async getCalendarEvents(filters?: { start?: string; end?: string }): Promise<any[]> {
    const res = await api.get('/inspections/calendar-events', { params: filters });
    return Array.isArray(res.data) ? res.data : (res.data?.data || []);
  },

  async getTemplates(): Promise<any[]> {
    const res = await api.get('/inspections/templates');
    return Array.isArray(res.data) ? res.data : (res.data?.data || []);
  },

  async dispatchReminders(): Promise<{ sentCount: number }> {
    const res = await api.post('/inspections/dispatch-reminders');
    return res.data;
  },

  async createInspection(input: InspectionInput): Promise<InspectionRecord> {
    const res = await api.post('/inspections', input);
    return res.data;
  },

  async updateInspection(id: string, input: Partial<InspectionInput & { nextInspectionDate?: string | Date; status?: InspectionStatus; checklist?: InspectionRecord['checklist']; conditionScore?: number; conditionRating?: InspectionRecord['conditionRating']; followUpRequired?: boolean }>): Promise<InspectionRecord> {
    const res = await api.put(`/inspections/${id}`, input);
    return res.data;
  },

  async generateFromLeases(input: { leaseId?: string; frequency?: InspectionFrequency; customIntervalDays?: number; includeMoveIn?: boolean; includeMoveOut?: boolean } = {}): Promise<{ createdCount: number; inspections: InspectionRecord[] }> {
    const res = await api.post('/inspections/generate-from-leases', input);
    return res.data;
  },

  async reschedule(id: string, input: { scheduledDate: Date | string; scheduledTime?: string; reason: string; tenantConfirmationNotes?: string }): Promise<InspectionRecord> {
    const res = await api.post(`/inspections/${id}/reschedule`, input);
    return res.data;
  },

  async createFollowUp(id: string, input: { scheduledDate?: Date | string; scheduledTime?: string; notes?: string } = {}): Promise<InspectionRecord> {
    const res = await api.post(`/inspections/${id}/follow-up`, input);
    return res.data;
  },

  async escalateToMaintenance(id: string, input: { title?: string; description?: string; priority?: 'low' | 'medium' | 'high'; estimatedCost?: number } = {}): Promise<any> {
    const res = await api.post(`/inspections/${id}/escalate-maintenance`, input);
    return res.data;
  },

  async startExecution(id: string): Promise<InspectionRecord> {
    const res = await api.post(`/inspections/${id}/start`);
    return res.data;
  },

  async autosaveExecution(id: string, input: { checklist?: InspectionRecord['checklist']; notes?: string; report?: Partial<InspectionRecord['report']>; quickDraft?: boolean; startedAt?: string }): Promise<InspectionRecord> {
    const res = await api.put(`/inspections/${id}/autosave`, input);
    return res.data;
  },

  async completeExecution(id: string, input: { checklist?: InspectionRecord['checklist']; notes?: string; report?: Partial<InspectionRecord['report']> }): Promise<InspectionRecord> {
    const res = await api.post(`/inspections/${id}/complete`, input);
    return res.data;
  },

  async uploadItemPhoto(id: string, itemId: string, file: File, caption?: string): Promise<InspectionRecord> {
    const form = new FormData();
    form.append('file', file);
    if (caption) form.append('caption', caption);
    const res = await api.post(`/inspections/${id}/checklist/${itemId}/photos`, form, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return res.data;
  },

  async getReportHtml(id: string): Promise<string> {
    const res = await api.get(`/inspections/${id}/report-html`, { responseType: 'text' });
    return res.data;
  },

  async deleteInspection(id: string): Promise<void> {
    await api.delete(`/inspections/${id}`);
  },

  async updateReport(id: string, report: InspectionReportUpdate): Promise<InspectionRecord> {
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


