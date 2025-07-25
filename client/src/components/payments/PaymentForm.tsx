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
  Checkbox,
  FormControlLabel,
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
import { useAuth } from '../../contexts/AuthContext';

export interface PaymentFormProps {
  onSubmit: (data: PaymentFormData) => Promise<void>;
  onCancel: () => void;
  initialData?: Payment;
  properties: Property[];
  tenants: Tenant[];
  loading?: boolean;
}

// Helper to generate a reference number
function generateReferenceNumber() {
  return `REF-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

const PaymentForm: React.FC<PaymentFormProps> = ({
  onSubmit,
  onCancel,
  initialData,
  properties,
  tenants,
  loading = false,
}) => {
  const { user } = useAuth();
  const propertyService = usePropertyService();
  const [error, setError] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [agents, setAgents] = useState<any[]>([]);
  const [formData, setFormData] = useState<PaymentFormData>(() => ({
    paymentType: initialData?.paymentType || 'rental',
    propertyType: initialData?.propertyType || 'residential',
    propertyId: initialData?.propertyId ? String(initialData.propertyId) : '',
    tenantId: initialData?.tenantId ? String(initialData.tenantId) : '',
    agentId: initialData?.agentId ? String(initialData.agentId) : '',
    paymentDate: initialData?.paymentDate ? new Date(initialData.paymentDate) : new Date(),
    paymentMethod: initialData?.paymentMethod || 'cash',
    amount: initialData?.amount || 0,
    depositAmount: initialData?.depositAmount || 0,
    referenceNumber: initialData?.referenceNumber || '',
    notes: initialData?.notes || '',
    currency: initialData?.currency || 'USD',
    leaseId: initialData?.leaseId ? String(initialData.leaseId) : '',
    companyId: '',
    rentalPeriodMonth: initialData?.rentalPeriodMonth || (new Date().getMonth() + 1),
    rentalPeriodYear: initialData?.rentalPeriodYear || (new Date().getFullYear()),
  }));
  const [isAdvance, setIsAdvance] = useState(false);
  const [advanceMonths, setAdvanceMonths] = useState(1);
  const [advanceStartMonth, setAdvanceStartMonth] = useState(formData.rentalPeriodMonth);
  const [advanceStartYear, setAdvanceStartYear] = useState(formData.rentalPeriodYear);
  const [propertyRent, setPropertyRent] = useState<number | null>(null);

  // Regenerate reference number every time the form is opened for a new payment
  useEffect(() => {
    if (!initialData) {
      setFormData(prev => ({
        ...prev,
        referenceNumber: generateReferenceNumber(),
      }));
    }
    // Only run when initialData changes (i.e., new payment or edit)
  }, [initialData]);

  // Calculate total amount for advance payment
  const totalAdvanceAmount = isAdvance && propertyRent ? propertyRent * advanceMonths : (propertyRent || 0);

  // Update formData when advance payment changes
  useEffect(() => {
    if (isAdvance) {
      setFormData(prev => ({
        ...prev,
        rentalPeriodMonth: advanceStartMonth,
        rentalPeriodYear: advanceStartYear,
        advanceMonthsPaid: advanceMonths,
        advancePeriodStart: { month: advanceStartMonth, year: advanceStartYear },
        advancePeriodEnd: calculateAdvanceEnd(advanceStartMonth, advanceStartYear, advanceMonths),
        amount: propertyRent ? propertyRent * advanceMonths : 0,
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        advanceMonthsPaid: 1,
        advancePeriodStart: undefined,
        advancePeriodEnd: undefined,
        amount: propertyRent || 0,
      }));
    }
    // eslint-disable-next-line
  }, [isAdvance, advanceMonths, advanceStartMonth, advanceStartYear, propertyRent]);

  // When propertyId or paymentType changes, fetch rent or levy
  useEffect(() => {
    if (!formData.propertyId) {
      setPropertyRent(null);
      return;
    }
    // For levy payments, show the levy amount from the property
    if (formData.paymentType === 'levy') {
      const property = properties.find(p => String(p._id) === String(formData.propertyId));
      if (property && property.levyOrMunicipalType === 'levy' && property.levyOrMunicipalAmount) {
        setPropertyRent(property.levyOrMunicipalAmount);
      } else {
        setPropertyRent(null);
      }
      return;
    }
    // For other payment types, show rent
    const property = properties.find(p => String(p._id) === String(formData.propertyId));
    if (property && property.rent) {
      setPropertyRent(property.rent);
    } else {
      setPropertyRent(null);
    }
  }, [formData.propertyId, formData.paymentType, properties]);

  // When rent or advance months change, update amount
  useEffect(() => {
    if (propertyRent) {
      if (isAdvance) {
        setFormData(prev => ({
          ...prev,
          amount: propertyRent * advanceMonths,
          rentUsed: propertyRent,
        }));
      } else {
        setFormData(prev => ({
          ...prev,
          amount: propertyRent,
          rentUsed: propertyRent,
        }));
      }
    }
  }, [propertyRent, isAdvance, advanceMonths]);

  function calculateAdvanceEnd(startMonth: number, startYear: number, months: number) {
    const endMonth = ((startMonth - 1 + months - 1) % 12) + 1;
    const yearsToAdd = Math.floor((startMonth - 1 + months - 1) / 12);
    return { month: endMonth, year: startYear + yearsToAdd };
  }

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

      let dataToSubmit = { ...formData };
      // Get commission percentage from selected property
      const commissionPercent = getCommissionForProperty(formData.propertyId, properties);
      const totalCommission = formData.amount * (commissionPercent / 100);
      const preaFee = totalCommission * 0.03;
      const commissionAfterPrea = totalCommission - preaFee;
      const agentShare = commissionAfterPrea * 0.6;
      const agencyShare = commissionAfterPrea * 0.4;
      const ownerAmount = formData.amount - totalCommission;

      dataToSubmit.commissionDetails = {
        totalCommission,
        preaFee,
        agentShare,
        agencyShare,
        ownerAmount
      };

      // Set processedBy to current user
      if (user?._id) {
        dataToSubmit.processedBy = user._id;
      }

      // Ensure ownerId is included
      const property = properties.find(p => String(p._id) === String(formData.propertyId));
      if (property && property.ownerId) {
        dataToSubmit.ownerId = property.ownerId;
      }

      await onSubmit(dataToSubmit);
    } catch (error) {
      setError('Failed to save payment. Please try again later.');
      console.error('Error saving payment:', error);
    }
  };

  // Helper to get commission percentage from selected property
  function getCommissionForProperty(propertyId: string, properties: Property[]): number {
    const property = properties.find(p => String(p._id) === String(propertyId));
    return property?.commission ?? 0;
  }

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | { name?: string; value: unknown }> | SelectChangeEvent
  ) => {
    const { name, value } = e.target;
    
    // Convert numeric fields to numbers
    let processedValue = value;
    if (name === 'amount' || name === 'depositAmount') {
      processedValue = value === '' ? 0 : Number(value);
    }
    // Ensure rentalPeriodMonth is always a number (value is string from Select)
    if (name === 'rentalPeriodMonth') {
      processedValue = Number(value);
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
                <MenuItem value="levy">Levies</MenuItem>
                <MenuItem value="municipal">Municipal Payments</MenuItem>
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
              label={formData.paymentType === 'levy' ? 'Monthly Levies' : formData.paymentType === 'municipal' ? 'Municipal Fees (for this month)' : 'Monthly Rent'}
              value={
                formData.paymentType === 'levy'
                  ? propertyRent !== null ? propertyRent : ''
                  : formData.paymentType === 'municipal'
                    ? formData.amount || ''
                    : propertyRent !== null ? propertyRent : ''
              }
              onChange={formData.paymentType === 'municipal' ? handleInputChange : undefined}
              name={formData.paymentType === 'municipal' ? 'amount' : undefined}
              InputProps={{ readOnly: formData.paymentType !== 'municipal' }}
              helperText={
                formData.paymentType === 'levy'
                  ? 'This is the levies for the selected property.'
                  : formData.paymentType === 'municipal'
                    ? 'Enter the municipal fee for this month.'
                    : 'This is the rent for the selected property.'
              }
            />
          </Grid>

          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Amount Paid"
              type="number"
              name="amount"
              value={formData.amount || ''}
              onChange={handleInputChange}
              required
              InputProps={{ readOnly: isAdvance }}
              helperText={isAdvance ? `Total for ${advanceMonths} months` : 'Enter the amount the client is actually paying'}
            />
          </Grid>

          {formData.paymentType !== 'levy' && formData.paymentType !== 'municipal' && (
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
          )}

          {/* Rental Period Selection */}
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Rental Month</InputLabel>
              <Select
                name="rentalPeriodMonth"
                value={formData.rentalPeriodMonth.toString()}
                onChange={handleInputChange}
                label="Rental Month"
                required
              >
                {[...Array(12)].map((_, i) => (
                  <MenuItem key={i + 1} value={(i + 1).toString()}>
                    {new Date(0, i).toLocaleString('default', { month: 'long' })}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Rental Year"
              name="rentalPeriodYear"
              type="number"
              value={formData.rentalPeriodYear}
              onChange={handleInputChange}
              required
              inputProps={{ min: 2000, max: 2100 }}
            />
          </Grid>

          {/* Advance Payment Section */}
          <Grid item xs={12}>
            <FormControlLabel
              control={<Checkbox checked={isAdvance} onChange={e => setIsAdvance(e.target.checked)} />}
              label="Paying in advance?"
            />
          </Grid>
          {isAdvance && (
            <>
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  label="Number of Months"
                  type="number"
                  value={advanceMonths}
                  onChange={e => setAdvanceMonths(Math.max(1, Number(e.target.value)))}
                  required
                  inputProps={{ min: 1, max: 36 }}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <FormControl fullWidth>
                  <InputLabel>Start Month</InputLabel>
                  <Select
                    name="advanceStartMonth"
                    value={advanceStartMonth.toString()}
                    onChange={e => setAdvanceStartMonth(Number(e.target.value))}
                    label="Start Month"
                    required
                  >
                    {[...Array(12)].map((_, i) => (
                      <MenuItem key={i + 1} value={(i + 1).toString()}>
                        {new Date(0, i).toLocaleString('default', { month: 'long' })}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  label="Start Year"
                  type="number"
                  value={advanceStartYear}
                  onChange={e => setAdvanceStartYear(Number(e.target.value))}
                  required
                  inputProps={{ min: 2000, max: 2100 }}
                />
              </Grid>
              <Grid item xs={12}>
                <Typography variant="body2">
                  This payment covers: {new Date(0, advanceStartMonth - 1).toLocaleString('default', { month: 'long' })} {advanceStartYear} to {new Date(0, calculateAdvanceEnd(advanceStartMonth, advanceStartYear, advanceMonths).month - 1).toLocaleString('default', { month: 'long' })} {calculateAdvanceEnd(advanceStartMonth, advanceStartYear, advanceMonths).year}
                </Typography>
                <Typography variant="body2" color="primary">
                  Total Amount: {propertyRent ? propertyRent * advanceMonths : 0} ({propertyRent} × {advanceMonths} months)
                </Typography>
              </Grid>
            </>
          )}

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
            <TextField
              fullWidth
              label="Reference Number"
              name="referenceNumber"
              value={formData.referenceNumber}
              onChange={handleInputChange}
              required
              helperText="Enter the payment reference number manually."
            />
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