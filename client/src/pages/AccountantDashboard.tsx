import React, { useState, useEffect } from 'react';
import { 
  Tabs, 
  Tab, 
  Box, 
  Button, 
  Card, 
  CardContent,
  Typography,
  CircularProgress,
  Alert,
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemButton,
  Divider,
  IconButton,
  useTheme,
  useMediaQuery,
  Avatar
} from '@mui/material';
import { 
  Receipt as ReceiptIcon,
  AttachMoney as DollarSignIcon,
  CreditCard as CreditCardIcon,
  Add as FilePlusIcon,
  Dashboard as DashboardIcon,
  People as PeopleIcon,
  Assessment as AssessmentIcon,
  Settings as SettingsIcon,
  Menu as MenuIcon,
  ChevronLeft as ChevronLeftIcon
} from '@mui/icons-material';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { getChartData, initializeChartData } from '../services/chartService';
import { useCompany } from '../contexts/CompanyContext';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';

const DRAWER_WIDTH = 240;

const AccountantDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [chartData, setChartData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { company, loading: companyLoading, error: companyError } = useCompany();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const menuItems = [
    { text: 'Dashboard', icon: <DashboardIcon />, path: '/accountant-dashboard' },
    { text: 'Payments', icon: <ReceiptIcon />, path: '/accountant-dashboard/payments' },
    { text: 'Commissions', icon: <DollarSignIcon />, path: '/accountant-dashboard/commissions' },
    { text: 'Reports', icon: <AssessmentIcon />, path: '/accountant-dashboard/reports' },
    { text: 'Settings', icon: <SettingsIcon />, path: '/accountant-dashboard/settings' }
  ];

  const drawer = (
    <Box sx={{ width: DRAWER_WIDTH }}>
      <Box sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        padding: theme.spacing(1, 2),
        ...theme.mixins.toolbar
      }}>
        <Typography variant="h6" noWrap component="div">
          {company?.name || 'Dashboard'}
        </Typography>
        {isMobile && (
          <IconButton onClick={handleDrawerToggle}>
            <ChevronLeftIcon />
          </IconButton>
        )}
      </Box>
      <Divider />
      
      {company && company.logo && (
        <Box sx={{ px: 2, mb: 2, mt: 2 }}>
          {/* Company Logo */}
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
            <Avatar
              src={`data:image/png;base64,${company.logo}`}
              sx={{ 
                width: 200, 
                height: 100,
                border: '0.1px solid rgba(255, 255, 255, 0.2)'
              }}
              variant="rounded"
            />
          </Box>
        </Box>
      )}
      
      <List>
        {menuItems.map((item) => (
          <ListItem key={item.text} disablePadding>
            <ListItemButton
              onClick={() => {
                navigate(item.path);
                if (isMobile) {
                  setMobileOpen(false);
                }
              }}
            >
              <ListItemIcon>
                {item.icon}
              </ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  );

  useEffect(() => {
    if (!companyLoading && company && location.pathname === '/accountant-dashboard') {
      initializeAndFetchData();
    }
  }, [company, companyLoading, location.pathname]);

  const initializeAndFetchData = async () => {
    if (!company) {
      setError('No company data available');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // First initialize chart data
      console.log('Initializing chart data...');
      try {
        const initResponse = await initializeChartData();
        console.log('Chart initialization response:', initResponse);
        if (!initResponse) {
          throw new Error('No response from chart initialization');
        }
      } catch (initError: any) {
        console.error('Error initializing chart data:', initError);
        // Continue with fetching data even if initialization fails
        // The backend will handle initialization if needed
      }

      // Then fetch the chart data
      console.log('Fetching chart data...');
      const [revenueData, commissionData] = await Promise.all([
        getChartData('revenue'),
        getChartData('commission')
      ]);
      
      console.log('Chart data received:', { revenueData, commissionData });
      
      if (!revenueData || !commissionData) {
        throw new Error('Failed to fetch chart data');
      }

      // Ensure we have valid data arrays
      const paymentData = Array.isArray(revenueData.data) ? revenueData.data : [];
      const commissionDataArray = Array.isArray(commissionData.data) ? commissionData.data : [];

      setChartData({
        payment: paymentData,
        commission: commissionDataArray
      });
    } catch (error: any) {
      console.error('Error in initializeAndFetchData:', error);
      setError(error.response?.data?.message || error.message || 'Failed to fetch dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  const renderMainContent = () => {
    // Only show loading states for the main dashboard
    if (location.pathname === '/accountant-dashboard') {
      if (companyLoading) {
        return (
          <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
            <CircularProgress />
          </Box>
        );
      }

      if (companyError) {
        return (
          <Box p={3}>
            <Alert severity="error">{companyError}</Alert>
          </Box>
        );
      }

      if (!company) {
        return (
          <Box p={3}>
            <Alert severity="warning">No company data available. Please ensure you are associated with a company.</Alert>
          </Box>
        );
      }

      if (loading) {
        return (
          <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
            <CircularProgress />
          </Box>
        );
      }

      if (error) {
        return (
          <Box p={3}>
            <Alert severity="error">{error}</Alert>
          </Box>
        );
      }

      return (
        <>
          <Box mb={3}>
            <Typography variant="h4" gutterBottom>
              Financial Dashboard
            </Typography>
          </Box>

          <Tabs value={activeTab} onChange={handleTabChange}>
            <Tab label="Payments" />
            <Tab label="Commissions" />
          </Tabs>

          {activeTab === 0 && (
            <Box mt={3}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>Payment Trends</Typography>
                  {chartData?.payment?.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={chartData.payment}>
                        <XAxis dataKey="month" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="USD" stroke="#8884d8" />
                        <Line type="monotone" dataKey="ZWL" stroke="#82ca9d" />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <Typography variant="body1" color="textSecondary" align="center">
                      No payment data available
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Box>
          )}

          {activeTab === 1 && (
            <Box mt={3}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>Agent Commissions</Typography>
                  {chartData?.commission?.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={chartData.commission}>
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="commission" fill="#8884d8" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <Typography variant="body1" color="textSecondary" align="center">
                      No commission data available
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Box>
          )}
        </>
      );
    }

    // For other pages, render the child route content
    return <Outlet />;
  };

  return (
    <Box sx={{ display: 'flex' }}>
      {/* Mobile drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={handleDrawerToggle}
        ModalProps={{
          keepMounted: true, // Better open performance on mobile
        }}
        sx={{
          display: { xs: 'block', sm: 'none' },
          '& .MuiDrawer-paper': { boxSizing: 'border-box', width: DRAWER_WIDTH },
        }}
      >
        {drawer}
      </Drawer>

      {/* Desktop drawer */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', sm: 'block' },
          '& .MuiDrawer-paper': { boxSizing: 'border-box', width: DRAWER_WIDTH },
        }}
        open
      >
        {drawer}
      </Drawer>

      {/* Main content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { sm: `calc(100% - ${DRAWER_WIDTH}px)` },
          ml: { sm: `${DRAWER_WIDTH}px` },
        }}
      >
        <Box sx={{ display: { sm: 'none' }, mb: 2 }}>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
          >
            <MenuIcon />
          </IconButton>
        </Box>

        {renderMainContent()}
      </Box>
    </Box>
  );
};

export default AccountantDashboard;
