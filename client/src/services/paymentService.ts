import api from '../api/axios';
import publicApi from '../api/publicApi';
import { Payment, PaymentFormData, PaymentFilter } from '../types/payment';
import { DatabaseService } from './databaseService';

class PaymentService {
  private db: DatabaseService;
  private static instance: PaymentService;

  private constructor() {
    this.db = DatabaseService.getInstance();
  }

  public static getInstance(): PaymentService {
    if (!PaymentService.instance) {
      PaymentService.instance = new PaymentService();
    }
    return PaymentService.instance;
  }

  private async handleAuthError(error: any): Promise<never> {
    console.error('Authentication error:', error);
    if (error.response?.status === 401) {
      throw new Error('Authentication required. Please log in to continue.');
    }
    throw new Error('An unexpected error occurred. Please try again later.');
  }

  async getPayments(filters?: PaymentFilter): Promise<Payment[]> {
    try {
      const response = await this.db.executeWithRetry(async () => {
        return await api.get('/payments/company', { 
          params: filters,
          validateStatus: (status) => status < 500
        });
      });
      
      if (response.status === 401) {
        return this.handleAuthError(response);
      }
      
      if (!response.data || !Array.isArray(response.data)) {
        throw new Error('Invalid response format');
      }
      
      return response.data;
    } catch (error: any) {
      return this.handleAuthError(error);
    }
  }

  // Server-side pagination + filtering over full dataset
  async getPaymentsPage(filters?: PaymentFilter & { page?: number; limit?: number; paginate?: boolean }): Promise<{ items: Payment[]; total: number; page: number; pages: number }> {
    try {
      const response = await this.db.executeWithRetry(async () => {
        const params: any = { ...(filters || {}), paginate: 'true' };
        return await api.get('/payments/company', {
          params,
          validateStatus: (status) => status < 500,
          timeout: 30000
        });
      }, { maxRetries: 0 });

      if (response.status === 401) {
        return this.handleAuthError(response);
      }

      const data = response.data;
      if (!data || typeof data !== 'object' || !Array.isArray(data.items)) {
        throw new Error('Invalid paginated response format');
      }
      return {
        items: data.items as Payment[],
        total: Number(data.total) || 0,
        page: Number(data.page) || 1,
        pages: Number(data.pages) || 1,
      };
    } catch (error: any) {
      return this.handleAuthError(error);
    }
  }

  async createPayment(paymentData: PaymentFormData): Promise<Payment> {
    try {
      return await this.db.executeWithRetry(async () => {
        const response = await api.post('/payments', paymentData);
        return response.data;
      });
    } catch (error: any) {
      return this.handleAuthError(error);
    }
  }

  // Accountant-specific payment creation
  async createPaymentAccountant(paymentData: PaymentFormData): Promise<{ status: string; data: Payment; message: string }> {
    try {
      return await this.db.executeWithRetry(async () => {
        const response = await api.post('/accountants/payments', paymentData);
        return response.data;
      });
    } catch (error: any) {
      return this.handleAuthError(error);
    }
  }

  // Sales-specific payment creation (separate endpoint)
  async createSalesPaymentAccountant(paymentData: PaymentFormData): Promise<{ status?: string; payment?: Payment; data?: Payment; message?: string }> {
    try {
      return await this.db.executeWithRetry(async () => {
        const response = await api.post('/accountants/sales-payments', paymentData);
        return response.data;
      });
    } catch (error: any) {
      return this.handleAuthError(error);
    }
  }

  async getSalesPayments(filters?: PaymentFilter): Promise<Payment[]> {
    try {
      const response = await this.db.executeWithRetry(async () => {
        return await api.get('/accountants/sales-payments', { params: filters });
      });
      const raw = response.data as any;
      return Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
    } catch (error: any) {
      return this.handleAuthError(error);
    }
  }

  // Finalize a provisional payment
  async finalizeProvisionalPayment(id: string, payload: {
    propertyId: string;
    tenantId: string;
    ownerId?: string;
    relationshipType?: 'management' | 'introduction';
    overrideCommissionPercent?: number;
  }): Promise<{ message: string; payment: Payment }> {
    try {
      return await this.db.executeWithRetry(async () => {
        const response = await api.post(`/accountants/payments/${id}/finalize`, payload);
        return response.data;
      });
    } catch (error: any) {
      return this.handleAuthError(error);
    }
  }

  // Accountant-specific payment fetching
  async getPaymentsAccountant(): Promise<Payment[]> {
    try {
      return await this.db.executeWithRetry(async () => {
        const response = await api.get('/accountants/payments');
        return response.data;
      });
    } catch (error: any) {
      return this.handleAuthError(error);
    }
  }

  async getPayment(id: string): Promise<Payment> {
    try {
      return await this.db.executeWithRetry(async () => {
        const response = await api.get(`/payments/${id}`);
        return response.data;
      });
    } catch (error: any) {
      return this.handleAuthError(error);
    }
  }

  async updatePayment(id: string, paymentData: PaymentFormData): Promise<Payment> {
    try {
      return await this.db.executeWithRetry(async () => {
        const response = await api.put(`/payments/${id}`, paymentData);
        return response.data;
      });
    } catch (error: any) {
      return this.handleAuthError(error);
    }
  }

  async deletePayment(id: string): Promise<void> {
    try {
      await this.db.executeWithRetry(async () => {
        await api.delete(`/payments/${id}`);
      });
    } catch (error: any) {
      return this.handleAuthError(error);
    }
  }

  async downloadReceipt(id: string): Promise<Blob> {
    try {
      return await this.db.executeWithRetry(async () => {
        const response = await api.get(`/payments/${id}/receipt`, {
          responseType: 'blob'
        });
        return response.data;
      });
    } catch (error: any) {
      return this.handleAuthError(error);
    }
  }

  async getExchangeRate(fromCurrency: string, toCurrency: string): Promise<number> {
    try {
      return await this.db.executeWithRetry(async () => {
        const response = await api.get('/exchange-rates', {
          params: { from: fromCurrency, to: toCurrency }
        });
        return response.data.rate;
      });
    } catch (error: any) {
      return this.handleAuthError(error);
    }
  }

  async getAgents(role: string = 'agent'): Promise<any[]> {
    try {
      return await this.db.executeWithRetry(async () => {
        const response = await api.get('/users/agents', { params: { role } });
        return response.data;
      });
    } catch (error: any) {
      return this.handleAuthError(error);
    }
  }

  // Public method for fetching all payments using public API
  async getAllPublic(companyId?: string, filters?: any): Promise<{ data: Payment[] }> {
    try {
      const config: any = {};
      if (companyId || filters) {
        config.params = { ...filters };
        if (companyId) {
          config.params.companyId = companyId;
        }
      }
      
      const response = await publicApi.get('/payments/public', config);
      return response.data;
    } catch (error: any) {
      console.error('Error fetching payments (public):', error);
      // Don't throw auth errors for public endpoints, just return empty data
      if (error.response?.status === 401) {
        console.warn('Authentication required for public payments endpoint');
        return { data: [] };
      }
      throw new Error('Failed to fetch payments');
    }
  }

  // Public method for fetching a single payment by ID
  async getPaymentByIdPublic(id: string, companyId?: string): Promise<Payment> {
    try {
      const config: any = {};
      if (companyId) {
        config.params = { companyId };
      }
      
      const response = await publicApi.get(`/payments/public/${id}`, config);
      return response.data.data;
    } catch (error: any) {
      console.error('Error fetching payment by ID (public):', error);
      // Don't throw auth errors for public endpoints
      if (error.response?.status === 401) {
        console.warn('Authentication required for public payment endpoint');
        throw new Error('Authentication required');
      }
      throw new Error('Failed to fetch payment details');
    }
  }

  // Public method for creating payments using public API
  async createPaymentPublic(paymentData: any): Promise<Payment> {
    try {
      const response = await publicApi.post('/payments/public', paymentData);
      return response.data.data;
    } catch (error: any) {
      console.error('Error creating payment (public):', error);
      throw new Error(error.response?.data?.message || 'Failed to create payment');
    }
  }

  // Public method for getting agents using public API
  async getAgentsPublic(companyId?: string, role: string = 'agent'): Promise<any[]> {
    try {
      const config: any = {};
      if (companyId) {
        config.params = { companyId };
      }
      if (!config.params) config.params = {};
      config.params.role = role;
      
      const response = await publicApi.get('/users/public/agents', config);
      return response.data.data || [];
    } catch (error: any) {
      console.error('Error fetching agents (public):', error);
      // Don't throw auth errors for public endpoints, just return empty data
      if (error.response?.status === 401) {
        console.warn('Authentication required for public agents endpoint');
        return [];
      }
      throw new Error('Failed to fetch agents');
    }
  }

  // Public method for getting payment receipt for printing
  async getPaymentReceipt(id: string, companyId?: string): Promise<any> {
    try {
      const config: any = {};
      const defaultCompanyId = companyId || (typeof window !== 'undefined' ? localStorage.getItem('companyId') || undefined : undefined);
      if (defaultCompanyId) {
        config.params = { companyId: defaultCompanyId };
      }
      
      // Try rental/standard payment first; if not found, try levy receipt endpoint
      try {
        const response = await publicApi.get(`/payments/public/${id}/receipt`, config);
        return response.data.data;
      } catch (err: any) {
        // Fallback to levy route
        const levyResp = await publicApi.get(`/levy-payments/public/${id}/receipt`, config);
        return levyResp.data.data;
      }
    } catch (error: any) {
      console.error('Error fetching payment receipt:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch receipt');
    }
  }

  // Public method for downloading payment receipt as blob (no authentication required)
  async downloadReceiptPublic(id: string, companyId?: string): Promise<Blob> {
    try {
      const config: any = {
        responseType: 'blob'
      };
      const defaultCompanyId = companyId || (typeof window !== 'undefined' ? localStorage.getItem('companyId') || undefined : undefined);
      if (defaultCompanyId) {
        config.params = { companyId: defaultCompanyId };
      }
      try {
        const response = await publicApi.get(`/payments/public/${id}/receipt/download`, config);
        return response.data;
      } catch (err: any) {
        const levyResp = await publicApi.get(`/levy-payments/public/${id}/receipt/download`, config);
        return levyResp.data;
      }
    } catch (error: any) {
      console.error('Error downloading payment receipt (public):', error);
      throw new Error(error.response?.data?.message || 'Failed to download receipt');
    }
  }

  // Property Account: Get transactions (income/expenditure)
  async getPropertyTransactions(propertyId: string, type: 'income' | 'expenditure') {
    const response = await api.get(`/api/property-accounts/${propertyId}/transactions`, { params: { type } });
    return response.data;
  }

  // Property Account: Create payment (expenditure)
  async createPropertyPayment(propertyId: string, paymentData: any) {
    const response = await api.post(`/api/property-accounts/${propertyId}/pay`, paymentData);
    return response.data;
  }

  // Property Account: Get payment request document
  async getPaymentRequestDocument(propertyId: string, paymentId: string) {
    const response = await api.get(`/api/property-accounts/${propertyId}/payment-request/${paymentId}`);
    return response.data;
  }

  // Property Account: Get acknowledgement document
  async getAcknowledgementDocument(propertyId: string, paymentId: string) {
    const response = await api.get(`/api/property-accounts/${propertyId}/acknowledgement/${paymentId}`);
    return response.data;
  }

  // Deposits: get property deposit ledger
  async getPropertyDepositLedger(propertyId: string): Promise<{ entries: any[]; balance: number }> {
    const response = await api.get(`/accountants/property-accounts/${propertyId}/deposits`);
    return response.data.data;
  }

  // Deposits: get property deposit summary (held amount)
  async getPropertyDepositSummary(propertyId: string): Promise<{ totalPaid: number; totalPayout: number; held: number }> {
    const response = await api.get(`/accountants/property-accounts/${propertyId}/deposits/summary`);
    return response.data.data;
  }

  // Deposits: create payout
  async createPropertyDepositPayout(propertyId: string, data: { amount: number; paymentMethod?: string; notes?: string; tenantId?: string; recipientName?: string }) {
    const response = await api.post(`/accountants/property-accounts/${propertyId}/deposits/payout`, data);
    return response.data.data;
  }

  async createLevyPayment(paymentData: any): Promise<any> {
    try {
      const response = await api.post('/levy-payments', paymentData);
      return response.data;
    } catch (error: any) {
      return this.handleAuthError(error);
    }
  }

  async createMunicipalPayment(paymentData: any): Promise<any> {
    try {
      const response = await api.post('/municipal-payments', paymentData);
      return response.data;
    } catch (error: any) {
      return this.handleAuthError(error);
    }
  }

  async getLevyPayments(companyId?: string): Promise<any[]> {
    try {
      // Use publicApi instead of api to avoid sending credentials
      const config: any = {};
      if (companyId) {
        config.params = { companyId };
      }
      const response = await publicApi.get('/levy-payments', config);
      return response.data;
    } catch (error: any) {
      return this.handleAuthError(error);
    }
  }
}

export default PaymentService.getInstance(); 