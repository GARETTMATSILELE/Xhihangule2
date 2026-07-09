import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Button,
  TextField,
  Typography,
  Container,
  Paper,
  Alert,
  Link,
} from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import { apiService } from '../../api';
import { validateOnboardingForm, handleRegistrationError } from '../../utils/registrationUtils';

const useOnboardingV2 = process.env.REACT_APP_SAAS_ONBOARDING_V2 === 'true';

function getOnboardingIdempotencyKey(email: string, plan: string) {
  // Keep stable across quick retries / reloads to avoid duplicate onboarding sessions.
  // 10 minutes is enough for a normal signup attempt.
  const storageKey = `onboarding:idempotency:${email}:${plan}`;
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.key && typeof parsed?.createdAt === 'number' && (Date.now() - parsed.createdAt) < 10 * 60 * 1000) {
        return String(parsed.key);
      }
    }
    const key = `signup:${email}:${plan}:${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(storageKey, JSON.stringify({ key, createdAt: Date.now() }));
    return key;
  } catch {
    return `signup:${email}:${plan}:${Math.random().toString(36).slice(2)}`;
  }
}

const Signup: React.FC = () => {
  const navigate = useNavigate();
  const { signup } = useAuth();
  const location = useLocation();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
    plan: 'INDIVIDUAL' as 'INDIVIDUAL' | 'SME' | 'ENTERPRISE',
    companyType: 'INDIVIDUAL_LANDLORD' as 'INDIVIDUAL_LANDLORD' | 'REGISTERED_BUSINESS',
    workspaceType: 'individual' as 'agency' | 'individual',
    companyName: '',
    companyEmail: '',
    address: '',
    phone: '',
    registrationNumber: '',
    tinNumber: '',
    vatNumber: '',
  });
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.name === 'plan') {
      const plan = e.target.value as 'INDIVIDUAL' | 'SME' | 'ENTERPRISE';
      setFormData({
        ...formData,
        plan,
        workspaceType: plan === 'INDIVIDUAL' ? 'individual' : 'agency',
      });
      return;
    }
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const plan = params.get('plan');
    if (plan && ['INDIVIDUAL','SME','ENTERPRISE'].includes(plan)) {
      setFormData(prev => ({ ...prev, plan: plan as any, workspaceType: plan === 'INDIVIDUAL' ? 'individual' : 'agency' }));
    }
  }, [location.search]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const validationErrors = useOnboardingV2
      ? validateOnboardingForm(formData)
      : (formData.password !== formData.confirmPassword ? ['Passwords do not match'] : []);
    if (validationErrors.length > 0) {
      setError(validationErrors[0]);
      return;
    }

    try {
      if (useOnboardingV2) {
        const idempotencyKey = getOnboardingIdempotencyKey(formData.email, formData.plan);
        const response = await apiService.startOnboarding({
          email: formData.email,
          password: formData.password,
          name: formData.name,
          plan: formData.plan,
          billingCycle: 'monthly',
          company: {
            name: formData.companyName,
            email: formData.companyEmail || formData.email,
            address: formData.address,
            phone: formData.phone,
            registrationNumber: formData.registrationNumber,
            tinNumber: formData.tinNumber,
            vatNumber: formData.vatNumber,
            companyType: formData.companyType,
            workspaceType: formData.workspaceType
          }
        }, idempotencyKey);
        const paymentSessionId = response.data?.paymentSession?._id;
        navigate(`/checkout/paypal?plan=${encodeURIComponent(formData.plan)}&cycle=monthly${paymentSessionId ? `&paymentSessionId=${encodeURIComponent(paymentSessionId)}` : ''}`, {
          state: { message: 'Workspace created. Please complete payment to activate your subscription.' }
        });
        return;
      }
      await signup(formData.email, formData.password, formData.name, undefined, formData.plan, { skipNavigate: true });
      // After account creation, send user to checkout for paid plans
      navigate(`/checkout/paypal?plan=${encodeURIComponent(formData.plan)}&cycle=monthly`, {
        state: { message: 'Account created. Please complete payment to activate your subscription.' }
      });
    } catch (err: any) {
      setError(handleRegistrationError(err));
    }
  };

  return (
    <Container component="main" maxWidth="xs">
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
            Set Up Your Property Management Workspace
          </Typography>
          <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 2 }}>
            Create your admin account first. Your selected plan will shape the workspace setup.
          </Typography>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
            <TextField
              margin="normal"
              required
              fullWidth
              id="name"
              label="Full Name"
              name="name"
              autoComplete="name"
              autoFocus
              value={formData.name}
              onChange={handleChange}
            />
            <TextField
              margin="normal"
              select
              fullWidth
              name="plan"
              label="Plan"
              value={formData.plan}
              onChange={handleChange}
              SelectProps={{ native: true }}
            >
              <option value="INDIVIDUAL">Individual (up to 10 properties)</option>
              <option value="SME">SME (up to 120 properties)</option>
              <option value="ENTERPRISE">Enterprise (unlimited)</option>
            </TextField>
            <TextField
              margin="normal"
              select
              fullWidth
              name="workspaceType"
              label="Workspace Type"
              value={formData.workspaceType}
              onChange={handleChange}
              SelectProps={{ native: true }}
              helperText="Choose Agency for tenant-owner-agent workflows, or Individual Property Owner for direct landlord management."
            >
              <option value="individual">Individual Property Owner</option>
              <option value="agency">Agency</option>
            </TextField>
            {useOnboardingV2 && (
              <>
                <TextField
                  margin="normal"
                  select
                  fullWidth
                  name="companyType"
                  label="Company Type"
                  value={formData.companyType}
                  onChange={handleChange}
                  SelectProps={{ native: true }}
                >
                  <option value="INDIVIDUAL_LANDLORD">Individual Landlord</option>
                  <option value="REGISTERED_BUSINESS">Registered Business</option>
                </TextField>
                <TextField
                  margin="normal"
                  required
                  fullWidth
                  name="companyName"
                  label="Workspace / Company Name"
                  value={formData.companyName}
                  onChange={handleChange}
                />
                <TextField
                  margin="normal"
                  fullWidth
                  name="companyEmail"
                  label="Company Email"
                  type="email"
                  value={formData.companyEmail}
                  onChange={handleChange}
                />
                <TextField
                  margin="normal"
                  required={formData.companyType === 'REGISTERED_BUSINESS'}
                  fullWidth
                  name="phone"
                  label="Phone"
                  value={formData.phone}
                  onChange={handleChange}
                />
                <TextField
                  margin="normal"
                  required={formData.companyType === 'REGISTERED_BUSINESS'}
                  fullWidth
                  name="address"
                  label="Address"
                  value={formData.address}
                  onChange={handleChange}
                />
                {formData.companyType === 'REGISTERED_BUSINESS' && (
                  <>
                    <TextField
                      margin="normal"
                      required
                      fullWidth
                      name="registrationNumber"
                      label="Registration Number"
                      value={formData.registrationNumber}
                      onChange={handleChange}
                    />
                    <TextField
                      margin="normal"
                      required
                      fullWidth
                      name="tinNumber"
                      label="TIN Number"
                      value={formData.tinNumber}
                      onChange={handleChange}
                    />
                    <TextField
                      margin="normal"
                      fullWidth
                      name="vatNumber"
                      label="VAT Number"
                      value={formData.vatNumber}
                      onChange={handleChange}
                    />
                  </>
                )}
              </>
            )}
            <TextField
              margin="normal"
              required
              fullWidth
              id="email"
              label="Email Address"
              name="email"
              autoComplete="email"
              value={formData.email}
              onChange={handleChange}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="Password"
              type="password"
              id="password"
              autoComplete="new-password"
              value={formData.password}
              onChange={handleChange}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="confirmPassword"
              label="Confirm Password"
              type="password"
              id="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2 }}
            >
              {useOnboardingV2 ? 'Create Workspace & Continue' : 'Proceed to Checkout'}
            </Button>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                Already have an account?{' '}
                <Link
                  component="button"
                  variant="body2"
                  onClick={() => navigate('/login')}
                  sx={{ cursor: 'pointer' }}
                >
                  Sign In
                </Link>
              </Typography>
            </Box>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
};

export default Signup; 