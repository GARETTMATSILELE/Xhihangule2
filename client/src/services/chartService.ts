import api from '../api/axios';

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
        const response = await api.get(`/charts/owner/${type}`);
        console.log(`${type} chart data response:`, response.data);
        return response.data;
      } catch (error: any) {
        console.log(`Owner-specific endpoint failed for ${type}, falling back to regular endpoint:`, error.message);
        console.log(`Owner-specific endpoint error details:`, error.response?.data);
        // Fall back to regular endpoint if owner-specific fails
        const response = await api.get(`/charts/${type}`);
        console.log(`${type} chart data response (fallback):`, response.data);
        return response.data;
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
    throw error;
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