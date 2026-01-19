import api from '../api/axios';

export const systemAdminService = {
  getStatus: async () => (await api.get('/system-admin/status')).data,
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
  createCashVoucher: async (payload: { companyId: string; plan: 'INDIVIDUAL'|'SME'|'ENTERPRISE'; cycle: 'monthly'|'yearly'; amount?: number; validUntil?: string }) =>
    (await api.post('/system-admin/subscriptions/vouchers', payload)).data,
  listCashVouchers: async (params?: { companyId?: string; limit?: number }) => (await api.get('/system-admin/subscriptions/vouchers', { params })).data,
  listSubscriptionBillingPayments: async (params?: { companyId?: string; limit?: number; method?: string; provider?: string }) =>
    (await api.get('/system-admin/subscriptions/billing-payments', { params })).data,
  getSubscriptionPaymentReceipt: async (id: string) =>
    (await api.get(`/system-admin/subscriptions/billing-payments/${id}/receipt`)).data
};

export default systemAdminService;


