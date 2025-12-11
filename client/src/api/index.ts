import api from './axios';
import publicApi from './publicApi';
import axios from 'axios';

// API configuration (kept for backward compatibility; base URL comes from api/publicApi)
const API_BASE_URL = '';

// Create API instance with proper configuration
const apiInstance = api;

// Health check function
const checkHealth = async () => {
  try {
    const response = await apiInstance.get('/health');
    return {
      isHealthy: true,
      data: response.data
    };
  } catch (error) {
    console.error('Health check failed:', error);
    return {
      isHealthy: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

// Helper functions for common operations
export const apiService = {
  // Health check
  checkHealth,

  // Fiscal
  getFiscalHealth: (companyId?: string) => {
    const config: any = {};
    if (companyId) {
      config.params = { companyId };
    }
    return publicApi.get('/fiscal/health', config);
  },

  // Companies
  getCurrentCompany: () => apiInstance.get('/companies/current'),
  createCompany: (data: any) => apiInstance.post('/companies', data),
  updateCompany: (data: any) => apiInstance.put('/companies/current', data),
  uploadCompanyLogo: (companyId: string, formData: FormData) => {
    return apiInstance.post(`/companies/${companyId}/logo`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
  },
  
  // Properties
  getProperties: () => apiInstance.get('/properties'),
  getProperty: (id: string) => apiInstance.get(`/properties/${id}`),
  createProperty: (data: any) => apiInstance.post('/properties', data),
  createPropertySales: (data: any) => apiInstance.post('/properties/sales', data),
  updateProperty: (id: string, data: any) => apiInstance.put(`/properties/${id}`, data),
  deleteProperty: (id: string) => apiInstance.delete(`/properties/${id}`),
  getVacantProperties: () => apiInstance.get('/properties/vacant'),
  getAdminDashboardProperties: () => publicApi.get('/properties/admin-dashboard'),

  // Public Properties (for admin dashboard)
  getPropertiesPublic: (companyId?: string) => {
    const config: any = {};
    if (companyId) {
      config.params = { companyId };
    }
    return publicApi.get('/properties/public', config);
  },
  getPropertyPublic: (id: string, companyId?: string) => {
    const config: any = {};
    if (companyId) {
      config.params = { companyId };
    }
    return publicApi.get(`/properties/public/${id}`, config);
  },

  // Property Owners
  // Billing
  createCheckout: (data: { plan: 'INDIVIDUAL'|'SME'|'ENTERPRISE'; cycle: 'monthly'|'yearly' }) => apiInstance.post('/billing/checkout', data),
  getPaymentStatus: (id: string) => apiInstance.get(`/billing/payments/${id}/status`),
  changeSubscriptionPlan: (data: { plan?: 'INDIVIDUAL'|'SME'|'ENTERPRISE'; cycle?: 'monthly'|'yearly' }) => apiInstance.post('/billing/subscriptions/change-plan', data),
  redeemVoucher: (code: string, pin: string) => apiInstance.post('/billing/vouchers/redeem', { code, pin }),
  getPropertyOwners: () => apiInstance.get('/property-owners'),
  getPropertyOwner: (id: string) => apiInstance.get(`/property-owners/${id}`),
  createPropertyOwner: (data: any) => apiInstance.post('/property-owners', data),
  updatePropertyOwner: (id: string, data: any) => apiInstance.put(`/property-owners/${id}`, data),
  deletePropertyOwner: (id: string) => apiInstance.delete(`/property-owners/${id}`),

  // Tenants
  getTenants: (params?: any) => apiInstance.get('/tenants', { params }),
  getTenant: (id: string) => apiInstance.get(`/tenants/${id}`),
  createTenant: (data: any) => apiInstance.post('/tenants', data),
  updateTenant: (id: string, data: any) => apiInstance.put(`/tenants/${id}`, data),
  deleteTenant: (id: string) => apiInstance.delete(`/tenants/${id}`),

  // Public Tenants (for admin dashboard)
  getTenantsPublic: (companyId?: string) => {
    const config: any = {};
    if (companyId) {
      config.params = { companyId };
    }
    return publicApi.get('/tenants/public', config);
  },
  getTenantPublic: (id: string, companyId?: string) => {
    const config: any = {};
    if (companyId) {
      config.params = { companyId };
    }
    return publicApi.get(`/tenants/public/${id}`, config);
  },

  // Leases
  getLeases: () => apiInstance.get('/leases'),
  getLease: (id: string) => apiInstance.get(`/leases/${id}`),
  createLease: (data: any) => apiInstance.post('/leases', data),
  updateLease: (id: string, data: any) => apiInstance.put(`/leases/${id}`, data),
  deleteLease: (id: string) => apiInstance.delete(`/leases/${id}`),

  // Payments
  getPayments: (params?: any) => apiInstance.get('/payments/company', { params }),
  getPayment: (id: string) => apiInstance.get(`/payments/${id}`),
  createPayment: (data: any) => apiInstance.post('/payments', data),
  updatePayment: (id: string, data: any) => apiInstance.put(`/payments/${id}`, data),
  deletePayment: (id: string) => apiInstance.delete(`/payments/${id}`),

  // Public Payments (for admin dashboard)
  getPaymentsPublic: (companyId?: string) => {
    const config: any = {};
    if (companyId) {
      config.params = { companyId };
    }
    return publicApi.get('/payments/public', config);
  },
  getPaymentPublic: (id: string, companyId?: string) => {
    const config: any = {};
    if (companyId) {
      config.params = { companyId };
    }
    return publicApi.get(`/payments/public/${id}`, config);
  },
  createPaymentPublic: (data: any) => publicApi.post('/payments/public', data),
  getPaymentReceipt: (id: string, companyId?: string) => {
    const config: any = {};
    if (companyId) {
      config.params = { companyId };
    }
    return publicApi.get(`/payments/public/${id}/receipt`, config);
  },

  // Public Users/Agents (for admin dashboard)
  getAgentsPublic: (companyId?: string) => {
    const config: any = {};
    if (companyId) {
      config.params = { companyId };
    }
    return publicApi.get('/users/public/agents', config);
  },

  // Charts
  getChartData: (type: string) => apiInstance.get(`/charts/${type}`),
  // Owner Payments (for owner dashboard) - DEPRECATED: Use getOwnerFinancialData instead
  getOwnerPayments: () => apiInstance.get('/charts/owner/payments'),
  // New method to get owner financial data from accounting database
  getOwnerFinancialData: () => apiInstance.get('/owners/financial-data'),

  // User Management
  getCurrentUser: () => apiInstance.get('/users/me'),
  getUsers: () => apiInstance.get('/users'),
  createUser: (userData: any) => apiInstance.post('/users', userData),
  updateUser: (userData: any) => apiInstance.put('/users/me', userData),
  updateUserPassword: (currentPassword: string, newPassword: string) => 
    apiInstance.put('/users/me/password', { currentPassword, newPassword }),
  updateTwoFactor: (enabled: boolean) => 
    apiInstance.put('/users/me/2fa', { enabled }),

  // User avatar upload
  uploadUserAvatar: (formData: FormData) => {
    return apiInstance.post('/users/me/avatar', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
  },

  // Impersonation
  impersonateUser: (userId: string) => apiInstance.post('/auth/impersonate', { userId }),

  // Role Management
  getRoles: () => apiInstance.get('/roles'),

  // Maintenance endpoints
  getMaintenanceRequests: () => apiInstance.get('/maintenance'),
  getMaintenanceRequest: (id: string) => apiInstance.get(`/maintenance/${id}`),
  createMaintenanceRequest: (data: any) => apiInstance.post('/maintenance', data),
  updateMaintenanceRequest: (id: string, data: any) => apiInstance.put(`/maintenance/${id}`, data),
  deleteMaintenanceRequest: (id: string) => apiInstance.delete(`/maintenance/${id}`),
  getMaintenanceEvents: () => apiInstance.get('/maintenance/events'),
  addMaintenanceComment: (requestId: string, data: any) => apiInstance.post(`/maintenance/${requestId}/comments`, data),
  updateMaintenanceStatus: (requestId: string, status: string) => apiInstance.put(`/maintenance/${requestId}/status`, { status }),
  assignMaintenanceRequest: (requestId: string, vendorId: string) => apiInstance.put(`/maintenance/${requestId}/assign`, { vendorId }),
  requestOwnerApproval: (requestId: string) => apiInstance.post(`/maintenance/${requestId}/request-approval`),
  approveMaintenanceRequest: (requestId: string) => apiInstance.put(`/maintenance/${requestId}/approve`),
  completeMaintenanceRequest: (requestId: string) => apiInstance.put(`/maintenance/${requestId}/complete`),
  rejectMaintenanceRequest: (requestId: string, reason: string) => apiInstance.put(`/maintenance/${requestId}/reject`, { reason }),

  // Public Maintenance endpoints (for maintenance page)
  getMaintenanceRequestsPublic: (companyId?: string) => {
    const config: any = {};
    if (companyId) {
      config.params = { companyId };
    }
    return publicApi.get('/maintenance/public', config);
  },
  getMaintenanceEventsPublic: (companyId?: string) => {
    const config: any = {};
    if (companyId) {
      config.params = { companyId };
    }
    return publicApi.get('/maintenance/public/events', config);
  },

  // Public Owner Maintenance endpoints (for owner dashboard)
  getOwnerMaintenanceRequestsPublic: (userId?: string, companyId?: string) => {
    const config: any = {};
    if (userId) {
      config.params = { userId };
    }
    if (companyId) {
      config.params = { ...config.params, companyId };
    }
    return publicApi.get('/owners/maintenance-requests', config);
  },
  getOwnerMaintenanceRequestPublic: (requestId: string, userId?: string, companyId?: string) => {
    const config: any = {};
    if (userId) {
      config.params = { userId };
    }
    if (companyId) {
      config.params = { ...config.params, companyId };
    }
    return publicApi.get(`/owners/maintenance-requests/${requestId}`, config);
  },
  approveOwnerMaintenanceRequest: (requestId: string, userId?: string, companyId?: string) => {
    const config: any = {};
    if (userId) {
      config.params = { userId };
    }
    if (companyId) {
      config.params = { ...config.params, companyId };
    }
    return publicApi.patch(`/owners/maintenance-requests/${requestId}/approve`, {}, config);
  },
  rejectOwnerMaintenanceRequest: (requestId: string, reason?: string, userId?: string, companyId?: string) => {
    const config: any = {};
    if (userId) {
      config.params = { userId };
    }
    if (companyId) {
      config.params = { ...config.params, companyId };
    }
    return publicApi.patch(`/owners/maintenance-requests/${requestId}/reject`, { reason }, config);
  },

  // Public Owner Net Income endpoint (for owner dashboard)
  getOwnerNetIncomePublic: (userId?: string, companyId?: string) => {
    const config: any = {};
    if (userId) {
      config.params = { userId };
    }
    if (companyId) {
      config.params = { ...config.params, companyId };
    }
    return publicApi.get('/owners/net-income', config);
  },

  // File upload endpoint
  uploadFiles: (formData: FormData) => {
    return apiInstance.post('/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
  },

  // Invoices
  createInvoice: async (invoice: any) => {
    // Accountant invoices stored in accounting database under companyinvoices
    const res = await apiInstance.post('/invoices', invoice);
    return res.data;
  },
  getInvoices: async () => {
    const res = await apiInstance.get('/invoices');
    return res.data;
  },
  updateInvoiceStatus: async (id: string, status: 'paid' | 'unpaid' | 'overdue') => {
    const res = await apiInstance.put(`/invoices/${id}/status`, { status });
    return res.data;
  }
};

export default apiInstance; 