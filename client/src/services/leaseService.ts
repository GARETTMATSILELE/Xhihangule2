import { Lease, LeaseFilter } from '../types/lease';
import api from '../api/axios';
import { useAuth } from '../contexts/AuthContext';

export const useLeaseService = () => {
  const { user } = useAuth();

  // Public method for fetching all leases
  const getAllPublic = async (companyId?: string): Promise<Lease[]> => {
    try {
      const config: any = {};
      if (companyId) {
        config.params = { companyId };
      }
      
      const response = await api.get('/leases/public', config);
      return response.data.data || [];
    } catch (error) {
      console.error('Error fetching leases (public):', error);
      throw new Error('Failed to fetch leases');
    }
  };

  const getAll = async (): Promise<Lease[]> => {
    const response = await api.get('/leases');
    return response.data;
  };

  const getLeases = async (filters: LeaseFilter): Promise<{ leases: Lease[] }> => {
    if (!user?.companyId) {
      throw new Error('Company ID is required');
    }
    const response = await api.get('/leases', { 
      params: {
        ...filters
      }
    });
    return response.data;
  };

  const getById = async (id: string): Promise<Lease> => {
    if (!user?.companyId) {
      throw new Error('Company ID is required');
    }
    const response = await api.get(`/leases/${id}`);
    return response.data;
  };

  const create = async (lease: Omit<Lease, '_id' | 'createdAt' | 'updatedAt'>): Promise<Lease> => {
    if (!user?.companyId) {
      throw new Error('Company ID is required');
    }
    
    const requestData = {
      ...lease,
      companyId: user.companyId
    };
    
    console.log('Lease service create - sending data:', requestData);
    
    const response = await api.post('/leases', requestData);
    return response.data;
  };

  const update = async (id: string, lease: Partial<Lease>): Promise<Lease> => {
    if (!user?.companyId) {
      throw new Error('Company ID is required');
    }
    const response = await api.put(`/leases/${id}`, {
      ...lease,
      companyId: user.companyId
    });
    return response.data;
  };

  const updateStatus = async (id: string, status: Lease['status']): Promise<Lease> => {
    if (!user?.companyId) {
      throw new Error('Company ID is required');
    }
    const response = await api.patch(`/leases/${id}/status`, { status });
    return response.data;
  };

  const renew = async (id: string, lease: Partial<Lease>): Promise<Lease> => {
    if (!user?.companyId) {
      throw new Error('Company ID is required');
    }
    const response = await api.post(`/leases/${id}/renew`, {
      ...lease,
      companyId: user.companyId
    });
    return response.data;
  };

  const terminate = async (id: string, payload: { reason?: string; moveOutDate?: string; deductions?: number; penalties?: number; settlementNotes?: string } = {}): Promise<Lease> => {
    if (!user?.companyId) {
      throw new Error('Company ID is required');
    }
    const response = await api.post(`/leases/${id}/terminate`, payload);
    return response.data;
  };

  const closeSettlement = async (id: string, notes?: string): Promise<Lease> => {
    if (!user?.companyId) {
      throw new Error('Company ID is required');
    }
    const response = await api.post(`/leases/${id}/close-settlement`, { notes });
    return response.data;
  };

  const remove = async (id: string): Promise<void> => {
    if (!user?.companyId) {
      throw new Error('Company ID is required');
    }
    await api.delete(`/leases/${id}`);
  };

  const uploadDocument = async (leaseId: string, file: File): Promise<void> => {
    if (!user?.companyId) {
      throw new Error('Company ID is required');
    }
    const formData = new FormData();
    formData.append('document', file);
    formData.append('companyId', user.companyId);
    await api.post(`/leases/${leaseId}/documents`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  };

  return {
    getAllPublic,
    getAll,
    getLeases,
    getById,
    create,
    update,
    updateStatus,
    renew,
    terminate,
    closeSettlement,
    delete: remove,
    uploadDocument
  };
}; 