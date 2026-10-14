import api from '../api';
import { formatCurrency as formatCurrencyUtil } from '../utils/money';
// Prefer Web Crypto API when available; fall back to a simple random string
function generateId(): string {
  try {
    // @ts-ignore
    if (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function') {
      // @ts-ignore
      return (crypto as any).randomUUID();
    }
  } catch {}
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function humanizeAccountError(error: any): string {
  const status = error?.response?.status;
  const backendMsg = error?.response?.data?.message || '';
  const generic = error?.message || 'Request failed';
  if (status === 400 && /insufficient balance/i.test(backendMsg)) {
    return 'Insufficient funds';
  }
  return backendMsg || generic;
}

export interface PropertyAccount {
  _id: string;
  propertyId: string;
  ledgerType?: 'rental' | 'sale';
  propertyName?: string;
  propertyAddress?: string;
  ownerId?: string;
  ownerName?: string;
  transactions: Transaction[];
  passThroughAccounts?: PassThroughAccount[];
  ownerPayouts: OwnerPayout[];
  runningBalance: number;
  totalIncome: number;
  totalExpenses: number;
  totalOwnerPayouts: number;
  passThroughOutstanding?: number;
  passThroughCollected?: number;
  passThroughPaid?: number;
  netOwnerBalance?: number;
  lastIncomeDate?: Date;
  lastExpenseDate?: Date;
  lastPayoutDate?: Date;
  isActive: boolean;
  lastUpdated: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Transaction {
  _id?: string;
  type: 'income' | 'expense' | 'owner_payout' | 'repair' | 'maintenance' | 'opening_balance' | 'other';
  amount: number;
  date: Date;
  paymentId?: string;
  description: string;
  category?: string;
  transactionCategory?: 'RENT' | 'PASS_THROUGH' | 'MAINTENANCE' | 'OWNER_PAYOUT' | 'COMMISSION' | 'OPENING_BALANCE' | 'DEPOSIT' | 'OTHER';
  accountingTreatment?: 'PROPERTY_INCOME' | 'PROPERTY_EXPENSE' | 'PASS_THROUGH' | 'OWNER_WITHDRAWAL' | 'SYSTEM';
  chargeTypeCode?: string;
  chargeTypeId?: string;
  passThroughType?: string;
  direction?: 'credit' | 'debit';
  recipientId?: string;
  recipientType?: 'owner' | 'contractor' | 'tenant' | 'other';
  referenceNumber?: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  processedBy?: string;
  notes?: string;
  attachments?: string[];
  createdAt: Date;
  updatedAt: Date;
  runningBalance?: number;
}

export interface PassThroughTransaction {
  _id?: string;
  type: 'collection' | 'payment' | 'adjustment';
  amount: number;
  date: Date;
  paymentId?: string;
  levyPaymentId?: string;
  chargeTypeCode?: string;
  chargeTypeId?: string;
  idempotencyKey?: string;
  description: string;
  referenceNumber?: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  processedBy?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PassThroughAccount {
  type: string;
  label?: string;
  runningBalance: number;
  totalCollected: number;
  totalPaid: number;
  transactions: PassThroughTransaction[];
  lastUpdated?: Date;
}

export interface OwnerPayout {
  _id?: string;
  amount: number;
  date: Date;
  paymentMethod: 'bank_transfer' | 'cash' | 'mobile_money' | 'check';
  referenceNumber: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  processedBy: string;
  recipientId: string;
  recipientName: string;
  recipientBankDetails?: {
    bankName?: string;
    accountNumber?: string;
    accountName?: string;
  };
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExpenseData {
  amount: number;
  date: Date;
  description: string;
  category?: string;
  recipientId?: string;
  recipientType?: 'owner' | 'contractor' | 'tenant' | 'other';
  notes?: string;
}

export interface OpeningBalanceData {
  amount: number;
  direction: 'credit' | 'debit';
  date: Date;
  description?: string;
  notes?: string;
}

export interface PayoutData {
  amount: number;
  paymentMethod: 'bank_transfer' | 'cash' | 'mobile_money' | 'check';
  recipientId: string;
  recipientName: string;
  recipientBankDetails?: {
    bankName?: string;
    accountNumber?: string;
    accountName?: string;
  };
  autoComplete?: boolean;
  notes?: string;
}

export interface TransactionFilters {
  type?: string;
  startDate?: Date;
  endDate?: Date;
  category?: string;
  status?: string;
}

class PropertyAccountService {
  /**
   * Get all property accounts for the company
   */
  async getCompanyPropertyAccounts(): Promise<PropertyAccount[]> {
    try {
      const response = await api.get('/accountants/property-accounts');
      return response.data.data;
    } catch (error) {
      console.error('Error fetching company property accounts:', error);
      throw error;
    }
  }

  /**
   * Get paged property accounts for lightweight listing (summary only)
   */
  async getCompanyPropertyAccountsPaged(params?: { page?: number; limit?: number; search?: string; ledger?: 'rental' | 'sale' }): Promise<{
    items: PropertyAccount[];
    page: number;
    limit: number;
    hasMore: boolean;
    nextPage: number | null;
  }> {
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 24;
    const search = params?.search ?? '';
    const ledger = params?.ledger;
    try {
      const response = await api.get('/accountants/property-accounts', {
        params: {
          summary: 1,
          page,
          limit,
          search: search || undefined,
          ledger: ledger || undefined
        }
      });
      const items: PropertyAccount[] = Array.isArray(response.data?.data) ? response.data.data : [];
      const meta = (response.data?.meta || {}) as { page?: number; limit?: number; hasMore?: boolean; nextPage?: number | null };
      return {
        items,
        page: Number(meta.page ?? page),
        limit: Number(meta.limit ?? limit),
        hasMore: Boolean(meta.hasMore),
        nextPage: (typeof meta.nextPage === 'number') ? meta.nextPage : (items.length === limit ? page + 1 : null)
      };
    } catch (error) {
      console.error('Error fetching paged property accounts:', error);
      throw error;
    }
  }

  /**
   * Get property account by ID
   */
  async getPropertyAccount(propertyId: string, ledger?: 'rental' | 'sale'): Promise<PropertyAccount> {
    try {
      const response = await api.get(`/accountants/property-accounts/${propertyId}`, {
        params: ledger ? { ledger } : undefined
      });
      return response.data.data;
    } catch (error) {
      console.error('Error fetching property account:', error);
      throw error;
    }
  }

  /**
   * Get property transactions with filters
   */
  async getPropertyTransactions(propertyId: string, filters?: TransactionFilters): Promise<Transaction[]> {
    try {
      const params = new URLSearchParams();
      if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            if (value instanceof Date) {
              params.append(key, value.toISOString());
            } else {
              params.append(key, value.toString());
            }
          }
        });
      }

      const response = await api.get(`/accountants/property-accounts/${propertyId}/transactions?${params.toString()}`);
      return response.data.data;
    } catch (error) {
      console.error('Error fetching property transactions:', error);
      throw error;
    }
  }

  /**
   * Add expense to property account
   */
  async addExpense(propertyId: string, expenseData: ExpenseData): Promise<PropertyAccount> {
    try {
      const key = `expense:${generateId()}`;
      const response = await api.post(
        `/accountants/property-accounts/${propertyId}/expense`,
        { ...expenseData },
        { headers: { 'Idempotency-Key': key } }
      );
      return response.data.data;
    } catch (error) {
      console.error('Error adding expense:', error);
      throw new Error(humanizeAccountError(error));
    }
  }

  /**
   * Add opening balance adjustment to property account
   */
  async addOpeningBalanceAdjustment(
    propertyId: string,
    openingBalanceData: OpeningBalanceData
  ): Promise<PropertyAccount> {
    try {
      const key = `opening-balance:${generateId()}`;
      const response = await api.post(
        `/accountants/property-accounts/${propertyId}/opening-balances`,
        { ...openingBalanceData },
        { headers: { 'Idempotency-Key': key } }
      );
      return response.data.data;
    } catch (error) {
      console.error('Error adding opening balance adjustment:', error);
      throw new Error(humanizeAccountError(error));
    }
  }

  /**
   * Create owner payout
   */
  async createOwnerPayout(
    propertyId: string,
    payoutData: PayoutData
  ): Promise<{ account: PropertyAccount; payout: OwnerPayout }> {
    try {
      const key = `payout:${generateId()}`;
      const response = await api.post(
        `/accountants/property-accounts/${propertyId}/payout`,
        { ...payoutData },
        { headers: { 'Idempotency-Key': key } }
      );
      return response.data.data;
    } catch (error) {
      console.error('Error creating owner payout:', error);
      throw new Error(humanizeAccountError(error));
    }
  }

  /**
   * Update payout status
   */
  async updatePayoutStatus(propertyId: string, payoutId: string, status: 'pending' | 'completed' | 'failed' | 'cancelled'): Promise<PropertyAccount> {
    try {
      const response = await api.put(`/accountants/property-accounts/${propertyId}/payout/${payoutId}/status`, { status });
      return response.data.data;
    } catch (error) {
      console.error('Error updating payout status:', error);
      throw new Error(humanizeAccountError(error));
    }
  }

  /**
   * Get payout history
   */
  async getPayoutHistory(propertyId: string): Promise<OwnerPayout[]> {
    try {
      const response = await api.get(`/accountants/property-accounts/${propertyId}/payouts`);
      return response.data.data;
    } catch (error) {
      console.error('Error fetching payout history:', error);
      throw error;
    }
  }

  /**
   * Explicit historical backfill. Requires confirm=true and a non-empty reason.
   * Not a reconciliation action.
   */
  async syncPropertyAccounts(opts: { confirm: true; reason: string }): Promise<void> {
    try {
      await api.post('/accountants/property-accounts/sync', {
        confirm: opts.confirm,
        reason: opts.reason
      });
    } catch (error) {
      console.error('Error syncing property accounts:', error);
      throw error;
    }
  }

  /**
   * Get payment request document
   */
  async getPaymentRequestDocument(propertyId: string, payoutId: string): Promise<any> {
    try {
      const response = await api.get(`/accountants/property-accounts/${propertyId}/payout/${payoutId}/payment-request`);
      return response.data.data;
    } catch (error) {
      console.error('Error fetching payment request document:', error);
      throw error;
    }
  }

  /**
   * Get acknowledgement document
   */
  async getAcknowledgementDocument(propertyId: string, payoutId: string): Promise<any> {
    try {
      const response = await api.get(`/accountants/property-accounts/${propertyId}/payout/${payoutId}/acknowledgement`);
      return response.data.data;
    } catch (error) {
      console.error('Error fetching acknowledgement document:', error);
      throw error;
    }
  }

  /**
   * Merge legacy and new ledgers for a specific property into a single active ledger.
   * Explicit maintenance: requires confirm=true and a non-empty reason.
   */
  async mergeDuplicatesForProperty(
    propertyId: string,
    opts: { confirm: true; reason: string }
  ): Promise<{ merged: boolean; reconciled: any }> {
    try {
      const response = await api.post(`/accountants/property-accounts/${propertyId}/merge-duplicates`, {
        confirm: opts.confirm,
        reason: opts.reason
      });
      return response.data?.data || { merged: false, reconciled: null };
    } catch (error) {
      console.error('Error merging property ledgers:', error);
      throw error;
    }
  }

  /**
   * Calculate running balance for transactions
   */
  calculateRunningBalance(transactions: Transaction[]): { transactions: Transaction[]; finalBalance: number } {
    let balanceCents = 0;
    // Sort by date ascending for deterministic running balance
    const sortedTransactions = [...transactions].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const transactionsWithBalance = sortedTransactions.map(transaction => {
      const amtCents = Math.round((Number(transaction.amount || 0)) * 100);
      const isCompleted = transaction.status === 'completed';

      // Only completed entries affect balance (aligns with backend ledger totals)
      if (isCompleted) {
        if (transaction.type === 'income') {
          balanceCents += amtCents;
        } else if (transaction.type === 'opening_balance') {
          balanceCents += transaction.direction === 'debit' ? -amtCents : amtCents;
        } else {
          balanceCents -= amtCents;
        }
      }

      return {
        ...transaction,
        runningBalance: Number((balanceCents / 100).toFixed(2))
      };
    });

    return {
      transactions: transactionsWithBalance,
      finalBalance: Number((balanceCents / 100).toFixed(2))
    };
  }

  /**
   * Format currency
   */
  formatCurrency(amount: number, currency: string = 'USD'): string {
    return formatCurrencyUtil(amount, (currency as any) || 'USD');
  }

  /**
   * Get transaction type label
   */
  getTransactionTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      income: 'Income',
      expense: 'Expense',
      owner_payout: 'Owner Payout',
      repair: 'Repair',
      maintenance: 'Maintenance',
      opening_balance: 'Opening Balance',
      other: 'Other'
    };
    return labels[type] || type;
  }

  /**
   * Get status color
   */
  getStatusColor(status: string): string {
    const colors: Record<string, string> = {
      pending: '#ff9800',
      completed: '#4caf50',
      failed: '#f44336',
      cancelled: '#9e9e9e'
    };
    return colors[status] || '#000000';
  }

  /**
   * Get payment method label
   */
  getPaymentMethodLabel(method: string): string {
    const labels: Record<string, string> = {
      bank_transfer: 'Bank Transfer',
      cash: 'Cash',
      mobile_money: 'Mobile Money',
      check: 'Check'
    };
    return labels[method] || method;
  }
}

export const propertyAccountService = new PropertyAccountService();
export default propertyAccountService; 