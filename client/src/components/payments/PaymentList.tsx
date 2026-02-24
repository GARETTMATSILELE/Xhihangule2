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
  TextField,
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
import Autocomplete from '@mui/material/Autocomplete';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { Download as DownloadIcon, Edit as EditIcon, Print as PrintIcon, Undo as UndoIcon } from '@mui/icons-material';
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
  onReverse?: (payment: Payment) => void;
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
  // When true, skip loading all sales payments to compute outstanding (improves performance)
  disableOutstandingFetch?: boolean;
}

const PaymentList: React.FC<PaymentListProps> = (props) => {
  const {
    payments,
    onEdit,
    onDownloadReceipt,
    onFinalize,
    onReverse,
    onFilterChange,
    isMobile = false,
    filters = {},
    loading = false,
    error = null,
    properties = [],
    tenants = [],
    totalCount,
    getReceiptForPrint,
    disableOutstandingFetch = false,
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

  // ---- Rental period helpers (display only for rental payments) ----
  const monthNamesShort = useMemo(
    () => ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
    []
  );
  const getRentalMonthsList = useCallback((payment: Payment): string[] => {
    const type = String((payment as any).paymentType || (payment as any).type || '').toLowerCase();
    if (type !== 'rental') return [];
    const startMonth = Number((payment as any).advancePeriodStart?.month || (payment as any).rentalPeriodMonth);
    const startYear = Number((payment as any).advancePeriodStart?.year || (payment as any).rentalPeriodYear);
    if (!startMonth || !startYear) return [];
    const monthsCount = Math.max(1, Number((payment as any).advanceMonthsPaid || 1));
    const out: string[] = [];
    for (let i = 0; i < monthsCount; i++) {
      const idx = (startMonth - 1) + i;
      const y = startYear + Math.floor(idx / 12);
      const m1 = ((idx % 12) + 12) % 12; // 0..11
      out.push(`${monthNamesShort[m1]} ${y}`);
    }
    return out;
  }, [monthNamesShort]);
  const getRentalPeriodSummary = useCallback((payment: Payment): string => {
    const list = getRentalMonthsList(payment);
    if (list.length === 0) return '-';
    if (list.length === 1) return list[0];
    return `${list[0]} – ${list[list.length - 1]} (${list.length})`;
  }, [getRentalMonthsList]);

  type PropertyFilterOption = {
    id: string; // propertyId or manual:<address>
    idKind: 'propertyId' | 'manualAddress';
    label: string; // address (preferred) or fallback
  };

  // Build property-address filter options from the payments currently displayed.
  // Fallback to provided properties list if payments are empty.
  const propertyFilterOptions: PropertyFilterOption[] = useMemo(() => {
    const map = new Map<string, PropertyFilterOption>();
    const addOption = (id: string, idKind: 'propertyId' | 'manualAddress', label: string | null | undefined) => {
      const cleanLabel = (label || '').toString().trim();
      if (!cleanLabel) return;
      const key = `${idKind}:${id}`;
      if (!map.has(key)) {
        map.set(key, { id, idKind, label: cleanLabel });
      }
    };
    const extractAddressFromPayment = (p: any): string | null => {
      const manual = p?.manualPropertyAddress;
      if (manual && typeof manual === 'string' && manual.trim()) return manual.trim();
      const propRef = (p as any).property ?? (p as any).propertyId;
      if (propRef && typeof propRef === 'object') {
        const addr = (propRef as any).address || (propRef as any).propertyAddress;
        if (addr && typeof addr === 'string' && addr.trim()) return addr.trim();
      }
      const propId = String((propRef && (propRef as any)._id) || propRef || '');
      if (propId) {
        const found = properties.find(x => String((x as any)._id) === propId);
        const addr = (found as any)?.address || (found as any)?.propertyAddress || (found as any)?.name;
        if (addr && typeof addr === 'string' && addr.trim()) return addr.trim();
      }
      return null;
    };
    // Prefer deriving from current payments shown
    (payments || []).forEach((p: any) => {
      const propRef = (p as any).property ?? (p as any).propertyId;
      const propId = String((propRef && (propRef as any)._id) || propRef || '');
      const addr = extractAddressFromPayment(p);
      if (addr && propId) {
        addOption(propId, 'propertyId', addr);
      } else if (addr) {
        addOption(`manual:${addr}`, 'manualAddress', addr);
      } else if (propId) {
        // No address; fall back to property name if we can find it
        const found = properties.find(x => String((x as any)._id) === propId);
        const fallback = (found as any)?.name || 'Unknown Property';
        addOption(propId, 'propertyId', fallback);
      }
    });
    // Fallback to provided properties if we still have no options
    if (map.size === 0 && Array.isArray(properties) && properties.length) {
      properties.forEach((prop: any) => {
        const id = String(prop?._id || '');
        if (!id) return;
        const addr = prop?.address || prop?.propertyAddress || prop?.name;
        addOption(id, 'propertyId', addr || 'Unknown Property');
      });
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [payments, properties]);

  // Load all sales payments once to compute outstanding balances for installments
  React.useEffect(() => {
    let cancelled = false;
    if (!disableOutstandingFetch) {
      (async () => {
        try {
          const list = await paymentService.getSalesPayments();
          if (!cancelled) setAllSalesPayments(Array.isArray(list) ? list : []);
        } catch {
          if (!cancelled) setAllSalesPayments([]);
        }
      })();
    } else {
      setAllSalesPayments(null);
    }
    return () => { cancelled = true; };
  }, [disableOutstandingFetch]);

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
      case 'reversed':
        return 'info';
      case 'voided':
        return 'default';
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
      if (!payment) return null;
      // Prefer server-provided outstanding if available
      const serverOutstanding = (payment as any).outstanding;
      if (typeof serverOutstanding === 'number' && Number.isFinite(serverOutstanding)) {
        return serverOutstanding;
      }
      const type = (payment as any).paymentType || (payment as any).type;
      // Sales: outstanding = total sale price - paidToDate across related sales payments
      if (type === 'sale') {
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
      }
      // Rentals: outstanding = property rent - amount paid for rent (exclude deposit)
      if (type === 'rental' || type === 'introduction' || type === 'management') {
        let rentAmount: number | null = null;
        // Prefer rent from populated property on the payment
        const propRef = (payment as any).property || (payment as any).propertyId;
        if (propRef && typeof propRef === 'object' && typeof (propRef as any).rent === 'number') {
          rentAmount = Number((propRef as any).rent);
        }
        // Fallback to lookup from provided properties list
        if (rentAmount == null && propRef) {
          const idStr = String((propRef as any)?._id || (propRef as any)?.id || propRef);
          const prop = properties.find(p => String(p._id) === idStr);
          if (prop && typeof (prop as any).rent === 'number') {
            rentAmount = Number((prop as any).rent);
          }
        }
        // Last resort: any explicit rentUsed field present on the payment
        if (rentAmount == null && typeof (payment as any).rentUsed === 'number') {
          rentAmount = Number((payment as any).rentUsed);
        }
        if (rentAmount == null || !Number.isFinite(rentAmount)) return null;

        // If this is an advance payment (covers multiple months), treat outstanding for this row as zero
        const months = Number((payment as any).advanceMonthsPaid || 1);
        if (months > 1) {
          // The row represents multiple months; per-row outstanding not meaningful
          return 0;
        }

        // Aggregate paid-to-date across all payments for same company property/tenant and rental period
        const getId = (v: any): string => {
          if (!v) return '';
          if (typeof v === 'string') return v;
          if (typeof v === 'object') {
            if ((v as any)._id) return String((v as any)._id);
            if ((v as any).id) return String((v as any).id);
          }
          return String(v);
        };
        const periodMonth = (payment as any).rentalPeriodMonth || (payment as any).levyPeriodMonth;
        const periodYear = (payment as any).rentalPeriodYear || (payment as any).levyPeriodYear;
        const propertyId = getId((payment as any).propertyId || (payment as any).property);
        const tenantId = getId((payment as any).tenantId || (payment as any).tenant);
        if (!propertyId || !tenantId || !periodMonth || !periodYear) {
          // Fallback to per-row view if we cannot group reliably
          const rentPaidOnly = Number((payment as any).amount || 0);
          return Math.max(0, rentAmount - rentPaidOnly);
        }
        const normalizedType = (p: any) => String(p?.paymentType || p?.type || '').toLowerCase();
        const isSamePeriod = (p: any) => {
          const pMonth = (p as any).rentalPeriodMonth || (p as any).levyPeriodMonth;
          const pYear = (p as any).rentalPeriodYear || (p as any).levyPeriodYear;
          const pProp = getId((p as any).propertyId || (p as any).property);
          const pTenant = getId((p as any).tenantId || (p as any).tenant);
          return pMonth === periodMonth && pYear === periodYear && pProp === propertyId && pTenant === tenantId;
        };
        const paidToDate = (payments || [])
          .filter((p: any) => normalizedType(p) === 'rental')
          .filter(isSamePeriod)
          .filter((p: any) => {
            const st = String(p?.status || '').toLowerCase();
            return st === 'completed' || st === 'pending' || st === 'paid' || st === 'success';
          })
          .reduce((sum: number, p: any) => sum + Number(p?.amount || 0), 0);
        return Math.max(0, rentAmount - paidToDate);
      }
      return null;
    } catch {
      return null;
    }
  }, [allSalesPayments, properties, payments]);

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
      // Fallback: open authenticated HTML receipt directly if JSON receipt endpoint is unavailable (404)
      try {
        const blob = await paymentService.downloadReceipt(payment._id, user?.companyId);
        const url = URL.createObjectURL(blob);
        // Open in a new tab/window so user can print from browser
        window.open(url, '_blank');
        // We won't revoke the URL immediately to avoid breaking the print window; browser will GC later
      } catch (fallbackErr) {
        console.error('Fallback receipt download failed:', fallbackErr);
        setDownloadError('Failed to load receipt');
      }
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
        {String((payment as any).paymentType || (payment as any).type).toLowerCase() === 'rental' && (
          <Typography variant="body2" gutterBottom>
            Period: {getRentalPeriodSummary(payment)}
          </Typography>
        )}
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
          {onEdit && String((payment as any).status || '').toLowerCase() === 'pending' && (
            <IconButton
              size="small"
              onClick={() => onEdit(payment)}
              disabled={downloadingReceipt === payment._id}
            >
              <EditIcon />
            </IconButton>
          )}
          {onReverse && (String((payment as any).postingStatus || '') === 'posted' || String(payment.status || '') === 'completed') && String(payment.status || '') !== 'reversed' && (
            <IconButton
              size="small"
              onClick={() => onReverse(payment)}
              disabled={downloadingReceipt === payment._id}
            >
              <UndoIcon />
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
              <MenuItem value="reversed">Reversed</MenuItem>
              <MenuItem value="voided">Voided</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Autocomplete
            options={propertyFilterOptions}
            getOptionLabel={(option) => (option as PropertyFilterOption)?.label || ''}
            value={(() => {
              // Prefer propertyId selection
              if (filters.propertyId) {
                const opt = propertyFilterOptions.find(o => o.idKind === 'propertyId' && String(o.id) === String(filters.propertyId));
                if (opt) return opt;
              }
              // Fallback to search selection when it matches a manual-address option
              const searchVal = (filters as any)?.search;
              if (searchVal && typeof searchVal === 'string') {
                const s = searchVal.trim();
                const opt = propertyFilterOptions.find(o => o.label === s || (o.idKind === 'manualAddress' && o.id === `manual:${s}`));
                if (opt) return opt;
              }
              return null;
            })()}
            onChange={(_e, newValue) => {
              if (!onFilterChange) return;
              if (!newValue) {
                onFilterChange({ ...filters, propertyId: undefined, search: undefined });
                return;
              }
              const opt = newValue as PropertyFilterOption;
              if (opt.idKind === 'propertyId') {
                onFilterChange({ ...filters, propertyId: String(opt.id), search: undefined });
              } else {
                // Manual address: filter via search term
                onFilterChange({ ...filters, propertyId: undefined, search: opt.label });
              }
            }}
            isOptionEqualToValue={(option, value) =>
              (option as PropertyFilterOption).id === (value as PropertyFilterOption).id &&
              (option as PropertyFilterOption).idKind === (value as PropertyFilterOption).idKind
            }
            clearOnEscape
            renderInput={(params) => (
              <TextField
                {...params}
                label="Property Address"
                size="small"
                placeholder="Type address to search properties"
                fullWidth
              />
            )}
          />
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
        <Grid item xs={12} sm={6} md={3}>
          <TextField
            fullWidth
            size="small"
            label="Search (reference, notes, etc.)"
            value={(filters as any).search || ''}
            onChange={(e) => {
              const val = e.target.value;
              if (val !== (filters as any).search) {
                handleFilterChange('search' as keyof PaymentFilter, val);
              }
            }}
          />
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
                <TableCell>Period</TableCell>
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
                    {getRentalPeriodSummary(payment)}
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
                    {onEdit && String((payment as any).status || '').toLowerCase() === 'pending' && (
                      <IconButton
                        size="small"
                        onClick={() => onEdit(payment)}
                        disabled={downloadingReceipt === payment._id}
                      >
                        <EditIcon />
                      </IconButton>
                    )}
                    {onReverse && (String((payment as any).postingStatus || '') === 'posted' || String(payment.status || '') === 'completed') && String(payment.status || '') !== 'reversed' && (
                      <IconButton
                        size="small"
                        onClick={() => onReverse(payment)}
                        disabled={downloadingReceipt === payment._id}
                      >
                        <UndoIcon />
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