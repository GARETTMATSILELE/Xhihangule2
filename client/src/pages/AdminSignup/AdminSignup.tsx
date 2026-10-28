import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  TextField,
  Typography,
  Container,
  Paper,
  Alert,
  Link,
  Stepper,
  Step,
  StepLabel,
  IconButton,
  InputAdornment,
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { billingPlanFromOnboarding, readOnboardingState, writeOnboardingState } from '../../utils/onboardingState';
import { SignupAvailabilityNotice, useSignupAvailability } from '../../hooks/useSignupAvailability';

const steps = ['Account Details'];

export interface AdminSignupProps {}

const AdminSignup: React.FC<AdminSignupProps> = () => {
  const navigate = useNavigate();
  const { signup } = useAuth();
  const availability = useSignupAvailability();
  const savedOnboarding = readOnboardingState();
  const planLocked = Boolean(savedOnboarding.selectedPlan || savedOnboarding.role);
  const [activeStep, setActiveStep] = useState(0);
  const [formData, setFormData] = useState({
    // Account Details
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
    plan: billingPlanFromOnboarding(savedOnboarding) as 'INDIVIDUAL' | 'SME' | 'ENTERPRISE',
    // Company Details removed for initial signup
  });
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeStep === 0) {
      // Validate account details
      if (!formData.email || !formData.password || !formData.confirmPassword || !formData.name) {
        setError('Please fill in all required fields');
        return;
      }
      if (formData.password !== formData.confirmPassword) {
        setError('Passwords do not match');
        return;
      }
    }
    setError('');
    setActiveStep((prevStep) => prevStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevStep) => prevStep - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.email || !formData.password || !formData.confirmPassword || !formData.name) {
      setError('Please fill in all required fields');
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    try {
      // Sign up with account details only
      await signup(
        formData.email,
        formData.password,
        formData.name,
        undefined,
        formData.plan
      );
      // Navigation is handled by AuthContext.signup (company-setup for admins without a company)
    } catch (err: any) {
      setError(err.message || 'An error occurred during registration');
    }
  };

  const renderStepContent = (step: number) => {
    switch (step) {
      case 0:
        return (
          <>
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
              type={showPassword ? 'text' : 'password'}
              id="password"
              autoComplete="new-password"
              value={formData.password}
              onChange={handleChange}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="toggle password visibility"
                      onClick={() => setShowPassword((show) => !show)}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="confirmPassword"
              label="Confirm Password"
              type={showConfirmPassword ? 'text' : 'password'}
              id="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="toggle confirm password visibility"
                      onClick={() => setShowConfirmPassword((show) => !show)}
                      edge="end"
                    >
                      {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              margin="normal"
              select
              fullWidth
              name="plan"
              label="Plan"
              value={formData.plan}
              onChange={(e) => {
                handleChange(e as React.ChangeEvent<HTMLInputElement>);
                writeOnboardingState({ selectedPlan: e.target.value as 'INDIVIDUAL' | 'SME' | 'ENTERPRISE' });
              }}
              disabled={planLocked}
              helperText={planLocked ? 'Plan selected from the Mantis site. You will not need to choose it again.' : undefined}
              SelectProps={{ native: true }}
            >
              <option value="INDIVIDUAL">Individual (up to 10 properties)</option>
              <option value="SME">SME (up to 120 properties)</option>
              <option value="ENTERPRISE">Enterprise (unlimited)</option>
            </TextField>
          </>
        );
      default:
        return null;
    }
  };

  if (availability.state !== 'open') {
    return <SignupAvailabilityNotice state={availability.state} />;
  }

  return (
    <Container component="main" maxWidth="md">
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
            Create Your Workspace
          </Typography>
          <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 2 }}>
            {savedOnboarding.role
              ? `We'll keep your ${savedOnboarding.role} setup and take you into workspace setup after this account is created.`
              : 'Start with your admin account. We will guide you through workspace setup after registration.'}
          </Typography>
          <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
            {steps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Box component="form" onSubmit={activeStep === steps.length - 1 ? handleSubmit : handleNext} sx={{ mt: 1 }}>
            {renderStepContent(activeStep)}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
              <Button
                disabled={activeStep === 0}
                onClick={handleBack}
                variant="outlined"
              >
                Back
              </Button>
              <Button
                type="submit"
                variant="contained"
              >
                {activeStep === steps.length - 1 ? 'Register' : 'Next'}
              </Button>
            </Box>
            {activeStep === 0 && (
              <Box sx={{ textAlign: 'center', mt: 2 }}>
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
            )}
          </Box>
        </Paper>
      </Box>
    </Container>
  );
};

export default AdminSignup; 