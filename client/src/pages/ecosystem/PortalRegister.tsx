import React, { useState } from 'react';
import { Alert, Box, Button, MenuItem, Paper, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import ecosystemService from '../../services/ecosystemService';
import { INDIVIDUAL_THEME } from '../IndividualDashboard/theme';
import { useAuth } from '../../contexts/AuthContext';

const TRADES = [
  'Plumber',
  'Electrician',
  'Builder',
  'Painter',
  'Pool Technician',
  'Landscaper',
  'Carpenter',
  'General Contractor',
  'Other',
];

const PortalRegister: React.FC<{ role: 'tenant' | 'contractor' }> = ({ role }) => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [accountType, setAccountType] = useState<'individual' | 'company'>(role === 'tenant' ? 'individual' : 'company');
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    phone: '',
    homeAddress: '',
    companyName: '',
    companyAddress: '',
    trade: 'General Contractor',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const individual = accountType === 'individual';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (individual && !form.homeAddress.trim()) {
      setError('Home address is required');
      return;
    }
    if (!individual && (!form.companyName.trim() || !form.companyAddress.trim())) {
      setError('Company name and company address are required');
      return;
    }
    setLoading(true);
    try {
      await ecosystemService.register({
        role,
        accountType,
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        password: form.password,
        phone: form.phone,
        homeAddress: individual ? form.homeAddress : undefined,
        companyName: individual ? undefined : form.companyName,
        companyAddress: individual ? undefined : form.companyAddress,
        trade: role === 'contractor' ? form.trade : undefined,
      });
      await login(form.email, form.password);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: INDIVIDUAL_THEME.background, p: 2 }}>
      <Paper sx={{ p: 3, width: '100%', maxWidth: 480, borderRadius: 3 }}>
        <Typography variant="h5" sx={{ mb: 1, color: INDIVIDUAL_THEME.primary, fontWeight: 700 }}>
          {role === 'tenant' ? 'Tenant registration' : 'Contractor registration'}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {role === 'tenant'
            ? 'Register as a tenant. You are not joining an agency, and this is separate from contractor signup.'
            : 'Register as a contractor so agencies can send you job offers. This is separate from tenant signup.'}
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <form onSubmit={submit}>
          <Stack spacing={2}>
            <ToggleButtonGroup
              exclusive
              fullWidth
              value={accountType}
              onChange={(_, value: 'individual' | 'company' | null) => { if (value) setAccountType(value); }}
              aria-label="Register as individual or company"
            >
              <ToggleButton value="individual" sx={{ textTransform: 'none' }}>Individual</ToggleButton>
              <ToggleButton value="company" sx={{ textTransform: 'none' }}>Company</ToggleButton>
            </ToggleButtonGroup>
            <TextField label="First name" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            <TextField label="Last name" required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            <TextField label="Email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <TextField label="Phone" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            {individual ? (
              <TextField
                required
                label="Home address"
                value={form.homeAddress}
                onChange={(e) => setForm({ ...form, homeAddress: e.target.value })}
              />
            ) : (
              <>
                <TextField
                  required
                  label="Company name"
                  value={form.companyName}
                  onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                />
                <TextField
                  required
                  label="Company address"
                  value={form.companyAddress}
                  onChange={(e) => setForm({ ...form, companyAddress: e.target.value })}
                />
              </>
            )}
            {role === 'contractor' && (
              <TextField select required label="Trade" value={form.trade} onChange={(e) => setForm({ ...form, trade: e.target.value })}>
                {TRADES.map((trade) => <MenuItem key={trade} value={trade}>{trade}</MenuItem>)}
              </TextField>
            )}
            <TextField label="Password" type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <Button type="submit" disabled={loading} variant="contained" sx={{ bgcolor: INDIVIDUAL_THEME.primary, minHeight: 48 }}>
              Create account
            </Button>
            <Button onClick={() => navigate('/login')}>Already have an account</Button>
          </Stack>
        </form>
      </Paper>
    </Box>
  );
};

export const TenantRegister = () => <PortalRegister role="tenant" />;
export const ContractorRegister = () => <PortalRegister role="contractor" />;
export default PortalRegister;
