import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  LinearProgress,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  Business as BusinessIcon,
  People as PeopleIcon,
  Description as DescriptionIcon,
  Payment as PaymentIcon,
} from '@mui/icons-material';
import { AgentSidebar } from '../components/Layout/AgentSidebar';
import { Header } from '../components/Layout/Header';
import { Properties } from './Properties/Properties';
import { Tenants } from './Tenants/Tenants';
import AgentLeasesPage from './agent/AgentLeasesPage';
import PaymentsPageWrapper from '../components/payments/PaymentsPageWrapper';
import api from '../api/axios';
import { useAuth } from '../contexts/AuthContext';
import { Files } from './Files/Files';
import { Maintenance } from './Maintenance/Maintenance';
import { Communications } from './Communications/Communications';
import { Settings } from './Settings/Settings';
import { AgentSettings } from './Settings/AgentSettings';
import MaintenancePageWrapper from '../components/maintenance/MaintenancePageWrapper';

const StatCard = ({ title, value, icon, color, loading }: { title: string; value: string; icon: React.ReactNode; color: string; loading?: boolean }) => (
  <Card>
    <CardContent>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Box
          sx={{
            backgroundColor: `${color}15`,
            borderRadius: 2,
            p: 1,
            mr: 2,
            color: color,
          }}
        >
          {icon}
        </Box>
        <Typography variant="h6" color="text.secondary">
          {title}
        </Typography>
      </Box>
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <Typography variant="h4" sx={{ mb: 1, fontWeight: 600 }}>
          {value}
        </Typography>
      )}
      <LinearProgress
        variant="determinate"
        value={70}
        sx={{
          height: 6,
          borderRadius: 3,
          backgroundColor: `${color}15`,
          '& .MuiLinearProgress-bar': {
            backgroundColor: color,
          },
        }}
      />
    </CardContent>
  </Card>
);

const AgentDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(0);
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState({
    totalProperties: 0,
    activeTenants: 0,
    activeLeases: 0,
    monthlyCommission: 0,
  });

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch properties
        const [propertiesResponse, tenantsResponse, leasesResponse, commissionResponse] = await Promise.all([
          api.get('/agents/properties'),
          api.get('/agents/tenants'),
          api.get('/agents/leases'),
          api.get('/agents/commission')
        ]);

        const properties = propertiesResponse.data;
        const tenants = tenantsResponse.data;
        const leases = leasesResponse.data;
        const commission = commissionResponse.data;

        setDashboardData({
          totalProperties: properties.length,
          activeTenants: tenants.filter((t: any) => t.status === 'active').length,
          activeLeases: leases.filter((l: any) => l.status === 'active').length,
          monthlyCommission: commission.monthlyCommission || 0,
        });
      } catch (err: any) {
        console.error('Error fetching dashboard data:', err);
        setError(err.response?.data?.message || 'Failed to fetch dashboard data');
      } finally {
        setLoading(false);
      }
    };

    if (user && user.role === 'agent') {
      fetchDashboardData();
    } else if (user && user.role !== 'agent') {
      setError('Access denied. Agent role required.');
      setLoading(false);
    }
  }, [user]);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AgentSidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <Box sx={{ flexGrow: 1 }}>
        <Header />
        <Box sx={{ p: 3, mt: 8 }}>
          <Routes>
            <Route index element={
              <>
                <Typography variant="h4" sx={{ mb: 4, fontWeight: 600 }}>
                  Agent Dashboard
                </Typography>
                {error && (
                  <Alert severity="error" sx={{ mb: 3 }}>
                    {error}
                  </Alert>
                )}
                <Grid container spacing={3}>
                  <Grid item xs={12} md={6} lg={3}>
                    <StatCard
                      title="My Properties"
                      value={dashboardData.totalProperties.toString()}
                      icon={<BusinessIcon />}
                      color="#5E72E4"
                      loading={loading}
                    />
                  </Grid>
                  <Grid item xs={12} md={6} lg={3}>
                    <StatCard
                      title="Active Tenants"
                      value={dashboardData.activeTenants.toString()}
                      icon={<PeopleIcon />}
                      color="#11CDEF"
                      loading={loading}
                    />
                  </Grid>
                  <Grid item xs={12} md={6} lg={3}>
                    <StatCard
                      title="Active Leases"
                      value={dashboardData.activeLeases.toString()}
                      icon={<DescriptionIcon />}
                      color="#2DCE89"
                      loading={loading}
                    />
                  </Grid>
                  <Grid item xs={12} md={6} lg={3}>
                    <StatCard
                      title="Monthly Commission"
                      value={`$${dashboardData.monthlyCommission.toLocaleString()}`}
                      icon={<PaymentIcon />}
                      color="#FB6340"
                      loading={loading}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <Card>
                      <CardContent>
                        <Typography variant="h6" sx={{ mb: 2 }}>
                          Recent Activity
                        </Typography>
                        {loading ? (
                          <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
                            <CircularProgress />
                          </Box>
                        ) : (
                          <Typography color="text.secondary">
                            No recent activity to display
                          </Typography>
                        )}
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>
              </>
            } />
            <Route path="properties" element={<Properties />} />
            <Route path="tenants" element={<Tenants />} />
            <Route path="leases" element={<AgentLeasesPage />} />
            <Route path="payments" element={<PaymentsPageWrapper userRole="agent" />} />
            <Route path="files" element={<Files />} />
            <Route path="maintenance" element={<MaintenancePageWrapper userRole="agent" />} />
            <Route path="communications" element={<Communications />} />
            <Route path="tasks" element={
              <Box>
                <Typography variant="h4" sx={{ mb: 4, fontWeight: 600 }}>
                  Tasks
                </Typography>
                <Card>
                  <CardContent>
                    <Typography variant="h6" sx={{ mb: 2 }}>
                      My Tasks
                    </Typography>
                    <Typography color="text.secondary">
                      Task management functionality coming soon...
                    </Typography>
                  </CardContent>
                </Card>
              </Box>
            } />
            <Route path="schedule" element={
              <Box>
                <Typography variant="h4" sx={{ mb: 4, fontWeight: 600 }}>
                  Schedule
                </Typography>
                <Card>
                  <CardContent>
                    <Typography variant="h6" sx={{ mb: 2 }}>
                      My Schedule
                    </Typography>
                    <Typography color="text.secondary">
                      Schedule management functionality coming soon...
                    </Typography>
                  </CardContent>
                </Card>
              </Box>
            } />
            <Route path="settings" element={<AgentSettings />} />
          </Routes>
        </Box>
      </Box>
    </Box>
  );
};

export default AgentDashboard;
