import api from '../api/axios';
import { DashboardData } from '../types/dashboard';

export const dashboardService = {
  getDashboardData: async (): Promise<DashboardData> => {
    try {
      const response = await api.get('/dashboard');
      return response.data;
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      throw error;
    }
  },

  getRecentPayments: async () => {
    try {
      const response = await api.get('/payments/recent');
      return response.data;
    } catch (error) {
      console.error('Error fetching recent payments:', error);
      throw error;
    }
  },

  getLeaseRenewals: async () => {
    try {
      const response = await api.get('/leases/renewals');
      return response.data;
    } catch (error) {
      console.error('Error fetching lease renewals:', error);
      throw error;
    }
  },

  getMaintenanceRequests: async () => {
    try {
      const response = await api.get('/maintenance/requests');
      return response.data;
    } catch (error) {
      console.error('Error fetching maintenance requests:', error);
      throw error;
    }
  },

  getDelinquentTenants: async () => {
    try {
      const response = await api.get('/tenants/delinquent');
      return response.data;
    } catch (error) {
      console.error('Error fetching delinquent tenants:', error);
      throw error;
    }
  }
}; 