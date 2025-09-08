import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Alert,
  CircularProgress,
  Grid,
  Card,
  CardContent,
  CardActions,
  Divider,
  Snackbar,
  Tooltip
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
import { useAgentPropertyOwnerService, PropertyOwner } from '../../services/agentPropertyOwnerService';
import { usePropertyService } from '../../services/propertyService';
import api from '../../api/axios';

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

const AgentPropertyOwnersPage: React.FC = () => {
  const { user } = useAuth();
  const propertyOwnerService = useAgentPropertyOwnerService();
  const propertyService = usePropertyService();
  
  const [owners, setOwners] = useState<PropertyOwner[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedOwner, setSelectedOwner] = useState<PropertyOwner | null>(null);
  const [formData, setFormData] = useState<PropertyOwnerFormData>(initialFormData);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success'
  });
  const [propertySelectOpen, setPropertySelectOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch property owners for the agent's company
      const { owners } = await propertyOwnerService.getAll();
      setOwners(owners);
      
      // Fetch properties managed by the agent
      const response = await api.get('/agents/properties');
      setProperties(response.data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (owner?: PropertyOwner) => {
    if (owner) {
      setSelectedOwner(owner);
      
      const propertyIds = owner.properties?.map(p => {
        if (typeof p === 'string') return p;
        if (typeof p === 'object' && p && '$oid' in p) return p.$oid;
        if (typeof p === 'object' && p && '_id' in p) return (p as any)._id;
        return p;
      }) || [];
      
      setFormData({
        firstName: owner.firstName,
        lastName: owner.lastName,
        email: owner.email,
        phone: owner.phone,
        password: '',
        companyId: owner.companyId,
        propertyIds: propertyIds,
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
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handlePropertyChange = (event: any) => {
    const propertyIds = event.target.value as string[];
    setFormData(prev => ({
      ...prev,
      propertyIds
    }));
    // After selecting, close the dropdown to return focus to the edit form
    setPropertySelectOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (selectedOwner) {
        const updateData = {
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          phone: formData.phone,
          propertyIds: formData.propertyIds
        };
        
        await propertyOwnerService.update(selectedOwner._id, updateData);
        setSnackbar({
          open: true,
          message: 'Property owner updated successfully',
          severity: 'success'
        });
      } else {
        await propertyOwnerService.create(formData);
        setSnackbar({
          open: true,
          message: 'Property owner created successfully',
          severity: 'success'
        });
      }
      handleCloseDialog();
      fetchData();
    } catch (err: any) {
      setSnackbar({
        open: true,
        message: err.message || 'Failed to save property owner',
        severity: 'error'
      });
    }
  };

  const handleDelete = async (ownerId: string) => {
    if (window.confirm('Are you sure you want to delete this property owner?')) {
      try {
        await propertyOwnerService.remove(ownerId);
        setSnackbar({
          open: true,
          message: 'Property owner deleted successfully',
          severity: 'success'
        });
        fetchData();
      } catch (err: any) {
        setSnackbar({
          open: true,
          message: err.message || 'Failed to delete property owner',
          severity: 'error'
        });
      }
    }
  };

  const getOwnerProperties = (owner: PropertyOwner) => {
    const ownerPropertyIds = owner.properties?.map(p => {
      if (typeof p === 'string') return p;
      if (typeof p === 'object' && p && '$oid' in p) return p.$oid;
      if (typeof p === 'object' && p && '_id' in p) return (p as any)._id;
      return p;
    }) || [];
    
    return properties.filter(prop => ownerPropertyIds.includes(prop._id));
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
        <Typography variant="h4" component="h1">
          Property Owners
        </Typography>
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
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}



      <Grid container spacing={3}>
        {owners.map((owner) => (
          <Grid item xs={12} md={6} lg={4} key={owner._id}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" mb={2}>
                  <PersonIcon sx={{ mr: 1, color: 'primary.main' }} />
                  <Typography variant="h6">
                    {owner.firstName} {owner.lastName}
                  </Typography>
                </Box>
                
                <Box mb={2}>
                  <Box display="flex" alignItems="center" mb={1}>
                    <EmailIcon sx={{ mr: 1, fontSize: 'small', color: 'text.secondary' }} />
                    <Typography variant="body2" color="text.secondary">
                      {owner.email}
                    </Typography>
                  </Box>
                  <Box display="flex" alignItems="center">
                    <PhoneIcon sx={{ mr: 1, fontSize: 'small', color: 'text.secondary' }} />
                    <Typography variant="body2" color="text.secondary">
                      {owner.phone}
                    </Typography>
                  </Box>
                </Box>

                <Divider sx={{ my: 2 }} />

                <Box mb={2}>
                  <Typography variant="subtitle2" color="text.secondary" mb={1}>
                    Properties:
                  </Typography>
                  {getOwnerProperties(owner).length > 0 ? (
                    getOwnerProperties(owner).map((property) => (
                      <Chip
                        key={property._id}
                        icon={<BusinessIcon />}
                        label={`${property.name} - ${property.address}`}
                        size="small"
                        sx={{ mr: 1, mb: 1 }}
                      />
                    ))
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      No properties assigned
                    </Typography>
                  )}
                </Box>
              </CardContent>
              
              <CardActions>
                <Tooltip title="Edit Property Owner">
                  <IconButton
                    size="small"
                    onClick={() => handleOpenDialog(owner)}
                    color="primary"
                  >
                    <EditIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete Property Owner">
                  <IconButton
                    size="small"
                    onClick={() => handleDelete(owner._id)}
                    color="error"
                  >
                    <DeleteIcon />
                  </IconButton>
                </Tooltip>
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
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog()}
          >
            Add Property Owner
          </Button>
        </Paper>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          {selectedOwner ? 'Edit Property Owner' : 'Add Property Owner'}
        </DialogTitle>
        <form onSubmit={handleSubmit}>
          <DialogContent>
            <Grid container spacing={2}>
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
              <Grid item xs={12} sm={6}>
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
              <Grid item xs={12} sm={6}>
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
                    helperText="Password is required for new property owners"
                  />
                </Grid>
              )}
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Assign Properties</InputLabel>
                  <Select
                     multiple
                     value={formData.propertyIds}
                     onChange={handlePropertyChange}
                     label="Assign Properties"
                     open={propertySelectOpen}
                     onOpen={() => setPropertySelectOpen(true)}
                     onClose={() => setPropertySelectOpen(false)}
                    renderValue={(selected) => (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {selected.map((value) => {
                          const property = properties.find(p => p._id === value);
                          return (
                            <Chip
                              key={value}
                              label={property ? `${property.name} - ${property.address}` : value}
                              size="small"
                            />
                          );
                        })}
                      </Box>
                    )}
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
            <Button type="submit" variant="contained" color="primary">
              {selectedOwner ? 'Update' : 'Create'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
      >
        <Alert
          onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default AgentPropertyOwnersPage; 