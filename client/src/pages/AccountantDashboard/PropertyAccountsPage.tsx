import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, Typography, Grid, CircularProgress, Box, Button } from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import { Property } from '../../types/property';
import { usePropertyService } from '../../services/propertyService';
import { useLeaseService } from '../../services/leaseService';
import { useTenantService } from '../../services/tenantService';
import { usePropertyOwnerService, PropertyOwner } from '../../services/propertyOwnerService';

const PropertyAccountsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { getProperties } = usePropertyService();
  const { getAllPublic: getAllLeases } = useLeaseService();
  const { getAllPublic: getAllTenants } = useTenantService();
  const { getAllPublic: getAllPropertyOwners } = usePropertyOwnerService();
  const [tenantMap, setTenantMap] = useState<Record<string, string>>({});
  const [ownerMap, setOwnerMap] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchProperties = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Fetch properties, leases, tenants, and property owners in parallel
        const [props, leases, tenantsResp, propertyOwners] = await Promise.all([
          getProperties(),
          getAllLeases(),
          getAllTenants(),
          getAllPropertyOwners().catch(err => {
            console.error('Error fetching property owners:', err);
            return [];
          })
        ]);
        
        setProperties(props);
        const tenants = tenantsResp.tenants || tenantsResp;
        
        // Map propertyId to tenant name for active leases
        const tenantMap: Record<string, string> = {};
        leases.forEach((lease: any) => {
          if (lease.status === 'active' && lease.propertyId && lease.tenantId) {
            const tenant = tenants.find((t: any) => t._id === (lease.tenantId._id || lease.tenantId));
            if (tenant) {
              tenantMap[lease.propertyId._id || lease.propertyId] = `${tenant.firstName} ${tenant.lastName}`;
            }
          }
        });
        setTenantMap(tenantMap);
        
        // Map propertyId to owner name using owner.properties array
        const ownerMap: Record<string, string> = {};
        console.log('Property owners fetched:', propertyOwners.length);
        console.log('Properties fetched:', props.length);
        
        propertyOwners.forEach((owner: PropertyOwner) => {
          console.log(`Owner ${owner._id}: ${owner.firstName} ${owner.lastName}`);
          console.log('Owner properties:', owner.properties);
          
          // Check if owner has properties array
          if (owner.properties && Array.isArray(owner.properties)) {
            owner.properties.forEach((propertyId: any) => {
              // Handle both string and ObjectId formats
              const propId = typeof propertyId === 'object' && propertyId.$oid ? propertyId.$oid : propertyId;
              console.log(`Checking property ${propId} for owner ${owner.firstName} ${owner.lastName}`);
              ownerMap[propId] = `${owner.firstName} ${owner.lastName}`;
              console.log(`Mapped property ${propId} to owner ${owner.firstName} ${owner.lastName}`);
            });
          }
        });
        console.log('Final owner map:', ownerMap);
        setOwnerMap(ownerMap);
        
      } catch (err: any) {
        console.error('Error fetching data:', err);
        setError('Failed to fetch properties and related data');
      } finally {
        setLoading(false);
      }
    };
    fetchProperties();
  }, []);

  const handlePropertyClick = (propertyId: string) => {
    navigate(`/accountant-dashboard/property-accounts/${propertyId}`);
  };

  if (loading) {
    return <Box display="flex" justifyContent="center" alignItems="center" minHeight="300px"><CircularProgress /></Box>;
  }
  if (error) {
    return <Box color="error.main">{error}</Box>;
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>Property Accounts</Typography>
      <Grid container spacing={3}>
        {properties.map((property) => (
          <Grid item xs={12} md={6} lg={4} key={property._id}>
            <Card sx={{ cursor: 'pointer' }} onClick={() => handlePropertyClick(property._id)}>
              <CardContent>
                <Typography variant="h6">{property.name}</Typography>
                <Typography variant="body2" color="text.secondary">{property.address}</Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>Owner: {ownerMap[property._id] || 'N/A'}</Typography>
                <Typography variant="body2">Tenant: {tenantMap[property._id] || 'N/A'}</Typography>
                <Typography variant="body2">Rental Amount: ${property.rent?.toLocaleString() || '0'}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
  };
  
  export default PropertyAccountsPage; 