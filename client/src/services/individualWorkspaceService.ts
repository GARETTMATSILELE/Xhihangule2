import api from '../api/axios';

export interface IndividualPropertyPerformance {
  propertyId: string;
  propertyName: string;
  address?: string;
  image?: string;
  status?: string;
  occupancyStatus: 'Occupied' | 'Vacant';
  monthlyRent: number;
  expectedRent: number;
  collectedRent: number;
  outstandingRent: number;
  rentCollectionStatus: 'green' | 'amber' | 'red';
  monthlyIncome: number;
  monthlyExpenses: number;
  netProfit: number;
  annualProfit: number;
  runningBalance: number;
  occupancyPercent: number;
  collectionPercent: number;
  profitabilityPercent: number;
  expenseRatio: number;
  maintenanceDue: boolean;
}

export interface IndividualSummary {
  summary: {
    totalProperties: number;
    totalTenants: number;
    occupiedUnits: number;
    vacantUnits: number;
    monthlyIncome: number;
    monthlyExpenses: number;
    netProfit: number;
    outstandingRent: number;
    netMonthlyCashflow: number;
    rentCollectionRate: number;
  };
  charts: Record<string, Array<Record<string, any>>>;
  properties: IndividualPropertyPerformance[];
  recentActivity: Array<{ type: string; date: string; description: string; amount: number; propertyId?: string }>;
}

export interface IndividualEntryPayload {
  propertyId: string;
  category: string;
  description: string;
  amount: number;
  date?: string;
  reference?: string;
  receiptUrl?: string;
  attachments?: string[];
  notes?: string;
}

function unwrap<T>(response: any): T {
  return response.data?.data ?? response.data;
}

function idempotencyKey(prefix: string) {
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

export const individualWorkspaceService = {
  async getDashboard(): Promise<IndividualSummary> {
    return unwrap(await api.get('/individual/dashboard'));
  },

  async getAccounting(): Promise<IndividualSummary & { overview: Record<string, number>; topPerformingProperties: IndividualPropertyPerformance[]; worstPerformingProperties: IndividualPropertyPerformance[] }> {
    return unwrap(await api.get('/individual/accounting'));
  },

  async getLedger(propertyId: string) {
    return unwrap(await api.get(`/individual/properties/${propertyId}/ledger`));
  },

  async getIncome(params?: { propertyId?: string; month?: string }) {
    return unwrap(await api.get('/individual/income', { params }));
  },

  async addIncome(payload: IndividualEntryPayload) {
    return unwrap(await api.post('/individual/income', payload, { headers: { 'Idempotency-Key': idempotencyKey('income') } }));
  },

  async editIncome(propertyId: string, transactionId: string, payload: IndividualEntryPayload) {
    return unwrap(await api.put(`/individual/income/${propertyId}/${transactionId}`, payload));
  },

  async deleteIncome(propertyId: string, transactionId: string) {
    return unwrap(await api.delete(`/individual/income/${propertyId}/${transactionId}`));
  },

  async getExpenses(params?: { propertyId?: string; month?: string }) {
    return unwrap(await api.get('/individual/expenses', { params }));
  },

  async addExpense(payload: IndividualEntryPayload) {
    return unwrap(await api.post('/individual/expenses', payload, { headers: { 'Idempotency-Key': idempotencyKey('expense') } }));
  },

  async editExpense(propertyId: string, transactionId: string, payload: IndividualEntryPayload) {
    return unwrap(await api.put(`/individual/expenses/${propertyId}/${transactionId}`, payload));
  },

  async deleteExpense(propertyId: string, transactionId: string) {
    return unwrap(await api.delete(`/individual/expenses/${propertyId}/${transactionId}`));
  },

  async approveMaintenance(id: string) {
    return unwrap(await api.post(`/individual/maintenance/${id}/approve`));
  },

  async recordMaintenanceExpense(id: string, payload: Partial<IndividualEntryPayload>) {
    return unwrap(await api.post(`/individual/maintenance/${id}/record-expense`, payload, { headers: { 'Idempotency-Key': idempotencyKey(`maintenance:${id}`) } }));
  },

  getReportUrl(reportType: string, format: 'json' | 'csv' | 'excel' | 'pdf' = 'json') {
    return `/api/individual/reports/${reportType}?format=${encodeURIComponent(format)}`;
  },

  async getReport(reportType: string) {
    return unwrap(await api.get(`/individual/reports/${reportType}`));
  }
};

export default individualWorkspaceService;
