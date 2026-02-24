import api from '../api/axios';

export interface DashboardSummary {
  totalRevenue: number;
  totalExpenses: number;
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

const accountingService = {
  async getDashboardSummary(): Promise<DashboardSummary> {
    const res = await api.get('/accounting/dashboard-summary');
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
  }
};

export default accountingService;
