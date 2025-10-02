import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  CardActions,
  Divider,
  Chip,
  IconButton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Snackbar,
  Alert,
  CircularProgress
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Business as BusinessIcon,
  Person as PersonIcon,
  Email as EmailIcon,
  Phone as PhoneIcon
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { usePropertyOwnerService, PropertyOwner, CreatePropertyOwnerData } from '../../services/propertyOwnerService';
import { usePropertyService } from '../../services/propertyService';

interface Property {
  _id: string;
  name: string;
  address: string;
}

interface PropertyOwnerFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  companyId: string;
  propertyIds: string[];
}

const initialFormData: PropertyOwnerFormData = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  password: '',
  companyId: '',
  propertyIds: [],
};

const AdminPropertyOwnersPage: React.FC = () => {
  const { user } = useAuth();
  const ownerService = usePropertyOwnerService();
  const propertyService = usePropertyService();

  const [owners, setOwners] = useState<PropertyOwner[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedOwner, setSelectedOwner] = useState<PropertyOwner | null>(null);
  const [formData, setFormData] = useState<PropertyOwnerFormData>(initialFormData);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });
  const [impersonateTarget, setImpersonateTarget] = useState<PropertyOwner | null>(null);
  const { impersonate } = useAuth();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const companyId = user?.companyId;
      // Admin should see all owners in same company (both rental/property owners and sales owners)
      const [ownersData, salesOwnersRaw] = await Promise.all([
        ownerService.getAllPublic(companyId),
        // sales owners (from /sales-owners) — service returns { owners: [...] } or an array
        ownerService.getAll().catch(() => ({ owners: [] }))
      ]);
      const publicOwners = Array.isArray((ownersData as any)?.owners) ? (ownersData as any).owners : (Array.isArray(ownersData as any) ? (ownersData as any) : []);
      const salesOwnersArr = Array.isArray((salesOwnersRaw as any)?.owners) ? (salesOwnersRaw as any).owners : (Array.isArray(salesOwnersRaw as any) ? (salesOwnersRaw as any) : []);
      // Merge and deduplicate by _id (fallback to email)
      const map = new Map<string, any>();
      ;(publicOwners || []).forEach((o: any) => {
        const key = String(o?._id || o?.id || o?.email || Math.random());
        if (!map.has(key)) map.set(key, { ...o, __source: 'rental' });
      });
      ;(salesOwnersArr || []).forEach((o: any) => {
        const key = String(o?._id || o?.id || o?.email || Math.random());
        if (!map.has(key)) map.set(key, { ...o, __source: 'sales' });
      });
      const mergedOwners = Array.from(map.values());
      setOwners(mergedOwners);
      const props = await propertyService.getPublicProperties();
      setProperties(props);
    } catch (err: any) {
      setError(err.message || 'Failed to load property owners');
    } finally {
      setLoading(false);
    }
  };

  const getOwnerPropertyIds = (owner: PropertyOwner): string[] => {
    return owner.properties?.map((p: any) => {
      if (typeof p === 'string') return p;
      if (p && typeof p === 'object' && '_id' in p) return (p as any)._id;
      if (p && typeof p === 'object' && '$oid' in p) return (p as any).$oid;
      return p as string;
    }) || [];
  };

  const getOwnerProperties = (owner: PropertyOwner): Property[] => {
    const ids = getOwnerPropertyIds(owner);
    return properties.filter(p => ids.includes(p._id));
  };

  const exportCsv = () => {
    const rows = owners.map(o => ({
      firstName: o.firstName,
      lastName: o.lastName,
      email: o.email,
      phone: o.phone,
      companyId: o.companyId,
      propertiesCount: Array.isArray(o.properties) ? o.properties.length : 0
    }));
    const headers = Object.keys(rows[0] || { firstName: '', lastName: '', email: '', phone: '', companyId: '', propertiesCount: 0 });
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${String((r as any)[h] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'property-owners.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImpersonate = async (owner: PropertyOwner) => {
    try {
      await impersonate(owner._id);
      setSnackbar({ open: true, message: `Now impersonating ${owner.firstName} ${owner.lastName}`, severity: 'success' });
      setImpersonateTarget(null);
    } catch (err: any) {
      setImpersonateTarget(owner);
    }
  };

  const handleOpenDialog = (owner?: PropertyOwner) => {
    if (owner) {
      setSelectedOwner(owner);
      setFormData({
        firstName: owner.firstName,
        lastName: owner.lastName,
        email: owner.email,
        phone: owner.phone,
        password: '',
        companyId: owner.companyId,
        propertyIds: getOwnerPropertyIds(owner),
      });
    } else {
      setSelectedOwner(null);
      setFormData({
        ...initialFormData,
        companyId: user?.companyId || '',
      });
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
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handlePropertyChange = (e: any) => {
    const value = e.target.value as string[];
    setFormData(prev => ({ ...prev, propertyIds: value }));
  };

  const handleSubmit = async () => {
    try {
      setError(null);
      if (selectedOwner) {
        const updateData: Partial<PropertyOwner> & { properties?: string[] } = {
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          phone: formData.phone,
          companyId: formData.companyId,
          properties: formData.propertyIds,
        };
        if ((selectedOwner as any).__source === 'sales') {
          await ownerService.updateSales(selectedOwner._id, updateData);
        } else {
          await ownerService.update(selectedOwner._id, updateData);
        }
        setSnackbar({ open: true, message: 'Property owner updated', severity: 'success' });
      } else {
        if (!formData.password) {
          setError('Password is required for new property owners');
          return;
        }
        if (!user?.companyId) {
          setError('Company ID missing');
          return;
        }
        const createData: CreatePropertyOwnerData = {
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          phone: formData.phone,
          password: formData.password,
          companyId: user.companyId,
          properties: formData.propertyIds,
        } as any;
        await ownerService.create(createData);
        setSnackbar({ open: true, message: 'Property owner created', severity: 'success' });
      }
      handleCloseDialog();
      fetchData();
    } catch (err: any) {
      setSnackbar({ open: true, message: err.message || 'Failed to save property owner', severity: 'error' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this property owner?')) return;
    try {
      await ownerService.remove(id);
      setSnackbar({ open: true, message: 'Property owner deleted', severity: 'success' });
      fetchData();
    } catch (err: any) {
      setSnackbar({ open: true, message: err.message || 'Failed to delete property owner', severity: 'error' });
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box p={3}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Property Owners</Typography>
        <Box display="flex" gap={1}>
          <Button variant="outlined" onClick={exportCsv}>Export CSV</Button>
          <Button variant="contained" color="primary" startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>
            Add Property Owner
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {owners.map(owner => (
          <Grid item xs={12} md={6} lg={4} key={owner._id}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" mb={2}>
                  <PersonIcon sx={{ mr: 1, color: 'primary.main' }} />
                  <Typography variant="h6">{owner.firstName} {owner.lastName}</Typography>
                </Box>

                <Box mb={2}>
                  <Box display="flex" alignItems="center" mb={1}>
                    <EmailIcon sx={{ mr: 1, fontSize: 'small', color: 'text.secondary' }} />
                    <Typography variant="body2" color="text.secondary">{owner.email}</Typography>
                  </Box>
                  <Box display="flex" alignItems="center">
                    <PhoneIcon sx={{ mr: 1, fontSize: 'small', color: 'text.secondary' }} />
                    <Typography variant="body2" color="text.secondary">{owner.phone}</Typography>
                  </Box>
                </Box>

                <Divider sx={{ my: 2 }} />

                <Box>
                  <Typography variant="subtitle2" color="text.secondary" mb={1}>Properties:</Typography>
                  {getOwnerProperties(owner).length > 0 ? (
                    getOwnerProperties(owner).map(property => (
                      <Chip key={property._id} icon={<BusinessIcon />} label={`${property.name} - ${property.address}`} size="small" sx={{ mr: 1, mb: 1 }} />
                    ))
                  ) : (
                    <Typography variant="body2" color="text.secondary">No properties assigned</Typography>
                  )}
                </Box>
              </CardContent>
              <CardActions>
                <IconButton size="small" color="primary" onClick={() => handleOpenDialog(owner)}>
                  <EditIcon />
                </IconButton>
                <IconButton size="small" color="error" onClick={() => handleDelete(owner._id)}>
                  <DeleteIcon />
                </IconButton>
                <Button size="small" onClick={() => handleImpersonate(owner)}>Impersonate</Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      {owners.length === 0 && !loading && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No Property Owners Found
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={3}>
            Start by adding your first property owner to manage your properties.
          </Typography>
          <Button variant="contained" color="primary" startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>
            Add Property Owner
          </Button>
        </Paper>
      )}

      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>{selectedOwner ? 'Edit Property Owner' : 'Add Property Owner'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="First Name" name="firstName" value={formData.firstName} onChange={handleInputChange} required />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Last Name" name="lastName" value={formData.lastName} onChange={handleInputChange} required />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Email" name="email" type="email" value={formData.email} onChange={handleInputChange} required />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Phone" name="phone" value={formData.phone} onChange={handleInputChange} required />
            </Grid>
            {!selectedOwner && (
              <Grid item xs={12}>
                <TextField fullWidth label="Password" name="password" type="password" value={formData.password} onChange={handleInputChange} required helperText="Password is required for new property owners" />
              </Grid>
            )}
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Assign Properties</InputLabel>
                <Select multiple value={formData.propertyIds} onChange={handlePropertyChange} label="Assign Properties" renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {(selected as string[]).map((value) => {
                      const property = properties.find(p => p._id === value);
                      return <Chip key={value} label={property ? `${property.name} - ${property.address}` : value} size="small" />;
                    })}
                  </Box>
                )}>
                  {properties.map(property => (
                    <MenuItem key={property._id} value={property._id}>
                      {property.name} - {property.address}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained" color="primary">{selectedOwner ? 'Update' : 'Create'}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!impersonateTarget} onClose={() => setImpersonateTarget(null)}>
        <DialogTitle>Impersonation not available</DialogTitle>
        <DialogContent>
          <DialogContentText>
            The server did not allow impersonation. Please ensure the backend exposes POST /auth/impersonate and that your account has permission.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImpersonateTarget(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}>
        <Alert onClose={() => setSnackbar(prev => ({ ...prev, open: false }))} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default AdminPropertyOwnersPage;


