import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  CircularProgress
} from '@mui/material';
import { Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { useCompany } from '../../contexts/CompanyContext';
import { useNavigate } from 'react-router-dom';
import { useAdminDashboardService } from '../../services/adminDashboardService';
import agentService from '../../services/agentService';
import { Tenant, TenantFormData, TenantStatus } from '../../types/tenant';
import { TenantForm } from '../../components/tenants/TenantForm';
import { AuthErrorReport } from '../../components/AuthErrorReport';

export const Tenants: React.FC = () => {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const { company, loading: companyLoading } = useCompany();
  const navigate = useNavigate();
  const adminDashboardService = useAdminDashboardService();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadTenants();
  }, []);

  const loadTenants = async () => {
    try {
      setIsLoading(true);
      console.log('Tenants component: Loading tenants using admin dashboard service');
      console.log('Tenants component: User context:', { user, company });
      
      const tenants = await adminDashboardService.getAdminDashboardTenants();
      setTenants(tenants);
      console.log('Tenants component: Successfully loaded tenants:', tenants.length);
    } catch (err) {
      setError('Failed to load tenants');
      console.error('Error loading tenants:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddTenant = () => {
    setSelectedTenant(null);
    setIsFormOpen(true);
  };

  const handleEditTenant = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setIsFormOpen(true);
  };

  const handleDelete = async (tenantId: string) => {
    try {
      console.log('Tenants component: Deleting tenant with ID:', tenantId);
      console.log('Tenants component: User context for deletion:', { user, company });
      
      await adminDashboardService.deleteTenant(tenantId, user);
      await loadTenants();
      console.log('Tenants component: Tenant deleted successfully');
    } catch (err) {
      setError('Failed to delete tenant');
      console.error('Error deleting tenant:', err);
    }
  };

  const handleFormSubmit = async (formData: TenantFormData) => {
    if (!user) return;
    try {
      console.log('Tenants component: Form submission with data:', formData);
      console.log('Tenants component: User and company context:', { user, company });
      
      const tenantData = {
        ...formData,
        status: formData.status || 'Active' as TenantStatus
      };

      if (selectedTenant) {
        console.log('Tenants component: Updating existing tenant:', selectedTenant._id);
        await adminDashboardService.updateTenant(selectedTenant._id, tenantData, user);
      } else {
        console.log('Tenants component: Creating new tenant');
        if (user!.role === 'agent') {
          await agentService.createTenant(tenantData);
        } else {
          await adminDashboardService.addTenant(tenantData, user!, company);
        }
      }
      setIsFormOpen(false);
      setSelectedTenant(null);
      await loadTenants();
      console.log('Tenants component: Tenant operation completed successfully');
    } catch (err) {
      setError('Failed to save tenant');
      console.error('Error saving tenant:', err);
    }
  };

  // Show loading state while auth/company data is loading
  if (authLoading || companyLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  // Show error if not authenticated
  if (!isAuthenticated || !user) {
    return (
      <AuthErrorReport 
        error="Authentication required. Please log in to access the tenants page."
        onLogin={() => navigate('/login')}
      />
    );
  }

  // Show user and company info for debugging
  console.log('Tenants component: Rendering with user and company data:', {
    user: {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      companyId: user.companyId
    },
    company: {
      _id: company?._id,
      name: company?.name
    }
  });

  return (
    <Box p={3}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Tenants</Typography>
        <Button variant="contained" color="primary" onClick={handleAddTenant}>
          Add Tenant
        </Button>
      </Box>

      {/* Display user and company info for debugging */}
      <Box mb={2} p={2} bgcolor="grey.100" borderRadius={1}>
        <Typography variant="body2" color="textSecondary">
          <strong>User:</strong> {user.firstName} {user.lastName} ({user.email}) - {user.role}
        </Typography>
        <Typography variant="body2" color="textSecondary">
          <strong>Company:</strong> {company?.name || 'No company'} (ID: {user.companyId})
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box mb={2}>
        <TextField
          fullWidth
          variant="outlined"
          placeholder="Search tenants..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Box>

      {isLoading ? (
        <Box display="flex" justifyContent="center" p={3}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Phone</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tenants.map((tenant) => (
                <TableRow key={tenant._id}>
                  <TableCell>{`${tenant.firstName} ${tenant.lastName}`}</TableCell>
                  <TableCell>{tenant.email}</TableCell>
                  <TableCell>{tenant.phone}</TableCell>
                  <TableCell>{tenant.status}</TableCell>
                  <TableCell>
                    <IconButton onClick={() => handleEditTenant(tenant)}>
                      <EditIcon />
                    </IconButton>
                    <IconButton onClick={() => handleDelete(tenant._id)}>
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <TenantForm
        open={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleFormSubmit}
        initialData={selectedTenant ? {
          firstName: selectedTenant.firstName,
          lastName: selectedTenant.lastName,
          email: selectedTenant.email,
          phone: selectedTenant.phone,
          status: selectedTenant.status,
          propertyId: (selectedTenant as any)?.propertyId as any,
          idNumber: selectedTenant.idNumber,
          emergencyContact: selectedTenant.emergencyContact,
          companyId: selectedTenant.companyId
        } : undefined}
      />
    </Box>
  );
};

export default Tenants; 