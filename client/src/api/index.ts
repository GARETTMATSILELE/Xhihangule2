import api from './axios';
import publicApi from './publicApi';
import axios from 'axios';

// API configuration
const API_BASE_URL = 'http://localhost:5000/api';

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

  // Companies
  getCurrentCompany: () => apiInstance.get('/companies/current'),
  updateCompany: (data: any) => apiInstance.put('/companies/current', data),
  uploadCompanyLogo: (companyId: string, formData: FormData) => {
    return apiInstance.post(`/companies/${companyId}/logo`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
  },
  
  // Properties
  getProperties: () => publicApi.get('/properties/public/all'),
  getProperty: (id: string) => publicApi.get(`/properties/public/${id}`),
  createProperty: (data: any) => publicApi.post('/properties/public', data),
  updateProperty: (id: string, data: any) => publicApi.put(`/properties/${id}`, data),
  deleteProperty: (id: string) => publicApi.delete(`/properties/${id}`),
  getVacantProperties: () => publicApi.get('/properties/vacant'),
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
  getPropertyOwners: () => apiInstance.get('/property-owners'),
  getPropertyOwner: (id: string) => apiInstance.get(`/property-owners/${id}`),
  createPropertyOwner: (data: any) => apiInstance.post('/property-owners', data),
  updatePropertyOwner: (id: string, data: any) => apiInstance.put(`/property-owners/${id}`, data),
  deletePropertyOwner: (id: string) => apiInstance.delete(`/property-owners/${id}`),

  // Tenants
  getTenants: () => publicApi.get('/tenants/public/all'),
  getTenant: (id: string) => publicApi.get(`/tenants/public/${id}`),
  createTenant: (data: any) => publicApi.post('/tenants', data),
  updateTenant: (id: string, data: any) => publicApi.put(`/tenants/${id}`, data),
  deleteTenant: (id: string) => publicApi.delete(`/tenants/${id}`),

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
  getPayments: () => publicApi.get('/payments/public/all'),
  getPayment: (id: string) => publicApi.get(`/payments/public/${id}`),
  createPayment: (data: any) => publicApi.post('/payments', data),
  updatePayment: (id: string, data: any) => publicApi.put(`/payments/${id}`, data),
  deletePayment: (id: string) => publicApi.delete(`/payments/${id}`),

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
  // Owner Payments (for owner dashboard)
  getOwnerPayments: () => apiInstance.get('/charts/owner/payments'),

  // User Management
  getCurrentUser: () => apiInstance.get('/users/me'),
  getUsers: () => apiInstance.get('/users'),
  createUser: (userData: any) => apiInstance.post('/users', userData),
  updateUser: (userData: any) => apiInstance.put('/users/me', userData),
  updateUserPassword: (currentPassword: string, newPassword: string) => 
    apiInstance.put('/users/me/password', { currentPassword, newPassword }),
  updateTwoFactor: (enabled: boolean) => 
    apiInstance.put('/users/me/2fa', { enabled }),

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
    const res = await apiInstance.post('/invoices', invoice);
    return res.data;
  },
  getInvoices: async () => {
    const res = await apiInstance.get('/invoices');
    return res.data;
  }
};

export default apiInstance; 