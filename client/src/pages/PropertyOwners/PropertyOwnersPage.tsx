import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
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
  Grid,
  CircularProgress,
  Alert,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
} from '@mui/material';
import { Edit as EditIcon, Delete as DeleteIcon, Add as AddIcon } from '@mui/icons-material';
import { usePropertyOwnerService, PropertyOwner, CreatePropertyOwnerData } from '../../services/propertyOwnerService';
import { usePropertyService } from '../../services/propertyService';
import { useAuth } from '../../contexts/AuthContext';

interface PropertyOwnerFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password?: string;
  companyId?: string;
  propertyIds?: string[];
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

const PropertyOwnersPage: React.FC = () => {
  const [owners, setOwners] = useState<PropertyOwner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedOwner, setSelectedOwner] = useState<PropertyOwner | null>(null);
  const [formData, setFormData] = useState<PropertyOwnerFormData>(initialFormData);
  const [properties, setProperties] = useState<any[]>([]);
  // Removed companies selection; companyId is taken from logged-in user
  const [expandedOwnerId, setExpandedOwnerId] = useState<string | null>(null);
  const [ownerPropertiesMap, setOwnerPropertiesMap] = useState<Record<string, any[]>>({});
  const [propertiesLoadingOwnerId, setPropertiesLoadingOwnerId] = useState<string | null>(null);

  const propertyOwnerService = usePropertyOwnerService();
  const propertyService = usePropertyService();
  const { user, isAuthenticated } = useAuth();

  useEffect(() => {
    fetchOwners();
    fetchAllProperties();
  }, []);

  const fetchOwners = async () => {
    try {
      setLoading(true);
      setError(null);
      const { owners } = await propertyOwnerService.getAll();
      setOwners(owners);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch property owners');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Removed fetchCompanies - company is derived from logged-in user

  const fetchAllProperties = async () => {
    try {
      const props = await propertyService.getPublicProperties();
      setProperties(props);
    } catch (err) {
      console.error('Failed to fetch properties:', err);
      setProperties([]);
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
        companyId: owner.companyId || '',
        propertyIds: owner.properties ? owner.properties.map((p: any) => typeof p === 'string' ? p : p._id) : [],
      });
    } else {
      setSelectedOwner(null);
      setFormData({
        ...initialFormData,
        companyId: user?.companyId || ''
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
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSelectChange = (e: SelectChangeEvent) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handlePropertySelectChange = (e: SelectChangeEvent<string[]>) => {
    const value = e.target.value as string[];
    setFormData(prev => ({ ...prev, propertyIds: value }));
  };

  const handleSubmit = async () => {
    try {
      setError(null);
      if (selectedOwner) {
        // For updates, exclude password if empty and map propertyIds to properties
        const updateData: any = { ...formData };
        if (!updateData.password) {
          delete updateData.password;
        }
        // Map propertyIds to properties for backend
        if (updateData.propertyIds) {
          updateData.properties = updateData.propertyIds;
          delete updateData.propertyIds;
        }
        await propertyOwnerService.update(selectedOwner._id, updateData);
      } else {
        if (!formData.password) {
          setError('Password is required for new property owners');
          return;
        }
        
        if (!user?.companyId) {
          setError('Company ID is required');
          return;
        }
        
        const createData: CreatePropertyOwnerData = {
          ...formData,
          password: formData.password,
          companyId: user.companyId!,
          properties: formData.propertyIds || [],
        };
        
        await propertyOwnerService.create(createData);
      }
      handleCloseDialog();
      fetchOwners();
    } catch (err: any) {
      setError(err.message || 'Failed to save property owner');
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this property owner?')) {
      try {
        setError(null);
        await propertyOwnerService.remove(id);
        fetchOwners();
      } catch (err: any) {
        setError(err.message || 'Failed to delete property owner');
        console.error(err);
      }
    }
  };

  const handleViewProperties = async (ownerId: string) => {
    try {
      setError(null);
      // Toggle expand/collapse
      if (expandedOwnerId === ownerId) {
        setExpandedOwnerId(null);
        return;
      }
      setExpandedOwnerId(ownerId);
      // Fetch only if not already cached
      if (!ownerPropertiesMap[ownerId]) {
        setPropertiesLoadingOwnerId(ownerId);
        const props = await propertyService.getByOwnerId(ownerId);
        setOwnerPropertiesMap(prev => ({ ...prev, [ownerId]: props }));
        setPropertiesLoadingOwnerId(null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch properties');
      console.error(err);
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
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
        >
          Add Property Owner
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Phone</TableCell>
              <TableCell>Properties</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {owners.map((owner) => (
              <React.Fragment key={owner._id}>
                <TableRow>
                  <TableCell>{`${owner.firstName} ${owner.lastName}`}</TableCell>
                  <TableCell>{owner.email}</TableCell>
                  <TableCell>{owner.phone}</TableCell>
                  <TableCell>
                    <Chip
                      label={`${owner.properties?.length || 0} Properties`}
                      onClick={() => handleViewProperties(owner._id)}
                      color="primary"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <IconButton onClick={() => handleOpenDialog(owner)} color="primary">
                      <EditIcon />
                    </IconButton>
                    <IconButton onClick={() => handleDelete(owner._id)} color="error">
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
                {expandedOwnerId === owner._id && (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                        <Typography variant="subtitle2" gutterBottom>
                          Properties for {owner.firstName} {owner.lastName}
                        </Typography>
                        {propertiesLoadingOwnerId === owner._id ? (
                          <Box display="flex" alignItems="center" gap={1}>
                            <CircularProgress size={20} />
                            <Typography variant="body2">Loading properties…</Typography>
                          </Box>
                        ) : ownerPropertiesMap[owner._id] && ownerPropertiesMap[owner._id].length > 0 ? (
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                            {ownerPropertiesMap[owner._id].map((p: any) => (
                              <Chip key={p._id} label={`${p.name} - ${p.address}`} size="small" />
                            ))}
                          </Box>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            No properties found for this owner
                          </Typography>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {selectedOwner ? 'Edit Property Owner' : 'Add Property Owner'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="First Name"
                name="firstName"
                value={formData.firstName}
                onChange={handleInputChange}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Last Name"
                name="lastName"
                value={formData.lastName}
                onChange={handleInputChange}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Phone"
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
                required
              />
            </Grid>
            {!selectedOwner && (
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Password"
                  name="password"
                  type="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  required
                />
              </Grid>
            )}
            {/* Company selection removed; companyId is taken from logged-in user */}
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Properties (optional)</InputLabel>
                <Select
                  multiple
                  name="propertyIds"
                  value={formData.propertyIds || []}
                  onChange={handlePropertySelectChange}
                  label="Properties (optional)"
                  renderValue={(selected) =>
                    properties
                      .filter((p) => selected.includes(p._id))
                      .map((p) => p.name)
                      .join(', ')
                  }
                >
                  {properties.map((property) => (
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
          <Button onClick={handleSubmit} variant="contained" color="primary">
            {selectedOwner ? 'Update' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PropertyOwnersPage; 