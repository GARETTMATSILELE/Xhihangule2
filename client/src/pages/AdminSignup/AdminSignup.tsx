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
} from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';

const steps = ['Account Details', 'Company Information'];

export interface AdminSignupProps {}

const AdminSignup: React.FC<AdminSignupProps> = () => {
  const navigate = useNavigate();
  const { signup } = useAuth();
  const [activeStep, setActiveStep] = useState(0);
  const [formData, setFormData] = useState({
    // Account Details
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
    // Company Details
    companyName: '',
    companyAddress: '',
    companyPhone: '',
    companyEmail: '',
    companyWebsite: '',
    companyRegistration: '',
    companyTaxNumber: '',
  });
  const [error, setError] = useState('');

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

    // Validate company details
    if (!formData.companyName || !formData.companyAddress || !formData.companyPhone || 
        !formData.companyEmail || !formData.companyRegistration || !formData.companyTaxNumber) {
      setError('Please fill in all required company fields');
      return;
    }

    try {
      // Sign up with both user and company details
      await signup(
        formData.email,
        formData.password,
        formData.name,
        {
          name: formData.companyName,
          address: formData.companyAddress,
          phone: formData.companyPhone,
          email: formData.companyEmail,
          website: formData.companyWebsite,
          registrationNumber: formData.companyRegistration,
          taxNumber: formData.companyTaxNumber,
        }
      );
      navigate('/login', { state: { message: 'Registration successful! Please log in.' } });
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
          </>
        );
      case 1:
        return (
          <>
            <TextField
              margin="normal"
              required
              fullWidth
              id="companyName"
              label="Company Name"
              name="companyName"
              value={formData.companyName}
              onChange={handleChange}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              id="companyAddress"
              label="Company Address"
              name="companyAddress"
              multiline
              rows={3}
              value={formData.companyAddress}
              onChange={handleChange}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              id="companyPhone"
              label="Company Phone"
              name="companyPhone"
              value={formData.companyPhone}
              onChange={handleChange}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              id="companyEmail"
              label="Company Email"
              name="companyEmail"
              type="email"
              value={formData.companyEmail}
              onChange={handleChange}
            />
            <TextField
              margin="normal"
              fullWidth
              id="companyWebsite"
              label="Company Website"
              name="companyWebsite"
              value={formData.companyWebsite}
              onChange={handleChange}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              id="companyRegistration"
              label="Company Registration Number"
              name="companyRegistration"
              value={formData.companyRegistration}
              onChange={handleChange}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              id="companyTaxNumber"
              label="Company Tax Number"
              name="companyTaxNumber"
              value={formData.companyTaxNumber}
              onChange={handleChange}
            />
          </>
        );
      default:
        return null;
    }
  };

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
            Admin Registration
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