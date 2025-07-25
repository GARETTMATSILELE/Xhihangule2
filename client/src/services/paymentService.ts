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

  async getAgents(): Promise<any[]> {
    try {
      return await this.db.executeWithRetry(async () => {
        const response = await api.get('/users', {
          params: { role: 'agent' }
        });
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
  async getAgentsPublic(companyId?: string): Promise<any[]> {
    try {
      const config: any = {};
      if (companyId) {
        config.params = { companyId };
      }
      
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
      if (companyId) {
        config.params = { companyId };
      }
      
      const response = await publicApi.get(`/payments/public/${id}/receipt`, config);
      return response.data.data;
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
      if (companyId) {
        config.params = { companyId };
      }
      
      const response = await publicApi.get(`/payments/public/${id}/receipt/download`, config);
      return response.data;
    } catch (error: any) {
      console.error('Error downloading payment receipt (public):', error);
      throw new Error(error.response?.data?.message || 'Failed to download receipt');
    }
  }

  // Property Account: Get transactions (income/expenditure)
  async getPropertyTransactions(propertyId: string, type: 'income' | 'expenditure') {
    const response = await api.get(`/property-accounts/${propertyId}/transactions`, { params: { type } });
    return response.data;
  }

  // Property Account: Create payment (expenditure)
  async createPropertyPayment(propertyId: string, paymentData: any) {
    const response = await api.post(`/property-accounts/${propertyId}/pay`, paymentData);
    return response.data;
  }

  // Property Account: Get payment request document
  async getPaymentRequestDocument(propertyId: string, paymentId: string) {
    const response = await api.get(`/property-accounts/${propertyId}/payment-request/${paymentId}`);
    return response.data;
  }

  // Property Account: Get acknowledgement document
  async getAcknowledgementDocument(propertyId: string, paymentId: string) {
    const response = await api.get(`/property-accounts/${propertyId}/acknowledgement/${paymentId}`);
    return response.data;
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

  async getLevyPayments(): Promise<any[]> {
    try {
      // Use publicApi instead of api to avoid sending credentials
      const response = await publicApi.get('/levy-payments');
      return response.data;
    } catch (error: any) {
      return this.handleAuthError(error);
    }
  }
}

export default PaymentService.getInstance(); 