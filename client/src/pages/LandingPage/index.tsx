import React, { useMemo, useState } from 'react';
import { alpha } from '@mui/material/styles';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  Container,
  Menu,
  MenuItem,
  Typography,
  Grid,
  Card,
  CardContent,
  CardActions,
  Chip,
  Tabs,
  Tab,
  Link,
  IconButton,
  ToggleButtonGroup,
  ToggleButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import FacebookIcon from '@mui/icons-material/Facebook';
import TwitterIcon from '@mui/icons-material/Twitter';
import InstagramIcon from '@mui/icons-material/Instagram';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';

const LandingPage: React.FC = () => {
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');

  type FeatureKey =
    | 'ACCOUNTING'
    | 'PAYMENTS'
    | 'LEASING'
    | 'MAINTENANCE'
    | 'INTEGRATIONS'
    | 'SALES'
    | 'REPORTING'
    | 'DASHBOARDS';

  const [active, setActive] = useState<FeatureKey>('ACCOUNTING');
  const [featuresAnchorEl, setFeaturesAnchorEl] = useState<null | HTMLElement>(null);
  const [pricingAnchorEl, setPricingAnchorEl] = useState<null | HTMLElement>(null);

  const scrollToId = (id: string) => {
    if (typeof window === 'undefined') return;
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const openFeaturesMenu = (e: React.MouseEvent<HTMLElement>) => setFeaturesAnchorEl(e.currentTarget);
  const closeFeaturesMenu = () => setFeaturesAnchorEl(null);
  const openPricingMenu = (e: React.MouseEvent<HTMLElement>) => setPricingAnchorEl(e.currentTarget);
  const closePricingMenu = () => setPricingAnchorEl(null);

  const handleSelectFeature = (key: FeatureKey) => {
    setActive(key);
    closeFeaturesMenu();
    // Scroll to features section
    setTimeout(() => scrollToId('features-section'), 0);
  };

  const handleSelectPricing = (id: 'free' | 'individual' | 'sme' | 'enterprise') => {
    closePricingMenu();
    scrollToId(`pricing-${id}`);
  };

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
    const monthly = { INDIVIDUAL: 250, SME: 600, ENTERPRISE: 1200 } as const;
    if (cycle === 'monthly') return monthly;
    // Yearly totals (12 months)
    return {
      INDIVIDUAL: monthly.INDIVIDUAL * 12,
      SME: monthly.SME * 12,
      ENTERPRISE: monthly.ENTERPRISE * 12
    } as const;
  }, [cycle]);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Hero Section */}
      <Box
        sx={{
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          pt: { xs: 20, md: 22 },
          pb: 8,
          position: 'relative',
        }}
      >
        {/* Top-center Nav (text-only) */}
        <Box
          sx={{
            position: 'absolute',
            top: { xs: 16, md: 16 },
            left: '50%',
            transform: 'translateX(-50%)',
            display: { xs: 'none', md: 'flex' },
            alignItems: 'center',
            gap: 2,
          }}
        >
          <Button
            variant="text"
            color="inherit"
            onClick={openFeaturesMenu}
            aria-haspopup="true"
            aria-controls="features-menu"
            sx={{ textTransform: 'none', fontWeight: 600, fontStyle: 'normal' }}
          >
            Features
          </Button>
          <Menu
            id="features-menu"
            anchorEl={featuresAnchorEl}
            open={Boolean(featuresAnchorEl)}
            onClose={closeFeaturesMenu}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            transformOrigin={{ vertical: 'top', horizontal: 'center' }}
            PaperProps={{
              sx: {
                backgroundColor: 'transparent',
                boxShadow: 'none',
                color: 'primary.contrastText',
              }
            }}
            MenuListProps={{
              sx: { p: 0 }
            }}
          >
            {featureTabs.map((t) => (
              <MenuItem
                key={t.key}
                onClick={() => handleSelectFeature(t.key)}
                sx={{
                  color: 'primary.contrastText',
                  backgroundColor: 'transparent',
                  fontStyle: 'normal',
                  '&:hover': { backgroundColor: 'rgba(255,255,255,0.12)' }
                }}
              >
                {t.label}
              </MenuItem>
            ))}
          </Menu>

          <Button
            variant="text"
            color="inherit"
            onClick={openPricingMenu}
            aria-haspopup="true"
            aria-controls="pricing-menu"
            sx={{ textTransform: 'none', fontWeight: 600, fontStyle: 'normal' }}
          >
            Pricing
          </Button>
          <Menu
            id="pricing-menu"
            anchorEl={pricingAnchorEl}
            open={Boolean(pricingAnchorEl)}
            onClose={closePricingMenu}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            transformOrigin={{ vertical: 'top', horizontal: 'center' }}
            PaperProps={{
              sx: {
                backgroundColor: 'transparent',
                boxShadow: 'none',
                color: 'primary.contrastText',
              }
            }}
            MenuListProps={{
              sx: { p: 0 }
            }}
          >
            <MenuItem
              onClick={() => handleSelectPricing('free')}
              sx={{ color: 'primary.contrastText', backgroundColor: 'transparent', fontStyle: 'normal', '&:hover': { backgroundColor: 'rgba(255,255,255,0.12)' } }}
            >
              Free Trial
            </MenuItem>
            <MenuItem
              onClick={() => handleSelectPricing('individual')}
              sx={{ color: 'primary.contrastText', backgroundColor: 'transparent', fontStyle: 'normal', '&:hover': { backgroundColor: 'rgba(255,255,255,0.12)' } }}
            >
              Individual
            </MenuItem>
            <MenuItem
              onClick={() => handleSelectPricing('sme')}
              sx={{ color: 'primary.contrastText', backgroundColor: 'transparent', fontStyle: 'normal', '&:hover': { backgroundColor: 'rgba(255,255,255,0.12)' } }}
            >
              SME
            </MenuItem>
            <MenuItem
              onClick={() => handleSelectPricing('enterprise')}
              sx={{ color: 'primary.contrastText', backgroundColor: 'transparent', fontStyle: 'normal', '&:hover': { backgroundColor: 'rgba(255,255,255,0.12)' } }}
            >
              Enterprise
            </MenuItem>
          </Menu>
          <Button
            variant="text"
            color="inherit"
            onClick={() => scrollToId('contact-section')}
            sx={{ textTransform: 'none', fontWeight: 600, fontStyle: 'normal' }}
          >
            Contact Us
          </Button>
        </Box>
        {/* Top-left Logo */}
        <Box
          component={RouterLink}
          to="/"
          sx={{
            position: 'absolute',
            top: { xs: 12, md: 16 },
            left: { xs: 12, md: 16 },
            display: 'inline-flex',
            alignItems: 'center',
            textDecoration: 'none',
          }}
          aria-label="Mantis Africa Home"
        >
          <Box
            component="img"
            src="/mantis logo.png"
            alt="Mantis Africa"
            sx={{
              height: { xs: 112, md: 144 },
              display: 'block',
            }}
          />
        </Box>
        {/* Top-right CTAs */}
        <Box
          sx={{
            position: 'absolute',
            top: { xs: 12, md: 16 },
            right: { xs: 12, md: 16 },
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
          }}
        >
          <Button
            component={RouterLink}
            to="/login"
            variant="outlined"
            color="inherit"
            size="medium"
          >
            Login
          </Button>
          <Button
            component={RouterLink}
            to="/admin-signup"
            variant="contained"
            color="secondary"
            size="medium"
          >
            Start Free Trial
          </Button>
        </Box>
        <Container maxWidth="lg">
          <Grid container spacing={4} alignItems="center">
            <Grid item xs={12} md={6}>
              <Typography variant="h2" component="h1" gutterBottom>
                Welcome to Mantis Africa
              </Typography>
              <Typography variant="h5" paragraph>
                Your all-in-one solution for property management
              </Typography>
              <Typography variant="h6" paragraph sx={{ color: 'common.white', fontWeight: 600 }}>
                🎉 Start your 14-day free trial today - No credit card required!
              </Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <Box
                component="img"
                src="/hero-laptop.png"
                alt="Mantis Africa agent dashboard on a laptop"
                sx={{
                  width: '100%',
                  maxWidth: 460,
                  display: 'block',
                  mx: 'auto',
                  
              
                }}
                loading="lazy"
              />
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* Features Section */}
      <Container id="features-section" maxWidth="lg" sx={{ py: 8 }}>
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
      <Container id="pricing-section" maxWidth="lg" sx={{ py: 8 }}>
        <Typography variant="overline" align="center" display="block" gutterBottom color="primary">
          PRICING
        </Typography>
        <Typography variant="h4" component="h2" align="center" gutterBottom>
          Start with a free trial, upgrade when you're ready.
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
          {/* Free Trial Card */}
          <Grid item xs={12} md={4} id="pricing-free">
            <Card elevation={0} sx={{ border: '2px solid', borderColor: 'success.main', borderRadius: 3, position: 'relative' }}>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="h5">Free Trial</Typography>
                  <Chip size="small" label="14 Days" color="success" sx={{ fontWeight: 700 }} />
                </Box>
                <Typography variant="h3" sx={{ fontWeight: 800, color: 'success.main' }}>
                  FREE
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Full access to all features
                </Typography>
                <List dense sx={{ mt: 2 }}>
                  {[ 'All core features', 'Up to 25 properties', 'Agent & property accounts', 'No credit card required', 'Cancel anytime' ].map((f) => (
                    <ListItem key={f} sx={{ py: 0.5 }}>
                      <ListItemIcon sx={{ minWidth: 28 }}>
                        <CheckCircleOutlineIcon color="success" fontSize="small" />
                      </ListItemIcon>
                      <ListItemText primary={f} primaryTypographyProps={{ variant: 'body2' }} />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
              <CardActions sx={{ px: 3, pb: 3 }}>
                <Button component={RouterLink} to="/admin-signup" variant="contained" color="success" fullWidth>
                  Start Free Trial
                </Button>
              </CardActions>
            </Card>
          </Grid>

          {/* Individual */}
          <Grid item xs={12} md={4} id="pricing-individual">
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
          <Grid item xs={12} md={4} id="pricing-sme">
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
                  {[ 'Up to 120 properties', 'All core features', 'Agent & property accounts', 'Commission enabled', '10GB of storage' ].map((f) => (
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
          <Grid item xs={12} md={4} id="pricing-enterprise">
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
            Join thousands of businesses already using Mantis Africa
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
      <Box id="contact-section" component="footer" sx={{ bgcolor: 'background.paper', py: 6 }}>
        <Container maxWidth="lg">
          <Grid container spacing={4} justifyContent="center">
            <Grid item xs={12} md={4} sx={{ textAlign: 'center' }}>
              <Typography variant="h6" gutterBottom>
                Socials
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                <IconButton aria-label="Facebook" color="primary" component="a" href="#">
                  <FacebookIcon />
                </IconButton>
                <IconButton aria-label="X" color="primary" component="a" href="#">
                  <TwitterIcon />
                </IconButton>
                <IconButton aria-label="Instagram" color="primary" component="a" href="#">
                  <InstagramIcon />
                </IconButton>
                <IconButton
                  aria-label="WhatsApp"
                  color="primary"
                  component="a"
                  href="https://wa.me/263783222010"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <WhatsAppIcon />
                </IconButton>
              </Box>
            </Grid>
            <Grid item xs={12} md={4} sx={{ textAlign: 'center' }}>
              <Typography variant="h6" gutterBottom>
                Contact Us
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Email: garett@kibycom.com
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Phone: +263783222010
              </Typography>
            </Grid>
            <Grid item xs={12} md={4} sx={{ textAlign: 'center' }}>
              <Typography variant="h6" gutterBottom>
                Address
              </Typography>
              <Typography variant="body2" color="text.secondary">
                8 Normandy Road Alexandra Park, Harare, Zimbabwe
              </Typography>
            </Grid>
          </Grid>
          <Box sx={{ mt: 4 }}>
            <Typography variant="body2" color="text.secondary" align="center">
              © {new Date().getFullYear()} Mantis Africa. All rights reserved.
            </Typography>
          </Box>
        </Container>
      </Box>
    </Box>
  );
};

export default LandingPage; 