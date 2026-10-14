import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Grid,
  LinearProgress,
  MenuItem,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography
} from '@mui/material';
import { apiService } from '../../api';
import { useCompany } from '../../contexts/CompanyContext';
import { useAuth } from '../../contexts/AuthContext';
import { getDashboardPath } from '../../utils/registrationUtils';
import { readOnboardingState, writeOnboardingState, type OnboardingRole } from '../../utils/onboardingState';
import { ROUTES } from '../LandingPage/landingData';

const steps = ['Company Basics', 'Preferences', 'Portfolio', 'Team', 'Initialize'];

const WorkspaceSetup: React.FC = () => {
  const navigate = useNavigate();
  const { company, refreshCompany } = useCompany();
  const { user } = useAuth();
  const onboarding = readOnboardingState();
  const role: OnboardingRole = onboarding.role || (company?.plan === 'INDIVIDUAL' ? 'landlord' : 'manager');
  const isLandlordLike = role === 'landlord' || role === 'owner';
  const checklist = isLandlordLike
    ? ['Company/profile', 'Add or import properties', 'Add tenants', 'Add leases', 'Record first payment']
    : role === 'accountant'
      ? ['Company/profile', 'Properties', 'Property accounts', 'Payments', 'Reports']
      : ['Company/profile', 'Add or import properties', 'Add tenants', 'Add leases', 'Configure financial settings', 'Invite team'];
  const displaySteps = isLandlordLike
    ? ['Company Basics', 'Preferences', 'Portfolio', 'Team (optional)', 'Initialize']
    : steps;
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: company?.name || '',
    companyType: company?.companyType || 'INDIVIDUAL_LANDLORD',
    email: company?.email || '',
    phone: company?.phone || '',
    registrationNumber: company?.registrationNumber || '',
    tinNumber: company?.tinNumber || '',
    vatNumber: company?.vatNumber || '',
    currency: company?.workspacePreferences?.currency || 'USD',
    timezone: company?.workspacePreferences?.timezone || 'Africa/Harare',
    measurementUnits: company?.workspacePreferences?.measurementUnits || 'metric',
    invoicePrefix: company?.workspacePreferences?.invoicePrefix || 'INV'
  });

  // If company loads after first render, hydrate any still-empty fields.
  useEffect(() => {
    if (!company) return;
    setForm((prev) => ({
      ...prev,
      name: prev.name || company.name || '',
      companyType: (prev.companyType as any) || company.companyType || 'INDIVIDUAL_LANDLORD',
      email: prev.email || company.email || '',
      phone: prev.phone || company.phone || '',
      registrationNumber: prev.registrationNumber || company.registrationNumber || '',
      tinNumber: prev.tinNumber || company.tinNumber || '',
      vatNumber: prev.vatNumber || company.vatNumber || '',
      currency: prev.currency || company.workspacePreferences?.currency || 'USD',
      timezone: prev.timezone || company.workspacePreferences?.timezone || 'Africa/Harare',
      measurementUnits: prev.measurementUnits || company.workspacePreferences?.measurementUnits || 'metric',
      invoicePrefix: prev.invoicePrefix || company.workspacePreferences?.invoicePrefix || 'INV',
    }));
  }, [company?._id]);

  const completion = useMemo(() => Math.round(((activeStep + 1) / steps.length) * 100), [activeStep]);

  useEffect(() => {
    writeOnboardingState({ setupProgress: completion });
  }, [completion]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  };

  const saveProgress = async (complete = false) => {
    await apiService.updateCompany({
      name: form.name,
      companyType: form.companyType,
      email: form.email,
      phone: form.phone,
      registrationNumber: form.registrationNumber,
      tinNumber: form.tinNumber,
      vatNumber: form.vatNumber,
      workspacePreferences: {
        currency: form.currency,
        timezone: form.timezone,
        measurementUnits: form.measurementUnits,
        invoicePrefix: form.invoicePrefix
      },
      ...(complete ? { onboardingStatus: 'ACTIVE', onboardingCompleted: true, tenantStatus: 'active' } : {})
    });
    await refreshCompany();
  };

  const handleNext = async () => {
    setError(null);
    if (activeStep === 0 && !form.name.trim()) {
      setError('Workspace name is required');
      return;
    }

    if (activeStep < steps.length - 1) {
      try {
        setLoading(true);
        if (activeStep <= 1) await saveProgress(false);
        setActiveStep((step) => step + 1);
      } catch (err: any) {
        const code = err?.response?.data?.code;
        if (code === 'NO_COMPANY') {
          setError('No workspace found for this account yet. Please create your company first.');
        } else {
          setError(err?.response?.data?.message || err?.message || 'Could not save workspace setup');
        }
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      setLoading(true);
      await saveProgress(true);
      const path = getDashboardPath((user?.role as any) || 'admin', company);
      navigate(path, { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Workspace initialization failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 6 }}>
      <Stack spacing={3}>
        <Box>
          <Chip label={company?.plan || role || 'Workspace'} color="primary" size="small" sx={{ mb: 1 }} />
          <Typography variant="h4" fontWeight={800}>
            Let&apos;s get your Mantis workspace ready.
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Complete what you need now. Skip anything that can wait.
          </Typography>
          <Stack spacing={1} sx={{ mt: 2 }}>
            <Typography variant="subtitle2">Setup progress {completion}%</Typography>
            {checklist.map((item, index) => (
              <Typography key={item} variant="body2" color="text.secondary">
                {index < Math.round((completion / 100) * checklist.length) ? '☑' : '☐'} {item}
              </Typography>
            ))}
          </Stack>
        </Box>

        <Card>
          <CardContent>
            <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 3 }}>
              {displaySteps.map((label) => (
                <Step key={label}>
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>
            <LinearProgress variant="determinate" value={completion} sx={{ mb: 3 }} />

            {error && (
              <Alert
                severity="error"
                sx={{ mb: 2 }}
                action={<Button color="inherit" size="small" onClick={() => { setError(null); void handleNext(); }}>Try again</Button>}
              >
                {error}
              </Alert>
            )}

            {activeStep === 0 && (
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField fullWidth required label="Workspace / Company Name" name="name" value={form.name} onChange={handleChange} />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField select fullWidth label="Company Type" name="companyType" value={form.companyType} onChange={handleChange}>
                    <MenuItem value="INDIVIDUAL_LANDLORD">Individual landlord</MenuItem>
                    <MenuItem value="REGISTERED_BUSINESS">Registered business</MenuItem>
                  </TextField>
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField fullWidth label="Company Email" name="email" value={form.email} onChange={handleChange} />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField fullWidth label="Phone" name="phone" value={form.phone} onChange={handleChange} />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField fullWidth label="VAT Number (optional)" name="vatNumber" value={form.vatNumber} onChange={handleChange} />
                </Grid>
                {form.companyType === 'REGISTERED_BUSINESS' && (
                  <>
                    <Grid item xs={12} md={6}>
                      <TextField fullWidth label="Registration Number" name="registrationNumber" value={form.registrationNumber} onChange={handleChange} />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField fullWidth label="TIN Number" name="tinNumber" value={form.tinNumber} onChange={handleChange} />
                    </Grid>
                  </>
                )}
              </Grid>
            )}

            {activeStep === 1 && (
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <TextField select fullWidth label="Currency" name="currency" value={form.currency} onChange={handleChange}>
                    <MenuItem value="USD">USD</MenuItem>
                    <MenuItem value="ZiG">ZiG</MenuItem>
                  </TextField>
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField fullWidth label="Timezone" name="timezone" value={form.timezone} onChange={handleChange} />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField select fullWidth label="Measurement Units" name="measurementUnits" value={form.measurementUnits} onChange={handleChange}>
                    <MenuItem value="metric">Metric</MenuItem>
                    <MenuItem value="imperial">Imperial</MenuItem>
                  </TextField>
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField fullWidth label="Invoice Prefix" name="invoicePrefix" value={form.invoicePrefix} onChange={handleChange} />
                </Grid>
              </Grid>
            )}

            {activeStep === 2 && (
              <Stack spacing={2}>
                <Alert severity="info">
                  Add your first property to start tracking tenants, leases, rent and property finances. Import only validates a spreadsheet — nothing is posted automatically.
                </Alert>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <Button
                    variant="contained"
                    onClick={() => navigate(
                      company?.plan === 'INDIVIDUAL' || company?.workspaceType === 'individual'
                        ? '/individual-dashboard/properties'
                        : '/admin-dashboard/properties'
                    )}
                  >
                    Add properties manually
                  </Button>
                  <Button variant="outlined" onClick={() => navigate(ROUTES.portfolioImport)}>Import spreadsheet</Button>
                  <Button variant="text" onClick={() => navigate(ROUTES.demo)}>Explore sample data</Button>
                </Stack>
              </Stack>
            )}

            {activeStep === 3 && (
              <Alert severity="info">
                {isLandlordLike
                  ? 'Invite staff later if you need help. Solo landlords can continue without a team.'
                  : 'Invite staff from User Management when ready. You can skip this and add people later.'}
              </Alert>
            )}

            {activeStep === 4 && (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                {loading ? <CircularProgress sx={{ mb: 2 }} /> : null}
                <Typography variant="h6">Preparing your Mantis workspace</Typography>
                <Typography variant="body2" color="text.secondary">
                  We are enabling your modules, saving preferences, and preparing your dashboard.
                </Typography>
              </Box>
            )}

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
              <Button disabled={activeStep === 0 || loading} onClick={() => setActiveStep((step) => step - 1)}>
                Back
              </Button>
              <Stack direction="row" spacing={1}>
                {activeStep < steps.length - 1 && (
                  <Button disabled={loading} onClick={() => setActiveStep((step) => Math.min(step + 1, steps.length - 1))}>
                    Skip for later
                  </Button>
                )}
                <Button variant="contained" disabled={loading} onClick={handleNext}>
                  {loading ? <CircularProgress size={20} /> : activeStep === steps.length - 1 ? 'Enter Dashboard' : 'Continue'}
                </Button>
              </Stack>
            </Box>
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
};

export default WorkspaceSetup;
