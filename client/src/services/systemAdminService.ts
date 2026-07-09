import api from '../api/axios';

export type SystemPlan = 'INDIVIDUAL' | 'SME' | 'ENTERPRISE';
export type BillingCycle = 'monthly' | 'yearly';

const downloadBlob = async (url: string, filename: string) => {
  const response = await api.get(url, { responseType: 'blob' });
  const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = blobUrl;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
};

export const systemAdminService = {
  getStatus: async () => (await api.get('/system-admin/status')).data,
  getDashboard: async () => (await api.get('/system-admin/dashboard')).data,
  listSystemAdmins: async () => (await api.get('/system-admin/users')).data,
  addSystemAdmin: async (payload: { email?: string; userId?: string }) => (await api.post('/system-admin/users', payload)).data,
  removeSystemAdmin: async (id: string) => (await api.delete(`/system-admin/users/${id}`)).data,
  runBackup: async () => (await api.post('/system-admin/backups/run')).data,
  listBackups: async () => (await api.get('/system-admin/backups')).data,
  reconcile: async (dryRun: boolean = true) => (await api.post('/system-admin/maintenance/reconcile', { dryRun })).data,
  ledgerMaintenance: async (payload: { companyId?: string; dryRun?: boolean }) => (await api.post('/system-admin/maintenance/ledger', payload)).data,
  fullSync: async () => (await api.post('/system-admin/sync/full')).data,
  listCompanySubscriptions: async () => (await api.get('/system-admin/subscriptions/companies')).data,
  manualRenewSubscription: async (payload: { companyId: string; cycle?: 'monthly' | 'yearly' }) => (await api.post('/system-admin/subscriptions/renew', payload)).data,
  // Cash subscriptions
  createCashVoucher: async (payload: { companyId: string; plan: SystemPlan; cycle: BillingCycle; amount?: number; validUntil?: string }) =>
    (await api.post('/system-admin/subscriptions/vouchers', payload)).data,
  listCashVouchers: async (params?: { companyId?: string; limit?: number }) => (await api.get('/system-admin/subscriptions/vouchers', { params })).data,
  listSubscriptionBillingPayments: async (params?: { companyId?: string; limit?: number; method?: string; provider?: string }) =>
    (await api.get('/system-admin/subscriptions/billing-payments', { params })).data,
  getSubscriptionPaymentReceipt: async (id: string) =>
    (await api.get(`/system-admin/subscriptions/billing-payments/${id}/receipt`)).data,

  // Company management
  listCompanies: async (params?: { page?: number; limit?: number; search?: string; status?: string; plan?: string }) =>
    (await api.get('/system-admin/companies', { params })).data,
  getCompanyProfile: async (id: string) => (await api.get(`/system-admin/companies/${id}`)).data,
  updateCompanyProfile: async (id: string, payload: Record<string, any>) => (await api.put(`/system-admin/companies/${id}`, payload)).data,
  suspendCompany: async (id: string, reason?: string) => (await api.post(`/system-admin/companies/${id}/suspend`, { reason })).data,
  activateCompany: async (id: string) => (await api.post(`/system-admin/companies/${id}/activate`)).data,

  // Cash payment proof workflow
  listCashPayments: async (params?: { page?: number; limit?: number; companyId?: string; status?: string; method?: string }) =>
    (await api.get('/system-admin/cash-payments', { params })).data,
  createCashPayment: async (payload: {
    companyId: string;
    plan: SystemPlan;
    billingCycle: BillingCycle;
    amount: number;
    currency?: string;
    method: 'Cash' | 'EcoCash' | 'ZIPIT' | 'Bank Transfer' | 'Innbucks' | 'Mukuru';
    referenceNumber?: string;
    proofOfPayment?: string;
    notes?: string;
  }) => (await api.post('/system-admin/cash-payments', payload)).data,
  approveCashPayment: async (id: string, notes?: string) => (await api.post(`/system-admin/cash-payments/${id}/approve`, { notes })).data,
  rejectCashPayment: async (id: string, notes?: string) => (await api.post(`/system-admin/cash-payments/${id}/reject`, { notes })).data,
  requestCashPaymentInfo: async (id: string, notes?: string) => (await api.post(`/system-admin/cash-payments/${id}/request-info`, { notes })).data,

  // Platform invoices
  listInvoices: async (params?: { page?: number; limit?: number; companyId?: string; status?: string }) =>
    (await api.get('/system-admin/invoices', { params })).data,
  generateInvoice: async (payload: { companyId: string; plan: SystemPlan; billingCycle: BillingCycle; amount?: number; currency?: string; dueDate?: string; status?: string; notes?: string }) =>
    (await api.post('/system-admin/invoices', payload)).data,
  updateInvoice: async (id: string, payload: Record<string, any>) => (await api.patch(`/system-admin/invoices/${id}`, payload)).data,
  downloadInvoicePdf: async (id: string, invoiceNumber?: string) => downloadBlob(`/system-admin/invoices/${id}/pdf`, `${invoiceNumber || id}.pdf`),
  emailInvoice: async (id: string, to?: string) => (await api.post(`/system-admin/invoices/${id}/email`, { to })).data,

  // Enhanced vouchers
  listVouchers: async (params?: { page?: number; limit?: number; companyId?: string; status?: string }) =>
    (await api.get('/system-admin/vouchers', { params })).data,
  revokeVoucher: async (id: string, reason?: string) => (await api.post(`/system-admin/vouchers/${id}/revoke`, { reason })).data,
  extendVoucher: async (id: string, validUntil: string) => (await api.post(`/system-admin/vouchers/${id}/extend`, { validUntil })).data,
  getVoucherHistory: async (id: string) => (await api.get(`/system-admin/vouchers/${id}/history`)).data,

  // Plans
  listPlans: async () => (await api.get('/system-admin/plans')).data,
  savePlan: async (payload: Record<string, any>) => {
    const code = payload.code;
    return (await api.put(`/system-admin/plans/${code}`, payload)).data;
  },

  // Audit/support/revenue
  listAuditLogs: async (params?: { page?: number; limit?: number; companyId?: string; userId?: string; action?: string; from?: string; to?: string }) =>
    (await api.get('/system-admin/audit-logs', { params })).data,
  listSupportTickets: async (params?: { page?: number; limit?: number; companyId?: string; status?: string; priority?: string }) =>
    (await api.get('/system-admin/support-tickets', { params })).data,
  createSupportTicket: async (payload: { companyId: string; subject: string; description: string; priority?: string }) =>
    (await api.post('/system-admin/support-tickets', payload)).data,
  updateSupportTicket: async (id: string, payload: Record<string, any>) => (await api.patch(`/system-admin/support-tickets/${id}`, payload)).data,
  getRevenueAnalytics: async () => (await api.get('/system-admin/revenue')).data
};

export default systemAdminService;


