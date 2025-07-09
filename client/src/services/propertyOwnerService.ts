import publicApi from '../api/publicApi';

export interface PropertyOwner {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  companyId: string;
  properties?: string[];
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
      
      const response = await publicApi.get('/property-owners/public', config);
      return { owners: response.data.owners || response.data };
    } catch (error: any) {
      console.error('Error fetching property owners:', error);
      throw new Error('Failed to fetch property owners');
    }
  };

  // Public method for fetching all property owners
  const getAllPublic = async (companyId?: string) => {
    try {
      const config: any = {};
      if (companyId) {
        config.params = { companyId };
      }
      
      const response = await publicApi.get('/property-owners/public', config);
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
      
      const response = await publicApi.get(`/property-owners/public/${id}`, config);
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
      
      const response = await publicApi.post('/property-owners/public', ownerData);
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
      
      const response = await publicApi.patch(`/property-owners/public/${id}`, ownerData);
      return response.data;
    } catch (error: any) {
      console.error('Error updating property owner:', error);
      throw new Error('Failed to update property owner');
    }
  };

  const remove = async (id: string) => {
    try {
      await publicApi.delete(`/property-owners/public/${id}`);
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