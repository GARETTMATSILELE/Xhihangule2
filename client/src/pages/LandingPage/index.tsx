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

  const pricingPlans = [
    {
      id: 'free',
      name: 'Free Trial',
      eyebrow: 'Start safely',
      price: 'FREE',
      suffix: '14 days',
      badge: 'No card required',
      badgeColor: 'success' as const,
      borderColor: 'success.main',
      cta: 'Start Free Trial',
      to: '/admin-signup',
      bestFor: 'Testing Mantis with real workflows',
      range: 'Up to 10 properties',
      users: 'Single admin',
      billing: 'Trial access, cancel anytime',
      features: ['No credit card required', 'Core property workflows', 'Guided workspace setup', 'Upgrade when ready']
    },
    {
      id: 'individual',
      name: 'Individual',
      eyebrow: 'Solo landlords',
      price: `$${prices.INDIVIDUAL}`,
      suffix: cycle === 'monthly' ? '/mo' : '/yr',
      badge: 'Best for landlords',
      badgeColor: 'primary' as const,
      borderColor: 'divider',
      cta: 'Choose Individual',
      to: '/signup?plan=INDIVIDUAL',
      bestFor: 'Solo landlords managing rentals',
      range: '1-10 properties',
      users: 'Single admin',
      billing: cycle === 'monthly' ? 'Monthly billing' : 'Annual billing',
      features: ['Simple dashboard', 'Rent and occupancy tracking', 'Lease expirations', 'Maintenance requests']
    },
    {
      id: 'sme',
      name: 'SME',
      eyebrow: 'Growing agencies',
      price: `$${prices.SME}`,
      suffix: cycle === 'monthly' ? '/mo' : '/yr',
      badge: 'Recommended',
      badgeColor: 'secondary' as const,
      borderColor: 'primary.main',
      highlighted: true,
      cta: 'Choose SME',
      to: '/signup?plan=SME',
      bestFor: 'Agencies with teams and workflows',
      range: '10-120 properties',
      users: 'Multi-user teams',
      billing: cycle === 'monthly' ? 'Monthly billing' : 'Annual billing',
      features: ['Team activity', 'Agent performance', 'Commission tools', 'Approval queues']
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      eyebrow: 'Large portfolios',
      price: `$${prices.ENTERPRISE}`,
      suffix: cycle === 'monthly' ? '/mo' : '/yr',
      badge: 'Custom onboarding',
      badgeColor: 'default' as const,
      borderColor: 'divider',
      cta: 'Choose Enterprise',
      to: '/signup?plan=ENTERPRISE',
      bestFor: 'Large portfolios and operations teams',
      range: 'Unlimited units',
      users: 'Advanced permissions',
      billing: cycle === 'monthly' ? 'Monthly billing' : 'Annual billing',
      features: ['Portfolio analytics', 'Audit alerts', 'Priority support', 'Operational KPIs']
    }
  ];

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
          {pricingPlans.map((plan) => (
            <Grid item xs={12} md={3} key={plan.id} id={`pricing-${plan.id}`}>
              <Card
                elevation={plan.highlighted ? 6 : 0}
                sx={{
                  height: '100%',
                  border: '2px solid',
                  borderColor: plan.borderColor,
                  borderRadius: 3,
                  bgcolor: plan.highlighted ? 'primary.main' : 'background.paper',
                  color: plan.highlighted ? 'primary.contrastText' : 'text.primary',
                  position: 'relative'
                }}
              >
                <CardContent sx={{ p: 3 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1 }}>
                    <Typography variant="subtitle2" sx={{ opacity: plan.highlighted ? 0.9 : 0.7 }}>
                      {plan.eyebrow}
                    </Typography>
                    <Chip size="small" label={plan.badge} color={plan.badgeColor} sx={{ fontWeight: 700 }} />
                  </Box>
                  <Typography variant="h5" gutterBottom>{plan.name}</Typography>
                  <Typography variant="h3" sx={{ fontWeight: 900 }}>
                    {plan.price} <Typography component="span" variant="subtitle2">{plan.suffix}</Typography>
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 1, opacity: plan.highlighted ? 0.9 : 0.75 }}>
                    Best for: {plan.bestFor}
                  </Typography>
                  <Grid container spacing={1} sx={{ my: 2 }}>
                    {[plan.range, plan.users, plan.billing].map((item) => (
                      <Grid item xs={12} key={item}>
                        <Chip size="small" variant={plan.highlighted ? 'filled' : 'outlined'} label={item} sx={{ width: '100%' }} />
                      </Grid>
                    ))}
                  </Grid>
                  <List dense sx={{ color: plan.highlighted ? 'primary.contrastText' : 'text.primary' }}>
                    {plan.features.map((feature) => (
                      <ListItem key={feature} sx={{ py: 0.5, px: 0 }}>
                        <ListItemIcon sx={{ minWidth: 28, color: plan.highlighted ? 'primary.contrastText' : 'primary.main' }}>
                          <CheckCircleOutlineIcon fontSize="small" />
                        </ListItemIcon>
                        <ListItemText primary={feature} primaryTypographyProps={{ variant: 'body2' }} />
                      </ListItem>
                    ))}
                  </List>
                </CardContent>
                <CardActions sx={{ px: 3, pb: 3 }}>
                  <Button
                    component={RouterLink}
                    to={plan.to}
                    variant={plan.highlighted ? 'contained' : 'outlined'}
                    color={plan.highlighted ? 'secondary' : 'primary'}
                    fullWidth
                  >
                    {plan.cta}
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          ))}
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