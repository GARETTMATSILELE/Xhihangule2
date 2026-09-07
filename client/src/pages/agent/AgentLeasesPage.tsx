import React, { useState, useEffect, useCallback } from 'react';
import { 
  Box, Typography, Button, CircularProgress, Alert, Grid, Card, CardContent, Container, IconButton, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip, FormControl, InputLabel, Select, MenuItem, TextField, InputAdornment, Tooltip, Stack
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, Search as SearchIcon, Autorenew as RenewIcon, Logout as MoveOutIcon, CheckCircle as CloseIcon } from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { useLocation } from 'react-router-dom';
import agentService from '../../services/agentService';
import { useLeaseService } from '../../services/leaseService';
import { Lease, LeaseStatus, LeaseFormData } from '../../types/lease';
import { Property } from '../../types/property';
import { Tenant } from '../../types/tenant';
import LeaseForm from '../leases/components/LeaseForm';
import { useNotification } from '../../components/Layout/Header';
import { OperationalEmptyState } from '../../components/rentalWorkflow';
import {
  buildLeaseLineage,
  getLeaseLifecycleStatus,
  isLeaseImmutable,
  leaseStatusLabels,
  leaseStatuses,
} from '../../utils/leaseLifecycle';

const notifyRentalWorkflowChanged = (entity: string) => {
  window.dispatchEvent(new CustomEvent('rental-workflow:changed', { detail: { entity } }));
};

// Helper to extract string id from propertyId (handles { $oid: string } or string)
function getId(id: any): string {
  if (!id) return '';
  if (typeof id === 'string') return id;
  if (typeof id === 'object') {
    if ((id as any).$oid) return (id as any).$oid as string;
    if ((id as any)._id) return String((id as any)._id);
  }
  return '';
}

function resolvePropertyFromLease(lease: any, properties: Property[]): Property | undefined {
  // If populated document present
  if (lease && lease.propertyId && typeof lease.propertyId === 'object' && (lease.propertyId as any).name) {
    const obj = lease.propertyId as any;
    return { ...(obj as any), _id: getId(obj) } as Property;
  }
  const pid = getId(lease?.propertyId);
  return properties.find(p => getId(p._id) === pid);
}

function resolveTenantFromLease(lease: any, tenants: Tenant[]): Tenant | undefined {
  if (lease && lease.tenantId && typeof lease.tenantId === 'object' && ((lease.tenantId as any).firstName || (lease.tenantId as any).email)) {
    const obj = lease.tenantId as any;
    return { ...(obj as any), _id: getId(obj) } as Tenant;
  }
  const tid = getId(lease?.tenantId);
  return tenants.find(t => getId(t._id) === tid);
}

function getPropertyLeaseDefaults(property?: Property): { rent: number; deposit: number } {
  const specs = ((property as any)?.propertySpecifications || {}) as Record<string, any>;
  const rent = Number((property as any)?.rent || (property as any)?.monthlyRent || 0);
  const explicitDeposit = Number(
    specs.depositAmount ??
    specs.securityDeposit ??
    specs.expectedDeposit ??
    (property as any)?.depositAmount ??
    (property as any)?.securityDeposit ??
    0
  );

  return {
    rent: Number.isFinite(rent) ? rent : 0,
    deposit: Number.isFinite(explicitDeposit) ? explicitDeposit : 0,
  };
}

const AgentLeasesPage: React.FC = () => {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const location = useLocation();
  // Use agent service to ensure data is scoped to the logged-in agent
  const { addNotification } = useNotification();
  const leaseService = useLeaseService();

  const [leases, setLeases] = useState<Lease[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedLease, setSelectedLease] = useState<Lease | null>(null);
  const [formMode, setFormMode] = useState<'create' | 'amend' | 'renew'>('create');
  const [filters, setFilters] = useState({ status: 'all', property: 'all', search: '' });
  const requestedPropertyId = new URLSearchParams(location.search).get('propertyId') || '';

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
      // Fetch only the agent's leases, properties, and tenants
      const [leasesRes, propertiesRes, tenantsRes] = await Promise.all([
        agentService.getLeases(),
        agentService.getProperties(),
        agentService.getTenants()
      ]);
      setLeases(Array.isArray(leasesRes) ? leasesRes : []);
      setProperties(Array.isArray(propertiesRes) ? propertiesRes : []);
      setTenants(Array.isArray(tenantsRes) ? tenantsRes : []);
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
      const property = resolvePropertyFromLease(lease, properties);
      const propertyName = property?.name || 'Property';
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
      if (selectedLease && formMode === 'renew') {
        await leaseService.renew(selectedLease._id, {
          ...finalServerData,
          previousLeaseId: selectedLease._id,
          status: formData.status || 'active',
        } as any);
        const propertyId = getId(formData.propertyId || selectedLease.propertyId);
        const property = properties.find(p => getId(p._id) === propertyId) || resolvePropertyFromLease(selectedLease, properties);
        const defaults = getPropertyLeaseDefaults(property);
        const nextRent = Number(formData.monthlyRent ?? formData.rentAmount ?? 0);
        const nextDeposit = Number(formData.securityDeposit ?? formData.depositAmount ?? 0);
        const rentChanged = Number.isFinite(nextRent) && nextRent !== defaults.rent;
        const depositChanged = Number.isFinite(nextDeposit) && nextDeposit !== defaults.deposit;

        if (property && (rentChanged || depositChanged)) {
          const shouldUpdateProperty = window.confirm(
            `Update this property's stored rent/deposit to match the renewal?\n\n` +
            `Property rent: ${defaults.rent} -> ${nextRent}\n` +
            `Property deposit: ${defaults.deposit} -> ${nextDeposit}`
          );

          if (shouldUpdateProperty) {
            await agentService.updateProperty(propertyId, {
              rent: nextRent,
              propertySpecifications: {
                ...(((property as any).propertySpecifications || {}) as Record<string, unknown>),
                depositAmount: nextDeposit,
                securityDeposit: nextDeposit,
              },
            } as any);
          }
        }
      } else if (selectedLease && formMode === 'amend') {
        await leaseService.update(selectedLease._id, finalServerData);
      } else {
        await agentService.createLease(finalServerData);
      }
      setDialogOpen(false);
      setSelectedLease(null);
      setFormMode('create');
      await loadData();
      notifyRentalWorkflowChanged('lease');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to save lease. Please try again later.');
    }
  };

  const handleEditLease = (lease: Lease) => {
    if (isLeaseImmutable(lease)) {
      setError('This lease is active or historical and cannot be destructively edited. Use Renew, Move-out, or a controlled status update instead.');
      return;
    }
    setSelectedLease(lease);
    setFormMode('amend');
    setDialogOpen(true);
  };

  const handleRenewLease = (lease: Lease) => {
    setSelectedLease(lease);
    setFormMode('renew');
    setDialogOpen(true);
  };

  const handleApproveLease = async (lease: Lease) => {
    try {
      setError(null);
      await leaseService.updateStatus(lease._id, 'active');
      await loadData();
      notifyRentalWorkflowChanged('lease');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to approve lease renewal.');
    }
  };

  const handleTerminateLease = async (lease: Lease) => {
    const reason = window.prompt('Move-out reason or settlement note', lease.terminationReason || '');
    if (reason === null) return;
    try {
      setError(null);
      await leaseService.terminate(lease._id, {
        reason,
        moveOutDate: new Date().toISOString(),
        settlementNotes: reason,
      });
      await loadData();
      notifyRentalWorkflowChanged('lease');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to start move-out workflow.');
    }
  };

  const handleCloseSettlement = async (lease: Lease) => {
    if (!window.confirm('Close this lease settlement and return the property to vacant if there is no successor lease?')) {
      return;
    }
    try {
      setError(null);
      await leaseService.closeSettlement(lease._id, 'Settlement closed from lease lifecycle dashboard.');
      await loadData();
      notifyRentalWorkflowChanged('lease');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to close settlement.');
    }
  };

  const handleDeleteLease = async (id: string) => {
    const lease = leases.find(item => item._id === id);
    if (lease && isLeaseImmutable(lease)) {
      setError('Historical and active leases cannot be deleted. Close or terminate the lease to preserve the audit trail.');
      return;
    }
    if (!window.confirm('Are you sure you want to delete this lease?')) {
      return;
    }
    try {
      setError(null);
      await leaseService.delete(id);
      await loadData();
      notifyRentalWorkflowChanged('lease');
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
    const property = resolvePropertyFromLease(lease, properties);
    const tenant = resolveTenantFromLease(lease, tenants);
    const derivedStatus = getLeaseLifecycleStatus(lease);
    const matchesStatus = filters.status === 'all' || derivedStatus === filters.status;
    const leasePropertyId = getId(lease.propertyId);
    const matchesProperty = filters.property === 'all' || leasePropertyId === filters.property;
    const search = (filters.search || '').toLowerCase();
    const matchesSearch = !search ||
      (property?.name?.toLowerCase().includes(search) ||
       tenant?.firstName?.toLowerCase().includes(search) ||
       tenant?.lastName?.toLowerCase().includes(search));
    return matchesStatus && matchesProperty && matchesSearch;
  });

  const lifecycleCounts = leases.reduce((acc, lease) => {
    const status = getLeaseLifecycleStatus(lease);
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {} as Record<LeaseStatus, number>);

  const requestedProperty = requestedPropertyId
    ? properties.find(property => getId(property._id) === requestedPropertyId)
    : undefined;
  const requestedPropertyDefaults = getPropertyLeaseDefaults(requestedProperty);

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
            Lease Lifecycle
          </Typography>
          <Typography color="text.secondary">
            Renewals create successor leases and active leases preserve historical occupancy.
          </Typography>
        </Box>
        <Button 
          variant="contained" 
          color="primary" 
          startIcon={<AddIcon />}
          onClick={() => {
            setSelectedLease(null);
            setFormMode('create');
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
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary">Expiring Soon</Typography>
              <Typography variant="h5">{lifecycleCounts.expiring_soon || 0}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary">Pending Renewal</Typography>
              <Typography variant="h5">{lifecycleCounts.pending_approval || 0}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary">Pending Settlement</Typography>
              <Typography variant="h5">{lifecycleCounts.pending_settlement || 0}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary">Closed History</Typography>
              <Typography variant="h5">{lifecycleCounts.closed || 0}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
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
                  {leaseStatuses.map(status => (
                    <MenuItem key={status} value={status}>{leaseStatusLabels[status]}</MenuItem>
                  ))}
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
      {dialogOpen && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2 }}>
              {formMode === 'renew' ? 'Create Renewal Lease' : formMode === 'amend' ? 'Amend Draft Lease' : 'Create Lease'}
            </Typography>
            {formMode === 'renew' && selectedLease && (
              <Alert severity="info" sx={{ mb: 2 }}>
                This creates a new successor lease linked to the current lease. The existing lease remains in history.
              </Alert>
            )}
            <LeaseForm
              key={selectedLease?._id || requestedPropertyId || 'new-lease'}
              onCancel={() => {
                setDialogOpen(false);
                setSelectedLease(null);
                setFormMode('create');
              }}
              onSubmit={handleFormSubmit}
              properties={properties}
              tenants={tenants}
              initialData={(() => {
                if (selectedLease) {
                  const leaseProperty = resolvePropertyFromLease(selectedLease, properties);
                  const defaults = getPropertyLeaseDefaults(leaseProperty);
                  const renewalRent = formMode === 'renew' && defaults.rent > 0 ? defaults.rent : selectedLease.rentAmount;
                  const renewalDeposit = formMode === 'renew' && defaults.deposit > 0 ? defaults.deposit : selectedLease.depositAmount;

                  return {
                    propertyId: selectedLease.propertyId,
                    tenantId: selectedLease.tenantId,
                    startDate: formMode === 'renew' && selectedLease.endDate
                      ? new Date(new Date(selectedLease.endDate).getTime() + 24 * 60 * 60 * 1000).toISOString()
                      : selectedLease.startDate,
                    endDate: formMode === 'renew' && selectedLease.endDate
                      ? new Date(new Date(selectedLease.endDate).getFullYear() + 1, new Date(selectedLease.endDate).getMonth(), new Date(selectedLease.endDate).getDate()).toISOString()
                      : selectedLease.endDate,
                    rentAmount: renewalRent,
                    depositAmount: renewalDeposit,
                    status: formMode === 'renew' ? 'active' : selectedLease.status,
                    previousLeaseId: formMode === 'renew' ? selectedLease._id : selectedLease.previousLeaseId,
                    monthlyRent: renewalRent,
                    securityDeposit: renewalDeposit,
                    petDeposit: 0,
                    isPetAllowed: false,
                    maxOccupants: 1,
                    isUtilitiesIncluded: false,
                    utilitiesDetails: '',
                    rentDueDay: 1,
                    lateFee: 0,
                    gracePeriod: 0
                  };
                }

                if (requestedPropertyId) {
                  return {
                    propertyId: requestedPropertyId,
                    tenantId: '',
                    startDate: '',
                    endDate: '',
                    rentAmount: requestedPropertyDefaults.rent,
                    depositAmount: requestedPropertyDefaults.deposit,
                    status: 'active',
                    monthlyRent: requestedPropertyDefaults.rent,
                    securityDeposit: requestedPropertyDefaults.deposit,
                    petDeposit: 0,
                    isPetAllowed: false,
                    maxOccupants: 1,
                    isUtilitiesIncluded: false,
                    utilitiesDetails: '',
                    rentDueDay: 1,
                    lateFee: 0,
                    gracePeriod: 0
                  };
                }

                return undefined;
              })()}
            />
          </CardContent>
        </Card>
      )}
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
                    <TableCell>Lineage</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredLeases.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center">
                      <OperationalEmptyState
                        title="Create the first lease"
                        description="Leases connect properties, tenants, rent rules, deposits, and billing so rental operations can move from setup to active occupancy."
                        actionLabel="Create Lease"
                        onAction={() => {
                          setSelectedLease(null);
                          setDialogOpen(true);
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLeases.map((lease) => {
                    const property = resolvePropertyFromLease(lease, properties);
                    const tenant = resolveTenantFromLease(lease, tenants);
                    const status = getLeaseLifecycleStatus(lease);
                    const lineage = buildLeaseLineage(lease, leases);
                    const statusColor = status === 'active' ? 'success' : status === 'expiring_soon' || status === 'pending_settlement' ? 'warning' : status === 'expired' || status === 'terminated' ? 'error' : 'default';
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
                          <Stack spacing={0.75} alignItems="flex-start">
                            <Chip 
                              label={leaseStatusLabels[status]}
                              color={statusColor as any}
                              size="small" 
                            />
                            {status === 'pending_approval' && (
                              <Button
                                size="small"
                                color="success"
                                variant="outlined"
                                startIcon={<CloseIcon />}
                                onClick={() => handleApproveLease(lease)}
                              >
                                Approve
                              </Button>
                            )}
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Stack spacing={0.5}>
                            <Typography variant="caption">
                              {lineage.map((item, index) => `${index + 1}. ${new Date(item.startDate).getFullYear()}`).join(' -> ') || 'Single lease'}
                            </Typography>
                            {lease.previousLeaseId && (
                              <Typography variant="caption" color="text.secondary">Has predecessor</Typography>
                            )}
                            {lease.successorLeaseId && (
                              <Typography variant="caption" color="text.secondary">Has successor</Typography>
                            )}
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={0.5}>
                            <Tooltip title={isLeaseImmutable(lease) ? 'Immutable after activation' : 'Amend draft'}>
                              <span>
                                <IconButton 
                                  onClick={() => handleEditLease(lease)} 
                                  size="small"
                                  color="primary"
                                  disabled={isLeaseImmutable(lease)}
                                >
                                  <EditIcon />
                                </IconButton>
                              </span>
                            </Tooltip>
                            <Tooltip title="Create renewal successor">
                              <IconButton
                                onClick={() => handleRenewLease(lease)}
                                size="small"
                                color="primary"
                                disabled={status === 'closed' || status === 'pending_settlement'}
                              >
                                <RenewIcon />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Start move-out settlement">
                              <IconButton
                                onClick={() => handleTerminateLease(lease)}
                                size="small"
                                color="warning"
                                disabled={status === 'closed' || status === 'pending_settlement'}
                              >
                                <MoveOutIcon />
                              </IconButton>
                            </Tooltip>
                            {status === 'pending_settlement' && (
                              <Tooltip title="Close settlement">
                                <IconButton
                                  onClick={() => handleCloseSettlement(lease)}
                                  size="small"
                                  color="success"
                                >
                                  <CloseIcon />
                                </IconButton>
                              </Tooltip>
                            )}
                            <Tooltip title={isLeaseImmutable(lease) ? 'Cannot delete historical leases' : 'Delete draft'}>
                              <span>
                                <IconButton 
                                  onClick={() => handleDeleteLease(lease._id)} 
                                  size="small"
                                  color="error"
                                  disabled={isLeaseImmutable(lease)}
                                >
                                  <DeleteIcon />
                                </IconButton>
                              </span>
                            </Tooltip>
                          </Stack>
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
    </Container>
  );
};

export default AgentLeasesPage; 