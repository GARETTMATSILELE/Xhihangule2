import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams, Routes, Route } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useCompany } from '../../contexts/CompanyContext';
import api from '../../api/axios';
import { apiService } from '../../api';
import {
  Box,
  Container,
  Grid,
  Paper,
  Typography,
  Card,
  CardContent,
  CardActions,
  Button,
  Tabs,
  Tab,
  CircularProgress,
  Alert,
  Divider,
  Chip,
  Skeleton,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
    useTheme,
    useMediaQuery,
} from '@mui/material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  Business as BusinessIcon,
  Payment as PaymentIcon,
  Build as BuildIcon,
  Assessment as AssessmentIcon,
  Add as AddIcon,
  WarningAmber as WarningAmberIcon,
} from '@mui/icons-material';
import { AuthErrorReport } from '../AuthErrorReport';
import { getChartData } from '../../services/chartService';
import ErrorBoundary from '../common/ErrorBoundary';
import PropertyDetails from './PropertyDetails';
import { buildUnifiedTransactions, calculateOwnerFinancialSummary, daysUntil } from './ownerDashboardUtils';

// ---------- Interfaces ----------
interface Property {
  _id: string;
  name: string;
  address: string;
  type: string;
  status: string;
  rent: number;
  bedrooms: number;
  bathrooms: number;
  area: number;
  description: string;
  images: string[];
  amenities: string[];
  occupancyRate: number;
  totalRentCollected: number;
  currentArrears: number;
  nextLeaseExpiry: string;
  units: number;
  occupiedUnits: number;
  commission?: number;
}

interface MaintenanceRequest {
  attachments?: {
    name: string;
    url: string;
    size: number;
    type: string;
  }[];
  _id: string;
  propertyId: string;
  propertyName?: string;
  propertyAddress?: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'pending_approval' | 'approved' | 'pending_completion' | 'in_progress' | 'completed' | 'cancelled';
  estimatedCost: number;
  createdAt: string;
}

interface ChartData {
  occupancy?: any[];
  payment?: {
    data: any[];
    summary?: {
      totalAmount: number;
      totalIncome: number;
      totalExpenses: number;
      netIncome: number;
    };
  };
  maintenance?: any[];
}

interface LoadingStates {
  properties: boolean;
  maintenance: boolean;
  charts: boolean;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

// ---------- Component ----------
export default function OwnerDashboard() {
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const { company } = useCompany();

  const [activeTab, setActiveTab] = useState(0);
  const [properties, setProperties] = useState<Property[]>([]);
  const [maintenanceRequests, setMaintenanceRequests] = useState<MaintenanceRequest[]>([]);
  const [chartData, setChartData] = useState<ChartData>({});
  const [loading, setLoading] = useState<LoadingStates>({
    properties: true,
    maintenance: true,
    charts: true,
  });
  const [error, setError] = useState('');
  const [showAuthError, setShowAuthError] = useState(false);
  const [chartErrors, setChartErrors] = useState<{ [key: string]: string }>({});
  const [financialData, setFinancialData] = useState<any>(null);
  const [financialLoading, setFinancialLoading] = useState(true);
  const [userName, setUserName] = useState<string>('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<'day' | 'week' | 'month' | 'year'>('month');
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDate());
  const [selectedWeek, setSelectedWeek] = useState<number>(Math.ceil((new Date().getDate() + new Date(new Date().getFullYear(), new Date().getMonth(), 1).getDay()) / 7));
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const formatCurrency = useCallback((value: number) => `$${Number(value || 0).toLocaleString()}`, []);
  const sectionPaperSx = { p: { xs: 1.5, sm: 2, md: 2.5 }, borderRadius: 2 };
  const emphasizedPaperSx = {
    p: { xs: 1.5, sm: 2, md: 2.5 },
    border: '1px solid',
    borderColor: 'divider',
    borderRadius: 2
  };

  // Mobile responsiveness helpers
  const theme = useTheme();
  const isXs = useMediaQuery(theme.breakpoints.down('sm'));

  // Cleanup
  const cleanup = useCallback(() => {
    setProperties([]);
    setMaintenanceRequests([]);
    setChartData({});
    setError('');
    setChartErrors({});
    setFinancialData(null);
    setUserName('');
  }, []);

  // Transform property data for charts
  const transformPropertyDataForCharts = useCallback((properties: Property[]) => {
    return properties.map((property) => ({
      name: property.name || 'Unnamed Property',
      occupancyRate: property.occupancyRate || 0,
      totalRentCollected: property.totalRentCollected || 0,
      currentArrears: property.currentArrears || 0,
      units: property.units || 1,
      occupiedUnits: property.occupiedUnits || 0,
      vacantUnits: Math.max(0, (property.units || 1) - (property.occupiedUnits || 0)),
    }));
  }, []);

  // Transform maintenance data for charts
  const transformMaintenanceDataForCharts = useCallback((requests: MaintenanceRequest[]) => {
    const statusCounts = {
      pending: requests.filter((req) => req.status === 'pending').length,
      in_progress: requests.filter((req) => req.status === 'in_progress').length,
      completed: requests.filter((req) => req.status === 'completed').length,
      cancelled: requests.filter((req) => req.status === 'cancelled').length,
    };

    return [
      { name: 'Pending', value: statusCounts.pending },
      { name: 'In Progress', value: statusCounts.in_progress },
      { name: 'Completed', value: statusCounts.completed },
      { name: 'Cancelled', value: statusCounts.cancelled },
    ].filter((item) => item.value > 0);
  }, []);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  const handleLogout = () => {
    logout();
    setShowAuthError(true);
  };

  const handleApproveMaintenance = async (requestId: string) => {
    try {
      setActionLoadingId(requestId);
      const userStr = localStorage.getItem('user');
      const user = userStr ? JSON.parse(userStr) : null;
      await apiService.approveOwnerMaintenanceRequest(requestId, user?._id, user?.companyId);
      // Optimistically update status locally
      setMaintenanceRequests((prev) => prev.map((r) => r._id === requestId ? { ...r, status: 'approved' } : r));
    } catch (e) {
      console.error('Approve maintenance failed', e);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRejectMaintenance = async (requestId: string) => {
    try {
      setActionLoadingId(requestId);
      const reason = window.prompt('Please provide a reason for rejection (optional):') || undefined;
      const userStr = localStorage.getItem('user');
      const user = userStr ? JSON.parse(userStr) : null;
      await apiService.rejectOwnerMaintenanceRequest(requestId, reason, user?._id, user?.companyId);
      // Optimistically update status locally
      setMaintenanceRequests((prev) => prev.map((r) => r._id === requestId ? { ...r, status: 'cancelled' } : r));
    } catch (e) {
      console.error('Reject maintenance failed', e);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Filter financial data based on time period
  const getFilteredFinancialData = useCallback(() => {
    if (!financialData) return null;

    const now = new Date();
    let startDate: Date;
    let endDate: Date;

    switch (timeFilter) {
      case 'day':
        startDate = new Date(selectedYear, selectedMonth, selectedDay);
        endDate = new Date(selectedYear, selectedMonth, selectedDay, 23, 59, 59);
        break;
      case 'week':
        // Calculate the start of the selected week (Monday)
        const weekStart = new Date(selectedYear, selectedMonth, 1);
        const firstDayOfMonth = weekStart.getDay();
        const daysToAdd = (selectedWeek - 1) * 7;
        const mondayOffset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
        startDate = new Date(selectedYear, selectedMonth, 1 + daysToAdd - mondayOffset);
        endDate = new Date(startDate.getTime() + 6 * 24 * 60 * 60 * 1000);
        endDate.setHours(23, 59, 59);
        break;
      case 'month':
        startDate = new Date(selectedYear, selectedMonth, 1);
        endDate = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);
        break;
      case 'year':
        startDate = new Date(selectedYear, 0, 1);
        endDate = new Date(selectedYear, 11, 31, 23, 59, 59);
        break;
      default:
        startDate = new Date(selectedYear, selectedMonth, 1);
        endDate = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);
    }

    // Filter transactions within the time period (for transaction table preview)
    const filteredTransactions = financialData.recentTransactions?.filter((transaction: any) => {
      const transactionDate = new Date(transaction.date);
      return transactionDate >= startDate && transactionDate <= endDate;
    }) || [];

    // Build property breakdown from each property's full transaction list.
    // This avoids relying on the global recentTransactions cap and keeps property attribution exact.
    const filteredPropertyBreakdown = financialData.propertyBreakdown?.map((property: any) => {
      const propertyTransactions = (property?.transactions || []).filter((t: any) => {
        const transactionDate = new Date(t.date);
        return transactionDate >= startDate && transactionDate <= endDate;
      });

      const propertyIncome = propertyTransactions
        .filter((t: any) => t.type === 'income')
        .reduce((sum: number, t: any) => sum + (t.amount || 0), 0);
      const propertyRentPaidFromReceipts = propertyTransactions
        .filter((t: any) => t.type === 'income')
        .reduce((sum: number, t: any) => sum + Number(t.receiptAmount ?? t.amount ?? 0), 0);
      const propertyCommission = propertyTransactions
        .filter((t: any) => t.type === 'income')
        .reduce((sum: number, t: any) => sum + Number(t.commissionAmount ?? 0), 0);
      
      const propertyExpenses = propertyTransactions
        .filter((t: any) => t.type === 'expense')
        .reduce((sum: number, t: any) => sum + (t.amount || 0), 0);
      
      const propertyPayouts = propertyTransactions
        .filter((t: any) => t.type === 'owner_payout')
        .reduce((sum: number, t: any) => sum + (t.amount || 0), 0);

      return {
        ...property,
        totalIncome: propertyIncome,
        totalRentPaid: propertyRentPaidFromReceipts,
        totalCommission: propertyCommission,
        totalExpenses: propertyExpenses,
        totalOwnerPayouts: propertyPayouts,
        runningBalance: propertyIncome - propertyExpenses - propertyPayouts
      };
    }) || [];

    // Summary should come from property-level aggregates for accuracy.
    const filteredSummary = {
      totalIncome: filteredPropertyBreakdown.reduce((sum: number, p: any) => sum + Number(p?.totalIncome || 0), 0),
      totalExpenses: filteredPropertyBreakdown.reduce((sum: number, p: any) => sum + Number(p?.totalExpenses || 0), 0),
      totalOwnerPayouts: filteredPropertyBreakdown.reduce((sum: number, p: any) => sum + Number(p?.totalOwnerPayouts || 0), 0),
      runningBalance: 0,
      totalProperties: financialData.summary?.totalProperties || 0
    };

    filteredSummary.runningBalance = filteredSummary.totalIncome - filteredSummary.totalExpenses - filteredSummary.totalOwnerPayouts;

    return {
      summary: filteredSummary,
      recentTransactions: filteredTransactions,
      propertyBreakdown: filteredPropertyBreakdown
    };
  }, [financialData, timeFilter, selectedDay, selectedWeek, selectedMonth, selectedYear]);

  // Fetch data
  useEffect(() => {
    let isMounted = true;
    let timeoutId: NodeJS.Timeout;

    const fetchData = async () => {
      try {
        if (!user) {
          console.log('OwnerDashboard: User not available yet, waiting...');
          if (isMounted) {
            timeoutId = setTimeout(() => {
              if (isMounted) fetchData();
            }, 500);
          }
          return;
        }

        console.log('OwnerDashboard: User data available:', user);

        const displayName =
          user.firstName && user.lastName
            ? `${user.firstName} ${user.lastName}`
            : user.firstName || user.lastName || user.email || 'Property Owner';
        setUserName(displayName);

        if (!user._id) {
          console.error('OwnerDashboard: User ID not found in user data');
          setError('User ID not found');
          return;
        }

        const [propertiesRes, maintenanceRes, financialDataRes] = await Promise.all([
          api.get('/owners/properties'),
          apiService.getOwnerMaintenanceRequestsPublic(user._id as string, (user as any).companyId),
          apiService.getOwnerFinancialData(),
        ]);

        if (isMounted) {
          setProperties(propertiesRes.data);
          setMaintenanceRequests(maintenanceRes.data);

          if (financialDataRes.data?.success) {
            setFinancialData(financialDataRes.data.data);
          }

          setLoading((prev) => ({ ...prev, properties: false, maintenance: false }));
          setFinancialLoading(false);
        }

        // Charts
        const chartTypes = ['occupancy', 'payment', 'maintenance'];
        const newChartData: ChartData = {};
        const newChartErrors: { [key: string]: string } = {};

        for (const type of chartTypes) {
          try {
            const chartResponse = await getChartData(type);
            if (isMounted) {
              if (type === 'occupancy') {
                if (chartResponse.data && Array.isArray(chartResponse.data)) {
                  newChartData.occupancy = chartResponse.data;
                } else {
                  const transformedData = transformPropertyDataForCharts(propertiesRes.data);
                  newChartData.occupancy = transformedData.map((prop) => ({
                    name: prop.name,
                    occupied: prop.occupiedUnits,
                    vacant: prop.vacantUnits,
                  }));
                }
              } else if (type === 'payment') {
                newChartData.payment = chartResponse;
              } else if (type === 'maintenance') {
                newChartData.maintenance = transformMaintenanceDataForCharts(maintenanceRes.data);
              }
            }
          } catch (err: any) {
            console.error(`OwnerDashboard: Error fetching ${type} chart data:`, err);
            if (isMounted) {
              newChartErrors[type] = err.response?.data?.error || err.message || 'Unknown error';
            }
          }
        }

        if (isMounted) {
          setChartData(newChartData);
          setChartErrors(newChartErrors);
          setLoading((prev) => ({ ...prev, charts: false }));
        }
      } catch (err: any) {
        console.error('OwnerDashboard: Error fetching data:', err);
        if (isMounted) {
          setError(err.response?.data?.error || 'Error fetching dashboard data');
          setLoading({ properties: false, maintenance: false, charts: false });
          setFinancialLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
      cleanup();
    };
  }, [cleanup, transformPropertyDataForCharts, transformMaintenanceDataForCharts]);

  // Stats
  const totalProperties = properties.length;
  const occupiedUnits = properties.reduce((sum, property) => {
    if (property.status === 'rented') return sum + (property.units || 1);
    return sum + (property.occupiedUnits || 0);
  }, 0);
  const totalUnits = properties.reduce((sum, property) => sum + (property.units || 1), 0);
  const vacantUnits = Math.max(0, totalUnits - occupiedUnits);

  const isAnyLoading = Object.values(loading).some(Boolean);
  const allTransactions = useMemo(() => {
    if (!financialData?.recentTransactions || !Array.isArray(financialData.recentTransactions)) return [];
    return financialData.recentTransactions;
  }, [financialData]);

  const commissionRate = useMemo(() => {
    const commissions = properties.map((p) => Number(p.commission || 0)).filter((v) => Number.isFinite(v));
    if (commissions.length === 0) return 0;
    return commissions.reduce((sum, value) => sum + value, 0) / commissions.length;
  }, [properties]);

  const ownerFinancialSummary = useMemo(() => {
    const grossIncome =
      Number(financialData?.summary?.totalIncome || 0) ||
      allTransactions
        .filter((tx: any) => tx?.type === 'income')
        .reduce((sum: number, tx: any) => sum + Number(tx?.amount || 0), 0);
    const expenses =
      Number(financialData?.summary?.totalExpenses || 0) ||
      allTransactions
        .filter((tx: any) => tx?.type === 'expense')
        .reduce((sum: number, tx: any) => sum + Number(tx?.amount || 0), 0);
    const amountPaidToOwner =
      Number(financialData?.summary?.totalOwnerPayouts || 0) ||
      allTransactions
        .filter((tx: any) => tx?.type === 'owner_payout')
        .reduce((sum: number, tx: any) => sum + Number(tx?.amount || 0), 0);

    return calculateOwnerFinancialSummary({
      grossIncome,
      expenses,
      amountPaidToOwner,
      commissionRate
    });
  }, [financialData, allTransactions, commissionRate]);

  const ownerAlerts = useMemo(() => {
    const alerts: { id: string; text: string; severity: 'warning' | 'info' | 'success' }[] = [];
    const overdue = properties.filter((property) => Number(property.currentArrears || 0) > 0).length;
    if (overdue > 0) {
      alerts.push({
        id: 'arrears',
        text: `${overdue} propert${overdue > 1 ? 'ies have' : 'y has'} overdue tenant payment(s)`,
        severity: 'warning'
      });
    }
    properties.forEach((property) => {
      const remaining = daysUntil(property.nextLeaseExpiry);
      if (remaining !== null && remaining >= 0 && remaining < 60) {
        alerts.push({
          id: `lease-${property._id}`,
          text: `${property.name || 'Property'} lease expiring in ${remaining} days`,
          severity: 'info'
        });
      }
    });
    if (maintenanceRequests.length === 0) {
      alerts.push({
        id: 'no-maintenance',
        text: 'No issues reported this month',
        severity: 'success'
      });
    }
    return alerts;
  }, [properties, maintenanceRequests.length]);

  const ownerActivity = useMemo(() => {
    const paymentEvents = allTransactions
      .filter((tx: any) => tx?.type === 'income')
      .slice(0, 8)
      .map((tx: any, index: number) => ({
        id: `income-${tx?.id || tx?._id || index}`,
        date: tx?.date || tx?.createdAt,
        text: `Rent payment received${tx?.propertyName ? ` - ${tx.propertyName}` : ''}`
      }));
    const maintenanceEvents = maintenanceRequests.slice(0, 8).map((request) => ({
      id: `maint-${request._id}`,
      date: request.createdAt,
      text: `Maintenance recorded - ${request.title}`
    }));
    return [...paymentEvents, ...maintenanceEvents]
      .filter((item) => item.date)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 8);
  }, [allTransactions, maintenanceRequests]);

  const transactionPreview = useMemo(
    () => buildUnifiedTransactions(allTransactions).slice(0, 6),
    [allTransactions]
  );
  const filteredFinancialData = useMemo(() => getFilteredFinancialData(), [getFilteredFinancialData]);
  const filteredSummary = useMemo(() => {
    return calculateOwnerFinancialSummary({
      grossIncome: Number(filteredFinancialData?.summary?.totalIncome || 0),
      expenses: Number(filteredFinancialData?.summary?.totalExpenses || 0),
      amountPaidToOwner: Number(filteredFinancialData?.summary?.totalOwnerPayouts || 0),
      commissionRate
    });
  }, [filteredFinancialData, commissionRate]);
  const filteredUnifiedTransactions = useMemo(
    () => buildUnifiedTransactions(filteredFinancialData?.recentTransactions || []),
    [filteredFinancialData?.recentTransactions]
  );

  if (isAnyLoading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4, px: { xs: 2, sm: 3 } }}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ flexDirection: { xs: 'column', md: 'row' }, gap: { xs: 1, md: 0 } }}>
              <Typography variant="h4" component="h1">
                Welcome {userName || 'Property Owner'}
              </Typography>
              <Button variant="outlined" color="primary" size="small" onClick={handleLogout}>
                Logout
              </Button>
            </Box>
          </Grid>
          <Grid item xs={12}>
            <Paper sx={{ p: 2 }}>
              <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
                <CircularProgress />
              </Box>
            </Paper>
          </Grid>
        </Grid>
      </Container>
    );
  }

  return (
    <ErrorBoundary>
      <Routes>
        <Route
          path="/"
          element={
            <Container maxWidth="lg" sx={{ mt: 4, mb: 4, px: { xs: 2, sm: 3 } }}>
              <Grid container spacing={3}>
                <Grid item xs={12}>
                  <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ flexDirection: { xs: 'column', md: 'row' }, gap: { xs: 1, md: 0 } }}>
                    <Typography variant="h4" component="h1">
                      Welcome {userName || 'Property Owner'}
                    </Typography>
                    <Button variant="outlined" color="primary" size="small" onClick={handleLogout}>
                      Logout
                    </Button>
                  </Box>
                </Grid>

                {error && (
                  <Grid item xs={12}>
                    <Alert severity="error">{error}</Alert>
                  </Grid>
                )}

                <Grid item xs={12}>
                  <Paper sx={{ p: { xs: 1.5, sm: 2 } }}>
                    <Tabs value={activeTab} onChange={handleTabChange} aria-label="dashboard tabs" variant={isXs ? 'scrollable' : 'standard'} scrollButtons={isXs ? 'auto' : false}>
                      <Tab label="Properties" icon={<BusinessIcon />} iconPosition="start" />
                      <Tab label="Financial Data" icon={<PaymentIcon />} iconPosition="start" />
                      <Tab label="Maintenance" icon={<BuildIcon />} iconPosition="start" />
                      <Tab label="Reports" icon={<AssessmentIcon />} iconPosition="start" />
                    </Tabs>

                    {activeTab === 0 && (
                      <Box sx={{ mt: 2 }}>
                        <Grid container spacing={3} sx={{ mb: 3 }}>
                          <Grid item xs={12}>
                            <Paper sx={emphasizedPaperSx}>
                              <Box display="flex" justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} flexWrap="wrap" gap={1} mb={2}>
                                <Typography variant="h6">Owner Money Summary</Typography>
                                <Box display="flex" gap={1} flexWrap="wrap" sx={{ width: { xs: '100%', sm: 'auto' } }}>
                                  <Button size="small" variant="outlined" sx={{ flex: { xs: '1 1 calc(50% - 4px)', sm: '0 1 auto' } }}>Download Statement</Button>
                                  <Button size="small" variant="outlined" color="warning" sx={{ flex: { xs: '1 1 calc(50% - 4px)', sm: '0 1 auto' } }}>Add Maintenance</Button>
                                </Box>
                              </Box>
                              <Grid container spacing={2}>
                                <Grid item xs={12} md={4}>
                                  <Typography variant="caption" color="textSecondary">Gross Income</Typography>
                                  <Typography variant="h6" color="success.main">{formatCurrency(ownerFinancialSummary.grossIncome)}</Typography>
                                </Grid>
                                <Grid item xs={12} md={4}>
                                  <Typography variant="caption" color="textSecondary">Expenses</Typography>
                                  <Typography variant="h6" color="error.main">{formatCurrency(ownerFinancialSummary.expenses)}</Typography>
                                </Grid>
                                <Grid item xs={12} md={4}>
                                  <Typography variant="caption" color="textSecondary">Amount Already Paid to Owner</Typography>
                                  <Typography variant="h6" color="info.main">{formatCurrency(ownerFinancialSummary.amountPaidToOwner)}</Typography>
                                </Grid>
                                <Grid item xs={12}>
                                  <Paper sx={{ p: 2, bgcolor: 'primary.main', color: 'primary.contrastText' }}>
                                    <Typography variant="subtitle2">Net Amount Payable to Owner (All Properties)</Typography>
                                    <Typography variant={isXs ? 'h5' : 'h4'} fontWeight={700}>
                                      {formatCurrency(ownerFinancialSummary.balanceOwedToOwner)}
                                    </Typography>
                                    <Typography variant="body2">
                                      Gross income less expenses and payouts already made.
                                    </Typography>
                                  </Paper>
                                </Grid>
                              </Grid>
                            </Paper>
                          </Grid>
                        </Grid>

                        <Grid container spacing={3} sx={{ mb: 3 }}>
                          <Grid item xs={12} md={6}>
                            <Paper sx={{ ...sectionPaperSx, height: '100%' }}>
                              <Box display="flex" alignItems="center" gap={1} mb={1}>
                                <WarningAmberIcon color="warning" />
                                <Typography variant="h6">Alerts</Typography>
                              </Box>
                              {ownerAlerts.map((item) => (
                                <Alert key={item.id} severity={item.severity} sx={{ mb: 1 }}>
                                  {item.text}
                                </Alert>
                              ))}
                            </Paper>
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <Paper sx={{ ...sectionPaperSx, height: '100%' }}>
                              <Typography variant="h6" gutterBottom>Activity Feed</Typography>
                              {ownerActivity.length > 0 ? ownerActivity.map((item) => (
                                <Box key={item.id} sx={{ mb: 1.5 }}>
                                  <Typography variant="body2">{item.text}</Typography>
                                  <Typography variant="caption" color="textSecondary">
                                    {new Date(item.date).toLocaleString()}
                                  </Typography>
                                  <Divider sx={{ mt: 1 }} />
                                </Box>
                              )) : (
                                <Typography variant="body2" color="textSecondary">
                                  No recent activity available.
                                </Typography>
                              )}
                            </Paper>
                          </Grid>
                        </Grid>

                        <Grid container spacing={3} sx={{ mb: 3 }}>
                          <Grid item xs={12}>
                            <Paper sx={sectionPaperSx}>
                              <Typography variant="h6" gutterBottom>Recent Transactions</Typography>
                              {transactionPreview.length > 0 ? (
                                <TableContainer sx={{ overflowX: 'auto' }}>
                                  <Table size="small" sx={{ minWidth: 520 }}>
                                    <TableHead>
                                      <TableRow>
                                        <TableCell>Date</TableCell>
                                        <TableCell>Type</TableCell>
                                        <TableCell>Description</TableCell>
                                        <TableCell align="right">Amount</TableCell>
                                      </TableRow>
                                    </TableHead>
                                    <TableBody>
                                      {transactionPreview.map((transaction) => (
                                        <TableRow key={transaction.id}>
                                          <TableCell>{new Date(transaction.date).toLocaleDateString()}</TableCell>
                                          <TableCell>
                                            <Chip
                                              size="small"
                                              label={transaction.type === 'income' ? 'Income' : 'Expense'}
                                              color={transaction.type === 'income' ? 'success' : 'error'}
                                            />
                                          </TableCell>
                                          <TableCell>{transaction.description}</TableCell>
                                          <TableCell align="right">
                                            <Typography color={transaction.type === 'income' ? 'success.main' : 'error.main'}>
                                              {formatCurrency(Number(transaction.amount || 0))}
                                            </Typography>
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </TableContainer>
                              ) : (
                                <Typography variant="body2" color="textSecondary">
                                  No income or expense transactions available.
                                </Typography>
                              )}
                            </Paper>
                          </Grid>
                        </Grid>

                        {/* Summary Cards */}
                        <Grid container spacing={3} sx={{ mb: 3 }}>
                          <Grid item xs={12} md={6} lg={3}>
                            <Paper sx={{ p: 2 }}>
                              <Typography variant="subtitle1">Total Properties</Typography>
                              <Typography variant="h4">{totalProperties}</Typography>
                            </Paper>
                          </Grid>
                          <Grid item xs={12} md={6} lg={3}>
                            <Paper sx={{ p: 2 }}>
                              <Typography variant="subtitle1">Occupied Units</Typography>
                              <Typography variant="h4">{occupiedUnits}</Typography>
                            </Paper>
                          </Grid>
                          <Grid item xs={12} md={6} lg={3}>
                            <Paper sx={{ p: 2 }}>
                              <Typography variant="subtitle1">Vacant Units</Typography>
                              <Typography variant="h4">{vacantUnits}</Typography>
                            </Paper>
                          </Grid>
                          <Grid item xs={12} md={6} lg={3}>
                            <Paper sx={{ p: 2 }}>
                              <Typography variant="subtitle1">Occupancy Rate</Typography>
                              <Typography variant="h4">
                                {totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0}%
                              </Typography>
                            </Paper>
                          </Grid>
                        </Grid>

                        {/* Property Cards */}
                        <Grid container spacing={3} sx={{ mb: 4 }}>
                          {properties.map((property) => (
                            <Grid item xs={12} sm={6} lg={4} key={property._id}>
                              <Card>
                                <CardContent>
                                  <Typography color="textSecondary" gutterBottom>
                                    {property.address || 'No address provided'}
                                  </Typography>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                    <Typography variant="body2" component="span">
                                      Status:
                                    </Typography>
                                    <Chip
                                      label={property.status || 'unknown'}
                                      size="small"
                                      color={
                                        property.status === 'available'
                                          ? 'success'
                                          : property.status === 'rented'
                                          ? 'primary'
                                          : 'warning'
                                      }
                                    />
                                  </Box>
                                  <Typography variant="body2" sx={{ mb: 1 }}>
                                    Type: {property.type || 'N/A'}
                                  </Typography>
                                  <Typography variant="body2" sx={{ mb: 1 }}>
                                    Rent: ${property.rent ? property.rent.toLocaleString() : '0'}/month
                                  </Typography>
                                </CardContent>
                                <CardActions>
                                  <Button
                                    size="small"
                                    onClick={() =>
                                      navigate(`/owner-dashboard/property/${property._id}`)
                                    }
                                  >
                                    View Details
                                  </Button>
                                </CardActions>
                              </Card>
                            </Grid>
                          ))}
                        </Grid>
                      </Box>
                    )}

                    {activeTab === 1 && (
                      <Box sx={{ mt: 2 }}>
                        <Box display="flex" justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
                          <Typography variant="h6">Financial Overview</Typography>
                          <Box display="flex" gap={1} alignItems="center" sx={{ flexWrap: 'wrap', width: { xs: '100%', sm: 'auto' } }}>
                            <Button variant={timeFilter === 'day' ? 'contained' : 'outlined'} size="small" onClick={() => setTimeFilter('day')}>Day</Button>
                            {timeFilter === 'day' && (
                              <FormControl size="small" sx={{ minWidth: { xs: 90, sm: 80 } }}>
                                <Select value={selectedDay} onChange={(e) => setSelectedDay(e.target.value as number)}>
                                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => <MenuItem key={day} value={day}>{day}</MenuItem>)}
                                </Select>
                              </FormControl>
                            )}
                            <Button variant={timeFilter === 'week' ? 'contained' : 'outlined'} size="small" onClick={() => setTimeFilter('week')}>Week</Button>
                            {timeFilter === 'week' && (
                              <FormControl size="small" sx={{ minWidth: { xs: 90, sm: 80 } }}>
                                <Select value={selectedWeek} onChange={(e) => setSelectedWeek(e.target.value as number)}>
                                  {Array.from({ length: 6 }, (_, i) => i + 1).map((week) => <MenuItem key={week} value={week}>Week {week}</MenuItem>)}
                                </Select>
                              </FormControl>
                            )}
                            <Button variant={timeFilter === 'month' ? 'contained' : 'outlined'} size="small" onClick={() => setTimeFilter('month')}>Month</Button>
                            {timeFilter === 'month' && (
                              <FormControl size="small" sx={{ minWidth: { xs: 120, sm: 100 } }}>
                                <Select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value as number)}>
                                  {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((month, index) => (
                                    <MenuItem key={index} value={index}>{month}</MenuItem>
                                  ))}
                                </Select>
                              </FormControl>
                            )}
                            <Button variant={timeFilter === 'year' ? 'contained' : 'outlined'} size="small" onClick={() => setTimeFilter('year')}>Year</Button>
                            {timeFilter === 'year' && (
                              <FormControl size="small" sx={{ minWidth: { xs: 90, sm: 80 } }}>
                                <Select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value as number)}>
                                  {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map((year) => (
                                    <MenuItem key={year} value={year}>{year}</MenuItem>
                                  ))}
                                </Select>
                              </FormControl>
                            )}
                          </Box>
                        </Box>

                        {financialLoading ? (
                          <Box display="flex" justifyContent="center" alignItems="center" minHeight="300px">
                            <CircularProgress />
                          </Box>
                        ) : (
                          <>
                            <Grid container spacing={3} sx={{ mb: 3 }}>
                              <Grid item xs={12}>
                                <Paper sx={emphasizedPaperSx}>
                                  <Typography variant="subtitle1" gutterBottom>Owner Payout Summary ({timeFilter})</Typography>
                                  <Grid container spacing={2}>
                                    <Grid item xs={12} md={4}>
                                      <Typography variant="caption" color="textSecondary">Gross Income</Typography>
                                      <Typography variant="h6" color="success.main">{formatCurrency(filteredSummary.grossIncome)}</Typography>
                                    </Grid>
                                    <Grid item xs={12} md={4}>
                                      <Typography variant="caption" color="textSecondary">Expenses</Typography>
                                      <Typography variant="h6" color="error.main">{formatCurrency(filteredSummary.expenses)}</Typography>
                                    </Grid>
                                    <Grid item xs={12} md={4}>
                                      <Typography variant="caption" color="textSecondary">Already Paid to Owner</Typography>
                                      <Typography variant="h6" color="info.main">{formatCurrency(filteredSummary.amountPaidToOwner)}</Typography>
                                    </Grid>
                                    <Grid item xs={12}>
                                      <Paper sx={{ p: 2, bgcolor: 'primary.main', color: 'primary.contrastText' }}>
                                        <Typography variant="subtitle2">Net Amount Payable to Owner</Typography>
                                        <Typography variant={isXs ? 'h5' : 'h4'} fontWeight={700}>{formatCurrency(filteredSummary.balanceOwedToOwner)}</Typography>
                                        <Typography variant="body2">Gross income less expenses and payouts already made.</Typography>
                                      </Paper>
                                    </Grid>
                                  </Grid>
                                </Paper>
                              </Grid>
                            </Grid>

                            {filteredFinancialData?.propertyBreakdown && filteredFinancialData.propertyBreakdown.length > 0 && (
                              <Grid container spacing={3} sx={{ mb: 3 }}>
                                <Grid item xs={12}>
                                  <Paper sx={sectionPaperSx}>
                                    <Typography variant="h6" gutterBottom>Property Breakdown ({timeFilter})</Typography>
                                    <TableContainer sx={{ overflowX: 'auto' }}>
                                      <Table sx={{ minWidth: 640 }}>
                                        <TableHead>
                                          <TableRow>
                                            <TableCell>Property</TableCell>
                                            <TableCell align="right">Rent</TableCell>
                                            <TableCell align="right">Less Commission</TableCell>
                                            <TableCell align="right">Income</TableCell>
                                            <TableCell align="right">Expenses</TableCell>
                                            <TableCell align="right">Owner Paid</TableCell>
                                            <TableCell align="right">Net Payable</TableCell>
                                          </TableRow>
                                        </TableHead>
                                        <TableBody>
                                          {filteredFinancialData.propertyBreakdown.map((property: any) => {
                                            const rentPaid = Number(property?.totalRentPaid ?? property?.totalIncome ?? 0);
                                            const commissionAmount = Number(property?.totalCommission ?? 0);
                                            const incomeAfterCommission = rentPaid - commissionAmount;
                                            const summary = calculateOwnerFinancialSummary({
                                              grossIncome: incomeAfterCommission,
                                              expenses: Number(property?.totalExpenses || 0),
                                              amountPaidToOwner: Number(property?.totalOwnerPayouts || 0),
                                              commissionRate
                                            });
                                            return (
                                              <TableRow key={property.propertyId}>
                                                <TableCell>{property.propertyName || 'Unknown Property'}</TableCell>
                                                <TableCell align="right" sx={{ color: 'success.main' }}>{formatCurrency(rentPaid)}</TableCell>
                                                <TableCell align="right" sx={{ color: 'error.main' }}>
                                                  -{formatCurrency(commissionAmount)}
                                                </TableCell>
                                                <TableCell align="right" sx={{ color: 'success.main' }}>{formatCurrency(incomeAfterCommission)}</TableCell>
                                                <TableCell align="right" sx={{ color: 'error.main' }}>{formatCurrency(Number(property.totalExpenses || 0))}</TableCell>
                                                <TableCell align="right" sx={{ color: 'info.main' }}>{formatCurrency(Number(property.totalOwnerPayouts || 0))}</TableCell>
                                                <TableCell align="right" sx={{ color: summary.balanceOwedToOwner >= 0 ? 'success.main' : 'error.main' }}>
                                                  {formatCurrency(summary.balanceOwedToOwner)}
                                                </TableCell>
                                              </TableRow>
                                            );
                                          })}
                                        </TableBody>
                                      </Table>
                                    </TableContainer>
                                  </Paper>
                                </Grid>
                              </Grid>
                            )}

                            <Grid container spacing={3}>
                              <Grid item xs={12}>
                                <Paper sx={sectionPaperSx}>
                                  <Typography variant="h6" gutterBottom>Transactions ({timeFilter})</Typography>
                                  {filteredUnifiedTransactions.length > 0 ? (
                                    <TableContainer sx={{ overflowX: 'auto' }}>
                                      <Table sx={{ minWidth: 560 }}>
                                        <TableHead>
                                          <TableRow>
                                            <TableCell>Date</TableCell>
                                            <TableCell>Type</TableCell>
                                            <TableCell>Description</TableCell>
                                            <TableCell align="right">Amount</TableCell>
                                          </TableRow>
                                        </TableHead>
                                        <TableBody>
                                          {filteredUnifiedTransactions.map((transaction) => (
                                            <TableRow key={transaction.id}>
                                              <TableCell>{new Date(transaction.date).toLocaleDateString()}</TableCell>
                                              <TableCell>
                                                <Chip
                                                  label={transaction.type === 'income' ? 'Income' : 'Expense'}
                                                  size="small"
                                                  color={transaction.type === 'income' ? 'success' : 'error'}
                                                />
                                              </TableCell>
                                              <TableCell>{transaction.description}</TableCell>
                                              <TableCell align="right">
                                                <Typography color={transaction.type === 'income' ? 'success.main' : 'error.main'}>
                                                  {formatCurrency(Number(transaction.amount || 0))}
                                                </Typography>
                                              </TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </TableContainer>
                                  ) : (
                                    <Alert severity="info">No financial transactions found for the selected time period.</Alert>
                                  )}
                                </Paper>
                              </Grid>
                            </Grid>
                          </>
                        )}
                      </Box>
                    )}

                    {activeTab === 2 && (
                      <Box sx={{ mt: 2 }}>
                        <Typography variant="h6" gutterBottom>
                          Maintenance Requests
                        </Typography>
                        <Grid container spacing={3}>
                          {maintenanceRequests.map((request) => (
                            <Grid item xs={12} md={6} key={request._id}>
                              <Card>
                                <CardContent>
                                  <Typography variant="h6">{request.title}</Typography>
                                  <Typography color="textSecondary" gutterBottom>
                                    {request.propertyName || request.propertyAddress || 'Unknown Property'}
                                  </Typography>
                                  <Typography variant="body2" sx={{ mb: 1 }}>
                                    {request.description}
                                  </Typography>
                                  <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                                    <Chip
                                      label={request.priority}
                                      size="small"
                                      color={
                                        request.priority === 'high'
                                          ? 'error'
                                          : request.priority === 'medium'
                                          ? 'warning'
                                          : 'default'
                                      }
                                    />
                                    <Chip
                                      label={request.status}
                                      size="small"
                                      color={
                                        request.status === 'completed'
                                          ? 'success'
                                          : request.status === 'in_progress' || request.status === 'approved' || request.status === 'pending_completion'
                                          ? 'primary'
                                          : request.status === 'pending_approval'
                                          ? 'warning'
                                          : 'default'
                                      }
                                    />
                                  </Box>
                                  <Typography variant="body2">
                                    Estimated Cost: ${request.estimatedCost?.toLocaleString() || '0'}
                                  </Typography>
                                  {!!request.attachments?.length && (
                                    <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                        Quotation:
                                      </Typography>
                                      {request.attachments.map((attachment, index) => (
                                        <Button
                                          key={`${attachment.url}-${index}`}
                                          size="small"
                                          variant="text"
                                          href={attachment.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          sx={{ justifyContent: 'flex-start', p: 0 }}
                                        >
                                          View/Download {attachment.name || `Attachment ${index + 1}`}
                                        </Button>
                                      ))}
                                    </Box>
                                  )}
                                  {(((request.status || '').toLowerCase().replace(/[^a-z]/g, '')) === 'pendingapproval') && (
                                    <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                                      <Button
                                        variant="contained"
                                        color="primary"
                                        size="small"
                                        disabled={actionLoadingId === request._id}
                                        onClick={() => handleApproveMaintenance(request._id)}
                                      >
                                        {actionLoadingId === request._id ? 'Approving...' : 'Approve'}
                                      </Button>
                                      <Button
                                        variant="outlined"
                                        color="error"
                                        size="small"
                                        disabled={actionLoadingId === request._id}
                                        onClick={() => handleRejectMaintenance(request._id)}
                                      >
                                        {actionLoadingId === request._id ? 'Rejecting...' : 'Reject'}
                                      </Button>
                                    </Box>
                                  )}
                                </CardContent>
                              </Card>
                            </Grid>
                          ))}
                        </Grid>
                      </Box>
                    )}

                    {activeTab === 3 && (
                      <Box sx={{ mt: 2 }}>
                        <Typography variant="h6" gutterBottom>
                          Reports & Analytics
                        </Typography>
                        <Grid container spacing={3}>
                          <Grid item xs={12} md={6}>
                            <Paper sx={{ p: { xs: 1.5, sm: 2 } }}>
                              <Typography variant="subtitle1">Occupancy Chart</Typography>
                              {chartData.occupancy && chartData.occupancy.length > 0 ? (
                                <ResponsiveContainer width="100%" height={200}>
                                  <BarChart data={chartData.occupancy}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" />
                                    <YAxis />
                                    <Tooltip />
                                    <Legend />
                                    <Bar dataKey="occupied" fill="#8884d8" />
                                    <Bar dataKey="vacant" fill="#82ca9d" />
                                  </BarChart>
                                </ResponsiveContainer>
                              ) : (
                                <Typography variant="body2" color="textSecondary">
                                  No occupancy data available
                                </Typography>
                              )}
                            </Paper>
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <Paper sx={{ p: { xs: 1.5, sm: 2 } }}>
                              <Typography variant="subtitle1">Maintenance Status</Typography>
                              {chartData.maintenance && chartData.maintenance.length > 0 ? (
                                <ResponsiveContainer width="100%" height={200}>
                                  <PieChart>
                                    <Pie
                                      data={chartData.maintenance}
                                      cx="50%"
                                      cy="50%"
                                      labelLine={false}
                                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                      outerRadius={80}
                                      fill="#8884d8"
                                      dataKey="value"
                                    >
                                      {chartData.maintenance.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                      ))}
                                    </Pie>
                                    <Tooltip />
                                  </PieChart>
                                </ResponsiveContainer>
                              ) : (
                                <Typography variant="body2" color="textSecondary">
                                  No maintenance data available
                                </Typography>
                              )}
                            </Paper>
                          </Grid>
                        </Grid>
                      </Box>
                    )}
                  </Paper>
                </Grid>
              </Grid>

              <AuthErrorReport
                open={showAuthError}
                onClose={() => setShowAuthError(false)}
                error="Please log in to access the owner dashboard"
                onLogin={() => {
                  setShowAuthError(false);
                  navigate('/login');
                }}
              />
            </Container>
          }
        />
        <Route path="property/:propertyId" element={<PropertyDetails />} />
      </Routes>
    </ErrorBoundary>
  );
}