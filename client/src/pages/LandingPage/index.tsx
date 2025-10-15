import React, { useMemo, useState } from 'react';
import { alpha } from '@mui/material/styles';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  CardActions,
  Chip,
  Tabs,
  Tab,
  Link,
  ToggleButtonGroup,
  ToggleButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

const LandingPage: React.FC = () => {
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');

  type FeatureKey =
    | 'ACCOUNTING'
    | 'PAYMENTS'
    | 'LEASING'
    | 'MAINTENANCE'
    | 'MOBILE_APPS'
    | 'INTEGRATIONS'
    | 'SALES'
    | 'REPORTING'
    | 'ROLES'
    | 'DASHBOARDS';

  const [active, setActive] = useState<FeatureKey>('ACCOUNTING');

  const featureTabs: { key: FeatureKey; label: string; title: string; description: string; bullets: string[]; cta: string; image: string; }[] = [
    {
      key: 'ACCOUNTING',
      label: 'ACCOUNTING',
      title: 'Purpose-Built Accounting',
      description:
        'Guided workflows and automations for accurate, property-specific accounting.',
      bullets: [
        'Automatic bank reconciliation',
        'Generate statements and tax-ready reports',
        'Property-specific financial reporting'
      ],
      cta: 'View Accounting Features',
      image:
        'https://images.unsplash.com/photo-1556742044-3c52d6e88c62?auto=format&fit=crop&w=1200&q=80'
    },
    {
      key: 'PAYMENTS',
      label: 'PAYMENTS',
      title: 'Modern Payments & Collections',
      description:
        'Collect rent online and reconcile faster with automated reminders and receipts.',
      bullets: [
        'Online payments via Paynow',
        'Automatic receipts and reminders',
        'Deposit and refund management'
      ],
      cta: 'View Payments Features',
      image:
        'https://images.unsplash.com/photo-1605901309584-818e25960a8b?auto=format&fit=crop&w=1200&q=80'
    },
    {
      key: 'LEASING',
      label: 'LEASING',
      title: 'Smart Leasing',
      description:
        'Create, renew, and track leases with e-sign-ready documents and reminders.',
      bullets: [
        'Lease creation and renewals',
        'Tenant onboarding checklist',
        'Automated lease reminders'
      ],
      cta: 'View Leasing Features',
      image:
        'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=1200&q=80'
    },
    {
      key: 'MAINTENANCE',
      label: 'MAINTENANCE',
      title: 'Maintenance & Work Orders',
      description:
        'Track requests from report to resolution with clear ownership and timelines.',
      bullets: [
        'Resident and staff requests',
        'Assign tasks to agents/contractors',
        'Status tracking to completion'
      ],
      cta: 'View Maintenance Features',
      image:
        'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80'
    },
    {
      key: 'MOBILE_APPS',
      label: 'MOBILE APPS',
      title: 'Mobile Access Anywhere',
      description:
        'Empower teams and tenants with mobile-friendly tools built for productivity.',
      bullets: [
        'Responsive dashboards',
        'On-the-go inspections',
        'Instant notifications'
      ],
      cta: 'View Mobile Features',
      image:
        'https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?auto=format&fit=crop&w=1200&q=80'
    },
    {
      key: 'INTEGRATIONS',
      label: 'INTEGRATIONS',
      title: 'Integrations',
      description:
        'Connect your favorite tools for payments, analytics, and document management.',
      bullets: [
        'Accounting exports',
        'Payment gateway integration',
        'Data import/export'
      ],
      cta: 'View Integrations',
      image:
        'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1200&q=80'
    },
    {
      key: 'SALES',
      label: 'SALES / CRM',
      title: 'Sales CRM for Listings',
      description:
        'Manage leads to deals with viewings, buyers, owners, and property pipelines.',
      bullets: [
        'Leads, viewings, and buyer tracking',
        'Owners, listings, and developments',
        'Deals pipeline with stages'
      ],
      cta: 'View Sales Features',
      image:
        'https://images.unsplash.com/photo-1560520653-9e0e4a7a0cf5?auto=format&fit=crop&w=1200&q=80'
    },
    {
      key: 'REPORTING',
      label: 'REPORTING',
      title: 'Reporting & Analytics',
      description:
        'Operational and financial insights to guide performance and growth.',
      bullets: [
        'Income and expense reports',
        'Occupancy and performance KPIs',
        'CSV/PDF exports'
      ],
      cta: 'View Reporting Features',
      image:
        'https://images.unsplash.com/photo-1551281044-8b29fbcb625a?auto=format&fit=crop&w=1200&q=80'
    },
    {
      key: 'ROLES',
      label: 'ROLES & PERMISSIONS',
      title: 'Roles & Permissions',
      description:
        'Granular access for Admin, Owner, Agent, Accountant, and Sales teams.',
      bullets: [
        'Role-based access control',
        'Company and property scoping',
        'Audit-friendly activity logs'
      ],
      cta: 'View Roles Features',
      image:
        'https://images.unsplash.com/photo-1507209696998-3c532be9b2b1?auto=format&fit=crop&w=1200&q=80'
    },
    {
      key: 'DASHBOARDS',
      label: 'DASHBOARDS & PORTALS',
      title: 'Dashboards & Portals',
      description:
        'Focused dashboards for each role to get work done faster.',
      bullets: [
        'Admin, Owner, Agent, Accountant dashboards',
        'Quick actions and KPIs',
        'Tenant-facing portal options'
      ],
      cta: 'View Dashboards',
      image:
        'https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=1200&q=80'
    }
  ];

  const activeData = featureTabs.find(t => t.key === active)!;

  const prices = useMemo(() => {
    // Base monthly USD prices
    const monthly = { INDIVIDUAL: 100, SME: 300, ENTERPRISE: 600 } as const;
    if (cycle === 'monthly') return monthly;
    // Yearly shows discount (2 months off)
    return {
      INDIVIDUAL: monthly.INDIVIDUAL * 10,
      SME: monthly.SME * 10,
      ENTERPRISE: monthly.ENTERPRISE * 10
    } as const;
  }, [cycle]);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Hero Section */}
      <Box
        sx={{
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          py: 8,
        }}
      >
        <Container maxWidth="lg">
          <Grid container spacing={4} alignItems="center">
            <Grid item xs={12} md={6}>
              <Typography variant="h2" component="h1" gutterBottom>
                Welcome to Xhihangule
              </Typography>
              <Typography variant="h5" paragraph>
                Your all-in-one solution for business management
              </Typography>
              <Box sx={{ mt: 4 }}>
                <Button
                  component={RouterLink}
                  to="/admin-signup"
                  variant="contained"
                  color="secondary"
                  size="large"
                  sx={{ mr: 2 }}
                >
                  Get Started
                </Button>
                <Button
                  component={RouterLink}
                  to="/login"
                  variant="outlined"
                  color="inherit"
                  size="large"
                >
                  Login
                </Button>
              </Box>
            </Grid>
            <Grid item xs={12} md={6}>
              {/* Add hero image here */}
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* Features Section */}
      <Container maxWidth="lg" sx={{ py: 8 }}>
        <Typography variant="overline" align="center" display="block" gutterBottom color="primary">
          FEATURES
        </Typography>
        <Typography variant="h4" component="h2" align="center" gutterBottom>
          Every feature. All in one platform.
        </Typography>

        {/* Tabs */}
        <Box sx={{ mt: 4 }}>
          <Tabs
            value={active}
            onChange={(_, v) => setActive(v)}
            variant="scrollable"
            scrollButtons
            allowScrollButtonsMobile
            textColor="primary"
            indicatorColor="primary"
            TabIndicatorProps={{ sx: { height: 3, borderRadius: 3 } }}
            sx={{ borderBottom: theme => `1px dashed ${theme.palette.divider}` }}
          >
            {featureTabs.map(t => (
              <Tab key={t.key} value={t.key} label={t.label} sx={{ fontWeight: 700 }} />
            ))}
          </Tabs>

          {/* Featured panel */}
          <Box
            sx={{
              mt: 3,
              p: { xs: 2, md: 4 },
              borderRadius: 3,
              bgcolor: theme => alpha(theme.palette.success.light, 0.16)
            }}
          >
            <Grid container spacing={4} alignItems="center">
              <Grid item xs={12} md={6}>
                <Box
                  component="img"
                  src={activeData.image}
                  alt={activeData.title}
                  sx={{ width: '100%', borderRadius: 2, boxShadow: 1 }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="h4" gutterBottom>
                  {activeData.title}
                </Typography>
                <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                  {activeData.description}
                </Typography>
                <List dense>
                  {activeData.bullets.map(b => (
                    <ListItem key={b} sx={{ py: 0.5 }}>
                      <ListItemIcon sx={{ minWidth: 28 }}>
                        <CheckCircleOutlineIcon color="primary" fontSize="small" />
                      </ListItemIcon>
                      <ListItemText primary={b} />
                    </ListItem>
                  ))}
                </List>
                <Link href="#" underline="hover" sx={{ fontWeight: 600 }}>
                  {activeData.cta}
                </Link>
              </Grid>
            </Grid>
          </Box>
        </Box>
      </Container>

      {/* Packages/Pricing Section */}
      <Container maxWidth="lg" sx={{ py: 8 }}>
        <Typography variant="overline" align="center" display="block" gutterBottom color="primary">
          PRICING
        </Typography>
        <Typography variant="h4" component="h2" align="center" gutterBottom>
          Explore for free and unlock our additional features later on.
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2, mb: 4 }}>
          <ToggleButtonGroup
            value={cycle}
            exclusive
            onChange={(_, v) => v && setCycle(v)}
            sx={{ bgcolor: 'grey.100', borderRadius: 9999, p: 0.5 }}
          >
            <ToggleButton value="monthly" sx={{ px: 3, border: 0, borderRadius: 9999 }}>Monthly</ToggleButton>
            <ToggleButton value="yearly" sx={{ px: 3, border: 0, borderRadius: 9999 }}>Yearly</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        <Grid container spacing={3}>
          {/* Individual */}
          <Grid item xs={12} md={4}>
            <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Basic
                </Typography>
                <Typography variant="h5" gutterBottom>
                  Individual
                </Typography>
                <Typography variant="h3" sx={{ fontWeight: 800 }}>
                  ${prices.INDIVIDUAL} {cycle === 'monthly' ? <Typography component="span" variant="subtitle2">/mo</Typography> : <Typography component="span" variant="subtitle2">/yr</Typography>}
                </Typography>
                <List dense sx={{ mt: 2 }}>
                  {[ 'Up to 10 properties', 'Admin dashboard', 'Agent & property accounts', 'No commission on rental income' ].map((f) => (
                    <ListItem key={f} sx={{ py: 0.5 }}>
                      <ListItemIcon sx={{ minWidth: 28 }}>
                        <CheckCircleOutlineIcon color="primary" fontSize="small" />
                      </ListItemIcon>
                      <ListItemText primary={f} primaryTypographyProps={{ variant: 'body2' }} />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
              <CardActions sx={{ px: 3, pb: 3 }}>
                <Button component={RouterLink} to="/signup?plan=INDIVIDUAL" variant="outlined" color="primary" fullWidth>
                  Upgrade
                </Button>
              </CardActions>
            </Card>
          </Grid>

          {/* SME - highlighted */}
          <Grid item xs={12} md={4}>
            <Card sx={{ borderRadius: 3, bgcolor: 'primary.main', color: 'primary.contrastText' }}>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="h5">SME</Typography>
                  <Chip size="small" label="Best Deal" color="secondary" sx={{ fontWeight: 700 }} />
                </Box>
                <Typography variant="h3" sx={{ fontWeight: 900 }}>
                  ${prices.SME} <Typography component="span" variant="subtitle2">{cycle === 'monthly' ? 'per month' : 'per year'}</Typography>
                </Typography>
                <List dense sx={{ mt: 2, color: 'primary.contrastText' }}>
                  {[ 'Up to 25 properties', 'All core features', 'Agent & property accounts', 'Commission enabled', '10GB of storage' ].map((f) => (
                    <ListItem key={f} sx={{ py: 0.5 }}>
                      <ListItemIcon sx={{ minWidth: 28, color: 'primary.contrastText' }}>
                        <CheckCircleOutlineIcon fontSize="small" />
                      </ListItemIcon>
                      <ListItemText primary={f} primaryTypographyProps={{ variant: 'body2' }} />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
              <CardActions sx={{ px: 3, pb: 3 }}>
                <Button component={RouterLink} to="/signup?plan=SME" variant="contained" color="secondary" fullWidth>
                  Upgrade
                </Button>
              </CardActions>
            </Card>
          </Grid>

          {/* Enterprise */}
          <Grid item xs={12} md={4}>
            <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Advanced
                </Typography>
                <Typography variant="h5" gutterBottom>
                  Enterprise
                </Typography>
                <Typography variant="h3" sx={{ fontWeight: 800 }}>
                  ${prices.ENTERPRISE} {cycle === 'monthly' ? <Typography component="span" variant="subtitle2">/mo</Typography> : <Typography component="span" variant="subtitle2">/yr</Typography>}
                </Typography>
                <List dense sx={{ mt: 2 }}>
                  {[ 'Unlimited properties', 'All features unlocked', 'Agent & property accounts', 'Commission enabled', 'Priority support' ].map((f) => (
                    <ListItem key={f} sx={{ py: 0.5 }}>
                      <ListItemIcon sx={{ minWidth: 28 }}>
                        <CheckCircleOutlineIcon color="primary" fontSize="small" />
                      </ListItemIcon>
                      <ListItemText primary={f} primaryTypographyProps={{ variant: 'body2' }} />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
              <CardActions sx={{ px: 3, pb: 3 }}>
                <Button component={RouterLink} to="/signup?plan=ENTERPRISE" variant="contained" fullWidth>
                  Upgrade
                </Button>
              </CardActions>
            </Card>
          </Grid>
        </Grid>
      </Container>

      {/* CTA Section */}
      <Box sx={{ bgcolor: 'grey.100', py: 8 }}>
        <Container maxWidth="md">
          <Typography variant="h3" component="h2" align="center" gutterBottom>
            Ready to Get Started?
          </Typography>
          <Typography variant="h6" align="center" paragraph>
            Join thousands of businesses already using Xhihangule
          </Typography>
          <Box sx={{ mt: 4, textAlign: 'center' }}>
            <Button
              component={RouterLink}
              to="/admin-signup"
              variant="contained"
              color="primary"
              size="large"
              sx={{ mr: 2 }}
            >
              Sign Up Now
            </Button>
            <Button
              component={RouterLink}
              to="/login"
              variant="outlined"
              color="primary"
              size="large"
            >
              Login
            </Button>
          </Box>
        </Container>
      </Box>

      {/* Footer */}
      <Box component="footer" sx={{ bgcolor: 'background.paper', py: 6 }}>
        <Container maxWidth="lg">
          <Typography variant="body2" color="text.secondary" align="center">
            © {new Date().getFullYear()} Xhihangule. All rights reserved.
          </Typography>
        </Container>
      </Box>
    </Box>
  );
};

export default LandingPage; 