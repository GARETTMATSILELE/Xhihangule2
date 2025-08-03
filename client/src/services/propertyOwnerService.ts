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
      
      const response = await api.get('/property-owners', config);
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

  const create = async (ownerData: CreatePropertyOwnerData) => {
    try {
      const companyId = getCompanyId();
      
      // Use company ID from localStorage if not provided
      if (!ownerData.companyId && companyId) {
        ownerData.companyId = companyId;
      }
      
      const response = await api.post('/property-owners', ownerData);
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
    create,
    update,
    remove,
    // Expose company ID getter for components that need it
    getCompanyId,
  };
}; 