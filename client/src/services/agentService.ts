import api from '../api/axios';
import { Property, PropertyFormData } from '../types/property';
import { TenantFormData } from '../types/tenant';
import { LeaseFormData } from '../types/lease';
import { PaymentFormData } from '../types/payment';

export const agentService = {
  // Get properties managed by the agent
  getProperties: async (): Promise<Property[]> => {
    console.log('AgentService: Fetching properties for agent...');
    const response = await api.get('/agents/properties');
    console.log('AgentService: Response received:', response);
    console.log('AgentService: Properties data:', response.data);
    console.log('AgentService: Number of properties returned:', response.data.length);
    return response.data;
  },

  // Create a new property
  createProperty: async (propertyData: PropertyFormData): Promise<Property> => {
    const response = await api.post('/agents/properties', propertyData);
    return response.data;
  },

  // Update an existing property (agent-owned)
  updateProperty: async (id: string, propertyData: Partial<PropertyFormData>): Promise<Property> => {
    const response = await api.put(`/agents/properties/${id}`, propertyData);
    return response.data;
  },

  // Get tenants managed by the agent
  getTenants: async () => {
    const response = await api.get('/agents/tenants');
    return response.data;
  },

  // Create a new tenant (for agents)
  createTenant: async (tenantData: TenantFormData) => {
    // Ensure ownerId is included for agent-created tenants
    const tenantDataWithOwnerId = {
      ...tenantData,
      ownerId: tenantData.ownerId // This should already be set by TenantForm
    };
    const response = await api.post('/agents/tenants', tenantDataWithOwnerId);
    return response.data;
  },

  // Get leases managed by the agent
  getLeases: async () => {
    const response = await api.get('/agents/leases');
    return response.data;
  },

  // Create a new lease (for agents)
  createLease: async (leaseData: LeaseFormData) => {
    const response = await api.post('/agents/leases', leaseData);
    return response.data;
  },

  // Get files uploaded by the agent
  getFiles: async () => {
    const response = await api.get('/agents/files');
    return response.data;
  },

  // Create a new payment (for agents)
  createPayment: async (paymentData: PaymentFormData, properties?: Property[], userId?: string) => {
    // Ensure ownerId is set
    if (!paymentData.ownerId && paymentData.propertyId && properties) {
      const property = properties.find(p => String(p._id) === String(paymentData.propertyId));
      if (property && property.ownerId) {
        paymentData.ownerId = property.ownerId;
      }
    }
    // Fallback: set ownerId to agent's user id if still not set
    if (!paymentData.ownerId && userId) {
      paymentData.ownerId = userId;
    }
    const response = await api.post('/agents/payments', paymentData);
    return response.data;
  },

  // Update a payment (for agents)
  updatePayment: async (id: string, paymentData: PaymentFormData, properties?: Property[], userId?: string) => {
    // Ensure ownerId is set
    if (!paymentData.ownerId && paymentData.propertyId && properties) {
      const property = properties.find(p => String(p._id) === String(paymentData.propertyId));
      if (property && property.ownerId) {
        paymentData.ownerId = property.ownerId;
      }
    }
    // Fallback: set ownerId to agent's user id if still not set
    if (!paymentData.ownerId && userId) {
      paymentData.ownerId = userId;
    }
    const response = await api.put(`/agents/payments/${id}`, paymentData);
    return response.data;
  },

  // Upload a file (for agents)
  uploadFile: async (fileData: FormData) => {
    const response = await api.post('/agents/files', fileData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Get agent commission
  getCommission: async () => {
    const response = await api.get('/agents/commission');
    return response.data;
  },
};

export default agentService; 