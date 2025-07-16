import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useCompany } from '../../contexts/CompanyContext';
import api from '../../api/axios';
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
  TableBody
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
  Cell
} from 'recharts';
import {
  Business as BusinessIcon,
  Payment as PaymentIcon,
  Build as BuildIcon,
  Assessment as AssessmentIcon,
  Add as AddIcon
} from '@mui/icons-material';
import { AuthErrorReport } from '../AuthErrorReport';
import { getChartData } from '../../services/chartService';
import ErrorBoundary from '../common/ErrorBoundary';

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
}

interface MaintenanceRequest {
  _id: string;
  propertyId: string;
  propertyName?: string;
  propertyAddress?: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  estimatedCost: number;
  createdAt: string;
}

interface ChartData {
  occupancy?: any[];
  payment?: {
    data: any[];
    summary?: {
      totalPayments: number;
      totalAmount: number;
      averageAmount: number;
    };
    recentPayments?: any[];
  };
  maintenance?: any[];
}

interface LoadingStates {
  properties: boolean;
  maintenance: boolean;
  charts: boolean;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

const OwnerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { logout, isAuthenticated } = useAuth();
  const { company } = useCompany();
  const [activeTab, setActiveTab] = useState(0);
  const [properties, setProperties] = useState<Property[]>([]);
  const [maintenanceRequests, setMaintenanceRequests] = useState<MaintenanceRequest[]>([]);
  const [chartData, setChartData] = useState<ChartData>({});
  const [loading, setLoading] = useState<LoadingStates>({
    properties: true,
    maintenance: true,
    charts: true
  });
  const [error, setError] = useState('');
  const [showAuthError, setShowAuthError] = useState(false);
  const [chartErrors, setChartErrors] = useState<{[key: string]: string}>({});

  // Cleanup function to prevent memory leaks
  const cleanup = useCallback(() => {
    setProperties([]);
    setMaintenanceRequests([]);
    setChartData({});
    setError('');
    setChartErrors({});
  }, []);

  // Helper function to transform property data for charts
  const transformPropertyDataForCharts = useCallback((properties: Property[]) => {
    return properties.map(property => ({
      name: property.name || 'Unnamed Property',
      occupancyRate: property.occupancyRate || 0,
      totalRentCollected: property.totalRentCollected || 0,
      currentArrears: property.currentArrears || 0,
      units: property.units || 1,
      occupiedUnits: property.occupiedUnits || 0,
      vacantUnits: Math.max(0, (property.units || 1) - (property.occupiedUnits || 0))
    }));
  }, []);

  // Helper function to transform maintenance data for charts
  const transformMaintenanceDataForCharts = useCallback((requests: MaintenanceRequest[]) => {
    const statusCounts = {
      pending: requests.filter(req => req.status === 'pending').length,
      in_progress: requests.filter(req => req.status === 'in_progress').length,
      completed: requests.filter(req => req.status === 'completed').length,
      cancelled: requests.filter(req => req.status === 'cancelled').length
    };

    return [
      { name: 'Pending', value: statusCounts.pending },
      { name: 'In Progress', value: statusCounts.in_progress },
      { name: 'Completed', value: statusCounts.completed },
      { name: 'Cancelled', value: statusCounts.cancelled }
    ].filter(item => item.value > 0); // Only show categories with data
  }, []);

  useEffect(() => {
    let isMounted = true;
    let timeoutId: NodeJS.Timeout;

    const fetchData = async () => {
      try {
        // Wait for user data to be available in localStorage
        const userStr = localStorage.getItem('user');
        if (!userStr) {
          console.log('User data not available yet, waiting...');
          // Wait a bit and try again, but only if component is still mounted
          if (isMounted) {
            timeoutId = setTimeout(() => {
              if (isMounted) {
                fetchData();
              }
            }, 1000);
          }
          return;
        }
        
        const user = JSON.parse(userStr);
        console.log('OwnerDashboard: User data available:', user);
        
        // Fetch properties and maintenance requests
        const [propertiesRes, maintenanceRes] = await Promise.all([
          api.get('/owners/properties'),
          api.get('/owners/maintenance-requests')
        ]);
        
        if (isMounted) {
          setProperties(propertiesRes.data);
          setMaintenanceRequests(maintenanceRes.data);
          setLoading(prev => ({ ...prev, properties: false, maintenance: false }));
        }

        // Fetch chart data individually with error handling
        const chartTypes = ['occupancy', 'payment', 'maintenance'];
        const newChartData: ChartData = {};
        const newChartErrors: {[key: string]: string} = {};

        for (const type of chartTypes) {
          try {
            const chartResponse = await getChartData(type);
            console.log(`OwnerDashboard: ${type} chart response:`, chartResponse);
            if (isMounted) {
              if (type === 'occupancy') {
                // Transform the occupancy data to match chart expectations
                if (chartResponse.data && Array.isArray(chartResponse.data)) {
                newChartData.occupancy = chartResponse.data;
                } else {
                  // Fallback: create occupancy data from properties
                  const transformedData = transformPropertyDataForCharts(propertiesRes.data);
                  newChartData.occupancy = transformedData.map(prop => ({
                    name: prop.name,
                    occupied: prop.occupiedUnits,
                    vacant: prop.vacantUnits
                  }));
                }
              } else if (type === 'payment') {
                // The payment endpoint returns the entire object with data, summary, and recentPayments
                newChartData.payment = chartResponse;
                console.log(`OwnerDashboard: Payment data set:`, newChartData.payment);
              } else if (type === 'maintenance') {
                // Transform the maintenance data to match chart expectations
                if (chartResponse.data && Array.isArray(chartResponse.data)) {
                newChartData.maintenance = chartResponse.data;
                } else {
                  // Fallback: create maintenance data from maintenance requests
                  newChartData.maintenance = transformMaintenanceDataForCharts(maintenanceRes.data);
                }
              }
            }
          } catch (err: any) {
            console.error(`Error fetching ${type} chart data:`, err);
            if (isMounted) {
              newChartErrors[type] = err.response?.data?.message || `Failed to load ${type} data`;
              
              // Provide fallback data for charts
              if (type === 'occupancy') {
                const transformedData = transformPropertyDataForCharts(propertiesRes.data);
                newChartData.occupancy = transformedData.map(prop => ({
                  name: prop.name,
                  occupied: prop.occupiedUnits,
                  vacant: prop.vacantUnits
                }));
              } else if (type === 'maintenance') {
                newChartData.maintenance = transformMaintenanceDataForCharts(maintenanceRes.data);
              }
            }
          }
        }

        if (isMounted) {
          setChartData(newChartData);
          setChartErrors(newChartErrors);
          setLoading(prev => ({ ...prev, charts: false }));
        }
      } catch (err: any) {
        console.error('OwnerDashboard fetchData error:', err);
        if (isMounted) {
          setError(err.response?.data?.message || 'Error fetching data');
          setLoading(prev => ({ ...prev, properties: false, maintenance: false, charts: false }));
        }
      }
    };

    // Only fetch data if authenticated
    if (isAuthenticated) {
      fetchData();
    }

    // Cleanup function
    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      cleanup();
    };
  }, [isAuthenticated, cleanup, transformPropertyDataForCharts, transformMaintenanceDataForCharts]);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  const handleLogout = async () => {
    try {
      await logout();
      // Navigation will be handled by the AuthContext
    } catch (error) {
      console.error('Logout failed:', error);
      setShowAuthError(true);
    }
  };

  const handleLogin = () => {
    setShowAuthError(true);
  };

  // Calculate summary statistics with proper validation
  const totalProperties = properties.length;
  const occupiedUnits = properties.reduce((sum, property) => sum + (property.occupiedUnits || 0), 0);
  const totalUnits = properties.reduce((sum, property) => sum + (property.units || 1), 0);
  const vacantUnits = Math.max(0, totalUnits - occupiedUnits);
  
  // Get total rent collected from payment data (same source as chart) for consistency
  const totalRentCollected = chartData?.payment?.summary?.totalAmount || 0;
  
  // Fallback to property data if payment data is not available
  const totalRentCollectedFromProperties = properties.reduce((sum, property) => sum + (property.totalRentCollected || 0), 0);
  const finalTotalRentCollected = totalRentCollected > 0 ? totalRentCollected : totalRentCollectedFromProperties;
  
  const totalArrears = properties.reduce((sum, property) => sum + (property.currentArrears || 0), 0);
  const pendingMaintenance = maintenanceRequests.filter(req => req.status === 'pending').length;
  const completedMaintenance = maintenanceRequests.filter(req => req.status === 'completed').length;

  // Check if any data is still loading
  const isAnyLoading = Object.values(loading).some(Boolean);

  if (isAnyLoading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Typography variant="h4" component="h1">
                {company?.name || 'Property'} Owner Dashboard
              </Typography>
              <Button variant="outlined" color="primary" onClick={handleLogout}>
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
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Typography variant="h4" component="h1">
                {company?.name || 'Property'} Owner Dashboard
              </Typography>
              <Button variant="outlined" color="primary" onClick={handleLogout}>
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
            <Paper sx={{ p: 2 }}>
              <Tabs value={activeTab} onChange={handleTabChange} aria-label="dashboard tabs">
                <Tab label="Properties" icon={<BusinessIcon />} iconPosition="start" />
                <Tab label="Payments" icon={<PaymentIcon />} iconPosition="start" />
                <Tab label="Maintenance" icon={<BuildIcon />} iconPosition="start" />
                <Tab label="Reports" icon={<AssessmentIcon />} iconPosition="start" />
              </Tabs>

              {/* Properties Tab */}
              {activeTab === 0 && (
                <Box sx={{ mt: 2 }}>
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                    <Typography variant="h6">Properties Management</Typography>
                    <Button variant="contained" startIcon={<AddIcon />}>
                      Add New Property
                    </Button>
                  </Box>
                  <Divider sx={{ mb: 3 }} />
                  
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
                      <Grid item xs={12} md={6} lg={4} key={property._id}>
                        <Card>
                          <CardContent>
                            <Typography variant="h6" gutterBottom>
                              {property.name || 'Unnamed Property'}
                            </Typography>
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
                                color={property.status === 'available' ? 'success' : property.status === 'rented' ? 'primary' : 'warning'} 
                              />
                            </Box>
                            <Typography variant="body2" sx={{ mb: 1 }}>
                              Type: {property.type || 'N/A'}
                            </Typography>
                            <Typography variant="body2" sx={{ mb: 1 }}>
                              Rent: ${property.rent ? property.rent.toLocaleString() : '0'}/month
                            </Typography>
                            <Typography variant="body2" sx={{ mb: 1 }}>
                              Occupancy Rate: {property.occupancyRate || 0}%
                            </Typography>
                            <Typography variant="body2" sx={{ mb: 1 }}>
                              Total Rent Collected: ${(property.totalRentCollected || 0).toLocaleString()}
                            </Typography>
                            <Typography variant="body2" sx={{ mb: 1 }}>
                              Current Arrears: ${(property.currentArrears || 0).toLocaleString()}
                            </Typography>
                          </CardContent>
                          <CardActions>
                            <Button
                              size="small"
                              onClick={() => navigate(`/properties/${property._id}`)}
                            >
                              View Details
                            </Button>
                          </CardActions>
                        </Card>
                      </Grid>
                    ))}
                  </Grid>

                  {/* Property Performance Chart */}
                  {properties.length > 0 && (
                    <Box sx={{ height: 400, mb: 4 }}>
                    <Typography variant="h6" gutterBottom>
                      Property Performance Overview
                    </Typography>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={transformPropertyDataForCharts(properties)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="occupancyRate" name="Occupancy Rate (%)" fill="#8884d8" />
                        <Bar dataKey="totalRentCollected" name="Total Rent Collected ($)" fill="#82ca9d" />
                      </BarChart>
                    </ResponsiveContainer>
                  </Box>
                  )}

                  {/* Occupancy Trend Chart */}
                  {chartData?.occupancy && chartData.occupancy.length > 0 && !chartErrors.occupancy && (
                    <Box sx={{ height: 400, mt: 4 }}>
                      <Typography variant="h6" gutterBottom>
                        Occupancy Trend
                      </Typography>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData.occupancy}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Line type="monotone" dataKey="occupied" stroke="#8884d8" name="Occupied Units" />
                          <Line type="monotone" dataKey="vacant" stroke="#82ca9d" name="Vacant Units" />
                        </LineChart>
                      </ResponsiveContainer>
                    </Box>
                  )}
                  {chartErrors.occupancy && (
                    <Box sx={{ mt: 4 }}>
                      <Alert severity="warning">
                        Unable to load occupancy trend data: {chartErrors.occupancy}
                      </Alert>
                    </Box>
                  )}
                </Box>
              )}

              {/* Payments Tab */}
              {activeTab === 1 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="h6" gutterBottom>Payment Overview</Typography>
                  <Divider sx={{ mb: 3 }} />
                  
                  {/* Payment Summary Cards */}
                  <Grid container spacing={3} sx={{ mb: 4 }}>
                    <Grid item xs={12} md={6} lg={4}>
                      <Paper sx={{ p: 2 }}>
                        <Typography variant="subtitle1">Total Rent Collected</Typography>
                        <Typography variant="h4">${finalTotalRentCollected.toLocaleString()}</Typography>
                        {totalRentCollected > 0 && (
                          <Typography variant="caption" color="textSecondary">
                            From payment records
                          </Typography>
                        )}
                      </Paper>
                    </Grid>
                    <Grid item xs={12} md={6} lg={4}>
                      <Paper sx={{ p: 2 }}>
                        <Typography variant="subtitle1">Current Arrears</Typography>
                        <Typography variant="h4" color="error">${totalArrears.toLocaleString()}</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={12} md={6} lg={4}>
                      <Paper sx={{ p: 2 }}>
                        <Typography variant="subtitle1">Net Income</Typography>
                        <Typography variant="h4" color={finalTotalRentCollected - totalArrears >= 0 ? 'success' : 'error'}>
                          ${(finalTotalRentCollected - totalArrears).toLocaleString()}
                        </Typography>
                      </Paper>
                    </Grid>
                  </Grid>

                  {/* Monthly Payment Trends Chart */}
                  {chartData?.payment?.data && chartData.payment.data.length > 0 && !chartErrors.payment ? (
                      <Box sx={{ height: 400, mb: 4 }}>
                        <Typography variant="h6" gutterBottom>Monthly Payment Trends</Typography>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chartData.payment.data}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="month" />
                            <YAxis />
                            <Tooltip formatter={(value) => [`$${value}`, 'Amount']} />
                            <Legend />
                            <Line type="monotone" dataKey="amount" stroke="#8884d8" name="Payment Amount" />
                          </LineChart>
                        </ResponsiveContainer>
                      </Box>
                  ) : null}
                  {chartErrors.payment && (
                    <Box sx={{ mt: 4 }}>
                      <Alert severity="warning">
                        Unable to load payment data: {chartErrors.payment}
                      </Alert>
                    </Box>
                  )}

                  {/* Debug: Show when no payment data */}
                  {!chartData?.payment?.data && !chartErrors.payment && (
                    <Box sx={{ mt: 4 }}>
                      <Alert severity="info">
                        No payment data available. This might be because there are no rental payments for your properties yet.
                        Total rent collected is calculated from property records as a fallback.
                      </Alert>
                    </Box>
                  )}

                  {/* Data source indicator */}
                  {totalRentCollected > 0 && totalRentCollectedFromProperties > 0 && Math.abs(totalRentCollected - totalRentCollectedFromProperties) > 1 && (
                    <Box sx={{ mt: 2 }}>
                      <Alert severity="info">
                        <Typography variant="body2">
                          <strong>Data Source Note:</strong> Total rent collected is calculated from actual payment records ({totalRentCollected.toLocaleString()}) 
                          rather than property summary data ({totalRentCollectedFromProperties.toLocaleString()}) for accuracy.
                        </Typography>
                      </Alert>
                    </Box>
                  )}

                  {/* Recent Payments Table */}
                  {chartData?.payment?.recentPayments && chartData.payment.recentPayments.length > 0 && (
                    <Box sx={{ mt: 4 }}>
                      <Typography variant="h6" gutterBottom>Recent Payments</Typography>
                      <TableContainer component={Paper}>
                        <Table>
                          <TableHead>
                            <TableRow>
                              <TableCell>Date</TableCell>
                              <TableCell>Property</TableCell>
                              <TableCell>Tenant</TableCell>
                              <TableCell>Amount</TableCell>
                              <TableCell>Status</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {chartData.payment.recentPayments.map((payment: any) => (
                              <TableRow key={payment.id}>
                                <TableCell>
                                  {new Date(payment.paymentDate).toLocaleDateString()}
                                </TableCell>
                                <TableCell>{payment.propertyName}</TableCell>
                                <TableCell>{payment.tenantName}</TableCell>
                                <TableCell>${(payment.amount || 0).toFixed(2)}</TableCell>
                                <TableCell>
                                  <Chip
                                    label={payment.status || 'unknown'}
                                    color={payment.status === 'completed' ? 'success' : 'warning'}
                                    size="small"
                                  />
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </Box>
                  )}
                </Box>
              )}

              {/* Maintenance Tab */}
              {activeTab === 2 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="h6" gutterBottom>Maintenance Overview</Typography>
                  <Divider sx={{ mb: 3 }} />
                  
                  {/* Maintenance Summary Cards */}
                  <Grid container spacing={3} sx={{ mb: 4 }}>
                    <Grid item xs={12} md={6} lg={4}>
                      <Paper sx={{ p: 2 }}>
                        <Typography variant="subtitle1">Total Requests</Typography>
                        <Typography variant="h4">{maintenanceRequests.length}</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={12} md={6} lg={4}>
                      <Paper sx={{ p: 2 }}>
                        <Typography variant="subtitle1">Pending Requests</Typography>
                        <Typography variant="h4" color="warning.main">{pendingMaintenance}</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={12} md={6} lg={4}>
                      <Paper sx={{ p: 2 }}>
                        <Typography variant="subtitle1">Completed</Typography>
                        <Typography variant="h4" color="success.main">{completedMaintenance}</Typography>
                      </Paper>
                    </Grid>
                  </Grid>

                  {/* Maintenance Requests List */}
                  <Grid container spacing={3} sx={{ mb: 4 }}>
                    {maintenanceRequests.map((request) => (
                      <Grid item xs={12} md={6} key={request._id}>
                        <Card>
                          <CardContent>
                            <Typography variant="h6" gutterBottom>
                              {request.title || 'Untitled Request'}
                            </Typography>
                            <Typography color="textSecondary" gutterBottom>
                              Property: {request.propertyName || 'Unknown Property'}
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                              <Typography variant="body2" component="span">
                                Priority:
                              </Typography>
                              <Chip 
                                label={request.priority} 
                                size="small" 
                                color={request.priority === 'high' ? 'error' : request.priority === 'medium' ? 'warning' : 'success'} 
                              />
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                              <Typography variant="body2" component="span">
                                Status:
                            </Typography>
                              <Chip 
                                label={request.status} 
                                size="small" 
                                color={request.status === 'completed' ? 'success' : request.status === 'in_progress' ? 'primary' : 'default'} 
                              />
                            </Box>
                            <Typography variant="body2">
                              Estimated Cost: ${(request.estimatedCost || 0).toLocaleString()}
                            </Typography>
                            <Typography variant="body2" sx={{ mt: 1 }}>
                              {request.description || 'No description provided'}
                            </Typography>
                          </CardContent>
                          <CardActions>
                            <Button
                              size="small"
                              onClick={() => navigate(`/maintenance/${request._id}`)}
                            >
                              View Details
                            </Button>
                          </CardActions>
                        </Card>
                      </Grid>
                    ))}
                  </Grid>

                  {/* Maintenance by Category Chart */}
                  {chartData?.maintenance && chartData.maintenance.length > 0 && !chartErrors.maintenance && (
                    <Box sx={{ height: 400 }}>
                      <Typography variant="h6" gutterBottom>Maintenance by Category</Typography>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={chartData.maintenance}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                            outerRadius={150}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {chartData.maintenance.map((entry: any, index: number) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </Box>
                  )}
                  {chartErrors.maintenance && (
                    <Box sx={{ mt: 4 }}>
                      <Alert severity="warning">
                        Unable to load maintenance data: {chartErrors.maintenance}
                      </Alert>
                    </Box>
                  )}
                </Box>
              )}

              {/* Reports Tab */}
              {activeTab === 3 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="h6" gutterBottom>Financial Reports</Typography>
                  <Divider sx={{ mb: 3 }} />
                  <Grid container spacing={2}>
                    <Grid item>
                      <Button variant="outlined">Income Statement</Button>
                    </Grid>
                    <Grid item>
                      <Button variant="outlined">Expense Report</Button>
                    </Grid>
                    <Grid item>
                      <Button variant="outlined">Occupancy Report</Button>
                    </Grid>
                    <Grid item>
                      <Button variant="outlined">Maintenance Report</Button>
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
    </ErrorBoundary>
  );
};

export default OwnerDashboard; 