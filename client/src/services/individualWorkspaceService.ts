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
    yearToDateProfit?: number;
    annualProfit?: number;
  runningBalance: number;
  occupancyPercent: number;
  collectionPercent: number;
  profitabilityPercent: number;
  expenseRatio: number;
  maintenanceDue: boolean;
}

export interface IndividualSummary {
  period?: {
    basis: string;
    label: string;
    start?: string | null;
    end?: string | null;
  };
  summary: {
    totalProperties: number;
    totalTenants: number;
    occupiedUnits: number;
    vacantUnits: number;
    monthlyIncome: number;
    monthlyExpenses: number;
    netProfit: number;
    yearToDateProfit?: number;
    financialYearProfit?: number;
    annualisedRunRate?: number;
    rentCollected?: number;
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
  deductibility?: string;
  capitalOrRevenue?: string;
  vatMode?: string;
  supplier?: string;
  supplierTin?: string;
  supplierVatNumber?: string;
  invoiceNumber?: string;
  inputVatEligibility?: string;
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
  },

  async getTaxProfile(): Promise<import('../pages/IndividualDashboard/tax/types').OwnerTaxProfile> {
    return unwrap(await api.get('/individual/tax-profile'));
  },

  async updateTaxProfile(payload: Record<string, unknown> | object): Promise<import('../pages/IndividualDashboard/tax/types').OwnerTaxProfile> {
    return unwrap(await api.put('/individual/tax-profile', payload));
  },

  async getPropertyTaxProfile(propertyId: string): Promise<import('../pages/IndividualDashboard/tax/types').PropertyTaxProfile> {
    return unwrap(await api.get(`/individual/properties/${propertyId}/tax-profile`));
  },

  async updatePropertyTaxProfile(propertyId: string, payload: Record<string, unknown> | object): Promise<import('../pages/IndividualDashboard/tax/types').PropertyTaxProfile> {
    return unwrap(await api.put(`/individual/properties/${propertyId}/tax-profile`, payload));
  },

  async getTaxPeriods() {
    return unwrap(await api.get('/individual/tax/periods'));
  },

  async openTaxPeriod(payload: { taxType: string; periodKey: string; notes?: string }) {
    return unwrap(await api.post('/individual/tax/periods', payload));
  },

  async getTaxPeriodDetail(id: string) {
    return unwrap(await api.get(`/individual/tax/periods/${id}`));
  },

  async getTaxReview() {
    return unwrap(await api.get('/individual/tax/review'));
  },

  async getTransactionTax(sourceType: 'payment' | 'entry', sourceId: string) {
    return unwrap(await api.get(`/individual/transactions/${sourceType}/${sourceId}/tax`));
  },

  async getVatOverview(periodKey?: string) {
    return unwrap(await api.get('/individual/tax/vat', { params: { periodKey } }));
  },

  async getVatWorkingPaper(periodKey?: string) {
    return unwrap(await api.get('/individual/tax/vat/working-paper', { params: { periodKey } }));
  },

  async getVatTransactions(params?: { periodKey?: string; direction?: string; status?: string }) {
    return unwrap(await api.get('/individual/tax/vat/transactions', { params }));
  },

  async getVatReview() {
    return unwrap(await api.get('/individual/tax/vat/review'));
  },

  async getVatReconciliation(periodKey?: string) {
    return unwrap(await api.get('/individual/tax/vat/reconciliation', { params: { periodKey } }));
  },

  getVatWorkingPaperUrl(format: 'csv' | 'xlsx' | 'pdf' | 'excel', periodKey?: string) {
    const params = new URLSearchParams({ format: format === 'excel' ? 'xlsx' : format });
    if (periodKey) params.set('periodKey', periodKey);
    return `/api/individual/tax/vat/working-paper?${params.toString()}`;
  },

  async getRentalTaxOverview(periodKey?: string) {
    return unwrap(await api.get('/individual/tax/rental', { params: { periodKey } }));
  },

  async getRentalTaxWorkingPaper(periodKey?: string) {
    return unwrap(await api.get('/individual/tax/rental/working-paper', { params: { periodKey } }));
  },

  async getRentalTaxTransactions(params?: { periodKey?: string; status?: string; propertyId?: string }) {
    return unwrap(await api.get('/individual/tax/rental/transactions', { params }));
  },

  async getRentalTaxReview() {
    return unwrap(await api.get('/individual/tax/rental/review'));
  },

  async getRentalTaxReconciliation(periodKey?: string) {
    return unwrap(await api.get('/individual/tax/rental/reconciliation', { params: { periodKey } }));
  },

  async getRentalTaxAnnual(year?: number) {
    return unwrap(await api.get('/individual/tax/rental/annual', { params: { year } }));
  },

  async recordRentalTaxPayment(payload: Record<string, unknown>) {
    return unwrap(await api.post('/individual/tax/rental/payments', payload));
  },

  async applyDepositToRent(payload: Record<string, unknown>) {
    return unwrap(await api.post('/individual/deposits/apply', payload));
  },

  getRentalTaxWorkingPaperUrl(format: 'csv' | 'xlsx' | 'pdf' | 'excel', periodKey?: string) {
    const params = new URLSearchParams({ format: format === 'excel' ? 'xlsx' : format });
    if (periodKey) params.set('periodKey', periodKey);
    return `/api/individual/tax/rental/working-paper?${params.toString()}`;
  },

  async getIncomeTaxOverview(periodKey?: string) {
    return unwrap(await api.get('/individual/tax/income', { params: { periodKey } }));
  },

  async getIncomeTaxWorkingPaper(periodKey?: string) {
    return unwrap(await api.get('/individual/tax/income/working-paper', { params: { periodKey } }));
  },

  async getIncomeTaxTransactions(params?: { periodKey?: string; status?: string; propertyId?: string }) {
    return unwrap(await api.get('/individual/tax/income/transactions', { params }));
  },

  async getIncomeTaxReview() {
    return unwrap(await api.get('/individual/tax/income/review'));
  },

  async getIncomeTaxReconciliation(periodKey?: string) {
    return unwrap(await api.get('/individual/tax/income/reconciliation', { params: { periodKey } }));
  },

  async getIncomeTaxAnnual(year?: number) {
    return unwrap(await api.get('/individual/tax/income/annual', { params: { year } }));
  },

  async calculateIncomeTax(taxPeriodKey: string) {
    return unwrap(await api.post('/individual/tax/income/calculate', { taxPeriodKey }));
  },

  async createIncomeTaxAdjustment(payload: Record<string, unknown>) {
    return unwrap(await api.post('/individual/tax/income/adjustments', payload));
  },

  async approveIncomeTaxAdjustment(id: string) {
    return unwrap(await api.post(`/individual/tax/income/adjustments/${id}/approve`));
  },

  async recordIncomeTaxPayment(payload: Record<string, unknown>) {
    return unwrap(await api.post('/individual/tax/income/payments', payload));
  },

  getIncomeTaxWorkingPaperUrl(format: 'csv' | 'xlsx' | 'pdf' | 'excel', periodKey?: string) {
    const params = new URLSearchParams({ format: format === 'excel' ? 'xlsx' : format });
    if (periodKey) params.set('periodKey', periodKey);
    return `/api/individual/tax/income/working-paper?${params.toString()}`;
  },

  async getTaxCompliance(taxYear?: number) {
    return unwrap(await api.get('/individual/tax/compliance', { params: taxYear ? { taxYear } : undefined }));
  },

  async getTaxComplianceYear(taxYear: number) {
    return unwrap(await api.get(`/individual/tax/compliance/${taxYear}`));
  },

  async getTaxComplianceReadiness(taxYear: number) {
    return unwrap(await api.get(`/individual/tax/compliance/${taxYear}/readiness`));
  },

  async getTaxComplianceReviews(taxYear: number) {
    return unwrap(await api.get(`/individual/tax/compliance/${taxYear}/reviews`));
  },

  async getTaxComplianceEvidence(taxYear: number) {
    return unwrap(await api.get(`/individual/tax/compliance/${taxYear}/evidence`));
  },

  async getTaxComplianceReconciliation(taxYear: number) {
    return unwrap(await api.get(`/individual/tax/compliance/${taxYear}/reconciliation`));
  },

  async getTaxComplianceChecklist(taxYear: number) {
    return unwrap(await api.get(`/individual/tax/compliance/${taxYear}/checklist`));
  },

  async getTaxCompliancePack(taxYear: number) {
    return unwrap(await api.get(`/individual/tax/compliance/${taxYear}/pack`));
  },

  async getTaxComplianceDrill(taxYear: number, sourceType: string, sourceId: string) {
    return unwrap(await api.get(`/individual/tax/compliance/${taxYear}/drill/${sourceType}/${sourceId}`));
  },

  async generateTaxPack(taxYear: number, supersedeReason?: string) {
    return unwrap(await api.post(`/individual/tax/compliance/${taxYear}/pack/generate`, { supersedeReason }));
  },

  async finalizeTaxPack(taxYear: number) {
    return unwrap(await api.post(`/individual/tax/compliance/${taxYear}/pack/finalize`));
  },

  async attachTaxEvidence(taxYear: number, payload: Record<string, unknown>) {
    return unwrap(await api.post(`/individual/tax/compliance/${taxYear}/evidence`, payload));
  },

  async reviewTaxEvidence(id: string, status: string) {
    return unwrap(await api.post(`/individual/tax/compliance/evidence/${id}/review`, { status }));
  },

  async startTaxComplianceReview(id: string) {
    return unwrap(await api.post(`/individual/tax/compliance/reviews/${id}/review`));
  },

  async resolveTaxComplianceReview(id: string, payload: Record<string, unknown>) {
    return unwrap(await api.post(`/individual/tax/compliance/reviews/${id}/resolve`, payload));
  },

  async waiveTaxComplianceReview(id: string, reason: string) {
    return unwrap(await api.post(`/individual/tax/compliance/reviews/${id}/waive`, { reason }));
  },

  getTaxPackExportUrl(taxYear: number, format: 'csv' | 'xlsx' | 'pdf' | 'excel') {
    const params = new URLSearchParams({ format: format === 'excel' ? 'xlsx' : format });
    return `/api/individual/tax/compliance/${taxYear}/pack/export?${params.toString()}`;
  }
};

export default individualWorkspaceService;
