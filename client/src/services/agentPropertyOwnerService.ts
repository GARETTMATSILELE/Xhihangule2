import api from '../api';

function apiMessage(error: any, fallback: string): Error {
  const message = error?.response?.data?.message;
  if (typeof message === 'string' && message.trim()) return new Error(message);
  return new Error(fallback);
}

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
  propertyIds?: string[];
}

export type UpdatePropertyOwnerData = Partial<PropertyOwner> & {
  propertyIds?: string[];
};

export const useAgentPropertyOwnerService = () => {
  const getAll = async () => {
    try {
      const response = await api.get('/agents/property-owners');
      return { owners: response.data.owners || response.data };
    } catch (error: any) {
      console.error('Error fetching agent property owners:', error);
      throw apiMessage(error, 'Failed to fetch property owners');
    }
  };

  const getById = async (id: string) => {
    try {
      const response = await api.get(`/agents/property-owners/${id}`);
      return response.data;
    } catch (error: any) {
      console.error('Error fetching agent property owner:', error);
      throw apiMessage(error, 'Failed to fetch property owner details');
    }
  };

  const create = async (ownerData: CreatePropertyOwnerData) => {
    try {
      const response = await api.post('/agents/property-owners', ownerData);
      return response.data;
    } catch (error: any) {
      console.error('Error creating agent property owner:', error);
      throw apiMessage(error, 'Failed to create property owner');
    }
  };

  const update = async (id: string, ownerData: UpdatePropertyOwnerData) => {
    try {
      const response = await api.put(`/agents/property-owners/${id}`, ownerData);
      return response.data;
    } catch (error: any) {
      console.error('Error updating agent property owner:', error);
      throw apiMessage(error, 'Failed to update property owner');
    }
  };

  const remove = async (id: string) => {
    try {
      const response = await api.delete(`/agents/property-owners/${id}`);
      return response.data;
    } catch (error: any) {
      console.error('Error deleting agent property owner:', error);
      throw apiMessage(error, 'Failed to delete property owner');
    }
  };

  return {
    getAll,
    getById,
    create,
    update,
    remove,
  };
}; 