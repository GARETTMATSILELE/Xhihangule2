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
  Skeleton
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
  propertyId: string; // Changed from object to string to match backend
  propertyName?: string; // Optional field for populated property name
  propertyAddress?: string; // Optional field for populated property address
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  estimatedCost: number;
  createdAt: string;
}

interface ChartData {
  occupancy?: any[];
  payment?: any[];
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
        const chartTypes = ['occupancy', 'revenue', 'maintenance'];
        const newChartData: ChartData = {};
        const newChartErrors: {[key: string]: string} = {};

        for (const type of chartTypes) {
          try {
            const chartResponse = await getChartData(type);
            if (isMounted) {
              if (type === 'occupancy') {
                newChartData.occupancy = chartResponse.data;
              } else if (type === 'revenue') {
                newChartData.payment = chartResponse.data;
              } else if (type === 'maintenance') {
                newChartData.maintenance = chartResponse.data;
              }
            }
          } catch (err: any) {
            console.error(`Error fetching ${type} chart data:`, err);
            if (isMounted) {
              newChartErrors[type] = err.response?.data?.message || `Failed to load ${type} data`;
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
  }, [isAuthenticated, cleanup]);

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
  const totalRentCollected = properties.reduce((sum, property) => sum + (property.totalRentCollected || 0), 0);
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
                            <Typography variant="body2">
                              Status: <Chip 
                                label={property.status || 'unknown'} 
                                size="small" 
                                color={property.status === 'available' ? 'success' : property.status === 'rented' ? 'primary' : 'warning'} 
                              />
                            </Typography>
                            <Typography variant="body2">
                              Type: {property.type || 'N/A'}
                            </Typography>
                            <Typography variant="body2">
                              Rent: ${property.rent ? property.rent.toLocaleString() : '0'}/month
                            </Typography>
                            <Typography variant="body2">
                              Occupancy Rate: {property.occupancyRate || 0}%
                            </Typography>
                            <Typography variant="body2">
                              Total Rent Collected: ${(property.totalRentCollected || 0).toLocaleString()}
                            </Typography>
                            <Typography variant="body2">
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
                  <Box sx={{ height: 400 }}>
                    <Typography variant="h6" gutterBottom>
                      Property Performance Overview
                    </Typography>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={properties}>
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

                  {/* Occupancy Trend Chart */}
                  {chartData?.occupancy && !chartErrors.occupancy && (
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
                        <Typography variant="h4">${totalRentCollected.toLocaleString()}</Typography>
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
                        <Typography variant="h4" color={totalRentCollected - totalArrears >= 0 ? 'success' : 'error'}>
                          ${(totalRentCollected - totalArrears).toLocaleString()}
                        </Typography>
                      </Paper>
                    </Grid>
                  </Grid>

                  {/* Income vs Expenses Chart */}
                  {chartData?.payment && !chartErrors.payment && (
                    <Box sx={{ height: 400 }}>
                      <Typography variant="h6" gutterBottom>Income vs Expenses</Typography>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData.payment}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="income" fill="#8884d8" name="Income" />
                          <Bar dataKey="expenses" fill="#82ca9d" name="Expenses" />
                        </BarChart>
                      </ResponsiveContainer>
                    </Box>
                  )}
                  {chartErrors.payment && (
                    <Box sx={{ mt: 4 }}>
                      <Alert severity="warning">
                        Unable to load payment data: {chartErrors.payment}
                      </Alert>
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
                            <Typography variant="body2">
                              Priority: <Chip 
                                label={request.priority} 
                                size="small" 
                                color={request.priority === 'high' ? 'error' : request.priority === 'medium' ? 'warning' : 'success'} 
                              />
                            </Typography>
                            <Typography variant="body2">
                              Status: <Chip 
                                label={request.status} 
                                size="small" 
                                color={request.status === 'completed' ? 'success' : request.status === 'in_progress' ? 'primary' : 'default'} 
                              />
                            </Typography>
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
                  {chartData?.maintenance && !chartErrors.maintenance && (
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