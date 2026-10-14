import React, { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate, useLocation } from 'react-router-dom';
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
import { billingPlanFromOnboarding, readOnboardingState, workspaceTypeFromOnboarding, writeOnboardingState } from '../../utils/onboardingState';
import { getDashboardPath } from '../../utils/registrationUtils';

const useOnboardingV2 = true;

function getOnboardingIdempotencyKey(email: string, plan: string, mode: string, cycle: string) {
  // Keep stable across quick retries / reloads to avoid duplicate onboarding sessions.
  // 10 minutes is enough for a normal signup attempt.
  const storageKey = `onboarding:idempotency:${email}:${mode}:${plan}:${cycle}`;
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.key && typeof parsed?.createdAt === 'number' && (Date.now() - parsed.createdAt) < 10 * 60 * 1000) {
        return String(parsed.key);
      }
    }
    const key = `signup:${email}:${mode}:${plan}:${cycle}:${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(storageKey, JSON.stringify({ key, createdAt: Date.now() }));
    return key;
  } catch {
    return `signup:${email}:${mode}:${plan}:${cycle}:${Math.random().toString(36).slice(2)}`;
  }
}

const Signup: React.FC = () => {
  const navigate = useNavigate();
  const { signup } = useAuth();
  const location = useLocation();
  const savedOnboarding = readOnboardingState();
  const searchParams = new URLSearchParams(location.search);
  const checkoutParam = searchParams.get('checkout');
  const planParam = searchParams.get('plan');
  const registrationMode: 'trial' | 'paid' = checkoutParam === 'paid' || (!checkoutParam && planParam && planParam !== 'TRIAL') || (!checkoutParam && !planParam && savedOnboarding.registrationMode === 'paid')
    ? 'paid'
    : checkoutParam === 'trial'
      ? 'trial'
      : savedOnboarding.registrationMode === 'paid'
        ? 'paid'
        : 'trial';
  const cycleParam = searchParams.get('cycle');
  const billingCycle: 'monthly' | 'yearly' = cycleParam === 'yearly'
    ? 'yearly'
    : cycleParam === 'monthly'
      ? 'monthly'
      : savedOnboarding.billingCycle === 'yearly'
        ? 'yearly'
        : 'monthly';
  const planLocked = registrationMode === 'trial' || Boolean(savedOnboarding.selectedPlan || searchParams.get('plan'));
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
    plan: billingPlanFromOnboarding(savedOnboarding) as 'INDIVIDUAL' | 'SME' | 'ENTERPRISE',
    companyType: savedOnboarding.role === 'landlord' || savedOnboarding.role === 'owner' ? 'INDIVIDUAL_LANDLORD' as const : 'REGISTERED_BUSINESS' as const,
    workspaceType: workspaceTypeFromOnboarding(savedOnboarding),
    companyName: '',
    companyEmail: '',
    address: '',
    phone: '',
    registrationNumber: '',
    tinNumber: '',
    vatNumber: '',
    country: 'Zimbabwe',
  });
  const [error, setError] = useState('');
  const [accountHelp, setAccountHelp] = useState(false);

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
    const requestedPlan = params.get('plan');
    const checkout = params.get('checkout') === 'paid' || (!params.get('checkout') && requestedPlan && requestedPlan !== 'TRIAL')
      ? 'paid'
      : 'trial';
    const cycle = params.get('cycle') === 'yearly' ? 'yearly' : 'monthly';
    const plan = params.get('plan');
    const onboarding = readOnboardingState();
    const nextPlan = (checkout === 'trial'
      ? 'INDIVIDUAL'
      : plan && ['INDIVIDUAL','SME','ENTERPRISE'].includes(plan)
      ? plan
      : billingPlanFromOnboarding(onboarding)) as 'INDIVIDUAL' | 'SME' | 'ENTERPRISE';
    setFormData(prev => ({
      ...prev,
      plan: nextPlan,
      workspaceType: nextPlan === 'INDIVIDUAL' ? 'individual' : 'agency',
      companyType: checkout === 'trial' || onboarding.role === 'landlord' || onboarding.role === 'owner' ? 'INDIVIDUAL_LANDLORD' : prev.companyType
    }));
    writeOnboardingState({
      selectedPlan: checkout === 'trial' ? 'TRIAL' : nextPlan,
      registrationMode: checkout,
      billingCycle: cycle
    });
  }, [location.search]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setAccountHelp(false);

    const validationErrors = useOnboardingV2
      ? validateOnboardingForm(formData)
      : (formData.password !== formData.confirmPassword ? ['Passwords do not match'] : []);
    if (validationErrors.length > 0) {
      setError(validationErrors[0]);
      return;
    }

    try {
      if (useOnboardingV2) {
        const idempotencyKey = getOnboardingIdempotencyKey(formData.email, registrationMode === 'trial' ? 'INDIVIDUAL' : formData.plan, registrationMode, billingCycle);
        const response = await apiService.startOnboarding({
          email: formData.email,
          password: formData.password,
          name: formData.name,
          plan: registrationMode === 'trial' ? 'INDIVIDUAL' : formData.plan,
          billingCycle,
          registrationMode,
          company: {
            name: formData.companyName,
            email: formData.companyEmail || formData.email,
            address: formData.address,
            phone: formData.phone,
            registrationNumber: formData.registrationNumber,
            tinNumber: formData.tinNumber,
            vatNumber: formData.vatNumber,
            country: formData.country,
            companyType: formData.companyType,
            workspaceType: formData.workspaceType
          }
        }, idempotencyKey);
        const paymentSession = response.data?.paymentSession;
        const nextStep = response.data?.registration?.nextStep;
        if (nextStep === 'payment') {
          if (!paymentSession?._id) {
            setError('Checkout could not be started for this registration.');
            return;
          }
          const sessionPlan = paymentSession.plan || formData.plan;
          const sessionCycle = paymentSession.billingCycle || billingCycle;
          window.location.assign(`/checkout/paypal?plan=${encodeURIComponent(sessionPlan)}&cycle=${encodeURIComponent(sessionCycle)}&paymentSessionId=${encodeURIComponent(paymentSession._id)}`);
          return;
        }
        const company = response.data?.company;
        window.location.assign(getDashboardPath('admin', {
          workspaceType: company?.workspaceType,
          plan: company?.plan || 'INDIVIDUAL'
        }));
        return;
      }
      await signup(formData.email, formData.password, formData.name, undefined, formData.plan, { skipNavigate: true });
      // After account creation, send user to checkout for paid plans
      navigate(`/checkout/paypal?plan=${encodeURIComponent(formData.plan)}&cycle=monthly`, {
        state: { message: 'Account created. Please complete payment to activate your subscription.' }
      });
    } catch (err: any) {
      setAccountHelp(err?.response?.data?.code === 'REGISTRATION_SIGN_IN_REQUIRED');
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
            {savedOnboarding.role
              ? `Continuing as ${savedOnboarding.role.replace('-', ' ')}${savedOnboarding.intent ? ` · ${savedOnboarding.intent.replace(/-/g, ' ')}` : ''}. Create your admin account to finish setup.`
              : 'Create your admin account first. Your selected plan will shape the workspace setup.'}
          </Typography>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
              {accountHelp && (
                <Box sx={{ mt: 1 }}>
                  <Link component={RouterLink} to="/login" color="inherit">Sign in</Link>
                  {' · '}
                  <Link component={RouterLink} to="/forgot-password" color="inherit">Forgot password</Link>
                </Box>
              )}
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
            {registrationMode === 'trial' ? (
              <TextField
                margin="normal"
                fullWidth
                label="Plan"
                value="14-day free trial"
                disabled
                helperText="No payment required to get started."
              />
            ) : (
              <>
                <TextField
                  margin="normal"
                  select
                  fullWidth
                  name="plan"
                  label="Plan"
                  value={formData.plan}
                  onChange={handleChange}
                  disabled={planLocked}
                  helperText={planLocked ? 'Plan selected from Mantis pricing.' : undefined}
                  SelectProps={{ native: true }}
                >
                  <option value="INDIVIDUAL">Landlord</option>
                  <option value="SME">Property Manager</option>
                  {formData.plan === 'ENTERPRISE' && <option value="ENTERPRISE">Enterprise</option>}
                </TextField>
                <TextField
                  margin="normal"
                  fullWidth
                  label="Billing"
                  value={billingCycle === 'yearly' ? 'Yearly' : 'Monthly'}
                  disabled
                  helperText="Secure checkout via Paynow. The amount is confirmed by Mantis."
                />
              </>
            )}
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
                  required
                  fullWidth
                  name="country"
                  label="Country"
                  value={formData.country}
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
              {registrationMode === 'trial' ? 'Start 14-Day Free Trial' : 'Continue to Paynow checkout'}
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