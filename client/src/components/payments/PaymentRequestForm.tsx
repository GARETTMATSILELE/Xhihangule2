import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Autocomplete,
  Chip,
  Divider,
  IconButton,
  Alert
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { Close as CloseIcon, Save as SaveIcon, Cancel as CancelIcon } from '@mui/icons-material';
import { format } from 'date-fns';

interface PaymentRequestFormData {
  date: Date;
  payTo: {
    name: string;
    surname: string;
    bankDetails?: string;
    accountNumber?: string;
    address?: string;
  };
  amount: number;
  currency: 'USD' | 'ZWL';
  reason: string;
  propertyId: string;
  ownerId?: string; // Changed from owner: string to ownerId?: string
  tenantId?: string; // Changed from tenant: string to tenantId?: string
}

interface Property {
  _id: string;
  name: string;
  address: string;
}

interface Owner {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface Tenant {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface PaymentRequestFormProps {
  onSubmit: (data: PaymentRequestFormData) => void;
  onCancel: () => void;
  properties: Property[];
  owners: Owner[];
  tenants: Tenant[];
  loading?: boolean;
}

interface FormErrors {
  date?: string;
  payTo?: {
    name?: string;
    surname?: string;
    bankDetails?: string;
    accountNumber?: string;
    address?: string;
  };
  amount?: string;
  currency?: string;
  reason?: string;
  propertyId?: string;
  ownerId?: string;
  tenantId?: string;
}

const PaymentRequestForm: React.FC<PaymentRequestFormProps> = ({
  onSubmit,
  onCancel,
  properties,
  owners,
  tenants,
  loading = false
}) => {
  const [formData, setFormData] = useState<PaymentRequestFormData>({
    date: new Date(),
    payTo: {
      name: '',
      surname: '',
      bankDetails: '',
      accountNumber: '',
      address: ''
    },
    amount: 0,
    currency: 'USD',
    reason: '',
    propertyId: '',
    ownerId: undefined,
    tenantId: undefined
  });

  const [errors, setErrors] = useState<FormErrors>({});

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.payTo.name.trim()) {
      newErrors.payTo = { ...newErrors.payTo, name: 'Name is required' };
    }

    if (!formData.payTo.surname.trim()) {
      newErrors.payTo = { ...newErrors.payTo, surname: 'Surname is required' };
    }

    if (formData.amount <= 0) {
      newErrors.amount = 'Amount must be greater than 0';
    }

    if (!formData.reason.trim()) {
      newErrors.reason = 'Reason is required';
    }

    if (!formData.propertyId) {
      newErrors.propertyId = 'Property is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onSubmit(formData);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Clear error when user starts typing
    if (errors[field as keyof FormErrors]) {
      setErrors(prev => ({
        ...prev,
        [field]: undefined
      }));
    }
  };

  const handlePayToChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      payTo: {
        ...prev.payTo,
        [field]: value
      }
    }));
    
    // Clear error when user starts typing
    if (errors.payTo?.[field as keyof typeof formData.payTo]) {
      setErrors(prev => ({
        ...prev,
        payTo: {
          ...prev.payTo,
          [field]: undefined
        }
      }));
    }
  };

  return (
    <Paper elevation={2} sx={{ p: 3, maxWidth: 800, mx: 'auto' }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" component="h2" sx={{ fontWeight: 600 }}>
          Add Payment Request
        </Typography>
        <IconButton onClick={onCancel} size="small">
          <CloseIcon />
        </IconButton>
      </Box>

      <form onSubmit={handleSubmit}>
        <Grid container spacing={3}>
          {/* Date Section */}
          <Grid item xs={12} md={6}>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <DatePicker
                label="Date"
                value={formData.date}
                onChange={(newValue) => handleInputChange('date', newValue)}
                slotProps={{
                  textField: {
                    fullWidth: true,
                    required: true,
                    error: !!errors.date,
                    helperText: errors.date
                  }
                }}
              />
            </LocalizationProvider>
          </Grid>

          {/* Currency */}
          <Grid item xs={12} md={6}>
            <FormControl fullWidth required>
              <InputLabel>Currency</InputLabel>
              <Select
                value={formData.currency}
                label="Currency"
                onChange={(e) => handleInputChange('currency', e.target.value)}
              >
                <MenuItem value="USD">USD</MenuItem>
                <MenuItem value="ZWL">ZWL</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          {/* Pay To Section */}
          <Grid item xs={12}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
              Pay To
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Name *"
                  value={formData.payTo.name}
                  onChange={(e) => handlePayToChange('name', e.target.value)}
                  error={!!errors.payTo?.name}
                  helperText={errors.payTo?.name}
                  required
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Surname *"
                  value={formData.payTo.surname}
                  onChange={(e) => handlePayToChange('surname', e.target.value)}
                  error={!!errors.payTo?.surname}
                  helperText={errors.payTo?.surname}
                  required
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Bank Details (Optional)"
                  value={formData.payTo.bankDetails}
                  onChange={(e) => handlePayToChange('bankDetails', e.target.value)}
                  placeholder="Bank name, branch, etc."
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Account Number (Optional)"
                  value={formData.payTo.accountNumber}
                  onChange={(e) => handlePayToChange('accountNumber', e.target.value)}
                  placeholder="Account number"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Address (Optional)"
                  value={formData.payTo.address}
                  onChange={(e) => handlePayToChange('address', e.target.value)}
                  placeholder="Full address"
                  multiline
                  rows={2}
                />
              </Grid>
            </Grid>
          </Grid>

          <Grid item xs={12}>
            <Divider />
          </Grid>

          {/* Amount Section */}
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Amount *"
              type="number"
              value={formData.amount}
              onChange={(e) => handleInputChange('amount', parseFloat(e.target.value) || 0)}
              error={!!errors.amount}
              helperText={errors.amount}
              required
              InputProps={{
                startAdornment: <Typography sx={{ mr: 1 }}>{formData.currency}</Typography>
              }}
            />
          </Grid>

          {/* Reason Section */}
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Reason *"
              value={formData.reason}
              onChange={(e) => handleInputChange('reason', e.target.value)}
              error={!!errors.reason}
              helperText={errors.reason}
              required
              placeholder="Purpose of payment"
            />
          </Grid>

          {/* Property Section */}
          <Grid item xs={12} md={6}>
            <FormControl fullWidth required error={!!errors.propertyId}>
              <InputLabel>Property *</InputLabel>
              <Select
                value={formData.propertyId}
                label="Property *"
                onChange={(e) => handleInputChange('propertyId', e.target.value)}
              >
                {properties.map((property) => (
                  <MenuItem key={property._id} value={property._id}>
                    {property.name} - {property.address}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {errors.propertyId && (
              <Typography color="error" variant="caption" sx={{ mt: 0.5 }}>
                {errors.propertyId}
              </Typography>
            )}
          </Grid>

          {/* Owner Section */}
          <Grid item xs={12} md={6}>
            <Autocomplete
              options={owners}
              getOptionLabel={(option: Owner) => {
                return `${option.firstName} ${option.lastName}`;
              }}
              value={owners.find((owner: Owner) => owner._id === formData.ownerId) || null}
              onChange={(_, newValue: Owner | null) => {
                handleInputChange('ownerId', newValue?._id || undefined);
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Owner"
                  placeholder="Select owner from list"
                />
              )}
              renderOption={(props, option: Owner) => (
                <li {...props}>
                  <Box>
                    <Typography variant="body2">
                      {option.firstName} {option.lastName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {option.email}
                    </Typography>
                  </Box>
                </li>
              )}
            />
          </Grid>

          {/* Tenant Section */}
          <Grid item xs={12} md={6}>
            <Autocomplete
              options={tenants}
              getOptionLabel={(option: Tenant) => {
                return `${option.firstName} ${option.lastName}`;
              }}
              value={tenants.find((tenant: Tenant) => tenant._id === formData.tenantId) || null}
              onChange={(_, newValue: Tenant | null) => {
                handleInputChange('tenantId', newValue?._id || undefined);
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Tenant"
                  placeholder="Select tenant from list"
                />
              )}
              renderOption={(props, option: Tenant) => (
                <li {...props}>
                  <Box>
                    <Typography variant="body2">
                      {option.firstName} {option.lastName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {option.email}
                    </Typography>
                  </Box>
                </li>
              )}
            />
          </Grid>
        </Grid>

        {/* Action Buttons */}
        <Box display="flex" justifyContent="flex-end" gap={2} mt={4}>
          <Button
            variant="outlined"
            onClick={onCancel}
            startIcon={<CancelIcon />}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            color="primary"
            startIcon={<SaveIcon />}
            disabled={loading}
          >
            {loading ? 'Saving...' : 'Save Payment Request'}
          </Button>
        </Box>
      </form>
    </Paper>
  );
};

export default PaymentRequestForm; 