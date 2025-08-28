import api from '../api/axios';
import { AxiosError } from 'axios';
import { Property } from '../types/property';
import { useAuth } from '../contexts/AuthContext';
import publicApi from '../api/publicApi';

interface ApiResponse<T> {
  status: string;
  data: T;
  message?: string;
  code?: string;
}

interface ValidatedUser {
  userId: string;
  companyId: string;
  role: string;
}

// Type guard to check if response is wrapped in ApiResponse
function isApiResponse<T>(response: any): response is ApiResponse<T> {
  return response && typeof response === 'object' && 'status' in response && 'data' in response;
}

// Type guard to check if object is a Property
function isProperty(obj: any): obj is Property {
  return obj && 
    typeof obj === 'object' && 
    '_id' in obj && 
    'name' in obj && 
    'address' in obj && 
    'type' in obj;
}

// Helper function to handle API errors
const handleApiError = (error: unknown): never => {
  if (error instanceof AxiosError) {
    const message = error.response?.data?.message || error.message;
    console.error('API Error:', message);
    throw new Error(message);
  }
  console.error('Unknown Error:', error);
  throw error;
};

// Helper function to extract property data from response
const extractPropertyData = (response: any): Property => {
  const data = isApiResponse<Property>(response) ? response.data : response;
  
  if (!isProperty(data)) {
    throw new Error('Invalid property data received');
  }
  
  return data;
};

// Helper function to validate user and company
const validateUserAndCompany = (user: { _id?: string; companyId?: string; role?: string } | null): ValidatedUser => {
  if (!user) {
    throw new Error('User not authenticated');
  }
  if (!user._id) {
    throw new Error('User ID not found');
  }
  if (!user.companyId) {
    throw new Error('User is not associated with any company');
  }
  if (!user.role) {
    throw new Error('User role not found');
  }
  return { 
    userId: user._id, 
    companyId: user.companyId, 
    role: user.role 
  };
};

export const usePropertyService = () => {
  const { user } = useAuth();

  // Public method for fetching all properties
  const getPublicProperties = async (): Promise<Property[]> => {
    try {
      const response = await publicApi.get('/properties/public-filtered');
      return Array.isArray(response.data) ? response.data : response.data.data;
    } catch (error: any) {
      console.error('Error fetching properties (public):', error);
      // Don't throw auth errors for public endpoints, just return empty array
      if (error.response?.status === 401) {
        console.warn('Authentication required for public properties endpoint');
        return [];
      }
      throw error;
    }
  };

  const getProperties = async (): Promise<Property[]> => {
    try {
      console.log('propertyService: getProperties called');
      console.log('propertyService: Current user:', user);
      
      validateUserAndCompany(user);

      console.log('propertyService: About to make API call to /properties');
      console.log('propertyService: Current API headers:', api.defaults.headers.common);
      
      const response = await api.get('/properties');
      console.log('Properties API Response:', response.data);

      const data = isApiResponse<Property[]>(response.data) ? response.data.data : response.data;
      
      if (!Array.isArray(data)) {
        throw new Error('Invalid properties data received');
      }

      console.log('propertyService: Successfully fetched properties:', data.length);
      return data;
    } catch (error) {
      console.error('propertyService: Error in getProperties:', error);
      console.error('propertyService: Error response:', error instanceof AxiosError ? {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        headers: error.response?.headers
      } : 'Not an AxiosError');
      return handleApiError(error);
    }
  };

  // Authenticated method for fetching only vacant properties for the current user
  const getVacantProperties = async (): Promise<Property[]> => {
    try {
      console.log('propertyService: getVacantProperties called');
      validateUserAndCompany(user);
      const response = await api.get('/properties/vacant');
      // Endpoint returns { properties: [...] }
      const raw = response.data as any;
      const data: Property[] = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.data)
          ? raw.data
          : Array.isArray(raw?.properties)
            ? raw.properties
            : [];
      console.log('propertyService: Successfully fetched vacant properties:', data.length);
      return data;
    } catch (error) {
      return handleApiError(error);
    }
  };

  const getProperty = async (id: string): Promise<Property> => {
    try {
      validateUserAndCompany(user);

      if (!id) {
        throw new Error('Property ID is required');
      }

      const response = await api.get(`/properties/${id}`);
      console.log('Property API Response:', response.data);

      return extractPropertyData(response.data);
    } catch (error) {
      return handleApiError(error);
    }
  };

  const createProperty = async (propertyData: Partial<Property>): Promise<Property> => {
    try {
      const validatedUser = validateUserAndCompany(user);

      if (!propertyData.name || !propertyData.address || !propertyData.type) {
        throw new Error('Name, address, and type are required');
      }

      // Use public API with user context in query parameters
      const response = await publicApi.post('/properties/public', propertyData, {
        params: {
          userId: validatedUser.userId,
          companyId: validatedUser.companyId,
          userRole: validatedUser.role
        }
      });
      console.log('Create Property Public API Response:', response.data);

      // Extract data from the response structure
      const data = response.data.data || response.data;
      return extractPropertyData(data);
    } catch (error) {
      return handleApiError(error);
    }
  };

  const updateProperty = async (id: string, propertyData: Partial<Property>): Promise<Property> => {
    try {
      const validatedUser = validateUserAndCompany(user);

      if (!id) {
        throw new Error('Property ID is required');
      }

      const response = await api.put(`/properties/${id}`, {
        ...propertyData,
        companyId: validatedUser.companyId
      });
      console.log('Update Property API Response:', response.data);

      return extractPropertyData(response.data);
    } catch (error) {
      return handleApiError(error);
    }
  };

  const deleteProperty = async (id: string): Promise<Property> => {
    try {
      validateUserAndCompany(user);

      if (!id) {
        throw new Error('Property ID is required');
      }

      const response = await api.delete(`/properties/${id}`);
      console.log('Delete Property API Response:', response.data);

      return extractPropertyData(response.data);
    } catch (error) {
      return handleApiError(error);
    }
  };

  const getByOwnerId = async (ownerId: string): Promise<Property[]> => {
    try {
      validateUserAndCompany(user);

      if (!ownerId) {
        throw new Error('Owner ID is required');
      }

      const response = await api.get(`/properties/owner/${ownerId}`);
      console.log('Owner Properties API Response:', response.data);

      const data = isApiResponse<Property[]>(response.data) ? response.data.data : response.data;
      
      if (!Array.isArray(data)) {
        throw new Error('Invalid properties data received');
      }

      return data;
    } catch (error) {
      return handleApiError(error);
    }
  };

  const transferOwnership = async (propertyId: string, newOwnerId: string): Promise<Property> => {
    try {
      const validatedUser = validateUserAndCompany(user);

      if (!propertyId || !newOwnerId) {
        throw new Error('Property ID and new owner ID are required');
      }

      const response = await api.put(`/properties/${propertyId}/transfer`, {
        newOwnerId,
        companyId: validatedUser.companyId
      });
      console.log('Transfer Ownership API Response:', response.data);

      return extractPropertyData(response.data);
    } catch (error) {
      return handleApiError(error);
    }
  };

  // Method to get properties for any user context (useful for testing)
  const getPropertiesForUser = async (userId?: string, companyId?: string, userRole?: string): Promise<Property[]> => {
    try {
      console.log('propertyService: getPropertiesForUser called', { userId, companyId, userRole });
      
      // Build query parameters with provided user context
      const params = new URLSearchParams();
      if (userId) params.append('userId', userId);
      if (companyId) params.append('companyId', companyId);
      if (userRole) params.append('userRole', userRole);

      console.log('propertyService: About to make API call to /properties/public-filtered');
      console.log('propertyService: Query params:', params.toString());
      
      const response = await publicApi.get(`/properties/public-filtered?${params.toString()}`);
      console.log('Properties for User API Response:', response.data);

      const data = isApiResponse<Property[]>(response.data) ? response.data.data : response.data;
      
      if (!Array.isArray(data)) {
        throw new Error('Invalid properties data received');
      }

      console.log('propertyService: Successfully fetched properties for user:', data.length);
      return data;
    } catch (error) {
      console.error('propertyService: Error in getPropertiesForUser:', error);
      console.error('propertyService: Error response:', error instanceof AxiosError ? {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        headers: error.response?.headers
      } : 'Not an AxiosError');
      return handleApiError(error);
    }
  };

  return {
    getProperties,
    getVacantProperties,
    getPublicProperties,
    getPropertiesForUser,
    getProperty,
    createProperty,
    updateProperty,
    deleteProperty,
    getByOwnerId,
    transferOwnership
  };
}; 