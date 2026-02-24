import api from '../api/axios';

export type TrustAccountListItem = {
  _id: string;
  propertyId: { _id: string; name?: string; address?: string } | string;
  buyerId?: { _id: string; firstName?: string; lastName?: string } | string;
  sellerId?: { _id: string; firstName?: string; lastName?: string } | string;
  partyNames?: { buyer?: string; seller?: string };
  openingBalance: number;
  runningBalance: number;
  closingBalance: number;
  status: 'OPEN' | 'SETTLED' | 'CLOSED';
  workflowState: string;
  createdAt: string;
};

class TrustAccountService {
  async list(params?: { status?: string; search?: string; page?: number; limit?: number }) {
    const response = await api.get('/accountants/trust-accounts', { params });
    return {
      data: (response.data?.data || []) as TrustAccountListItem[],
      total: Number(response.data?.total || 0),
      page: Number(response.data?.page || 1),
      limit: Number(response.data?.limit || 25)
    };
  }

  async getByProperty(propertyId: string) {
    const response = await api.get(`/accountants/trust-accounts/property/${propertyId}`);
    return response.data?.data;
  }

  async getFullByProperty(propertyId: string) {
    const response = await api.get(`/accountants/trust-accounts/property/${propertyId}/full`);
    return response.data?.data;
  }

  async getLedger(trustAccountId: string, params?: { page?: number; limit?: number }) {
    const response = await api.get(`/accountants/trust-accounts/${trustAccountId}/ledger`, { params });
    return response.data;
  }

  async calculateSettlement(
    trustAccountId: string,
    payload?: {
      salePrice?: number;
      commissionAmount?: number;
      applyVatOnSale?: boolean;
      cgtRate?: number;
      cgtAmount?: number;
      vatSaleRate?: number;
      vatOnCommissionRate?: number;
    }
  ) {
    const response = await api.post(`/accountants/trust-accounts/${trustAccountId}/calculate-settlement`, payload || {});
    return response.data?.data;
  }

  async applyTaxDeductions(trustAccountId: string, payload?: { zimraPaymentReference?: string }) {
    const response = await api.post(`/accountants/trust-accounts/${trustAccountId}/apply-tax-deductions`, payload || {});
    return response.data?.data;
  }

  async transferToSeller(trustAccountId: string, payload: { amount: number; reference?: string }) {
    const response = await api.post(`/accountants/trust-accounts/${trustAccountId}/transfer-to-seller`, payload);
    return response.data?.data;
  }

  async closeTrustAccount(trustAccountId: string, payload?: { lockReason?: string }) {
    const response = await api.post(`/accountants/trust-accounts/${trustAccountId}/close`, payload || {});
    return response.data?.data;
  }

  async transitionWorkflow(trustAccountId: string, toState: string) {
    const response = await api.post(`/accountants/trust-accounts/${trustAccountId}/workflow-transition`, { toState });
    return response.data?.data;
  }

  async downloadReport(
    trustAccountId: string,
    reportType: 'buyer-statement' | 'seller-settlement' | 'trust-reconciliation' | 'tax-zimra' | 'audit-log'
  ) {
    const response = await api.get(`/accountants/trust-accounts/${trustAccountId}/reports/${reportType}`, {
      responseType: 'blob'
    });
    return response.data as Blob;
  }
}

const trustAccountService = new TrustAccountService();
export default trustAccountService;
