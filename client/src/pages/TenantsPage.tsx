import React, { useState, useEffect } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { TenantFormData, TenantStatus } from '../types/tenant';
import { useTenantService } from '../services/tenantService';
import { TenantList } from '../components/tenants/TenantList';
import { TenantForm } from '../components/tenants/TenantForm';
import { useCompany } from '../contexts/CompanyContext';
import { Tenant } from '../types/tenant';

export const TenantsPage: React.FC = () => {
  const { company } = useCompany();
  const tenantService = useTenantService();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const loadTenants = async () => {
    try {
      setLoading(true);
      const { tenants } = await tenantService.getAll();
      setTenants(tenants);
    } catch (err) {
      setError('Failed to load tenants');
      console.error('Error loading tenants:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTenants();
  }, [page, search]);

  const handleAddTenant = () => {
    setSelectedTenant(null);
    setIsFormOpen(true);
  };

  const handleEditTenant = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setIsFormOpen(true);
  };

  const handleDelete = async (tenant: Tenant) => {
    try {
      await tenantService.delete(tenant._id);
      await loadTenants();
    } catch (err) {
      setError('Failed to delete tenant');
      console.error('Error deleting tenant:', err);
    }
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setSelectedTenant(null);
  };

  const handleFormSubmit = async (formData: TenantFormData) => {
    try {
      const tenantData = {
        ...formData,
        status: formData.status || 'Active' as TenantStatus
      };
      
      if (selectedTenant) {
        await tenantService.update(selectedTenant._id, tenantData);
      } else {
        await tenantService.create(tenantData);
      }
      setIsFormOpen(false);
      setSelectedTenant(null);
      await loadTenants();
    } catch (err) {
      setError('Failed to save tenant');
      console.error('Error saving tenant:', err);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h4">Tenants</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAddTenant}
        >
          Add Tenant
        </Button>
      </Box>

      {error && (
        <Typography color="error" sx={{ mb: 2 }}>
          {error}
        </Typography>
      )}

      <TenantList
        tenants={tenants}
        onTenantClick={handleEditTenant}
        onAddTenant={handleAddTenant}
        onEndTenancy={handleDelete}
        onRefresh={loadTenants}
        loading={loading}
      />

      <TenantForm
        open={isFormOpen}
        onClose={handleFormClose}
        onSubmit={handleFormSubmit}
        initialData={selectedTenant || undefined}
      />
    </Box>
  );
}; 