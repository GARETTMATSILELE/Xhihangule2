import api from '../api/axios';
import publicApi from '../api/publicApi';
import { Tenant, TenantFormData } from '../types/tenant';
import { useCompany } from '../contexts/CompanyContext';
import { useAuth } from '../contexts/AuthContext';

export interface CreateTenantData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  companyId: string;  // Required
  status?: string;
  idNumber?: string;
  emergencyContact?: string;
}

export interface UpdateTenantData extends Partial<CreateTenantData> {
  _id: string;
}

export interface TenantResponse {
  tenants: Tenant[];
  total: number;
  page: number;
  pages: number;
}

export const useTenantService = () => {
  const { user } = useAuth();

  const getAll = async (): Promise<{ tenants: Tenant[] }> => {
    if (!user?.companyId) {
      throw new Error('Company ID is required');
      }
    const response = await api.get('/tenants');
      return response.data;
  };

  // Public API version for admin dashboard
  const getAllPublic = async (): Promise<{ tenants: Tenant[] }> => {
    try {
      const response = await publicApi.get('/tenants/public');
      return response.data;
    } catch (error: any) {
      console.error('Error fetching tenants (public):', error);
      // Don't throw auth errors for public endpoints, just return empty data
      if (error.response?.status === 401) {
        console.warn('Authentication required for public tenants endpoint');
        return { tenants: [] };
      }
      throw error;
    }
  };

  const getById = async (id: string): Promise<Tenant> => {
    if (!user?.companyId) {
      throw new Error('Company ID is required');
    }
    const response = await api.get(`/tenants/${id}`);
      return response.data;
  };

  const create = async (tenant: Omit<Tenant, '_id' | 'createdAt' | 'updatedAt'>): Promise<Tenant> => {
    if (!user?.companyId) {
      throw new Error('Company ID is required');
      }
    const response = await api.post('/tenants', {
      ...tenant,
      companyId: user.companyId
    });
      return response.data;
  };

  const update = async (id: string, tenant: Partial<Tenant>): Promise<Tenant> => {
    if (!user?.companyId) {
      throw new Error('Company ID is required');
    }
    const response = await api.put(`/tenants/${id}`, {
      ...tenant,
      companyId: user.companyId
    });
      return response.data;
  };

  const remove = async (id: string): Promise<void> => {
    if (!user?.companyId) {
      throw new Error('Company ID is required');
    }
    await api.delete(`/tenants/${id}`);
  };

  return {
    getAll,
    getAllPublic,
    getById,
    create,
    update,
    delete: remove
  };
};

export default useTenantService; 