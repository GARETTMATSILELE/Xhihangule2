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
  useTheme,
  useMediaQuery,
  IconButton,
  Avatar,
  Menu,
  MenuItem,
  Badge,
  ListItemIcon,
  Divider
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
  Notifications as NotificationsIcon,
  Logout as LogoutIcon,
  Menu as MenuIcon,
  ChevronLeft as ChevronLeftIcon
} from '@mui/icons-material';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { getChartData, initializeChartData } from '../services/chartService';
import { useCompany } from '../contexts/CompanyContext';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import PropertyAccountsPage from './AccountantDashboard/PropertyAccountsPage';
import PropertyAccountDetailPage from './AccountantDashboard/PropertyAccountDetailPage';
import { AccountantSidebar } from '../components/Layout/AccountantSidebar';
import { useAuth } from '../contexts/AuthContext';
import DashboardOverview from './AccountantDashboard/DashboardOverview';

const DRAWER_WIDTH = 280;

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
  const { logout, user, company: authCompany } = useAuth();
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const isUserMenuOpen = Boolean(menuAnchorEl);
  const handleOpenUserMenu = (event: React.MouseEvent<HTMLElement>) => setMenuAnchorEl(event.currentTarget);
  const handleCloseUserMenu = () => setMenuAnchorEl(null);

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

  // Remove inline drawer and use AccountantSidebar

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

  // Adapter for AccountantSidebar (expects (index: number) => void)
  const handleSidebarTabChange = (index: number) => {
    handleTabChange({} as React.SyntheticEvent, index);
  };

  const renderMainContent = () => {
    if (location.pathname === '/accountant-dashboard') {
      return <DashboardOverview />;
    }
    return <Outlet />;
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Top Banner */}
      <Box sx={{
        width: '100%',
        height: 64,
        bgcolor: '#1E1E2F',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 3,
        boxShadow: 1,
        position: 'fixed',
        zIndex: 1201,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {company?.name || 'Accountant Dashboard'}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography variant="body1" sx={{ display: { xs: 'none', sm: 'block' } }}>
            {user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'User' : ''}
          </Typography>
          <IconButton
            onClick={handleOpenUserMenu}
            size="small"
            sx={{ p: 0.5, color: 'inherit' }}
            aria-controls={isUserMenuOpen ? 'user-menu' : undefined}
            aria-haspopup="true"
            aria-expanded={isUserMenuOpen ? 'true' : undefined}
          >
            <Badge color="error" variant="dot" overlap="circular" invisible>
              <Avatar
                src={
                  ((user as any)?.photoURL ||
                  (user as any)?.avatarUrl ||
                  (user as any)?.profileImageUrl ||
                  (user as any)?.profilePicture ||
                  '') as string
                }
                sx={{ width: 36, height: 36, bgcolor: '#5E72E4' }}
              >
                {((user?.firstName?.[0] || '') + (user?.lastName?.[0] || '')).toUpperCase() || (user?.email?.[0]?.toUpperCase() || 'U')}
              </Avatar>
            </Badge>
          </IconButton>
          <Menu
            anchorEl={menuAnchorEl}
            id="user-menu"
            open={isUserMenuOpen}
            onClose={handleCloseUserMenu}
            onClick={handleCloseUserMenu}
            transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            PaperProps={{
              sx: {
                mt: 1,
                minWidth: 220,
              }
            }}
          >
            <MenuItem onClick={() => { handleCloseUserMenu(); navigate('/accountant-dashboard/tasks'); }}>
              <ListItemIcon>
                <NotificationsIcon fontSize="small" />
              </ListItemIcon>
              Notifications
            </MenuItem>
            <MenuItem onClick={() => { handleCloseUserMenu(); navigate('/accountant-dashboard/settings'); }}>
              <ListItemIcon>
                <SettingsIcon fontSize="small" />
              </ListItemIcon>
              Settings
            </MenuItem>
            <Divider />
            <MenuItem onClick={() => { handleCloseUserMenu(); logout(); }}>
              <ListItemIcon>
                <LogoutIcon fontSize="small" />
              </ListItemIcon>
              Logout
            </MenuItem>
          </Menu>
        </Box>
      </Box>
      <Box sx={{ display: 'flex', flexGrow: 1, pt: 8 }}>
        {/* Sidebar fixed and visible across accountant routes */}
        <Box sx={{ display: { xs: 'none', sm: 'block' }, position: 'fixed', zIndex: 1200 }}>
          <AccountantSidebar
            activeTab={activeTab}
            onTabChange={handleSidebarTabChange}
          />
        </Box>
        {/* Main content */}
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            pt: 3,
            pr: 3,
            pb: 3,
            pl: 0,
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
    </Box>
  );
};

export default AccountantDashboard;
