import api from '../api/axios';

export interface PaymentRequest {
  _id: string;
  companyId: string;
  propertyId: string;
  tenantId?: string;
  ownerId?: string;
  amount: number;
  currency: 'USD' | 'ZWL';
  reason: string;
  requestDate: Date;
  dueDate: Date;
  status: 'pending' | 'paid' | 'rejected';
  notes?: string;
  requestedBy: string;
  requestedByUser?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  processedBy?: string;
  processedDate?: Date;
  payTo: {
    name: string;
    surname: string;
    bankDetails?: string;
    accountNumber?: string;
    address?: string;
  };
  property?: {
    _id: string;
    name: string;
    address: string;
  };
  tenant?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  owner?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  processedByUser?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePaymentRequestData {
  propertyId: string;
  tenantId?: string;
  ownerId?: string;
  amount: number;
  currency: 'USD' | 'ZWL';
  reason: string;
  requestDate?: Date;
  dueDate?: Date;
  notes?: string;
  payTo: {
    name: string;
    surname: string;
    bankDetails?: string;
    accountNumber?: string;
    address?: string;
  };
}

export interface UpdatePaymentRequestStatusData {
  status: 'pending' | 'paid' | 'rejected';
  notes?: string;
}

export interface PaymentRequestStats {
  pending: { count: number; totalAmount: number };
  paid: { count: number; totalAmount: number };
  rejected: { count: number; totalAmount: number };
}

class PaymentRequestService {
  // Create a new payment request
  async createPaymentRequest(data: CreatePaymentRequestData): Promise<PaymentRequest> {
    try {
      const response = await api.post('/payment-requests', data);
      return response.data.data;
    } catch (error: any) {
      console.error('Error creating payment request:', error);
      throw new Error(error.response?.data?.message || 'Failed to create payment request');
    }
  }

  // Get all payment requests for a company
  async getPaymentRequests(params?: {
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: PaymentRequest[]; pagination: any }> {
    try {
      const response = await api.get('/payment-requests', { params });
      return response.data;
    } catch (error: any) {
      console.error('Error fetching payment requests:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch payment requests');
    }
  }

  // Get a single payment request
  async getPaymentRequest(id: string): Promise<PaymentRequest> {
    try {
      const response = await api.get(`/payment-requests/${id}`);
      return response.data.data;
    } catch (error: any) {
      console.error('Error fetching payment request:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch payment request');
    }
  }

  // Update payment request status
  async updatePaymentRequestStatus(id: string, data: UpdatePaymentRequestStatusData): Promise<PaymentRequest> {
    try {
      const response = await api.patch(`/payment-requests/${id}/status`, data);
      return response.data.data;
    } catch (error: any) {
      console.error('Error updating payment request status:', error);
      throw new Error(error.response?.data?.message || 'Failed to update payment request status');
    }
  }

  // Delete a payment request
  async deletePaymentRequest(id: string): Promise<void> {
    try {
      await api.delete(`/payment-requests/${id}`);
    } catch (error: any) {
      console.error('Error deleting payment request:', error);
      throw new Error(error.response?.data?.message || 'Failed to delete payment request');
    }
  }

  // Get payment request statistics
  async getPaymentRequestStats(): Promise<PaymentRequestStats> {
    try {
      const response = await api.get('/payment-requests/stats');
      return response.data.data;
    } catch (error: any) {
      console.error('Error fetching payment request stats:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch payment request statistics');
    }
  }

  // Mark payment request as paid
  async markAsPaid(id: string, notes?: string): Promise<PaymentRequest> {
    return this.updatePaymentRequestStatus(id, { status: 'paid', notes });
  }

  // Mark payment request as rejected
  async markAsRejected(id: string, notes?: string): Promise<PaymentRequest> {
    return this.updatePaymentRequestStatus(id, { status: 'rejected', notes });
  }

  // Mark payment request as pending
  async markAsPending(id: string, notes?: string): Promise<PaymentRequest> {
    return this.updatePaymentRequestStatus(id, { status: 'pending', notes });
  }
}

export const paymentRequestService = new PaymentRequestService();
export default paymentRequestService; 