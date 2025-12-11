import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  CardActions,
  Button,
  Grid,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip,
  Alert,
  AlertTitle,
  ToggleButtonGroup,
  ToggleButton,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../api';

interface TrialStatus {
  isTrial: boolean;
  isExpired: boolean;
  daysRemaining: number;
  subscription: any;
}

interface PlanConfig {
  propertyLimit: number | null;
  featureFlags: {
    commissionEnabled: boolean;
    agentAccounts: boolean;
    propertyAccounts: boolean;
  };
  pricingUSD: {
    monthly: number;
    yearly: number;
  };
}

const BillingUpgradePage: React.FC = () => {
  const { user, company } = useAuth();
  const [trialStatus, setTrialStatus] = useState<TrialStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [selectedPlan, setSelectedPlan] = useState<'INDIVIDUAL' | 'SME' | 'ENTERPRISE'>('SME');
  const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false);

  const plans: Record<string, PlanConfig> = {
    INDIVIDUAL: {
      propertyLimit: 10,
      featureFlags: {
        commissionEnabled: false,
        agentAccounts: true,
        propertyAccounts: true
      },
      pricingUSD: { monthly: 10, yearly: 120 }
    },
    SME: {
      propertyLimit: 25,
      featureFlags: {
        commissionEnabled: true,
        agentAccounts: true,
        propertyAccounts: true
      },
      pricingUSD: { monthly: 300, yearly: 3600 }
    },
    ENTERPRISE: {
      propertyLimit: null,
      featureFlags: {
        commissionEnabled: true,
        agentAccounts: true,
        propertyAccounts: true
      },
      pricingUSD: { monthly: 600, yearly: 7200 }
    }
  };

  useEffect(() => {
    const fetchTrialStatus = async () => {
      if (!user?.companyId) {
        setLoading(false);
        return;
      }

      try {
        const response = await api.get('/subscription/trial-status');
        setTrialStatus(response.data.data);
      } catch (error) {
        console.error('Error fetching trial status:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTrialStatus();
  }, [user?.companyId]);

  const handleUpgrade = async () => {
    setUpgrading(true);
    try {
      await api.post('/subscription/convert-trial', {
        plan: selectedPlan,
        cycle
      });
      
      // Show success dialog
      setUpgradeDialogOpen(true);
      
      // Refresh trial status
      const response = await api.get('/subscription/trial-status');
      setTrialStatus(response.data.data);
      
    } catch (error) {
      console.error('Error upgrading subscription:', error);
      alert('Failed to upgrade subscription. Please try again.');
    } finally {
      setUpgrading(false);
    }
  };

  const getPlanFeatures = (plan: string) => {
    const config = plans[plan];
    const features = [
      `Up to ${config.propertyLimit || 'unlimited'} properties`,
      'Admin dashboard',
      'Agent & property accounts'
    ];
    
    if (config.featureFlags.commissionEnabled) {
      features.push('Commission enabled');
    }
    
    if (plan === 'SME') {
      features.push('10GB of storage');
    } else if (plan === 'ENTERPRISE') {
      features.push('Priority support');
    }
    
    return features;
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4, textAlign: 'center' }}>
        <CircularProgress />
        <Typography variant="h6" sx={{ mt: 2 }}>Loading...</Typography>
      </Container>
    );
  }

  if (!trialStatus?.isTrial) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="info">
          <AlertTitle>No Active Trial</AlertTitle>
          You don't have an active trial subscription. Please contact support if you believe this is an error.
        </Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Upgrade Your Subscription
      </Typography>
      
      {trialStatus.isExpired ? (
        <Alert severity="error" sx={{ mb: 3 }}>
          <AlertTitle>Trial Expired</AlertTitle>
          Your free trial has expired. Please upgrade to continue using all features.
        </Alert>
      ) : (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <AlertTitle>Trial Ending Soon</AlertTitle>
          You have {trialStatus.daysRemaining} day{trialStatus.daysRemaining !== 1 ? 's' : ''} left in your free trial.
        </Alert>
      )}

      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 4 }}>
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
        {Object.entries(plans).map(([planKey, config]) => (
          <Grid item xs={12} md={4} key={planKey}>
            <Card 
              elevation={selectedPlan === planKey ? 4 : 1}
              sx={{ 
                border: selectedPlan === planKey ? '2px solid' : '1px solid',
                borderColor: selectedPlan === planKey ? 'primary.main' : 'divider',
                borderRadius: 3,
                cursor: 'pointer',
                transition: 'all 0.2s ease-in-out',
                '&:hover': {
                  elevation: 2,
                  transform: 'translateY(-2px)'
                }
              }}
              onClick={() => setSelectedPlan(planKey as any)}
            >
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h5" gutterBottom>
                  {planKey}
                </Typography>
                <Typography variant="h3" sx={{ fontWeight: 800 }}>
                  ${cycle === 'monthly' ? config.pricingUSD.monthly : config.pricingUSD.yearly}
                  <Typography component="span" variant="subtitle2">
                    {cycle === 'monthly' ? '/mo' : '/yr'}
                  </Typography>
                </Typography>
                <List dense sx={{ mt: 2 }}>
                  {getPlanFeatures(planKey).map((feature) => (
                    <ListItem key={feature} sx={{ py: 0.5 }}>
                      <ListItemIcon sx={{ minWidth: 28 }}>
                        <CheckCircleOutlineIcon color="primary" fontSize="small" />
                      </ListItemIcon>
                      <ListItemText primary={feature} primaryTypographyProps={{ variant: 'body2' }} />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
              <CardActions sx={{ px: 3, pb: 3 }}>
                <Button 
                  variant={selectedPlan === planKey ? "contained" : "outlined"}
                  color="primary" 
                  fullWidth
                  onClick={handleUpgrade}
                  disabled={upgrading}
                >
                  {upgrading ? <CircularProgress size={20} /> : 'Upgrade Now'}
                </Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Dialog open={upgradeDialogOpen} onClose={() => setUpgradeDialogOpen(false)}>
        <DialogTitle>Upgrade Successful!</DialogTitle>
        <DialogContent>
          <Typography>
            Your subscription has been successfully upgraded to {selectedPlan} plan. 
            You now have full access to all features.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUpgradeDialogOpen(false)} variant="contained">
            Continue
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default BillingUpgradePage;
