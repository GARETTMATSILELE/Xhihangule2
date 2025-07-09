import api from '../api/axios';
import { Property, PropertyFormData } from '../types/property';

export const agentService = {
  // Get properties managed by the agent
  getProperties: async (): Promise<Property[]> => {
    const response = await api.get('/agents/properties');
    return response.data;
  },

  // Create a new property
  createProperty: async (propertyData: PropertyFormData): Promise<Property> => {
    const response = await api.post('/agents/properties', propertyData);
    return response.data;
  },

  // Get tenants managed by the agent
  getTenants: async () => {
    const response = await api.get('/agents/tenants');
    return response.data;
  },

  // Get leases managed by the agent
  getLeases: async () => {
    const response = await api.get('/agents/leases');
    return response.data;
  },

  // Get agent's commission
  getCommission: async () => {
    const response = await api.get('/agents/commission');
    return response.data;
  }
};

export default agentService; 