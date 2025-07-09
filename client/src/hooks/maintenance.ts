import { useState, useEffect } from 'react';
import { MaintenanceRequest } from '../types/maintenance';
import { apiService } from '../api';
import { User } from '../types/auth';

export interface UseMaintenanceReturn {
  requests: MaintenanceRequest[];
  loading: boolean;
  error: string | null;
  fetchRequests: () => Promise<void>;
  createRequest: (data: Partial<MaintenanceRequest>) => Promise<MaintenanceRequest>;
  updateRequest: (id: string, data: Partial<MaintenanceRequest>) => Promise<MaintenanceRequest>;
  deleteRequest: (id: string) => Promise<void>;
}

export const useMaintenance = (user?: User): UseMaintenanceReturn => {
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      // Use public API with companyId if available
      const companyId = user?.companyId;
      
      if (!user || !companyId) {
        console.log('useMaintenance - Missing user or companyId, skipping fetch');
        setRequests([]);
        setError(null);
        return;
      }
      
      console.log('useMaintenance - Fetching requests with:', {
        userId: user._id,
        userEmail: user.email,
        companyId,
        userRole: user.role
      });
      
      const response = await apiService.getMaintenanceRequestsPublic(companyId);
      setRequests(response.data);
      setError(null);
      
      console.log('useMaintenance - Successfully fetched requests:', response.data.length);
    } catch (err) {
      setError('Failed to fetch maintenance requests');
      console.error('Error fetching maintenance requests:', err);
    } finally {
      setLoading(false);
    }
  };

  const createRequest = async (data: Partial<MaintenanceRequest>) => {
    try {
      setLoading(true);
      const response = await apiService.createMaintenanceRequest(data);
      setRequests(prev => [...prev, response.data]);
      setError(null);
      return response.data;
    } catch (err) {
      setError('Failed to create maintenance request');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const updateRequest = async (id: string, data: Partial<MaintenanceRequest>) => {
    try {
      setLoading(true);
      const response = await apiService.updateMaintenanceRequest(id, data);
      setRequests(prev => prev.map(req => req._id === id ? response.data : req));
      setError(null);
      return response.data;
    } catch (err) {
      setError('Failed to update maintenance request');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const deleteRequest = async (id: string) => {
    try {
      setLoading(true);
      await apiService.deleteMaintenanceRequest(id);
      setRequests(prev => prev.filter(req => req._id !== id));
      setError(null);
    } catch (err) {
      setError('Failed to delete maintenance request');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && user.companyId) {
      fetchRequests();
    }
  }, [user]);

  return {
    requests,
    loading,
    error,
    fetchRequests,
    createRequest,
    updateRequest,
    deleteRequest
  };
}; 