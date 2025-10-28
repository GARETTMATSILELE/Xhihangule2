import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faFilter, faSearch, faMapMarkerAlt, faUser } from '@fortawesome/free-solid-svg-icons';
import PropertyForm from '../../components/properties/PropertyForm';
import PropertyList from '../../components/properties/PropertyList';
import { PropertyFilter } from '../../components/properties/PropertyFilter';
import { Property, PropertyFilter as PropertyFilterType, PropertyFormData } from '../../types/property';
import './Properties.css';
import { Typography, Box, Alert, CircularProgress, TextField, InputAdornment, Paper } from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import { useCompany } from '../../contexts/CompanyContext';
import { useProperties } from '../../contexts/PropertyContext';
import { useAdminDashboardService } from '../../services/adminDashboardService';
import { useLocation } from 'react-router-dom';
import agentService from '../../services/agentService';
import { Tenant } from '../../types/tenant';

export const Properties: React.FC = () => {
  const { user, company } = useAuth();
  const { company: companyDetails } = useCompany();
  const location = useLocation();
  const { properties: contextProperties, loading: contextLoading, error: contextError, addProperty: contextAddProperty, updateProperty: contextUpdateProperty, deleteProperty: contextDeleteProperty } = useProperties();
  const { getAdminDashboardProperties, addProperty: adminAddProperty, updateProperty: adminUpdateProperty, deleteProperty: adminDeleteProperty } = useAdminDashboardService();
  
  // Check if we're on an admin route
  const isAdminRoute = location.pathname.includes('/admin-dashboard') || 
                      location.pathname.includes('/admin/');
  
  // Check if we're on an agent route - more comprehensive detection
  const isAgentRoute = location.pathname.includes('/agent-dashboard') || 
                      location.pathname.includes('/agent/') ||
                      user?.role === 'agent'; // Also check user role
  
  // Debug logging
  console.log('Properties component - Route detection:', {
    pathname: location.pathname,
    isAdminRoute,
    isAgentRoute,
    userRole: user?.role,
    user: user
  });
  
  // State for admin dashboard properties
  const [adminProperties, setAdminProperties] = useState<Property[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  
  // State for agent dashboard properties
  const [agentProperties, setAgentProperties] = useState<Property[]>([]);
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [agentTenants, setAgentTenants] = useState<Tenant[]>([]);
  
  // Use appropriate properties based on route
  let properties: Property[] = [];
  let loading = false;
  let error: string | null = null;
  
  if (isAdminRoute) {
    properties = adminProperties;
    loading = adminLoading;
    error = adminError;
  } else if (isAgentRoute) {
    properties = agentProperties;
    loading = agentLoading;
    error = agentError;
  } else {
    properties = contextProperties;
    loading = contextLoading;
    error = contextError;
  }
  
  const [showForm, setShowForm] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [filters, setFilters] = useState<PropertyFilterType>({
    status: 'all',
    location: '',
    rentRange: { min: 0, max: 10000 }
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [propertyAddressSearch, setPropertyAddressSearch] = useState('');
  const [tenantNameSearch, setTenantNameSearch] = useState('');
  const [listingFilter, setListingFilter] = useState<'all' | 'rental' | 'sale'>('all');
  // Plan-based property limits
  const planLimit = companyDetails?.propertyLimit ?? null;
  const propertiesCount = properties.length;
  const limitReached = planLimit != null && propertiesCount >= (planLimit || 0);

  // Fetch admin properties when on admin route
  useEffect(() => {
    if (isAdminRoute) {
      const fetchAdminProperties = async () => {
        try {
          setAdminLoading(true);
          setAdminError(null);
          const fetchedProperties = await getAdminDashboardProperties();
          setAdminProperties(fetchedProperties);
        } catch (err) {
          console.error('Error fetching admin properties:', err);
          setAdminError(err instanceof Error ? err.message : 'Failed to fetch properties');
        } finally {
          setAdminLoading(false);
        }
      };
      
      fetchAdminProperties();
    }
  }, [isAdminRoute, getAdminDashboardProperties]);

  // Fetch agent properties and tenants when on agent route
  useEffect(() => {
    console.log('Properties component - Agent properties useEffect triggered:', {
      isAgentRoute,
      userRole: user?.role
    });
    
    if (isAgentRoute) {
      const fetchAgentProperties = async () => {
        try {
          setAgentLoading(true);
          setAgentError(null);
          console.log('Properties component - Fetching agent properties...');
          const [fetchedProperties, fetchedTenants] = await Promise.all([
            agentService.getProperties(),
            agentService.getTenants()
          ]);
          console.log('Properties component - Agent properties fetched:', fetchedProperties);
          setAgentProperties(fetchedProperties);
          setAgentTenants(Array.isArray(fetchedTenants) ? fetchedTenants : []);
        } catch (err) {
          console.error('Error fetching agent properties:', err);
          setAgentError(err instanceof Error ? err.message : 'Failed to fetch properties');
        } finally {
          setAgentLoading(false);
        }
      };
      
      fetchAgentProperties();
    }
  }, [isAgentRoute]);

  function getId(id: any): string {
    if (!id) return '';
    if (typeof id === 'string') return id;
    if (typeof id === 'object') {
      if ((id as any).$oid) return (id as any).$oid as string;
      if ((id as any)._id) return String((id as any)._id);
    }
    return '';
  }

  function getPropertyDisplayStatus(property: Property): Property['status'] {
    // Admin routes should reflect the backend status exactly
    if (isAdminRoute) {
      return property.status;
    }
    // Agent routes: if marked rented but there is no active tenant, show as available
    if (isAgentRoute && property.status === 'rented') {
      const pid = getId(property._id);
      const hasActiveTenant = agentTenants.some((t) => {
        const singlePropertyId = getId((t as any).propertyId);
        const multiPropertyIds = Array.isArray((t as any).propertyIds)
          ? ((t as any).propertyIds as any[]).map((id) => getId(id))
          : [];
        const isLinked = singlePropertyId === pid || multiPropertyIds.includes(pid);
        return isLinked && t.status === 'Active';
      });
      if (!hasActiveTenant) return 'available';
    }
    return property.status;
  }

  const handleAddProperty = async (propertyData: PropertyFormData) => {
    try {
      // Validate user authentication and details
      if (!user?._id) {
        throw new Error('You must be logged in to add a property');
      }

      if (!user?.companyId) {
        throw new Error('Company ID not found. Please ensure you are associated with a company.');
      }

      // Check if user can create properties based on role and route
      const canCreate = ['admin', 'owner', 'agent'].includes(user?.role || '');
      if (!canCreate) {
        throw new Error('Access denied. Admin, Owner, or Agent role required to create properties.');
      }

      if (isAdminRoute) {
        // Use admin dashboard service for admin routes
        console.log('Properties: Using admin dashboard service for property creation');
        console.log('Properties: User details:', { 
          id: user._id, 
          role: user.role, 
          companyId: user.companyId,
          name: `${user.firstName} ${user.lastName}`,
          email: user.email
        });
        console.log('Properties: Company details:', company);

        const newProperty = await adminAddProperty(propertyData, user, company);
        console.log('Properties: Property created via admin service:', newProperty);
        
        // Update local state
        setAdminProperties(prev => [...prev, newProperty]);
      } else if (isAgentRoute) {
        // Use agent service for agent routes
        console.log('Properties: Using agent service for property creation');
        console.log('Properties: User details:', { 
          id: user._id, 
          role: user.role, 
          companyId: user.companyId,
          name: `${user.firstName} ${user.lastName}`,
          email: user.email
        });

        const newProperty = await agentService.createProperty(propertyData);
        console.log('Properties: Property created via agent service:', newProperty);
        
        // Update local state
        setAgentProperties(prev => [...prev, newProperty]);
      } else {
        // Use context for non-admin/agent routes
        const propertyToCreate = {
          ...propertyData,
          ownerId: user._id,
          companyId: user.companyId,
          type: propertyData.type || 'apartment',
          status: propertyData.status || 'available',
          description: propertyData.description || '',
          rent: propertyData.rent || 0,
          bedrooms: propertyData.bedrooms || 0,
          bathrooms: propertyData.bathrooms || 0,
          area: propertyData.area || 0,
          images: propertyData.images || [],
          amenities: propertyData.amenities || [],
          createdAt: new Date(),
          updatedAt: new Date()
        } as Property;

        await contextAddProperty(propertyToCreate);
      }
      
      setShowForm(false);
    } catch (error: any) {
      console.error('Error creating property:', error);
      
      // Show error to user
      const errorMessage = error.message || 'Failed to create property';
      alert(`Error: ${errorMessage}`);
      
      // You might want to show this error to the user via a toast or alert
    }
  };

  const handleUpdateProperty = async (property: Property) => {
    if (!user?._id) {
      console.error('You must be logged in to update a property');
      return;
    }

    if (!user?.companyId) {
      console.error('Company ID not found. Please ensure you are associated with a company.');
      return;
    }

    try {
      const { _id, ...updateData } = property;
      
      if (isAdminRoute) {
        // Use admin dashboard service for admin routes
        console.log('Properties: Using admin dashboard service for property update');
        const updatedProperty = await adminUpdateProperty(_id, updateData, user);
        console.log('Properties: Property updated via admin service:', updatedProperty);
        
        // Update local state
        setAdminProperties(prev => prev.map(p => p._id === _id ? updatedProperty : p));
      } else if (isAgentRoute) {
        // Agent route: call agent endpoint to update own property
        const updated = await agentService.updateProperty(_id, updateData);
        setAgentProperties(prev => prev.map(p => p._id === _id ? (updated as any) : p));
      } else {
        // Use context for non-admin/agent routes
        await contextUpdateProperty(_id, {
          ...updateData,
          companyId: user.companyId
        });
      }
    } catch (err) {
      console.error('Error updating property:', err);
    }
  };

  const handleDeleteProperty = async (propertyId: string) => {
    if (!user?._id) {
      console.error('You must be logged in to delete a property');
      return;
    }

    if (!user?.companyId) {
      console.error('Company ID not found. Please ensure you are associated with a company.');
      return;
    }

    try {
      if (isAdminRoute) {
        // Use admin dashboard service for admin routes
        console.log('Properties: Using admin dashboard service for property deletion');
        await adminDeleteProperty(propertyId, user);
        console.log('Properties: Property deleted via admin service');
        
        // Update local state
        setAdminProperties(prev => prev.filter(p => p._id !== propertyId));
      } else {
        // Use context for non-admin routes
        await contextDeleteProperty(propertyId);
      }
    } catch (err) {
      console.error('Error deleting property:', err);
    }
  };

  const filteredProperties = properties?.filter(property => {
    const displayStatus = getPropertyDisplayStatus(property);
    const matchesStatus = filters.status === 'all' || displayStatus === filters.status;
    const matchesLocation = !filters.location || 
      property.address.toLowerCase().includes(filters.location.toLowerCase());
    const matchesRent = property.rent >= filters.rentRange.min && 
      property.rent <= filters.rentRange.max;
    const matchesSearch = !searchQuery || 
      property.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      property.address.toLowerCase().includes(searchQuery.toLowerCase());
    const isSale = property.rentalType === 'sale';
    const matchesListing = listingFilter === 'all' || (listingFilter === 'sale' ? isSale : !isSale);

    return matchesStatus && matchesLocation && matchesRent && matchesSearch && matchesListing;
  }) || [];

  // Map properties to include display status for the list rendering
  const propertiesForList = filteredProperties.map(p => ({ ...p, status: getPropertyDisplayStatus(p) }));

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Properties
      </Typography>
      
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      
      {user && !user.companyId && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          You need to be associated with a company to add properties. Please contact your administrator.
        </Alert>
      )}
      
      {user && user.companyId && !['admin', 'owner'].includes(user.role || '') && !isAgentRoute && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Only administrators and property owners can add properties. Your current role: {user.role}
        </Alert>
      )}

      {/* Display user and company information for debugging */}
      {isAdminRoute && user && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <strong>User Details:</strong> {user.firstName} {user.lastName} ({user.email}) - Role: {user.role}
          {company && (
            <><br /><strong>Company:</strong> {company.name}</>
          )}
        </Alert>
      )}
      
      <div className="properties-page">
        {limitReached && (
          <Alert severity="info" sx={{ mb: 2 }}>
            You have reached your property limit ({planLimit}). Upgrade your plan in Settings to add more properties.
          </Alert>
        )}
        <div className="properties-header">
          <h1>Properties</h1>
          <div className="properties-actions">
            <div className="search-bar">
              <FontAwesomeIcon icon={faSearch} />
              <input
                type="text"
                placeholder="Search properties..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="listing-filter">
              <select
                value={listingFilter}
                onChange={(e) => setListingFilter(e.target.value as 'all' | 'rental' | 'sale')}
              >
                <option value="all">All</option>
                <option value="rental">Rentals</option>
                <option value="sale">Sales</option>
              </select>
            </div>
            <button 
              className="filter-button"
              onClick={() => setShowFilter(!showFilter)}
            >
              <FontAwesomeIcon icon={faFilter} />
              Filters
            </button>
            <button 
              className="add-button"
              onClick={() => setShowForm(true)}
              disabled={!user?.companyId || !['admin', 'owner', 'agent'].includes(user?.role || '') || limitReached}
              title={!user?.companyId ? 'Company association required' : 
                     !['admin', 'owner', 'agent'].includes(user?.role || '') ? 'Admin, Owner, or Agent role required' : 
                     (limitReached ? 'Property limit reached. Upgrade plan to add more.' : 'Add new property')}
            >
              <FontAwesomeIcon icon={faPlus} />
              Add Property
            </button>
          </div>
        </div>

        {showFilter && (
          <PropertyFilter
            filters={filters}
            onFilterChange={setFilters}
            onClose={() => setShowFilter(false)}
          />
        )}

        {showForm && (
          <PropertyForm
            onSubmit={handleAddProperty}
            initialData={undefined}
            onClose={() => setShowForm(false)}
          />
        )}

        <PropertyList
          properties={propertiesForList}
          onPropertyClick={handleUpdateProperty}
          onDeleteProperty={handleDeleteProperty}
          onAddProperty={() => setShowForm(true)}
        />
      </div>
    </Box>
  );
}; 