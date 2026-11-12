import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Paper, IconButton, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Chip, Alert, CircularProgress, Grid, Card, CardContent,
  CardActions, Divider, Snackbar, Tooltip, InputAdornment, Stack, MenuItem, FormControl,
  InputLabel, Select, ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, Person as PersonIcon,
  Email as EmailIcon, Phone as PhoneIcon, Search as SearchIcon, OpenInNew as OpenIcon,
  Login as LoginIcon,
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { useCompany } from '../../contexts/CompanyContext';
import { useAgentPropertyOwnerService, PropertyOwner } from '../../services/agentPropertyOwnerService';
import ownerManagementService from '../../services/ownerManagementService';
import { OwnerListSummary, OwnersDashboardKpis } from '../../types/ownerManagement';
import { SearchablePropertySelector } from '../../components/owners/SearchablePropertySelector';
import api from '../../api/axios';
import { formatCurrency, CurrencyCode } from '../../utils/money';

interface PropertyOwnerFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  companyId: string;
  propertyIds: string[];
}

interface Property {
  _id: string;
  name: string;
  address: string;
  ownerId?: string;
  propertyOwnerId?: string;
}

const initialFormData: PropertyOwnerFormData = {
  firstName: '', lastName: '', email: '', phone: '', password: '', companyId: '', propertyIds: [],
};

const getReferenceId = (value: any): string => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    if (value.$oid) return value.$oid;
    if (value._id) return getReferenceId(value._id);
    if (value.id) return getReferenceId(value.id);
  }
  return '';
};

const softCardSx = {
  borderRadius: 3,
  border: '1px solid rgba(15, 23, 42, 0.07)',
  boxShadow: '0 12px 32px rgba(15, 23, 42, 0.06)',
  height: '100%',
};

const fmtMoney = (n: number, currency: CurrencyCode) =>
  formatCurrency(n || 0, currency, { maximumFractionDigits: 0 });

const KpiTile = ({ label, value, loading }: { label: string; value: string | number; loading?: boolean }) => (
  <Paper sx={{ ...softCardSx, p: 2, textAlign: 'center' }}>
    <Typography variant="caption" color="text.secondary" fontWeight={700}>{label}</Typography>
    {loading ? <CircularProgress size={20} sx={{ mt: 1 }} /> : (
      <Typography variant="h5" fontWeight={800} sx={{ mt: 0.5 }}>{value}</Typography>
    )}
  </Paper>
);

const AgentPropertyOwnersPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, impersonate } = useAuth();
  const { company } = useCompany();
  const currency = (company?.workspacePreferences?.currency || 'USD') as CurrencyCode;
  const propertyOwnerService = useAgentPropertyOwnerService();

  const [summaries, setSummaries] = useState<OwnerListSummary[]>([]);
  const [kpis, setKpis] = useState<OwnersDashboardKpis | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [owners, setOwners] = useState<PropertyOwner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedOwner, setSelectedOwner] = useState<PropertyOwner | null>(null);
  const [formData, setFormData] = useState<PropertyOwnerFormData>(initialFormData);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success',
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [propertyFilter, setPropertyFilter] = useState('');
  const [occupancyFilter, setOccupancyFilter] = useState<'all' | 'occupied' | 'vacant'>('all');
  const [balanceFilter, setBalanceFilter] = useState<'all' | 'outstanding' | 'clear'>('all');
  const [maintenanceFilter, setMaintenanceFilter] = useState<'all' | 'pending' | 'none'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'newest' | 'activity'>('name');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [dashboard, ownersRes, propsRes] = await Promise.all([
        ownerManagementService.getDashboard(),
        propertyOwnerService.getAll(),
        api.get('/agents/properties'),
      ]);
      setKpis(dashboard.kpis);
      const uniqueSummaries = new Map<string, OwnerListSummary>();
      (dashboard.owners || []).forEach((owner) => uniqueSummaries.set(String(owner._id), owner));
      setSummaries(Array.from(uniqueSummaries.values()));
      const uniqueOwners = new Map<string, PropertyOwner>();
      (ownersRes.owners || []).forEach((owner: PropertyOwner) => uniqueOwners.set(String(owner._id), owner));
      setOwners(Array.from(uniqueOwners.values()));
      setProperties(propsRes.data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (owner?: PropertyOwner) => {
    if (owner) {
      setSelectedOwner(owner);
      const propertyIds = owner.properties?.map(getReferenceId).filter(Boolean) || [];
      setFormData({
        firstName: owner.firstName, lastName: owner.lastName, email: owner.email, phone: owner.phone,
        password: '', companyId: owner.companyId, propertyIds,
      });
    } else {
      setSelectedOwner(null);
      setFormData({ ...initialFormData, companyId: user?.companyId || '' });
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setSelectedOwner(null);
    setFormData(initialFormData);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (selectedOwner) {
        await propertyOwnerService.update(selectedOwner._id, {
          firstName: formData.firstName, lastName: formData.lastName, email: formData.email,
          phone: formData.phone, propertyIds: formData.propertyIds,
        });
        setSnackbar({ open: true, message: 'Property owner updated successfully', severity: 'success' });
      } else {
        const created = await propertyOwnerService.create(formData);
        const portalNote = created?.portalMessage ? ` ${created.portalMessage}` : '';
        setSnackbar({ open: true, message: `Property owner created successfully.${portalNote}`, severity: 'success' });
      }
      handleCloseDialog();
      fetchData();
    } catch (err: any) {
      setSnackbar({ open: true, message: err.message || 'Failed to save property owner', severity: 'error' });
    }
  };

  const handleDelete = async (ownerId: string) => {
    if (!window.confirm('Delete this property owner? Owners with properties, leases or financial history are deactivated instead, and those records are kept.')) return;
    try {
      const result = await propertyOwnerService.remove(ownerId);
      setSnackbar({ open: true, message: result?.message || 'Property owner deleted successfully', severity: 'success' });
      fetchData();
    } catch (err: any) {
      setSnackbar({ open: true, message: err.message || 'Failed to delete', severity: 'error' });
    }
  };

  const handleReactivate = async (ownerId: string) => {
    try {
      await ownerManagementService.patchProfile(ownerId, { active: true });
      setSnackbar({ open: true, message: 'Property owner reactivated', severity: 'success' });
      fetchData();
    } catch (err: any) {
      setSnackbar({
        open: true,
        message: err?.response?.data?.message || err.message || 'Failed to reactivate property owner',
        severity: 'error',
      });
    }
  };

  const openOwnerEditor = async (ownerId: string) => {
    try {
      const full = await propertyOwnerService.getById(ownerId);
      const owner = full?.owner || full;
      if (!owner?._id) throw new Error('Property owner details were not returned');
      handleOpenDialog(owner);
    } catch (err: any) {
      setSnackbar({ open: true, message: err.message || 'Failed to open property owner', severity: 'error' });
    }
  };

  const assignedPropertyIds = useMemo(() => {
    const ids = new Set<string>();
    owners.forEach((owner) => {
      if (selectedOwner && owner._id === selectedOwner._id) return;
      owner.properties?.forEach((property) => {
        const propertyId = getReferenceId(property);
        if (propertyId) ids.add(propertyId);
      });
    });
    return ids;
  }, [owners, selectedOwner]);

  const availablePropertiesForAssignment = useMemo(() => {
    const selectedPropertyIds = new Set(formData.propertyIds);
    return properties.filter((property) => {
      const propertyId = getReferenceId(property._id);
      if (selectedPropertyIds.has(propertyId)) return true;
      const propertyOwnerId = getReferenceId((property as any).propertyOwnerId);
      const isLinkedToAnotherOwner = propertyOwnerId && propertyOwnerId !== selectedOwner?._id;
      return !assignedPropertyIds.has(propertyId) && !isLinkedToAnotherOwner;
    });
  }, [assignedPropertyIds, properties, selectedOwner, formData.propertyIds]);

  const filteredSummaries = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const filtered = summaries.filter((o) => {
      if (statusFilter === 'active' && !o.active) return false;
      if (statusFilter === 'inactive' && o.active) return false;
      const full = owners.find((x) => String(x._id) === String(o._id));
      if (q) {
        const propertyText = (full?.properties || []).map((property: any) =>
          `${property?.name || ''} ${property?.address || ''}`
        ).join(' ');
        const haystack = `${o.ownerName} ${o.email || ''} ${o.phone || ''} ${propertyText}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (propertyFilter) {
        const ids = full?.properties?.map(getReferenceId).filter(Boolean) || [];
        if (!ids.includes(propertyFilter)) return false;
      }
      if (occupancyFilter === 'occupied' && o.occupiedCount === 0) return false;
      if (occupancyFilter === 'vacant' && o.vacantCount === 0) return false;
      if (balanceFilter === 'outstanding' && o.outstandingBalance <= 0) return false;
      if (balanceFilter === 'clear' && o.outstandingBalance > 0) return false;
      if (maintenanceFilter === 'pending' && o.pendingMaintenanceCount === 0) return false;
      if (maintenanceFilter === 'none' && o.pendingMaintenanceCount > 0) return false;
      return true;
    });
    return filtered.sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.createdAt || b.lastActivity).getTime() - new Date(a.createdAt || a.lastActivity).getTime();
      }
      if (sortBy === 'activity') {
        return new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime();
      }
      return a.ownerName.localeCompare(b.ownerName, undefined, { sensitivity: 'base' });
    });
  }, [summaries, searchTerm, statusFilter, propertyFilter, occupancyFilter, balanceFilter, maintenanceFilter, owners, sortBy]);

  const clearFilters = () => {
    setSearchTerm('');
    setPropertyFilter('');
    setOccupancyFilter('all');
    setBalanceFilter('all');
    setMaintenanceFilter('all');
    setStatusFilter('all');
    setSortBy('name');
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} flexWrap="wrap" gap={2}>
        <Typography variant="h4" fontWeight={800}>Property Owners</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>
          Add Property Owner
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          ['Total Owners', kpis?.totalOwners ?? 0],
          ['Total Properties', kpis?.totalProperties ?? 0],
          ['Occupied Properties', kpis?.occupiedProperties ?? 0],
          ['Vacant Properties', kpis?.vacantProperties ?? 0],
          ['Owners Awaiting Approval', kpis?.ownersAwaitingApproval ?? 0],
          ['Owners With Outstanding Balances', kpis?.ownersWithOutstandingBalances ?? 0],
        ].map(([label, value]) => (
          <Grid item xs={6} sm={4} md={2} key={String(label)}>
            <KpiTile label={String(label)} value={value as number} />
          </Grid>
        ))}
      </Grid>

      <Paper sx={{ p: 2, mb: 3, borderRadius: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth size="small" label="Search owners" placeholder="Name, email, phone or property"
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Property</InputLabel>
              <Select value={propertyFilter} label="Property" onChange={(e) => setPropertyFilter(e.target.value)}>
                <MenuItem value="">All</MenuItem>
                {properties.map((p) => <MenuItem key={p._id} value={p._id}>{p.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Occupancy</InputLabel>
              <Select value={occupancyFilter} label="Occupancy" onChange={(e) => setOccupancyFilter(e.target.value as any)}>
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="occupied">Has Occupied</MenuItem>
                <MenuItem value="vacant">Has Vacant</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Balance</InputLabel>
              <Select value={balanceFilter} label="Balance" onChange={(e) => setBalanceFilter(e.target.value as any)}>
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="outstanding">Outstanding</MenuItem>
                <MenuItem value="clear">Clear</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Maintenance</InputLabel>
              <Select value={maintenanceFilter} label="Maintenance" onChange={(e) => setMaintenanceFilter(e.target.value as any)}>
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="pending">Pending</MenuItem>
                <MenuItem value="none">None</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} sx={{ mt: 2 }}>
          <ToggleButtonGroup
            value={statusFilter} exclusive size="small"
            onChange={(_, v) => v && setStatusFilter(v)}
          >
            <ToggleButton value="all">All Owners</ToggleButton>
            <ToggleButton value="active">Active Owners</ToggleButton>
            <ToggleButton value="inactive">Inactive Owners</ToggleButton>
          </ToggleButtonGroup>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Sort</InputLabel>
            <Select value={sortBy} label="Sort" onChange={(e) => setSortBy(e.target.value as 'name' | 'newest' | 'activity')}>
              <MenuItem value="name">Name</MenuItem>
              <MenuItem value="newest">Date created</MenuItem>
              <MenuItem value="activity">Last activity</MenuItem>
            </Select>
          </FormControl>
          <Button size="small" onClick={clearFilters}>Clear filters</Button>
          <Typography variant="body2" color="text.secondary" sx={{ ml: { sm: 'auto' } }}>
            {filteredSummaries.length} of {summaries.length}
          </Typography>
        </Stack>
      </Paper>

      <Grid container spacing={3}>
        {filteredSummaries.map((owner) => (
          <Grid item xs={12} md={6} lg={4} key={owner._id}>
            <Card sx={softCardSx}>
              <CardContent>
                <Stack direction="row" alignItems="center" spacing={1} mb={1}>
                  <PersonIcon color="primary" />
                  <Typography variant="h6" fontWeight={700}>{owner.ownerName}</Typography>
                  {!owner.active && <Chip label="Inactive" size="small" />}
                </Stack>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {owner.propertyCount} Properties · {owner.occupiedCount} Occupied · {owner.vacantCount} Vacant
                </Typography>
                <Divider sx={{ my: 1.5 }} />
                <Stack spacing={0.5}>
                  <Typography variant="body2"><strong>Monthly Rent</strong> {fmtMoney(owner.monthlyRevenue, currency)}</Typography>
                  <Typography variant="body2"><strong>Outstanding Rent</strong> {fmtMoney(owner.outstandingBalance, currency)}</Typography>
                  <Typography variant="body2"><strong>Pending Maintenance</strong> {owner.pendingMaintenanceCount}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Last Activity {new Date(owner.lastActivity).toLocaleDateString()}
                  </Typography>
                </Stack>
                <Box mt={1}>
                  <EmailIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: 'middle' }} />
                  <Typography component="span" variant="caption">{owner.email}</Typography>
                </Box>
                {owner.phone && (
                  <Box>
                    <PhoneIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: 'middle' }} />
                    <Typography component="span" variant="caption">{owner.phone}</Typography>
                  </Box>
                )}
              </CardContent>
              <CardActions sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                <Button size="small" variant="contained" endIcon={<OpenIcon />} onClick={() => navigate(`/agent-dashboard/property-owners/${owner._id}`)}>
                  Open Portfolio
                </Button>
                <Tooltip title="Edit">
                  <IconButton size="small" onClick={() => openOwnerEditor(owner._id)}><EditIcon /></IconButton>
                </Tooltip>
                {!owner.active && (
                  <Button size="small" onClick={() => handleReactivate(owner._id)}>Reactivate</Button>
                )}
                <Tooltip title="Owner portal login">
                  <IconButton size="small" onClick={() => impersonate(owner._id)}><LoginIcon /></IconButton>
                </Tooltip>
                <Tooltip title="Delete">
                  <IconButton size="small" color="error" onClick={() => handleDelete(owner._id)}><DeleteIcon /></IconButton>
                </Tooltip>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      {summaries.length === 0 && !loading && (
        <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 3 }}>
          <Typography variant="h6" color="text.secondary">No Property Owners Found</Typography>
          <Button variant="contained" startIcon={<AddIcon />} sx={{ mt: 2 }} onClick={() => handleOpenDialog()}>Add Property Owner</Button>
        </Paper>
      )}

      {summaries.length > 0 && filteredSummaries.length === 0 && (
        <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 3 }}>
          <Typography color="text.secondary">No owners match your filters.</Typography>
        </Paper>
      )}

      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>{selectedOwner ? 'Edit Property Owner' : 'Add Property Owner'}</DialogTitle>
        <form onSubmit={handleSubmit}>
          <DialogContent>
            <Grid container spacing={2}>
              {(['firstName', 'lastName', 'email', 'phone'] as const).map((f) => (
                <Grid item xs={12} sm={6} key={f}>
                  <TextField fullWidth label={f.replace(/([A-Z])/g, ' $1')} name={f} value={(formData as any)[f]}
                    onChange={handleInputChange} required={f !== 'phone' || !selectedOwner} />
                </Grid>
              ))}
              {!selectedOwner && (
                <Grid item xs={12}>
                  <TextField fullWidth label="Password" name="password" type="password" value={formData.password}
                    onChange={handleInputChange} required helperText="Required for new property owners" />
                </Grid>
              )}
              <Grid item xs={12}>
                <SearchablePropertySelector
                  properties={availablePropertiesForAssignment.map((p) => ({ _id: p._id, name: p.name, address: p.address }))}
                  selectedIds={formData.propertyIds}
                  onChange={(propertyIds) => setFormData((prev) => ({ ...prev, propertyIds }))}
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseDialog}>Cancel</Button>
            <Button type="submit" variant="contained">{selectedOwner ? 'Update' : 'Create'}</Button>
          </DialogActions>
        </form>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={() => setSnackbar((p) => ({ ...p, open: false }))}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((p) => ({ ...p, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
};

export default AgentPropertyOwnersPage;
