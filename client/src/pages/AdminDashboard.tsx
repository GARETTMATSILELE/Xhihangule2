import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  LinearProgress,
  TextField,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Tooltip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Stack,
  Switch,
  FormControlLabel,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  Business as BusinessIcon,
  People as PeopleIcon,
  Description as DescriptionIcon,
  Payment as PaymentIcon,
  Search as SearchIcon,
  Message as MessageIcon,
  Warning as WarningIcon,
  AccessTime as AccessTimeIcon,
  FilterList as FilterListIcon,
  DarkMode as DarkModeIcon,
  LightMode as LightModeIcon,
} from '@mui/icons-material';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  RadialBarChart,
  RadialBar,
} from 'recharts';
import { AdminSidebar } from '../components/Layout/AdminSidebar';
import { Header } from '../components/Layout/Header';
import { Properties } from './Properties/Properties';
import { Tenants } from './Tenants/Tenants';
import { LeaseList } from './leases/LeaseList';
import PaymentsPageWrapper from '../components/payments/PaymentsPageWrapper';
import { Property } from '../types/property';
import { Maintenance } from './Maintenance/Maintenance';
import { UserManagement } from '../pages/UserManagement/UserManagement';
import { TooltipProps } from 'recharts';
import CommunicationsPage from './Communications/CommunicationsPage';
import AdminPropertyOwnersPage from './admin/AdminPropertyOwnersPage';
import { Files } from './Files/Files';
import { useAdminDashboardService } from '../services/adminDashboardService';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import MaintenancePageWrapper from '../components/maintenance/MaintenancePageWrapper';
import { AdminSettings } from './Settings/AdminSettings';
import ReportsPage from './admin/ReportsPage';
import AdminLeasesPage from './AdminLeasesPage';
import LevyPaymentsPage from './admin/LevyPaymentsPage';
import DatabaseSyncDashboard from '../components/admin/DatabaseSyncDashboard';
import { Link } from 'react-router-dom';

// Theme colors
const lightTheme = {
  background: '#FFFFFF',
  cardBackground: '#FFFFFF',
  text: '#1A1F36',
  textSecondary: '#697386',
  border: '#E5E7EB',
  chartColors: ['#38BDF8', '#9333EA', '#10B981', '#F59E0B', '#EF4444', '#6366F1'],
  gradient: {
    start: '#38BDF8',
    end: '#9333EA',
  },
};

const darkTheme = {
  background: '#151728',
  cardBackground: '#1E1F2F',
  text: '#E5E7EB',
  textSecondary: '#9CA3AF',
  border: '#2D3748',
  chartColors: ['#38BDF8', '#9333EA', '#10B981', '#F59E0B', '#EF4444', '#6366F1'],
  gradient: {
    start: '#38BDF8',
    end: '#9333EA',
  },
};

const StatCard = ({ title, value, icon, color, onClick, theme }: { 
  title: string; 
  value: string; 
  icon: React.ReactNode; 
  color: string;
  onClick?: () => void;
  theme: typeof lightTheme;
}) => (
  <Card 
    sx={{ 
      cursor: onClick ? 'pointer' : 'default',
      backgroundColor: theme.cardBackground,
      border: `1px solid ${theme.border}`,
      boxShadow: 'none',
      '&:hover': onClick ? {
        transform: 'translateY(-2px)',
        transition: 'transform 0.2s ease-in-out',
      } : {},
    }} 
    onClick={onClick}
  >
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
        <Typography variant="h6" color={theme.textSecondary}>
          {title}
        </Typography>
      </Box>
      <Typography variant="h4" sx={{ mb: 1, fontWeight: 600, color: theme.text }}>
        {value}
      </Typography>
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

interface PropertyStats {
  totalProperties: number;
  vacantProperties: number;
  tenantedProperties: number;
  maintenanceProperties: number;
  residentialProperties: number;
  commercialProperties: number;
}

const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { getAdminDashboardProperties } = useAdminDashboardService();
  const { user, isAuthenticated } = useAuth();
  const { company } = useCompany();
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertiesLoading, setPropertiesLoading] = useState(true);
  const [propertiesError, setPropertiesError] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState(0);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Update active tab based on current route
  useEffect(() => {
    const path = location.pathname;
    if (path.includes('/admin/users')) {
      setActiveTab(8);
    } else if (path.includes('/admin/maintenance')) {
      setActiveTab(6);
    } else if (path.includes('/admin/properties')) {
      setActiveTab(1);
    } else if (path.includes('/admin/property-owners')) {
      setActiveTab(2);
    } else if (path.includes('/admin/tenants')) {
      setActiveTab(3);
    } else if (path.includes('/admin/leases')) {
      setActiveTab(4);
    } else if (path.includes('/admin/payments')) {
      setActiveTab(5);
    } else if (path.includes('/admin/communications')) {
      setActiveTab(7);
    } else if (path.includes('/admin/files')) {
      setActiveTab(9);
    } else if (path.includes('/admin/reports')) {
      setActiveTab(10);
    } else if (path.includes('/admin/settings')) {
      setActiveTab(11);
    } else {
      setActiveTab(0);
    }
  }, [location.pathname]);

  // Memoize the fetch function to prevent infinite loops
  const fetchProperties = useCallback(async () => {
    setPropertiesLoading(true);
    setPropertiesError(null);
    try {
      // If no company, skip fetch and prompt setup
      if (isAuthenticated && (!user?.companyId && !company)) {
        setProperties([]);
        setPropertiesError('Please set up your company to view dashboard data.');
        return;
      }
      const data = await getAdminDashboardProperties();
      setProperties(data);
    } catch (err: any) {
      setPropertiesError(err.message || 'Failed to fetch properties');
    } finally {
      setPropertiesLoading(false);
    }
  }, [isAuthenticated, user?.companyId, company]);

  // Fetch properties for admin dashboard (no auth) - only run once on mount
  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  // If no company, show a setup prompt at the top of the dashboard
  const showCompanySetup = isAuthenticated && (!user?.companyId && !company);

  // Calculate statistics from real data
  const propertyStats: PropertyStats = {
    totalProperties: properties?.length || 0,
    vacantProperties: properties?.filter(p => p.status === 'available').length || 0,
    tenantedProperties: properties?.filter(p => p.status === 'rented').length || 0,
    maintenanceProperties: properties?.filter(p => p.status === 'maintenance').length || 0,
    residentialProperties: properties?.filter(p => p.type === 'apartment' || p.type === 'house').length || 0,
    commercialProperties: properties?.filter(p => p.type === 'commercial').length || 0
  };

  // Calculate chart data from real properties
  const occupancyData = [
    { name: 'Available', value: properties?.filter(p => p.status === 'available').length || 0 },
    { name: 'Rented', value: properties?.filter(p => p.status === 'rented').length || 0 },
    { name: 'Maintenance', value: properties?.filter(p => p.status === 'maintenance').length || 0 }
  ];

  const propertyTypesData = [
    { name: 'Residential', value: properties?.filter(p => p.type === 'apartment' || p.type === 'house').length || 0 },
    { name: 'Commercial', value: properties?.filter(p => p.type === 'commercial').length || 0 }
  ];

  const chartData = {
    occupancy: occupancyData,
    propertyTypes: propertyTypesData,
    monthlyTrend: [] // Empty array since revenue tracking is disabled
  };

  const theme = isDarkMode ? darkTheme : lightTheme;

  const chartStyles = {
    card: {
      backgroundColor: theme.cardBackground,
      border: `1px solid ${theme.border}`,
      boxShadow: 'none',
      borderRadius: 2,
    },
    text: {
      color: theme.text,
    },
    textSecondary: {
      color: theme.textSecondary,
    },
    grid: {
      stroke: theme.border,
    },
    tooltip: {
      backgroundColor: theme.cardBackground,
      border: `1px solid ${theme.border}`,
      color: theme.text,
    },
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <Box sx={chartStyles.tooltip} p={2}>
          <Typography variant="body2" sx={chartStyles.text}>
            {label}
          </Typography>
          {payload.map((entry: any, index: number) => (
            <Typography key={index} variant="body2" sx={{ color: entry.color }}>
              {entry.name}: {entry.value}
            </Typography>
          ))}
        </Box>
      );
    }
    return null;
  };

  // Handle navigation to respective routes (no auth required)
  const handleNavigation = (path: string) => {
    navigate(path);
  };

  const DashboardContent: React.FC = () => {
    if (propertiesLoading) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <CircularProgress />
        </Box>
      );
    }

    if (propertiesError) {
      return (
        <Box p={3}>
          <Alert severity="warning" action={<Button color="inherit" size="small" onClick={() => navigate('/admin/company-setup')}>Set up company</Button>}>
            {propertiesError}
          </Alert>
        </Box>
      );
    }

    return (
      <Box sx={{ p: 3 }}>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" gutterBottom>
            Property Statistics
          </Typography>
          <Typography variant="subtitle1" color="textSecondary">
            Overview of all properties in the system
          </Typography>
        </Box>

        <Grid container spacing={3}>
          <Grid item xs={12} md={6} lg={3}>
            <StatCard
              title="Total Properties"
              value={propertyStats.totalProperties.toString()}
              icon={<BusinessIcon />}
              color="#1976d2"
              theme={theme}
              onClick={() => handleNavigation('/admin/properties')}
            />
          </Grid>
          <Grid item xs={12} md={6} lg={3}>
            <StatCard
              title="Vacant Properties"
              value={propertyStats.vacantProperties.toString()}
              icon={<BusinessIcon />}
              color="#dc004e"
              theme={theme}
              onClick={() => handleNavigation('/admin/properties')}
            />
          </Grid>
          <Grid item xs={12} md={6} lg={3}>
            <StatCard
              title="Tenanted Properties"
              value={propertyStats.tenantedProperties.toString()}
              icon={<PeopleIcon />}
              color="#4caf50"
              theme={theme}
              onClick={() => handleNavigation('/admin/tenants')}
            />
          </Grid>
          <Grid item xs={12} md={6} lg={3}>
            <StatCard
              title="Maintenance Properties"
              value={propertyStats.maintenanceProperties.toString()}
              icon={<WarningIcon />}
              color="#ff9800"
              theme={theme}
              onClick={() => handleNavigation('/admin/maintenance')}
            />
          </Grid>
        </Grid>

        <Grid container spacing={3} sx={{ mt: 2 }}>
          <Grid item xs={12} md={6}>
            <Paper sx={chartStyles.card}>
              <Box sx={{ p: 2 }}>
                <Typography variant="h6" sx={chartStyles.text}>
                  Property Occupancy
                </Typography>
                <Box sx={{ height: 300, mt: 2 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartData.occupancy}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label
                      >
                        {chartData.occupancy.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={theme.chartColors[index % theme.chartColors.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip content={<CustomTooltip />} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </Box>
              </Box>
            </Paper>
          </Grid>
          <Grid item xs={12} md={6}>
            <Paper sx={chartStyles.card}>
              <Box sx={{ p: 2 }}>
                <Typography variant="h6" sx={chartStyles.text}>
                  Property Types
                </Typography>
                <Box sx={{ height: 300, mt: 2 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartData.propertyTypes}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label
                      >
                        {chartData.propertyTypes.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={theme.chartColors[index % theme.chartColors.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip content={<CustomTooltip />} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </Box>
              </Box>
            </Paper>
          </Grid>
        </Grid>

        <Box sx={{ mt: 4, p: 3, backgroundColor: theme.cardBackground, borderRadius: 2, border: `1px solid ${theme.border}` }}>
          <Typography variant="h6" gutterBottom sx={chartStyles.text}>
            Note
          </Typography>
          <Typography variant="body2" sx={chartStyles.textSecondary}>
            This dashboard shows property statistics without requiring authentication. 
            To access detailed property management features, please log in to your account.
          </Typography>
        </Box>
      </Box>
    );
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AdminSidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <Box sx={{ flexGrow: 1 }}>
        <Header />
        <Box sx={{ mt: 8, p: 3 }}>
          <Routes>
            <Route path="/" element={<DashboardContent />} />
            <Route path="/users" element={<UserManagement />} />
            <Route path="/maintenance" element={<MaintenancePageWrapper userRole="admin" />} />
            <Route path="/properties" element={<Properties />} />
            <Route path="/property-owners" element={<AdminPropertyOwnersPage />} />
            <Route path="/tenants" element={<Tenants />} />
            <Route path="/leases" element={<AdminLeasesPage />} />
            <Route path="/payments" element={<PaymentsPageWrapper userRole="admin" />} />
            <Route path="/levies" element={<LevyPaymentsPage />} />
            <Route path="/communications" element={<CommunicationsPage />} />
            <Route path="/files" element={<Files />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/sync" element={<DatabaseSyncDashboard />} />
            <Route path="/settings" element={<AdminSettings />} />
          </Routes>
        </Box>
      </Box>
    </Box>
  );
};

export default AdminDashboard;
