import api from '../api/axios';

export interface DashboardSummary {
  totalRevenue: number;
  totalExpenses: number;
  expenses?: number;
  invoices?: number;
  outstandingRentals?: number;
  outstandingLevies?: number;
  passThroughCollected?: number;
  passThroughPaid?: number;
  passThroughOutstanding?: number;
  passThroughByType?: Record<string, PassThroughBalanceRow>;
  netProfit: number;
  vatPayable: number;
  commissionLiability: number;
  cashBalance: number;
  unreconciledBankTransactions: number;
  vatDuePeriods: number;
  pendingExpenses: number;
  unpaidCommissions: number;
  lastUpdated: string;
}

export interface PassThroughBalanceRow {
  label: string;
  collected: number;
  paid: number;
  outstanding: number;
}

export interface OutstandingTenantBreakdown {
  tenantId: string;
  tenantName: string;
  labels: string[];
}

export interface OutstandingPropertyBreakdown {
  propertyId: string;
  propertyName: string;
  propertyAddress: string;
  totalOwedMonths: number;
  totalAmount: number;
  tenants: OutstandingTenantBreakdown[];
}

export interface DashboardOutstandingBreakdown {
  expenses: number;
  invoices: number;
  outstandingRentals: number;
  outstandingLevies: number;
  passThroughCollected?: number;
  passThroughPaid?: number;
  passThroughOutstanding?: number;
  passThroughByType?: Record<string, PassThroughBalanceRow>;
  rentals: OutstandingPropertyBreakdown[];
  levies: OutstandingPropertyBreakdown[];
  lastUpdated: string;
}

export interface TrendPoint {
  month: string;
  total: number;
}

export interface VatStatusPoint {
  filingPeriod: string;
  vatCollected: number;
  vatPaid: number;
  vatPayable: number;
  status: 'pending' | 'submitted';
}

export interface LedgerRow {
  _id: string;
  createdAt: string;
  debit: number;
  credit: number;
  runningBalanceSnapshot: number;
  accountCode: string;
  accountName: string;
  reference: string;
  description?: string;
  sourceModule: string;
  transactionDate: string;
}

export interface BankReconciliationRow {
  _id: string;
  bankAccountId: { _id: string; name?: string; accountNumber?: string } | string;
  amount: number;
  reference: string;
  matched: boolean;
  matchedTransactionId?: string;
  transactionDate: string;
}

export interface BankMatchSuggestion {
  journalEntryId: string;
  reference: string;
  description?: string;
  transactionDate: string;
  amount: number;
  score: number;
  reasons: string[];
}

export interface TaxRateRecord {
  _id: string;
  companyId: string;
  taxType: 'VAT' | 'CGT' | 'CGWT';
  rate: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
  isActive: boolean;
}

export interface TaxComplianceDashboard {
  vatPayable: number;
  vatPaid: number;
  vatOutstanding: number;
  cgtCalculated?: number;
  cgtOutstanding?: number;
  cgwtWithheld: number;
  cgwtRemitted: number;
  cgwtOutstanding: number;
  trustTaxOutstanding: number;
  openReviews: number;
  byType: Record<string, { calculated: number; withheld: number; payable: number; paid: number; outstanding: number }>;
  categories?: {
    VAT: { periodsRequireReview: number; periodsUnpaid: number; outstanding: number };
    CGT: { historicalCalculationsRequireReview: number; outstanding: number };
    CGWT: { missingApplicability: number; outstanding: number };
    TRUST: { reconciliationDifferences: number; scope: string };
    FISCALISATION: { invoicesNotFiscalised: number };
    HISTORICAL_DATA: { openReviews: number };
  };
  allClear?: boolean;
  complianceLabel?: string;
  vatRateReview?: { required: boolean; currentRate: number | null; expectedRate: number; message: string } | null;
  modes: Record<string, string>;
  labels: Record<string, string>;
  paye: { status: string; note: string };
  corporateTax: { status: string; note: string };
  companyAccountVsGl?: string;
  trust?: {
    trustBank: number;
    ownerPayable: number;
    sellerPayable: number;
    zimraWithholding: number;
    tenantDeposits: number;
    levyPayable?: number;
    clientLedgers: number;
    difference: number;
    status: string;
    scope?: string;
    includedLedgers?: string[];
    excludedClientMoney?: string[];
    note?: string;
    categories?: Array<{ category: string; gl?: string; inScope: boolean; note: string }>;
  };
}

export interface VatOnCommissionSummary {
  startDate: string;
  endDate: string;
  vatCollected: number;
  transactions: number;
  properties: number;
}

export interface AccountingIntegritySummary {
  totalChecked: number;
  complete: number;
  incomplete: number;
  mismatched: number;
  orphaned: number;
  exceptions: number;
  orphanScanWindowHours?: number;
}

export interface AccountingIntegrityRow {
  id: string;
  date?: string;
  paymentReference: string;
  paymentId: string;
  property: string;
  tenant: string;
  currency: string;
  issue: string;
  component: string;
  expected: string | number;
  actual: string | number;
  difference: string | number;
  status: 'MISSING' | 'MISMATCHED' | 'ORPHANED' | string;
  accountingComplete?: boolean;
  canRepair?: boolean;
  amount?: number;
  companyId?: string;
  missingRecord?: string;
  recommendedReview?: string;
  detectedAt?: string;
  operationId?: string;
  canRetry?: boolean;
}

export interface AccountingIntegrityListParams {
  status?: string;
  component?: string;
  dateFrom?: string;
  dateTo?: string;
  propertyId?: string;
  agentId?: string;
  paymentReference?: string;
  currency?: string;
  page?: number;
  limit?: number;
}

export interface AccountingIntegrityListResult {
  items: AccountingIntegrityRow[];
  total: number;
  page: number;
  limit: number;
}

const accountingService = {
  async getDashboardSummary(): Promise<DashboardSummary> {
    const res = await api.get('/accounting/dashboard-summary');
    return res.data;
  },
  async getDashboardOutstanding(): Promise<DashboardOutstandingBreakdown> {
    const res = await api.get('/accounting/dashboard-outstanding');
    return res.data;
  },
  async getRevenueTrend(months = 12): Promise<TrendPoint[]> {
    const res = await api.get('/accounting/revenue-trend', { params: { months } });
    return res.data?.data || [];
  },
  async getExpenseTrend(months = 12): Promise<TrendPoint[]> {
    const res = await api.get('/accounting/expense-trend', { params: { months } });
    return res.data?.data || [];
  },
  async getVatStatus(): Promise<VatStatusPoint[]> {
    const res = await api.get('/accounting/vat-status');
    return res.data?.data || [];
  },
  async exportVatReport(params?: { filingPeriod?: string; status?: 'pending' | 'submitted'; format?: 'csv' | 'json' }): Promise<Blob | any> {
    const format = params?.format || 'csv';
    const res = await api.get('/accounting/vat-report/export', {
      params,
      responseType: format === 'csv' ? 'blob' : 'json'
    });
    return res.data;
  },
  async getCommissionLiability(): Promise<{ outstandingLiability: number }> {
    const res = await api.get('/accounting/commission-liability');
    return res.data;
  },
  async getLedger(params?: { accountCode?: string; startDate?: string; endDate?: string; limit?: number }): Promise<LedgerRow[]> {
    const res = await api.get('/accounting/ledger', { params });
    return res.data?.data || [];
  },
  async getBankReconciliation(params?: {
    bankAccountId?: string;
    matched?: boolean;
    startDate?: string;
    endDate?: string;
    limit?: number;
  }): Promise<BankReconciliationRow[]> {
    const res = await api.get('/accounting/bank-reconciliation', { params });
    return res.data?.data || [];
  },
  async reconcileBankTransaction(id: string, payload: { matched: boolean; matchedTransactionId?: string }): Promise<any> {
    const res = await api.patch(`/accounting/bank-transactions/${id}/reconcile`, payload);
    return res.data;
  },
  async getBankTransactionSuggestions(id: string): Promise<BankMatchSuggestion[]> {
    const res = await api.get(`/accounting/bank-transactions/${id}/suggestions`);
    return res.data?.data || [];
  },
  async getTaxRates(taxType = 'VAT'): Promise<TaxRateRecord[]> {
    const res = await api.get('/accounting/tax-rates', { params: { taxType } });
    return res.data?.data || [];
  },
  async getCurrentVatRate(date?: string): Promise<{ rate: number; decimalRate: number; source: string; asOf: string; jurisdiction?: string; effectiveFrom?: string; managedBy?: string }> {
    const res = await api.get('/accounting/tax-rates/current', { params: date ? { date } : undefined });
    return res.data?.data;
  },
  async createVatRate(payload: { rate: number; effectiveFrom: string; taxType?: 'VAT' | 'CGT' | 'CGWT' }): Promise<TaxRateRecord> {
    const res = await api.post('/accounting/tax-rates', payload);
    return res.data?.data;
  },
  async getVatOnCommissionSummary(params?: { startDate?: string; endDate?: string }): Promise<VatOnCommissionSummary> {
    const res = await api.get('/accounting/vat-on-commission', { params });
    return res.data?.data;
  },
  async getAccountingIntegritySummary(): Promise<AccountingIntegritySummary> {
    const res = await api.get('/accountants/accounting-integrity/summary');
    return res.data;
  },
  async listAccountingIntegrityInconsistencies(params?: AccountingIntegrityListParams): Promise<AccountingIntegrityListResult> {
    const res = await api.get('/accountants/accounting-integrity/inconsistencies', { params });
    return res.data;
  },
  async getPaymentAccountingReconciliation(paymentId: string): Promise<any> {
    const res = await api.get(`/accountants/payments/${paymentId}/accounting`);
    return res.data;
  },
  async getPaymentFinancialTrace(paymentId: string): Promise<any> {
    const res = await api.get(`/accountants/payments/${paymentId}/financial-trace`);
    return res.data;
  },
  async listTrustVisibility(): Promise<{ rows: any[] }> {
    const res = await api.get('/accountants/trust-visibility');
    return res.data;
  },
  async retryLedgerEvent(eventId: string): Promise<{ status: string; retriedExistingEvent: boolean }> {
    const res = await api.post(`/accountants/accounting-integrity/ledger-events/${eventId}/retry`);
    return res.data;
  },
  async repairPaymentAccounting(paymentId: string, payload: { confirm?: boolean; dryRun?: boolean; reason: string }): Promise<any> {
    const res = await api.post(`/accountants/payments/${paymentId}/accounting/repair`, payload);
    return res.data;
  },
  async getTaxComplianceDashboard(): Promise<TaxComplianceDashboard> {
    const res = await api.get('/accounting/tax-compliance');
    return res.data?.data;
  },
  async getTaxObligations(params?: { taxType?: string; period?: string }): Promise<any[]> {
    const res = await api.get('/accounting/tax-obligations', { params });
    return res.data?.data || [];
  },
  async getTaxReconciliation(period?: string): Promise<any> {
    const res = await api.get('/accounting/tax-reconciliation', { params: period ? { period } : undefined });
    return res.data?.data || {};
  },
  async runTaxIntegrity(): Promise<any> {
    const res = await api.post('/accounting/tax-integrity/run', {});
    return res.data?.data;
  },
  async listTaxPayments(): Promise<any[]> {
    const res = await api.get('/accounting/tax-payments');
    return res.data?.data || [];
  },
  async postZimraPayment(payload: {
    amount: number;
    paymentDate: string;
    bankAccountCode?: string;
    zimraReference?: string;
    paymentReference?: string;
    notes?: string;
    allocations: Array<{ taxObligationId: string; amount: number }>;
    unallocatedAmount?: number;
    unallocatedReason?: string;
  }): Promise<{ paymentId: string; journalEntryId?: string; unallocatedAmount?: number }> {
    const res = await api.post('/accounting/tax-payments', payload);
    return res.data?.data;
  },
  async uploadTaxPaymentReceipt(paymentId: string, file: File): Promise<void> {
    const form = new FormData();
    form.append('receipt', file);
    await api.post(`/accounting/tax-payments/${paymentId}/receipt`, form, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  async listVatReturns(): Promise<any[]> {
    const res = await api.get('/accounting/vat-returns');
    return res.data?.data || [];
  },
  async prepareVatReturn(filingPeriod: string): Promise<any> {
    const res = await api.post('/accounting/vat-returns/prepare', { filingPeriod });
    return res.data?.data;
  },
  async patchVatReturn(filingPeriod: string, payload: Record<string, unknown>): Promise<any> {
    const res = await api.patch(`/accounting/vat-returns/${filingPeriod}`, payload);
    return res.data?.data;
  },
  async listTaxReviews(status?: string): Promise<any[]> {
    const res = await api.get('/accounting/tax-reviews', { params: status ? { status } : undefined });
    return res.data?.data || [];
  },
  async resolveTaxReview(id: string, payload: { status?: string; resolution: string }): Promise<any> {
    const res = await api.post(`/accounting/tax-reviews/${id}/resolve`, payload);
    return res.data?.data;
  },
  async getTaxMigrationReport(): Promise<any> {
    const res = await api.get('/accounting/tax-migration-report');
    return res.data?.data;
  },
  async getFinancialControls(): Promise<any> {
    const res = await api.get('/accounting/financial-controls');
    return res.data?.data;
  },
  async getTrialBalance(params?: { from?: string; to?: string }): Promise<any> {
    const res = await api.get('/accounting/trial-balance', { params });
    return res.data?.data;
  },
  async getReconciliationStatus(): Promise<any> {
    const res = await api.get('/accounting/reconciliation-status');
    return res.data?.data;
  },
  async listFinancialExceptions(status?: string): Promise<any[]> {
    const res = await api.get('/accounting/financial-exceptions', { params: status ? { status } : undefined });
    return res.data?.data || [];
  },
  async reviewFinancialException(id: string, payload: { status: string; resolutionReason: string }): Promise<any> {
    const res = await api.post(`/accounting/financial-exceptions/${id}/review`, payload);
    return res.data?.data;
  },
  async runFinancialIntegrity(): Promise<any> {
    const res = await api.post('/accounting/financial-integrity/run', {});
    return res.data?.data;
  },
  async listAccountingPeriods(): Promise<any[]> {
    const res = await api.get('/accounting/periods');
    return res.data?.data || [];
  },
  async createAccountingPeriod(payload: { periodStart: string; periodEnd: string }): Promise<any> {
    const res = await api.post('/accounting/periods', payload);
    return res.data?.data;
  },
  async closeAccountingPeriod(id: string, payload: { reason: string; status?: 'SOFT_CLOSED' | 'CLOSED' }): Promise<any> {
    const res = await api.post(`/accounting/periods/${id}/close`, payload);
    return res.data?.data;
  },
  async reopenAccountingPeriod(id: string, payload: { reason: string }): Promise<any> {
    const res = await api.post(`/accounting/periods/${id}/reopen`, payload);
    return res.data?.data;
  }
};

export default accountingService;
