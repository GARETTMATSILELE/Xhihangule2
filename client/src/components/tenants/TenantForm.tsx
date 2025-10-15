import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { 
  TextField, 
  Button, 
  Grid, 
  MenuItem, 
  FormControl, 
  InputLabel, 
  Select, 
  SelectChangeEvent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Box,
  Alert,
  FormControlLabel,
  Switch
} from '@mui/material';
import { TenantFormData, TenantStatus } from '../../types/tenant';
import { useAuth } from '../../contexts/AuthContext';
import { usePropertyService } from '../../services/propertyService';
import { Property } from '../../types/property';
import { useCompany } from '../../contexts/CompanyContext';

interface TenantFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: TenantFormData) => void;
  initialData?: Partial<TenantFormData> & { _id?: string };
}

export const TenantForm: React.FC<TenantFormProps> = ({
  open,
  onClose,
  onSubmit,
  initialData
}) => {
  const { user } = useAuth();
  const { company } = useCompany();
  const propertyService = usePropertyService();
  const [properties, setProperties] = React.useState<Property[]>([]);
  const [loadingProperties, setLoadingProperties] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [formData, setFormData] = React.useState<TenantFormData>(() => ({
    firstName: initialData?.firstName || '',
    lastName: initialData?.lastName || '',
    email: initialData?.email || '',
    phone: initialData?.phone || '',
    status: initialData?.status || 'Active',
    propertyId: initialData?.propertyId || '',
    propertyIds: initialData?.propertyIds || [],
    idNumber: initialData?.idNumber || '',
    emergencyContact: initialData?.emergencyContact || '',
    companyId: company?._id || ''
  }));

  const [useMultipleProperties, setUseMultipleProperties] = React.useState<boolean>(
    Array.isArray(initialData?.propertyIds) && (initialData?.propertyIds || []).length > 0
  );

  // Sync form state when initialData changes (e.g., when editing a tenant)
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      firstName: initialData?.firstName || '',
      lastName: initialData?.lastName || '',
      email: initialData?.email || '',
      phone: initialData?.phone || '',
      status: initialData?.status || 'Active',
      propertyId: initialData?.propertyId || '',
      propertyIds: initialData?.propertyIds || [],
      idNumber: initialData?.idNumber || '',
      emergencyContact: initialData?.emergencyContact || '',
      companyId: company?._id || ''
    }));
    setUseMultipleProperties(Array.isArray(initialData?.propertyIds) && (initialData?.propertyIds || []).length > 0);
  }, [initialData]);

  // Fetch vacant properties when the form opens
  useEffect(() => {
    const loadProperties = async () => {
      try {
        setLoadingProperties(true);
        // Use authenticated vacant endpoint for accurate list
        let availableProperties = await propertyService.getVacantProperties();
        // If editing and current propertyId is not in vacant list, include it so it can be shown
        const currentPropertyId = initialData?.propertyId;
        if (currentPropertyId) {
          const exists = availableProperties.some(p => p._id === currentPropertyId);
          if (!exists) {
            try {
              const current = await propertyService.getProperty(currentPropertyId);
              if (current) {
                availableProperties = [current, ...availableProperties];
              }
            } catch (e) {
              // Ignore if fetch fails; just don't include
            }
          }
        }
        setProperties(availableProperties);
      } catch (error) {
        console.error('Error loading properties:', error);
        setError('Failed to load properties');
      } finally {
        setLoadingProperties(false);
      }
    };

    if (open) {
      loadProperties();
    }
  }, [open, initialData?.propertyId]);

  // Update companyId when company changes
  React.useEffect(() => {
    const newCompanyId = company?._id || '';
    setFormData(prev => {
      if (prev.companyId === newCompanyId) return prev;
      return { ...prev, companyId: newCompanyId };
    });
  }, [company?._id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate user authentication and permissions
    if (!user?._id) {
      setError('You must be logged in to perform this action');
      return;
    }

    if (!user?.companyId) {
      setError('Company ID not found. Please ensure you are associated with a company.');
      return;
    }

    if (!['admin', 'owner', 'agent'].includes(user?.role || '')) {
      setError('Access denied. Admin, Owner, or Agent role required to manage tenants.');
      return;
    }

    if (!company?._id) {
      setError('No company ID found');
      return;
    }

    // Validate property selection
    if (!useMultipleProperties) {
      if (!formData.propertyId) {
        setError('Please select a property');
        return;
      }
    } else {
      const ids = formData.propertyIds || [];
      if (!Array.isArray(ids) || ids.length === 0) {
        setError('Please select at least one property');
        return;
      }
    }

    console.log('TenantForm: Submitting form with user and company context:', {
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        companyId: user.companyId
      },
      company: {
        _id: company._id,
        name: company.name
      },
      formData
    });

    // Pass form data to parent component - don't make API call here
    // Include the user's ID as ownerId for agents
    const tenantDataWithOwnerId = {
      ...formData,
      ownerId: user._id // Add the logged-in user's ID as ownerId
    };
    onSubmit(tenantDataWithOwnerId);
    onClose();
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
      [name]: value
    }));
  };

  const handleMultiSelectChange = (e: SelectChangeEvent<string[]>) => {
    const { value } = e.target;
    const next = typeof value === 'string' ? (value as unknown as string).split(',') : value;
    setFormData(prev => ({
      ...prev,
      propertyIds: next as string[]
    }));
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {initialData ? 'Edit Tenant' : 'Add New Tenant'}
      </DialogTitle>
      <DialogContent>
        {/* Display user and company info for debugging */}
        <Box mb={2} p={2} bgcolor="grey.100" borderRadius={1}>
          <Typography variant="body2" color="textSecondary">
            <strong>User:</strong> {user?.firstName} {user?.lastName} ({user?.email}) - {user?.role}
          </Typography>
          <Typography variant="body2" color="textSecondary">
            <strong>Company:</strong> {company?.name || 'No company'} (ID: {user?.companyId})
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <form onSubmit={handleSubmit}>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="First Name"
                name="firstName"
                value={formData.firstName}
                onChange={handleTextChange}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Last Name"
                name="lastName"
                value={formData.lastName}
                onChange={handleTextChange}
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
                onChange={handleTextChange}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Phone"
                name="phone"
                value={formData.phone}
                onChange={handleTextChange}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  name="status"
                  value={formData.status}
                  onChange={handleSelectChange}
                  label="Status"
                >
                  <MenuItem value="Active">Active</MenuItem>
                  <MenuItem value="Inactive">Inactive</MenuItem>
                  <MenuItem value="Pending">Pending</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={useMultipleProperties}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setUseMultipleProperties(checked);
                      setFormData(prev => ({
                        ...prev,
                        propertyId: checked ? '' : prev.propertyId,
                        propertyIds: checked ? (Array.isArray(prev.propertyIds) ? prev.propertyIds : []) : []
                      }));
                    }}
                  />
                }
                label="Link to multiple properties"
              />
            </Grid>

            {!useMultipleProperties && (
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Property</InputLabel>
                  <Select
                    name="propertyId"
                    value={formData.propertyId || ''}
                    onChange={handleSelectChange}
                    label="Property"
                    required
                    disabled={loadingProperties}
                  >
                    {properties.map((property) => (
                      <MenuItem key={property._id} value={property._id}>
                        {property.name} - {property.address}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            )}

            {useMultipleProperties && (
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Properties</InputLabel>
                  <Select
                    multiple
                    name="propertyIds"
                    value={formData.propertyIds || []}
                    onChange={handleMultiSelectChange}
                    label="Properties"
                    disabled={loadingProperties}
                    renderValue={(selected) => {
                      const ids = selected as string[];
                      const names = properties
                        .filter(p => ids.includes(p._id))
                        .map(p => p.name);
                      return names.join(', ');
                    }}
                  >
                    {properties.map((property) => (
                      <MenuItem key={property._id} value={property._id}>
                        {property.name} - {property.address}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            )}
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="ID Number"
                name="idNumber"
                value={formData.idNumber}
                onChange={handleTextChange}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Emergency Contact"
                name="emergencyContact"
                value={formData.emergencyContact}
                onChange={handleTextChange}
                required
              />
            </Grid>
          </Grid>
        </form>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          color="primary"
          disabled={!company?._id || !user?._id || !['admin', 'owner', 'agent'].includes(user?.role || '')}
        >
          {initialData ? 'Update Tenant' : 'Add Tenant'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}; 