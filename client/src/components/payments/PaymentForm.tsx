import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Grid,
  Card,
  CardContent,
  Container,
  TextField,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  SelectChangeEvent,
  Paper,
  Snackbar,
} from '@mui/material';
import paymentService from '../../services/paymentService';
import { usePropertyService } from '../../services/propertyService';
import { Payment, PaymentStatus, PaymentMethod, Currency, PAYMENT_METHODS, SUPPORTED_CURRENCIES } from '../../types/payment';
import { Tenant } from '../../types/tenant';
import { Property } from '../../types/property';
import { PaymentFormData } from '../../types/payment';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import publicApi from '../../api/publicApi';

export interface PaymentFormProps {
  onSubmit: (data: PaymentFormData) => Promise<void>;
  onCancel: () => void;
  initialData?: Payment;
  properties: Property[];
  tenants: Tenant[];
  loading?: boolean;
}

const PaymentForm: React.FC<PaymentFormProps> = ({
  onSubmit,
  onCancel,
  initialData,
  properties,
  tenants,
  loading = false,
}) => {
  const propertyService = usePropertyService();
  const [error, setError] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [agents, setAgents] = useState<any[]>([]);
  const [formData, setFormData] = useState<PaymentFormData>({
    paymentType: initialData?.paymentType || 'rental',
    propertyType: initialData?.propertyType || 'residential',
    propertyId: initialData?.propertyId || '',
    tenantId: initialData?.tenantId || '',
    agentId: initialData?.agentId || '',
    paymentDate: initialData?.paymentDate ? new Date(initialData.paymentDate) : new Date(),
    paymentMethod: initialData?.paymentMethod || 'cash',
    amount: initialData?.amount || 0,
    depositAmount: initialData?.depositAmount || 0,
    referenceNumber: initialData?.referenceNumber || '',
    notes: initialData?.notes || '',
    currency: initialData?.currency || 'USD',
    leaseId: initialData?.leaseId || '',
    companyId: '',
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoadingData(true);
        setError(null);
        
        // Only fetch agents since properties and tenants are passed as props
        const agentsResponse = await publicApi.get('/users/public/agents');
        setAgents(agentsResponse.data.data || []);
      } catch (error) {
        setError('Failed to fetch agents. Please try again later.');
        console.error('Error fetching agents:', error);
      } finally {
        setLoadingData(false);
      }
    };

    fetchData();
  }, []); // Only run once on mount

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError(null);
      await onSubmit(formData);
    } catch (error) {
      setError('Failed to save payment. Please try again later.');
      console.error('Error saving payment:', error);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | { name?: string; value: unknown }> | SelectChangeEvent
  ) => {
    const { name, value } = e.target;
    
    // Convert numeric fields to numbers
    let processedValue = value;
    if (name === 'amount' || name === 'depositAmount') {
      processedValue = value === '' ? 0 : Number(value);
    }
    
    setFormData(prev => ({
      ...prev,
      [name as string]: processedValue,
    }));
  };

  const handleDateChange = (date: Date | null) => {
    if (date) {
      setFormData(prev => ({
        ...prev,
        paymentDate: date,
      }));
    }
  };

  return (
    <Paper elevation={0} sx={{ p: 3, mt: 3 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <form onSubmit={handleSubmit}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <FormControl fullWidth>
              <InputLabel>Payment Type</InputLabel>
              <Select
                name="paymentType"
                value={formData.paymentType}
                onChange={handleInputChange}
                label="Payment Type"
                required
              >
                <MenuItem value="rental">Rental</MenuItem>
                <MenuItem value="introduction">Introduction</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12}>
            <FormControl fullWidth>
              <InputLabel>Property Type</InputLabel>
              <Select
                name="propertyType"
                value={formData.propertyType}
                onChange={handleInputChange}
                label="Property Type"
                required
              >
                <MenuItem value="residential">Residential</MenuItem>
                <MenuItem value="commercial">Commercial</MenuItem>
              </Select>
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
                disabled={loadingData}
              >
                {properties.map((property) => (
                  <MenuItem key={property._id} value={property._id}>
                    {property.name} - {property.address}
                  </MenuItem>
                ))}
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
                label="Tenant"
                required
                disabled={loadingData}
              >
                {tenants.map((tenant) => (
                  <MenuItem key={tenant._id} value={tenant._id}>
                    {tenant.firstName} {tenant.lastName} - {tenant.email}
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
                label="Agent"
                required
                disabled={loadingData}
              >
                {agents.map((agent) => (
                  <MenuItem key={agent._id} value={agent._id}>
                    {agent.firstName} {agent.lastName} - {agent.email}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12}>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <DatePicker
                label="Payment Date"
                value={formData.paymentDate && !isNaN(formData.paymentDate.getTime()) 
                  ? formData.paymentDate 
                  : null}
                onChange={handleDateChange}
                slotProps={{
                  textField: {
                    fullWidth: true,
                    required: true,
                  },
                }}
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
                label="Payment Method"
                required
              >
                {PAYMENT_METHODS.map(method => (
                  <MenuItem key={method} value={method}>
                    {method.replace('_', ' ').toUpperCase()}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Amount"
              type="number"
              name="amount"
              value={formData.amount || ''}
              onChange={handleInputChange}
              required
            />
          </Grid>

          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Deposit Amount (Optional - First Month Only)"
              type="number"
              name="depositAmount"
              value={formData.depositAmount || ''}
              onChange={handleInputChange}
              helperText="Deposit is typically only paid on the first month"
              inputProps={{ min: 0 }}
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
            <FormControl fullWidth>
              <InputLabel>Currency</InputLabel>
              <Select
                name="currency"
                value={formData.currency}
                onChange={handleInputChange}
                label="Currency"
                required
              >
                {SUPPORTED_CURRENCIES.map(currency => (
                  <MenuItem key={currency} value={currency}>
                    {currency}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12}>
            <Box display="flex" justifyContent="flex-end" gap={2}>
              <Button
                variant="outlined"
                onClick={onCancel}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="contained"
                disabled={loading}
                startIcon={loading ? <CircularProgress size={20} /> : null}
              >
                {loading ? 'Saving...' : 'Save Payment'}
              </Button>
            </Box>
          </Grid>
        </Grid>
      </form>
    </Paper>
  );
};

export default PaymentForm; 