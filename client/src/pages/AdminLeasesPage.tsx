import React, { useState, useEffect, useCallback } from 'react';
import { 
  Box, 
  Typography, 
  Button, 
  CircularProgress, 
  Alert, 
  Grid, 
  Card, 
  CardContent,
  Container,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  InputAdornment
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  FilterList as FilterListIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { useLeaseService } from '../services/leaseService';
import { usePropertyService } from '../services/propertyService';
import { useTenantService } from '../services/tenantService';
import { useCompany } from '../contexts/CompanyContext';
import { Lease, LeaseStatus, LeaseFormData } from '../types/lease';
import { Property } from '../types/property';
import { Tenant } from '../types/tenant';
import LeaseForm from '../components/leases/LeaseForm';

const AdminLeasesPage: React.FC = () => {
  const { user, company, isAuthenticated, loading: authLoading } = useAuth();
  const leaseService = useLeaseService();
  const propertyService = usePropertyService();
  const tenantService = useTenantService();
  const { company: companyInfo } = useCompany();

  const [leases, setLeases] = useState<Lease[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedLease, setSelectedLease] = useState<Lease | null>(null);
  const [filters, setFilters] = useState({
    status: 'all',
    property: 'all',
    search: ''
  });

  // Load data when component mounts or when user/company changes
  const loadData = useCallback(async () => {
    if (!user?.companyId) {
      setError('Please log in to manage leases.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [leasesRes, propertiesRes, tenantsRes] = await Promise.all([
        leaseService.getAll(),
        // For INDIVIDUAL plan, restrict to company-scoped properties
        (companyInfo as any)?.plan === 'INDIVIDUAL' ? propertyService.getProperties() : propertyService.getPublicProperties(),
        // For INDIVIDUAL plan, restrict to company-scoped tenants
        (companyInfo as any)?.plan === 'INDIVIDUAL' ? tenantService.getAll() : tenantService.getAllPublic()
      ]);

      setLeases(leasesRes || []);
      setProperties(propertiesRes || []);
      setTenants((tenantsRes as any)?.tenants || []);
    } catch (error) {
      console.error('Error loading lease data:', error);
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

  const handleFormSubmit = async (formData: LeaseFormData) => {
    if (!user?.companyId) {
      setError('Please log in to manage leases.');
      return;
    }

    try {
      setError(null);
      
      // Validate required fields
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

      console.log('Form data being submitted:', formData);
      
      // Send the full form data since server now supports all fields
      const serverData = {
        ...formData,
        // Ensure required fields are properly set - handle 0 values correctly
        rentAmount: formData.monthlyRent !== undefined ? formData.monthlyRent : formData.rentAmount,
        depositAmount: formData.securityDeposit !== undefined ? formData.securityDeposit : formData.depositAmount,
        status: formData.status || 'active'
      };

      console.log('Server data being sent:', serverData);

      // Ensure dates are properly formatted
      const finalServerData = {
        ...serverData,
        startDate: serverData.startDate ? new Date(serverData.startDate).toISOString() : '',
        endDate: serverData.endDate ? new Date(serverData.endDate).toISOString() : ''
      };

      console.log('Final server data with formatted dates:', finalServerData);

      if (selectedLease) {
        await leaseService.update(selectedLease._id, finalServerData);
      } else {
        await leaseService.create(finalServerData);
      }
      setDialogOpen(false);
      setSelectedLease(null);
      await loadData();
    } catch (error) {
      console.error('Error saving lease:', error);
      setError(error instanceof Error ? error.message : 'Failed to save lease. Please try again later.');
    }
  };

  const handleEditLease = (lease: Lease) => {
    if (!isAuthenticated) {
      setError('Please log in to manage leases.');
      return;
    }
    setSelectedLease(lease);
    setDialogOpen(true);
  };

  const handleDeleteLease = async (id: string) => {
    if (!isAuthenticated) {
      setError('Please log in to manage leases.');
      return;
    }

    if (!window.confirm('Are you sure you want to delete this lease?')) {
      return;
    }

    try {
      setError(null);
      await leaseService.delete(id);
      await loadData();
    } catch (error) {
      console.error('Error deleting lease:', error);
      setError(error instanceof Error ? error.message : 'Failed to delete lease. Please try again later.');
    }
  };

  const handleStatusChange = async (id: string, status: LeaseStatus) => {
    if (!isAuthenticated) {
      setError('Please log in to manage leases.');
      return;
    }

    try {
      setError(null);
      await leaseService.update(id, { status });
      await loadData();
    } catch (error) {
      console.error('Error updating lease status:', error);
      setError(error instanceof Error ? error.message : 'Failed to update lease status. Please try again later.');
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
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Leases Management
          </Typography>
          {company && (
            <Typography variant="body2" color="text.secondary">
              Company: {company.name}
            </Typography>
          )}
        </Box>
        <Button 
          variant="contained" 
          color="primary" 
          startIcon={<AddIcon />}
          onClick={() => {
            setSelectedLease(null);
            setDialogOpen(true);
          }}
          disabled={!isAuthenticated}
        >
          Add Lease
        </Button>
      </Box>

      {/* Error Display */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Filters */}
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

      {/* Leases Table */}
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
                    const property = properties.find(p => p._id === lease.propertyId);
                    const tenant = tenants.find(t => t._id === lease.tenantId);
                    
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

      {/* Lease Form Dialog */}
      <LeaseForm
        key={selectedLease?._id || 'new-lease'} // Force re-render when switching between new/edit
        open={dialogOpen}
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
    </Container>
  );
};

export default AdminLeasesPage; 