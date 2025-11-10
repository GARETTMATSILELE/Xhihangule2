import api from '../api';

export interface CommissionData {
  _id: string;
  paymentDate: Date;
  amount: number;
  commissionDetails: {
    totalCommission: number;
    preaFee: number;
    agentShare: number;
    agencyShare: number;
    ownerAmount: number;
  };
  propertyId: {
    _id: string;
    address: string;
    propertyName?: string;
  };
  tenantId: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  referenceNumber: string;
  paymentType: 'introduction' | 'rental';
}

export interface AgentAccount {
  _id: string;
  agentId: string;
  agentName?: string;
  agentEmail?: string;
  transactions: Transaction[];
  agentPayouts: AgentPayout[];
  runningBalance: number;
  totalCommissions: number;
  totalPayouts: number;
  totalPenalties: number;
  lastCommissionDate?: Date;
  lastPayoutDate?: Date;
  lastPenaltyDate?: Date;
  isActive: boolean;
  lastUpdated: Date;
  createdAt: Date;
  updatedAt: Date;
  commissionData?: CommissionData[];
}

export interface Transaction {
  _id?: string;
  type: 'commission' | 'payout' | 'penalty' | 'adjustment';
  amount: number;
  date: Date;
  paymentId?: string;
  description: string;
  reference?: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  runningBalance?: number;
  notes?: string;
  category?: string;
}

export interface AgentPayout {
  _id?: string;
  amount: number;
  date: Date;
  paymentMethod: 'bank_transfer' | 'cash' | 'mobile_money' | 'check';
  recipientId: string;
  recipientName: string;
  referenceNumber: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  notes?: string;
  processedBy?: string;
  processedAt?: Date;
}

export interface PenaltyData {
  amount: number;
  date: Date;
  description: string;
  reference?: string;
  notes?: string;
  category?: string;
}

export interface PayoutData {
  amount: number;
  paymentMethod: 'bank_transfer' | 'cash' | 'mobile_money' | 'check';
  recipientId: string;
  recipientName: string;
  notes?: string;
}

class AgentAccountService {
  /**
   * Get all agent accounts for the company
   */
  async getCompanyAgentAccounts(): Promise<AgentAccount[]> {
    try {
      const response = await api.get('/accountants/agent-accounts');
      return response.data.data;
    } catch (error) {
      console.error('Error fetching company agent accounts:', error);
      throw error;
    }
  }

  /**
   * Get agent account by ID
   */
  async getAgentAccount(agentId: string): Promise<AgentAccount> {
    try {
      console.log('Fetching agent account for ID:', agentId);
      const response = await api.get(`/accountants/agent-accounts/${agentId}`);
      console.log('Agent account response:', {
        success: response.data.success,
        hasData: !!response.data.data,
        commissionDataCount: response.data.data?.commissionData?.length || 0
      });
      return response.data.data;
    } catch (error) {
      console.error('Error fetching agent account:', error);
      throw error;
    }
  }

  /**
   * Get current logged-in agent limited account summary
   */
  async getMyAccountSummary(): Promise<{ runningBalance: number; totalCommissions: number; totalPayouts: number; totalPenalties: number; agentId: string; agentName?: string }>
  {
    try {
      const response = await api.get('/accountants/agents/me/account');
      return response.data.data;
    } catch (error) {
      console.error('Error fetching my agent account summary:', error);
      throw error;
    }
  }

  /**
   * Add penalty to agent account
   */
  async addPenalty(agentId: string, penaltyData: PenaltyData): Promise<AgentAccount> {
    try {
      const response = await api.post(`/accountants/agent-accounts/${agentId}/penalty`, penaltyData);
      return response.data.data;
    } catch (error) {
      console.error('Error adding penalty:', error);
      throw error;
    }
  }

  /**
   * Create agent payout
   */
  async createAgentPayout(agentId: string, payoutData: PayoutData): Promise<{ account: AgentAccount; payout: AgentPayout }> {
    try {
      const response = await api.post(`/accountants/agent-accounts/${agentId}/payout`, payoutData);
      return response.data.data;
    } catch (error) {
      console.error('Error creating agent payout:', error);
      throw error;
    }
  }

  /**
   * Update payout status
   */
  async updatePayoutStatus(agentId: string, payoutId: string, status: 'completed' | 'failed' | 'cancelled'): Promise<AgentAccount> {
    try {
      const response = await api.put(`/accountants/agent-accounts/${agentId}/payout/${payoutId}/status`, { status });
      return response.data.data;
    } catch (error) {
      console.error('Error updating payout status:', error);
      throw error;
    }
  }

  /**
   * Sync agent accounts from payments
   */
  async syncAgentAccounts(): Promise<void> {
    try {
      await api.post('/accountants/agent-accounts/sync');
    } catch (error) {
      console.error('Error syncing agent accounts:', error);
      throw error;
    }
  }

  /**
   * Sync commission transactions for a specific agent
   */
  async syncAgentCommissions(agentId: string): Promise<void> {
    try {
      await api.post(`/accountants/agent-accounts/${agentId}/sync-commissions`);
    } catch (error) {
      console.error('Error syncing agent commissions:', error);
      throw error;
    }
  }

  /**
   * Get acknowledgement document
   */
  async getAcknowledgementDocument(agentId: string, payoutId: string): Promise<any> {
    try {
      const response = await api.get(`/accountants/agent-accounts/${agentId}/payout/${payoutId}/acknowledgement`);
      return response.data.data;
    } catch (error) {
      console.error('Error getting acknowledgement document:', error);
      throw error;
    }
  }

  /**
   * Format currency
   */
  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  /**
   * Get transaction type label
   */
  getTransactionTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      commission: 'Commission',
      payout: 'Payout',
      penalty: 'Penalty',
      adjustment: 'Adjustment'
    };
    return labels[type] || type;
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

  /**
   * Calculate running balance from transactions
   */
  calculateRunningBalance(transactions: Transaction[]): { transactions: Transaction[]; finalBalance: number } {
    let balanceCents = 0;
    const sortedTransactions = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    const updatedTransactions = sortedTransactions.map(transaction => {
      const amtCents = Math.round((transaction.amount || 0) * 100);
      const isCompleted = transaction.status === 'completed';
      if (transaction.type === 'commission' && isCompleted) {
        balanceCents += amtCents;
      } else if (transaction.type === 'payout' && isCompleted) {
        balanceCents -= amtCents;
      } else if (transaction.type === 'penalty' && isCompleted) {
        balanceCents -= amtCents;
      }
      return { ...transaction, runningBalance: Number((balanceCents / 100).toFixed(2)) };
    });
    
    return { transactions: updatedTransactions, finalBalance: Number((balanceCents / 100).toFixed(2)) };
  }
}

export const agentAccountService = new AgentAccountService();
