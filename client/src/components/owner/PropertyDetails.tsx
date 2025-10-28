import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../api/axios';
import { apiService } from '../../api';
import {
  Box,
  Container,
  Grid,
  Paper,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Card,
  CardContent,
  Divider,
  List,
  ListItem,
  ListItemText,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow
} from '@mui/material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import {
  Business as BusinessIcon,
  Payment as PaymentIcon,
  Build as BuildIcon,
  Person as PersonIcon,
  Home as HomeIcon
} from '@mui/icons-material';

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
  title: string;
  description: string;
  priority: string;
  status: string;
  estimatedCost: number;
  createdAt: string;
  propertyId: string;
}

interface Tenant {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  leaseStartDate: string;
  leaseEndDate: string;
  monthlyRent: number;
  status: string;
}

interface FinancialData {
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
  monthlyData: any[];
  recentTransactions: any[];
}

const PropertyDetails: React.FC = () => {
  const { propertyId } = useParams<{ propertyId: string }>();
  const navigate = useNavigate();
  const [property, setProperty] = useState<Property | null>(null);
  const [maintenanceRequests, setMaintenanceRequests] = useState<MaintenanceRequest[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [financialData, setFinancialData] = useState<FinancialData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { user } = useAuth();

  // Helpers for displaying lease period
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const getLeaseDurationMonths = (startStr: string, endStr: string) => {
    if (!startStr || !endStr) return '';
    const start = new Date(startStr);
    const end = new Date(endStr);
    let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    // Adjust if end day is before start day within the month
    if (end.getDate() < start.getDate()) months -= 1;
    return months > 0 ? `${months} mo` : '';
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (!user) {
          setError('User not authenticated');
          return;
        }

        const [propertyRes, maintenanceRes, financialRes] = await Promise.all([
          api.get(`/owners/properties/${propertyId}`),
          apiService.getOwnerMaintenanceRequestsPublic(user._id as string, (user as any).companyId),
          apiService.getOwnerFinancialData()
        ]);

        setProperty(propertyRes.data);
        
        // Filter maintenance requests for this property
        const propertyMaintenance = maintenanceRes.data.filter(
          (req: MaintenanceRequest) => req.propertyId === propertyId
        );
        setMaintenanceRequests(propertyMaintenance);

        // Filter financial data for this property
        if (financialRes.data?.success) {
          const propertyFinancial = financialRes.data.data.propertyBreakdown?.find(
            (prop: any) => prop.propertyId === propertyId
          );
          if (propertyFinancial) {
            setFinancialData({
              totalIncome: propertyFinancial.totalIncome || 0,
              totalExpenses: propertyFinancial.totalExpenses || 0,
              netIncome: propertyFinancial.netIncome || 0,
              monthlyData: propertyFinancial.monthlyData || [],
              recentTransactions: propertyFinancial.recentTransactions || []
            });
          }
        }

        // Fetch tenant data (you may need to implement this API endpoint)
        try {
          const tenantsRes = await api.get(`/owners/properties/${propertyId}/tenants`);
          setTenants(tenantsRes.data);
        } catch (err) {
          console.log('No tenant data available');
          setTenants([]);
        }

      } catch (err: any) {
        setError(err.response?.data?.error || 'Error fetching property details');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [propertyId]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  if (!property) {
    return (
      <Container>
        <Alert severity="error">Property not found</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h4" component="h1">
              <HomeIcon sx={{ mr: 2 }} />
              {property.name || 'Property Details'}
            </Typography>
            <Button variant="outlined" onClick={() => navigate('/owner-dashboard')}>
              Back to Dashboard
            </Button>
          </Box>
        </Grid>

        {error && (
          <Grid item xs={12}>
            <Alert severity="error">{error}</Alert>
          </Grid>
        )}

        {/* Property Address and Rent Section */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Box display="flex" alignItems="center" mb={2}>
              <BusinessIcon sx={{ mr: 1 }} />
              <Typography variant="h6">Property Information</Typography>
            </Box>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle1" color="text.secondary">Address</Typography>
                <Typography variant="h6">{property.address}</Typography>
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle1" color="text.secondary">Monthly Rent</Typography>
                <Typography variant="h6" color="primary.main">
                  ${property.rent ? property.rent.toLocaleString() : '0'}/month
                </Typography>
              </Grid>
              <Grid item xs={12} md={4}>
                <Typography variant="subtitle1" color="text.secondary">Type</Typography>
                <Typography variant="body1">{property.type || 'N/A'}</Typography>
              </Grid>
              <Grid item xs={12} md={4}>
                <Typography variant="subtitle1" color="text.secondary">Status</Typography>
                <Chip
                  label={property.status || 'unknown'}
                  color={property.status === 'available' ? 'success' : property.status === 'rented' ? 'primary' : 'warning'}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <Typography variant="subtitle1" color="text.secondary">Units</Typography>
                <Typography variant="body1">{property.units || 1} ({(property.occupiedUnits ?? (property.status === 'rented' ? 1 : 0))} occupied)</Typography>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        {/* Tenant Details Section */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Box display="flex" alignItems="center" mb={2}>
              <PersonIcon sx={{ mr: 1 }} />
              <Typography variant="h6">Tenant Details</Typography>
            </Box>
            {tenants.length > 0 ? (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Email</TableCell>
                      <TableCell>Phone</TableCell>
                      <TableCell>Lease Period</TableCell>
                      <TableCell>Monthly Rent</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tenants.map((tenant) => (
                      <TableRow key={tenant._id}>
                        <TableCell>{tenant.firstName} {tenant.lastName}</TableCell>
                        <TableCell>{tenant.email}</TableCell>
                        <TableCell>{tenant.phone}</TableCell>
                        <TableCell>
                          {formatDate(tenant.leaseStartDate)} → {formatDate(tenant.leaseEndDate)}
                          {tenant.leaseStartDate && tenant.leaseEndDate && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                              {getLeaseDurationMonths(tenant.leaseStartDate, tenant.leaseEndDate)}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          ${property?.rent ? property.rent.toLocaleString() : (tenant.monthlyRent?.toLocaleString() || '0')}
                        </TableCell>
                        <TableCell>
                          <Chip 
                            label={tenant.status} 
                            size="small"
                            color={tenant.status === 'active' ? 'success' : 'default'}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Typography variant="body1" color="text.secondary">
                No tenant information available for this property.
              </Typography>
            )}
          </Paper>
        </Grid>

        {/* Financial Data Section */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Box display="flex" alignItems="center" mb={2}>
              <PaymentIcon sx={{ mr: 1 }} />
              <Typography variant="h6">Financial Data</Typography>
            </Box>
            {financialData ? (
              <Grid container spacing={3}>
                <Grid item xs={12} md={4}>
                  <Card>
                    <CardContent>
                      <Typography variant="subtitle2" color="text.secondary">Total Income</Typography>
                      <Typography variant="h4" color="success.main">
                        ${financialData.totalIncome?.toLocaleString() || '0'}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Card>
                    <CardContent>
                      <Typography variant="subtitle2" color="text.secondary">Total Expenses</Typography>
                      <Typography variant="h4" color="error.main">
                        ${financialData.totalExpenses?.toLocaleString() || '0'}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Card>
                    <CardContent>
                      <Typography variant="subtitle2" color="text.secondary">Net Income</Typography>
                      <Typography variant="h4" color="primary.main">
                        ${financialData.netIncome?.toLocaleString() || '0'}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            ) : (
              <Typography variant="body1" color="text.secondary">
                No financial data available for this property.
              </Typography>
            )}
          </Paper>
        </Grid>

        {/* Maintenance Data Section */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Box display="flex" alignItems="center" mb={2}>
              <BuildIcon sx={{ mr: 1 }} />
              <Typography variant="h6">Maintenance Data</Typography>
            </Box>
            {maintenanceRequests.length > 0 ? (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Title</TableCell>
                      <TableCell>Description</TableCell>
                      <TableCell>Priority</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Estimated Cost</TableCell>
                      <TableCell>Created</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {maintenanceRequests.map((request) => (
                      <TableRow key={request._id}>
                        <TableCell>{request.title}</TableCell>
                        <TableCell>{request.description}</TableCell>
                        <TableCell>
                          <Chip 
                            label={request.priority} 
                            size="small"
                            color={request.priority === 'high' ? 'error' : request.priority === 'medium' ? 'warning' : 'default'}
                          />
                        </TableCell>
                        <TableCell>
                          <Chip 
                            label={request.status} 
                            size="small"
                            color={request.status === 'completed' ? 'success' : request.status === 'in_progress' ? 'primary' : 'default'}
                          />
                        </TableCell>
                        <TableCell>${request.estimatedCost?.toLocaleString() || '0'}</TableCell>
                        <TableCell>{new Date(request.createdAt).toLocaleDateString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Typography variant="body1" color="text.secondary">
                No maintenance requests for this property.
              </Typography>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
};

export default PropertyDetails; 