import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Radio,
  RadioGroup,
  FormLabel,
  Divider,
  Alert,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  SelectChangeEvent,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { useCompany } from '../../contexts/CompanyContext';
import { useAuth } from '../../contexts/AuthContext';
import { useProperties } from '../../contexts/PropertyContext';
import { useTenantService } from '../../services/tenantService';
import paymentService from '../../services/paymentService';
import { Property } from '../../types/property';
import { Tenant } from '../../types/tenant';
import { Payment, PaymentFormData, Currency } from '../../types/payment';
import { DatabaseService } from '../../services/databaseService';

interface Agent {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'agent';
  companyId: string;
  isActive: boolean;
}

const PaymentsPage: React.FC = () => {
  const { company } = useCompany();
  const { user } = useAuth();
  const { properties, loading: propertiesLoading, refreshProperties } = useProperties();
  const tenantService = useTenantService();
  const db = DatabaseService.getInstance();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorSource, setErrorSource] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [formData, setFormData] = useState<PaymentFormData>({
    paymentType: 'rental',
    propertyType: 'residential',
    propertyId: '',
    tenantId: '',
    agentId: '',
    paymentDate: new Date(),
    paymentMethod: 'cash',
    amount: 0,
    depositAmount: 0,
    referenceNumber: '',
    notes: '',
    currency: 'USD',
    leaseId: '',
    companyId: company?._id || '',
    rentalPeriodMonth: new Date().getMonth() + 1,
    rentalPeriodYear: new Date().getFullYear(),
  });

  useEffect(() => {
    if (company?._id) {
      setFormData(prev => ({
        ...prev,
        companyId: company._id,
      }));
    }
  }, [company]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setErrorSource(null);

    try {
      if (!db.getConnectionStatus()) {
        setError('Database connection is not available. Please try again later.');
        setErrorSource('Database Connection');
        return;
      }

      await refreshProperties();

      // Fetch tenants
      try {
        const tenantsResponse = await tenantService.getAllPublic();
        setTenants(tenantsResponse.tenants || []);
      } catch (err: any) {
        console.error('Failed to fetch tenants:', err);
        setError('Failed to fetch tenants: ' + (err.message || 'Unknown error'));
        setErrorSource('Tenants');
      }

      // Fetch agents
      try {
        const agentsResponse = await paymentService.getAgentsPublic(company?._id);
        setAgents(agentsResponse);
      } catch (err: any) {
        console.error('Failed to fetch agents:', err);
        setError('Failed to fetch agents: ' + (err.message || 'Unknown error'));
        setErrorSource('Agents');
      }

      // Fetch payments
      try {
        const paymentsResponse = await paymentService.getPaymentsAccountant();
        setPayments(paymentsResponse || []);
      } catch (err: any) {
        console.error('Failed to fetch payments:', err);
        setError('Failed to fetch payments: ' + (err.message || 'Unknown error'));
        setErrorSource('Payments');
      }
    } catch (error: any) {
      console.error('Error in fetchData:', error);
      setError(error.message || 'Failed to fetch data. Please try again.');
      setErrorSource('General');
    } finally {
      setLoading(false);
    }
  }, [refreshProperties, tenantService, db]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | { name?: string; value: unknown }> | SelectChangeEvent) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name as string]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      setErrorSource(null);
      setSuccess(null);

      if (!db.getConnectionStatus()) {
        setError('Database connection is not available. Please try again later.');
        setErrorSource('Database Connection');
        return;
      }

      if (!company?._id) {
        setError('Company ID is required');
        setErrorSource('Company');
        return;
      }

      const paymentData = {
        ...formData,
        companyId: company._id,
        processedBy: user?._id,
      };

      await paymentService.createPaymentAccountant(paymentData);
      setSuccess('Payment processed successfully');
      
      // Reset form
      setFormData({
        paymentType: 'rental',
        propertyType: 'residential',
        propertyId: '',
        tenantId: '',
        agentId: '',
        paymentDate: new Date(),
        paymentMethod: 'cash',
        amount: 0,
        depositAmount: undefined,
        referenceNumber: '',
        notes: '',
        currency: 'USD',
        leaseId: '',
        companyId: company._id,
        rentalPeriodMonth: new Date().getMonth() + 1,
        rentalPeriodYear: new Date().getFullYear(),
      });

      // Refresh data without reloading
      await fetchData();
    } catch (error: any) {
      console.error('Error processing payment:', error);
      setError(error.message || 'Failed to process payment');
      setErrorSource('Payment Submission');
    } finally {
      setLoading(false);
    }
  };

  if (loading || propertiesLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box p={3}>
      <Typography variant="h4" gutterBottom>
        Process Payment
      </Typography>

      {error && (
        <Alert 
          severity="error" 
          sx={{ 
            mb: 2,
            '& .MuiAlert-message': {
              display: 'flex',
              flexDirection: 'column',
              gap: 1
            }
          }}
        >
          <Typography variant="body1">{error}</Typography>
          {errorSource && (
            <Typography variant="caption" color="error">
              Error Source: {errorSource}
            </Typography>
          )}
          {errorSource === 'Database Connection' && (
            <Button 
              variant="outlined" 
              size="small" 
              onClick={() => fetchData()}
              sx={{ mt: 1 }}
            >
              Retry Connection
            </Button>
          )}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <form onSubmit={handleSubmit}>
                <Grid container spacing={3}>
                  <Grid item xs={12}>
                    <FormControl component="fieldset">
                      <FormLabel component="legend">Payment Type</FormLabel>
                      <RadioGroup
                        row
                        name="paymentType"
                        value={formData.paymentType}
                        onChange={handleInputChange}
                      >
                        <FormControlLabel
                          value="introduction"
                          control={<Radio />}
                          label="Introduction"
                        />
                        <FormControlLabel
                          value="rental"
                          control={<Radio />}
                          label="Rental"
                        />
                      </RadioGroup>
                    </FormControl>
                  </Grid>

                  <Grid item xs={12}>
                    <FormControl component="fieldset">
                      <FormLabel component="legend">Property Type</FormLabel>
                      <RadioGroup
                        row
                        name="propertyType"
                        value={formData.propertyType}
                        onChange={handleInputChange}
                      >
                        <FormControlLabel
                          value="residential"
                          control={<Radio />}
                          label="Residential"
                        />
                        <FormControlLabel
                          value="commercial"
                          control={<Radio />}
                          label="Commercial"
                        />
                      </RadioGroup>
                    </FormControl>
                  </Grid>

                  <Grid item xs={12}>
                    <FormControl fullWidth>
                      <InputLabel>Property</InputLabel>
                      <Select
                        name="propertyId"
                        value={formData.propertyId}
                        onChange={handleInputChange}
                        label="Property"
                        required
                      >
                        {properties && properties.length > 0 ? (
                          properties.map((property) => (
                            <MenuItem key={property._id} value={property._id}>
                              {property.name} - {property.address}
                            </MenuItem>
                          ))
                        ) : (
                          <MenuItem disabled>No properties available</MenuItem>
                        )}
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid item xs={12}>
                    <FormControl fullWidth>
                      <InputLabel>Tenant</InputLabel>
                      <Select
                        name="tenantId"
                        value={formData.tenantId}
                        onChange={handleInputChange}
                        required
                      >
                        {tenants.map((tenant) => (
                          <MenuItem key={tenant._id} value={tenant._id}>
                            {tenant.firstName} {tenant.lastName}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid item xs={12}>
                    <FormControl fullWidth>
                      <InputLabel>Agent</InputLabel>
                      <Select
                        name="agentId"
                        value={formData.agentId}
                        onChange={handleInputChange}
                        required
                      >
                        {agents.map((agent) => (
                          <MenuItem key={agent._id} value={agent._id}>
                            {agent.firstName} {agent.lastName}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid item xs={12}>
                    <LocalizationProvider dateAdapter={AdapterDateFns}>
                      <DatePicker
                        label="Payment Date"
                        value={formData.paymentDate}
                        onChange={(date) => setFormData(prev => ({ ...prev, paymentDate: date }))}
                      />
                    </LocalizationProvider>
                  </Grid>

                  <Grid item xs={12}>
                    <FormControl fullWidth>
                      <InputLabel>Payment Method</InputLabel>
                      <Select
                        name="paymentMethod"
                        value={formData.paymentMethod}
                        onChange={handleInputChange}
                        required
                      >
                        <MenuItem value="cash">Cash</MenuItem>
                        <MenuItem value="bank_transfer">Bank Transfer</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Amount"
                      type="number"
                      name="amount"
                      value={formData.amount}
                      onChange={handleInputChange}
                      required
                    />
                  </Grid>

                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Deposit Amount"
                      type="number"
                      name="depositAmount"
                      value={formData.depositAmount}
                      onChange={handleInputChange}
                      required
                    />
                  </Grid>

                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Reference Number"
                      name="referenceNumber"
                      value={formData.referenceNumber}
                      onChange={handleInputChange}
                      required
                    />
                  </Grid>

                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Notes"
                      name="notes"
                      value={formData.notes}
                      onChange={handleInputChange}
                      multiline
                      rows={4}
                    />
                  </Grid>

                  <Grid item xs={12}>
                    <Button
                      type="submit"
                      variant="contained"
                      color="primary"
                      fullWidth
                      disabled={loading || !db.getConnectionStatus()}
                    >
                      Process Payment
                    </Button>
                  </Grid>
                </Grid>
              </form>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Recent Payments
              </Typography>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Date</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Amount</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {payments.length > 0 ? (
                      payments.map((payment) => (
                        <TableRow key={payment._id}>
                          <TableCell>{new Date(payment.paymentDate).toLocaleDateString()}</TableCell>
                          <TableCell>{payment.paymentType}</TableCell>
                          <TableCell>${payment.amount || 0}</TableCell>
                          <TableCell>{payment.status}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} align="center">
                          <Typography variant="body2" color="textSecondary">
                            No payments found
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default PaymentsPage; 