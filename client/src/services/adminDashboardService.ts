import { AxiosError } from 'axios';
import api from '../api/axios';
import { Property, PropertyFormData } from '../types/property';
import { Tenant, TenantFormData } from '../types/tenant';
import { useCallback } from 'react';

interface ApiResponse<T> {
  status: string;
  data: T;
  message?: string;
  code?: string;
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

// Type guard to check if object is a Tenant
function isTenant(obj: any): obj is Tenant {
  return obj && 
    typeof obj === 'object' && 
    '_id' in obj && 
    'firstName' in obj && 
    'lastName' in obj && 
    'email' in obj;
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

// Use shared api instance which includes auth header + token refresh

export const useAdminDashboardService = () => {
  const getAdminDashboardProperties = useCallback(async (): Promise<Property[]> => {
    try {
      console.log('adminDashboardService: getAdminDashboardProperties called (authenticated)');
      // Use authenticated, company-scoped endpoint
      const response = await api.get('/properties');
      console.log('Admin Dashboard Properties API Response:', response.data);

      const data = isApiResponse<Property[]>(response.data) ? response.data.data : response.data;
      
      if (!Array.isArray(data)) {
        throw new Error('Invalid properties data received');
      }

      console.log('adminDashboardService: Successfully fetched properties:', data.length);
      return data;
    } catch (error) {
      console.error('adminDashboardService: Error in getAdminDashboardProperties:', error);
      console.error('adminDashboardService: Error response:', error instanceof AxiosError ? {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        headers: error.response?.headers
      } : 'Not an AxiosError');
      return handleApiError(error);
    }
  }, []); // Empty dependency array since this function doesn't depend on any external values

  const addProperty = useCallback(async (propertyData: PropertyFormData, user: any, company: any): Promise<Property> => {
    try {
      console.log('adminDashboardService: addProperty called with:', { propertyData, user, company });
      
      // Validate user authentication and details
      if (!user?._id) {
        throw new Error('You must be logged in to add a property');
      }

      if (!user?.companyId) {
        throw new Error('Company ID not found. Please ensure you are associated with a company.');
      }

      if (!['admin', 'owner'].includes(user?.role || '')) {
        throw new Error('Access denied. Admin or Owner role required to create properties.');
      }

      // Prepare the property data with user and company details
      // Note: The server expects ownerId to match the userId from the JWT token
      const propertyToCreate = {
        ...propertyData,
        // Don't override ownerId and companyId - let the server set them from the JWT token
        type: propertyData.type || 'apartment',
        status: propertyData.status || 'available',
        description: propertyData.description || '',
        rent: propertyData.rent || 0,
        bedrooms: propertyData.bedrooms || 0,
        bathrooms: propertyData.bathrooms || 0,
        area: propertyData.area || 0,
        images: propertyData.images || [],
        amenities: propertyData.amenities || []
        // Remove createdAt and updatedAt - let the server handle timestamps
      };

      console.log('adminDashboardService: Creating property with data:', propertyToCreate);
      console.log('adminDashboardService: Making API call to /properties (authenticated)');
      const response = await api.post('/properties', propertyToCreate);
      console.log('adminDashboardService: Property created successfully:', response.data);

      const data = isApiResponse<Property>(response.data) ? response.data.data : response.data;
      
      if (!isProperty(data)) {
        throw new Error('Invalid property data received from server');
      }

      return data;
    } catch (error) {
      console.error('adminDashboardService: Error in addProperty:', error);
      console.error('adminDashboardService: Error response:', error instanceof Error ? {
        message: error.message,
        name: error.name,
        stack: error.stack
      } : error);
      return handleApiError(error);
    }
  }, []);

  const updateProperty = useCallback(async (propertyId: string, propertyData: Partial<Property>, user: any): Promise<Property> => {
    try {
      console.log('adminDashboardService: updateProperty called with:', { propertyId, propertyData, user });
      
      // Validate user authentication
      if (!user?._id) {
        throw new Error('You must be logged in to update a property');
      }

      if (!user?.companyId) {
        throw new Error('Company ID not found. Please ensure you are associated with a company.');
      }

      const response = await api.put(`/properties/${propertyId}`, {
        ...propertyData,
        companyId: user.companyId
      });

      const data = isApiResponse<Property>(response.data) ? response.data.data : response.data;
      
      if (!isProperty(data)) {
        throw new Error('Invalid property data received from server');
      }

      return data;
    } catch (error) {
      console.error('adminDashboardService: Error in updateProperty:', error);
      return handleApiError(error);
    }
  }, []);

  const deleteProperty = useCallback(async (propertyId: string, user: any): Promise<void> => {
    try {
      console.log('adminDashboardService: deleteProperty called with:', { propertyId, user });
      
      // Validate user authentication
      if (!user?._id) {
        throw new Error('You must be logged in to delete a property');
      }

      if (!user?.companyId) {
        throw new Error('Company ID not found. Please ensure you are associated with a company.');
      }

      await api.delete(`/properties/${propertyId}`);
      console.log('adminDashboardService: Property deleted successfully');
    } catch (error) {
      console.error('adminDashboardService: Error in deleteProperty:', error);
      return handleApiError(error);
    }
  }, []);

  // Tenant functions for admin dashboard
  const getAdminDashboardTenants = useCallback(async (): Promise<Tenant[]> => {
    try {
      console.log('adminDashboardService: getAdminDashboardTenants called (authenticated)');
      // Use authenticated, company-scoped endpoint
      const response = await api.get('/tenants');
      console.log('Admin Dashboard Tenants API Response:', response.data);

      // Normalize data shape: support { data: [...] }, { tenants: [...] }, or direct array
      const raw = response.data as any;
      const data = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.data)
          ? raw.data
          : Array.isArray(raw?.tenants)
            ? raw.tenants
            : raw;
      
      if (!Array.isArray(data)) {
        throw new Error('Invalid tenants data received');
      }

      console.log('adminDashboardService: Successfully fetched tenants:', data.length);
      return data;
    } catch (error) {
      console.error('adminDashboardService: Error in getAdminDashboardTenants:', error);
      console.error('adminDashboardService: Error response:', error instanceof AxiosError ? {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        headers: error.response?.headers
      } : 'Not an AxiosError');
      return handleApiError(error);
    }
  }, []);

  const addTenant = useCallback(async (tenantData: TenantFormData, user: any, company: any): Promise<Tenant> => {
    try {
      console.log('adminDashboardService: addTenant called with:', { tenantData, user, company });
      
      // Validate user authentication and details
      if (!user?._id) {
        throw new Error('You must be logged in to add a tenant');
      }

      if (!user?.companyId) {
        throw new Error('Company ID not found. Please ensure you are associated with a company.');
      }

      if (!['admin', 'owner'].includes(user?.role || '')) {
        throw new Error('Access denied. Admin or Owner role required to create tenants.');
      }

      // Prepare the tenant data
      // Note: The server will get companyId from the JWT token
      const tenantToCreate = {
        ...tenantData,
        status: tenantData.status || 'Active',
        // Remove companyId from request body - let the server set it from the JWT token
      };

      console.log('adminDashboardService: Creating tenant with data:', tenantToCreate);
      console.log('adminDashboardService: Making API call to /tenants (authenticated)');
      const response = await api.post('/tenants', tenantToCreate);
      console.log('adminDashboardService: Tenant created successfully:', response.data);

      const data = isApiResponse<Tenant>(response.data) ? response.data.data : response.data;
      
      if (!isTenant(data)) {
        throw new Error('Invalid tenant data received from server');
      }

      return data;
    } catch (error) {
      console.error('adminDashboardService: Error in addTenant:', error);
      console.error('adminDashboardService: Error response:', error instanceof Error ? {
        message: error.message,
        name: error.name,
        stack: error.stack
      } : error);
      return handleApiError(error);
    }
  }, []);

  const updateTenant = useCallback(async (tenantId: string, tenantData: Partial<Tenant>, user: any): Promise<Tenant> => {
    try {
      console.log('adminDashboardService: updateTenant called with:', { tenantId, tenantData, user });
      
      // Validate user authentication
      if (!user?._id) {
        throw new Error('You must be logged in to update a tenant');
      }

      if (!user?.companyId) {
        throw new Error('Company ID not found. Please ensure you are associated with a company.');
      }

      const response = await api.put(`/tenants/${tenantId}`, tenantData);

      const data = isApiResponse<Tenant>(response.data) ? response.data.data : response.data;
      
      if (!isTenant(data)) {
        throw new Error('Invalid tenant data received from server');
      }

      return data;
    } catch (error) {
      console.error('adminDashboardService: Error in updateTenant:', error);
      return handleApiError(error);
    }
  }, []);

  const deleteTenant = useCallback(async (tenantId: string, user: any): Promise<void> => {
    try {
      console.log('adminDashboardService: deleteTenant called with:', { tenantId, user });
      
      // Validate user authentication
      if (!user?._id) {
        throw new Error('You must be logged in to delete a tenant');
      }

      if (!user?.companyId) {
        throw new Error('Company ID not found. Please ensure you are associated with a company.');
      }

      await api.delete(`/tenants/${tenantId}`);
      console.log('adminDashboardService: Tenant deleted successfully');
    } catch (error) {
      console.error('adminDashboardService: Error in deleteTenant:', error);
      return handleApiError(error);
    }
  }, []);

  return {
    getAdminDashboardProperties,
    addProperty,
    updateProperty,
    deleteProperty,
    getAdminDashboardTenants,
    addTenant,
    updateTenant,
    deleteTenant
  };
}; 