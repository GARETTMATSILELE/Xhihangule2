import React, { useState, useEffect, useCallback } from 'react';
import { 
  Box, Typography, Button, CircularProgress, Alert, Grid, Card, CardContent, Container, IconButton, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip, FormControl, InputLabel, Select, MenuItem, TextField, InputAdornment
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, Search as SearchIcon } from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { useLeaseService } from '../../services/leaseService';
import { usePropertyService } from '../../services/propertyService';
import { useTenantService } from '../../services/tenantService';
import { Lease, LeaseStatus, LeaseFormData } from '../../types/lease';
import { Property } from '../../types/property';
import { Tenant } from '../../types/tenant';
import LeaseForm from '../leases/components/LeaseForm';
import { useNotification } from '../../components/Layout/Header';

// Helper to extract string id from propertyId (handles { $oid: string } or string)
function getId(id: any): string {
  if (!id) return '';
  if (typeof id === 'string') return id;
  if (typeof id === 'object' && id.$oid) return id.$oid;
  return '';
}

const AgentLeasesPage: React.FC = () => {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const leaseService = useLeaseService();
  const propertyService = usePropertyService();
  const tenantService = useTenantService();
  const { addNotification } = useNotification();

  const [leases, setLeases] = useState<Lease[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedLease, setSelectedLease] = useState<Lease | null>(null);
  const [filters, setFilters] = useState({ status: 'all', property: 'all', search: '' });

  // Load data for agent's own properties/tenants/leases
  const loadData = useCallback(async () => {
    if (!user?.companyId) {
      setError('Please log in to manage leases.');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      // Fetch only agent's properties and tenants
      const [leasesRes, propertiesRes, tenantsRes] = await Promise.all([
        leaseService.getAll(),
        propertyService.getProperties(),
        tenantService.getAll()
      ]);
      setLeases(leasesRes || []);
      setProperties(propertiesRes || []);
      setTenants(tenantsRes?.tenants || []);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load lease data. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, [user?.companyId]);

  useEffect(() => {
    if (!authLoading) {
      loadData();
    }
  }, [authLoading, loadData]);

  // Lease expiry notification effect
  useEffect(() => {
    if (!leases.length) return;
    const now = new Date();
    const notified = JSON.parse(localStorage.getItem('lease-expiry-notified') || '{}');
    let updated = false;
    leases.forEach(lease => {
      if (!lease.endDate) return;
      const end = new Date(lease.endDate);
      const diffMonths = (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth());
      const diffDays = Math.floor((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const propertyName = properties.find(p => p._id === lease.propertyId)?.name || 'Property';
      // 2 months
      if (diffMonths === 2 && !notified[lease._id + '-2mo']) {
        addNotification({
          id: `lease-${lease._id}-2mo`,
          title: 'Lease Expiry Notice',
          message: `Lease for ${propertyName} is expiring in 2 months (${end.toLocaleDateString()})`,
          link: '/agent-dashboard/leases',
          read: false,
          createdAt: new Date(),
        });
        notified[lease._id + '-2mo'] = true;
        updated = true;
      }
      // 1 month
      if (diffMonths === 1 && !notified[lease._id + '-1mo']) {
        addNotification({
          id: `lease-${lease._id}-1mo`,
          title: 'Lease Expiry Notice',
          message: `Lease for ${propertyName} is expiring in 1 month (${end.toLocaleDateString()})`,
          link: '/agent-dashboard/leases',
          read: false,
          createdAt: new Date(),
        });
        notified[lease._id + '-1mo'] = true;
        updated = true;
      }
    });
    if (updated) {
      localStorage.setItem('lease-expiry-notified', JSON.stringify(notified));
    }
  }, [leases, properties, addNotification]);

  const handleFormSubmit = async (formData: LeaseFormData) => {
    if (!user?.companyId) {
      setError('Please log in to manage leases.');
      return;
    }
    try {
      setError(null);
      if (!formData.propertyId || !formData.tenantId || !formData.startDate || !formData.endDate) {
        setError('Please fill in all required fields: Property, Tenant, Start Date, and End Date.');
        return;
      }
      if (formData.monthlyRent === undefined || formData.monthlyRent === null || formData.monthlyRent <= 0) {
        setError('Please enter a valid monthly rent amount.');
        return;
      }
      if (formData.securityDeposit === undefined || formData.securityDeposit === null || formData.securityDeposit < 0) {
        setError('Please enter a valid security deposit amount.');
        return;
      }
      const serverData = {
        ...formData,
        rentAmount: formData.monthlyRent !== undefined ? formData.monthlyRent : formData.rentAmount,
        depositAmount: formData.securityDeposit !== undefined ? formData.securityDeposit : formData.depositAmount,
        status: formData.status || 'active',
        ownerId: user._id // Add the logged-in agent's ID as ownerId
      };
      const finalServerData = {
        ...serverData,
        startDate: serverData.startDate ? new Date(serverData.startDate).toISOString() : '',
        endDate: serverData.endDate ? new Date(serverData.endDate).toISOString() : ''
      };
      if (selectedLease) {
        await leaseService.update(selectedLease._id, finalServerData);
      } else {
        await leaseService.create(finalServerData);
      }
      setDialogOpen(false);
      setSelectedLease(null);
      await loadData();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to save lease. Please try again later.');
    }
  };

  const handleEditLease = (lease: Lease) => {
    setSelectedLease(lease);
    setDialogOpen(true);
  };

  const handleDeleteLease = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this lease?')) {
      return;
    }
    try {
      setError(null);
      await leaseService.delete(id);
      await loadData();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to delete lease. Please try again later.');
    }
  };

  const handleFilterChange = (filterType: string) => (event: any) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: event.target.value
    }));
  };

  const filteredLeases = leases.filter(lease => {
    const property = properties.find(p => p._id === lease.propertyId);
    const tenant = tenants.find(t => t._id === lease.tenantId);
    const matchesStatus = filters.status === 'all' || lease.status === filters.status;
    const matchesProperty = filters.property === 'all' || lease.propertyId === filters.property;
    const matchesSearch = !filters.search || 
      (property?.name?.toLowerCase().includes(filters.search.toLowerCase()) ||
       tenant?.firstName?.toLowerCase().includes(filters.search.toLowerCase()) ||
       tenant?.lastName?.toLowerCase().includes(filters.search.toLowerCase()));
    return matchesStatus && matchesProperty && matchesSearch;
  });

  if (authLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (!isAuthenticated) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Alert severity="warning">
          Please log in to access the leases management page.
        </Alert>
      </Container>
    );
  }
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            My Leases
          </Typography>
        </Box>
        <Button 
          variant="contained" 
          color="primary" 
          startIcon={<AddIcon />}
          onClick={() => {
            setSelectedLease(null);
            setDialogOpen(true);
          }}
        >
          Add Lease
        </Button>
      </Box>
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={3}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  value={filters.status}
                  label="Status"
                  onChange={handleFilterChange('status')}
                >
                  <MenuItem value="all">All Statuses</MenuItem>
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="expired">Expired</MenuItem>
                  <MenuItem value="terminated">Terminated</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={3}>
              <FormControl fullWidth>
                <InputLabel>Property</InputLabel>
                <Select
                  value={filters.property}
                  label="Property"
                  onChange={handleFilterChange('property')}
                >
                  <MenuItem value="all">All Properties</MenuItem>
                  {properties.map(property => (
                    <MenuItem key={property._id} value={property._id}>
                      {property.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Search"
                placeholder="Search by property or tenant name..."
                value={filters.search}
                onChange={handleFilterChange('search')}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Property</TableCell>
                  <TableCell>Tenant</TableCell>
                  <TableCell>Start Date</TableCell>
                  <TableCell>End Date</TableCell>
                  <TableCell>Rent Amount</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredLeases.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      <Typography variant="body2" color="text.secondary">
                        No leases found
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLeases.map((lease) => {
                    const propertyId = getId(lease.propertyId);
                    const property = properties.find(p => getId(p._id) === propertyId);
                    const tenantId = getId(lease.tenantId);
                    const tenant = tenants.find(t => getId(t._id) === tenantId);
                    return (
                      <TableRow key={lease._id}>
                        <TableCell>
                          <Typography variant="body2" fontWeight="medium">
                            {property?.name || 'N/A'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {property?.address || ''}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {tenant ? `${tenant.firstName} ${tenant.lastName}` : 'N/A'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {tenant?.email || ''}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {new Date(lease.startDate).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          {new Date(lease.endDate).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight="medium">
                            ${lease.rentAmount?.toLocaleString() || 0}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip 
                            label={lease.status} 
                            color={
                              lease.status === 'active' ? 'success' : 
                              lease.status === 'expired' ? 'warning' : 
                              'default'
                            } 
                            size="small" 
                          />
                        </TableCell>
                        <TableCell>
                          <IconButton 
                            onClick={() => handleEditLease(lease)} 
                            size="small"
                            color="primary"
                          >
                            <EditIcon />
                          </IconButton>
                          <IconButton 
                            onClick={() => handleDeleteLease(lease._id)} 
                            size="small"
                            color="error"
                          >
                            <DeleteIcon />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
      {dialogOpen && (
        <LeaseForm
          key={selectedLease?._id || 'new-lease'}
          onCancel={() => {
            setDialogOpen(false);
            setSelectedLease(null);
          }}
          onSubmit={handleFormSubmit}
          properties={properties}
          tenants={tenants}
          initialData={selectedLease ? {
            propertyId: selectedLease.propertyId,
            tenantId: selectedLease.tenantId,
            startDate: selectedLease.startDate,
            endDate: selectedLease.endDate,
            rentAmount: selectedLease.rentAmount,
            depositAmount: selectedLease.depositAmount,
            status: selectedLease.status,
            monthlyRent: selectedLease.rentAmount,
            securityDeposit: selectedLease.depositAmount,
            petDeposit: 0,
            isPetAllowed: false,
            maxOccupants: 1,
            isUtilitiesIncluded: false,
            utilitiesDetails: '',
            rentDueDay: 1,
            lateFee: 0,
            gracePeriod: 0
          } : undefined}
        />
      )}
    </Container>
  );
};

export default AgentLeasesPage; 