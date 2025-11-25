import api from '../api/axios';
import { apiService } from '../api';

export interface ChartData {
  type: string;
  data: any;
  companyId?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface ConnectionTestResult {
  success: boolean;
  message: string;
  error?: string;
}

// Helper to read user safely
const getUser = (): { _id?: string; role?: string; companyId?: string } | null => {
  try {
    const userStr = localStorage.getItem('user');
    if (!userStr) return null;
    return JSON.parse(userStr);
  } catch {
    return null;
  }
};

// Helper function to get user role
const getUserRole = (): string | null => {
  const u = getUser();
  return u?.role || null;
};

// Test connection function
export const testConnection = async (): Promise<ConnectionTestResult> => {
  try {
    await initializeChartData();
    const response = await api.get('/charts/test');
    return { success: true, message: 'Connection successful', ...response.data };
  } catch (error: any) {
    return { 
      success: false, 
      message: 'Connection failed', 
      error: error.response?.data || error.message 
    };
  }
};

// Initialize chart data
export const initializeChartData = async () => {
  try {
    const response = await api.post('/charts/initialize');
    return response.data;
  } catch (error) {
    throw error;
  }
};

// Helper function to create fallback chart data
const createFallbackChartData = (type: string, properties: any[] = [], maintenanceRequests: any[] = []) => {
  switch (type) {
    case 'occupancy':
      return {
        type: 'occupancy',
        data: properties.map(property => ({
          name: property.name || 'Unnamed Property',
          occupied: property.occupiedUnits || 0,
          vacant: Math.max(0, (property.units || 1) - (property.occupiedUnits || 0))
        }))
      };
    case 'payment':
      return {
        type: 'payment',
        data: [],
        summary: {
          totalPayments: 0,
          totalAmount: 0,
          averageAmount: 0
        },
        recentPayments: []
      };
    case 'maintenance':
      const statusCounts = {
        pending: maintenanceRequests.filter(req => req.status === 'pending').length,
        in_progress: maintenanceRequests.filter(req => req.status === 'in_progress').length,
        completed: maintenanceRequests.filter(req => req.status === 'completed').length,
        cancelled: maintenanceRequests.filter(req => req.status === 'cancelled').length
      };
      return {
        type: 'maintenance',
        data: [
          { name: 'Pending', value: statusCounts.pending },
          { name: 'In Progress', value: statusCounts.in_progress },
          { name: 'Completed', value: statusCounts.completed },
          { name: 'Cancelled', value: statusCounts.cancelled }
        ].filter(item => item.value > 0)
      };
    default:
      return { type, data: [] };
  }
};

// Get chart data
export const getChartData = async (type: string) => {
  try {
    const userRole = getUserRole();

    if (userRole === 'owner') {
      try {
        const endpoint = (type === 'payment' || type === 'commission') ? 'payments' : type;
        const response = await api.get(`/charts/owner/${endpoint}`);
        if (response.data && response.data.data) {
          return response.data;
        } else {
          return createFallbackChartData(type);
        }
      } catch (error: any) {
        try {
          const user = getUser();
          if (!user?._id) {
            return createFallbackChartData(type);
          }
          const [propertiesRes, maintenanceRes] = await Promise.all([
            api.get('/owners/properties'),
            apiService.getOwnerMaintenanceRequestsPublic(user._id as string, user.companyId)
          ]);
          return createFallbackChartData(type, propertiesRes.data, maintenanceRes.data);
        } catch (fallbackError) {
          return createFallbackChartData(type);
        }
      }
    } else {
      const response = await api.get(`/charts/${type}`);
      return response.data;
    }
  } catch (error) {
    return createFallbackChartData(type);
  }
};

export const updateChartData = async (type: string, data: any): Promise<ChartData> => {
  try {
    const response = await api.put(`/charts/${type}`, { data });
    return response.data;
  } catch (error) {
    throw error;
  }
}; 