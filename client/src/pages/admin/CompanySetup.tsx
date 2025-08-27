import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Container, Paper, Typography, TextField, Button, Alert, CircularProgress, Grid, Snackbar } from '@mui/material';
import { apiService } from '../../api';
import { useCompany } from '../../contexts/CompanyContext';
import { useAuth } from '../../contexts/AuthContext';

const CompanySetup: React.FC = () => {
  const navigate = useNavigate();
  const { refreshCompany } = useCompany();
  const { refreshUser } = useAuth();
  const [successOpen, setSuccessOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    email: '',
    address: '',
    phone: '',
    website: '',
    registrationNumber: '',
    tinNumber: '',
    vatNumber: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiService.createCompany(form);
      await refreshCompany();
      await refreshUser();
      setSuccessOpen(true);
      setTimeout(() => navigate('/admin-dashboard', { replace: true }), 900);
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Failed to create company';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 6 }}>
      <Paper sx={{ p: 4 }}>
        <Typography variant="h5" gutterBottom>
          Set up your company
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Add your company details to start managing properties, users, and payments.
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Box component="form" onSubmit={handleSubmit}>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField name="name" label="Company Name" value={form.name} onChange={handleChange} fullWidth required />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField name="email" label="Email" value={form.email} onChange={handleChange} type="email" fullWidth required />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField name="phone" label="Phone" value={form.phone} onChange={handleChange} fullWidth required />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField name="website" label="Website" value={form.website} onChange={handleChange} fullWidth />
            </Grid>
            <Grid item xs={12}>
              <TextField name="address" label="Address" value={form.address} onChange={handleChange} fullWidth required />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField name="registrationNumber" label="Registration Number" value={form.registrationNumber} onChange={handleChange} fullWidth required />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField name="tinNumber" label="TIN Number" value={form.tinNumber} onChange={handleChange} fullWidth required />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField name="vatNumber" label="VAT Number" value={form.vatNumber} onChange={handleChange} fullWidth />
            </Grid>
          </Grid>
          <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
            <Button type="submit" variant="contained" disabled={loading}>
              {loading ? <CircularProgress size={20} /> : 'Create Company'}
            </Button>
            <Button variant="text" onClick={() => navigate('/admin-dashboard')}>Back to Dashboard</Button>
          </Box>
        </Box>
        <Snackbar
          open={successOpen}
          autoHideDuration={1200}
          onClose={() => setSuccessOpen(false)}
          message="Company created successfully"
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        />
      </Paper>
    </Container>
  );
};

export default CompanySetup;



