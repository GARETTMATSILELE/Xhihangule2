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
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Chip,
  Card,
  CardContent,
  Typography,
  Alert,
  CircularProgress,
  Button,
  Dialog,
  DialogContent,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { Download as DownloadIcon, Edit as EditIcon, Print as PrintIcon } from '@mui/icons-material';
import { Payment, PaymentFilter, PAYMENT_METHODS } from '../../types/payment';
// removed unused Lease
import { Tenant } from '../../types/tenant';
import { Property } from '../../types/property';
// removed unused PaymentFormData
import PaymentReceipt from './PaymentReceipt';
import paymentService from '../../services/paymentService';
import { useAuth } from '../../contexts/AuthContext';

export interface PaymentListProps {
  payments: Payment[];
  onEdit?: (payment: Payment) => void;
  onDownloadReceipt?: (payment: Payment) => Promise<void>;
  onFinalize?: (payment: Payment) => void;
  onFilterChange?: (newFilters: PaymentFilter) => void;
  isMobile?: boolean;
  filters?: PaymentFilter;
  loading?: boolean;
  error?: string | null;
  properties?: Property[];
  tenants?: Tenant[];
  totalCount?: number;
  // Optional override for printing receipt; if provided, used instead of default
  getReceiptForPrint?: (payment: Payment) => Promise<any>;
}

const PaymentList: React.FC<PaymentListProps> = (props) => {
  const {
    payments,
    onEdit,
    onDownloadReceipt,
    onFinalize,
    onFilterChange,
    isMobile = false,
    filters = {},
    loading = false,
    error = null,
    properties = [],
    tenants = [],
    totalCount,
    getReceiptForPrint,
  } = props;
  // removed unused theme
  const { user } = useAuth();
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [downloadingReceipt, setDownloadingReceipt] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [printReceipt, setPrintReceipt] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<any>(null);
  const [loadingReceipt, setLoadingReceipt] = useState(false);
  const [onlyDeposits, setOnlyDeposits] = useState<boolean>(false);
  const [allSalesPayments, setAllSalesPayments] = useState<Payment[] | null>(null);

  // Load all sales payments once to compute outstanding balances for installments
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await paymentService.getSalesPayments();
        if (!cancelled) setAllSalesPayments(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) setAllSalesPayments([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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
    if (onFilterChange) {
      onFilterChange({ ...filters, page: newPage + 1, limit: rowsPerPage } as any);
    }
  }, [onFilterChange, filters, rowsPerPage]);

  const handleChangeRowsPerPage = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const next = parseInt(event.target.value, 10);
    setRowsPerPage(next);
    setPage(0);
    if (onFilterChange) {
      onFilterChange({ ...filters, page: 1, limit: next } as any);
    }
  }, [onFilterChange, filters]);

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

  const computeOutstanding = useCallback((payment: Payment): number | null => {
    try {
      if (!payment || (payment as any).paymentType !== 'sale') return null;
      // Parse total sale price from notes
      const text = String((payment as any).notes || '');
      const match = text.match(/Total\s+Sale\s+Price\s+([0-9,.]+)/i);
      const total = match && match[1] ? Number(match[1].replace(/,/g, '')) : null;
      if (!total || !allSalesPayments) return null;
      const groupKey = (p: any) => (p.saleId ? String(p.saleId) : (p.referenceNumber || p.manualPropertyAddress || ''));
      const key = groupKey(payment as any);
      if (!key) return null;
      const related = (allSalesPayments as any[]).filter(p => (p as any).paymentType === 'sale').filter(p => groupKey(p) === key);
      const paidToDate = related.reduce((s, p: any) => s + (p.amount || 0), 0);
      return Math.max(0, total - paidToDate);
    } catch {
      return null;
    }
  }, [allSalesPayments]);

  const getTypeColor = useCallback((type: string | undefined) => {
    switch (type) {
      case 'levy':
        return 'info';
      case 'municipal':
        return 'secondary';
      case 'introduction':
        return 'primary';
      case 'rental':
        return 'success';
      default:
        return 'default';
    }
  }, []);

  const paginatedPayments = useMemo(() => {
    // When server-side pagination is used, `payments` is already the current page
    return payments;
  }, [payments]);

  // removed unused handleDownloadReceipt since not passed currently

  const handlePrintReceipt = async (payment: Payment) => {
    try {
      setLoadingReceipt(true);
      const receipt = getReceiptForPrint
        ? await getReceiptForPrint(payment)
        : await paymentService.getPaymentReceipt(payment._id, user?.companyId);
      setSelectedReceipt(receipt);
      setPrintReceipt(true);
    } catch (error) {
      console.error('Error fetching receipt:', error);
      setDownloadError('Failed to load receipt');
    } finally {
      setLoadingReceipt(false);
    }
  };

  const handleCloseReceipt = () => {
    setPrintReceipt(false);
    setSelectedReceipt(null);
  };

  // Helper to display property address (or name/address combo), preferring to show both
  const getPropertyDisplay = useCallback((payment: Payment) => {
    const manualAddress = (payment as any).manualPropertyAddress as string | undefined;

    // Build the "normal" property display (from populated object or lookup by id)
    const propRefRaw = (payment as any).property ?? (payment as any).propertyId;
    let normalDisplay: string | null = null;

    const buildDisplayFromProperty = (prop: any): string | null => {
      if (!prop) return null;
      const name = prop?.name || prop?.propertyName;
      const address = prop?.address || prop?.propertyAddress;
      if (address && name) return `${name} - ${address}`;
      if (address) return address;
      if (name) return name;
      return null;
    };

    const lookupById = (id: any): string | null => {
      if (!id) return null;
      const idStr = String((id && id._id) || id.id || id);
      const property = properties.find(p => String(p._id) === idStr);
      if (property) {
        const built = buildDisplayFromProperty(property as any);
        if (built) return built;
      }
      return null;
    };

    if (propRefRaw) {
      if (typeof propRefRaw === 'object') {
        // Try direct fields (populated doc) first
        normalDisplay = buildDisplayFromProperty(propRefRaw);
        // If only an id-like object, try lookup from provided properties list
        if (!normalDisplay) {
          normalDisplay = lookupById(propRefRaw);
        }
      } else if (typeof propRefRaw === 'string') {
        normalDisplay = lookupById(propRefRaw);
      }
    }

    // Also try loose fallbacks sometimes present on payment itself
    if (!normalDisplay) {
      const loose = buildDisplayFromProperty(payment as any);
      if (loose) normalDisplay = loose;
    }

    // If both manual and normal are available, show both to provide full context
    if (manualAddress && normalDisplay) {
      return `${manualAddress} (${normalDisplay})`;
    }

    // Otherwise fall back to whichever is available
    if (manualAddress) return manualAddress;
    if (normalDisplay) return normalDisplay;

    return 'Unknown Property';
  }, [properties]);

  const renderMobilePaymentCard = (payment: Payment, index?: number) => (
    <Card key={`${payment._id || payment.referenceNumber || 'payment'}-${index ?? 0}`} sx={{ mb: 2 }}>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
          <Typography variant="h6">
            {payment.currency} {(payment.amount || 0).toFixed(2)}
          </Typography>
          <Box display="flex" gap={1}>
            <Chip
              label={(payment as any).paymentType || (payment as any).type || 'rental'}
              color={getTypeColor((payment as any).paymentType || (payment as any).type)}
              size="small"
            />
            <Chip
              label={payment.status || 'unknown'}
              color={getStatusColor(payment.status || 'unknown')}
              size="small"
            />
          </Box>
        </Box>
        <Typography color="textSecondary" gutterBottom>
          {payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString() : 'No date'}
        </Typography>
        <Typography variant="body2" gutterBottom>
          Property: {getPropertyDisplay(payment)}
        </Typography>
        <Typography variant="body2" gutterBottom>
          Method: {(payment.paymentMethod || 'unknown').replace('_', ' ').toUpperCase()}
        </Typography>
        {payment.referenceNumber && (
          <Typography variant="body2" gutterBottom>
            Reference: {payment.referenceNumber}
          </Typography>
        )}
        <Box display="flex" justifyContent="flex-end" mt={1} gap={1}>
          {Boolean((payment as any).isProvisional) && onFinalize && (
            <Button size="small" variant="contained" onClick={() => onFinalize(payment)}>
              Finalize
            </Button>
          )}
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
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
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
        <Grid item xs={12} sm={6} md={3}>
          <FormControl fullWidth size="small">
            <InputLabel id="filter-label">Filter</InputLabel>
            <Select
              labelId="filter-label"
              value={onlyDeposits ? 'deposits' : ''}
              onChange={(e) => {
                const val = e.target.value === 'deposits';
                setOnlyDeposits(val);
                if (onFilterChange) {
                  const next: any = { ...filters };
                  next.onlyDeposits = val ? 'true' : undefined;
                  onFilterChange(next);
                }
              }}
              label="Filter"
            >
              <MenuItem value="">All Payments</MenuItem>
              <MenuItem value="deposits">Deposits Only</MenuItem>
            </Select>
          </FormControl>
        </Grid>
      </Grid>

      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {loading ? (
          <Box display="flex" justifyContent="center" alignItems="center" flex={1}>
            <CircularProgress />
          </Box>
        ) : isMobile ? (
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            {paginatedPayments.map((payment, index) => renderMobilePaymentCard(payment, index))}
          </Box>
        ) : (
                    <TableContainer component={Paper} elevation={0} sx={{ flex: 1, overflow: 'auto' }}>
            <Table stickyHeader>
              <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Property</TableCell>
                <TableCell>Amount</TableCell>
                <TableCell>Outstanding</TableCell>
                <TableCell>Method</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Reference</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedPayments.map((payment, index) => (
                <TableRow key={`${payment._id || payment.referenceNumber || 'row'}-${index}`}>
                  <TableCell>
                    {payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString() : 'No date'}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={(payment as any).paymentType || (payment as any).type || 'rental'}
                      color={getTypeColor((payment as any).paymentType || (payment as any).type)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {getPropertyDisplay(payment)}
                  </TableCell>
                  <TableCell>
                    {payment.currency} {(payment.amount || 0).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const outstanding = computeOutstanding(payment);
                      if (outstanding == null) return '-';
                      const isZero = Math.abs(outstanding) < 0.01;
                      return (
                        <Chip
                          label={`${payment.currency} ${outstanding.toFixed(2)}`}
                          color={isZero ? 'success' : 'error'}
                          size="small"
                          variant={isZero ? 'filled' : 'outlined'}
                        />
                      );
                    })()}
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
                    {Boolean((payment as any).isProvisional) && onFinalize && (
                      <Button
                        size="small"
                        variant="contained"
                        sx={{ mr: 1 }}
                        onClick={() => onFinalize(payment)}
                      >
                        Finalize
                      </Button>
                    )}
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
            count={typeof totalCount === 'number' ? totalCount : payments.length}
            page={page}
            onPageChange={handleChangePage}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={handleChangeRowsPerPage}
          />
        </TableContainer>
        )}
      </Box>

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