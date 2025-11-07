import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, Typography, Grid, CircularProgress, Box, Button, TextField } from '@mui/material';
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
  const { getAllPublic: getAllPropertyOwners, getAll: getAllSalesOwners } = usePropertyOwnerService();
  const [tenantMap, setTenantMap] = useState<Record<string, string>>({});
  const [ownerMap, setOwnerMap] = useState<Record<string, string>>({});
  const [saleOwnerMap, setSaleOwnerMap] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchProperties = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Fetch properties, leases, tenants, and owners (rental + sales) in parallel
        const [props, leases, tenantsResp, rentalOwnersRaw, salesOwnersRaw] = await Promise.all([
          getProperties(),
          getAllLeases(),
          getAllTenants(),
          getAllPropertyOwners().catch(err => {
            console.error('Error fetching property owners:', err);
            return [] as any;
          }),
          getAllSalesOwners().catch(err => {
            console.error('Error fetching sales owners:', err);
            return { owners: [] } as any;
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
        
        // Normalize owners arrays from responses
        const rentalOwners: PropertyOwner[] = Array.isArray((rentalOwnersRaw as any)?.owners)
          ? (rentalOwnersRaw as any).owners
          : (Array.isArray(rentalOwnersRaw as any) ? (rentalOwnersRaw as any) : []);
        const salesOwners: PropertyOwner[] = Array.isArray((salesOwnersRaw as any)?.owners)
          ? (salesOwnersRaw as any).owners
          : (Array.isArray(salesOwnersRaw as any) ? (salesOwnersRaw as any) : []);

        // Map propertyId to owner name for rental owners
        const ownerMap: Record<string, string> = {};
        rentalOwners.forEach((owner: PropertyOwner) => {
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

        // Map sale propertyId -> owner name using property's propertyOwnerId
        const salesOwnerById: Record<string, PropertyOwner> = {};
        salesOwners.forEach((o: PropertyOwner) => { salesOwnerById[String((o as any)._id)] = o; });
        const saleOwnerMapLocal: Record<string, string> = {};
        (props || []).forEach((p: any) => {
          if ((p as any)?.rentalType === 'sale') {
            const raw = (p as any).propertyOwnerId;
            const ownerId = typeof raw === 'object' && raw && (raw as any).$oid ? (raw as any).$oid : (raw ? String(raw) : '');
            if (ownerId && salesOwnerById[ownerId]) {
              const o = salesOwnerById[ownerId];
              saleOwnerMapLocal[String((p as any)._id)] = `${o.firstName} ${o.lastName}`;
            }
          }
        });
        setSaleOwnerMap(saleOwnerMapLocal);
        
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

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visibleProperties = normalizedQuery
    ? properties.filter((property) => {
        const name = (property.name || '').toString().toLowerCase();
        const address = (property.address || '').toString().toLowerCase();
        const ownerName = (
          (property.rentalType === 'sale' ? saleOwnerMap[property._id] : ownerMap[property._id]) || ''
        ).toLowerCase();
        const tenantName = (tenantMap[property._id] || '').toLowerCase();
        return (
          name.includes(normalizedQuery) ||
          address.includes(normalizedQuery) ||
          ownerName.includes(normalizedQuery) ||
          tenantName.includes(normalizedQuery)
        );
      })
    : properties;

  return (
    <Box sx={{ width: '100%' }}>
      <Typography variant="h4" gutterBottom>Property Accounts</Typography>
      <Box sx={{ mb: 2 }}>
        <TextField
          fullWidth
          size="small"
          label="Search properties, owners, tenants"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </Box>
      <Grid container spacing={3}>
        {visibleProperties.length === 0 && (
          <Grid item xs={12}>
            <Typography variant="body2" color="text.secondary">No matching properties.</Typography>
          </Grid>
        )}
        {visibleProperties.map((property) => (
          <Grid item xs={12} md={6} lg={4} key={property._id}>
            <Card sx={{ cursor: 'pointer' }} onClick={() => handlePropertyClick(property._id)}>
              <CardContent>
                <Typography variant="h6">{property.name}</Typography>
                <Typography variant="body2" color="text.secondary">{property.address}</Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  Owner: {(property.rentalType === 'sale' ? saleOwnerMap[property._id] : ownerMap[property._id]) || 'N/A'}
                </Typography>
                <Typography variant="body2">
                  {property.rentalType === 'sale' ? 'Buyer' : 'Tenant'}: {tenantMap[property._id] || 'N/A'}
                </Typography>
                <Typography variant="body2">
                  {property.rentalType === 'sale'
                    ? `Sale Price: $${Number(property.price ?? 0).toLocaleString()}`
                    : `Rental Amount: $${Number(property.rent ?? 0).toLocaleString()}`}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
  };
  
  export default PropertyAccountsPage; 