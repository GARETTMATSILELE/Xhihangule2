import React, { useState, useEffect } from 'react';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  LinearProgress,
  Chip,
  IconButton,
  Collapse
} from '@mui/material';
import { Close as CloseIcon, Upgrade as UpgradeIcon } from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';

interface TrialStatus {
  isTrial: boolean;
  isExpired: boolean;
  daysRemaining: number;
  subscription: any;
}

const TrialNotification: React.FC = () => {
  const { user, company } = useAuth();
  const [trialStatus, setTrialStatus] = useState<TrialStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

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

  const handleDismiss = () => {
    setDismissed(true);
    // Store dismissal in localStorage to remember user's choice
    localStorage.setItem('trial-notification-dismissed', 'true');
  };

  // Don't show if loading, dismissed, or no trial status
  if (loading || dismissed || !trialStatus) {
    return null;
  }

  // Don't show if not in trial
  if (!trialStatus.isTrial) {
    return null;
  }

  // Check if user previously dismissed
  useEffect(() => {
    const wasDismissed = localStorage.getItem('trial-notification-dismissed');
    if (wasDismissed) {
      setDismissed(true);
    }
  }, []);

  const getAlertSeverity = () => {
    if (trialStatus.isExpired) return 'error';
    if (trialStatus.daysRemaining <= 3) return 'warning';
    return 'info';
  };

  const getAlertTitle = () => {
    if (trialStatus.isExpired) return 'Trial Expired';
    if (trialStatus.daysRemaining <= 3) return 'Trial Ending Soon';
    return 'Free Trial Active';
  };

  const getAlertMessage = () => {
    if (trialStatus.isExpired) {
      return 'Your free trial has expired. Upgrade now to continue using all features.';
    }
    if (trialStatus.daysRemaining <= 3) {
      return `Your free trial ends in ${trialStatus.daysRemaining} day${trialStatus.daysRemaining !== 1 ? 's' : ''}. Upgrade now to avoid any interruption.`;
    }
    return `You have ${trialStatus.daysRemaining} days left in your free trial.`;
  };

  const progressValue = trialStatus.isExpired ? 100 : ((14 - trialStatus.daysRemaining) / 14) * 100;

  return (
    <Box sx={{ mb: 2 }}>
      <Alert 
        severity={getAlertSeverity()} 
        sx={{ 
          borderRadius: 2,
          '& .MuiAlert-message': { width: '100%' }
        }}
        action={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Button
              component={RouterLink}
              to="/billing/setup"
              variant="contained"
              size="small"
              startIcon={<UpgradeIcon />}
              sx={{ 
                backgroundColor: trialStatus.isExpired ? 'error.main' : 'primary.main',
                '&:hover': {
                  backgroundColor: trialStatus.isExpired ? 'error.dark' : 'primary.dark'
                }
              }}
            >
              {trialStatus.isExpired ? 'Upgrade Now' : 'Upgrade'}
            </Button>
            <IconButton
              size="small"
              onClick={handleDismiss}
              sx={{ color: 'inherit' }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        }
      >
        <AlertTitle>{getAlertTitle()}</AlertTitle>
        <Box sx={{ mb: 1 }}>
          {getAlertMessage()}
        </Box>
        
        {!trialStatus.isExpired && (
          <Box sx={{ mt: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Trial Progress:
              </Typography>
              <Chip 
                label={`${trialStatus.daysRemaining} days left`} 
                size="small" 
                color={trialStatus.daysRemaining <= 3 ? 'warning' : 'primary'}
              />
            </Box>
            <LinearProgress 
              variant="determinate" 
              value={progressValue} 
              sx={{ 
                height: 6, 
                borderRadius: 3,
                backgroundColor: 'rgba(0,0,0,0.1)',
                '& .MuiLinearProgress-bar': {
                  backgroundColor: trialStatus.daysRemaining <= 3 ? 'warning.main' : 'primary.main'
                }
              }} 
            />
          </Box>
        )}
      </Alert>
    </Box>
  );
};

export default TrialNotification;
