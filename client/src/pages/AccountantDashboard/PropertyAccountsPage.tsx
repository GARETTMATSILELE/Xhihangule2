import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, Typography, Grid, CircularProgress, Box, Button } from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import { Property } from '../../types/property';
import { usePropertyService } from '../../services/propertyService';
import { useLeaseService } from '../../services/leaseService';
import { useTenantService } from '../../services/tenantService';

const PropertyAccountsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { getProperties } = usePropertyService();
  const { getAllPublic: getAllLeases } = useLeaseService();
  const { getAllPublic: getAllTenants } = useTenantService();
  const [tenantMap, setTenantMap] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchProperties = async () => {
      try {
        setLoading(true);
        setError(null);
        // Use propertyService for accountants
        const props = await getProperties();
        setProperties(props);
        // Fetch all active leases and tenants
        const leases = await getAllLeases();
        const tenantsResp = await getAllTenants();
        const tenants = tenantsResp.tenants || tenantsResp;
        // Map propertyId to tenant name for active leases
        const map: Record<string, string> = {};
        leases.forEach((lease: any) => {
          if (lease.status === 'active' && lease.propertyId && lease.tenantId) {
            const tenant = tenants.find((t: any) => t._id === (lease.tenantId._id || lease.tenantId));
            if (tenant) {
              map[lease.propertyId._id || lease.propertyId] = `${tenant.firstName} ${tenant.lastName}`;
            }
          }
        });
        setTenantMap(map);
      } catch (err: any) {
        setError('Failed to fetch properties');
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
                <Typography variant="body2" sx={{ mt: 1 }}>Tenant: {tenantMap[property._id] || 'N/A'}</Typography>
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