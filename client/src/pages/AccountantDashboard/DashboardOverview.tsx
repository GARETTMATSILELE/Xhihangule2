import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  CircularProgress,
  Alert,
  Button
} from '@mui/material';
import {
  Assignment as TaskIcon,
  Payment as PaymentIcon,
  Warning as UrgentIcon,
  CheckCircle as CompletedIcon,
  TrendingUp as TrendingUpIcon,
  Receipt as ReceiptIcon
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import paymentRequestService, { PaymentRequest } from '../../services/paymentRequestService';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';

const DashboardOverview: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.companyId) {
      loadPaymentRequests();
    }
  }, [user?.companyId]);

  const loadPaymentRequests = async () => {
    try {
      setLoading(true);
      const response = await paymentRequestService.getPaymentRequests();
      setPaymentRequests(response.data);
    } catch (err: any) {
      console.error('Error loading payment requests:', err);
      setError('Failed to load payment requests');
    } finally {
      setLoading(false);
    }
  };

  const pendingRequests = paymentRequests.filter(req => req.status === 'pending');
  const urgentRequests = pendingRequests.filter(req => 
    new Date(req.dueDate) <= new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) // Due within 2 days
  );

  const stats = [
    {
      title: 'Pending Payment Requests',
      value: pendingRequests.length,
      icon: <PaymentIcon />,
      color: 'warning.main',
      path: '/accountant-dashboard/tasks'
    },
    {
      title: 'Urgent Tasks',
      value: urgentRequests.length,
      icon: <UrgentIcon />,
      color: 'error.main',
      path: '/accountant-dashboard/tasks'
    },
    {
      title: 'Completed This Month',
      value: paymentRequests.filter(req => 
        req.status === 'paid' && 
        new Date(req.processedDate || '').getMonth() === new Date().getMonth()
      ).length,
      icon: <CompletedIcon />,
      color: 'success.main',
      path: '/accountant-dashboard/payments'
    },
    {
      title: 'Total Processed',
      value: paymentRequests.filter(req => req.status === 'paid').length,
      icon: <TrendingUpIcon />,
      color: 'info.main',
      path: '/accountant-dashboard/payments'
    }
  ];

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" p={4}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%' }}>
      <Typography variant="h4" component="h1" sx={{ mb: 3, fontWeight: 600 }}>
        Welcome back, {user?.firstName}!
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {stats.map((stat, index) => (
          <Grid item xs={12} sm={6} md={3} key={index}>
            <Card 
              elevation={2} 
              sx={{ 
                cursor: 'pointer',
                '&:hover': { elevation: 4 }
              }}
              onClick={() => navigate(stat.path)}
            >
              <CardContent>
                <Box display="flex" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography variant="h4" component="div" sx={{ color: stat.color, fontWeight: 'bold' }}>
                      {stat.value}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {stat.title}
                    </Typography>
                  </Box>
                  <Box sx={{ color: stat.color }}>
                    {stat.icon}
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Recent Tasks */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper elevation={2} sx={{ p: 3 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6" component="h2">
                Recent Payment Requests
              </Typography>
              <Button 
                size="small" 
                onClick={() => navigate('/accountant-dashboard/tasks')}
              >
                View All
              </Button>
            </Box>
            
            {pendingRequests.length === 0 ? (
              <Typography variant="body2" color="text.secondary" textAlign="center" py={2}>
                No pending payment requests
              </Typography>
            ) : (
              <List>
                {pendingRequests.slice(0, 5).map((request) => (
                  <ListItem key={request._id} divider>
                    <ListItemIcon>
                      <PaymentIcon color="warning" />
                    </ListItemIcon>
                    <ListItemText
                      primary={`${request.payTo.name} ${request.payTo.surname}`}
                      secondary={
                        <Box>
                          <Typography variant="body2">
                            {request.reason}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Due: {format(new Date(request.dueDate), 'MMM dd, yyyy')} • {request.currency} {request.amount.toLocaleString()}
                          </Typography>
                        </Box>
                      }
                    />
                    <Chip
                      label={new Date(request.dueDate) <= new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) ? 'Urgent' : 'Pending'}
                      color={new Date(request.dueDate) <= new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) ? 'error' : 'warning'}
                      size="small"
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper elevation={2} sx={{ p: 3 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6" component="h2">
                Quick Actions
              </Typography>
            </Box>
            
            <List>
              <ListItem 
                button 
                onClick={() => navigate('/accountant-dashboard/tasks')}
                sx={{ borderRadius: 1, mb: 1 }}
              >
                <ListItemIcon>
                  <TaskIcon color="primary" />
                </ListItemIcon>
                <ListItemText
                  primary="Review Payment Requests"
                  secondary="Process pending payment requests"
                />
              </ListItem>
              
              <ListItem 
                button 
                onClick={() => navigate('/accountant-dashboard/payments')}
                sx={{ borderRadius: 1, mb: 1 }}
              >
                <ListItemIcon>
                  <ReceiptIcon color="primary" />
                </ListItemIcon>
                <ListItemText
                  primary="View All Payments"
                  secondary="Check payment history and records"
                />
              </ListItem>
              
              <ListItem 
                button 
                onClick={() => navigate('/accountant-dashboard/reports')}
                sx={{ borderRadius: 1, mb: 1 }}
              >
                <ListItemIcon>
                  <TrendingUpIcon color="primary" />
                </ListItemIcon>
                <ListItemText
                  primary="Generate Reports"
                  secondary="Create financial reports and analytics"
                />
              </ListItem>
            </List>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default DashboardOverview; 