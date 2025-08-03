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

// Helper function to get user role from localStorage
const getUserRole = (): string | null => {
  try {
    const userStr = localStorage.getItem('user');
    console.log('getUserRole: userStr from localStorage:', userStr);
    
    if (userStr) {
      const user = JSON.parse(userStr);
      console.log('getUserRole: parsed user object:', user);
      const role = user.role || null;
      console.log('getUserRole: extracted role:', role);
      return role;
    } else {
      console.log('getUserRole: no user data found in localStorage');
    }
  } catch (error) {
    console.error('Error parsing user from localStorage:', error);
  }
  return null;
};

// Test connection function
export const testConnection = async (): Promise<ConnectionTestResult> => {
  try {
    console.log('Testing frontend to backend connection...');
    
    // First initialize chart data
    console.log('Initializing chart data...');
    await initializeChartData();
    
    // Then test the connection
    console.log('Testing connection...');
    const response = await api.get('/charts/test');
    console.log('Connection test response:', response.data);
    return { success: true, message: 'Connection successful', ...response.data };
  } catch (error: any) {
    console.error('Connection test failed:', error.response?.data || error.message);
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
    console.log('Initializing chart data...');
    const response = await api.post('/charts/initialize');
    console.log('Chart data initialization response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Failed to initialize chart data:', error);
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
    console.log(`Fetching ${type} chart data...`);
    
    const userRole = getUserRole();
    console.log(`getChartData: detected user role: "${userRole}"`);
    
    // Use owner-specific endpoints for owners
    if (userRole === 'owner') {
      console.log(`Using owner-specific endpoint for ${type} chart data...`);
      try {
        // Use the new payments endpoint for payment data
        const endpoint = type === 'payment' ? 'payments' : type;
        const response = await api.get(`/charts/owner/${endpoint}`);
        console.log(`${type} chart data response:`, response.data);
        
        // Ensure the response has the expected structure
        if (response.data && response.data.data) {
          return response.data;
        } else {
          console.warn(`Invalid response structure for ${type}, using fallback data`);
          return createFallbackChartData(type);
        }
      } catch (error: any) {
        console.log(`Owner-specific endpoint failed for ${type}, falling back to regular endpoint:`, error.message);
        console.log(`Owner-specific endpoint error details:`, error.response?.data);
        
        // Try to get fallback data from properties and maintenance requests
        try {
          const user = JSON.parse(localStorage.getItem('user') || '{}');
          if (!user._id) {
            console.warn('User ID not found, using empty fallback data');
            return createFallbackChartData(type);
          }
          const [propertiesRes, maintenanceRes] = await Promise.all([
            api.get('/owners/properties'),
            apiService.getOwnerMaintenanceRequestsPublic(user._id as string, user.companyId)
          ]);
          
          return createFallbackChartData(type, propertiesRes.data, maintenanceRes.data);
        } catch (fallbackError) {
          console.error(`Fallback data fetch failed for ${type}:`, fallbackError);
          return createFallbackChartData(type);
        }
      }
    } else {
      console.log(`User role is "${userRole}", using regular endpoint for ${type} chart data...`);
      // Use regular endpoints for other users
      const response = await api.get(`/charts/${type}`);
      console.log(`${type} chart data response:`, response.data);
      return response.data;
    }
  } catch (error) {
    console.error(`Failed to get ${type} chart data:`, error);
    // Return fallback data instead of throwing
    return createFallbackChartData(type);
  }
};

export const updateChartData = async (type: string, data: any): Promise<ChartData> => {
  try {
    const response = await api.put(`/charts/${type}`, { data });
    return response.data;
  } catch (error) {
    console.error('Error updating chart data:', error);
    throw error;
  }
}; 