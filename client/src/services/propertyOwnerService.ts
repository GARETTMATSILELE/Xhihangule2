import api from '../api';

export interface PropertyOwner {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  companyId: string;
  properties?: Array<string | { $oid: string }>;
}

export interface CreatePropertyOwnerData extends Omit<PropertyOwner, '_id'> {
  password: string;
}

export const usePropertyOwnerService = () => {
  // Helper function to get company ID from localStorage or other sources
  const getCompanyId = () => {
    return localStorage.getItem('companyId') || null;
  };

  const getAll = async () => {
    try {
      const companyId = getCompanyId();
      
      const config: any = {};
      if (companyId) {
        config.params = { companyId };
      }
      // Sales channel: fetch only owners created by this user from sales-owners
      const response = await api.get('/sales-owners', config);
      return { owners: response.data.owners || response.data };
    } catch (error: any) {
      console.error('Error fetching property owners:', error);
      throw new Error('Failed to fetch property owners');
    }
  };

  // Method for fetching all property owners (authenticated)
  const getAllPublic = async (companyId?: string) => {
    try {
      const config: any = {};
      if (companyId) {
        config.params = { companyId };
      }
      
      const response = await api.get('/property-owners', config);
      return response.data.owners || response.data;
    } catch (error) {
      throw error;
    }
  };

  const getById = async (id: string) => {
    try {
      const companyId = getCompanyId();
      
      const config: any = {};
      if (companyId) {
        config.params = { companyId };
      }
      
      const response = await api.get(`/property-owners/${id}`, config);
      return response.data;
    } catch (error: any) {
      console.error('Error fetching property owner:', error);
      throw new Error('Failed to fetch property owner details');
    }
  };

  // Fetch sales owner by id (from salesowners collection)
  const getSalesById = async (id: string) => {
    try {
      const response = await api.get(`/sales-owners/${id}`);
      return response.data;
    } catch (error: any) {
      console.error('Error fetching sales owner:', error);
      throw new Error('Failed to fetch sales owner details');
    }
  };

  const create = async (ownerData: CreatePropertyOwnerData, opts?: { channel?: 'sales' | 'default' }) => {
    try {
      const companyId = getCompanyId();
      
      // Use company ID from localStorage if not provided
      if (!ownerData.companyId && companyId) {
        ownerData.companyId = companyId;
      }
      // Route to sales-owners endpoint when channel is 'sales'
      const url = opts?.channel === 'sales' ? '/sales-owners' : '/property-owners';
      const response = await api.post(url, ownerData);
      return response.data;
    } catch (error: any) {
      console.error('Error creating property owner:', error);
      throw new Error('Failed to create property owner');
    }
  };

  const update = async (id: string, ownerData: Partial<PropertyOwner>) => {
    try {
      const companyId = getCompanyId();
      
      // Use company ID from localStorage if not provided
      if (!ownerData.companyId && companyId) {
        ownerData.companyId = companyId;
      }
      
      const response = await api.patch(`/property-owners/${id}`, ownerData);
      return response.data;
    } catch (error: any) {
      console.error('Error updating property owner:', error);
      throw new Error('Failed to update property owner');
    }
  };

  // Update sales owner (in salesowners collection)
  const updateSales = async (id: string, ownerData: Partial<PropertyOwner> & { properties?: string[] }) => {
    try {
      const companyId = getCompanyId();

      if (!ownerData.companyId && companyId) {
        (ownerData as any).companyId = companyId;
      }

      const response = await api.patch(`/sales-owners/${id}`, ownerData);
      return response.data;
    } catch (error: any) {
      console.error('Error updating sales owner:', error);
      throw new Error('Failed to update sales owner');
    }
  };

  const remove = async (id: string) => {
    try {
      await api.delete(`/property-owners/${id}`);
    } catch (error: any) {
      console.error('Error deleting property owner:', error);
      throw new Error('Failed to delete property owner');
    }
  };

  return {
    getAll,
    getAllPublic,
    getById,
    getSalesById,
    create,
    update,
    remove,
    updateSales,
    // Expose company ID getter for components that need it
    getCompanyId,
  };
}; 