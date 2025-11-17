import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, Typography, Grid, CircularProgress, Box, Button, TextField, Chip } from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import { Property } from '../../types/property';
import { usePropertyService } from '../../services/propertyService';

const PropertyAccountsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { searchPublicProperties } = usePropertyService() as any;
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const loadPage = async (opts?: { reset?: boolean }) => {
    const reset = !!opts?.reset;
    try {
      if (reset) {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }
      const currentPage = reset ? 1 : page;
      const res = await searchPublicProperties({
        q: searchQuery.trim() || undefined,
        limit: pageSize,
        page: currentPage,
        fields: 'name,address,rentalType,price,rent,propertyOwnerId'
      });
      const list = Array.isArray(res) ? res : [];
      if (reset) {
        setProperties(list as any);
        setPage(2);
      } else {
        setProperties(prev => [...prev, ...(list as any)]);
        setPage(currentPage + 1);
      }
      setHasMore(list.length === pageSize);
    } catch (err: any) {
      console.error('Error fetching properties (paginated):', err);
      setError('Failed to load properties');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    loadPage({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce server-side search
  useEffect(() => {
    const handle = setTimeout(() => {
      loadPage({ reset: true });
    }, 400);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const handlePropertyClick = (propertyId: string) => {
    const prop = properties.find(p => p._id === propertyId) as any;
    const isSale = prop && (prop.rentalType === 'sale');
    navigate(`/accountant-dashboard/property-accounts/${propertyId}${isSale ? '?ledger=sale' : ''}`);
  };

  if (loading) {
    return <Box display="flex" justifyContent="center" alignItems="center" minHeight="300px"><CircularProgress /></Box>;
  }
  if (error) {
    return <Box color="error.main">{error}</Box>;
  }

  const visibleProperties = properties;

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
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Typography variant="h6">{property.name}</Typography>
                  <Chip
                    label={property.rentalType === 'sale' ? 'Sale Ledger' : 'Rental Ledger'}
                    color={property.rentalType === 'sale' ? 'secondary' : 'primary'}
                    size="small"
                  />
                </Box>
                <Typography variant="body2" color="text.secondary">{property.address}</Typography>
                <Typography variant="body2">
                  {property.rentalType === 'sale'
                    ? `Sale Price: $${Number(property.price ?? 0).toLocaleString()}`
                    : `Rental Amount: $${Number(property.rent ?? 0).toLocaleString()}`}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
        {hasMore && (
          <Grid item xs={12} display="flex" justifyContent="center">
            <Button variant="outlined" onClick={() => loadPage()} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </Button>
          </Grid>
        )}
      </Grid>
    </Box>
  );
  };
  
  export default PropertyAccountsPage; 