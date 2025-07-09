import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../../contexts/CompanyContext';
import { apiService } from '../../api';
import { Property } from '../../types/property';
import {
  Box,
  Button,
  TextField,
  Typography,
  Container,
  Paper,
  Alert,
  Grid,
  MenuItem,
  Select,
  InputLabel,
  FormControl,
  Checkbox,
  ListItemText,
  OutlinedInput,
  SelectChangeEvent
} from '@mui/material';
import { AuthErrorReport } from '../AuthErrorReport';
import api from '../../api/axios';

interface Company {
  _id: string;
  name: string;
  address: string;
  email: string;
}

const OwnerRegister: React.FC = () => {
  const navigate = useNavigate();
  const { company, loading: companyLoading } = useCompany();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    companyId: '',
    propertyIds: [] as string[],
  });
  const [error, setError] = useState('');
  const [showAuthError, setShowAuthError] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loadingProperties, setLoadingProperties] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);

  React.useEffect(() => {
    // If company is available, set companyId in form
    if (company && company._id && formData.companyId !== company._id) {
      setFormData((prev) => ({ ...prev, companyId: company._id }));
    }
  }, [company]);

  React.useEffect(() => {
    // Fetch all properties for the dropdown
    const fetchProperties = async () => {
      setLoadingProperties(true);
      try {
        const response = await api.get('/properties');
        // Handle both array and wrapped response
        const data = Array.isArray(response.data) ? response.data : response.data.data || response.data.properties;
        setProperties(data || []);
      } catch (err: any) {
        console.error('Error fetching properties:', err);
        // If it's an auth error, show a helpful message
        if (err.response?.status === 401) {
          setError('Please log in to access property data. You can still register as a property owner.');
        }
        setProperties([]);
      } finally {
        setLoadingProperties(false);
      }
    };
    fetchProperties();
  }, []);

  React.useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    try {
      const response = await api.get('/companies');
      setCompanies(response.data || []);
    } catch (error) {
      console.error('Error loading companies:', error);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | { name?: string; value: unknown }>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name as string]: value,
    });
  };

  const handleSelectChange = (e: SelectChangeEvent) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name as string]: value,
    }));
  };

  const handlePropertyChange = (event: SelectChangeEvent<string[]>) => {
    const value = event.target.value;
    setFormData(prev => ({
      ...prev,
      propertyIds: typeof value === 'string' ? value.split(',') : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    try {
      const { confirmPassword, ...registrationData } = formData;
      
      // Create the registration payload for property owner
      const payload = {
        email: registrationData.email,
        password: registrationData.password,
        firstName: registrationData.firstName,
        lastName: registrationData.lastName,
        phone: registrationData.phone,
        companyId: registrationData.companyId || undefined,
        propertyIds: registrationData.propertyIds
      };

      // Call the property owner creation API directly
      await apiService.createPropertyOwner(payload);
      
      // Navigate to login page after successful registration
      navigate('/login', { state: { message: 'Property owner registration successful! Please log in.' } });
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'An error occurred during registration');
    }
  };

  const handleLogin = () => {
    setShowAuthError(true);
  };

  return (
    <Container component="main" maxWidth="sm">
      <Box
        sx={{
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Paper elevation={3} sx={{ p: 4, width: '100%' }}>
          <Typography component="h1" variant="h5" align="center" gutterBottom>
            Property Owner Registration
          </Typography>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  required
                  fullWidth
                  label="First Name"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  required
                  fullWidth
                  label="Last Name"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  required
                  fullWidth
                  label="Email Address"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  required
                  fullWidth
                  label="Phone Number"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                />
              </Grid>
              <Grid item xs={12}>
                {company && company._id ? (
                  <TextField
                    fullWidth
                    label="Company ID"
                    name="companyId"
                    value={company._id}
                    InputProps={{ readOnly: true }}
                  />
                ) : (
                  <FormControl fullWidth>
                    <InputLabel>Company (Optional)</InputLabel>
                    <Select
                      name="companyId"
                      value={formData.companyId}
                      onChange={handleSelectChange}
                      label="Company (Optional)"
                    >
                      <MenuItem value="">
                        <em>No company selected</em>
                      </MenuItem>
                      {companies.map((company) => (
                        <MenuItem key={company._id} value={company._id}>
                          {company.name} - {company.address}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel id="property-select-label">Assign Properties</InputLabel>
                  <Select
                    labelId="property-select-label"
                    multiple
                    value={formData.propertyIds}
                    onChange={handlePropertyChange}
                    input={<OutlinedInput label="Assign Properties" />}
                    renderValue={(selected) =>
                      (selected as string[])
                        .map(
                          (id) =>
                            properties.find((p) => p._id === id)?.name || id
                        )
                        .join(', ')
                    }
                  >
                    {loadingProperties ? (
                      <MenuItem disabled>Loading properties...</MenuItem>
                    ) : (
                      properties.map((property) => (
                        <MenuItem key={property._id} value={property._id}>
                          <Checkbox checked={formData.propertyIds.indexOf(property._id) > -1} />
                          <ListItemText primary={property.name} secondary={property.address} />
                        </MenuItem>
                      ))
                    )}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  required
                  fullWidth
                  label="Password"
                  name="password"
                  type="password"
                  value={formData.password}
                  onChange={handleChange}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  required
                  fullWidth
                  label="Confirm Password"
                  name="confirmPassword"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                />
              </Grid>
            </Grid>
            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2 }}
            >
              Register
            </Button>
            <Button
              fullWidth
              variant="text"
              onClick={handleLogin}
            >
              Already have an account? Login
            </Button>
          </Box>
        </Paper>
      </Box>

      <AuthErrorReport
        error="Please log in to access your account"
        onLogin={() => {
          setShowAuthError(false);
          navigate('/login');
        }}
        open={showAuthError}
        onClose={() => setShowAuthError(false)}
      />
    </Container>
  );
};

export default OwnerRegister; 