import React, { createContext, useContext, useState, useEffect } from 'react';
import { Property } from '../types/property';
import { usePropertyService } from '../services/propertyService';
import { useAuth } from '../contexts/AuthContext';
import { useLocation } from 'react-router-dom';

interface PropertyContextType {
  properties: Property[];
  loading: boolean;
  error: string | null;
  refreshProperties: () => Promise<void>;
  addProperty: (property: Property) => Promise<void>;
  updateProperty: (id: string, property: Partial<Property>) => Promise<void>;
  deleteProperty: (id: string) => Promise<void>;
}

const PropertyContext = createContext<PropertyContextType | undefined>(undefined);

export const PropertyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const propertyService = usePropertyService();
  const location = useLocation();

  // Check if we're on an admin route
  const isAdminRoute = location.pathname.includes('/admin-dashboard') || 
                      location.pathname.includes('/admin/');

  // Check if user is admin
  const isAdminUser = user?.role === 'admin';

  // Skip PropertyContext for admin routes and admin users
  const shouldSkipPropertyContext = isAdminRoute || isAdminUser;

  const refreshProperties = async () => {
    // Skip if we're on admin routes or user is admin
    if (shouldSkipPropertyContext) {
      console.log('PropertyContext: Skipping refreshProperties - admin route or admin user');
      setProperties([]);
      setLoading(false);
      setError(null);
      return;
    }

    console.log('PropertyContext: refreshProperties called');
    console.log('PropertyContext: Auth state:', { 
      authLoading, 
      isAuthenticated, 
      hasUser: !!user,
      userId: user?._id, 
      companyId: user?.companyId,
      role: user?.role 
    });

    // Don't fetch if auth is still loading
    if (authLoading) {
      console.log('PropertyContext: Auth is still loading, skipping fetch');
      return;
    }

    // Try to fetch properties even if user is not fully authenticated
    // The public API will handle the filtering based on available user context
    if (!user) {
      console.log('PropertyContext: No user data available, skipping fetch');
      setError('User data not available');
      setProperties([]);
      setLoading(false);
      return;
    }

    // Don't fetch if user has no companyId
    if (!user.companyId) {
      console.log('PropertyContext: User has no company ID, skipping fetch');
      setError('User is not associated with any company');
      setProperties([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      console.log('PropertyContext: All checks passed, fetching properties...');
      console.log('PropertyContext: About to call propertyService.getPublicProperties()');
      const fetchedProperties = await propertyService.getPublicProperties();
      console.log('PropertyContext: Properties fetched successfully:', fetchedProperties?.length, 'properties');
      
      if (Array.isArray(fetchedProperties)) {
        setProperties(fetchedProperties);
      } else {
        console.error('PropertyContext: Fetched properties is not an array:', fetchedProperties);
        setError('Invalid response format from server');
        setProperties([]);
      }
    } catch (err) {
      console.error('PropertyContext: Error in refreshProperties:', err);
      console.error('PropertyContext: Error details:', {
        message: err instanceof Error ? err.message : 'Unknown error',
        stack: err instanceof Error ? err.stack : undefined
      });
      setError(err instanceof Error ? err.message : 'Failed to fetch properties');
      setProperties([]);
    } finally {
      setLoading(false);
    }
  };

  const addProperty = async (property: Property) => {
    // Skip if we're on admin routes or user is admin
    if (shouldSkipPropertyContext) {
      console.log('PropertyContext: Skipping addProperty - admin route or admin user');
      return;
    }

    try {
      console.log('PropertyContext: Adding property:', property);
      const newProperty = await propertyService.createProperty(property);
      console.log('PropertyContext: Property added:', newProperty);
      setProperties(prev => [...prev, newProperty]);
    } catch (err) {
      console.error('PropertyContext: Error adding property:', err);
      throw err;
    }
  };

  const updateProperty = async (id: string, property: Partial<Property>) => {
    // Skip if we're on admin routes or user is admin
    if (shouldSkipPropertyContext) {
      console.log('PropertyContext: Skipping updateProperty - admin route or admin user');
      return;
    }

    try {
      console.log('PropertyContext: Updating property:', { id, property });
      const updatedProperty = await propertyService.updateProperty(id, property);
      console.log('PropertyContext: Property updated:', updatedProperty);
      setProperties(prev => prev.map(p => p._id === id ? updatedProperty : p));
    } catch (err) {
      console.error('PropertyContext: Error updating property:', err);
      throw err;
    }
  };

  const deleteProperty = async (id: string) => {
    // Skip if we're on admin routes or user is admin
    if (shouldSkipPropertyContext) {
      console.log('PropertyContext: Skipping deleteProperty - admin route or admin user');
      return;
    }

    try {
      console.log('PropertyContext: Deleting property:', id);
      await propertyService.deleteProperty(id);
      console.log('PropertyContext: Property deleted');
      setProperties(prev => prev.filter(p => p._id !== id));
    } catch (err) {
      console.error('PropertyContext: Error deleting property:', err);
      throw err;
    }
  };

  // Only fetch properties when:
  // 1. Auth is not loading
  // 2. User data is available
  // 3. User has a companyId
  // 4. NOT on admin routes
  // 5. NOT an admin user
  useEffect(() => {
    console.log('PropertyContext: useEffect triggered', {
      authLoading,
      isAuthenticated,
      hasUser: !!user,
      hasCompanyId: !!user?.companyId,
      isAdminRoute,
      isAdminUser,
      shouldSkipPropertyContext
    });

    // Skip if we're on admin routes or user is admin
    if (shouldSkipPropertyContext) {
      console.log('PropertyContext: Skipping property fetch - admin route or admin user');
      setProperties([]);
      setError(null);
      setLoading(false);
      return;
    }

    if (!authLoading && user && user.companyId) {
      console.log('PropertyContext: All conditions met, calling refreshProperties');
      refreshProperties();
    } else if (!authLoading && !user) {
      console.log('PropertyContext: No user data available, clearing properties');
      setProperties([]);
      setError('User data not available');
      setLoading(false);
    } else if (!authLoading && user && !user.companyId) {
      console.log('PropertyContext: User has no company ID, clearing properties');
      setProperties([]);
      setError('User is not associated with any company');
      setLoading(false);
    }
  }, [user, authLoading, shouldSkipPropertyContext]); // Removed isAuthenticated dependency

  return (
    <PropertyContext.Provider value={{
      properties,
      loading: loading || authLoading,
      error,
      refreshProperties,
      addProperty,
      updateProperty,
      deleteProperty
    }}>
      {children}
    </PropertyContext.Provider>
  );
};

export const useProperties = () => {
  const context = useContext(PropertyContext);
  if (context === undefined) {
    throw new Error('useProperties must be used within a PropertyProvider');
  }
  return context;
}; 