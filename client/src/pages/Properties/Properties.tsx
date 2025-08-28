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
import { useProperties } from '../../contexts/PropertyContext';
import { useAdminDashboardService } from '../../services/adminDashboardService';
import { useLocation } from 'react-router-dom';
import agentService from '../../services/agentService';

export const Properties: React.FC = () => {
  const { user, company } = useAuth();
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

  // Fetch agent properties when on agent route
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
          const fetchedProperties = await agentService.getProperties();
          console.log('Properties component - Agent properties fetched:', fetchedProperties);
          setAgentProperties(fetchedProperties);
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
    const matchesStatus = filters.status === 'all' || property.status === filters.status;
    const matchesLocation = !filters.location || 
      property.address.toLowerCase().includes(filters.location.toLowerCase());
    const matchesRent = property.rent >= filters.rentRange.min && 
      property.rent <= filters.rentRange.max;
    const matchesSearch = !searchQuery || 
      property.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      property.address.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesStatus && matchesLocation && matchesRent && matchesSearch;
  }) || [];

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
              disabled={!user?.companyId || !['admin', 'owner', 'agent'].includes(user?.role || '')}
              title={!user?.companyId ? 'Company association required' : 
                     !['admin', 'owner', 'agent'].includes(user?.role || '') ? 'Admin, Owner, or Agent role required' : 
                     'Add new property'}
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
          properties={filteredProperties}
          onPropertyClick={handleUpdateProperty}
          onDeleteProperty={handleDeleteProperty}
          onAddProperty={() => setShowForm(true)}
        />
      </div>
    </Box>
  );
}; 