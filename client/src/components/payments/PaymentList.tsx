import React, { useState, useCallback, useMemo } from 'react';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Chip,
  useTheme,
  Card,
  CardContent,
  Typography,
  Alert,
  CircularProgress,
  Button,
  Snackbar,
  Dialog,
  DialogContent,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { Download as DownloadIcon, Edit as EditIcon, Print as PrintIcon } from '@mui/icons-material';
import { Payment, PaymentFilter, PAYMENT_METHODS, SUPPORTED_CURRENCIES, PopulatedPayment } from '../../types/payment';
import { Lease } from '../../types/lease';
import { Tenant } from '../../types/tenant';
import { Property } from '../../types/property';
import { PaymentFormData } from '../../types/payment';
import PaymentReceipt from './PaymentReceipt';
import paymentService from '../../services/paymentService';

export interface PaymentListProps {
  payments: Payment[];
  onEdit?: (payment: Payment) => void;
  onDownloadReceipt?: (payment: Payment) => Promise<void>;
  onFilterChange?: (newFilters: PaymentFilter) => void;
  isMobile?: boolean;
  filters?: PaymentFilter;
  loading?: boolean;
  error?: string | null;
  properties?: Property[];
  tenants?: Tenant[];
}

const PaymentList: React.FC<PaymentListProps> = ({
  payments,
  onEdit,
  onDownloadReceipt,
  onFilterChange,
  isMobile = false,
  filters = {},
  loading = false,
  error = null,
  properties = [],
  tenants = [],
}) => {
  const theme = useTheme();
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [downloadingReceipt, setDownloadingReceipt] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [printReceipt, setPrintReceipt] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<any>(null);
  const [loadingReceipt, setLoadingReceipt] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  const handleFilterChange = useCallback((key: keyof PaymentFilter, value: any) => {
    if (filters[key] !== value) {
      console.log('PaymentList handleFilterChange called with:', { key, value, currentFilters: filters });
      if (onFilterChange) {
        onFilterChange({ ...filters, [key]: value });
      }
    }
  }, [filters, onFilterChange]);

  const handleChangePage = useCallback((event: unknown, newPage: number) => {
    setPage(newPage);
  }, []);

  const handleChangeRowsPerPage = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  }, []);

  const getStatusColor = useCallback((status: string) => {
    switch (status) {
      case 'completed':
        return 'success';
      case 'pending':
        return 'warning';
      case 'failed':
        return 'error';
      case 'unknown':
        return 'default';
      default:
        return 'default';
    }
  }, []);

  const paginatedPayments = useMemo(() => {
    return payments.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  }, [payments, page, rowsPerPage]);

  const handleDownloadReceipt = async (payment: Payment) => {
    try {
      setDownloadingReceipt(payment._id);
      setDownloadError(null);
      if (onDownloadReceipt) {
        await onDownloadReceipt(payment);
      }
    } catch (error) {
      setDownloadError('Failed to download receipt. Please try again.');
      console.error('Error downloading receipt:', error);
    } finally {
      setDownloadingReceipt(null);
    }
  };

  const handlePrintReceipt = async (payment: Payment) => {
    try {
      setLoadingReceipt(true);
      const receipt = await paymentService.getPaymentReceipt(payment._id);
      setSelectedReceipt(receipt);
      setPrintReceipt(true);
    } catch (error) {
      console.error('Error fetching receipt:', error);
      setMessage({
        type: 'error',
        text: 'Failed to load receipt'
      });
    } finally {
      setLoadingReceipt(false);
    }
  };

  const handleCloseReceipt = () => {
    setPrintReceipt(false);
    setSelectedReceipt(null);
  };

  // Helper function to get property name
  const getPropertyName = useCallback((propertyId: string | { _id: string; name: string; address: string } | null | undefined) => {
    if (!propertyId) return 'Unknown Property';
    // If propertyId is already populated (an object with name)
    if (typeof propertyId === 'object' && propertyId.name) {
      return propertyId.name;
    }
    // If propertyId is a string, look it up in the properties array
    if (typeof propertyId === 'string') {
      const property = properties.find(p => p._id === propertyId);
      if (property) {
        return property.name;
      }
    }
    return 'Unknown Property';
  }, [properties]);

  const renderMobilePaymentCard = (payment: Payment) => (
    <Card key={payment._id} sx={{ mb: 2 }}>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
          <Typography variant="h6">
            {payment.currency} {(payment.amount || 0).toFixed(2)}
          </Typography>
          <Chip
            label={payment.status || 'unknown'}
            color={getStatusColor(payment.status || 'unknown')}
            size="small"
          />
        </Box>
        <Typography color="textSecondary" gutterBottom>
          {payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString() : 'No date'}
        </Typography>
        <Typography variant="body2" gutterBottom>
          Property: {getPropertyName(payment.propertyId)}
        </Typography>
        <Typography variant="body2" gutterBottom>
          Method: {(payment.paymentMethod || 'unknown').replace('_', ' ').toUpperCase()}
        </Typography>
        {payment.referenceNumber && (
          <Typography variant="body2" gutterBottom>
            Reference: {payment.referenceNumber}
          </Typography>
        )}
        <Box display="flex" justifyContent="flex-end" mt={1}>
          {onEdit && (
            <IconButton
              size="small"
              onClick={() => onEdit(payment)}
              disabled={downloadingReceipt === payment._id}
            >
              <EditIcon />
            </IconButton>
          )}
          {onDownloadReceipt && (
            <IconButton
              size="small"
              onClick={() => onDownloadReceipt(payment)}
              disabled={downloadingReceipt === payment._id}
            >
              <DownloadIcon />
            </IconButton>
          )}
          <IconButton
            size="small"
            onClick={() => handlePrintReceipt(payment)}
            disabled={loadingReceipt}
          >
            <PrintIcon />
          </IconButton>
        </Box>
      </CardContent>
    </Card>
  );

  return (
    <Box sx={{ mt: 3 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {downloadError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {downloadError}
        </Alert>
      )}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <LocalizationProvider dateAdapter={AdapterDateFns}>
            <DatePicker
              label="Start Date"
              value={filters.startDate && !isNaN(filters.startDate.getTime()) 
                ? filters.startDate 
                : null}
              onChange={(date) => {
                if (date?.getTime() !== filters.startDate?.getTime()) {
                  handleFilterChange('startDate', date);
                }
              }}
              slotProps={{
                textField: {
                  fullWidth: true,
                  size: 'small',
                },
              }}
            />
          </LocalizationProvider>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <LocalizationProvider dateAdapter={AdapterDateFns}>
            <DatePicker
              label="End Date"
              value={filters.endDate && !isNaN(filters.endDate.getTime()) 
                ? filters.endDate 
                : null}
              onChange={(date) => {
                if (date?.getTime() !== filters.endDate?.getTime()) {
                  handleFilterChange('endDate', date);
                }
              }}
              slotProps={{
                textField: {
                  fullWidth: true,
                  size: 'small',
                },
              }}
            />
          </LocalizationProvider>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <FormControl fullWidth size="small">
            <InputLabel>Payment Method</InputLabel>
            <Select
              value={filters.paymentMethod || ''}
              onChange={(e) => {
                if (e.target.value !== filters.paymentMethod) {
                  handleFilterChange('paymentMethod', e.target.value);
                }
              }}
              label="Payment Method"
            >
              <MenuItem value="">All</MenuItem>
              {PAYMENT_METHODS.map(method => (
                <MenuItem key={method} value={method}>
                  {method.replace('_', ' ').toUpperCase()}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <FormControl fullWidth size="small">
            <InputLabel>Status</InputLabel>
            <Select
              value={filters.status || ''}
              onChange={(e) => {
                if (e.target.value !== filters.status) {
                  handleFilterChange('status', e.target.value);
                }
              }}
              label="Status"
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="completed">Completed</MenuItem>
              <MenuItem value="pending">Pending</MenuItem>
              <MenuItem value="failed">Failed</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <FormControl fullWidth size="small">
            <InputLabel>Property</InputLabel>
            <Select
              value={filters.propertyId || ''}
              onChange={(e) => {
                if (e.target.value !== filters.propertyId) {
                  handleFilterChange('propertyId', e.target.value);
                }
              }}
              label="Property"
            >
              <MenuItem value="">All Properties</MenuItem>
              {properties.map(property => (
                <MenuItem key={property._id} value={property._id}>
                  {property.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
      </Grid>

      {loading ? (
        <Box display="flex" justifyContent="center" p={3}>
          <CircularProgress />
        </Box>
      ) : isMobile ? (
        <Box>
          {paginatedPayments.map(renderMobilePaymentCard)}
        </Box>
      ) : (
        <TableContainer component={Paper} elevation={0}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Property</TableCell>
                <TableCell>Amount</TableCell>
                <TableCell>Method</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Reference</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedPayments.map((payment) => (
                <TableRow key={payment._id}>
                  <TableCell>
                    {payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString() : 'No date'}
                  </TableCell>
                  <TableCell>
                    {getPropertyName(payment.propertyId)}
                  </TableCell>
                  <TableCell>
                    {payment.currency} {(payment.amount || 0).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    {(payment.paymentMethod || 'unknown').replace('_', ' ').toUpperCase()}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={payment.status || 'unknown'}
                      color={getStatusColor(payment.status || 'unknown')}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>{payment.referenceNumber || '-'}</TableCell>
                  <TableCell>
                    {onEdit && (
                      <IconButton
                        size="small"
                        onClick={() => onEdit(payment)}
                        disabled={downloadingReceipt === payment._id}
                      >
                        <EditIcon />
                      </IconButton>
                    )}
                    {onDownloadReceipt && (
                      <IconButton
                        size="small"
                        onClick={() => onDownloadReceipt(payment)}
                        disabled={downloadingReceipt === payment._id}
                      >
                        <DownloadIcon />
                      </IconButton>
                    )}
                    <IconButton
                      size="small"
                      onClick={() => handlePrintReceipt(payment)}
                      disabled={loadingReceipt}
                    >
                      <PrintIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination
            component="div"
            count={payments.length}
            page={page}
            onPageChange={handleChangePage}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={handleChangeRowsPerPage}
          />
        </TableContainer>
      )}

      {selectedReceipt && (
        <Dialog 
          open={printReceipt} 
          onClose={handleCloseReceipt}
          maxWidth="md" 
          fullWidth
          PaperProps={{
            sx: { maxHeight: '90vh' }
          }}
        >
          <DialogContent>
            <PaymentReceipt 
              receipt={selectedReceipt} 
              onClose={handleCloseReceipt} 
            />
          </DialogContent>
        </Dialog>
      )}
    </Box>
  );
};

export default PaymentList; 