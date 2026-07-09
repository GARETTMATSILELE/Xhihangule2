import api from '../api/axios';
import {
  DutyRosterShift,
  DutyType,
  ExecutiveDashboardData,
  MunicipalBillsOverview,
} from '../types/agencyOperations';

const agencyOperationsService = {
  async getExecutiveDashboard(params?: { dateFrom?: string; dateTo?: string }): Promise<ExecutiveDashboardData> {
    const res = await api.get('/agency-operations/dashboard', { params });
    return res.data.data;
  },

  async getMunicipalBillsOverview(): Promise<MunicipalBillsOverview> {
    const res = await api.get('/agency-operations/municipal-bills');
    return res.data.data;
  },

  async getDutyTypes(): Promise<DutyType[]> {
    const res = await api.get('/agency-operations/duty-roster/types');
    return res.data.data;
  },

  async listDutyShifts(params?: { from?: string; to?: string; agentId?: string }): Promise<DutyRosterShift[]> {
    const res = await api.get('/agency-operations/duty-roster/shifts', { params });
    return res.data.data;
  },

  async createDutyShift(data: {
    agentId: string;
    dutyType: DutyType;
    shiftDate: string;
    startTime?: string;
    endTime?: string;
    coverageArea?: string;
    notes?: string;
    vehicleAvailable?: boolean;
  }) {
    const res = await api.post('/agency-operations/duty-roster/shifts', data);
    return res.data.data;
  },

  async updateDutyShift(id: string, updates: Record<string, unknown>) {
    const res = await api.patch(`/agency-operations/duty-roster/shifts/${id}`, updates);
    return res.data.data;
  },

  async deleteDutyShift(id: string) {
    const res = await api.delete(`/agency-operations/duty-roster/shifts/${id}`);
    return res.data.data;
  },

  async generateDutyRoster(data: {
    from: string;
    to: string;
    dutyTypes?: DutyType[];
    coverageArea?: string;
  }) {
    const res = await api.post('/agency-operations/duty-roster/generate', data);
    return res.data.data;
  },

  async listAvailability(agentId?: string) {
    const res = await api.get('/agency-operations/duty-roster/availability', { params: { agentId } });
    return res.data.data;
  },

  async upsertAvailability(data: {
    agentId: string;
    dayOfWeek: number;
    available: boolean;
    startTime?: string;
    endTime?: string;
    coverageAreas?: string[];
    skillLevel?: 'junior' | 'mid' | 'senior';
    vehicleAvailable?: boolean;
  }) {
    const res = await api.put('/agency-operations/duty-roster/availability', data);
    return res.data.data;
  },

  async listLeaveRequests(status?: string) {
    const res = await api.get('/agency-operations/duty-roster/leave', { params: { status } });
    return res.data.data;
  },

  async createLeaveRequest(data: { agentId: string; startDate: string; endDate: string; reason?: string }) {
    const res = await api.post('/agency-operations/duty-roster/leave', data);
    return res.data.data;
  },

  async reviewLeaveRequest(id: string, status: 'approved' | 'rejected') {
    const res = await api.patch(`/agency-operations/duty-roster/leave/${id}`, { status });
    return res.data.data;
  },

  async listHolidays() {
    const res = await api.get('/agency-operations/duty-roster/holidays');
    return res.data.data;
  },

  async createHoliday(data: { name: string; date: string; recurring?: boolean }) {
    const res = await api.post('/agency-operations/duty-roster/holidays', data);
    return res.data.data;
  },
};

export default agencyOperationsService;
