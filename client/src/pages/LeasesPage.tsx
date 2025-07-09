import React, { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Button, CircularProgress, Alert, Grid, Card, CardContent, Container } from '@mui/material';
import { LeaseList } from '../components/leases/LeaseList';
import LeaseForm from '../components/leases/LeaseForm';
import { useLeaseService } from '../services/leaseService';
import { usePropertyService } from '../services/propertyService';
import { useTenantService } from '../services/tenantService';
import { Lease, LeaseStatus } from '../types/lease';
import { Property } from '../types/property';
import { Tenant } from '../types/tenant';
import { LeaseFormData } from '../types/lease';
import { useAuth } from '../contexts/AuthContext';

interface LeasesResponse {
  leases?: Lease[];
}

interface TenantsResponse {
  tenants?: Tenant[];
}

const LeasesPage: React.FC = () => {
  const { user } = useAuth();
  const leaseService = useLeaseService();
  const propertyService = usePropertyService();
  const tenantService = useTenantService();
  const [leases, setLeases] = useState<Lease[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedLease, setSelectedLease] = useState<Lease | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const leasesData = await leaseService.getLeases({ status: 'all' }) as Lease[] | LeasesResponse;
      const propertiesData = await propertyService.getProperties();
      const tenantsData = await tenantService.getAll() as Tenant[] | TenantsResponse;

      // Handle leases data
      const processedLeases = Array.isArray(leasesData) 
        ? leasesData 
        : (leasesData?.leases || []);

      // Handle properties data
      const processedProperties = Array.isArray(propertiesData) 
        ? propertiesData 
        : [];

      // Handle tenants data
      const processedTenants = Array.isArray(tenantsData) 
        ? tenantsData 
        : (tenantsData?.tenants || []);

      setLeases(processedLeases);
      setProperties(processedProperties);
      setTenants(processedTenants);

      console.log('Loaded data:', {
        leases: processedLeases.length,
        properties: processedProperties.length,
        tenants: processedTenants.length
      });
    } catch (error) {
      console.error('Error loading data:', error);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleFormSubmit = async (formData: LeaseFormData) => {
    if (!user?.companyId) {
      setError('Please log in to manage leases.');
      return;
    }

    try {
      setError(null);
      if (selectedLease) {
        await leaseService.update(selectedLease._id, formData);
      } else {
        await leaseService.create(formData);
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
    if (!user?.companyId) {
      setError('Please log in to manage leases.');
      return;
    }
    setSelectedLease(lease);
    setDialogOpen(true);
  };

  const handleDeleteLease = async (id: string) => {
    if (!user?.companyId) {
      setError('Please log in to manage leases.');
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
    if (!user?.companyId) {
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

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
        <Button 
          variant="contained" 
          color="primary" 
          onClick={loadData}
          sx={{ mt: 2 }}
        >
          Retry
        </Button>
      </Box>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4">Leases</Typography>
        {user && (
          <Button 
            variant="contained" 
            color="primary" 
            onClick={() => {
              setSelectedLease(null);
              setDialogOpen(true);
            }}
          >
            Add Lease
          </Button>
        )}
      </Box>

      <LeaseList
        leases={leases}
        properties={properties}
        tenants={tenants}
        onEdit={handleEditLease}
        onDelete={handleDeleteLease}
        onStatusChange={handleStatusChange}
        isAuthenticated={!!user}
      />

      {user && (
        <LeaseForm
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
      )}
    </Container>
  );
};

export default LeasesPage; 